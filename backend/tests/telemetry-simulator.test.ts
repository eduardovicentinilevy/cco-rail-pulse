import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TelemetrySimulator } from '../application/services/TelemetrySimulator';
import { linhaUniCatalog, otherTenantCatalog } from './helpers/catalog';

describe('TelemetrySimulator', () => {
  const catalog = linhaUniCatalog();

  it('parte da tensão nominal de cada subestação', () => {
    const snapshot = new TelemetrySimulator(catalog, 1000).snapshot();

    assert.equal(snapshot.length, catalog.size);
    for (const station of catalog.stations) {
      const reading = snapshot.find((item) => item.currentStationCode === station.code);
      assert.equal(reading?.voltageKV, station.nominalVoltageKV, station.code);
    }
  });

  it('carimba cada leitura com a estação da malha, que é por onde a série é gravada', () => {
    for (const reading of new TelemetrySimulator(catalog, 1000).snapshot()) {
      assert.equal(reading.stationId, catalog.find(reading.currentStationCode)?.id);
    }
  });

  it('classifica a leitura conforme os limiares SCADA', () => {
    const snapshot = new TelemetrySimulator(catalog, 1000).snapshot();

    // ITA opera nominalmente em 22.0 kV — abaixo do limiar crítico de 22.5 kV.
    assert.equal(snapshot.find((item) => item.currentStationCode === 'ITA')?.status, 'CRÍTICO');
    // FGO opera em 23.2 kV — faixa de atenção.
    assert.equal(snapshot.find((item) => item.currentStationCode === 'FGO')?.status, 'ATENÇÃO');
    assert.equal(snapshot.find((item) => item.currentStationCode === 'BRA')?.status, 'NORMAL');
  });

  it('mantém a deriva dentro de ±0.5 kV do nominal ao longo do tempo', async () => {
    const simulator = new TelemetrySimulator(catalog, 5);
    simulator.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    simulator.stop();

    for (const reading of simulator.snapshot()) {
      const station = catalog.find(reading.currentStationCode);
      assert.ok(station);
      const drift = Math.abs(reading.voltageKV - station.nominalVoltageKV);
      assert.ok(drift <= 0.5 + 1e-9, `${reading.currentStationCode} derivou ${drift.toFixed(3)} kV`);
    }
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
    const uni = new TelemetrySimulator(linhaUniCatalog(), 1000).snapshot();
    const outro = new TelemetrySimulator(otherTenantCatalog(), 1000).snapshot();

    assert.equal(uni.length, 15);
    assert.equal(outro.length, 3);
    assert.deepEqual(
      outro.map((reading) => reading.currentStationCode),
      ['JAB', 'CNC', 'SPO'],
    );
    assert.equal(
      uni.some((reading) => reading.currentStationCode === 'JAB'),
      false,
    );
  });
});
