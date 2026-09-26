// backend/presentation/http/routes/alarm.routes.ts
import { Router } from 'express';
import { ALARM_SEVERITIES, isAlarmSeverity } from '../../../domain/alarms';
import { AlarmRepository } from '../../../infrastructure/database/repositories/AlarmRepository';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { NotFoundError } from '../../../shared/errors';
import { routeParam, toBoundedInt } from '../../../shared/http';
import { verifyJwt, withLineCatalog } from '../middlewares/auth.middleware';
import type { ScopedRequest } from '../middlewares/auth.middleware';

export const alarmRouter: Router = Router();

// Um alarme nasce da telemetria de uma estação, então toda rota daqui vive
// dentro da linha da sessão — o id é sequencial e compartilhado entre clientes.
alarmRouter.use(verifyJwt, withLineCatalog);

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

alarmRouter.get('/stats', async (req: ScopedRequest, res) => {
  res.status(200).json(await AlarmRepository.stats(req.catalog!.id));
});

alarmRouter.get('/', async (req: ScopedRequest, res) => {
  const limit = toBoundedInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = toBoundedInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const severity = isAlarmSeverity(req.query.severity) ? req.query.severity : undefined;
  const acknowledged = toOptionalBoolean(req.query.acknowledged);
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const page = await AlarmRepository.list({ lineId: req.catalog!.id, limit, offset, severity, acknowledged, search });
  res.status(200).json(page);
});

alarmRouter.patch('/:id/ack', async (req: ScopedRequest, res) => {
  const id = routeParam(req.params.id);
  const { tenantId, credential } = req.operator!;

  // A trilha guarda o crachá, não a chave interna: é o que um auditor reconhece.
  const alarm = await AlarmRepository.acknowledge(req.catalog!.id, id, credential);
  if (!alarm) throw new NotFoundError(`Alarme ${id} não encontrado ou já reconhecido.`);

  await operatorRepository.logAudit({
    tenantId,
    credential,
    action: 'ALARM_ACKNOWLEDGED',
    target: `ALARM_${id}`,
    status: 'EXECUTED',
  });
  res.status(200).json(alarm);
});
