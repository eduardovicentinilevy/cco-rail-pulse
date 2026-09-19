// backend/application/services/SimulationRegistry.ts
import { TelemetrySimulator } from './TelemetrySimulator';
import { TrainMotionSimulator } from './TrainMotionSimulator';
import { lineCatalogRepository } from '../../infrastructure/repositories/pg-line-catalog.repository';
import { createLogger } from '../../shared/logger';

const logger = createLogger('SIMULACAO');

interface LineSimulation {
  telemetry: TelemetrySimulator;
  motion: TrainMotionSimulator;
}

/**
 * Simuladores por linha.
 *
 * Antes havia um `TelemetrySimulator` e um `TrainMotionSimulator` para o
 * processo inteiro, o que só fazia sentido enquanto existisse uma única malha.
 * O registro mantém um par por linha ativa, carregado no boot e disponível para
 * ganhar linhas novas sem reiniciar o servidor.
 */
export class SimulationRegistry {
  private readonly simulations = new Map<string, LineSimulation>();

  constructor(
    private readonly telemetryIntervalMs: number,
    private readonly trainMotionIntervalMs: number,
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

    const telemetry = new TelemetrySimulator(catalog, this.telemetryIntervalMs);
    const motion = new TrainMotionSimulator(catalog, this.trainMotionIntervalMs);

    telemetry.start();
    motion.start();
    this.simulations.set(lineId, { telemetry, motion });

    logger.info(`Simulação iniciada para "${catalog.name}" (${catalog.size} estações).`);
  }

  public stopLine(lineId: string): void {
    const simulation = this.simulations.get(lineId);
    if (!simulation) return;

    simulation.telemetry.stop();
    simulation.motion.stop();
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

  public get activeLines(): number {
    return this.simulations.size;
  }
}
