// backend/presentation/http/routes/shift.routes.ts
import { Router } from 'express';
import { buildShiftReportUseCase } from '../../../application/use-cases/BuildShiftReportUseCase';
import { ValidationError } from '../../../shared/errors';
import { verifyJwt } from '../middlewares/auth.middleware';

export const shiftRouter: Router = Router();

shiftRouter.use(verifyJwt);

/** Janela padrão quando o painel não informa o início do turno. */
const DEFAULT_WINDOW_HOURS = 8;

shiftRouter.get('/report', async (req, res) => {
  const raw = req.query.since;
  let since: Date;

  if (typeof raw === 'string' && raw.length > 0) {
    since = new Date(raw);
    if (Number.isNaN(since.getTime())) {
      throw new ValidationError('O parâmetro "since" precisa ser uma data ISO 8601 válida.');
    }
  } else {
    since = new Date(Date.now() - DEFAULT_WINDOW_HOURS * 3600_000);
  }

  res.status(200).json(await buildShiftReportUseCase.execute(since));
});
