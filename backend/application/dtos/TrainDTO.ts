// src/application/dtos/TrainDTO.ts
export interface TrainResponseDTO {
  trainId: string;
  currentStationCode: string;
  speedKmH: number;
  voltageKV: number;
  status: 'NORMAL' | 'ATENÇÃO' | 'EMERGÊNCIA';
  updatedAt: string;
}

export interface ExecuteCommandDTO {
  trainId: string;
  command: 'HALT' | 'RESTRICT_SPEED' | 'RELEASE';
  targetBlock: string;
}