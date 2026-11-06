// backend/domain/arrivals.ts
// Previsão de chegadas por estação e sentido, como no painel de passageiros e no
// quadro do CCO. Projeta cada composição adiante pela mesma marcha do simulador
// (tempos de percurso, paradas e manobras), sem considerar retenções futuras —
// por isso é uma previsão, recalculada a cada consulta.
import type { TrainSession } from './entities/TrainSession';
import { TERMINAL_TURNAROUND_MS } from './operation';
import type { Direction, LineOperation } from './operation';

export interface ArrivalPrediction {
  trainId: string;
  /** Tempo até a chegada, em ms de relógio (já com a aceleração da simulação). */
  etaMs: number;
  /** A composição já está parada nesta plataforma. */
  atPlatform: boolean;
  /** A composição está retida — a previsão não conta quanto tempo a retenção dura. */
  held: boolean;
}

export interface StationArrivals {
  stationCode: string;
  stationName: string;
  /** Próximas composições por sentido de partida da plataforma. */
  byDirection: Record<Direction, ArrivalPrediction[]>;
}

export interface ArrivalOptions {
  /** Marcha da linha consultada — a projeção percorre a malha dela, e só a dela. */
  operation: LineOperation;
  /** Aceleração do relógio da simulação (1 = tempo real). */
  timeScale: number;
  /** Quanto falta da parada na plataforma, em ms de relógio. */
  dwellRemainingMs: (trainId: string) => number;
  /** Quantas composições listar por estação e sentido. */
  perDirection?: number;
  /** Até onde projetar, em ms de tempo real de operação. */
  horizonMs?: number;
}

const DEFAULT_HORIZON_MS = 40 * 60_000;
/**
 * Tempo para a composição que sai liberar a plataforma (sair do bloco) antes que
 * a seguinte possa entrar. Duas chegadas no mesmo sentido nunca ficam mais
 * próximas que a parada da primeira mais este intervalo — é a separação por bloco.
 */
export const PLATFORM_CLEARANCE_MS = 15_000;

export const predictArrivals = (
  fleet: readonly TrainSession[],
  now: Date,
  options: ArrivalOptions,
): StationArrivals[] => {
  const scale = options.timeScale > 0 ? options.timeScale : 1;
  const horizon = (options.horizonMs ?? DEFAULT_HORIZON_MS) / scale;
  const perDirection = options.perDirection ?? 2;
  const operation = options.operation;
  const stations = operation.catalog.stations;

  const board = new Map<string, Record<Direction, ArrivalPrediction[]>>(
    stations.map((station) => [station.code, { 1: [], [-1]: [] }]),
  );
  const record = (stationCode: string, direction: Direction, prediction: ArrivalPrediction) => {
    board.get(stationCode)?.[direction].push(prediction);
  };

  for (const train of fleet) {
    // Imobilizada ou parada no meio do trecho: não há como prever quando volta a andar.
    if (train.status === 'EMERGÊNCIA') continue;
    if (train.motion && train.motion.remainingMs === null) continue;

    const speed = train.targetSpeedKmH;
    const held = train.holdReason !== null;
    let direction = train.direction;
    let station: string;
    let t: number;

    if (train.motion) {
      station = train.motion.toStationCode;
      t = train.remainingAt(now) ?? 0;
      direction = operation.directionAfterArrival(station, direction);
      record(station, direction, { trainId: train.trainId, etaMs: Math.round(t), atPlatform: false, held: false });
      t += (operation.isTerminal(station) ? TERMINAL_TURNAROUND_MS : operation.dwellTimeMs(station)) / scale;
    } else {
      station = train.currentStationCode;
      if (operation.nextStationCode(station, direction) === undefined) {
        // Parada no terminal ainda no sentido de chegada: inverte antes de partir.
        direction = -direction as Direction;
      }
      record(station, direction, { trainId: train.trainId, etaMs: 0, atPlatform: true, held });
      t = Math.max(0, options.dwellRemainingMs(train.trainId));
    }

    while (t <= horizon) {
      const next = operation.nextStationCode(station, direction);
      if (next === undefined) break;
      t += operation.segmentRunTimeMs(station, next, speed) / scale;
      station = next;
      direction = operation.directionAfterArrival(station, direction);
      if (t > horizon) break;
      record(station, direction, { trainId: train.trainId, etaMs: Math.round(t), atPlatform: false, held });
      t += (operation.isTerminal(station) ? TERMINAL_TURNAROUND_MS : operation.dwellTimeMs(station)) / scale;
    }
  }

  return stations.map((station) => {
    const entry = board.get(station.code)!;
    const minimumGap =
      ((operation.isTerminal(station.code) ? TERMINAL_TURNAROUND_MS : operation.dwellTimeMs(station.code)) +
        PLATFORM_CLEARANCE_MS) /
      scale;
    const top = (list: ArrivalPrediction[]) => {
      const sorted = [...list].sort((a, b) => a.etaMs - b.etaMs);
      // Quem vem atrás só ocupa a plataforma depois que a da frente a libera.
      for (let index = 1; index < sorted.length; index += 1) {
        const earliest = sorted[index - 1].etaMs + minimumGap;
        if (sorted[index].etaMs < earliest) sorted[index] = { ...sorted[index], etaMs: Math.round(earliest) };
      }
      return sorted.slice(0, perDirection);
    };
    return {
      stationCode: station.code,
      stationName: station.name,
      byDirection: { 1: top(entry[1]), [-1]: top(entry[-1]) },
    };
  });
};
