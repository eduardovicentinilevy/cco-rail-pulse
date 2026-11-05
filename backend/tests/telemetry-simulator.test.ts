import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_DRIFT_V, TelemetrySimulator } from '../application/services/TelemetrySimulator';
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
