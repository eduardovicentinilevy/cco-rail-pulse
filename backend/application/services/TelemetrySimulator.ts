// backend/application/services/TelemetrySimulator.ts
import { LINE_STATIONS } from '../../domain/line';
import { domainEventBus } from '../events/event-bus';
import type { StationTelemetryDTO } from '../dtos/TrainDTO';

/** Abaixo deste valor a catenária é considerada crítica para tração. */
const CRITICAL_THRESHOLD_KV = 22.5;
/** Abaixo deste valor a subestação entra em atenção. */
const WARNING_THRESHOLD_KV = 23.8;
/** Amplitude máxima da variação por ciclo, em kV. */
const DRIFT_STEP_KV = 0.12;
/** Desvio máximo tolerado em relação à tensão nominal, em kV. */
const MAX_DRIFT_KV = 0.5;

const classify = (voltageKV: number): StationTelemetryDTO['status'] => {
  if (voltageKV < CRITICAL_THRESHOLD_KV) return 'CRÍTICO';
  if (voltageKV < WARNING_THRESHOLD_KV) return 'ATENÇÃO';
  return 'NORMAL';
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Simulador de hardware SCADA.
 *
 * Substitui o `Math.random()` puro por um *random walk* ancorado na tensão nominal
 * de cada subestação: a leitura oscila de forma contínua e plausível, o que produz
 * gráficos legíveis em vez de ruído branco.
 */
export class TelemetrySimulator {
  private timer: NodeJS.Timeout | null = null;
  private readonly readings = new Map<string, number>();

  constructor(private readonly intervalMs: number) {
    for (const station of LINE_STATIONS) {
      this.readings.set(station.code, station.nominalVoltageKV);
    }
  }

  public get isRunning(): boolean {
    return this.timer !== null;
  }

  /** Estado corrente da malha, enviado a cada painel que se conecta. */
  public snapshot(): StationTelemetryDTO[] {
    return LINE_STATIONS.map((station) => {
      const voltageKV = this.readings.get(station.code) ?? station.nominalVoltageKV;
      return { currentStationCode: station.code, voltageKV, status: classify(voltageKV) };
    });
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => domainEventBus.emit('telemetry:updated', this.tick()), this.intervalMs);
    // Não impede o processo de encerrar durante um shutdown gracioso.
    this.timer.unref?.();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): StationTelemetryDTO[] {
    return LINE_STATIONS.map((station) => {
      const previous = this.readings.get(station.code) ?? station.nominalVoltageKV;
      const drift = (Math.random() - 0.5) * 2 * DRIFT_STEP_KV;
      // Leve atração de volta ao valor nominal, evitando deriva acumulada.
      const pull = (station.nominalVoltageKV - previous) * 0.15;
      const next = clamp(
        Number((previous + drift + pull).toFixed(2)),
        station.nominalVoltageKV - MAX_DRIFT_KV,
        station.nominalVoltageKV + MAX_DRIFT_KV,
      );

      this.readings.set(station.code, next);
      return { currentStationCode: station.code, voltageKV: next, status: classify(next) };
    });
  }
}
