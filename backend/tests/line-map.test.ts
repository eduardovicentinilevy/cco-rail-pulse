import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TRACTION_NOMINAL_V, VOLTAGE_CRITICAL_V, VOLTAGE_WARNING_V, classifyVoltage } from '../domain/line';
import { DEMO_TENANT_SEED } from '../infrastructure/database/seeds/linha-uni';
import { demoCatalog, otherTenantCatalog } from './helpers/catalog';

/**
 * O mapa do frontend posiciona cada estação pelas coordenadas que vêm do
 * catálogo. Se a malha ganhar ou perder uma estação sem que as coordenadas
 * acompanhem, a composição some do traçado — estes testes travam o contrato.
 */
describe('Contrato do catálogo da malha', () => {
  const catalog = demoCatalog();

  it('expõe códigos na mesma ordem das estações', () => {
    assert.deepEqual([...catalog.codes], catalog.stations.map((station) => station.code));
  });

  it('mantém códigos com exatamente 3 caracteres', () => {
    for (const station of catalog.stations) {
      assert.equal(station.code.length, 3, `${station.code} deveria ter 3 caracteres`);
    }
  });

  it('associa cada estação a uma subestação retificadora', () => {
    for (const station of catalog.stations) {
      assert.match(station.substation, /^SR-\d{2}$/, `${station.code} sem subestação válida`);
    }
  });

  it('mantém as tensões de referência em faixa plausível de terceiro trilho 750 Vcc', () => {
    for (const station of catalog.stations) {
      assert.ok(
        station.nominalVoltageV >= 500 && station.nominalVoltageV <= 900,
        `${station.code} com tensão fora da faixa: ${station.nominalVoltageV}`,
      );
    }
  });

  /**
   * O mapa desenha a estação pela coordenada geográfica quando ela existe, e pela
   * coordenada normalizada do cadastro quando não. Sem nenhuma das duas a estação
   * cai num eixo reto — aparece, mas não no lugar dela.
   */
  it('dá a toda estação uma posição desenhável', () => {
    for (const station of catalog.stations) {
      const geographic = station.lat != null && station.lon != null;
      const schematic = station.mapX != null && station.mapY != null;
      assert.ok(geographic || schematic, `${station.code} sem coordenada nenhuma`);
      if (geographic) {
        assert.ok(station.lat! >= -90 && station.lat! <= 90, `${station.code} com latitude inválida`);
        assert.ok(station.lon! >= -180 && station.lon! <= 180, `${station.code} com longitude inválida`);
      }
      if (schematic) {
        assert.ok(station.mapX! >= 0 && station.mapX! <= 1, `${station.code} com mapX fora de 0–1`);
        assert.ok(station.mapY! >= 0 && station.mapY! <= 1, `${station.code} com mapY fora de 0–1`);
      }
    }
  });

  it('não repete coordenada entre estações vizinhas', () => {
    for (let index = 1; index < catalog.stations.length; index += 1) {
      const previous = catalog.stations[index - 1];
      const station = catalog.stations[index];
      assert.ok(
        previous.lat !== station.lat || previous.lon !== station.lon,
        `${station.code} na mesma coordenada de ${previous.code}`,
      );
    }
  });
});

describe('Semeadura do cliente de demonstração', () => {
  it('descreve um cliente com ao menos uma linha', () => {
    assert.ok(DEMO_TENANT_SEED.lines.length >= 1);
    assert.equal(DEMO_TENANT_SEED.slug, 'linha-uni');
  });

  it('não repete posição nem código dentro da linha', () => {
    for (const line of DEMO_TENANT_SEED.lines) {
      assert.equal(new Set(line.stations.map((s) => s.code)).size, line.stations.length);
      assert.equal(new Set(line.stations.map((s) => s.position)).size, line.stations.length);
    }
  });
});

describe('Isolamento entre catálogos', () => {
  it('duas linhas coexistem sem compartilhar estações', () => {
    const uni = demoCatalog();
    const outro = otherTenantCatalog();

    assert.notEqual(uni.id, outro.id);
    assert.notEqual(uni.tenantId, outro.tenantId);

    const compartilhados = uni.codes.filter((code) => outro.has(code));
    assert.deepEqual(compartilhados, [], 'nenhum código deveria valer nas duas malhas');
  });

  it('indexOf de uma estação de outra linha devolve -1 em vez de um índice errado', () => {
    assert.equal(demoCatalog().indexOf('JAB'), -1);
  });
});

describe('Classificação de tensão do terceiro trilho', () => {
  it('ordena os limiares abaixo da tensão nominal', () => {
    assert.ok(VOLTAGE_CRITICAL_V < VOLTAGE_WARNING_V);
    assert.ok(VOLTAGE_WARNING_V < TRACTION_NOMINAL_V);
  });

  it('classifica nas bordas dos limiares', () => {
    assert.equal(classifyVoltage(TRACTION_NOMINAL_V), 'NORMAL');
    assert.equal(classifyVoltage(VOLTAGE_WARNING_V), 'NORMAL');
    assert.equal(classifyVoltage(VOLTAGE_WARNING_V - 0.1), 'ATENÇÃO');
    assert.equal(classifyVoltage(VOLTAGE_CRITICAL_V), 'ATENÇÃO');
    assert.equal(classifyVoltage(VOLTAGE_CRITICAL_V - 0.1), 'CRÍTICO');
  });
});
