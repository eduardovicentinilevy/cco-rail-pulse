// backend/application/services/TelemetryArchiver.ts
import { domainEventBus } from '../events/event-bus';
import { TelemetryRepository } from '../../infrastructure/database/repositories/TelemetryRepository';
import type { TelemetryBucket } from '../../infrastructure/database/repositories/TelemetryRepository';
import { createLogger } from '../../shared/logger';
import type { StationTelemetryDTO } from '../dtos/TrainDTO';

const logger = createLogger('TELEMETRY-ARCHIVE');

interface Accumulator {
  min: number;
  max: number;
  sum: number;
  count: number;
}

/**
 * Arquiva a telemetria em série histórica.
 *
 * Gravar cada leitura geraria ~5 escritas por segundo; em vez disso as leituras
 * são acumuladas em memória por janela (padrão: 60 s) e descarregadas em uma
 * única escrita em lote por janela, com poda periódica do período de retenção.
 */
export class TelemetryArchiver {
  private readonly accumulators = new Map<string, Accumulator>();
  private currentBucketAt: Date | null = null;
  private pruneCounter = 0;
  private started = false;

  /** Poda a cada N janelas descarregadas (60 janelas de 60 s ≈ 1 h). */
  private static readonly PRUNE_EVERY_FLUSHES = 60;

  constructor(
    private readonly bucketSeconds: number,
    private readonly retentionDays: number,
  ) {}

  private readonly onTelemetry = (batch: StationTelemetryDTO[]): void => {
    const bucketAt = this.bucketFor(new Date());

    if (this.currentBucketAt && bucketAt.getTime() !== this.currentBucketAt.getTime()) {
      // A janela virou: descarrega a anterior antes de acumular a nova leitura.
      void this.flush(this.currentBucketAt);
    }

    this.currentBucketAt = bucketAt;

    for (const reading of batch) {
      const accumulator = this.accumulators.get(reading.currentStationCode);
      if (accumulator) {
        accumulator.min = Math.min(accumulator.min, reading.voltageKV);
        accumulator.max = Math.max(accumulator.max, reading.voltageKV);
        accumulator.sum += reading.voltageKV;
        accumulator.count += 1;
      } else {
        this.accumulators.set(reading.currentStationCode, {
          min: reading.voltageKV,
          max: reading.voltageKV,
          sum: reading.voltageKV,
          count: 1,
        });
      }
    }
  };

  public start(): void {
    if (this.started) return;
    this.started = true;
    domainEventBus.on('telemetry:updated', this.onTelemetry);
    logger.info(`Arquivamento ativo (janela de ${this.bucketSeconds}s, retenção de ${this.retentionDays} dias).`);
  }

  /** Descarrega a janela pendente e encerra a assinatura. */
  public async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    domainEventBus.off('telemetry:updated', this.onTelemetry);
    if (this.currentBucketAt) await this.flush(this.currentBucketAt);
  }

  /** Início da janela que contém `date`, alinhado ao tamanho da janela. */
  private bucketFor(date: Date): Date {
    const windowMs = this.bucketSeconds * 1000;
    return new Date(Math.floor(date.getTime() / windowMs) * windowMs);
  }

  private async flush(bucketAt: Date): Promise<void> {
    if (this.accumulators.size === 0) return;

    const buckets: TelemetryBucket[] = Array.from(this.accumulators.entries()).map(([stationCode, acc]) => ({
      stationCode,
      bucketAt,
      minKV: Number(acc.min.toFixed(2)),
      avgKV: Number((acc.sum / acc.count).toFixed(2)),
      maxKV: Number(acc.max.toFixed(2)),
      readings: acc.count,
    }));

    this.accumulators.clear();

    try {
      await TelemetryRepository.saveBuckets(buckets);

      this.pruneCounter += 1;
      if (this.pruneCounter >= TelemetryArchiver.PRUNE_EVERY_FLUSHES) {
        this.pruneCounter = 0;
        const removed = await TelemetryRepository.prune(this.retentionDays);
        if (removed > 0) logger.info(`Poda da série histórica: ${removed} janelas removidas.`);
      }
    } catch (error) {
      // Falha ao arquivar não pode interromper a telemetria ao vivo.
      logger.error('Falha ao gravar a janela de telemetria.', error);
    }
  }
}
