// backend/domain/line.ts
// Tipos e catálogo da malha de uma linha.
//
// As estações deixaram de ser constante de código: cada linha tem a sua, e o
// catálogo é montado a partir do banco por LineCatalogRepository. Um catálogo é
// imutável e sempre pertence a uma linha — não existe "a malha" no singular.

import { ValidationError } from '../shared/errors';

export interface LineStation {
  readonly id: string;
  /** Ordem física da estação no traçado (1 = primeiro terminal). */
  readonly position: number;
  readonly code: string;
  readonly name: string;
  /** Subestação de tração que alimenta o trecho. */
  readonly substation: string;
  /** Tensão nominal de projeto da catenária, em kV. */
  readonly nominalVoltageKV: number;
  /** Intervalo entre composições, em segundos. */
  readonly headwaySeconds: number | null;
  /** Posição normalizada (0–1) no traçado esquemático, para o mapa do painel. */
  readonly mapX: number | null;
  readonly mapY: number | null;
}

export interface LineIdentity {
  readonly id: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly code: string;
  readonly name: string;
}

export const normalizeStationCode = (value: unknown): string => String(value ?? '').trim().toUpperCase();

/**
 * Malha de uma linha: identidade da linha mais as suas estações em ordem física.
 *
 * Substitui as constantes `LINE_NAME`/`LINE_STATIONS`, que só sabiam descrever
 * uma linha por processo. Quem precisa validar ou percorrer a malha recebe o
 * catálogo da linha em que está operando.
 */
export class LineCatalog {
  public readonly stations: readonly LineStation[];
  public readonly codes: readonly string[];
  private readonly byCode: ReadonlyMap<string, LineStation>;
  private readonly indexByCode: ReadonlyMap<string, number>;

  constructor(
    public readonly line: LineIdentity,
    stations: readonly LineStation[],
  ) {
    this.stations = [...stations].sort((a, b) => a.position - b.position);
    this.codes = this.stations.map((station) => station.code);
    this.byCode = new Map(this.stations.map((station) => [station.code, station]));
    this.indexByCode = new Map(this.stations.map((station, index) => [station.code, index]));
  }

  public get id(): string {
    return this.line.id;
  }

  public get tenantId(): string {
    return this.line.tenantId;
  }

  public get name(): string {
    return this.line.name;
  }

  public get size(): number {
    return this.stations.length;
  }

  public find(code: string): LineStation | undefined {
    return this.byCode.get(normalizeStationCode(code));
  }

  public has(code: string): boolean {
    return this.byCode.has(normalizeStationCode(code));
  }

  /** Índice na ordem física, ou -1 — o simulador de deslocamento anda por índice. */
  public indexOf(code: string): number {
    return this.indexByCode.get(normalizeStationCode(code)) ?? -1;
  }

  public at(index: number): LineStation | undefined {
    return this.stations[index];
  }

  /** Estação da malha, ou erro de validação nomeando a linha — nunca outra linha. */
  public requireStation(code: string): LineStation {
    const station = this.find(code);
    if (!station) {
      throw new ValidationError(`A estação "${normalizeStationCode(code)}" não pertence à malha da ${this.name}.`);
    }
    return station;
  }
}
