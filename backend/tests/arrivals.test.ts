import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TrainSession } from '../domain/entities/TrainSession';
import { PLATFORM_CLEARANCE_MS, predictArrivals } from '../domain/arrivals';
import { LINE_SPEED_KMH, operationFor } from '../domain/operation';
import type { Direction } from '../domain/operation';
import { demoCatalog } from './helpers/catalog';

const operation = operationFor(demoCatalog());
const segmentRunTimeMs = (from: string, to: string, speed: number) => operation.segmentRunTimeMs(from, to, speed);
const dwellTimeMs = (code: string) => operation.dwellTimeMs(code);

const NOW = new Date('2026-11-05T12:00:00Z');

const atPlatform = (id: string, station: string, direction: Direction, status: 'NORMAL' | 'EMERGÊNCIA' = 'NORMAL') =>
  new TrainSession(id, station, 0, 750, status, NOW, { direction });

const board = (fleet: TrainSession[], dwellRemaining = 0, timeScale = 1) =>
  predictArrivals(fleet, NOW, { operation, timeScale, dwellRemainingMs: () => dwellRemaining });

describe('Previsão de chegadas', () => {
  it('trem na plataforma aparece com ETA zero na própria estação', () => {
    const agb = board([atPlatform('T-01', 'AGB', 1)]).find((s) => s.stationCode === 'AGB')!;
    assert.deepEqual(agb.byDirection[1][0], { trainId: 'T-01', etaMs: 0, atPlatform: true, held: false });
  });

  it('projeta a próxima estação pelo tempo de parada mais o percurso', () => {
    const dwell = 10_000;
    const pom = board([atPlatform('T-01', 'AGB', 1)], dwell).find((s) => s.stationCode === 'POM')!;
    assert.equal(pom.byDirection[1][0].etaMs, dwell + segmentRunTimeMs('AGB', 'POM', LINE_SPEED_KMH));
  });

  it('acumula paradas intermediárias', () => {
    const pdz = board([atPlatform('T-01', 'AGB', 1)]).find((s) => s.stationCode === 'PDZ')!;
    const expected =
      segmentRunTimeMs('AGB', 'POM', LINE_SPEED_KMH) + dwellTimeMs('POM') + segmentRunTimeMs('POM', 'PDZ', LINE_SPEED_KMH);
    assert.equal(pdz.byDirection[1][0].etaMs, expected);
  });

  it('no terminal, lista o trem no sentido em que ele vai partir', () => {
    const sjq = board([atPlatform('T-01', 'BLV', 1)]).find((s) => s.stationCode === 'SJQ')!;
    assert.equal(sjq.byDirection[1].length, 0);
    assert.equal(sjq.byDirection[-1][0].trainId, 'T-01');
  });

  it('ordena por ETA e limita a duas composições por sentido', () => {
    const fleet = [atPlatform('T-01', 'BRA', 1), atPlatform('T-04', 'ITA', 1), atPlatform('T-07', 'MAR', 1)];
    const jpi = board(fleet).find((s) => s.stationCode === 'JPI')!;
    assert.deepEqual(
      jpi.byDirection[1].map((p) => p.trainId),
      ['T-04', 'T-07'],
    );
  });

  it('respeita a separação por bloco entre duas chegadas no mesmo sentido', () => {
    // T-04 está colado atrás do T-01: a projeção crua os faria chegar quase juntos.
    const fleet = [atPlatform('T-01', 'MAR', 1), atPlatform('T-04', 'BRA', 1)];
    const ita = board(fleet).find((s) => s.stationCode === 'ITA')!.byDirection[1];
    assert.deepEqual(ita.map((p) => p.trainId), ['T-01', 'T-04']);
    assert.ok(ita[1].etaMs - ita[0].etaMs >= dwellTimeMs('ITA') + PLATFORM_CLEARANCE_MS);
  });

  it('não prevê trem imobilizado', () => {
    const result = board([atPlatform('T-01', 'AGB', 1, 'EMERGÊNCIA')]);
    assert.ok(result.every((s) => s.byDirection[1].length === 0 && s.byDirection[-1].length === 0));
  });

  it('o relógio acelerado encurta as ETAs na mesma proporção', () => {
    const real = board([atPlatform('T-01', 'AGB', 1)]).find((s) => s.stationCode === 'POM')!.byDirection[1][0].etaMs;
    const fast = board([atPlatform('T-01', 'AGB', 1)], 0, 10).find((s) => s.stationCode === 'POM')!.byDirection[1][0]
      .etaMs;
    assert.ok(Math.abs(fast - real / 10) <= 1);
  });
});
