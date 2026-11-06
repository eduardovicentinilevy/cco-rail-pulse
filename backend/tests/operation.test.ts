import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ACCELERATION_MS2,
  DWELL_MS,
  LINE_SPEED_KMH,
  NOMINAL_SEGMENT_LENGTH_M,
  TRANSFER_DWELL_MS,
  operationFor,
  runTimeMs,
} from '../domain/operation';
import { demoCatalog, otherTenantCatalog } from './helpers/catalog';

const line2 = operationFor(demoCatalog());
const codes = line2.catalog.codes;

describe('Operação — geometria da linha', () => {
  it('soma ~14,7 km de Vila Madalena a Vila Prudente', () => {
    assert.ok(
      line2.lineLengthM > 14_400 && line2.lineLengthM < 15_000,
      `extensão ${line2.lineLengthM} m`,
    );
  });

  it('tem trecho entre toda estação vizinha, nos dois sentidos, e só entre vizinhas', () => {
    for (let index = 0; index < codes.length - 1; index += 1) {
      const a = codes[index];
      const b = codes[index + 1];
      const length = line2.segmentLengthM(a, b);
      assert.ok(length !== undefined && length > 400 && length < 2_000, `${a}-${b}: ${length} m`);
      assert.equal(line2.segmentLengthM(b, a), length);
    }
    assert.equal(line2.segmentLengthM('VMD', 'CLI'), undefined);
  });

  it('a geometria é da linha: a malha de outro cliente tem os trechos dela', () => {
    const outra = operationFor(otherTenantCatalog());
    // Código que não existe na outra malha não tem trecho lá, e vice-versa.
    assert.equal(outra.segmentLengthM('VMD', 'SUM'), undefined);
    assert.equal(line2.segmentLengthM('JAB', 'CNC'), undefined);
    assert.ok(outra.segmentLengthM('JAB', 'CNC') !== undefined);
  });

  it('linha recém-cadastrada, sem coordenadas, opera com trecho nominal', () => {
    const outra = operationFor(otherTenantCatalog());
    assert.equal(outra.segmentLengthM('JAB', 'CNC'), NOMINAL_SEGMENT_LENGTH_M);
    assert.equal(outra.lineLengthM, 2 * NOMINAL_SEGMENT_LENGTH_M);
    // E a marcha continua possível: o percurso tem duração, não zero.
    assert.ok(outra.segmentRunTimeMs('JAB', 'CNC', LINE_SPEED_KMH) > 0);
  });

  it('cada catálogo tem a sua marcha, calculada uma única vez', () => {
    const catalog = demoCatalog();
    assert.equal(operationFor(catalog), operationFor(catalog));
    assert.notEqual(operationFor(demoCatalog()), operationFor(otherTenantCatalog()));
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
    assert.ok(
      line2.segmentRunTimeMs('VMD', 'SUM', 20) > 2 * line2.segmentRunTimeMs('VMD', 'SUM', LINE_SPEED_KMH),
    );
  });

  it('percursos reais entre estações ficam entre 40 s e 2 min', () => {
    for (let index = 0; index < codes.length - 1; index += 1) {
      const time = line2.segmentRunTimeMs(codes[index], codes[index + 1], LINE_SPEED_KMH);
      assert.ok(time > 40_000 && time < 120_000, `${codes[index]}: ${time} ms`);
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
    assert.equal(line2.dwellTimeMs('PSO'), TRANSFER_DWELL_MS);
    assert.equal(line2.dwellTimeMs('SUM'), DWELL_MS);
  });

  it('reconhece os terminais', () => {
    assert.equal(line2.isTerminal('VMD'), true);
    assert.equal(line2.isTerminal('VPT'), true);
    assert.equal(line2.isTerminal('PSO'), false);
    // Estação de outra linha não é terminal desta.
    assert.equal(line2.isTerminal('JAB'), false);
  });

  it('segue a ordem do traçado em cada sentido e para no fim da linha', () => {
    assert.equal(line2.nextStationCode('PSO', 1), 'ANR');
    assert.equal(line2.nextStationCode('PSO', -1), 'BGD');
    assert.equal(line2.nextStationCode('VPT', 1), undefined);
    assert.equal(line2.nextStationCode('VMD', -1), undefined);
    assert.equal(line2.nextStationCode('XYZ', 1), undefined);
  });

  it('inverte o sentido só ao chegar a um terminal', () => {
    assert.equal(line2.directionAfterArrival('VPT', 1), -1);
    assert.equal(line2.directionAfterArrival('VMD', -1), 1);
    assert.equal(line2.directionAfterArrival('TTI', 1), 1);
  });

  it('nomeia os sentidos pelos terminais da linha, não por ponto cardeal', () => {
    assert.deepEqual(line2.directionLabels, {
      1: 'sentido Vila Prudente',
      [-1]: 'sentido Vila Madalena',
    });
    assert.deepEqual(operationFor(otherTenantCatalog()).directionLabels, {
      1: 'sentido São Judas',
      [-1]: 'sentido Jabaquara',
    });
  });
});

describe('Operação — ciclo da frota', () => {
  it('uma volta completa leva entre 40 e 60 minutos', () => {
    const minutes = line2.cycleTimeMs() / 60_000;
    assert.ok(minutes > 40 && minutes < 60, `ciclo de ${minutes.toFixed(1)} min`);
  });

  it('a 20 km/h a volta fica bem mais longa', () => {
    assert.ok(line2.cycleTimeMs(20) > 1.5 * line2.cycleTimeMs());
  });

  it('a volta de uma linha curta é bem menor que a da Linha 2', () => {
    assert.ok(operationFor(otherTenantCatalog()).cycleTimeMs() < line2.cycleTimeMs());
  });
});
