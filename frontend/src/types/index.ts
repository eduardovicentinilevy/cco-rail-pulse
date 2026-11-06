// frontend/src/types/index.ts

export type StationStatus = 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO';
export type TrainStatus = 'NORMAL' | 'ATENÇÃO' | 'EMERGÊNCIA';
export type AlarmLevel = 'INFO' | 'WARNING' | 'CRITICAL';

/** Cliente dono da instalação, devolvido junto com a sessão e com a malha. */
export interface TenantIdentity {
  id: string;
  name: string;
}

/** Linha em operação na sessão. Substitui as menções fixas a uma linha só. */
export interface LineIdentity {
  id: string;
  code: string;
  name: string;
}

export interface Station {
  /** Ordem física no traçado (1 = primeiro terminal da linha). */
  position: number;
  code: string;
  name: string;
  /** Subestação retificadora (SR) que alimenta o terceiro trilho no trecho. */
  substation: string;
  /** Tensão de referência do terceiro trilho, em Vcc. */
  nominalVoltageV: number;
  /** Última leitura SCADA do terceiro trilho, em Vcc. */
  voltageV: number;
  status: StationStatus;
  /** Intervalo entre composições, em segundos; `null` quando não cadastrado. */
  headwaySeconds: number | null;
  /** Integrações com outras linhas e modais, como cadastradas na estação. */
  connections: string[];
  /** Posição normalizada (0–1) no traçado esquemático desenhado pelo mapa. */
  mapX: number | null;
  mapY: number | null;
}

/** 1 = sentido do último terminal do traçado; -1 = sentido do primeiro. */
export type Direction = 1 | -1;

/** Situação operacional, derivada no backend (`TrainSession.phase`). */
export type TrainPhase = 'PLATAFORMA' | 'RETIDO' | 'EM_MARCHA' | 'PARADO_ENTRE_ESTACOES' | 'IMOBILIZADO';

/** Estado de uma composição, espelhando `TrainSnapshot` do backend. */
export interface Train {
  trainId: string;
  /** Estação onde está parada, ou de onde partiu se estiver em marcha. */
  currentStationCode: string;
  speedKmH: number;
  voltageV: number;
  status: TrainStatus;
  updatedAt: string;
  direction: Direction;
  phase: TrainPhase;
  /** Destino do trecho em curso; `null` parada na plataforma. */
  nextStationCode: string | null;
  holdReason: string | null;
  /** Andamento no trecho no instante em que o snapshot chegou. */
  movement: { progress: number; remainingMs: number | null } | null;
  /** `performance.now()` da chegada do snapshot — base da animação, imune ao relógio do servidor. */
  syncedAt: number;
}

/** Seção de alimentação do terceiro trilho (uma por subestação retificadora). */
export interface PowerSection {
  substation: string;
  energized: boolean;
  reason: string | null;
  changedBy: string | null;
  changedAt: string;
  stationCodes: string[];
  trainsRunning?: number;
}

export interface ArrivalEntry {
  trainId: string;
  etaSeconds: number;
  atPlatform: boolean;
  held: boolean;
}

export interface StationArrivalBoard {
  code: string;
  name: string;
  /**
   * Sentido do último terminal do traçado. Os sentidos não são nomeados por ponto
   * cardeal: o traçado é da linha, e nem toda linha corre de oeste para leste —
   * quem dá o nome de cada sentido é `ArrivalsPayload.directions`.
   */
  forward: ArrivalEntry[];
  /** Sentido do primeiro terminal do traçado. */
  backward: ArrivalEntry[];
}

export interface ArrivalsPayload {
  generatedAt: string;
  timeScale: number;
  /** Como nomear cada sentido, vindo dos terminais da linha da sessão. */
  directions: { forward: string; backward: string };
  service: { trainsInService: number; cycleSeconds: number; headwaySeconds: number | null };
  stations: StationArrivalBoard[];
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
  /** Cliente e linha da sessão: é daqui que a interface tira os nomes que exibe. */
  tenant: TenantIdentity;
  line: LineIdentity;
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
  voltageV: number;
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

// --- Ordens de Serviço de Manutenção -----------------------------------------

export const WORK_ORDER_PRIORITIES = ['BAIXA', 'MÉDIA', 'ALTA', 'URGENTE'] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

export const WORK_ORDER_STATUSES = ['ABERTA', 'EM_ANDAMENTO', 'CONCLUÍDA', 'CANCELADA'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_CATEGORIES = [
  'SUBESTACAO_SR',
  'TERCEIRO_TRILHO',
  'VIA_PERMANENTE',
  'SINALIZACAO_ATS',
  'MATERIAL_RODANTE',
  'INFRAESTRUTURA_ESTACAO',
  'OUTROS',
] as const;
export type WorkOrderCategory = (typeof WORK_ORDER_CATEGORIES)[number];

export interface WorkOrder {
  id: string;
  title: string;
  description: string;
  assetCode: string | null;
  stationCode: string | null;
  category: WorkOrderCategory;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  openedBy: string;
  openedByName?: string;
  assignedTo: string | null;
  assignedToName?: string | null;
  completionNote: string | null;
  openedAt: string;
  updatedAt: string;
  completedAt: string | null;
  dueAt: string | null;
  completionMinutes: number | null;
  isOverdue: boolean;
}

export interface WorkOrderStats {
  open: number;
  inProgress: number;
  completed: number;
  overdue: number;
  averageCompletionMinutes: number | null;
}

// --- Central de Alarmes -----------------------------------------------------

/** Alarme persistido — histórico entre turnos, diferente do feed ao vivo (sessão apenas). */
export interface AlarmLogEntry {
  id: string;
  severity: AlarmLevel;
  message: string;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

export interface AlarmStats {
  total: number;
  unacknowledged: number;
  criticalUnacknowledged: number;
  last24h: number;
}

// --- Comunicações ------------------------------------------------------------

export const COMMUNICATION_CHANNELS = [
  'RADIO_TREM',
  'RADIO_MANUTENCAO',
  'RADIO_SEGURANCA',
  'TELEFONE',
  'PRESENCIAL',
] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const COMMUNICATION_DIRECTIONS = ['ENVIADA', 'RECEBIDA'] as const;
export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number];

export interface ChannelOption {
  value: CommunicationChannel;
  label: string;
}

export interface Communication {
  id: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  stationCode: string | null;
  trainId: string | null;
  operatorId: string;
  message: string;
  createdAt: string;
}

// --- Procedimentos operacionais ----------------------------------------------

export const PROCEDURE_CATEGORIES = [
  'EMERGENCIA',
  'ENERGIA',
  'SINALIZACAO',
  'METEOROLOGIA',
  'EVACUACAO',
  'SEGURANCA',
] as const;
export type ProcedureCategory = (typeof PROCEDURE_CATEGORIES)[number];

export interface ProcedureCategoryOption {
  value: ProcedureCategory;
  label: string;
}

export interface Procedure {
  id: string;
  category: ProcedureCategory;
  title: string;
  summary: string;
  steps: string[];
  updatedAt: string;
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
  minV: number;
  avgV: number;
  maxV: number;
}

export interface HistorySummaryRow {
  stationCode: string;
  minV: number;
  avgV: number;
  maxV: number;
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
  minV: number;
  avgV: number;
  maxV: number;
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
