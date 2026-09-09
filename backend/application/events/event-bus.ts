// backend/application/events/event-bus.ts
import { EventEmitter } from 'events';
import type { StationTelemetryDTO } from '../dtos/TrainDTO';
import type { TrainSnapshot } from '../../domain/entities/TrainSession';

export interface SystemAlert {
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  timestamp: string;
}

/** Contrato dos eventos de domínio publicados no barramento. */
export interface DomainEvents {
  'telemetry:updated': [StationTelemetryDTO[]];
  'train:updated': [TrainSnapshot];
  'system:alert': [SystemAlert];
}

type EventName = keyof DomainEvents;

/**
 * Barramento de eventos de domínio (singleton, tipado).
 * Desacopla emissores de telemetria dos gateways de transporte (WebSocket).
 */
class DomainEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Cada painel conectado registra listeners próprios; elevamos o limite para evitar falsos alarmes.
    this.emitter.setMaxListeners(200);
  }

  public on<E extends EventName>(event: E, listener: (...args: DomainEvents[E]) => void): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  public off<E extends EventName>(event: E, listener: (...args: DomainEvents[E]) => void): this {
    this.emitter.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  public emit<E extends EventName>(event: E, ...args: DomainEvents[E]): boolean {
    return this.emitter.emit(event, ...args);
  }

  public removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

export const domainEventBus = new DomainEventBus();
