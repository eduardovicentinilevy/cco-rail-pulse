import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { StationCode } from '../domain/value-objects/StationCode';
import { LineCatalog } from '../domain/line';
import { ValidationError } from '../shared/errors';
import { demoCatalog, otherTenantCatalog } from './helpers/catalog';

describe('StationCode', () => {
  it('normaliza para maiúsculas', () => {
    assert.equal(new StationCode('vmd').getValue(), 'VMD');
  });

  it('rejeita vazio e comprimento diferente de 3', () => {
    assert.throws(() => new StationCode(''), ValidationError);
    assert.throws(() => new StationCode('VM'), ValidationError);
    assert.throws(() => new StationCode('VMDA'), ValidationError);
  });

  it('aceita o código alfanumérico 14B', () => {
    assert.equal(new StationCode('14b').getValue(), '14B');
  });

  it('aceita qualquer código de 3 caracteres: pertencer à malha é pergunta do catálogo', () => {
    assert.doesNotThrow(() => new StationCode('XYZ'));
    // Dígitos valem no formato; o que recusa um código é a malha da linha.
    assert.doesNotThrow(() => new StationCode('1AB'));
    assert.throws(() => new StationCode('14'), /exatamente 3 caracteres/);
  });

  it('compara por valor', () => {
    assert.equal(new StationCode('VMD').equals(new StationCode('vmd')), true);
    assert.equal(new StationCode('VMD').equals(new StationCode('SUM')), false);
  });
});

describe('StationCode.inLine', () => {
  it('aceita um código da malha da linha', () => {
    assert.equal(StationCode.inLine('vmd', demoCatalog()).getValue(), 'VMD');
  });

  it('rejeita um código que não pertence à linha', () => {
    assert.throws(() => StationCode.inLine('XYZ', demoCatalog()), ValidationError);
  });

  /**
   * O ponto do multi-tenant: um código válido em uma linha não vale na outra.
   * Antes essa checagem consultava uma constante global, e portanto só sabia
   * responder por uma malha.
   */
  it('não aceita estação de outra linha', () => {
    const demo = demoCatalog();
    const outro = otherTenantCatalog();

    assert.throws(() => StationCode.inLine('VMD', outro), ValidationError);
    assert.throws(() => StationCode.inLine('JAB', demo), ValidationError);
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
  const catalog = demoCatalog();

  it('possui as 14 estações da linha semeada', () => {
    assert.equal(catalog.size, 14);
  });

  it('mantém a ordem física contígua de Vila Madalena a Vila Prudente', () => {
    catalog.stations.forEach((station, index) => assert.equal(station.position, index + 1));
    assert.equal(catalog.stations[0].code, 'VMD');
    assert.equal(catalog.stations.at(-1)?.code, 'VPT');
    assert.deepEqual(catalog.terminals, { first: 'Vila Madalena', last: 'Vila Prudente' });
  });

  it('não repete códigos', () => {
    assert.equal(new Set(catalog.codes).size, catalog.size);
  });

  it('busca estação sem diferenciar caixa ou espaços', () => {
    assert.equal(catalog.find('  pso ')?.name, 'Paraíso');
    assert.equal(catalog.has('vpt'), true);
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
      substation: 'SR-01',
      nominalVoltageV: 750,
      connections: [],
      headwaySeconds: null,
      mapX: null,
      mapY: null,
      lat: null,
      lon: null,
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

  it('registra as integrações com outras linhas', () => {
    assert.deepEqual(catalog.find('PSO')?.connections, ['L1-Azul']);
    assert.deepEqual(catalog.find('CNS')?.connections, ['L4-Amarela']);
    assert.deepEqual(catalog.find('CKB')?.connections, ['L5-Lilás']);
    assert.deepEqual(catalog.find('TTI')?.connections, ['CPTM L10-Turquesa']);
    assert.deepEqual(catalog.find('VPT')?.connections, ['L15-Prata']);
  });
});
