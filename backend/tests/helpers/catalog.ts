// backend/tests/helpers/catalog.ts
import { LineCatalog } from '../../domain/line';
import type { LineStation } from '../../domain/line';
import { LINHA_UNI_SEED } from '../../infrastructure/database/seeds/linha-uni';

/** Ids estáveis por código: os testes não tocam o banco, mas o catálogo exige um id por estação. */
const stationId = (lineCode: string, code: string): string => `sta-${lineCode.toLowerCase()}-${code.toLowerCase()}`;

/** Catálogo montado a partir de uma semeadura, sem passar pelo banco. */
export const catalogFromSeed = (
  seed: (typeof LINHA_UNI_SEED)['lines'][number],
  tenant = { id: 'tenant-demo', name: LINHA_UNI_SEED.name },
): LineCatalog => {
  const stations: LineStation[] = seed.stations.map((station) => ({
    id: stationId(seed.code, station.code),
    position: station.position,
    code: station.code,
    name: station.name,
    substation: station.substation,
    nominalVoltageKV: station.nominalVoltageKV,
    headwaySeconds: station.headwaySeconds,
    mapX: station.mapX,
    mapY: station.mapY,
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

/** Malha da Linha 6-Laranja, a que era constante de código antes do multi-tenant. */
export const linhaUniCatalog = (): LineCatalog => catalogFromSeed(LINHA_UNI_SEED.lines[0]);

/** Malha de um segundo cliente, para provar que dois catálogos coexistem sem se misturar. */
export const otherTenantCatalog = (): LineCatalog =>
  new LineCatalog(
    { id: 'line-m1', tenantId: 'tenant-outro', tenantName: 'Metrô Exemplo', code: 'M1', name: 'Linha 1-Azul' },
    [
      { id: 'sta-m1-jab', position: 1, code: 'JAB', name: 'Jabaquara', substation: 'TSS-A1', nominalVoltageKV: 24.5, headwaySeconds: 180, mapX: 0.1, mapY: 0.9 },
      { id: 'sta-m1-cnc', position: 2, code: 'CNC', name: 'Conceição', substation: 'TSS-A1', nominalVoltageKV: 24.4, headwaySeconds: 180, mapX: 0.3, mapY: 0.7 },
      { id: 'sta-m1-spo', position: 3, code: 'SPO', name: 'São Judas', substation: 'TSS-A2', nominalVoltageKV: 22.1, headwaySeconds: 200, mapX: 0.5, mapY: 0.5 },
    ],
  );
