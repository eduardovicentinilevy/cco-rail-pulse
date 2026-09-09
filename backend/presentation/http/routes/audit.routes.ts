// backend/presentation/http/routes/audit.routes.ts
import { Router } from 'express';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { verifyJwt } from '../middlewares/auth.middleware';

export const auditRouter: Router = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const toBoundedInt = (raw: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

auditRouter.get('/', verifyJwt, async (req, res) => {
  const limit = toBoundedInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = toBoundedInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  res.status(200).json(await operatorRepository.listAudit({ limit, offset, search }));
});
