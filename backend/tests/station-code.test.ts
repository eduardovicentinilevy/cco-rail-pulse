import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { StationCode } from '../domain/value-objects/StationCode';
import { LINE_STATIONS, LINE_TERMINALS, findStation, isKnownStation } from '../domain/line';
import { ValidationError } from '../shared/errors';

describe('StationCode', () => {
  it('normaliza para maiúsculas', () => {
    assert.equal(new StationCode('vmd').getValue(), 'VMD');
  });

  it('rejeita vazio e comprimento diferente de 3', () => {
    assert.throws(() => new StationCode(''), ValidationError);
    assert.throws(() => new StationCode('VM'), ValidationError);
    assert.throws(() => new StationCode('VMDA'), ValidationError);
  });

  it('rejeita código fora da malha da Linha 2', () => {
    assert.throws(() => new StationCode('XYZ'), ValidationError);
  });

  it('rejeita códigos da malha anterior (Linha 6)', () => {
    assert.throws(() => new StationCode('BRA'), ValidationError);
    assert.throws(() => new StationCode('14B'), ValidationError);
  });

  it('compara por valor', () => {
    assert.equal(new StationCode('VMD').equals(new StationCode('vmd')), true);
    assert.equal(new StationCode('VMD').equals(new StationCode('SUM')), false);
  });
});

describe('Catálogo da malha', () => {
  it('possui as 14 estações da Linha 2-Verde', () => {
    assert.equal(LINE_STATIONS.length, 14);
  });

  it('mantém a ordem física contígua de Vila Madalena a Vila Prudente', () => {
    LINE_STATIONS.forEach((station, index) => assert.equal(station.order, index + 1));
    assert.equal(LINE_STATIONS[0].code, 'VMD');
    assert.equal(LINE_STATIONS.at(-1)?.code, 'VPT');
    assert.deepEqual(LINE_TERMINALS, { west: 'Vila Madalena', east: 'Vila Prudente' });
  });

  it('não repete códigos', () => {
    assert.equal(new Set(LINE_STATIONS.map((s) => s.code)).size, LINE_STATIONS.length);
  });

  it('busca estação sem diferenciar caixa ou espaços', () => {
    assert.equal(findStation('  pso ')?.name, 'Paraíso');
    assert.equal(isKnownStation('vpt'), true);
    assert.equal(isKnownStation('ZZZ'), false);
  });

  it('registra as integrações com outras linhas', () => {
    assert.deepEqual(findStation('PSO')?.connections, ['L1-Azul']);
    assert.deepEqual(findStation('CNS')?.connections, ['L4-Amarela']);
    assert.deepEqual(findStation('CKB')?.connections, ['L5-Lilás']);
    assert.deepEqual(findStation('TTI')?.connections, ['CPTM L10-Turquesa']);
    assert.deepEqual(findStation('VPT')?.connections, ['L15-Prata']);
  });
});
