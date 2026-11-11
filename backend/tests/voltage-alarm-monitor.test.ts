import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALARM_HYSTERESIS_V,
  INITIAL_ALARM_STATE,
  VoltageAlarmMonitor,
  bandFor,
  evaluateReading,
} from '../application/services/VoltageAlarmMonitor';
import type { AlarmPointState } from '../application/services/VoltageAlarmMonitor';
import { domainEventBus } from '../application/events/event-bus';
import type { LineEvent, SystemAlert } from '../application/events/event-bus';
import { VOLTAGE_CRITICAL_V, VOLTAGE_WARNING_V } from '../domain/line';
import { demoCatalog, otherTenantCatalog } from './helpers/catalog';

const feed = (readings: number[], start: AlarmPointState = INITIAL_ALARM_STATE) => {
  let state = start;
  const transitions: string[] = [];
  for (const voltage of readings) {
    const result = evaluateReading(state, voltage);
    state = result.state;
    if (result.changed) transitions.push(state.status);
  }
  return { state, transitions };
};

describe('Alarme de tensão — máquina de estados', () => {
  it('um pico isolado não alarma (debounce)', () => {
    assert.deepEqual(feed([750, 690, 750, 748]).transitions, []);
  });

  it('subtensão sustentada alarma uma única vez', () => {
    assert.deepEqual(feed([690, 690, 688, 691, 689]).transitions, ['ATENÇÃO']);
  });

  it('cai direto para crítico quando a leitura despenca', () => {
    assert.deepEqual(feed([620, 618]).transitions, ['CRÍTICO']);
  });

  it('histerese: oscilar em torno de 700 V não fica disparando e limpando', () => {
    const { transitions } = feed([695, 695, 702, 698, 704, 699, 703, 701]);
    assert.deepEqual(transitions, ['ATENÇÃO']);
  });

  it('normaliza só acima do limiar mais a banda morta', () => {
    const attention: AlarmPointState = { status: 'ATENÇÃO', pending: null, count: 0 };
    assert.equal(bandFor(VOLTAGE_WARNING_V + ALARM_HYSTERESIS_V - 1, 'ATENÇÃO'), 'ATENÇÃO');
    assert.deepEqual(feed([715, 716], attention).transitions, ['NORMAL']);
  });

  it('crítico se recupera por etapas: atenção e depois normal', () => {
    const critical: AlarmPointState = { status: 'CRÍTICO', pending: null, count: 0 };
    assert.equal(bandFor(VOLTAGE_CRITICAL_V + 5, 'CRÍTICO'), 'CRÍTICO');
    assert.deepEqual(feed([680, 680, 730, 730], critical).transitions, ['ATENÇÃO', 'NORMAL']);
  });
});

describe('Alarme de tensão — monitor', () => {
  const catalog = demoCatalog();
  const received: SystemAlert[] = [];
  const lines: string[] = [];
  const listener = ({ lineId, payload }: LineEvent<SystemAlert>) => {
    lines.push(lineId);
    received.push(payload);
  };

  afterEach(() => {
    domainEventBus.off('system:alert', listener);
    received.length = 0;
    lines.length = 0;
  });

  it('publica alarme crítico de seção sem tensão e a normalização', () => {
    domainEventBus.on('system:alert', listener);
    const monitor = new VoltageAlarmMonitor(catalog);
    for (const voltage of [0, 0, 0, 748, 750]) {
      monitor.observe({ stationId: 'sta-l6-ita', currentStationCode: 'ITA', voltageV: voltage, status: 'NORMAL' });
    }

    assert.equal(received.length, 2);
    assert.equal(received[0].severity, 'CRITICAL');
    assert.match(received[0].message, /sem tensão/);
    assert.match(received[0].message, /SR-02/);
    assert.equal(received[1].severity, 'INFO');
    assert.equal(monitor.statusOf('ITA'), 'NORMAL');
    // Todo alarme sai carimbado com a linha: o painel de outro cliente não o recebe.
    assert.deepEqual(lines, [catalog.id, catalog.id]);
  });

  it('nomeia a subestação da própria malha, não a homônima de outro cliente', () => {
    domainEventBus.on('system:alert', listener);
    // 'SPO' existe só na outra malha, alimentada pela SR-A2.
    const outro = new VoltageAlarmMonitor(otherTenantCatalog());
    for (const voltage of [600, 600]) {
      outro.observe({ stationId: 'sta-m1-spo', currentStationCode: 'SPO', voltageV: voltage, status: 'NORMAL' });
    }

    assert.equal(received.length, 1);
    assert.match(received[0].message, /SR-A2 \/ São Judas \(SPO\)/);
    assert.deepEqual(lines, [otherTenantCatalog().id]);
  });

  it('ignora leitura inválida', () => {
    domainEventBus.on('system:alert', listener);
    const monitor = new VoltageAlarmMonitor(catalog);
    monitor.observe({ stationId: 'sta-l6-bra', currentStationCode: 'BRA', voltageV: Number.NaN, status: 'NORMAL' });
    monitor.observe({ stationId: 'sta-l6-bra', currentStationCode: 'BRA', voltageV: Number.NaN, status: 'NORMAL' });
    assert.equal(received.length, 0);
  });
});
