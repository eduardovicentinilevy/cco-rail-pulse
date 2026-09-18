// backend/application/services/TrainMotionSimulator.ts
import { LINE_STATION_CODES } from '../../domain/line';
import { withTransaction } from '../../infrastructure/database/postgres';
import { TrainRepository } from '../../infrastructure/database/repositories/TrainRepository';
import { domainEventBus } from '../events/event-bus';
import { createLogger } from '../../shared/logger';

const logger = createLogger('TRAIN-MOTION');

export type Direction = 1 | -1;

/**
 * Sentido do próximo passo, dado o índice corrente e o sentido anterior.
 * Extraída à parte por ser a única regra não trivial do simulador — o resto é I/O.
 */
export const nextDirection = (currentIndex: number, maxIndex: number, previous: Direction): Direction => {
  if (currentIndex <= 0) return 1;
  if (currentIndex >= maxIndex) return -1;
  return previous;
};

/** ±35% de variação sobre o intervalo base — sem isso todas as composições avançam no mesmo instante. */
const JITTER_RATIO = 0.35;

/** Granularidade da checagem interna. O intervalo por trem é o parâmetro do construtor, não este valor. */
const POLL_MS = 500;

export const jitteredDelay = (baseMs: number, random = Math.random): number => {
  const factor = 1 + (random() * 2 - 1) * JITTER_RATIO;
  return Math.round(baseMs * factor);
};

/**
 * Simulador de deslocamento das composições.
 *
 * Avança cada trem uma estação por vez, indo e voltando entre os terminais da
 * linha — uma operação de vaivém, como a de uma linha real em serviço. Cada
 * composição tem seu próprio relógio, com folga aleatória sobre o intervalo
 * base: numa operação de verdade os trens não partem todos no mesmo segundo,
 * e sincronizados eles delatariam a simulação. Uma composição em EMERGÊNCIA
 * (parada por comando do operador) permanece onde está até ser liberada; o
 * sentido e o relógio de cada trem vivem só em memória — não são dados de
 * domínio persistidos, apenas o estado interno desta simulação.
 */
export class TrainMotionSimulator {
  private timer: NodeJS.Timeout | null = null;
  private readonly directions = new Map<string, Direction>();
  private readonly nextAdvanceAt = new Map<string, number>();

  constructor(private readonly intervalMs: number) {}

  public get isRunning(): boolean {
    return this.timer !== null;
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    // Não impede o processo de encerrar durante um shutdown gracioso.
    this.timer.unref?.();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.nextAdvanceAt.clear();
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    const trains = await TrainRepository.findAll();

    for (const train of trains) {
      const dueAt = this.nextAdvanceAt.get(train.trainId);

      // Primeira vez que vemos este trem: agenda o próximo avanço sem mover agora,
      // para não fazer todas as composições partirem juntas na inicialização.
      if (dueAt === undefined) {
        this.scheduleNext(train.trainId, now);
        continue;
      }
      if (now < dueAt) continue;

      try {
        await this.advance(train.trainId);
      } catch (error) {
        logger.error(`Falha ao avançar a composição ${train.trainId}.`, error);
      }
      this.scheduleNext(train.trainId, now);
    }
  }

  private scheduleNext(trainId: string, now: number): void {
    this.nextAdvanceAt.set(trainId, now + jitteredDelay(this.intervalMs));
  }

  /** Lock pessimista: um comando do operador para o mesmo trem não pode ser sobrescrito por este avanço. */
  private async advance(trainId: string): Promise<void> {
    const snapshot = await withTransaction(async (client) => {
      const train = await TrainRepository.findByIdWithLock(trainId, client);
      if (!train || train.status === 'EMERGÊNCIA') return null;

      const currentIndex = LINE_STATION_CODES.indexOf(train.currentStationCode);
      if (currentIndex === -1) return null;

      const maxIndex = LINE_STATION_CODES.length - 1;
      const direction = nextDirection(currentIndex, maxIndex, this.directions.get(trainId) ?? 1);

      this.directions.set(trainId, direction);
      train.moveTo(LINE_STATION_CODES[currentIndex + direction]);
      await TrainRepository.save(train, client);

      return train.toSnapshot();
    });

    if (snapshot) domainEventBus.emit('train:updated', snapshot);
  }
}
