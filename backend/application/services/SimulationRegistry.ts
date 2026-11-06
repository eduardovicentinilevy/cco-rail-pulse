// backend/application/services/SimulationRegistry.ts
import { TelemetrySimulator } from './TelemetrySimulator';
import { TrainMotionSimulator } from './TrainMotionSimulator';
import { PowerGrid } from './PowerGrid';
import { VoltageAlarmMonitor } from './VoltageAlarmMonitor';
import { PowerSectionRepository } from '../../infrastructure/database/repositories/PowerSectionRepository';
import { lineCatalogRepository } from '../../infrastructure/repositories/pg-line-catalog.repository';
import { createLogger } from '../../shared/logger';

const logger = createLogger('SIMULACAO');

interface LineSimulation {
  telemetry: TelemetrySimulator;
  motion: TrainMotionSimulator;
  grid: PowerGrid;
  alarms: VoltageAlarmMonitor;
}

/**
 * Simulação por linha.
 *
 * Antes havia um `TelemetrySimulator` e um `TrainMotionSimulator` para o
 * processo inteiro, o que só fazia sentido enquanto existisse uma única malha.
 * O registro mantém um conjunto por linha ativa — telemetria SCADA, motor de
 * operação, grade de energia e monitor de alarmes —, carregado no boot e
 * disponível para ganhar linhas novas sem reiniciar o servidor.
 *
 * A ligação entre essas peças também é daqui, e não do `server.ts`: é o que
 * mantém a composição lendo a tensão, a carga e o estado das seções só da
 * própria linha.
 */
export class SimulationRegistry {
  private readonly simulations = new Map<string, LineSimulation>();

  constructor(
    private readonly telemetryIntervalMs: number,
    private readonly timeScale: number,
  ) {}

  /** Sobe os simuladores de todas as linhas ativas. Idempotente. */
  public async startAll(): Promise<void> {
    const lineIds = await lineCatalogRepository.activeLineIds();

    for (const lineId of lineIds) {
      await this.startLine(lineId);
    }

    logger.info(`Simulação ativa em ${this.simulations.size} linha(s).`);
  }

  public async startLine(lineId: string): Promise<void> {
    if (this.simulations.has(lineId)) return;

    const catalog = await lineCatalogRepository.byId(lineId);
    if (!catalog) {
      logger.warn(`Linha ${lineId} não encontrada — simulação não iniciada.`);
      return;
    }
    if (catalog.size === 0) {
      // Uma linha sem estações cadastradas não tem o que simular; não é erro,
      // é uma linha recém-criada esperando o cadastro da malha.
      logger.warn(`Linha "${catalog.name}" está sem estações — simulação não iniciada.`);
      return;
    }

    // A grade de energia da linha: as seções são as subestações desta malha, e o
    // estado persistido é lido antes de qualquer ciclo — reiniciar o servidor não
    // reenergiza uma seção que a manutenção mandou desligar.
    const grid = new PowerGrid(catalog, PowerSectionRepository);
    await grid.load();

    // Telemetria e operação se alimentam mutuamente, dentro da mesma linha: os
    // trens em marcha derrubam a tensão da seção, e o trem que chega a uma estação
    // passa a ler a tensão dali. As funções só rodam depois do `start()`, então a
    // referência cruzada é segura.
    const telemetry = new TelemetrySimulator(catalog, this.telemetryIntervalMs, {
      loadAt: (substation) => motion.runningLoad(substation),
      isEnergized: grid.isEnergized,
    });
    const motion = new TrainMotionSimulator(catalog, {
      timeScale: this.timeScale,
      voltageAt: (code) => telemetry.readingFor(code),
      isEnergized: grid.isEnergized,
    });
    // Um monitor por linha: o barramento é do processo, e o lote de outra linha
    // não pode mexer no estado de alarme desta.
    const alarms = new VoltageAlarmMonitor(catalog);

    alarms.start();
    telemetry.start();
    motion.start();
    this.simulations.set(lineId, { telemetry, motion, grid, alarms });

    logger.info(`Simulação iniciada para "${catalog.name}" (${catalog.size} estações).`);
  }

  public stopLine(lineId: string): void {
    const simulation = this.simulations.get(lineId);
    if (!simulation) return;

    simulation.telemetry.stop();
    simulation.motion.stop();
    simulation.alarms.stop();
    this.simulations.delete(lineId);
  }

  public stopAll(): void {
    for (const lineId of [...this.simulations.keys()]) {
      this.stopLine(lineId);
    }
  }

  /** Estado corrente da malha de uma linha; vazio quando a linha não está simulada. */
  public snapshotOf(lineId: string): ReturnType<TelemetrySimulator['snapshot']> {
    return this.simulations.get(lineId)?.telemetry.snapshot() ?? [];
  }

  /** Motor de operação de uma linha; ausente quando a linha não está simulada. */
  public motionOf(lineId: string): TrainMotionSimulator | undefined {
    return this.simulations.get(lineId)?.motion;
  }

  /** Grade de energia de uma linha; ausente quando a linha não está simulada. */
  public gridOf(lineId: string): PowerGrid | undefined {
    return this.simulations.get(lineId)?.grid;
  }

  public get activeLines(): number {
    return this.simulations.size;
  }
}
