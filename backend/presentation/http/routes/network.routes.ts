// backend/presentation/http/routes/network.routes.ts
import { Router } from 'express';
import { TrainRepository } from '../../../infrastructure/database/repositories/TrainRepository';
import { TelemetryRepository } from '../../../infrastructure/database/repositories/TelemetryRepository';
import { verifyJwt, withLineCatalog } from '../middlewares/auth.middleware';
import type { ScopedRequest } from '../middlewares/auth.middleware';
import type { SimulationRegistry } from '../../../application/services/SimulationRegistry';

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

  router.get('/stations', (req: ScopedRequest, res) => {
    const catalog = req.catalog!;
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
          nominalVoltageKV: station.nominalVoltageKV,
          headwaySeconds: station.headwaySeconds,
          mapX: station.mapX,
          mapY: station.mapY,
          voltageKV: reading?.voltageKV ?? station.nominalVoltageKV,
          status: reading?.status ?? 'NORMAL',
        };
      }),
    });
  });

  router.get('/trains', async (req: ScopedRequest, res) => {
    const trains = await TrainRepository.findAll(req.catalog!.id);
    res.status(200).json(trains.map((train) => train.toSnapshot()));
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
