import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { StationCode } from '../domain/value-objects/StationCode';
import { LineCatalog } from '../domain/line';
import { ValidationError } from '../shared/errors';
import { linhaUniCatalog, otherTenantCatalog } from './helpers/catalog';

describe('StationCode', () => {
  it('normaliza para maiúsculas', () => {
    assert.equal(new StationCode('bra').getValue(), 'BRA');
  });

  it('rejeita vazio e comprimento diferente de 3', () => {
    assert.throws(() => new StationCode(''), ValidationError);
    assert.throws(() => new StationCode('BR'), ValidationError);
    assert.throws(() => new StationCode('BRAS'), ValidationError);
  });

  it('aceita o código alfanumérico 14B', () => {
    assert.equal(new StationCode('14b').getValue(), '14B');
  });

  it('aceita qualquer código de 3 caracteres: pertencer à malha é pergunta do catálogo', () => {
    assert.doesNotThrow(() => new StationCode('XYZ'));
  });

  it('compara por valor', () => {
    assert.equal(new StationCode('BRA').equals(new StationCode('bra')), true);
    assert.equal(new StationCode('BRA').equals(new StationCode('MAR')), false);
  });
});

describe('StationCode.inLine', () => {
  it('aceita um código da malha da linha', () => {
    assert.equal(StationCode.inLine('bra', linhaUniCatalog()).getValue(), 'BRA');
  });

  it('rejeita um código que não pertence à linha', () => {
    assert.throws(() => StationCode.inLine('XYZ', linhaUniCatalog()), ValidationError);
  });

  /**
   * O ponto do multi-tenant: um código válido em uma linha não vale na outra.
   * Antes essa checagem consultava uma constante global, e portanto só sabia
   * responder por uma malha.
   */
  it('não aceita estação de outra linha', () => {
    const uni = linhaUniCatalog();
    const outro = otherTenantCatalog();

    assert.throws(() => StationCode.inLine('BRA', outro), ValidationError);
    assert.throws(() => StationCode.inLine('JAB', uni), ValidationError);
    assert.equal(StationCode.inLine('JAB', outro).getValue(), 'JAB');
  });

  it('nomeia a linha na mensagem de erro', () => {
    assert.throws(
      () => StationCode.inLine('ZZZ', otherTenantCatalog()),
      (error: unknown) => error instanceof ValidationError && error.message.includes('Linha 1-Azul'),
    );
  });
});

describe('Catálogo da malha', () => {
  const catalog = linhaUniCatalog();

  it('possui as 15 estações da Linha 6-Laranja', () => {
    assert.equal(catalog.size, 15);
  });

  it('mantém a ordem física contígua de Brasilândia a São Joaquim', () => {
    catalog.stations.forEach((station, index) => assert.equal(station.position, index + 1));
    assert.equal(catalog.stations[0].code, 'BRA');
    assert.equal(catalog.stations.at(-1)?.code, 'SJQ');
  });

  it('não repete códigos', () => {
    assert.equal(new Set(catalog.codes).size, catalog.size);
  });

  it('busca estação sem diferenciar caixa ou espaços', () => {
    assert.equal(catalog.find('  fgo ')?.name, 'Freguesia do Ó');
    assert.equal(catalog.has('sjq'), true);
    assert.equal(catalog.has('ZZZ'), false);
  });

  // Um SELECT sem ORDER BY devolveria as estações em qualquer ordem, e a ordem
  // física é o que o simulador de deslocamento usa para andar pela linha.
  it('ordena as estações por posição, mesmo recebendo-as fora de ordem', () => {
    const station = (code: string, position: number) => ({
      id: `sta-${code}`,
      position,
      code,
      name: code,
      substation: 'TSS-01',
      nominalVoltageKV: 24.6,
      headwaySeconds: null,
      mapX: null,
      mapY: null,
    });

    const embaralhado = new LineCatalog({ id: 'l', tenantId: 't', tenantName: 'T', code: 'L', name: 'L' }, [
      station('CCC', 3),
      station('AAA', 1),
      station('BBB', 2),
    ]);

    assert.deepEqual([...embaralhado.codes], ['AAA', 'BBB', 'CCC']);
    assert.equal(embaralhado.indexOf('BBB'), 1);
    assert.equal(embaralhado.at(2)?.code, 'CCC');
  });
});
