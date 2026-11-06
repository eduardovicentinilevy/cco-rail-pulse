// backend/tests/helpers/catalog.ts
import { LineCatalog } from '../../domain/line';
import type { LineStation } from '../../domain/line';
import { METRO_SP_SEED } from '../../infrastructure/database/seeds/metro-sp';

/** Ids estáveis por código: os testes não tocam o banco, mas o catálogo exige um id por estação. */
const stationId = (lineCode: string, code: string): string => `sta-${lineCode.toLowerCase()}-${code.toLowerCase()}`;

/** Catálogo montado a partir de uma semeadura, sem passar pelo banco. */
export const catalogFromSeed = (
  seed: (typeof METRO_SP_SEED)['lines'][number],
  tenant = { id: 'tenant-demo', name: METRO_SP_SEED.name },
): LineCatalog => {
  const stations: LineStation[] = seed.stations.map((station) => ({
    id: stationId(seed.code, station.code),
    position: station.position,
    code: station.code,
    name: station.name,
    substation: station.substation,
    nominalVoltageV: station.nominalVoltageV,
    connections: station.connections,
    headwaySeconds: station.headwaySeconds,
    mapX: station.mapX,
    mapY: station.mapY,
    lat: station.lat,
    lon: station.lon,
  }));

  return new LineCatalog(
    {
      id: `line-${seed.code.toLowerCase()}`,
      tenantId: tenant.id,
      tenantName: tenant.name,
      code: seed.code,
      name: seed.name,
    },
    stations,
  );
};

/** Malha do cliente de demonstração, a que era constante de código antes do multi-tenant. */
export const demoCatalog = (): LineCatalog => catalogFromSeed(METRO_SP_SEED.lines[0]);

/**
 * Malha de um segundo cliente, para provar que dois catálogos coexistem sem se
 * misturar — e, de propósito, sem coordenada nenhuma: é a linha recém-cadastrada
 * que opera com trecho de comprimento nominal até alguém informar as coordenadas.
 */
export const otherTenantCatalog = (): LineCatalog =>
  new LineCatalog(
    { id: 'line-m1', tenantId: 'tenant-outro', tenantName: 'Metrô Exemplo', code: 'M1', name: 'Linha 1-Azul' },
    [
      { id: 'sta-m1-jab', position: 1, code: 'JAB', name: 'Jabaquara', substation: 'SR-A1', nominalVoltageV: 749, connections: [], headwaySeconds: 180, mapX: 0.1, mapY: 0.9, lat: null, lon: null },
      { id: 'sta-m1-cnc', position: 2, code: 'CNC', name: 'Conceição', substation: 'SR-A1', nominalVoltageV: 747, connections: [], headwaySeconds: 180, mapX: 0.3, mapY: 0.7, lat: null, lon: null },
      { id: 'sta-m1-spo', position: 3, code: 'SPO', name: 'São Judas', substation: 'SR-A2', nominalVoltageV: 681, connections: ['L2-Verde'], headwaySeconds: 200, mapX: 0.5, mapY: 0.5, lat: null, lon: null },
    ],
  );
