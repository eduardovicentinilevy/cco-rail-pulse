import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TrainSession } from '../domain/entities/TrainSession';
import type { TrainStatus } from '../domain/entities/TrainSession';
import { blockedReason, noPowerReason, planTrain } from '../domain/dispatch';
import type { DispatchContext } from '../domain/dispatch';
import type { Direction } from '../domain/operation';

const NOW = new Date('2026-11-05T12:00:00Z');

const train = (
  id: string,
  station: string,
  direction: Direction,
  options: { status?: TrainStatus; to?: string; remainingMs?: number | null; progress?: number; hold?: string; speed?: number } = {},
) =>
  new TrainSession(id, station, options.speed ?? 0, 750, options.status ?? 'NORMAL', NOW, {
    direction,
    holdReason: options.hold ?? null,
    motion: options.to
      ? {
          toStationCode: options.to,
          progress: options.progress ?? 0,
          progressAt: NOW,
          remainingMs: options.remainingMs === undefined ? 60_000 : options.remainingMs,
        }
      : null,
  });

const context = (overrides: Partial<DispatchContext> = {}): DispatchContext => ({
  now: NOW,
  dwellUntil: () => undefined,
  isEnergized: () => true,
  ...overrides,
});

describe('Despacho — partida da plataforma', () => {
  it('parte para a próxima estação no sentido de circulação', () => {
    const t = train('T-01', 'AGB', 1);
    assert.deepEqual(planTrain(t, [t], context()), { type: 'DEPART', toStationCode: 'POM' });
  });

  it('espera o fim da parada antes de partir', () => {
    const t = train('T-01', 'AGB', 1);
    const ctx = context({ dwellUntil: () => NOW.getTime() + 5_000 });
    assert.deepEqual(planTrain(t, [t], ctx), { type: 'NONE' });
  });

  it('zera velocidade residual durante a parada', () => {
    const t = train('T-01', 'AGB', 1, { speed: 45 });
    const ctx = context({ dwellUntil: () => NOW.getTime() + 5_000 });
    assert.deepEqual(planTrain(t, [t], ctx), { type: 'SETTLE' });
  });

  it('ignora composição em estação fora da malha, em vez de inverter o sentido sem fim', () => {
    const t = train('T-99', 'VMD', 1);
    assert.deepEqual(planTrain(t, [t], context()), { type: 'NONE' });
  });

  it('inverte o sentido quando está no terminal virado para fora da linha', () => {
    const t = train('T-01', 'BRA', -1);
    assert.deepEqual(planTrain(t, [t], context()), { type: 'REVERSE' });
  });
});

describe('Despacho — separação por bloco', () => {
  it('retém quando há trem parado na plataforma de destino, no mesmo sentido', () => {
    const follower = train('T-01', 'AGB', 1);
    const leader = train('T-04', 'POM', 1);
    assert.deepEqual(planTrain(follower, [follower, leader], context()), {
      type: 'HOLD',
      reason: blockedReason(leader),
    });
  });

  it('retém quando o trem da frente ainda está a caminho do mesmo destino', () => {
    const follower = train('T-01', 'AGB', 1);
    const leader = train('T-04', 'AGB', 1, { to: 'POM' });
    assert.equal(planTrain(follower, [follower, leader], context()).type, 'HOLD');
  });

  it('não se incomoda com trem no sentido oposto — cada sentido tem a própria via', () => {
    const t = train('T-01', 'AGB', 1);
    const opposite = train('T-04', 'POM', -1);
    assert.equal(planTrain(t, [t, opposite], context()).type, 'DEPART');
  });

  it('um trem imobilizado à frente segura a fila', () => {
    const follower = train('T-01', 'AGB', 1);
    const halted = train('T-04', 'POM', 1, { status: 'EMERGÊNCIA' });
    assert.equal(planTrain(follower, [follower, halted], context()).type, 'HOLD');
  });

  it('não repete a retenção se o motivo é o mesmo', () => {
    const leader = train('T-04', 'POM', 1);
    const follower = train('T-01', 'AGB', 1, { hold: blockedReason(leader) });
    assert.deepEqual(planTrain(follower, [follower, leader], context()), { type: 'NONE' });
  });

  it('parte assim que o bloco à frente libera', () => {
    const follower = train('T-01', 'AGB', 1, { hold: 'Aguardando via livre — T-04 à frente' });
    const leader = train('T-04', 'POM', 1, { to: 'PDZ' });
    assert.deepEqual(planTrain(follower, [follower, leader], context()), { type: 'DEPART', toStationCode: 'POM' });
  });
});

describe('Despacho — marcha e energia', () => {
  it('chega quando o tempo do trecho se esgota', () => {
    const t = train('T-01', 'AGB', 1, { to: 'POM', remainingMs: 0 });
    assert.deepEqual(planTrain(t, [t], context()), { type: 'ARRIVE' });
  });

  it('segue em marcha enquanto falta tempo', () => {
    const t = train('T-01', 'AGB', 1, { to: 'POM', remainingMs: 30_000 });
    assert.deepEqual(planTrain(t, [t], context()), { type: 'NONE' });
  });

  it('para no trecho se a seção perde tensão', () => {
    const t = train('T-01', 'AGB', 1, { to: 'POM' });
    const ctx = context({ isEnergized: (sr) => sr !== 'SR-04' });
    assert.deepEqual(planTrain(t, [t], ctx), { type: 'SUSPEND', reason: noPowerReason('SR-04') });
  });

  it('retoma quando a tensão volta', () => {
    const t = train('T-01', 'AGB', 1, { to: 'POM', remainingMs: null, hold: noPowerReason('SR-04') });
    assert.deepEqual(planTrain(t, [t], context()), { type: 'RESUME' });
  });

  it('não parte rumo a uma seção sem tensão', () => {
    const t = train('T-01', 'PUC', 1);
    const ctx = context({ isEnergized: (sr) => sr !== 'SR-06' });
    assert.deepEqual(planTrain(t, [t], ctx), { type: 'HOLD', reason: noPowerReason('SR-06') });
  });

  it('nada muda em trem imobilizado por frenagem de emergência', () => {
    const t = train('T-01', 'AGB', 1, { status: 'EMERGÊNCIA', to: 'POM', remainingMs: null });
    assert.deepEqual(planTrain(t, [t], context({ isEnergized: () => false })), { type: 'NONE' });
  });
});

describe('Despacho — regulação de intervalo', () => {
  const regulated = (lastDeparture: number | undefined) =>
    context({ lastDepartureAt: () => lastDeparture, minHeadwayMs: 120_000 });

  it('segura a partida até completar o intervalo desde o trem anterior', () => {
    const t = train('T-01', 'AGB', 1);
    const departedAt = NOW.getTime() - 30_000;
    assert.deepEqual(planTrain(t, [t], regulated(departedAt)), { type: 'REGULATE', untilMs: departedAt + 120_000 });
  });

  it('parte quando o intervalo já passou', () => {
    const t = train('T-01', 'AGB', 1);
    assert.equal(planTrain(t, [t], regulated(NOW.getTime() - 130_000)).type, 'DEPART');
  });

  it('sem partida anterior registrada, não há o que regular', () => {
    const t = train('T-01', 'AGB', 1);
    assert.equal(planTrain(t, [t], regulated(undefined)).type, 'DEPART');
  });

  it('bloco ocupado tem precedência sobre a regulação', () => {
    const follower = train('T-01', 'AGB', 1);
    const leader = train('T-04', 'POM', 1);
    assert.equal(planTrain(follower, [follower, leader], regulated(NOW.getTime())).type, 'HOLD');
  });
});
