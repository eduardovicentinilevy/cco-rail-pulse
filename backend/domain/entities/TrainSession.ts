// backend/domain/entities/TrainSession.ts
import { ValidationError } from '../../shared/errors';
import { LINE_SPEED_KMH, runTimeMs } from '../operation';
import type { Direction } from '../operation';

export const TRAIN_STATUSES = ['NORMAL', 'ATENÇÃO', 'EMERGÊNCIA'] as const;
export type TrainStatus = (typeof TRAIN_STATUSES)[number];

export const TRAIN_COMMANDS = ['HALT', 'RESTRICT_SPEED', 'RELEASE'] as const;
export type TrainCommand = (typeof TRAIN_COMMANDS)[number];

/**
 * Teto de velocidade aceito pela plataforma, em km/h.
 * Limite de sanidade da telemetria, não a homologação de uma linha específica:
 * a velocidade homologada por linha ainda não é dado cadastrado. Fica acima da
 * velocidade de linha da marcha para deixar folga ao material rodante — os
 * trens da linha de demonstração são de projeto para 90 km/h.
 */
export const MAX_SPEED_KMH = 90;
/** Velocidade imposta por restrição operacional (V.R.), em km/h. */
export const RESTRICTED_SPEED_KMH = 20;
/** Velocidade de cruzeiro: a velocidade máxima de linha da marcha. */
export const CRUISE_SPEED_KMH = LINE_SPEED_KMH;

/**
 * Situação operacional da composição, derivada do estado:
 * - PLATAFORMA: parada na estação (embarque/desembarque ou manobra no terminal);
 * - RETIDO: pronta para partir, mas impedida (bloco à frente ocupado, seção sem tensão);
 * - EM_MARCHA: percorrendo o trecho até a próxima estação;
 * - PARADO_ENTRE_ESTACOES: marcha suspensa no meio do trecho (ex.: seção desenergizada);
 * - IMOBILIZADO: frenagem de emergência acionada pelo CCO.
 */
export const TRAIN_PHASES = ['PLATAFORMA', 'RETIDO', 'EM_MARCHA', 'PARADO_ENTRE_ESTACOES', 'IMOBILIZADO'] as const;
export type TrainPhase = (typeof TRAIN_PHASES)[number];

/** Trecho em curso entre `currentStationCode` e `toStationCode`. */
export interface TrainMotion {
  toStationCode: string;
  /** Fração do trecho já percorrida (0–1) no instante `progressAt`. */
  progress: number;
  progressAt: Date;
  /** Tempo até a chegada contado de `progressAt`; `null` = marcha suspensa (trem parado no trecho). */
  remainingMs: number | null;
}

export interface TrainOperationState {
  direction: Direction;
  motion: TrainMotion | null;
  /** Por que a composição está retida ou parada; `null` quando circula normalmente. */
  holdReason: string | null;
}

export interface TrainSnapshot {
  trainId: string;
  currentStationCode: string;
  speedKmH: number;
  voltageV: number;
  status: TrainStatus;
  updatedAt: string;
  direction: Direction;
  phase: TrainPhase;
  nextStationCode: string | null;
  holdReason: string | null;
  /**
   * Andamento no trecho medido no instante da serialização: o painel anima a
   * partir daqui sem depender de o relógio do navegador bater com o do servidor.
   */
  movement: { progress: number; remainingMs: number | null } | null;
}

export const isTrainCommand = (value: unknown): value is TrainCommand =>
  typeof value === 'string' && (TRAIN_COMMANDS as readonly string[]).includes(value);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export class TrainSession {
  public direction: Direction;
  public motion: TrainMotion | null;
  public holdReason: string | null;

  constructor(
    public readonly trainId: string,
    public currentStationCode: string,
    public speedKmH: number,
    public voltageV: number,
    public status: TrainStatus,
    public updatedAt: Date,
    operation: Partial<TrainOperationState> = {},
  ) {
    this.direction = operation.direction ?? 1;
    this.motion = operation.motion ?? null;
    this.holdReason = operation.holdReason ?? null;
  }

  public updateTelemetry(speedKmH: number, voltageV: number, status: TrainStatus): void {
    if (!Number.isFinite(speedKmH) || speedKmH < 0) {
      throw new ValidationError('A velocidade não pode ser negativa.');
    }
    if (speedKmH > MAX_SPEED_KMH) {
      throw new ValidationError(`A velocidade não pode exceder ${MAX_SPEED_KMH} km/h.`);
    }
    if (!Number.isFinite(voltageV) || voltageV < 0) {
      throw new ValidationError('A tensão de terceiro trilho é inválida.');
    }

    this.speedKmH = speedKmH;
    this.voltageV = voltageV;
    this.status = status;
    this.updatedAt = new Date();
  }

  public get isMoving(): boolean {
    return this.motion !== null && this.motion.remainingMs !== null;
  }

  public get phase(): TrainPhase {
    if (this.status === 'EMERGÊNCIA') return 'IMOBILIZADO';
    if (this.motion) return this.motion.remainingMs === null ? 'PARADO_ENTRE_ESTACOES' : 'EM_MARCHA';
    return this.holdReason ? 'RETIDO' : 'PLATAFORMA';
  }

  /** Fração do trecho percorrida em `now` (0 quando parada na plataforma). */
  public progressAt(now: Date): number {
    const motion = this.motion;
    if (!motion) return 0;
    if (motion.remainingMs === null) return motion.progress;
    if (motion.remainingMs <= 0) return 1;
    const elapsed = now.getTime() - motion.progressAt.getTime();
    return clamp01(motion.progress + (1 - motion.progress) * clamp01(elapsed / motion.remainingMs));
  }

  /** Tempo até a chegada em `now`; `null` parada ou com a marcha suspensa. */
  public remainingAt(now: Date): number | null {
    const motion = this.motion;
    if (!motion || motion.remainingMs === null) return null;
    return Math.max(0, motion.remainingMs - (now.getTime() - motion.progressAt.getTime()));
  }

  public isArrivalDue(now: Date): boolean {
    return this.remainingAt(now) === 0;
  }

  /** Parte da plataforma rumo à estação vizinha `toStationCode`. */
  public depart(toStationCode: string, runTimeMs: number, speedKmH: number, now: Date): void {
    if (this.motion) throw new ValidationError(`A composição ${this.trainId} já está em marcha.`);
    if (this.status === 'EMERGÊNCIA') throw new ValidationError(`A composição ${this.trainId} está imobilizada.`);
    if (!(runTimeMs > 0)) throw new ValidationError('O tempo de percurso precisa ser positivo.');

    this.motion = { toStationCode, progress: 0, progressAt: now, remainingMs: runTimeMs };
    this.speedKmH = speedKmH;
    this.holdReason = null;
    this.updatedAt = now;
  }

  /** Chega à estação de destino do trecho e passa a ler a tensão do terceiro trilho dali. */
  public arrive(voltageV: number, direction: Direction, now: Date): void {
    if (!this.motion) throw new ValidationError(`A composição ${this.trainId} não está em marcha.`);
    if (!Number.isFinite(voltageV) || voltageV < 0) {
      throw new ValidationError('A tensão de terceiro trilho é inválida.');
    }
    this.currentStationCode = this.motion.toStationCode;
    this.motion = null;
    this.direction = direction;
    this.voltageV = voltageV;
    this.speedKmH = 0;
    this.holdReason = null;
    this.updatedAt = now;
  }

  /** Suspende a marcha no ponto em que está (o trem para no trecho). */
  public suspend(reason: string | null, now: Date): void {
    if (!this.motion) return;
    if (this.motion.remainingMs !== null) {
      this.motion = { ...this.motion, progress: this.progressAt(now), progressAt: now, remainingMs: null };
    }
    this.speedKmH = 0;
    this.holdReason = reason;
    this.updatedAt = now;
  }

  /** Retoma uma marcha suspensa, com o tempo que falta até a próxima estação. */
  public resume(remainingMs: number, speedKmH: number, now: Date): void {
    if (!this.motion || this.motion.remainingMs !== null) return;
    this.motion = { ...this.motion, progressAt: now, remainingMs: Math.max(0, remainingMs) };
    this.speedKmH = speedKmH;
    this.holdReason = null;
    this.updatedAt = now;
  }

  /** Mantém a composição na plataforma por um motivo operacional. Devolve se algo mudou. */
  public hold(reason: string, now: Date): boolean {
    if (this.motion || this.holdReason === reason) return false;
    this.holdReason = reason;
    this.speedKmH = 0;
    this.updatedAt = now;
    return true;
  }

  /** Libera a retenção na plataforma. Devolve se algo mudou. */
  public clearHold(now: Date): boolean {
    if (this.motion || this.holdReason === null) return false;
    this.holdReason = null;
    this.updatedAt = now;
    return true;
  }

  /** Manobra de inversão no terminal: a composição passa a circular no sentido oposto. */
  public reverse(now: Date): void {
    if (this.motion) throw new ValidationError(`A composição ${this.trainId} só inverte o sentido parada na plataforma.`);
    this.direction = this.direction === 1 ? -1 : 1;
    this.holdReason = null;
    this.speedKmH = 0;
    this.updatedAt = now;
  }

  /** Zera a velocidade residual de uma composição parada na plataforma. */
  public settle(now: Date): void {
    if (this.motion || this.speedKmH === 0) return;
    this.speedKmH = 0;
    this.updatedAt = now;
  }

  /** Velocidade-alvo da marcha conforme o regime corrente (restrição ou linha livre). */
  public get targetSpeedKmH(): number {
    return this.status === 'ATENÇÃO' ? RESTRICTED_SPEED_KMH : CRUISE_SPEED_KMH;
  }

  /** Recalcula o restante do trecho à velocidade dada, a partir do ponto atual. */
  private replan(speedKmH: number, now: Date, timeScale: number, length: number): void {
    const motion = this.motion;
    if (!motion) return;
    const progress = this.progressAt(now);
    this.motion = {
      ...motion,
      progress,
      progressAt: now,
      remainingMs: runTimeMs(length * (1 - progress), speedKmH) / timeScale,
    };
    this.speedKmH = speedKmH;
  }

  /**
   * Regra de domínio ferroviário: traduz um comando operacional em estado da composição.
   * A posição e a tensão medida são preservadas — um comando não teletransporta o trem:
   * a frenagem de emergência para o trem onde ele está, inclusive no meio do trecho, e a
   * restrição ou a liberação recalculam o tempo que falta até a próxima estação.
   * `timeScale` é a aceleração do relógio da simulação (1 = tempo real), e
   * `segmentLengthM` é o comprimento do trecho em curso, em metros.
   *
   * O comprimento vem de fora porque a composição não conhece a malha: cada
   * linha tem a sua, e o trecho `PSO`→`ANR` de um cliente não mede o mesmo que o
   * de outro. Quando o trem está na plataforma, ele não é usado.
   */
  public applyCommand(command: TrainCommand, now: Date, timeScale: number, segmentLengthM: number): void {
    switch (command) {
      case 'HALT':
        this.status = 'EMERGÊNCIA';
        this.suspend(null, now);
        this.speedKmH = 0;
        break;
      case 'RESTRICT_SPEED':
        this.status = 'ATENÇÃO';
        if (this.motion) {
          if (this.motion.remainingMs === null) {
            this.resumeFromStandstill(RESTRICTED_SPEED_KMH, now, timeScale, segmentLengthM);
          } else {
            this.replan(RESTRICTED_SPEED_KMH, now, timeScale, segmentLengthM);
          }
        } else {
          this.speedKmH = 0;
        }
        break;
      case 'RELEASE':
        this.status = 'NORMAL';
        if (this.motion) {
          if (this.motion.remainingMs === null) {
            this.resumeFromStandstill(CRUISE_SPEED_KMH, now, timeScale, segmentLengthM);
          } else {
            this.replan(CRUISE_SPEED_KMH, now, timeScale, segmentLengthM);
          }
        } else {
          this.speedKmH = 0;
        }
        break;
    }
    this.updatedAt = now;
  }

  /** Tempo, a partir do repouso, para completar o trecho em curso à velocidade dada. */
  public remainingRunTimeMs(speedKmH: number, timeScale: number, segmentLengthM: number): number {
    const motion = this.motion;
    if (!motion) return 0;
    return runTimeMs(segmentLengthM * (1 - motion.progress), speedKmH) / timeScale;
  }

  /** Retoma, a partir do repouso, um trem parado no meio do trecho. */
  private resumeFromStandstill(speedKmH: number, now: Date, timeScale: number, segmentLengthM: number): void {
    this.resume(this.remainingRunTimeMs(speedKmH, timeScale, segmentLengthM), speedKmH, now);
  }

  public toSnapshot(now: Date = new Date()): TrainSnapshot {
    return {
      trainId: this.trainId,
      currentStationCode: this.currentStationCode,
      speedKmH: this.speedKmH,
      voltageV: this.voltageV,
      status: this.status,
      updatedAt: this.updatedAt.toISOString(),
      direction: this.direction,
      phase: this.phase,
      nextStationCode: this.motion?.toStationCode ?? null,
      holdReason: this.holdReason,
      movement: this.motion
        ? { progress: Number(this.progressAt(now).toFixed(4)), remainingMs: this.remainingAt(now) }
        : null,
    };
  }
}
