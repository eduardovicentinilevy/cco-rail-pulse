// backend/application/events/event-bus.ts
import { EventEmitter } from 'events';
import type { StationTelemetryDTO } from '../dtos/TrainDTO';
import type { TrainSnapshot } from '../../domain/entities/TrainSession';
import type { IncidentSnapshot } from '../../domain/entities/Incident';

export interface SystemAlert {
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  timestamp: string;
}

/**
 * Evento carimbado com a linha de origem.
 *
 * O barramento é um só para o processo inteiro, mas cada evento pertence a uma
 * linha. Sem o carimbo, o gateway não teria como entregar a telemetria de um
 * cliente apenas aos painéis daquele cliente.
 */
export interface LineEvent<T> {
  lineId: string;
  payload: T;
}

/** Contrato dos eventos de domínio publicados no barramento. */
export interface DomainEvents {
  'telemetry:updated': [LineEvent<StationTelemetryDTO[]>];
  'train:updated': [LineEvent<TrainSnapshot>];
  'incident:changed': [LineEvent<IncidentSnapshot>];
  'system:alert': [LineEvent<SystemAlert>];
  /**
   * Operador desativado — o gateway WS derruba qualquer socket já aberto em nome dele.
   * Não é evento de linha: o operador pertence ao cliente, e o id aqui é a chave
   * interna (UUID), única em toda a instalação.
   */
  'operator:deactivated': [{ operatorId: string }];
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
