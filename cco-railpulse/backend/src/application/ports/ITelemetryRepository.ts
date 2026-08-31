import { TelemetryEvent } from '../../domain/entities/TelemetryEvent';

export interface ITelemetryRepository {
  save(event: TelemetryEvent): Promise<void>;
  findLatest(): Promise<TelemetryEvent[]>;
}