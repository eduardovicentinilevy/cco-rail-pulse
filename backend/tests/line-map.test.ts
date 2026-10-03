import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LINHA_UNI_SEED } from '../infrastructure/database/seeds/linha-uni';
import { linhaUniCatalog, otherTenantCatalog } from './helpers/catalog';

/**
 * O mapa do frontend posiciona cada estação pela coordenada normalizada que vem
 * do catálogo. Se a malha ganhar ou perder uma estação sem que as coordenadas
 * acompanhem, a composição some do traçado — estes testes travam o contrato.
 */
describe('Contrato do catálogo da malha', () => {
  const catalog = linhaUniCatalog();

  it('expõe códigos na mesma ordem das estações', () => {
    assert.deepEqual([...catalog.codes], catalog.stations.map((station) => station.code));
  });

  it('mantém códigos com exatamente 3 caracteres', () => {
    for (const station of catalog.stations) {
      assert.equal(station.code.length, 3, `${station.code} deveria ter 3 caracteres`);
    }
  });

  it('associa cada estação a uma subestação de tração', () => {
    for (const station of catalog.stations) {
      assert.match(station.substation, /^TSS-\d{2}$/, `${station.code} sem subestação válida`);
    }
  });

  it('mantém as tensões nominais em faixa plausível de catenária', () => {
    for (const station of catalog.stations) {
      assert.ok(
        station.nominalVoltageKV >= 20 && station.nominalVoltageKV <= 26,
        `${station.code} com tensão nominal fora da faixa: ${station.nominalVoltageKV}`,
      );
    }
  });

  it('dá a toda estação uma coordenada normalizada entre 0 e 1', () => {
    for (const station of catalog.stations) {
      assert.ok(station.mapX != null && station.mapY != null, `${station.code} sem coordenada de mapa`);
      assert.ok(station.mapX >= 0 && station.mapX <= 1, `${station.code} com mapX fora de 0–1: ${station.mapX}`);
      assert.ok(station.mapY >= 0 && station.mapY <= 1, `${station.code} com mapY fora de 0–1: ${station.mapY}`);
    }
  });

  it('avança monotonicamente ao longo do traçado', () => {
    const xs = catalog.stations.map((station) => station.mapX ?? 0);
    for (let index = 1; index < xs.length; index += 1) {
      assert.ok(xs[index] > xs[index - 1], `${catalog.codes[index]} não avança no traçado`);
    }
  });
});

describe('Semeadura da Linha Uni', () => {
  it('descreve um cliente com ao menos uma linha', () => {
    assert.ok(LINHA_UNI_SEED.lines.length >= 1);
    assert.equal(LINHA_UNI_SEED.slug, 'linha-uni');
  });

  it('não repete posição nem código dentro da linha', () => {
    for (const line of LINHA_UNI_SEED.lines) {
      assert.equal(new Set(line.stations.map((s) => s.code)).size, line.stations.length);
      assert.equal(new Set(line.stations.map((s) => s.position)).size, line.stations.length);
    }
  });
});

describe('Isolamento entre catálogos', () => {
  it('duas linhas coexistem sem compartilhar estações', () => {
    const uni = linhaUniCatalog();
    const outro = otherTenantCatalog();

    assert.notEqual(uni.id, outro.id);
    assert.notEqual(uni.tenantId, outro.tenantId);

    const compartilhados = uni.codes.filter((code) => outro.has(code));
    assert.deepEqual(compartilhados, [], 'nenhum código deveria valer nas duas malhas');
  });

  it('indexOf de uma estação de outra linha devolve -1 em vez de um índice errado', () => {
    assert.equal(linhaUniCatalog().indexOf('JAB'), -1);
  });
});
