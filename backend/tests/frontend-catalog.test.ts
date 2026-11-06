import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  LINE_NAME,
  LINE_OPERATOR,
  LINE_STATIONS,
  TRACTION_NOMINAL_V,
  VOLTAGE_CRITICAL_V,
  VOLTAGE_WARNING_V,
  classifyVoltage,
} from '../domain/line';

/**
 * O painel carrega um espelho do catálogo (`frontend/src/data/stations.ts`) para
 * funcionar antes — e sem — a resposta da API, e projeta o mapa a partir de
 * coordenadas próprias (`frontend/src/data/lineGeometry.ts`). Este teste é o que
 * impede os dois lados de divergirem: mudar um limiar, uma estação ou uma
 * integração no domínio sem acompanhar o frontend quebra a suíte.
 *
 * Os módulos são carregados em tempo de execução (o tsc do backend não alcança
 * `frontend/`); a forma esperada fica tipada aqui.
 */
interface FrontendStation {
  order: number;
  code: string;
  name: string;
  substation: string;
  nominalVoltageV: number;
  connections: string[];
}

interface FrontendCatalog {
  LINE_NAME: string;
  LINE_OPERATOR: string;
  TRACTION_NOMINAL_V: number;
  VOLTAGE_WARNING_V: number;
  VOLTAGE_CRITICAL_V: number;
  LINE_STATIONS: FrontendStation[];
  classifyVoltage: (voltageV: number) => string;
  connectionStyle: (connection: string) => { short: string };
  normalizeStation: (raw: Record<string, unknown>) => (FrontendStation & { voltageV: number; status: string }) | null;
}

interface FrontendGeometry {
  STATION_COORDS: Record<string, { lat: number; lon: number }>;
  ROUTE: Record<string, { x: number; y: number }>;
  VIEW_WIDTH: number;
  VIEW_HEIGHT: number;
}

const frontendModule = <T>(relative: string): Promise<T> =>
  import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/data', relative)).href) as Promise<T>;

describe('Contrato frontend ↔ domínio da malha', () => {
  it('usa o mesmo nome, operadora e limiares de tensão', async () => {
    const catalog = await frontendModule<FrontendCatalog>('stations.ts');

    assert.equal(catalog.LINE_NAME, LINE_NAME);
    assert.equal(catalog.LINE_OPERATOR, LINE_OPERATOR);
    assert.equal(catalog.TRACTION_NOMINAL_V, TRACTION_NOMINAL_V);
    assert.equal(catalog.VOLTAGE_WARNING_V, VOLTAGE_WARNING_V);
    assert.equal(catalog.VOLTAGE_CRITICAL_V, VOLTAGE_CRITICAL_V);

    for (const voltage of [600, VOLTAGE_CRITICAL_V - 0.1, VOLTAGE_CRITICAL_V, VOLTAGE_WARNING_V, 760]) {
      assert.equal(catalog.classifyVoltage(voltage), classifyVoltage(voltage), `divergência em ${voltage} V`);
    }
  });

  it('espelha estações, subestações, tensões de referência e integrações', async () => {
    const catalog = await frontendModule<FrontendCatalog>('stations.ts');

    assert.deepEqual(
      catalog.LINE_STATIONS.map(({ order, code, name, substation, nominalVoltageV, connections }) => ({
        order,
        code,
        name,
        substation,
        nominalVoltageV,
        connections: [...connections],
      })),
      LINE_STATIONS.map(({ order, code, name, substation, nominalVoltageV, connections }) => ({
        order,
        code,
        name,
        substation,
        nominalVoltageV,
        connections: [...connections],
      })),
    );
  });

  it('tem identidade visual para toda integração do domínio', async () => {
    const catalog = await frontendModule<FrontendCatalog>('stations.ts');
    const connections = new Set(LINE_STATIONS.flatMap((station) => station.connections));

    for (const connection of connections) {
      // O fallback genérico usa as duas primeiras letras; uma integração mapeada nunca cai nele.
      assert.notEqual(
        catalog.connectionStyle(connection).short,
        connection.slice(0, 2).toUpperCase(),
        `${connection} sem estilo definido`,
      );
    }
  });

  it('posiciona no mapa toda estação do domínio, dentro do quadro', async () => {
    const geometry = await frontendModule<FrontendGeometry>('lineGeometry.ts');

    assert.deepEqual(Object.keys(geometry.ROUTE).sort(), LINE_STATIONS.map((station) => station.code).sort());
    for (const [code, point] of Object.entries(geometry.ROUTE)) {
      assert.ok(point.x >= 0 && point.x <= geometry.VIEW_WIDTH, `${code} fora do quadro (x=${point.x})`);
      assert.ok(point.y >= 0 && point.y <= geometry.VIEW_HEIGHT, `${code} fora do quadro (y=${point.y})`);
    }
  });

  it('desenha o mapa com as mesmas coordenadas que medem as distâncias da marcha', async () => {
    const geometry = await frontendModule<FrontendGeometry>('lineGeometry.ts');
    for (const station of LINE_STATIONS) {
      assert.deepEqual(geometry.STATION_COORDS[station.code], { lat: station.lat, lon: station.lon }, station.code);
    }
  });

  it('normaliza payloads de outra versão do backend sem deixar tensão indefinida', async () => {
    const catalog = await frontendModule<FrontendCatalog>('stations.ts');

    // Backend antigo: tensão em `voltageKV`, sem `voltageV` nem `connections`.
    const legacy = catalog.normalizeStation({ code: 'CNS', name: 'Consolação', voltageKV: 24.6, status: 'NORMAL' });
    assert.ok(legacy);
    assert.equal(legacy.voltageV, 746);
    assert.deepEqual(legacy.connections, ['L4-Amarela']);

    // Status desconhecido é reclassificado pela tensão; sem código, o item é descartado.
    const odd = catalog.normalizeStation({ code: 'AIP', voltageV: 618, status: 'QUALQUER' });
    assert.equal(odd?.status, 'CRÍTICO');
    assert.equal(catalog.normalizeStation({ name: 'sem código' }), null);
  });
});
