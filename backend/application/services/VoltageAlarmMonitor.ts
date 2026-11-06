// backend/application/services/VoltageAlarmMonitor.ts
import { findStation, VOLTAGE_CRITICAL_V, VOLTAGE_WARNING_V } from '../../domain/line';
import type { VoltageStatus } from '../../domain/line';
import { domainEventBus } from '../events/event-bus';
import type { SystemAlert } from '../events/event-bus';
import type { StationTelemetryDTO } from '../dtos/TrainDTO';

/** Leituras consecutivas na nova faixa antes de mudar o estado do alarme (filtra picos). */
export const ALARM_DEBOUNCE_SAMPLES = 2;
/**
 * Banda morta na volta à normalidade, em volts: para sair de ATENÇÃO a tensão
 * precisa passar de 700 + 10 V. Sem ela, uma leitura oscilando em torno do
 * limiar dispararia e limparia o mesmo alarme a cada ciclo.
 */
export const ALARM_HYSTERESIS_V = 10;
/** Abaixo disto a seção é tratada como sem tensão, não como subtensão. */
export const NO_VOLTAGE_V = 50;

const RANK: Record<VoltageStatus, number> = { NORMAL: 0, 'ATENÇÃO': 1, 'CRÍTICO': 2 };

export interface AlarmPointState {
  /** Estado de alarme reconhecido pelo monitor. */
  status: VoltageStatus;
  /** Candidato a novo estado e há quantas leituras seguidas ele se repete. */
  pending: VoltageStatus | null;
  count: number;
}

export const INITIAL_ALARM_STATE: AlarmPointState = { status: 'NORMAL', pending: null, count: 0 };

/** Faixa da leitura, com histerese na direção da melhora. */
export const bandFor = (voltageV: number, current: VoltageStatus): VoltageStatus => {
  const criticalExit = current === 'CRÍTICO' ? VOLTAGE_CRITICAL_V + ALARM_HYSTERESIS_V : VOLTAGE_CRITICAL_V;
  const warningExit = RANK[current] >= 1 ? VOLTAGE_WARNING_V + ALARM_HYSTERESIS_V : VOLTAGE_WARNING_V;
  if (voltageV < criticalExit) return 'CRÍTICO';
  if (voltageV < warningExit) return 'ATENÇÃO';
  return 'NORMAL';
};

/** Avança a máquina de estados de um ponto. `changed` indica transição confirmada. */
export const evaluateReading = (
  state: AlarmPointState,
  voltageV: number,
): { state: AlarmPointState; changed: boolean } => {
  const band = bandFor(voltageV, state.status);
  if (band === state.status) return { state: { status: state.status, pending: null, count: 0 }, changed: false };

  const count = state.pending === band ? state.count + 1 : 1;
  if (count >= ALARM_DEBOUNCE_SAMPLES) {
    return { state: { status: band, pending: null, count: 0 }, changed: true };
  }
  return { state: { status: state.status, pending: band, count }, changed: false };
};

const formatV = (voltageV: number) => `${Math.round(voltageV)} V`;

/** Texto do alarme para uma transição confirmada. */
export const alarmFor = (stationCode: string, previous: VoltageStatus, next: VoltageStatus, voltageV: number): SystemAlert => {
  const station = findStation(stationCode);
  const where = station ? `${station.substation} / ${station.name} (${station.code})` : stationCode;
  const timestamp = new Date().toISOString();

  if (next === 'CRÍTICO') {
    return {
      severity: 'CRITICAL',
      message:
        voltageV < NO_VOLTAGE_V
          ? `${where}: terceiro trilho sem tensão (${formatV(voltageV)}).`
          : `${where}: subtensão crítica no terceiro trilho — ${formatV(voltageV)} (< ${VOLTAGE_CRITICAL_V} V).`,
      timestamp,
    };
  }
  if (next === 'ATENÇÃO') {
    return {
      severity: 'WARNING',
      message:
        previous === 'CRÍTICO'
          ? `${where}: tensão em recuperação — ${formatV(voltageV)}, ainda abaixo de ${VOLTAGE_WARNING_V} V.`
          : `${where}: subtensão no terceiro trilho — ${formatV(voltageV)} (< ${VOLTAGE_WARNING_V} V).`,
      timestamp,
    };
  }
  return {
    severity: 'INFO',
    message: `${where}: tensão normalizada — ${formatV(voltageV)}.`,
    timestamp,
  };
};

/**
 * Monitor de alarmes SCADA do terceiro trilho.
 *
 * Observa cada lote de telemetria e só alarma em TRANSIÇÃO confirmada — com
 * debounce e histerese, como um SCADA real: uma estação parada em subtensão gera
 * um alarme, não um por ciclo; e um pico isolado não gera nenhum.
 */
export class VoltageAlarmMonitor {
  private readonly points = new Map<string, AlarmPointState>();

  private readonly onBatch = (batch: StationTelemetryDTO[]) => {
    for (const reading of batch) this.observe(reading);
  };

  public start(): void {
    domainEventBus.on('telemetry:updated', this.onBatch);
  }

  public stop(): void {
    domainEventBus.off('telemetry:updated', this.onBatch);
  }

  /** Estado de alarme reconhecido de cada estação. */
  public statusOf(stationCode: string): VoltageStatus {
    return this.points.get(stationCode)?.status ?? 'NORMAL';
  }

  public observe(reading: StationTelemetryDTO): void {
    if (!Number.isFinite(reading.voltageV)) return;
    const previous = this.points.get(reading.currentStationCode) ?? INITIAL_ALARM_STATE;
    const { state, changed } = evaluateReading(previous, reading.voltageV);
    this.points.set(reading.currentStationCode, state);
    if (changed) {
      domainEventBus.emit('system:alert', alarmFor(reading.currentStationCode, previous.status, state.status, reading.voltageV));
    }
  }
}
