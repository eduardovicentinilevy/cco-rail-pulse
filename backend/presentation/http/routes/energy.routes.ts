// backend/presentation/http/routes/energy.routes.ts
import { Router } from 'express';
import type { PowerGrid } from '../../../application/services/PowerGrid';
import type { TrainMotionSimulator } from '../../../application/services/TrainMotionSimulator';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { AuditLogger } from '../../../infrastructure/audit/AuditLogger';
import { ValidationError } from '../../../shared/errors';
import { routeParam } from '../../../shared/http';
import { verifyJwt, requirePermission } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

/**
 * Manobra de energia do terceiro trilho: consulta e abertura/fechamento das
 * seções de cada subestação retificadora. Mudar o estado é ação de supervisor —
 * desenergizar para trens em marcha no meio do trecho.
 */
export const createEnergyRouter = (grid: PowerGrid, operation: TrainMotionSimulator): Router => {
  const router = Router();

  router.use(verifyJwt);

  router.get('/sections', (_req, res) => {
    res.status(200).json({
      sections: grid.snapshot().map((section) => ({
        ...section,
        trainsRunning: operation.runningLoad(section.substation),
      })),
    });
  });

  router.post('/sections/:substation', requirePermission('CONTROL_POWER'), async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    if (typeof body.energized !== 'boolean') {
      throw new ValidationError('Informe `energized` (true para energizar, false para desenergizar).');
    }
    const reason = typeof body.reason === 'string' ? body.reason.slice(0, 300) : '';
    const substation = routeParam(req.params.substation).toUpperCase();
    const operatorId = req.operator!.operatorId;
    const action = body.energized ? 'POWER_ENERGIZE' : 'POWER_DEENERGIZE';

    const changed = await grid.setState({ substation, energized: body.energized, reason, operatorId });
    await operatorRepository.logAudit(operatorId, action, `SECTION_${substation}`, changed ? 'EXECUTED' : 'NO_OP');
    if (changed) {
      AuditLogger.record({
        operatorId,
        action,
        targetResource: `SECTION_${substation}`,
        severity: body.energized ? 'INFO' : 'WARNING',
      });
    }

    const section = grid.snapshot().find((item) => item.substation === substation)!;
    res.status(200).json({ applied: changed !== null, section });
  });

  return router;
};
