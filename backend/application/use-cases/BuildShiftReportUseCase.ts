// backend/application/use-cases/BuildShiftReportUseCase.ts
import { db } from '../../infrastructure/database/postgres';
import { LINE_STATIONS, findStation } from '../../domain/line';
import { ValidationError } from '../../shared/errors';

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
  /** Janelas em que a leitura ficou abaixo do limiar de atenção. */
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
  /** Estações cuja tensão esteve na faixa de atenção ou crítica no período. */
  degradedStations: number;
}

/** Abaixo deste valor a catenária sai da faixa nominal (mesmo limiar do simulador). */
const WARNING_THRESHOLD_KV = 23.8;

/** Janela máxima aceita para o relatório, em horas — um turno não passa disso. */
const MAX_WINDOW_HOURS = 24;

interface IncidentRow {
  id: number | string;
  title: string;
  severity: string;
  status: string;
  station_code: string | null;
  opened_by: string;
  opened_at: Date;
  resolved_at: Date | null;
}

const toIncident = (row: IncidentRow): ShiftIncident => {
  const openedAt = new Date(row.opened_at);
  const resolvedAt = row.resolved_at ? new Date(row.resolved_at) : null;

  return {
    id: String(row.id),
    title: row.title,
    severity: row.severity,
    status: row.status,
    stationCode: row.station_code,
    openedBy: row.opened_by,
    openedAt: openedAt.toISOString(),
    resolvedAt: resolvedAt?.toISOString() ?? null,
    resolutionMinutes: resolvedAt
      ? Math.max(0, Math.round((resolvedAt.getTime() - openedAt.getTime()) / 60_000))
      : null,
  };
};

const INCIDENT_COLUMNS = 'id, title, severity, status, station_code, opened_by, opened_at, resolved_at';

/**
 * Monta o relatório de passagem de turno.
 *
 * Consolida, para a janela do turno, o que o operador que assume precisa saber:
 * comandos emitidos, ocorrências abertas/resolvidas/pendentes e o comportamento
 * da tensão na malha. Tudo vem das mesmas fontes auditáveis usadas na operação.
 */
export class BuildShiftReportUseCase {
  public async execute(since: Date): Promise<ShiftReport> {
    const until = new Date();

    if (Number.isNaN(since.getTime())) {
      throw new ValidationError('Início do turno inválido.');
    }
    if (since > until) {
      throw new ValidationError('O início do turno não pode estar no futuro.');
    }

    const durationMinutes = Math.round((until.getTime() - since.getTime()) / 60_000);
    if (durationMinutes > MAX_WINDOW_HOURS * 60) {
      throw new ValidationError(`O relatório cobre no máximo ${MAX_WINDOW_HOURS} horas de turno.`);
    }

    const [commands, operators, opened, resolved, pending, voltage] = await Promise.all([
      db.query<{ action: string; status: string; count: string }>(
        `SELECT action, status, COUNT(*)::text AS count
         FROM audit_logs
         WHERE created_at >= $1 AND action LIKE 'EXEC\\_%'
         GROUP BY action, status
         ORDER BY COUNT(*) DESC`,
        [since],
      ),
      db.query<{ operator_id: string }>(
        `SELECT DISTINCT operator_id
         FROM audit_logs
         WHERE created_at >= $1 AND action = 'LOGIN_SUCCESS' AND operator_id IS NOT NULL
         ORDER BY operator_id`,
        [since],
      ),
      db.query<IncidentRow>(
        `SELECT ${INCIDENT_COLUMNS} FROM incidents WHERE opened_at >= $1 ORDER BY opened_at DESC`,
        [since],
      ),
      db.query<IncidentRow>(
        `SELECT ${INCIDENT_COLUMNS} FROM incidents WHERE resolved_at >= $1 ORDER BY resolved_at DESC`,
        [since],
      ),
      // Pendências não se limitam ao turno: quem assume herda tudo que segue aberto.
      db.query<IncidentRow>(
        `SELECT ${INCIDENT_COLUMNS} FROM incidents
         WHERE status <> 'RESOLVIDA'
         ORDER BY
           CASE severity WHEN 'CRÍTICA' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'MÉDIA' THEN 2 ELSE 3 END,
           opened_at ASC`,
      ),
      db.query<{ station_code: string; min_kv: string; avg_kv: string; max_kv: string; degraded: string }>(
        `SELECT station_code,
                MIN(min_kv)::text AS min_kv,
                AVG(avg_kv)::text AS avg_kv,
                MAX(max_kv)::text AS max_kv,
                COUNT(*) FILTER (WHERE min_kv < $2)::text AS degraded
         FROM telemetry_samples
         WHERE bucket_at >= $1
         GROUP BY station_code`,
        [since, WARNING_THRESHOLD_KV],
      ),
    ]);

    const voltageExtremes = voltage.rows
      .map((row) => ({
        stationCode: row.station_code,
        stationName: findStation(row.station_code)?.name ?? row.station_code,
        minKV: Number(row.min_kv),
        avgKV: Number(Number(row.avg_kv).toFixed(2)),
        maxKV: Number(row.max_kv),
        degradedBuckets: Number(row.degraded),
      }))
      // A ordem da malha é mais útil na leitura do que a alfabética.
      .sort(
        (a, b) =>
          LINE_STATIONS.findIndex((s) => s.code === a.stationCode) -
          LINE_STATIONS.findIndex((s) => s.code === b.stationCode),
      );

    const commandRows = commands.rows.map((row) => ({
      action: row.action.replace(/^EXEC_/, ''),
      status: row.status,
      count: Number(row.count),
    }));

    return {
      since: since.toISOString(),
      until: until.toISOString(),
      durationMinutes,
      operators: operators.rows.map((row) => row.operator_id),
      commands: commandRows,
      totalCommands: commandRows.reduce((sum, row) => sum + row.count, 0),
      incidentsOpened: opened.rows.map(toIncident),
      incidentsResolved: resolved.rows.map(toIncident),
      incidentsPending: pending.rows.map(toIncident),
      voltageExtremes,
      degradedStations: voltageExtremes.filter((row) => row.degradedBuckets > 0).length,
    };
  }
}

export const buildShiftReportUseCase = new BuildShiftReportUseCase();
