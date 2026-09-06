// frontend/src/types/index.ts
export type StationStatus = 'NORMAL' | 'ATENÇÃO' | 'MANUTENÇÃO';

export interface Station {
  code: string;
  name: string;
  status: StationStatus;
  trains: string[];
  headway: string;
  voltageKV: number;
}

export interface AlarmEvent {
  id: string;
  timestamp: string;
  stationCode: string;
  message: string;
  level: 'WARNING' | 'CRITICAL' | 'INFO';
}

export interface OperatorSession {
  operatorId: string;
  role: 'OPERATOR_SOC' | 'SUPERVISOR' | 'ADMIN';
  token: string;
  avatarUrl?: string; // Novo: URL da foto de perfil
}