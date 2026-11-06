// backend/presentation/http/routes/network.routes.ts
import { Router } from 'express';
import { LINE_NAME, LINE_STATIONS } from '../../../domain/line';
import { TrainRepository } from '../../../infrastructure/database/repositories/TrainRepository';
import { TelemetryRepository } from '../../../infrastructure/database/repositories/TelemetryRepository';
import { verifyJwt } from '../middlewares/auth.middleware';
import type { TelemetrySimulator } from '../../../application/services/TelemetrySimulator';
import type { TrainMotionSimulator } from '../../../application/services/TrainMotionSimulator';
import { cycleTimeMs, DIRECTION_LABELS } from '../../../domain/operation';
import { env } from '../../../config/env';

/**
 * Rotas de malha: catálogo de estações e estado persistido das composições.
 * O frontend usa estes endpoints como carga inicial antes do WebSocket assumir.
 */
export const createNetworkRouter = (simulator: TelemetrySimulator, operation: TrainMotionSimulator): Router => {
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
          voltageV: reading?.voltageV ?? station.nominalVoltageV,
          status: reading?.status ?? 'NORMAL',
        };
      }),
    });
  });

  router.get('/trains', async (_req, res) => {
    const trains = await TrainRepository.findAll();
    const now = new Date();
    res.status(200).json(trains.map((train) => train.toSnapshot(now)));
  });

  /**
   * Previsão de chegadas por estação e sentido de partida, como no painel de
   * passageiros. `etaSeconds` já está no relógio do painel (com a aceleração da simulação).
   */
  router.get('/arrivals', async (_req, res) => {
    const now = new Date();
    const fleet = await TrainRepository.findAll();
    // Em serviço: composições que não estão imobilizadas pelo CCO.
    const inService = fleet.filter((train) => train.status !== 'EMERGÊNCIA').length;
    const cycleSeconds = Math.round(cycleTimeMs() / 1000 / env.simulationTimeScale);
    const toPayload = (list: ReturnType<TrainMotionSimulator['arrivals']>[number]['byDirection'][1]) =>
      list.map(({ trainId, etaMs, atPlatform, held }) => ({
        trainId,
        etaSeconds: Math.round(etaMs / 1000),
        atPlatform,
        held,
      }));

    res.status(200).json({
      generatedAt: now.toISOString(),
      timeScale: env.simulationTimeScale,
      directions: { east: DIRECTION_LABELS[1], west: DIRECTION_LABELS[-1] },
      service: {
        trainsInService: inService,
        cycleSeconds,
        // Intervalo médio em cada plataforma: a volta completa dividida pela frota.
        headwaySeconds: inService > 0 ? Math.round(cycleSeconds / inService) : null,
      },
      stations: operation.arrivals(now).map((station) => ({
        code: station.stationCode,
        name: station.stationName,
        east: toPayload(station.byDirection[1]),
        west: toPayload(station.byDirection[-1]),
      })),
    });
  });

  /**
   * Série histórica agregada de tensão.
   * `stations` aceita códigos separados por vírgula; vazio devolve toda a malha.
   */
  router.get('/telemetry/history', async (req, res) => {
    const hours = Math.min(168, Math.max(1, Number.parseInt(String(req.query.hours ?? '6'), 10) || 6));
    const stationCodes = String(req.query.stations ?? '')
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter((code) => LINE_STATIONS.some((station) => station.code === code));

    const [samples, summary] = await Promise.all([
      TelemetryRepository.history(stationCodes, hours),
      TelemetryRepository.summary(hours),
    ]);

    res.status(200).json({ hours, stations: stationCodes, samples, summary });
  });

  return router;
};
