// backend/presentation/http/routes/energy.routes.ts
import { Router } from 'express';
import type { SimulationRegistry } from '../../../application/services/SimulationRegistry';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { AuditLogger } from '../../../infrastructure/audit/AuditLogger';
import { ValidationError } from '../../../shared/errors';
import { routeParam } from '../../../shared/http';
import { verifyJwt, requirePermission, withLineCatalog } from '../middlewares/auth.middleware';
import type { ScopedRequest } from '../middlewares/auth.middleware';

/**
 * Manobra de energia do terceiro trilho: consulta e abertura/fechamento das
 * seções de cada subestação retificadora. Mudar o estado é ação de supervisor —
 * desenergizar para trens em marcha no meio do trecho.
 *
 * Tudo aqui é da linha da sessão. A SR é dado da malha, e duas linhas podem ter
 * uma `SR-01` cada uma: a grade vem do registro de simulação daquela linha, nunca
 * uma grade só para o processo.
 */
export const createEnergyRouter = (registry: SimulationRegistry): Router => {
  const router = Router();

  router.use(verifyJwt, withLineCatalog);

  router.get('/sections', async (req: ScopedRequest, res) => {
    const lineId = req.catalog!.id;
    // Uma linha cadastrada depois do boot ainda não tem simulação: sobe a dela
    // aqui, em vez de responder sem seção nenhuma até o próximo reinício.
    await registry.ensureLine(lineId);
    const grid = registry.gridOf(lineId);
    const motion = registry.motionOf(lineId);

    res.status(200).json({
      sections: (grid?.snapshot() ?? []).map((section) => ({
        ...section,
        trainsRunning: motion?.runningLoad(section.substation) ?? 0,
      })),
    });
  });

  router.post(
    '/sections/:substation',
    requirePermission('CONTROL_POWER'),
    async (req: ScopedRequest, res) => {
      const body = req.body ?? {};
      if (typeof body.energized !== 'boolean') {
        throw new ValidationError('Informe `energized` (true para energizar, false para desenergizar).');
      }
      const catalog = req.catalog!;
      await registry.ensureLine(catalog.id);
      const grid = registry.gridOf(catalog.id);
      if (!grid) {
        // Linha sem simulação ativa: não há disjuntor para manobrar, e inventar um
        // estado aqui seria pior do que recusar a manobra.
        throw new ValidationError(`A ${catalog.name} não tem energia de tração em operação neste servidor.`);
      }

      const reason = typeof body.reason === 'string' ? body.reason.slice(0, 300) : '';
      const substation = routeParam(req.params.substation).toUpperCase();
      // O crachá, e não a chave interna: quem lê a trilha e o alarme é humano.
      const credential = req.operator!.credential;
      const action = body.energized ? 'POWER_ENERGIZE' : 'POWER_DEENERGIZE';

      const changed = await grid.setState({
        substation,
        energized: body.energized,
        reason,
        operatorId: credential,
      });
      await operatorRepository.logAudit({
        tenantId: catalog.tenantId,
        credential,
        action,
        target: `SECTION_${substation}`,
        status: changed ? 'EXECUTED' : 'NO_OP',
      });
      if (changed) {
        AuditLogger.record({
          operatorId: credential,
          action,
          targetResource: `SECTION_${substation}`,
          severity: body.energized ? 'INFO' : 'WARNING',
        });
      }

      const section = grid.snapshot().find((item) => item.substation === substation)!;
      res.status(200).json({ applied: changed !== null, section });
    },
  );

  return router;
};
