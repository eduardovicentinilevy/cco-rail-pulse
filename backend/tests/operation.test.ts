import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LINE_STATION_CODES } from '../domain/line';
import {
  ACCELERATION_MS2,
  cycleTimeMs,
  directionAfterArrival,
  dwellTimeMs,
  DWELL_MS,
  isTerminal,
  LINE_LENGTH_M,
  LINE_SPEED_KMH,
  nextStationCode,
  runTimeMs,
  segmentLengthM,
  segmentRunTimeMs,
  TRANSFER_DWELL_MS,
} from '../domain/operation';

describe('Operação — geometria da linha', () => {
  it('soma ~14,7 km de Vila Madalena a Vila Prudente', () => {
    assert.ok(LINE_LENGTH_M > 14_400 && LINE_LENGTH_M < 15_000, `extensão ${LINE_LENGTH_M} m`);
  });

  it('tem trecho entre toda estação vizinha, nos dois sentidos, e só entre vizinhas', () => {
    for (let index = 0; index < LINE_STATION_CODES.length - 1; index += 1) {
      const a = LINE_STATION_CODES[index];
      const b = LINE_STATION_CODES[index + 1];
      const length = segmentLengthM(a, b);
      assert.ok(length !== undefined && length > 400 && length < 2_000, `${a}-${b}: ${length} m`);
      assert.equal(segmentLengthM(b, a), length);
    }
    assert.equal(segmentLengthM('VMD', 'CLI'), undefined);
  });
});

describe('Operação — perfil de marcha', () => {
  it('trecho longo: acelera, cruza e freia (perfil trapezoidal)', () => {
    const v = LINE_SPEED_KMH / 3.6;
    const distance = 2_000;
    const expected = (v / ACCELERATION_MS2 + (distance - v * v) / v + v / ACCELERATION_MS2) * 1000;
    assert.ok(Math.abs(runTimeMs(distance, LINE_SPEED_KMH) - expected) <= 1);
  });

  it('trecho curto não atinge a velocidade máxima (perfil triangular)', () => {
    // 200 m a 1 m/s²: pico de 14,1 m/s em 14,1 s, e o mesmo tempo para frear.
    assert.equal(runTimeMs(200, LINE_SPEED_KMH), Math.round(2 * Math.sqrt(200) * 1000));
  });

  it('restrição de 20 km/h torna o percurso bem mais longo', () => {
    assert.ok(segmentRunTimeMs('VMD', 'SUM', 20) > 2 * segmentRunTimeMs('VMD', 'SUM', LINE_SPEED_KMH));
  });

  it('percursos reais entre estações ficam entre 40 s e 2 min', () => {
    for (let index = 0; index < LINE_STATION_CODES.length - 1; index += 1) {
      const time = segmentRunTimeMs(LINE_STATION_CODES[index], LINE_STATION_CODES[index + 1], LINE_SPEED_KMH);
      assert.ok(time > 40_000 && time < 120_000, `${LINE_STATION_CODES[index]}: ${time} ms`);
    }
  });

  it('entradas inválidas dão tempo zero, sem NaN', () => {
    assert.equal(runTimeMs(0, 70), 0);
    assert.equal(runTimeMs(-5, 70), 0);
    assert.equal(runTimeMs(500, 0), 0);
    assert.equal(runTimeMs(Number.NaN, 70), 0);
  });
});

describe('Operação — paradas e sentido', () => {
  it('estações de integração têm parada mais longa', () => {
    assert.equal(dwellTimeMs('PSO'), TRANSFER_DWELL_MS);
    assert.equal(dwellTimeMs('SUM'), DWELL_MS);
  });

  it('reconhece os terminais', () => {
    assert.equal(isTerminal('VMD'), true);
    assert.equal(isTerminal('VPT'), true);
    assert.equal(isTerminal('PSO'), false);
  });

  it('segue a ordem do traçado em cada sentido e para no fim da linha', () => {
    assert.equal(nextStationCode('PSO', 1), 'ANR');
    assert.equal(nextStationCode('PSO', -1), 'BGD');
    assert.equal(nextStationCode('VPT', 1), undefined);
    assert.equal(nextStationCode('VMD', -1), undefined);
    assert.equal(nextStationCode('XYZ', 1), undefined);
  });

  it('inverte o sentido só ao chegar a um terminal', () => {
    assert.equal(directionAfterArrival('VPT', 1), -1);
    assert.equal(directionAfterArrival('VMD', -1), 1);
    assert.equal(directionAfterArrival('TTI', 1), 1);
  });
});

describe('Operação — ciclo da frota', () => {
  it('uma volta completa leva entre 40 e 60 minutos', () => {
    const minutes = cycleTimeMs() / 60_000;
    assert.ok(minutes > 40 && minutes < 60, `ciclo de ${minutes.toFixed(1)} min`);
  });

  it('a 20 km/h a volta fica bem mais longa', () => {
    assert.ok(cycleTimeMs(20) > 1.5 * cycleTimeMs());
  });
});
