// backend/presentation/http/routes/procedure.routes.ts
import { Router } from 'express';
import {
  PROCEDURE_CATEGORIES,
  PROCEDURE_CATEGORY_LABELS,
  isProcedureCategory,
} from '../../../domain/procedures';
import { ProcedureRepository } from '../../../infrastructure/database/repositories/ProcedureRepository';
import { verifyJwt, withLineCatalog } from '../middlewares/auth.middleware';
import type { ScopedRequest } from '../middlewares/auth.middleware';

export const procedureRouter: Router = Router();

// O manual é da linha: o texto cita estações e subestações da própria malha.
procedureRouter.use(verifyJwt, withLineCatalog);

procedureRouter.get('/meta', (_req, res) => {
  res.status(200).json({
    categories: PROCEDURE_CATEGORIES.map((value) => ({ value, label: PROCEDURE_CATEGORY_LABELS[value] })),
  });
});

procedureRouter.get('/', async (req: ScopedRequest, res) => {
  const category = isProcedureCategory(req.query.category) ? req.query.category : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const procedures = await ProcedureRepository.list({ lineId: req.catalog!.id, category, search });
  res.status(200).json({ items: procedures });
});
