// backend/presentation/http/routes/audit.routes.ts
import { Router } from 'express';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { toBoundedInt } from '../../../shared/http';
import { verifyJwt } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const auditRouter: Router = Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

auditRouter.get('/', verifyJwt, async (req: AuthenticatedRequest, res) => {
  const limit = toBoundedInt(req.query.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = toBoundedInt(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  res.status(200).json(
    await operatorRepository.listAudit({ tenantId: req.operator!.tenantId, limit, offset, search }),
  );
});
