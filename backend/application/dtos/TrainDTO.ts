// backend/application/dtos/TrainDTO.ts
import type { TrainCommand, TrainStatus } from '../../domain/entities/TrainSession';

export interface TrainResponseDTO {
  trainId: string;
  currentStationCode: string;
  speedKmH: number;
  voltageKV: number;
  status: TrainStatus;
  updatedAt: string;
}

export interface ExecuteCommandDTO {
  trainId: string;
  command: TrainCommand;
  targetBlock: string;
}

export interface StationTelemetryDTO {
  currentStationCode: string;
  voltageKV: number;
  status: 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO';
}
