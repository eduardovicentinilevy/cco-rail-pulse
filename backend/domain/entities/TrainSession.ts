// backend/domain/entities/TrainSession.ts
import { ValidationError } from '../../shared/errors';

export const TRAIN_STATUSES = ['NORMAL', 'ATENÇÃO', 'EMERGÊNCIA'] as const;
export type TrainStatus = (typeof TRAIN_STATUSES)[number];

export const TRAIN_COMMANDS = ['HALT', 'RESTRICT_SPEED', 'RELEASE'] as const;
export type TrainCommand = (typeof TRAIN_COMMANDS)[number];

/** Velocidade máxima homologada para a Linha 6-Laranja, em km/h. */
export const MAX_SPEED_KMH = 80;
/** Velocidade imposta por restrição operacional (V.R.), em km/h. */
export const RESTRICTED_SPEED_KMH = 20;
/** Velocidade de cruzeiro assumida ao liberar a composição, em km/h. */
export const CRUISE_SPEED_KMH = 50;

export interface TrainSnapshot {
  trainId: string;
  currentStationCode: string;
  speedKmH: number;
  voltageKV: number;
  status: TrainStatus;
  updatedAt: string;
}

export const isTrainCommand = (value: unknown): value is TrainCommand =>
  typeof value === 'string' && (TRAIN_COMMANDS as readonly string[]).includes(value);

export class TrainSession {
  constructor(
    public readonly trainId: string,
    public currentStationCode: string,
    public speedKmH: number,
    public voltageKV: number,
    public status: TrainStatus,
    public updatedAt: Date,
  ) {}

  public updateTelemetry(speedKmH: number, voltageKV: number, status: TrainStatus): void {
    if (!Number.isFinite(speedKmH) || speedKmH < 0) {
      throw new ValidationError('A velocidade não pode ser negativa.');
    }
    if (speedKmH > MAX_SPEED_KMH) {
      throw new ValidationError(`A velocidade não pode exceder ${MAX_SPEED_KMH} km/h.`);
    }
    if (!Number.isFinite(voltageKV) || voltageKV < 0) {
      throw new ValidationError('A tensão de catenária é inválida.');
    }

    this.speedKmH = speedKmH;
    this.voltageKV = voltageKV;
    this.status = status;
    this.updatedAt = new Date();
  }

  public moveTo(stationCode: string): void {
    this.currentStationCode = stationCode;
    this.updatedAt = new Date();
  }

  /**
   * Regra de domínio ferroviário: traduz um comando operacional em estado da composição.
   * A posição (estação) e a tensão medida são preservadas — um comando não teletransporta o trem.
   */
  public applyCommand(command: TrainCommand): void {
    switch (command) {
      case 'HALT':
        this.updateTelemetry(0, this.voltageKV, 'EMERGÊNCIA');
        break;
      case 'RESTRICT_SPEED':
        this.updateTelemetry(RESTRICTED_SPEED_KMH, this.voltageKV, 'ATENÇÃO');
        break;
      case 'RELEASE':
        this.updateTelemetry(CRUISE_SPEED_KMH, this.voltageKV, 'NORMAL');
        break;
    }
  }

  public toSnapshot(): TrainSnapshot {
    return {
      trainId: this.trainId,
      currentStationCode: this.currentStationCode,
      speedKmH: this.speedKmH,
      voltageKV: this.voltageKV,
      status: this.status,
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
