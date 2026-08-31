import { TelemetryEvent } from '../../domain/entities/TelemetryEvent';
import { ITelemetryRepository } from '../ports/ITelemetryRepository';

interface TelemetryInputDTO {
  trainId: string;
  lineId: string;
  stationId: string;
  speed: number;
  timestamp: string;
  isStopped: boolean;
}

export class ProcessTelemetryUseCase {
  constructor(private readonly telemetryRepo: ITelemetryRepository) {}

  public async execute(input: TelemetryInputDTO): Promise<void> {
    const event = new TelemetryEvent(
      input.trainId,
      input.lineId,
      input.stationId,
      input.speed,
      new Date(input.timestamp),
      input.isStopped
    );

    await this.telemetryRepo.save(event);
  }
}