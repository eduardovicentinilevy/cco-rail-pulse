// src/domain/entities/TrainSession.ts
export class TrainSession {
  constructor(
    public readonly trainId: string,
    public currentStationCode: string,
    public speedKmH: number,
    public voltageKV: number,
    public status: 'NORMAL' | 'ATENÇÃO' | 'EMERGÊNCIA',
    public updatedAt: Date
  ) {}

  public updateTelemetry(speed: number, voltage: number, status: 'NORMAL' | 'ATENÇÃO' | 'EMERGÊNCIA'): void {
    if (speed < 0) throw new Error("A velocidade não pode ser negativa.");
    this.speedKmH = speed;
    this.voltageKV = voltage;
    this.status = status;
    this.updatedAt = new Date();
  }
}