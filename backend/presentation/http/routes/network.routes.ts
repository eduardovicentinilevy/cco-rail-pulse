// backend/presentation/http/routes/network.routes.ts
import { Router } from 'express';
import { LINE_NAME, LINE_STATIONS } from '../../../domain/line';
import { TrainRepository } from '../../../infrastructure/database/repositories/TrainRepository';
import { verifyJwt } from '../middlewares/auth.middleware';
import type { TelemetrySimulator } from '../../../application/services/TelemetrySimulator';

/**
 * Rotas de malha: catálogo de estações e estado persistido das composições.
 * O frontend usa estes endpoints como carga inicial antes do WebSocket assumir.
 */
export const createNetworkRouter = (simulator: TelemetrySimulator): Router => {
  const router = Router();

  router.use(verifyJwt);

  router.get('/stations', (_req, res) => {
    const telemetry = new Map(simulator.snapshot().map((item) => [item.currentStationCode, item]));

    res.status(200).json({
      line: LINE_NAME,
      stations: LINE_STATIONS.map((station) => {
        const reading = telemetry.get(station.code);
        return {
          ...station,
          voltageKV: reading?.voltageKV ?? station.nominalVoltageKV,
          status: reading?.status ?? 'NORMAL',
        };
      }),
    });
  });

  router.get('/trains', async (_req, res) => {
    const trains = await TrainRepository.findAll();
    res.status(200).json(trains.map((train) => train.toSnapshot()));
  });

  return router;
};
