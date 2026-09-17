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
  role: 'OPERADOR' | 'SUPERVISOR' | 'ADMIN';
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

// --- Ocorrências -----------------------------------------------------------

export const INCIDENT_SEVERITIES = ['BAIXA', 'MÉDIA', 'ALTA', 'CRÍTICA'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = ['ABERTA', 'EM_ANDAMENTO', 'RESOLVIDA'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_CATEGORIES = [
  'ENERGIA',
  'SINALIZACAO',
  'VIA_PERMANENTE',
  'MATERIAL_RODANTE',
  'PASSAGEIRO',
  'OUTROS',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export interface Incident {
  id: string;
  title: string;
  description: string;
  stationCode: string | null;
  trainId: string | null;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  openedBy: string;
  openedByName?: string;
  assignedTo: string | null;
  assignedToName?: string | null;
  resolutionNote: string | null;
  openedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolutionMinutes: number | null;
}

export interface IncidentStats {
  open: number;
  inProgress: number;
  resolved: number;
  critical: number;
  averageResolutionMinutes: number | null;
}

// --- Equipe ----------------------------------------------------------------

export const OPERATOR_ROLES = ['OPERADOR', 'SUPERVISOR', 'ADMIN'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export interface OperatorProfile {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface RoleOption {
  value: OperatorRole;
  label: string;
}

// --- Série histórica de telemetria ------------------------------------------

export interface HistorySample {
  stationCode: string;
  bucketAt: string;
  minKV: number;
  avgKV: number;
  maxKV: number;
}

export interface HistorySummaryRow {
  stationCode: string;
  minKV: number;
  avgKV: number;
  maxKV: number;
  buckets: number;
}

// --- Passagem de turno ------------------------------------------------------

export interface ShiftCommand {
  action: string;
  status: string;
  count: number;
}

export interface ShiftIncident {
  id: string;
  title: string;
  severity: string;
  status: string;
  stationCode: string | null;
  openedBy: string;
  openedAt: string;
  resolvedAt: string | null;
  resolutionMinutes: number | null;
}

export interface ShiftVoltageExtreme {
  stationCode: string;
  stationName: string;
  minKV: number;
  avgKV: number;
  maxKV: number;
  degradedBuckets: number;
}

export interface ShiftReport {
  since: string;
  until: string;
  durationMinutes: number;
  operators: string[];
  commands: ShiftCommand[];
  totalCommands: number;
  incidentsOpened: ShiftIncident[];
  incidentsResolved: ShiftIncident[];
  incidentsPending: ShiftIncident[];
  voltageExtremes: ShiftVoltageExtreme[];
  degradedStations: number;
}
