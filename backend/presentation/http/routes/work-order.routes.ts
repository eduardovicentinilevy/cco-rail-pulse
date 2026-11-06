// backend/presentation/http/routes/work-order.routes.ts
import { Router } from 'express';
import {
  WorkOrder,
  WORK_ORDER_CATEGORIES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  isWorkOrderCategory,
  isWorkOrderPriority,
  isWorkOrderStatus,
} from '../../../domain/entities/WorkOrder';
import { WorkOrderRepository } from '../../../infrastructure/database/repositories/WorkOrderRepository';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { domainEventBus } from '../../../application/events/event-bus';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { routeParam, toBoundedInt } from '../../../shared/http';
import { verifyJwt, withLineCatalog } from '../middlewares/auth.middleware';
import type { ScopedRequest } from '../middlewares/auth.middleware';

export const workOrderRouter: Router = Router();

// A ordem de serviço é manutenção num ativo da linha, então nenhuma rota daqui
// existe fora do escopo da sessão — inclusive a leitura por id, cuja numeração é
// sequencial e compartilhada entre clientes.
workOrderRouter.use(verifyJwt, withLineCatalog);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const optionalText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
};

/** Data opcional vinda do corpo da requisição; `undefined`/vazio vira `null`. */
const optionalDate = (value: unknown): Date | null => {
  const text = optionalText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new ValidationError('Prazo (dueAt) inválido — use uma data ISO 8601.');
  return date;
};

workOrderRouter.get('/meta', (_req, res) => {
  res.status(200).json({
    categories: WORK_ORDER_CATEGORIES,
    priorities: WORK_ORDER_PRIORITIES,
    statuses: WORK_ORDER_STATUSES,
  });
});

workOrderRouter.get('/stats', async (req: ScopedRequest, res) => {
  res.status(200).json(await WorkOrderRepository.stats(req.catalog!.id));
});

workOrderRouter.get('/', async (req: ScopedRequest, res) => {
  const limit = toBoundedInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = toBoundedInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const status = isWorkOrderStatus(req.query.status) ? req.query.status : undefined;
  const priority = isWorkOrderPriority(req.query.priority) ? req.query.priority : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const [page, names] = await Promise.all([
    WorkOrderRepository.list({ lineId: req.catalog!.id, limit, offset, status, priority, search }),
    operatorRepository.namesByCredential(req.operator!.tenantId),
  ]);

  res.status(200).json({
    items: page.items.map((workOrder) => ({
      ...workOrder.toSnapshot(),
      openedByName: names.get(workOrder.openedBy) ?? workOrder.openedBy,
      assignedToName: workOrder.assignedTo ? (names.get(workOrder.assignedTo) ?? workOrder.assignedTo) : null,
    })),
    total: page.total,
    limit: page.limit,
    offset: page.offset,
  });
});

workOrderRouter.post('/', async (req: ScopedRequest, res) => {
  const catalog = req.catalog!;
  const { tenantId } = req.operator!;
  const body = req.body ?? {};

  const title = WorkOrder.assertTitle(body.title);
  const description = WorkOrder.assertDescription(body.description);
  const assetCode = WorkOrder.assertAssetCode(body.assetCode);

  if (!isWorkOrderCategory(body.category)) {
    throw new ValidationError(`Categoria inválida. Use uma de: ${WORK_ORDER_CATEGORIES.join(', ')}.`);
  }
  if (!isWorkOrderPriority(body.priority)) {
    throw new ValidationError(`Prioridade inválida. Use uma de: ${WORK_ORDER_PRIORITIES.join(', ')}.`);
  }

  const stationCode = optionalText(body.stationCode)?.toUpperCase() ?? null;
  // A malha da linha é quem diz se o código existe — a mensagem de erro nomeia a linha.
  if (stationCode) catalog.requireStation(stationCode);

  const assignedTo = optionalText(body.assignedTo)?.toUpperCase() ?? null;
  if (assignedTo && !(await operatorRepository.exists(tenantId, assignedTo))) {
    throw new ValidationError(`O operador "${assignedTo}" não existe no cadastro.`);
  }

  const dueAt = optionalDate(body.dueAt);

  const openedBy = req.operator!.credential;
  const workOrder = await WorkOrderRepository.create({
    lineId: catalog.id,
    title,
    description,
    assetCode,
    stationCode,
    category: body.category,
    priority: body.priority,
    openedBy,
    assignedTo,
    dueAt,
  });

  await operatorRepository.logAudit({
    tenantId,
    credential: openedBy,
    action: 'WORKORDER_OPENED',
    target: `WORKORDER_${workOrder.id}`,
    status: workOrder.priority,
  });

  const snapshot = workOrder.toSnapshot();
  domainEventBus.emit('workorder:changed', { lineId: catalog.id, payload: snapshot });
  domainEventBus.emit('system:alert', {
    lineId: catalog.id,
    payload: {
      severity: workOrder.priority === 'URGENTE' ? 'CRITICAL' : workOrder.priority === 'ALTA' ? 'WARNING' : 'INFO',
      message: `OS #${workOrder.id} aberta por ${openedBy}: ${workOrder.title}`,
      timestamp: new Date().toISOString(),
    },
  });

  res.status(201).json(snapshot);
});

workOrderRouter.get('/:id', async (req: ScopedRequest, res) => {
  const id = routeParam(req.params.id);
  const workOrder = await WorkOrderRepository.findById(req.catalog!.id, id);
  if (!workOrder) throw new NotFoundError(`OS ${id} não encontrada.`);
  res.status(200).json(workOrder.toSnapshot());
});

workOrderRouter.patch('/:id/status', async (req: ScopedRequest, res) => {
  const catalog = req.catalog!;
  const id = routeParam(req.params.id);
  const workOrder = await WorkOrderRepository.findById(catalog.id, id);
  if (!workOrder) throw new NotFoundError(`OS ${id} não encontrada.`);

  const body = req.body ?? {};
  if (!isWorkOrderStatus(body.status)) {
    throw new ValidationError(`Status inválido. Use um de: ${WORK_ORDER_STATUSES.join(', ')}.`);
  }

  const { credential, tenantId } = req.operator!;
  // Ao assumir o serviço, o operador vira responsável se ninguém estiver designado.
  const assignedTo =
    body.status === 'EM_ANDAMENTO' && !workOrder.assignedTo ? credential : undefined;

  workOrder.transitionTo(body.status, { assignedTo, note: body.completionNote });
  await WorkOrderRepository.save(catalog.id, workOrder);
  await operatorRepository.logAudit({
    tenantId,
    credential,
    action: `WORKORDER_${body.status}`,
    target: `WORKORDER_${workOrder.id}`,
    status: 'EXECUTED',
  });

  const snapshot = workOrder.toSnapshot();
  domainEventBus.emit('workorder:changed', { lineId: catalog.id, payload: snapshot });

  res.status(200).json(snapshot);
});
