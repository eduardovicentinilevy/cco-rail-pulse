// backend/application/services/TelemetrySimulator.ts
import { classifyVoltage as classify, LINE_STATIONS } from '../../domain/line';
import { domainEventBus } from '../events/event-bus';
import type { StationTelemetryDTO } from '../dtos/TrainDTO';

/** Amplitude máxima da variação por ciclo, em volts. */
const DRIFT_STEP_V = 4;
/** Desvio máximo tolerado em relação à tensão de referência do trecho, em volts. */
export const MAX_DRIFT_V = 16;

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
      this.readings.set(station.code, station.nominalVoltageV);
    }
  }

  public get isRunning(): boolean {
    return this.timer !== null;
  }

  /** Última leitura de uma estação, em volts. */
  public readingFor(stationCode: string): number | undefined {
    return this.readings.get(stationCode);
  }

  /** Estado corrente da malha, enviado a cada painel que se conecta. */
  public snapshot(): StationTelemetryDTO[] {
    return LINE_STATIONS.map((station) => {
      const voltageV = this.readings.get(station.code) ?? station.nominalVoltageV;
      return { currentStationCode: station.code, voltageV, status: classify(voltageV) };
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
      const previous = this.readings.get(station.code) ?? station.nominalVoltageV;
      const drift = (Math.random() - 0.5) * 2 * DRIFT_STEP_V;
      // Leve atração de volta ao valor nominal, evitando deriva acumulada.
      const pull = (station.nominalVoltageV - previous) * 0.15;
      const next = clamp(
        Number((previous + drift + pull).toFixed(1)),
        station.nominalVoltageV - MAX_DRIFT_V,
        station.nominalVoltageV + MAX_DRIFT_V,
      );

      this.readings.set(station.code, next);
      return { currentStationCode: station.code, voltageV: next, status: classify(next) };
    });
  }
}
