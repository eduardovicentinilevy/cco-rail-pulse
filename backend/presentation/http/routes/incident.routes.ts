// backend/presentation/http/routes/incident.routes.ts
import { Router } from 'express';
import {
  Incident,
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  isIncidentCategory,
  isIncidentSeverity,
  isIncidentStatus,
} from '../../../domain/entities/Incident';
import { IncidentRepository } from '../../../infrastructure/database/repositories/IncidentRepository';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { domainEventBus } from '../../../application/events/event-bus';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { routeParam, toBoundedInt } from '../../../shared/http';
import { verifyJwt, withLineCatalog } from '../middlewares/auth.middleware';
import type { ScopedRequest } from '../middlewares/auth.middleware';

export const incidentRouter: Router = Router();

// Toda ocorrência pertence a uma linha, então nenhuma rota daqui existe fora do
// escopo da sessão — inclusive a leitura por id, cuja numeração é sequencial e
// compartilhada entre clientes.
incidentRouter.use(verifyJwt, withLineCatalog);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Normaliza um campo opcional de texto: string vazia vira `null`. */
const optionalText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
};

/** Metadados dos enums, para o frontend montar os formulários sem duplicar listas. */
incidentRouter.get('/meta', (_req, res) => {
  res.status(200).json({
    categories: INCIDENT_CATEGORIES,
    severities: INCIDENT_SEVERITIES,
    statuses: INCIDENT_STATUSES,
  });
});

incidentRouter.get('/stats', async (req: ScopedRequest, res) => {
  res.status(200).json(await IncidentRepository.stats(req.catalog!.id));
});

incidentRouter.get('/', async (req: ScopedRequest, res) => {
  const limit = toBoundedInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = toBoundedInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const status = isIncidentStatus(req.query.status) ? req.query.status : undefined;
  const severity = isIncidentSeverity(req.query.severity) ? req.query.severity : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const [page, names] = await Promise.all([
    IncidentRepository.list({ lineId: req.catalog!.id, limit, offset, status, severity, search }),
    operatorRepository.namesByCredential(req.operator!.tenantId),
  ]);

  res.status(200).json({
    items: page.items.map((incident) => ({
      ...incident.toSnapshot(),
      openedByName: names.get(incident.openedBy) ?? incident.openedBy,
      assignedToName: incident.assignedTo ? (names.get(incident.assignedTo) ?? incident.assignedTo) : null,
    })),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
  });
});

incidentRouter.post('/', async (req: ScopedRequest, res) => {
  const catalog = req.catalog!;
  const { tenantId } = req.operator!;
  const body = req.body ?? {};

  const title = Incident.assertTitle(body.title);
  const description = Incident.assertDescription(body.description);

  if (!isIncidentCategory(body.category)) {
    throw new ValidationError(`Categoria inválida. Use uma de: ${INCIDENT_CATEGORIES.join(', ')}.`);
  }
  if (!isIncidentSeverity(body.severity)) {
    throw new ValidationError(`Severidade inválida. Use uma de: ${INCIDENT_SEVERITIES.join(', ')}.`);
  }

  const stationCode = optionalText(body.stationCode)?.toUpperCase() ?? null;
  // A malha da linha é quem diz se o código existe — a mensagem de erro nomeia a linha.
  if (stationCode) catalog.requireStation(stationCode);

  const assignedTo = optionalText(body.assignedTo)?.toUpperCase() ?? null;
  if (assignedTo && !(await operatorRepository.exists(tenantId, assignedTo))) {
    throw new ValidationError(`O operador "${assignedTo}" não existe no cadastro.`);
  }

  const openedBy = req.operator!.credential;
  const incident = await IncidentRepository.create({
    lineId: catalog.id,
    title,
    description,
    stationCode,
    trainId: optionalText(body.trainId)?.toUpperCase() ?? null,
    category: body.category,
    severity: body.severity,
    openedBy,
    assignedTo,
  });

  await operatorRepository.logAudit({
    tenantId,
    credential: openedBy,
    action: 'INCIDENT_OPENED',
    target: `INCIDENT_${incident.id}`,
    status: incident.severity,
  });

  const snapshot = incident.toSnapshot();
  domainEventBus.emit('incident:changed', { lineId: catalog.id, payload: snapshot });
  domainEventBus.emit('system:alert', {
    lineId: catalog.id,
    payload: {
      severity: incident.severity === 'CRÍTICA' ? 'CRITICAL' : incident.severity === 'ALTA' ? 'WARNING' : 'INFO',
      message: `Ocorrência #${incident.id} registrada por ${openedBy}: ${incident.title}`,
      timestamp: new Date().toISOString(),
    },
  });

  res.status(201).json(snapshot);
});

incidentRouter.get('/:id', async (req: ScopedRequest, res) => {
  const id = routeParam(req.params.id);
  const incident = await IncidentRepository.findById(req.catalog!.id, id);
  if (!incident) throw new NotFoundError(`Ocorrência ${id} não encontrada.`);
  res.status(200).json(incident.toSnapshot());
});

/** Avança a ocorrência no ciclo de vida. A regra de transição vive no domínio. */
incidentRouter.patch('/:id/status', async (req: ScopedRequest, res) => {
  const catalog = req.catalog!;
  const id = routeParam(req.params.id);
  const incident = await IncidentRepository.findById(catalog.id, id);
  if (!incident) throw new NotFoundError(`Ocorrência ${id} não encontrada.`);

  const body = req.body ?? {};
  if (!isIncidentStatus(body.status)) {
    throw new ValidationError(`Status inválido. Use um de: ${INCIDENT_STATUSES.join(', ')}.`);
  }

  const { credential, tenantId } = req.operator!;
  // Ao assumir a tratativa, o operador vira responsável se ninguém estiver designado.
  const assignedTo =
    body.status === 'EM_ANDAMENTO' && !incident.assignedTo ? credential : undefined;

  incident.transitionTo(body.status, { assignedTo, note: body.resolutionNote });
  await IncidentRepository.save(catalog.id, incident);
  await operatorRepository.logAudit({
    tenantId,
    credential,
    action: `INCIDENT_${body.status}`,
    target: `INCIDENT_${incident.id}`,
    status: 'EXECUTED',
  });

  const snapshot = incident.toSnapshot();
  domainEventBus.emit('incident:changed', { lineId: catalog.id, payload: snapshot });

  res.status(200).json(snapshot);
});
