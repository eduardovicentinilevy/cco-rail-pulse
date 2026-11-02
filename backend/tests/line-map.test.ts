import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  LINE_STATIONS,
  LINE_STATION_CODES,
  TRACTION_NOMINAL_V,
  VOLTAGE_CRITICAL_V,
  VOLTAGE_WARNING_V,
  classifyVoltage,
} from '../domain/line';

/**
 * O mapa do frontend posiciona cada estação por código. Se a malha ganhar ou
 * perder uma estação sem que o mapa acompanhe, a composição some do traçado —
 * este teste trava o contrato do catálogo.
 */
describe('Contrato do catálogo da malha', () => {
  it('expõe códigos na mesma ordem das estações', () => {
    assert.deepEqual(LINE_STATION_CODES, LINE_STATIONS.map((station) => station.code));
  });

  it('mantém códigos com exatamente 3 caracteres', () => {
    for (const station of LINE_STATIONS) {
      assert.equal(station.code.length, 3, `${station.code} deveria ter 3 caracteres`);
    }
  });

  it('associa cada estação a uma subestação retificadora', () => {
    for (const station of LINE_STATIONS) {
      assert.match(station.substation, /^SR-\d{2}$/, `${station.code} sem subestação válida`);
    }
  });

  it('mantém as tensões de referência em faixa plausível de terceiro trilho 750 Vcc', () => {
    for (const station of LINE_STATIONS) {
      assert.ok(
        station.nominalVoltageV >= 500 && station.nominalVoltageV <= 900,
        `${station.code} com tensão fora da faixa: ${station.nominalVoltageV}`,
      );
    }
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
