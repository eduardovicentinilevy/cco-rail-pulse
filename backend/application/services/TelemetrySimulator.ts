// backend/application/services/TelemetrySimulator.ts
import { classifyVoltage as classify } from '../../domain/line';
import type { LineCatalog } from '../../domain/line';
import { domainEventBus } from '../events/event-bus';
import type { StationTelemetryDTO } from '../dtos/TrainDTO';

/** Amplitude máxima da variação por ciclo, em volts. */
const DRIFT_STEP_V = 4;
/** Desvio máximo tolerado em relação à tensão de referência do trecho, em volts. */
export const MAX_DRIFT_V = 16;

/**
 * Queda de tensão por composição em marcha na seção, em volts: o trem acelerando
 * puxa corrente e a tensão no terceiro trilho afunda — mais perto da subestação,
 * menos; o valor aqui é a média do trecho.
 */
export const LOAD_SAG_V_PER_TRAIN = 9;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface TelemetrySimulatorOptions {
  /** Composições em marcha alimentadas pela subestação. */
  loadAt?: (substation: string) => number;
  /** A seção está energizada? Desenergizada, o terceiro trilho lê 0 V. */
  isEnergized?: (substation: string) => boolean;
}

/**
 * Simulador de hardware SCADA de uma linha.
 *
 * Substitui o `Math.random()` puro por um *random walk* ancorado na tensão nominal
 * de cada subestação: a leitura oscila de forma contínua e plausível, o que produz
 * gráficos legíveis em vez de ruído branco.
 *
 * Existe uma instância por linha ativa, criada pelo `SimulationRegistry` — antes
 * era um singleton, o que só funcionava enquanto houvesse uma malha no processo.
 */
export class TelemetrySimulator {
  private timer: NodeJS.Timeout | null = null;
  private readonly readings = new Map<string, number>();

  private readonly loadAt: (substation: string) => number;
  private readonly isEnergized: (substation: string) => boolean;

  constructor(
    private readonly catalog: LineCatalog,
    private readonly intervalMs: number,
    options: TelemetrySimulatorOptions = {},
  ) {
    this.loadAt = options.loadAt ?? (() => 0);
    this.isEnergized = options.isEnergized ?? (() => true);
    for (const station of catalog.stations) {
      this.readings.set(station.code, station.nominalVoltageV);
    }
  }

  public get lineId(): string {
    return this.catalog.id;
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
    return this.catalog.stations.map((station) => {
      // Antes do primeiro ciclo a leitura guardada ainda é a nominal — a seção
      // desenergizada precisa aparecer sem tensão já no primeiro painel conectado.
      const voltageV = this.isEnergized(station.substation)
        ? (this.readings.get(station.code) ?? station.nominalVoltageV)
        : 0;
      return {
        stationId: station.id,
        currentStationCode: station.code,
        voltageV,
        status: classify(voltageV),
      };
    });
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(
      () => domainEventBus.emit('telemetry:updated', { lineId: this.catalog.id, payload: this.tick() }),
      this.intervalMs,
    );
    // Não impede o processo de encerrar durante um shutdown gracioso.
    this.timer.unref?.();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Um ciclo de leitura. Público para os testes; o timer chama sozinho. */
  public tick(): StationTelemetryDTO[] {
    return this.catalog.stations.map((station) => {
      // Seção desenergizada: disjuntores abertos, terceiro trilho sem tensão.
      if (!this.isEnergized(station.substation)) {
        this.readings.set(station.code, 0);
        return {
          stationId: station.id,
          currentStationCode: station.code,
          voltageV: 0,
          status: classify(0),
        };
      }

      // Alvo do trecho: a referência menos a queda provocada pelos trens em marcha.
      const target = station.nominalVoltageV - LOAD_SAG_V_PER_TRAIN * Math.max(0, this.loadAt(station.substation));
      const stored = this.readings.get(station.code) ?? station.nominalVoltageV;
      // Reenergizada agora: a tensão volta direto ao patamar do trecho, sem "subir" do zero.
      const previous = stored <= 0 ? target : stored;
      const drift = (Math.random() - 0.5) * 2 * DRIFT_STEP_V;
      // Atração de volta ao alvo, evitando deriva acumulada.
      const pull = (target - previous) * 0.15;
      const next = clamp(Number((previous + drift + pull).toFixed(1)), target - MAX_DRIFT_V, target + MAX_DRIFT_V);

      this.readings.set(station.code, next);
      return { stationId: station.id, currentStationCode: station.code, voltageV: next, status: classify(next) };
    });
  }
}
