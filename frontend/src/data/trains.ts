// frontend/src/data/trains.ts
import type { Direction, Train, TrainPhase, TrainStatus } from '../types';
import { isFiniteNumber } from './stations';

const TRAIN_STATUSES: readonly TrainStatus[] = ['NORMAL', 'ATENÇÃO', 'EMERGÊNCIA'];
const TRAIN_PHASES: readonly TrainPhase[] = ['PLATAFORMA', 'RETIDO', 'EM_MARCHA', 'PARADO_ENTRE_ESTACOES', 'IMOBILIZADO'];

export const PHASE_LABELS: Record<TrainPhase, string> = {
  PLATAFORMA: 'Na plataforma',
  RETIDO: 'Retido',
  EM_MARCHA: 'Em marcha',
  PARADO_ENTRE_ESTACOES: 'Parado entre estações',
  IMOBILIZADO: 'Imobilizado',
};

/** Cor de status da situação — mesma escala dos alarmes (NORMAL/ATENÇÃO/CRÍTICO). */
export const PHASE_STATUS: Record<TrainPhase, 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO'> = {
  PLATAFORMA: 'NORMAL',
  EM_MARCHA: 'NORMAL',
  RETIDO: 'ATENÇÃO',
  PARADO_ENTRE_ESTACOES: 'CRÍTICO',
  IMOBILIZADO: 'CRÍTICO',
};

/**
 * Seta no sentido do mapa: 1 aponta para o último terminal do traçado (à direita),
 * -1 para o primeiro. Quem nomeia cada sentido é a malha da sessão, não este módulo.
 */
export const directionArrow = (direction: Direction): string => (direction === 1 ? '▶' : '◀');

const isDirection = (value: unknown): value is Direction => value === 1 || value === -1;

/** Situação derivada quando um backend antigo não a envia. */
const derivePhase = (status: TrainStatus, moving: boolean): TrainPhase => {
  if (status === 'EMERGÊNCIA') return 'IMOBILIZADO';
  return moving ? 'EM_MARCHA' : 'PLATAFORMA';
};

/**
 * Converte um snapshot de composição (REST ou WebSocket) no modelo do painel.
 * Campos ausentes ou malformados — de outra versão do backend — viram valores
 * neutros, nunca `undefined` na interface. `syncedAt` marca a chegada para a
 * animação andar no relógio do navegador, sem depender do relógio do servidor.
 */
export const normalizeTrain = (raw: unknown, syncedAt: number = performance.now()): Train | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.trainId !== 'string' || typeof data.currentStationCode !== 'string') return null;

  const status = TRAIN_STATUSES.includes(data.status as TrainStatus) ? (data.status as TrainStatus) : 'NORMAL';
  const nextStationCode = typeof data.nextStationCode === 'string' ? data.nextStationCode : null;

  const rawMovement = data.movement as { progress?: unknown; remainingMs?: unknown } | null | undefined;
  const movement =
    nextStationCode && rawMovement && typeof rawMovement === 'object'
      ? {
          progress: isFiniteNumber(rawMovement.progress) ? Math.min(1, Math.max(0, rawMovement.progress)) : 0,
          remainingMs: isFiniteNumber(rawMovement.remainingMs) ? Math.max(0, rawMovement.remainingMs) : null,
        }
      : null;

  return {
    trainId: data.trainId,
    currentStationCode: data.currentStationCode,
    speedKmH: isFiniteNumber(data.speedKmH) ? data.speedKmH : 0,
    voltageV: isFiniteNumber(data.voltageV) ? data.voltageV : 0,
    status,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    direction: isDirection(data.direction) ? data.direction : 1,
    phase: TRAIN_PHASES.includes(data.phase as TrainPhase)
      ? (data.phase as TrainPhase)
      : derivePhase(status, movement?.remainingMs != null),
    nextStationCode: movement ? nextStationCode : null,
    holdReason: typeof data.holdReason === 'string' ? data.holdReason : null,
    movement,
    syncedAt,
  };
};

export const normalizeTrains = (raw: unknown, syncedAt: number = performance.now()): Train[] =>
  Array.isArray(raw) ? raw.map((item) => normalizeTrain(item, syncedAt)).filter((t): t is Train => t !== null) : [];

/**
 * Fração percorrida do trecho em `now` (relógio do `performance.now()`).
 * Linear no tempo, como no servidor — assim uma parada no meio do trecho não "pula".
 */
export const trainProgress = (train: Train, now: number): number => {
  const movement = train.movement;
  if (!movement) return 0;
  if (movement.remainingMs === null) return movement.progress;
  if (movement.remainingMs <= 0) return 1;
  const fraction = Math.min(1, Math.max(0, (now - train.syncedAt) / movement.remainingMs));
  return movement.progress + (1 - movement.progress) * fraction;
};

/** O trem está se deslocando agora (marcha não suspensa e trecho ainda não concluído)? */
export const isTrainMoving = (train: Train, now: number): boolean =>
  train.movement !== null && train.movement.remainingMs !== null && trainProgress(train, now) < 1;
