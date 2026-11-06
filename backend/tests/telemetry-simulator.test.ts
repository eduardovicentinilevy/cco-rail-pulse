import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LOAD_SAG_V_PER_TRAIN,
  MAX_DRIFT_V,
  TelemetrySimulator,
} from '../application/services/TelemetrySimulator';
import { demoCatalog, otherTenantCatalog } from './helpers/catalog';

describe('TelemetrySimulator', () => {
  const catalog = demoCatalog();

  it('parte da tensão nominal de cada subestação', () => {
    const snapshot = new TelemetrySimulator(catalog, 1000).snapshot();

    assert.equal(snapshot.length, catalog.size);
    for (const station of catalog.stations) {
      const reading = snapshot.find((item) => item.currentStationCode === station.code);
      assert.equal(reading?.voltageV, station.nominalVoltageV, station.code);
    }
  });

  it('carimba cada leitura com a estação da malha, que é por onde a série é gravada', () => {
    for (const reading of new TelemetrySimulator(catalog, 1000).snapshot()) {
      assert.equal(reading.stationId, catalog.find(reading.currentStationCode)?.id);
    }
  });

  it('classifica a leitura conforme os limiares SCADA', () => {
    const snapshot = new TelemetrySimulator(catalog, 1000).snapshot();

    // AIP fica em fim de alimentação (620 V) — abaixo do limiar crítico de 640 V.
    assert.equal(snapshot.find((item) => item.currentStationCode === 'AIP')?.status, 'CRÍTICO');
    // SAC opera em 680 V — faixa de atenção.
    assert.equal(snapshot.find((item) => item.currentStationCode === 'SAC')?.status, 'ATENÇÃO');
    assert.equal(snapshot.find((item) => item.currentStationCode === 'VMD')?.status, 'NORMAL');
  });

  it('mantém a deriva dentro do limite em torno da tensão de referência', async () => {
    const simulator = new TelemetrySimulator(catalog, 5);
    simulator.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    simulator.stop();

    for (const reading of simulator.snapshot()) {
      const station = catalog.find(reading.currentStationCode);
      assert.ok(station);
      const drift = Math.abs(reading.voltageV - station.nominalVoltageV);
      assert.ok(drift <= MAX_DRIFT_V + 1e-9, `${reading.currentStationCode} derivou ${drift.toFixed(1)} V`);
    }
  });

  it('expõe a última leitura de cada estação para as composições', () => {
    const simulator = new TelemetrySimulator(catalog, 1000);
    const snapshot = simulator.snapshot();

    for (const reading of snapshot) {
      assert.equal(simulator.readingFor(reading.currentStationCode), reading.voltageV);
    }
    assert.equal(simulator.readingFor('XYZ'), undefined);
  });

  it('trens em marcha derrubam a tensão da seção que os alimenta', () => {
    const loaded = new TelemetrySimulator(demoCatalog(), 1000, { loadAt: (sr: string) => (sr === 'SR-01' ? 3 : 0) });
    let readings = loaded.tick();
    for (let cycle = 0; cycle < 40; cycle += 1) readings = loaded.tick();

    const vmd = readings.find((item) => item.currentStationCode === 'VMD')!;
    const target = 752 - 3 * LOAD_SAG_V_PER_TRAIN;
    assert.ok(Math.abs(vmd.voltageV - target) <= MAX_DRIFT_V, `VMD em ${vmd.voltageV} V, alvo ${target} V`);
    // Seção sem carga continua perto da referência.
    const tti = readings.find((item) => item.currentStationCode === 'TTI')!;
    assert.ok(Math.abs(tti.voltageV - 749) <= MAX_DRIFT_V);
  });

  it('seção desenergizada lê 0 V, crítica — inclusive no snapshot inicial', () => {
    let energized = false;
    const simulator = new TelemetrySimulator(demoCatalog(), 1000, { isEnergized: (sr: string) => sr !== 'SR-03' || energized });

    const initial = simulator.snapshot().find((item) => item.currentStationCode === 'TRI')!;
    assert.equal(initial.voltageV, 0);
    assert.equal(initial.status, 'CRÍTICO');

    const tri = simulator.tick().find((item) => item.currentStationCode === 'TRI')!;
    assert.equal(tri.voltageV, 0);

    // Reenergizada: volta ao patamar do trecho na leitura seguinte, sem "subir" do zero.
    energized = true;
    const restored = simulator.tick().find((item) => item.currentStationCode === 'TRI')!;
    assert.ok(Math.abs(restored.voltageV - 751) <= MAX_DRIFT_V, `TRI em ${restored.voltageV} V`);
    assert.equal(restored.status, 'NORMAL');
  });

  it('start é idempotente e stop encerra o ciclo', () => {
    const simulator = new TelemetrySimulator(catalog, 1000);
    simulator.start();
    simulator.start();
    assert.equal(simulator.isRunning, true);

    simulator.stop();
    assert.equal(simulator.isRunning, false);
    assert.doesNotThrow(() => simulator.stop());
  });

  /**
   * Dois simuladores no mesmo processo são o caso que o multi-tenant precisa
   * suportar: cada um enxerga só a sua malha.
   */
  it('simula cada linha sobre a sua própria malha', () => {
    const demo = new TelemetrySimulator(demoCatalog(), 1000).snapshot();
    const outro = new TelemetrySimulator(otherTenantCatalog(), 1000).snapshot();

    assert.equal(demo.length, 14);
    assert.equal(outro.length, 3);
    assert.deepEqual(
      outro.map((reading) => reading.currentStationCode),
      ['JAB', 'CNC', 'SPO'],
    );
    assert.equal(
      demo.some((reading) => reading.currentStationCode === 'JAB'),
      false,
    );
  });
});
