// backend/presentation/http/routes/alarm.routes.ts
import { Router } from 'express';
import { ALARM_SEVERITIES, isAlarmSeverity } from '../../../domain/alarms';
import { AlarmRepository } from '../../../infrastructure/database/repositories/AlarmRepository';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { NotFoundError } from '../../../shared/errors';
import { routeParam, toBoundedInt } from '../../../shared/http';
import { verifyJwt } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const alarmRouter: Router = Router();

alarmRouter.use(verifyJwt);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const toOptionalBoolean = (raw: unknown): boolean | undefined => {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
};

alarmRouter.get('/meta', (_req, res) => {
  res.status(200).json({ severities: ALARM_SEVERITIES });
});

alarmRouter.get('/stats', async (_req, res) => {
  res.status(200).json(await AlarmRepository.stats());
});

alarmRouter.get('/', async (req, res) => {
  const limit = toBoundedInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = toBoundedInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const severity = isAlarmSeverity(req.query.severity) ? req.query.severity : undefined;
  const acknowledged = toOptionalBoolean(req.query.acknowledged);
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const page = await AlarmRepository.list({ limit, offset, severity, acknowledged, search });
  res.status(200).json(page);
});

alarmRouter.patch('/:id/ack', async (req: AuthenticatedRequest, res) => {
  const id = routeParam(req.params.id);
  const operatorId = req.operator!.operatorId;

  const alarm = await AlarmRepository.acknowledge(id, operatorId);
  if (!alarm) throw new NotFoundError(`Alarme ${id} não encontrado ou já reconhecido.`);

  await operatorRepository.logAudit(operatorId, 'ALARM_ACKNOWLEDGED', `ALARM_${id}`, 'EXECUTED');
  res.status(200).json(alarm);
});
