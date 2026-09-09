// frontend/src/types/index.ts

export type StationStatus = 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO';
export type TrainStatus = 'NORMAL' | 'ATENÇÃO' | 'EMERGÊNCIA';
export type AlarmLevel = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Station {
  /** Ordem física no traçado (1 = Brasilândia). */
  order: number;
  code: string;
  name: string;
  substation: string;
  nominalVoltageKV: number;
  voltageKV: number;
  status: StationStatus;
  headway: string;
}

/** Estado de uma composição, espelhando `TrainSnapshot` do backend. */
export interface Train {
  trainId: string;
  currentStationCode: string;
  speedKmH: number;
  voltageKV: number;
  status: TrainStatus;
  updatedAt: string;
}

export interface AlarmEvent {
  id: string;
  timestamp: string;
  stationCode: string;
  message: string;
  level: AlarmLevel;
  acknowledged?: boolean;
}

export interface OperatorSession {
  operatorId: string;
  name?: string;
  role: 'OPERATOR_SOC' | 'SUPERVISOR' | 'ADMIN';
  token: string;
  avatarUrl?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  operatorId: string | null;
  action: string;
  target: string;
  status: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

/** Leitura de telemetria de uma subestação, publicada pelo barramento de eventos. */
export interface StationTelemetry {
  currentStationCode: string;
  voltageKV: number;
  status: StationStatus;
}

export interface SystemAlert {
  severity: AlarmLevel;
  message: string;
  timestamp: string;
}

export interface CommandAck {
  trainId: string;
  command: string;
  status: 'EXECUTED' | 'FAILED';
  message?: string;
}

/** Comandos operacionais expostos ao painel. */
export type OperationalCommand = 'EMERGENCY_BRAKE_OVERRIDE' | 'SPEED_RESTRICTION_20KM' | 'RELEASE_SIGNAL';
