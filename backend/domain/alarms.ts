// backend/domain/alarms.ts

/** Reaproveita a mesma escala de severidade do barramento de eventos (`SystemAlert`). */
export const ALARM_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export type AlarmSeverity = (typeof ALARM_SEVERITIES)[number];

export const isAlarmSeverity = (value: unknown): value is AlarmSeverity =>
  typeof value === 'string' && (ALARM_SEVERITIES as readonly string[]).includes(value);

export interface AlarmSnapshot {
  id: string;
  severity: AlarmSeverity;
  message: string;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}
