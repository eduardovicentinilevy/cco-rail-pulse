// backend/application/services/TrainMotionSimulator.ts
import { findStation } from '../../domain/line';
import {
  cycleTimeMs,
  directionAfterArrival,
  dwellTimeMs,
  isTerminal,
  segmentRunTimeMs,
  TERMINAL_TURNAROUND_MS,
} from '../../domain/operation';
import { planTrain } from '../../domain/dispatch';
import type { DispatchAction, DispatchContext } from '../../domain/dispatch';
import { predictArrivals } from '../../domain/arrivals';
import type { StationArrivals } from '../../domain/arrivals';
import type { TrainSession } from '../../domain/entities/TrainSession';
import { withTransaction } from '../../infrastructure/database/postgres';
import { TrainRepository } from '../../infrastructure/database/repositories/TrainRepository';
import { domainEventBus } from '../events/event-bus';
import { createLogger } from '../../shared/logger';

const logger = createLogger('OPERACAO');

/**
 * Fração do intervalo médio (volta completa ÷ frota em serviço) exigida entre duas
 * partidas da mesma plataforma. Abaixo de 1 deixa folga para a frota absorver
 * atrasos sem que a regulação vire, ela própria, a causa do atraso.
 */
export const REGULATION_FACTOR = 0.85;

/** Granularidade do ciclo de despacho. Os tempos de marcha vêm do domínio, não deste valor. */
const POLL_MS = 500;

/** Leitura corrente do terceiro trilho numa estação, em volts (`undefined` se não houver). */
export type VoltageLookup = (stationCode: string) => number | undefined;

export interface OperationEngineOptions {
  /** Aceleração do relógio da simulação (1 = tempo real). */
  timeScale: number;
  /** Tensão do terceiro trilho na estação em que a composição chega. */
  voltageAt?: VoltageLookup;
  /** A seção da subestação está energizada? */
  isEnergized?: (substation: string) => boolean;
  /** Fonte de aleatoriedade (injetável para testes). */
  random?: () => number;
}

/** Sem telemetria ao vivo, o trem assume a tensão de referência do trecho. */
const referenceVoltage: VoltageLookup = (stationCode) => findStation(stationCode)?.nominalVoltageV;

/**
 * Motor de operação da linha.
 *
 * A cada ciclo pergunta ao despacho (`domain/dispatch.ts`) o que cada composição
 * deve fazer e aplica a decisão sob lock pessimista — um comando do operador para
 * o mesmo trem nunca é sobrescrito por este ciclo. O que ele simula:
 * - marcha por distância real entre estações, com aceleração, cruzeiro e frenagem;
 * - paradas nas plataformas (mais longas nas integrações) e manobra nos terminais;
 * - separação por bloco: no mesmo sentido, só um trem por plataforma ou trecho de
 *   aproximação — quem vem atrás fica RETIDO, e um trem imobilizado segura a fila;
 * - energia: sem tensão na seção o trem não parte, e quem está em marcha para no trecho.
 *
 * O fim da parada de cada trem vive só em memória: depois de um reinício, quem está
 * na plataforma recebe uma parada nova, com folga aleatória para não partirem juntos.
 */
export class TrainMotionSimulator {
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;
  private readonly dwellUntil = new Map<string, number>();
  /** Última partida por plataforma e sentido — referência da regulação de intervalo. */
  private readonly lastDeparture = new Map<string, number>();
  private minHeadwayMs = 0;
  private fleet: TrainSession[] = [];
  private readonly timeScale: number;
  private readonly voltageAt: VoltageLookup;
  private readonly isEnergized: (substation: string) => boolean;
  private readonly random: () => number;

  constructor(options: OperationEngineOptions) {
    this.timeScale = options.timeScale > 0 ? options.timeScale : 1;
    this.voltageAt = options.voltageAt ?? referenceVoltage;
    this.isEnergized = options.isEnergized ?? (() => true);
    this.random = options.random ?? Math.random;
  }

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
  }

  /**
   * Composições em marcha na seção da subestação — a carga que o simulador SCADA
   * converte em queda de tensão no terceiro trilho.
   */
  public runningLoad = (substation: string): number =>
    this.fleet.filter((train) => train.isMoving && findStation(train.currentStationCode)?.substation === substation)
      .length;

  /** Previsão de chegadas a partir do último estado conhecido da frota. */
  public arrivals(now: Date = new Date()): StationArrivals[] {
    return predictArrivals(this.fleet, now, {
      timeScale: this.timeScale,
      dwellRemainingMs: (trainId) => Math.max(0, (this.dwellUntil.get(trainId) ?? 0) - now.getTime()),
    });
  }

  private context(now: Date): DispatchContext {
    return {
      now,
      dwellUntil: (trainId) => this.dwellUntil.get(trainId),
      isEnergized: this.isEnergized,
      lastDepartureAt: (stationCode, direction) => this.lastDeparture.get(`${stationCode}:${direction}`),
      minHeadwayMs: this.minHeadwayMs,
    };
  }

  /** Intervalo mínimo entre partidas, proporcional à frota que está de fato circulando. */
  private updateRegulation(fleet: readonly TrainSession[]): void {
    const inService = fleet.filter((train) => train.status !== 'EMERGÊNCIA').length;
    this.minHeadwayMs = inService > 0 ? (cycleTimeMs() / inService) * REGULATION_FACTOR / this.timeScale : 0;
  }

  /** Executa um ciclo de despacho. Público para os testes de integração; o timer chama sozinho. */
  public async tick(now: Date = new Date()): Promise<void> {
    // Reentrância: uma consulta lenta não pode deixar dois ciclos decidirem sobre o
    // mesmo estado e, por exemplo, fazer um trem partir duas vezes.
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const fleet = await TrainRepository.findAll();
      this.registerArrivals(fleet, now);
      this.updateRegulation(fleet);

      for (let index = 0; index < fleet.length; index += 1) {
        if (planTrain(fleet[index], fleet, this.context(now)).type === 'NONE') continue;
        try {
          const updated = await this.apply(fleet[index].trainId, fleet, now);
          // As decisões seguintes do mesmo ciclo enxergam este trem já atualizado.
          if (updated) fleet[index] = updated;
        } catch (error) {
          logger.error(`Falha ao despachar a composição ${fleet[index].trainId}.`, error);
        }
      }

      this.fleet = fleet;
    } finally {
      this.isTicking = false;
    }
  }

  /** Paradas para composições vistas pela primeira vez — com folga para não partirem juntas. */
  private registerArrivals(fleet: readonly TrainSession[], now: Date): void {
    const ids = new Set(fleet.map((train) => train.trainId));
    for (const trainId of this.dwellUntil.keys()) {
      if (!ids.has(trainId)) this.dwellUntil.delete(trainId);
    }
    for (const train of fleet) {
      if (train.motion || this.dwellUntil.has(train.trainId)) continue;
      const dwell = dwellTimeMs(train.currentStationCode) / this.timeScale;
      this.dwellUntil.set(train.trainId, now.getTime() + Math.round(this.random() * dwell));
    }
  }

  /** Lock pessimista: decide de novo sobre o estado travado e só então grava. */
  private async apply(trainId: string, fleet: readonly TrainSession[], now: Date): Promise<TrainSession | null> {
    const updated = await withTransaction(async (client) => {
      const train = await TrainRepository.findByIdWithLock(trainId, client);
      if (!train) return null;

      const action = planTrain(train, fleet, this.context(now));
      if (!this.execute(train, action, now)) return null;

      await TrainRepository.save(train, client);
      return train;
    });

    if (updated) domainEventBus.emit('train:updated', updated.toSnapshot(now));
    return updated;
  }

  /** Aplica a decisão do despacho à composição. Devolve se o estado mudou. */
  private execute(train: TrainSession, action: DispatchAction, now: Date): boolean {
    switch (action.type) {
      case 'NONE':
        return false;

      case 'ARRIVE': {
        const station = train.motion!.toStationCode;
        const voltage = this.voltageAt(station) ?? referenceVoltage(station) ?? train.voltageV;
        train.arrive(voltage, directionAfterArrival(station, train.direction), now);
        const dwell = isTerminal(station) ? TERMINAL_TURNAROUND_MS : dwellTimeMs(station);
        this.dwellUntil.set(train.trainId, now.getTime() + dwell / this.timeScale);
        return true;
      }

      case 'DEPART': {
        const speed = train.targetSpeedKmH;
        const runTime = segmentRunTimeMs(train.currentStationCode, action.toStationCode, speed) / this.timeScale;
        if (!(runTime > 0)) return false;
        const origin = train.currentStationCode;
        train.depart(action.toStationCode, runTime, speed, now);
        this.dwellUntil.delete(train.trainId);
        this.lastDeparture.set(`${origin}:${train.direction}`, now.getTime());
        return true;
      }

      case 'REGULATE':
        // Só alonga a parada: nada muda no estado persistido da composição.
        this.dwellUntil.set(train.trainId, action.untilMs);
        return false;

      case 'HOLD':
        return train.hold(action.reason, now);

      case 'SUSPEND':
        train.suspend(action.reason, now);
        return true;

      case 'RESUME': {
        const speed = train.targetSpeedKmH;
        train.resume(train.remainingRunTimeMs(speed, this.timeScale), speed, now);
        return true;
      }

      case 'REVERSE':
        train.reverse(now);
        this.dwellUntil.set(train.trainId, now.getTime() + TERMINAL_TURNAROUND_MS / this.timeScale);
        return true;

      case 'SETTLE':
        train.settle(now);
        return true;
    }
  }
}
