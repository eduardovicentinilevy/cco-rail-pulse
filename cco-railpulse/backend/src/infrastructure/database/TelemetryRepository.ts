import { ITelemetryRepository } from '../../application/ports/ITelemetryRepository';
import { TelemetryEvent } from '../../domain/entities/TelemetryEvent';

export class TelemetryRepository implements ITelemetryRepository {
  private events: TelemetryEvent[] = [];

  async save(event: TelemetryEvent): Promise<void> {
    this.events.unshift(event);
    if (this.events.length > 100) this.events.pop();
  }

  async findLatest(): Promise<TelemetryEvent[]> {
    return this.events;
  }
}