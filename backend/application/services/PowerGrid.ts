// backend/application/services/PowerGrid.ts
import { LineCatalog } from '../../domain/line';
import { ValidationError } from '../../shared/errors';
import { domainEventBus } from '../events/event-bus';
import type { PowerSectionRecord } from '../../infrastructure/database/repositories/PowerSectionRepository';

/** Persistência mínima de que o serviço precisa — injetável para testes. */
export interface PowerSectionStore {
  list(lineId: string): Promise<PowerSectionRecord[]>;
  save(lineId: string, record: PowerSectionRecord): Promise<void>;
}

export interface PowerSectionSnapshot extends PowerSectionRecord {
  /** Estações alimentadas por esta subestação, na ordem do traçado. */
  stationCodes: string[];
}

export interface PowerChangeRequest {
  substation: string;
  energized: boolean;
  reason: string;
  operatorId: string;
}

/** Motivo obrigatório para tirar uma seção de serviço — fica na trilha e no alarme. */
export const MIN_DEENERGIZE_REASON_LENGTH = 10;

const defaultRecord = (substation: string): PowerSectionRecord => ({
  substation,
  energized: true,
  reason: null,
  changedBy: null,
  changedAt: new Date(0).toISOString(),
});

/**
 * Estado de alimentação do terceiro trilho de uma linha, seção a seção (uma por SR).
 *
 * As seções são as subestações da malha cadastrada, não uma lista em código: há
 * uma grade por linha, e a `SR-01` de um cliente não é a de outro. Fica em
 * memória para o simulador consultar a cada ciclo sem ir ao banco, e é persistida
 * a cada mudança: reiniciar o servidor não reenergiza, por engano, uma seção que
 * a manutenção mandou desligar.
 */
export class PowerGrid {
  private readonly sections: Map<string, PowerSectionRecord>;

  constructor(
    private readonly catalog: LineCatalog,
    private readonly store: PowerSectionStore,
  ) {
    this.sections = new Map(catalog.substations.map((substation) => [substation, defaultRecord(substation)]));
  }

  public async load(): Promise<void> {
    for (const record of await this.store.list(this.catalog.id)) {
      if (this.sections.has(record.substation)) this.sections.set(record.substation, record);
    }
  }

  public isEnergized = (substation: string): boolean => this.sections.get(substation)?.energized ?? true;

  public snapshot(): PowerSectionSnapshot[] {
    return this.catalog.substations.map((substation) => ({
      ...(this.sections.get(substation) ?? defaultRecord(substation)),
      stationCodes: this.catalog.stationsOf(substation).map((station) => station.code),
    }));
  }

  /** Abre ou fecha os disjuntores de uma seção. Devolve `null` se ela já estava no estado pedido. */
  public async setState(request: PowerChangeRequest): Promise<PowerSectionSnapshot | null> {
    const substation = request.substation.trim().toUpperCase();
    const current = this.sections.get(substation);
    if (!current) {
      throw new ValidationError(
        `A subestação "${substation}" não alimenta a malha da ${this.catalog.name}. ` +
          `Use uma de: ${this.catalog.substations.join(', ')}.`,
      );
    }

    const reason = request.reason.trim();
    if (!request.energized && reason.length < MIN_DEENERGIZE_REASON_LENGTH) {
      throw new ValidationError(
        `Informe o motivo da desenergização (ao menos ${MIN_DEENERGIZE_REASON_LENGTH} caracteres).`,
      );
    }
    if (current.energized === request.energized) return null;

    const next: PowerSectionRecord = {
      substation,
      energized: request.energized,
      reason: reason || null,
      changedBy: request.operatorId,
      changedAt: new Date().toISOString(),
    };
    await this.store.save(this.catalog.id, next);
    this.sections.set(substation, next);

    const snapshot: PowerSectionSnapshot = {
      ...next,
      stationCodes: this.catalog.stationsOf(substation).map((station) => station.code),
    };
    const lineId = this.catalog.id;
    domainEventBus.emit('power:changed', { lineId, payload: snapshot });
    domainEventBus.emit('system:alert', {
      lineId,
      payload: {
        severity: request.energized ? 'INFO' : 'WARNING',
        message: request.energized
          ? `Seção ${substation} reenergizada por ${request.operatorId} — terceiro trilho com tensão (${snapshot.stationCodes.join(', ')}).`
          : `Seção ${substation} desenergizada por ${request.operatorId}: ${reason} (${snapshot.stationCodes.join(', ')}).`,
        timestamp: next.changedAt,
      },
    });
    return snapshot;
  }
}
