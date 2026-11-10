import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LOAD_SAG_V_PER_TRAIN, MAX_DRIFT_V, TelemetrySimulator } from '../application/services/TelemetrySimulator';
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

    // ITA fica em fim de alimentação (620 V) — abaixo do limiar crítico de 640 V.
    assert.equal(snapshot.find((item) => item.currentStationCode === 'ITA')?.status, 'CRÍTICO');
    // FGO opera em 680 V — faixa de atenção.
    assert.equal(snapshot.find((item) => item.currentStationCode === 'FGO')?.status, 'ATENÇÃO');
    assert.equal(snapshot.find((item) => item.currentStationCode === 'BRA')?.status, 'NORMAL');
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

  it('expõe a última leitura de cada estação para as composições', () => {
    const simulator = new TelemetrySimulator(1000);
    const snapshot = simulator.snapshot();

    for (const reading of snapshot) {
      assert.equal(simulator.readingFor(reading.currentStationCode), reading.voltageV);
    }
    assert.equal(simulator.readingFor('XYZ'), undefined);
  });

  it('trens em marcha derrubam a tensão da seção que os alimenta', () => {
    const loaded = new TelemetrySimulator(1000, { loadAt: (sr) => (sr === 'SR-01' ? 3 : 0) });
    let readings = loaded.tick();
    for (let cycle = 0; cycle < 40; cycle += 1) readings = loaded.tick();

    const bra = readings.find((item) => item.currentStationCode === 'BRA')!;
    const target = 752 - 3 * LOAD_SAG_V_PER_TRAIN;
    assert.ok(Math.abs(bra.voltageV - target) <= MAX_DRIFT_V, `BRA em ${bra.voltageV} V, alvo ${target} V`);
    // Seção sem carga continua perto da referência.
    const blv = readings.find((item) => item.currentStationCode === 'BLV')!;
    assert.ok(Math.abs(blv.voltageV - 749) <= MAX_DRIFT_V);
  });

  it('seção desenergizada lê 0 V, crítica — inclusive no snapshot inicial', () => {
    let energized = false;
    const simulator = new TelemetrySimulator(1000, { isEnergized: (sr) => sr !== 'SR-03' || energized });

    const initial = simulator.snapshot().find((item) => item.currentStationCode === 'SMA')!;
    assert.equal(initial.voltageV, 0);
    assert.equal(initial.status, 'CRÍTICO');

    const sma = simulator.tick().find((item) => item.currentStationCode === 'SMA')!;
    assert.equal(sma.voltageV, 0);

    // Reenergizada: volta ao patamar do trecho na leitura seguinte, sem "subir" do zero.
    energized = true;
    const restored = simulator.tick().find((item) => item.currentStationCode === 'SMA')!;
    assert.ok(Math.abs(restored.voltageV - 749) <= MAX_DRIFT_V, `SMA em ${restored.voltageV} V`);
    assert.equal(restored.status, 'NORMAL');
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
