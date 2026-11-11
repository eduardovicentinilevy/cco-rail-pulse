// backend/presentation/http/routes/network.routes.ts
import { Router } from 'express';
import { TrainRepository } from '../../../infrastructure/database/repositories/TrainRepository';
import { TelemetryRepository } from '../../../infrastructure/database/repositories/TelemetryRepository';
import type { TrainMotionSimulator } from '../../../application/services/TrainMotionSimulator';
import { verifyJwt, withLineCatalog } from '../middlewares/auth.middleware';
import type { ScopedRequest } from '../middlewares/auth.middleware';
import type { SimulationRegistry } from '../../../application/services/SimulationRegistry';
import { operationFor } from '../../../domain/operation';
import { env } from '../../../config/env';

/**
 * Rotas de malha: catálogo de estações e estado persistido das composições.
 * O frontend usa estes endpoints como carga inicial antes do WebSocket assumir.
 *
 * Tudo aqui é lido do catálogo da linha da sessão. Nenhuma estação, nome de
 * linha ou traçado vem de constante: um cliente novo é cadastro, não deploy.
 */
export const createNetworkRouter = (registry: SimulationRegistry): Router => {
  const router = Router();

  router.use(verifyJwt, withLineCatalog);

  router.get('/stations', async (req: ScopedRequest, res) => {
    const catalog = req.catalog!;
    await registry.ensureLine(catalog.id);
    const telemetry = new Map(registry.snapshotOf(catalog.id).map((item) => [item.currentStationCode, item]));

    res.status(200).json({
      tenant: { id: catalog.tenantId, name: catalog.line.tenantName },
      line: { id: catalog.id, code: catalog.line.code, name: catalog.name },
      stations: catalog.stations.map((station) => {
        const reading = telemetry.get(station.code);
        return {
          code: station.code,
          name: station.name,
          position: station.position,
          substation: station.substation,
          nominalVoltageV: station.nominalVoltageV,
          connections: station.connections,
          headwaySeconds: station.headwaySeconds,
          mapX: station.mapX,
          mapY: station.mapY,
          // O mapa do painel projeta o traçado destas: é a mesma coordenada que
          // mede os trechos da marcha, então desenho e distância não divergem.
          lat: station.lat,
          lon: station.lon,
          voltageV: reading?.voltageV ?? station.nominalVoltageV,
          status: reading?.status ?? 'NORMAL',
        };
      }),
    });
  });

  router.get('/trains', async (req: ScopedRequest, res) => {
    const trains = await TrainRepository.findAll(req.catalog!.id);
    const now = new Date();
    res.status(200).json(trains.map((train) => train.toSnapshot(now)));
  });

  /**
   * Previsão de chegadas por estação e sentido de partida, como no painel de
   * passageiros. `etaSeconds` já está no relógio do painel (com a aceleração da
   * simulação). Os sentidos são nomeados pelos terminais da linha da sessão: o
   * traçado é dela, e nem toda linha corre de oeste para leste.
   */
  router.get('/arrivals', async (req: ScopedRequest, res) => {
    const catalog = req.catalog!;
    const now = new Date();
    const operation = operationFor(catalog);
    const fleet = await TrainRepository.findAll(catalog.id);
    // Em serviço: composições que não estão imobilizadas pelo CCO.
    const inService = fleet.filter((train) => train.status !== 'EMERGÊNCIA').length;
    const cycleSeconds = Math.round(operation.cycleTimeMs() / 1000 / env.simulationTimeScale);
    const labels = operation.directionLabels;
    const toPayload = (list: ReturnType<TrainMotionSimulator['arrivals']>[number]['byDirection'][1]) =>
      list.map(({ trainId, etaMs, atPlatform, held }) => ({
        trainId,
        etaSeconds: Math.round(etaMs / 1000),
        atPlatform,
        held,
      }));
    // Linha cadastrada depois do boot: sobe a simulação dela antes de projetar.
    // Sem malha cadastrada não há o que simular, e aí o quadro vem vazio.
    await registry.ensureLine(catalog.id);
    const board = registry.motionOf(catalog.id)?.arrivals(now) ?? [];

    res.status(200).json({
      generatedAt: now.toISOString(),
      timeScale: env.simulationTimeScale,
      directions: { forward: labels[1], backward: labels[-1] },
      service: {
        trainsInService: inService,
        cycleSeconds,
        // Intervalo médio em cada plataforma: a volta completa dividida pela frota.
        headwaySeconds: inService > 0 ? Math.round(cycleSeconds / inService) : null,
      },
      stations: board.map((station) => ({
        code: station.stationCode,
        name: station.stationName,
        forward: toPayload(station.byDirection[1]),
        backward: toPayload(station.byDirection[-1]),
      })),
    });
  });

  /**
   * Série histórica agregada de tensão.
   * `stations` aceita códigos separados por vírgula; vazio devolve toda a malha.
   */
  router.get('/telemetry/history', async (req: ScopedRequest, res) => {
    const catalog = req.catalog!;
    const hours = Math.min(168, Math.max(1, Number.parseInt(String(req.query.hours ?? '6'), 10) || 6));
    const stationCodes = String(req.query.stations ?? '')
      .split(',')
      .map((code) => code.trim().toUpperCase())
      // Filtrar pelo catálogo é o que impede pedir a série de uma estação de outra linha.
      .filter((code) => catalog.has(code));

    const [samples, summary] = await Promise.all([
      TelemetryRepository.history(catalog.id, stationCodes, hours),
      TelemetryRepository.summary(catalog.id, hours),
    ]);

    res.status(200).json({ hours, stations: stationCodes, samples, summary });
  });

  return router;
};
