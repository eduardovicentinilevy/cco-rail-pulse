import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  TRACTION_NOMINAL_V,
  VOLTAGE_CRITICAL_V,
  VOLTAGE_WARNING_V,
  classifyVoltage,
} from '../domain/line';
import { METRO_SP_SEED } from '../infrastructure/database/seeds/metro-sp';

/**
 * Contrato entre o painel e o backend.
 *
 * A malha não é mais espelhada no frontend: ela vem inteira de
 * `GET /api/network/stations`, então não há catálogo local para comparar. O que
 * continua duplicado de propósito são os limiares elétricos — eles são regra da
 * instalação, não do cliente, e o painel precisa deles para classificar a
 * leitura que recebe sem uma segunda ida ao servidor. Divergir é o defeito que
 * este teste pega.
 *
 * O resto do contrato é a forma do payload: `normalizeStation` tem de reconhecer
 * exatamente os campos que a rota manda, senão o painel cai no neutro sem que
 * ninguém perceba.
 *
 * Os módulos do painel são carregados em tempo de execução (o tsc do backend não
 * alcança `frontend/`); a forma esperada fica tipada aqui.
 */
interface PanelStation {
  position: number;
  code: string;
  name: string;
  substation: string;
  nominalVoltageV: number;
  voltageV: number;
  status: string;
  headwaySeconds: number | null;
  connections: string[];
  mapX: number | null;
  mapY: number | null;
}

interface PanelStations {
  TRACTION_NOMINAL_V: number;
  VOLTAGE_WARNING_V: number;
  VOLTAGE_CRITICAL_V: number;
  classifyVoltage: (voltageV: number) => string;
  connectionStyle: (connection: string) => { short: string };
  normalizeStation: (raw: Record<string, unknown>) => PanelStation | null;
  stationAccessibleName: (station: PanelStation) => string;
}

interface PanelGeometry {
  VIEW_WIDTH: number;
  VIEW_HEIGHT: number;
  projectStation: (
    station: { mapX: number | null; mapY: number | null },
    index: number,
    total: number,
  ) => { x: number; y: number };
}

const panelModule = <T>(relative: string): Promise<T> =>
  import(pathToFileURL(path.resolve(__dirname, '../../frontend/src/data', relative)).href) as Promise<T>;

describe('Contrato painel ↔ domínio', () => {
  it('usa os mesmos limiares de tensão e a mesma classificação', async () => {
    const panel = await panelModule<PanelStations>('stations.ts');

    assert.equal(panel.TRACTION_NOMINAL_V, TRACTION_NOMINAL_V);
    assert.equal(panel.VOLTAGE_WARNING_V, VOLTAGE_WARNING_V);
    assert.equal(panel.VOLTAGE_CRITICAL_V, VOLTAGE_CRITICAL_V);

    for (const voltage of [600, VOLTAGE_CRITICAL_V - 0.1, VOLTAGE_CRITICAL_V, VOLTAGE_WARNING_V, 760]) {
      assert.equal(panel.classifyVoltage(voltage), classifyVoltage(voltage), `divergência em ${voltage} V`);
    }
  });

  /**
   * O payload montado aqui tem os mesmos campos que `network.routes.ts` serve.
   * Se a rota renomear um campo, o painel passa a cair no neutro — é o que esta
   * comparação denuncia.
   */
  it('reconhece todos os campos que a rota de malha manda', async () => {
    const panel = await panelModule<PanelStations>('stations.ts');
    const seeded = METRO_SP_SEED.lines[0].stations[0];

    const station = panel.normalizeStation({
      code: seeded.code,
      name: seeded.name,
      position: seeded.position,
      substation: seeded.substation,
      nominalVoltageV: seeded.nominalVoltageV,
      connections: [...seeded.connections],
      headwaySeconds: seeded.headwaySeconds,
      mapX: seeded.mapX,
      mapY: seeded.mapY,
      voltageV: 683.2,
      status: 'ATENÇÃO',
    });

    assert.deepEqual(station, {
      code: seeded.code,
      name: seeded.name,
      position: seeded.position,
      substation: seeded.substation,
      nominalVoltageV: seeded.nominalVoltageV,
      connections: [...seeded.connections],
      headwaySeconds: seeded.headwaySeconds,
      mapX: seeded.mapX,
      mapY: seeded.mapY,
      voltageV: 683.2,
      status: 'ATENÇÃO',
    });
  });

  it('não deixa tensão indefinida chegar à interface', async () => {
    const panel = await panelModule<PanelStations>('stations.ts');

    // Backend de outra versão: tensão com outro nome, sem integrações, sem trecho.
    const legacy = panel.normalizeStation({ code: 'CNS', name: 'Consolação', voltageKV: 24.6, status: 'NORMAL' });
    assert.ok(legacy);
    // Sem catálogo local de onde completar, o neutro é a tensão nominal da
    // instalação — nunca a de uma estação de outra linha com o mesmo código.
    assert.equal(legacy.voltageV, TRACTION_NOMINAL_V);
    assert.equal(legacy.nominalVoltageV, TRACTION_NOMINAL_V);
    assert.equal(legacy.substation, '—');
    assert.deepEqual(legacy.connections, []);
    assert.equal(legacy.headwaySeconds, null);

    // Status desconhecido é reclassificado pela tensão; sem código, o item é descartado.
    const odd = panel.normalizeStation({ code: 'AIP', voltageV: 618, status: 'QUALQUER' });
    assert.equal(odd?.status, 'CRÍTICO');
    assert.equal(panel.normalizeStation({ name: 'sem código' }), null);
  });

  it('anuncia as integrações da estação no nome acessível', async () => {
    const panel = await panelModule<PanelStations>('stations.ts');
    const station = panel.normalizeStation({ code: 'CNS', name: 'Consolação', voltageV: 746, connections: ['L4-Amarela'] });
    assert.ok(station);

    const name = panel.stationAccessibleName(station);
    assert.match(name, /Estação Consolação/);
    assert.match(name, /integração com L4-Amarela/);
  });

  it('tem identidade visual para toda integração semeada', async () => {
    const panel = await panelModule<PanelStations>('stations.ts');
    const connections = new Set(METRO_SP_SEED.lines.flatMap((line) => line.stations.flatMap((s) => s.connections)));

    for (const connection of connections) {
      // O fallback genérico usa as duas primeiras letras; uma integração mapeada nunca cai nele.
      assert.notEqual(
        panel.connectionStyle(connection).short,
        connection.slice(0, 2).toUpperCase(),
        `${connection} sem estilo definido`,
      );
    }
  });

  /**
   * A malha cadastrada é que decide o traçado, então o que se pode exigir da
   * projeção é que ela caiba no quadro — com coordenada cadastrada ou sem.
   */
  it('projeta no quadro toda estação, com ou sem coordenada cadastrada', async () => {
    const geometry = await panelModule<PanelGeometry>('lineGeometry.ts');
    const seeded = METRO_SP_SEED.lines[0].stations;

    seeded.forEach((station, index) => {
      const point = geometry.projectStation(station, index, seeded.length);
      assert.ok(point.x >= 0 && point.x <= geometry.VIEW_WIDTH, `${station.code} fora do quadro (x=${point.x})`);
      assert.ok(point.y >= 0 && point.y <= geometry.VIEW_HEIGHT, `${station.code} fora do quadro (y=${point.y})`);
    });

    // Linha recém-cadastrada, sem coordenadas: as estações saem num eixo reto.
    const semMapa = { mapX: null, mapY: null };
    const first = geometry.projectStation(semMapa, 0, 3);
    const last = geometry.projectStation(semMapa, 2, 3);
    assert.ok(first.x < last.x);
    assert.equal(first.y, geometry.VIEW_HEIGHT / 2);
  });
});
