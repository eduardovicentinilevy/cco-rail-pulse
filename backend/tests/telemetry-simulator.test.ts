import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TelemetrySimulator } from '../application/services/TelemetrySimulator';
import { LINE_STATIONS } from '../domain/line';

describe('TelemetrySimulator', () => {
  it('parte da tensão nominal de cada subestação', () => {
    const snapshot = new TelemetrySimulator(1000).snapshot();

    assert.equal(snapshot.length, LINE_STATIONS.length);
    for (const station of LINE_STATIONS) {
      const reading = snapshot.find((item) => item.currentStationCode === station.code);
      assert.equal(reading?.voltageKV, station.nominalVoltageKV, station.code);
    }
  });

  it('classifica a leitura conforme os limiares SCADA', () => {
    const snapshot = new TelemetrySimulator(1000).snapshot();

    // ITA opera nominalmente em 22.0 kV — abaixo do limiar crítico de 22.5 kV.
    assert.equal(snapshot.find((item) => item.currentStationCode === 'ITA')?.status, 'CRÍTICO');
    // FGO opera em 23.2 kV — faixa de atenção.
    assert.equal(snapshot.find((item) => item.currentStationCode === 'FGO')?.status, 'ATENÇÃO');
    assert.equal(snapshot.find((item) => item.currentStationCode === 'BRA')?.status, 'NORMAL');
  });

  it('mantém a deriva dentro de ±0.5 kV do nominal ao longo do tempo', async () => {
    const simulator = new TelemetrySimulator(5);
    simulator.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    simulator.stop();

    for (const reading of simulator.snapshot()) {
      const station = LINE_STATIONS.find((item) => item.code === reading.currentStationCode);
      assert.ok(station);
      const drift = Math.abs(reading.voltageKV - station.nominalVoltageKV);
      assert.ok(drift <= 0.5 + 1e-9, `${reading.currentStationCode} derivou ${drift.toFixed(3)} kV`);
    }
  });

  it('start é idempotente e stop encerra o ciclo', () => {
    const simulator = new TelemetrySimulator(1000);
    simulator.start();
    simulator.start();
    assert.equal(simulator.isRunning, true);

    simulator.stop();
    assert.equal(simulator.isRunning, false);
    assert.doesNotThrow(() => simulator.stop());
  });
});
