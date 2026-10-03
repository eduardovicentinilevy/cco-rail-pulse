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
import { isKnownStation } from '../../../domain/line';
import { WorkOrderRepository } from '../../../infrastructure/database/repositories/WorkOrderRepository';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { domainEventBus } from '../../../application/events/event-bus';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { routeParam, toBoundedInt } from '../../../shared/http';
import { verifyJwt } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const workOrderRouter: Router = Router();

workOrderRouter.use(verifyJwt);

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

workOrderRouter.get('/stats', async (_req, res) => {
  res.status(200).json(await WorkOrderRepository.stats());
});

workOrderRouter.get('/', async (req, res) => {
  const limit = toBoundedInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = toBoundedInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const status = isWorkOrderStatus(req.query.status) ? req.query.status : undefined;
  const priority = isWorkOrderPriority(req.query.priority) ? req.query.priority : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const [page, names] = await Promise.all([
    WorkOrderRepository.list({ limit, offset, status, priority, search }),
    operatorRepository.namesById(),
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

workOrderRouter.post('/', async (req: AuthenticatedRequest, res) => {
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
  if (stationCode && !isKnownStation(stationCode)) {
    throw new ValidationError(`A estação "${stationCode}" não pertence à malha da Linha 6-Laranja.`);
  }

  const assignedTo = optionalText(body.assignedTo)?.toUpperCase() ?? null;
  if (assignedTo && !(await operatorRepository.exists(assignedTo))) {
    throw new ValidationError(`O operador "${assignedTo}" não existe no cadastro.`);
  }

  const dueAt = optionalDate(body.dueAt);

  const openedBy = req.operator!.operatorId;
  const workOrder = await WorkOrderRepository.create({
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

  await operatorRepository.logAudit(openedBy, 'WORKORDER_OPENED', `WORKORDER_${workOrder.id}`, workOrder.priority);

  const snapshot = workOrder.toSnapshot();
  domainEventBus.emit('workorder:changed', snapshot);
  domainEventBus.emit('system:alert', {
    severity: workOrder.priority === 'URGENTE' ? 'CRITICAL' : workOrder.priority === 'ALTA' ? 'WARNING' : 'INFO',
    message: `OS #${workOrder.id} aberta por ${openedBy}: ${workOrder.title}`,
    timestamp: new Date().toISOString(),
  });

  res.status(201).json(snapshot);
});

workOrderRouter.get('/:id', async (req, res) => {
  const id = routeParam(req.params.id);
  const workOrder = await WorkOrderRepository.findById(id);
  if (!workOrder) throw new NotFoundError(`OS ${id} não encontrada.`);
  res.status(200).json(workOrder.toSnapshot());
});

workOrderRouter.patch('/:id/status', async (req: AuthenticatedRequest, res) => {
  const id = routeParam(req.params.id);
  const workOrder = await WorkOrderRepository.findById(id);
  if (!workOrder) throw new NotFoundError(`OS ${id} não encontrada.`);

  const body = req.body ?? {};
  if (!isWorkOrderStatus(body.status)) {
    throw new ValidationError(`Status inválido. Use um de: ${WORK_ORDER_STATUSES.join(', ')}.`);
  }

  const operatorId = req.operator!.operatorId;
  // Ao assumir o serviço, o operador vira responsável se ninguém estiver designado.
  const assignedTo =
    body.status === 'EM_ANDAMENTO' && !workOrder.assignedTo ? operatorId : undefined;

  workOrder.transitionTo(body.status, { assignedTo, note: body.completionNote });
  await WorkOrderRepository.save(workOrder);
  await operatorRepository.logAudit(operatorId, `WORKORDER_${body.status}`, `WORKORDER_${workOrder.id}`, 'EXECUTED');

  const snapshot = workOrder.toSnapshot();
  domainEventBus.emit('workorder:changed', snapshot);

  res.status(200).json(snapshot);
});
