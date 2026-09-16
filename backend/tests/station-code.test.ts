import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { StationCode } from '../domain/value-objects/StationCode';
import { LINE_STATIONS, findStation, isKnownStation } from '../domain/line';
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

  it('aceita o código alfanumérico 14B', () => {
    assert.equal(new StationCode('14b').getValue(), '14B');
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
  });

  it('não repete códigos', () => {
    assert.equal(new Set(LINE_STATIONS.map((s) => s.code)).size, LINE_STATIONS.length);
  });

  it('busca estação sem diferenciar caixa ou espaços', () => {
    assert.equal(findStation('  fgo ')?.name, 'Freguesia do Ó');
    assert.equal(isKnownStation('sjq'), true);
    assert.equal(isKnownStation('ZZZ'), false);
  });
});
