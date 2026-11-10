import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { StationCode } from '../domain/value-objects/StationCode';
import { LINE_STATIONS, LINE_SUBSTATIONS, LINE_TERMINALS, findStation, isKnownStation } from '../domain/line';
import { ValidationError } from '../shared/errors';

describe('StationCode', () => {
  it('normaliza para maiúsculas', () => {
    assert.equal(new StationCode('bra').getValue(), 'BRA');
  });

  it('rejeita vazio e comprimento diferente de 3', () => {
    assert.throws(() => new StationCode(''), ValidationError);
    assert.throws(() => new StationCode('BR'), ValidationError);
    assert.throws(() => new StationCode('BRAS'), ValidationError);
  });

  it('rejeita código fora da malha da Linha 6', () => {
    assert.throws(() => new StationCode('XYZ'), ValidationError);
  });

  it('aceita dígitos no formato — "14B" é a estação 14 Bis-Saracura', () => {
    assert.equal(new StationCode('14b').getValue(), '14B');
    assert.throws(() => new StationCode('1AB'), /não pertence à malha/);
    assert.throws(() => new StationCode('14'), /exatamente 3 caracteres/);
  });

  it('rejeita códigos da malha anterior (Linha 2)', () => {
    assert.throws(() => new StationCode('VMD'), ValidationError);
    assert.throws(() => new StationCode('PSO'), ValidationError);
  });

  it('compara por valor', () => {
    assert.equal(new StationCode('BRA').equals(new StationCode('bra')), true);
    assert.equal(new StationCode('BRA').equals(new StationCode('MAR')), false);
  });
});

describe('Catálogo da malha', () => {
  it('possui as 15 estações da Linha 6-Laranja', () => {
    assert.equal(LINE_STATIONS.length, 15);
  });

  it('mantém a ordem física contígua de Brasilândia a São Joaquim', () => {
    LINE_STATIONS.forEach((station, index) => assert.equal(station.order, index + 1));
    assert.equal(LINE_STATIONS[0].code, 'BRA');
    assert.equal(LINE_STATIONS.at(-1)?.code, 'SJQ');
    assert.deepEqual(LINE_TERMINALS, { west: 'Brasilândia', east: 'São Joaquim' });
  });

  it('não repete códigos', () => {
    assert.equal(new Set(LINE_STATIONS.map((s) => s.code)).size, LINE_STATIONS.length);
  });

  it('busca estação sem diferenciar caixa ou espaços', () => {
    assert.equal(findStation('  mar ')?.name, 'Maristela');
    assert.equal(isKnownStation('sjq'), true);
    assert.equal(isKnownStation('ZZZ'), false);
  });

  it('registra as integrações com outras linhas', () => {
    assert.deepEqual(findStation('AGB')?.connections, ['CPTM L7-Rubi']);
    assert.deepEqual(findStation('HGM')?.connections, ['L4-Amarela']);
    assert.deepEqual(findStation('SJQ')?.connections, ['L1-Azul']);
    assert.equal(LINE_STATIONS.filter((station) => station.connections.length > 0).length, 3);
  });

  it('alimenta a linha por oito subestações retificadoras, em ordem', () => {
    assert.deepEqual(LINE_SUBSTATIONS, ['SR-01', 'SR-02', 'SR-03', 'SR-04', 'SR-05', 'SR-06', 'SR-07', 'SR-08']);
    assert.equal(findStation('ITA')?.substation, 'SR-02');
  });
});
