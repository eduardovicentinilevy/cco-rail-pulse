import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LINE_STATIONS, LINE_STATION_CODES } from '../domain/line';

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

  it('associa cada estação a uma subestação de tração', () => {
    for (const station of LINE_STATIONS) {
      assert.match(station.substation, /^TSS-\d{2}$/, `${station.code} sem subestação válida`);
    }
  });

  it('mantém as tensões nominais em faixa plausível de catenária', () => {
    for (const station of LINE_STATIONS) {
      assert.ok(
        station.nominalVoltageKV >= 20 && station.nominalVoltageKV <= 26,
        `${station.code} com tensão nominal fora da faixa: ${station.nominalVoltageKV}`,
      );
    }
  });
});
