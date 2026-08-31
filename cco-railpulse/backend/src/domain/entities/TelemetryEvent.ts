export class TelemetryEvent {
  constructor(
    public readonly trainId: string,
    public readonly lineId: string,
    public readonly stationId: string,
    public readonly speed: number,
    public readonly timestamp: Date,
    public readonly isStopped: boolean
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.trainId || !this.lineId) {
      throw new Error('TrainId and LineId are required for telemetry events.');
    }
    if (this.speed < 0) {
      throw new Error('Speed cannot be negative.');
    }
  }
}