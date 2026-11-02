// backend/application/dtos/TrainDTO.ts
import type { TrainCommand, TrainStatus } from '../../domain/entities/TrainSession';

export interface TrainResponseDTO {
  trainId: string;
  currentStationCode: string;
  speedKmH: number;
  voltageV: number;
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
  voltageV: number;
  status: 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO';
}
