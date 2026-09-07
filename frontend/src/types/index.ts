// frontend/src/types/index.ts
export type StationStatus = 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO';

export interface Station {
  id: number;
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
  name?: string;
  role: 'OPERATOR_SOC' | 'SUPERVISOR' | 'ADMIN';
  token: string;
  avatarUrl?: string; // URL da foto de perfil
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  operatorId: string;
  action: string;
  target: string;
  status: string;
}
