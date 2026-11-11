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
  /** Subestação retificadora (SR) que alimenta o trilho de alimentação no trecho. */
  readonly substation: string;
  /** Tensão de referência do trecho que alimenta a estação, em volts. */
  readonly nominalVoltageV: number;
  /** Integrações com outras linhas e modais, como sinalizadas na estação. */
  readonly connections: readonly string[];
  /** Intervalo entre composições, em segundos. */
  readonly headwaySeconds: number | null;
  /** Posição normalizada (0–1) no traçado esquemático, para o mapa do painel. */
  readonly mapX: number | null;
  readonly mapY: number | null;
  /**
   * Coordenadas da estação (WGS 84) — base das distâncias entre estações, e
   * portanto da marcha simulada. São cadastro como o resto da malha, e podem
   * faltar: uma linha recém-cadastrada opera com trecho de comprimento nominal
   * até alguém informar as coordenadas.
   */
  readonly lat: number | null;
  readonly lon: number | null;
}

export interface LineIdentity {
  readonly id: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly code: string;
  readonly name: string;
  /**
   * Fator de traçado da linha: quanto a via é mais longa que a reta entre as
   * estações. Calibra a soma das distâncias para a extensão conhecida da linha,
   * e por isso é dela — 1 significa "sem correção informada".
   */
  readonly alignmentFactor: number;
}

export const normalizeStationCode = (value: unknown): string => String(value ?? '').trim().toUpperCase();

/**
 * Modelo elétrico da tração, em volts de corrente contínua.
 *
 * Fica em código, e não no cadastro da linha, porque descreve o sistema de
 * alimentação da instalação, não a malha: as estações e as subestações são
 * dado, os limiares de subtensão são a regra que o CCO aplica sobre elas. Uma
 * linha alimentada por catenária em kV precisaria destes valores por linha —
 * está anotado na seção 9 de `docs/multi-tenant.md` como passo seguinte.
 *
 * Os limiares ficam bem acima do mínimo permanente que a EN 50163 admite para
 * 750 Vcc (500 V): o objetivo é avisar o operador antes que o desempenho de
 * tração caia, não no limite normativo. Onde a concessionária não divulga a
 * tensão de tração, 750 Vcc é premissa declarada do modelo — a classe dos
 * metrôs de captação no solo de São Paulo.
 */
export const TRACTION_NOMINAL_V = 750;
export const VOLTAGE_WARNING_V = 700;
export const VOLTAGE_CRITICAL_V = 640;

export type VoltageStatus = 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO';

export const classifyVoltage = (voltageV: number): VoltageStatus => {
  if (voltageV < VOLTAGE_CRITICAL_V) return 'CRÍTICO';
  if (voltageV < VOLTAGE_WARNING_V) return 'ATENÇÃO';
  return 'NORMAL';
};

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
  /** Atalho para `line.alignmentFactor`, que a marcha consulta ao medir os trechos. */
  public readonly alignmentFactor: number;
  private readonly byCode: ReadonlyMap<string, LineStation>;
  private readonly indexByCode: ReadonlyMap<string, number>;

  constructor(
    public readonly line: LineIdentity,
    stations: readonly LineStation[],
  ) {
    this.stations = [...stations].sort((a, b) => a.position - b.position);
    this.alignmentFactor = line.alignmentFactor > 0 ? line.alignmentFactor : 1;
    this.codes = this.stations.map((station) => station.code);
    this.byCode = new Map(this.stations.map((station) => [station.code, station]));
    this.indexByCode = new Map(this.stations.map((station, index) => [station.code, index]));
  }

  /**
   * Terminais do traçado, na ordem física.
   *
   * Substitui `LINE_TERMINALS`, que nomeava os extremos por ponto cardeal: o
   * sentido do traçado é da linha, e nem toda linha corre de oeste para leste.
   */
  public get terminals(): { first: string; last: string } | null {
    const first = this.stations[0];
    const last = this.stations[this.stations.length - 1];
    if (!first || !last) return null;
    return { first: first.name, last: last.name };
  }

  /**
   * Subestações retificadoras na ordem do traçado, sem repetição.
   *
   * Substitui `LINE_SUBSTATIONS`: as SRs são as da malha cadastrada, e duas
   * linhas podem ter uma `SR-01` cada uma, sem relação entre elas.
   */
  public get substations(): readonly string[] {
    return [...new Set(this.stations.map((station) => station.substation))];
  }

  /** Estações alimentadas por uma subestação, na ordem do traçado. */
  public stationsOf(substation: string): readonly LineStation[] {
    return this.stations.filter((station) => station.substation === substation);
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
