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
    const pso = board([atPlatform('T-01', 'PSO', 1)]).find((s) => s.stationCode === 'PSO')!;
    assert.deepEqual(pso.byDirection[1][0], { trainId: 'T-01', etaMs: 0, atPlatform: true, held: false });
  });

  it('projeta a próxima estação pelo tempo de parada mais o percurso', () => {
    const dwell = 10_000;
    const anr = board([atPlatform('T-01', 'PSO', 1)], dwell).find((s) => s.stationCode === 'ANR')!;
    assert.equal(anr.byDirection[1][0].etaMs, dwell + segmentRunTimeMs('PSO', 'ANR', LINE_SPEED_KMH));
  });

  it('acumula paradas intermediárias', () => {
    const ckb = board([atPlatform('T-01', 'PSO', 1)]).find((s) => s.stationCode === 'CKB')!;
    const expected =
      segmentRunTimeMs('PSO', 'ANR', LINE_SPEED_KMH) + dwellTimeMs('ANR') + segmentRunTimeMs('ANR', 'CKB', LINE_SPEED_KMH);
    assert.equal(ckb.byDirection[1][0].etaMs, expected);
  });

  it('no terminal, lista o trem no sentido em que ele vai partir', () => {
    const vpt = board([atPlatform('T-01', 'TTI', 1)]).find((s) => s.stationCode === 'VPT')!;
    assert.equal(vpt.byDirection[1].length, 0);
    assert.equal(vpt.byDirection[-1][0].trainId, 'T-01');
  });

  it('ordena por ETA e limita a duas composições por sentido', () => {
    const fleet = [atPlatform('T-01', 'VMD', 1), atPlatform('T-04', 'CLI', 1), atPlatform('T-07', 'SUM', 1)];
    const cns = board(fleet).find((s) => s.stationCode === 'CNS')!;
    assert.deepEqual(
      cns.byDirection[1].map((p) => p.trainId),
      ['T-04', 'T-07'],
    );
  });

  it('respeita a separação por bloco entre duas chegadas no mesmo sentido', () => {
    // T-04 está colado atrás do T-01: a projeção crua os faria chegar quase juntos.
    const fleet = [atPlatform('T-01', 'SUM', 1), atPlatform('T-04', 'VMD', 1)];
    const cli = board(fleet).find((s) => s.stationCode === 'CLI')!.byDirection[1];
    assert.deepEqual(cli.map((p) => p.trainId), ['T-01', 'T-04']);
    assert.ok(cli[1].etaMs - cli[0].etaMs >= dwellTimeMs('CLI') + PLATFORM_CLEARANCE_MS);
  });

  it('não prevê trem imobilizado', () => {
    const result = board([atPlatform('T-01', 'PSO', 1, 'EMERGÊNCIA')]);
    assert.ok(result.every((s) => s.byDirection[1].length === 0 && s.byDirection[-1].length === 0));
  });

  it('o relógio acelerado encurta as ETAs na mesma proporção', () => {
    const real = board([atPlatform('T-01', 'PSO', 1)]).find((s) => s.stationCode === 'ANR')!.byDirection[1][0].etaMs;
    const fast = board([atPlatform('T-01', 'PSO', 1)], 0, 10).find((s) => s.stationCode === 'ANR')!.byDirection[1][0]
      .etaMs;
    assert.ok(Math.abs(fast - real / 10) <= 1);
  });
});
