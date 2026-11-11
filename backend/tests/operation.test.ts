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
import { LineCatalog } from '../domain/line';
import { demoCatalog, otherTenantCatalog } from './helpers/catalog';

const demo = operationFor(demoCatalog());
const codes = demo.catalog.codes;

describe('Operação — geometria da linha', () => {
  it('soma ~15,3 km de ponta a ponta da linha semeada', () => {
    assert.ok(
      demo.lineLengthM > 15_000 && demo.lineLengthM < 15_600,
      `extensão ${demo.lineLengthM} m`,
    );
  });

  it('o fator de traçado é da linha: sem ele cadastrado, vale a soma em linha reta', () => {
    const { catalog } = demo;
    assert.equal(catalog.alignmentFactor, 1.163);
    // A mesma malha, cadastrada sem fator, mede a reta entre as estações.
    const semFator = operationFor(new LineCatalog({ ...catalog.line, alignmentFactor: 1 }, catalog.stations));
    assert.ok(semFator.lineLengthM < demo.lineLengthM);
    assert.ok(Math.abs(demo.lineLengthM / semFator.lineLengthM - 1.163) < 0.01);
  });

  it('tem trecho entre toda estação vizinha, nos dois sentidos, e só entre vizinhas', () => {
    for (let index = 0; index < codes.length - 1; index += 1) {
      const a = codes[index];
      const b = codes[index + 1];
      const length = demo.segmentLengthM(a, b);
      assert.ok(length !== undefined && length > 400 && length < 2_000, `${a}-${b}: ${length} m`);
      assert.equal(demo.segmentLengthM(b, a), length);
    }
    // BRA e ITA não são vizinhas: há MAR entre elas.
    assert.equal(demo.segmentLengthM('BRA', 'ITA'), undefined);
  });

  it('a geometria é da linha: a malha de outro cliente tem os trechos dela', () => {
    const outra = operationFor(otherTenantCatalog());
    // Código que não existe na outra malha não tem trecho lá, e vice-versa.
    assert.equal(outra.segmentLengthM('BRA', 'MAR'), undefined);
    assert.equal(demo.segmentLengthM('JAB', 'CNC'), undefined);
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
      demo.segmentRunTimeMs('BRA', 'MAR', 20) > 2 * demo.segmentRunTimeMs('BRA', 'MAR', LINE_SPEED_KMH),
    );
  });

  it('percursos reais entre estações ficam entre 40 s e 2 min', () => {
    for (let index = 0; index < codes.length - 1; index += 1) {
      const time = demo.segmentRunTimeMs(codes[index], codes[index + 1], LINE_SPEED_KMH);
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
    assert.equal(demo.dwellTimeMs('HGM'), TRANSFER_DWELL_MS);
    assert.equal(demo.dwellTimeMs('MAR'), DWELL_MS);
  });

  it('reconhece os terminais', () => {
    assert.equal(demo.isTerminal('BRA'), true);
    assert.equal(demo.isTerminal('SJQ'), true);
    assert.equal(demo.isTerminal('HGM'), false);
    // Estação de outra linha não é terminal desta.
    assert.equal(demo.isTerminal('JAB'), false);
  });

  it('segue a ordem do traçado em cada sentido e para no fim da linha', () => {
    assert.equal(demo.nextStationCode('PDZ', 1), 'PUC');
    assert.equal(demo.nextStationCode('PDZ', -1), 'POM');
    assert.equal(demo.nextStationCode('SJQ', 1), undefined);
    assert.equal(demo.nextStationCode('BRA', -1), undefined);
    assert.equal(demo.nextStationCode('XYZ', 1), undefined);
  });

  it('inverte o sentido só ao chegar a um terminal', () => {
    assert.equal(demo.directionAfterArrival('SJQ', 1), -1);
    assert.equal(demo.directionAfterArrival('BRA', -1), 1);
    assert.equal(demo.directionAfterArrival('HGM', 1), 1);
  });

  it('nomeia os sentidos pelos terminais da linha, não por ponto cardeal', () => {
    assert.deepEqual(demo.directionLabels, {
      1: 'sentido São Joaquim',
      [-1]: 'sentido Brasilândia',
    });
    assert.deepEqual(operationFor(otherTenantCatalog()).directionLabels, {
      1: 'sentido São Judas',
      [-1]: 'sentido Jabaquara',
    });
  });
});

describe('Operação — ciclo da frota', () => {
  it('uma volta completa leva entre 40 e 60 minutos', () => {
    const minutes = demo.cycleTimeMs() / 60_000;
    assert.ok(minutes > 40 && minutes < 60, `ciclo de ${minutes.toFixed(1)} min`);
  });

  it('a 20 km/h a volta fica bem mais longa', () => {
    assert.ok(demo.cycleTimeMs(20) > 1.5 * demo.cycleTimeMs());
  });

  it('a volta de uma linha curta é bem menor que a da linha semeada', () => {
    assert.ok(operationFor(otherTenantCatalog()).cycleTimeMs() < demo.cycleTimeMs());
  });
});
