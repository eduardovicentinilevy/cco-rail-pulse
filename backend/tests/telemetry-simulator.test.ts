import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_DRIFT_V, TelemetrySimulator } from '../application/services/TelemetrySimulator';
import { LINE_STATIONS } from '../domain/line';

describe('TelemetrySimulator', () => {
  it('parte da tensão nominal de cada subestação', () => {
    const snapshot = new TelemetrySimulator(1000).snapshot();

    assert.equal(snapshot.length, LINE_STATIONS.length);
    for (const station of LINE_STATIONS) {
      const reading = snapshot.find((item) => item.currentStationCode === station.code);
      assert.equal(reading?.voltageV, station.nominalVoltageV, station.code);
    }
  });

  it('classifica a leitura conforme os limiares SCADA', () => {
    const snapshot = new TelemetrySimulator(1000).snapshot();

    // AIP fica em fim de alimentação (620 V) — abaixo do limiar crítico de 640 V.
    assert.equal(snapshot.find((item) => item.currentStationCode === 'AIP')?.status, 'CRÍTICO');
    // SAC opera em 680 V — faixa de atenção.
    assert.equal(snapshot.find((item) => item.currentStationCode === 'SAC')?.status, 'ATENÇÃO');
    assert.equal(snapshot.find((item) => item.currentStationCode === 'VMD')?.status, 'NORMAL');
  });

  it('mantém a deriva dentro do limite em torno da tensão de referência', async () => {
    const simulator = new TelemetrySimulator(5);
    simulator.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    simulator.stop();

    for (const reading of simulator.snapshot()) {
      const station = LINE_STATIONS.find((item) => item.code === reading.currentStationCode);
      assert.ok(station);
      const drift = Math.abs(reading.voltageV - station.nominalVoltageV);
      assert.ok(drift <= MAX_DRIFT_V + 1e-9, `${reading.currentStationCode} derivou ${drift.toFixed(1)} V`);
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
