import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ALARM_SEVERITIES, isAlarmSeverity } from '../domain/alarms';
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  isCommunicationChannel,
  isCommunicationDirection,
} from '../domain/communications';
import { PROCEDURE_CATEGORIES, PROCEDURE_CATEGORY_LABELS, isProcedureCategory } from '../domain/procedures';

describe('Alarmes — validação de severidade', () => {
  it('aceita as severidades conhecidas', () => {
    for (const severity of ALARM_SEVERITIES) {
      assert.equal(isAlarmSeverity(severity), true);
    }
  });

  it('rejeita valores desconhecidos ou de tipo errado', () => {
    assert.equal(isAlarmSeverity('URGENT'), false);
    assert.equal(isAlarmSeverity('critical'), false);
    assert.equal(isAlarmSeverity(undefined), false);
    assert.equal(isAlarmSeverity(3), false);
  });
});

describe('Comunicações — validação de canal e sentido', () => {
  it('aceita os canais e sentidos conhecidos', () => {
    for (const channel of COMMUNICATION_CHANNELS) {
      assert.equal(isCommunicationChannel(channel), true);
    }
    for (const direction of COMMUNICATION_DIRECTIONS) {
      assert.equal(isCommunicationDirection(direction), true);
    }
  });

  it('rejeita canal e sentido desconhecidos', () => {
    assert.equal(isCommunicationChannel('WHATSAPP'), false);
    assert.equal(isCommunicationChannel(null), false);
    assert.equal(isCommunicationDirection('INDEFINIDA'), false);
  });
});

describe('Procedimentos — validação de categoria', () => {
  it('aceita as categorias conhecidas e cada uma tem rótulo', () => {
    for (const category of PROCEDURE_CATEGORIES) {
      assert.equal(isProcedureCategory(category), true);
      assert.equal(typeof PROCEDURE_CATEGORY_LABELS[category], 'string');
      assert.ok(PROCEDURE_CATEGORY_LABELS[category].length > 0);
    }
  });

  it('rejeita categoria desconhecida', () => {
    assert.equal(isProcedureCategory('OUTROS'), false);
    assert.equal(isProcedureCategory(undefined), false);
  });
});
