import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PowerGrid } from '../application/services/PowerGrid';
import type { PowerSectionStore } from '../application/services/PowerGrid';
import { domainEventBus } from '../application/events/event-bus';
import type { PowerSectionRecord } from '../infrastructure/database/repositories/PowerSectionRepository';
import { ValidationError } from '../shared/errors';

const memoryStore = (initial: PowerSectionRecord[] = []): PowerSectionStore & { saved: PowerSectionRecord[] } => {
  const saved: PowerSectionRecord[] = [];
  return {
    saved,
    list: async () => initial,
    save: async (record) => {
      saved.push(record);
    },
  };
};

describe('PowerGrid — seções do terceiro trilho', () => {
  const events: string[] = [];
  const onPower = () => events.push('power');
  const onAlert = () => events.push('alert');

  afterEach(() => {
    domainEventBus.off('power:changed', onPower);
    domainEventBus.off('system:alert', onAlert);
    events.length = 0;
  });

  it('começa com todas as seções energizadas', () => {
    const grid = new PowerGrid(memoryStore());
    assert.ok(grid.snapshot().every((section) => section.energized));
    assert.equal(grid.isEnergized('SR-06'), true);
  });

  it('restaura do banco uma seção que estava desligada', async () => {
    const grid = new PowerGrid(
      memoryStore([{ substation: 'SR-03', energized: false, reason: 'Manutenção', changedBy: 'EDP-042', changedAt: new Date().toISOString() }]),
    );
    await grid.load();
    assert.equal(grid.isEnergized('SR-03'), false);
  });

  it('desenergiza com motivo, persiste e avisa o barramento', async () => {
    domainEventBus.on('power:changed', onPower);
    domainEventBus.on('system:alert', onAlert);
    const store = memoryStore();
    const grid = new PowerGrid(store);

    const result = await grid.setState({
      substation: 'sr-06',
      energized: false,
      reason: 'Troca do disjuntor extrarrápido',
      operatorId: 'EDP-042',
    });

    assert.equal(result?.energized, false);
    assert.deepEqual(result?.stationCodes, ['FAA', 'HGM']);
    assert.equal(grid.isEnergized('SR-06'), false);
    assert.equal(store.saved.length, 1);
    assert.deepEqual(events, ['power', 'alert']);
  });

  it('exige motivo para desenergizar', async () => {
    const grid = new PowerGrid(memoryStore());
    await assert.rejects(
      grid.setState({ substation: 'SR-01', energized: false, reason: 'curto', operatorId: 'EDP-042' }),
      ValidationError,
    );
    assert.equal(grid.isEnergized('SR-01'), true);
  });

  it('recusa subestação inexistente', async () => {
    const grid = new PowerGrid(memoryStore());
    await assert.rejects(
      grid.setState({ substation: 'SR-99', energized: false, reason: 'Motivo qualquer válido', operatorId: 'EDP-042' }),
      ValidationError,
    );
  });

  it('pedir o estado atual não grava nem notifica', async () => {
    domainEventBus.on('power:changed', onPower);
    const store = memoryStore();
    const grid = new PowerGrid(store);
    assert.equal(await grid.setState({ substation: 'SR-02', energized: true, reason: '', operatorId: 'EDP-042' }), null);
    assert.equal(store.saved.length, 0);
    assert.deepEqual(events, []);
  });
});
