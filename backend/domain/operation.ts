// backend/domain/operation.ts
// Regras de marcha de uma linha: distâncias entre estações, perfil de velocidade,
// tempos de parada e sentido de circulação. Tudo puro — sem I/O — para que o
// simulador e a previsão de chegadas usem exatamente as mesmas contas.
//
// Nada aqui é "a linha": o perfil de tração (velocidade, aceleração, paradas) é
// regra da instalação e fica em código; a geometria vem do catálogo da linha em
// que se está operando. `LineOperation` é essa geometria já calculada, uma por
// catálogo — duas linhas do mesmo processo têm trechos de comprimentos distintos.
import { LineCatalog } from './line';
import type { LineStation } from './line';

/** 1 = sentido do último terminal do traçado; -1 = sentido do primeiro. */
export type Direction = 1 | -1;

export const isDirection = (value: unknown): value is Direction => value === 1 || value === -1;

/** Velocidade máxima de linha adotada pela marcha simulada, em km/h. */
export const LINE_SPEED_KMH = 80;
/** Aceleração de partida e desaceleração de frenagem de serviço, em m/s². */
export const ACCELERATION_MS2 = 1.0;
export const SERVICE_BRAKING_MS2 = 1.0;

/**
 * Fator de traçado adotado quando a linha não tem o seu cadastrado.
 *
 * As coordenadas dão a distância em linha reta; o traçado real tem curvas, e o
 * fator calibra a soma das distâncias para a extensão conhecida da linha. Ele
 * não é regra da instalação: é medida de um traçado — a mesma malha medida com
 * 1,015 numa linha e 1,163 noutra. Por isso é cadastro (`lines.alignment_factor`),
 * e quem não informou opera com a soma em linha reta, sem correção inventada.
 */
export const DEFAULT_ALIGNMENT_FACTOR = 1;

/**
 * Comprimento adotado para um trecho cujas estações não têm coordenada, em metros.
 *
 * As coordenadas são cadastro como o resto da malha e podem faltar: uma linha
 * recém-cadastrada opera com trecho de comprimento nominal até alguém informá-las.
 * O valor é a ordem de grandeza do entre-estações de um metrô urbano; a marcha
 * simulada fica plausível, e as distâncias reais aparecem assim que o cadastro
 * as tiver.
 */
export const NOMINAL_SEGMENT_LENGTH_M = 1_130;

/** Parada típica numa estação, em ms. Estações de integração têm mais embarque. */
export const DWELL_MS = 25_000;
export const TRANSFER_DWELL_MS = 35_000;
/** Manobra de inversão de sentido num terminal, em ms. */
export const TERMINAL_TURNAROUND_MS = 120_000;

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Distância de círculo máximo entre dois pontos, em metros. */
export const haversineM = (a: GeoPoint, b: GeoPoint): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

export const coordinatesOf = (station: Pick<LineStation, 'lat' | 'lon'>): GeoPoint | null =>
  station.lat === null || station.lon === null ? null : { lat: station.lat, lon: station.lon };

/**
 * Comprimento do trecho entre duas estações vizinhas, em metros.
 *
 * Sem coordenada em uma das pontas — ou com as duas no mesmo ponto, que é
 * cadastro errado — vale o comprimento nominal: um trecho de comprimento zero
 * faria a composição atravessá-lo instantaneamente.
 */
export const segmentLengthBetween = (
  from: LineStation,
  to: LineStation,
  alignmentFactor: number = DEFAULT_ALIGNMENT_FACTOR,
): number => {
  const a = coordinatesOf(from);
  const b = coordinatesOf(to);
  if (!a || !b) return NOMINAL_SEGMENT_LENGTH_M;
  const factor = alignmentFactor > 0 ? alignmentFactor : DEFAULT_ALIGNMENT_FACTOR;
  const length = Math.round(haversineM(a, b) * factor);
  return length > 0 ? length : NOMINAL_SEGMENT_LENGTH_M;
};

/**
 * Tempo de percurso de parada a parada, em ms, com perfil trapezoidal:
 * acelera até `maxSpeedKmH`, mantém, e freia até parar. Num trecho curto demais
 * para atingir a velocidade máxima o perfil vira triangular.
 */
export const runTimeMs = (distanceM: number, maxSpeedKmH: number): number => {
  if (!(distanceM > 0) || !(maxSpeedKmH > 0)) return 0;

  const vMax = maxSpeedKmH / 3.6;
  const accelerationDistance = (vMax * vMax) / (2 * ACCELERATION_MS2);
  const brakingDistance = (vMax * vMax) / (2 * SERVICE_BRAKING_MS2);

  if (distanceM >= accelerationDistance + brakingDistance) {
    const cruiseSeconds = (distanceM - accelerationDistance - brakingDistance) / vMax;
    return Math.round((vMax / ACCELERATION_MS2 + cruiseSeconds + vMax / SERVICE_BRAKING_MS2) * 1000);
  }

  const vPeak = Math.sqrt(
    (2 * distanceM * ACCELERATION_MS2 * SERVICE_BRAKING_MS2) / (ACCELERATION_MS2 + SERVICE_BRAKING_MS2),
  );
  return Math.round((vPeak / ACCELERATION_MS2 + vPeak / SERVICE_BRAKING_MS2) * 1000);
};

/**
 * Marcha de uma linha: a geometria do catálogo já reduzida ao que a operação
 * consulta a cada ciclo (comprimento de cada trecho, vizinhança, terminais).
 *
 * Substitui as constantes de módulo `SEGMENT_LENGTH_BY_KEY`, `LINE_LENGTH_M` e
 * `DIRECTION_LABELS`, que só sabiam descrever uma linha por processo.
 */
export class LineOperation {
  private readonly segmentLengthByKey: ReadonlyMap<string, number>;
  /** Extensão total da linha, em metros. */
  public readonly lineLengthM: number;

  constructor(public readonly catalog: LineCatalog) {
    const lengths = new Map<string, number>();
    let total = 0;
    for (let index = 0; index < catalog.stations.length - 1; index += 1) {
      const from = catalog.stations[index];
      const to = catalog.stations[index + 1];
      const length = segmentLengthBetween(from, to, catalog.alignmentFactor);
      lengths.set(`${from.code}>${to.code}`, length);
      lengths.set(`${to.code}>${from.code}`, length);
      total += length;
    }
    this.segmentLengthByKey = lengths;
    this.lineLengthM = total;
  }

  /**
   * Como o painel nomeia cada sentido.
   *
   * Substitui `DIRECTION_LABELS`, que nomeava os sentidos por ponto cardeal: o
   * sentido do traçado é da linha, e nem toda linha corre de oeste para leste.
   */
  public get directionLabels(): Record<Direction, string> {
    const terminals = this.catalog.terminals;
    if (!terminals) return { 1: 'sentido crescente', [-1]: 'sentido decrescente' };
    return { 1: `sentido ${terminals.last}`, [-1]: `sentido ${terminals.first}` };
  }

  /** Comprimento do trecho entre duas estações vizinhas, em metros (`undefined` se não forem vizinhas). */
  public segmentLengthM(fromCode: string, toCode: string): number | undefined {
    return this.segmentLengthByKey.get(`${fromCode}>${toCode}`);
  }

  /** Tempo de percurso entre estações vizinhas à velocidade dada, em ms. */
  public segmentRunTimeMs(fromCode: string, toCode: string, maxSpeedKmH: number): number {
    return runTimeMs(this.segmentLengthM(fromCode, toCode) ?? 0, maxSpeedKmH);
  }

  public isTerminal(stationCode: string): boolean {
    const index = this.catalog.indexOf(stationCode);
    return index === 0 || (index !== -1 && index === this.catalog.size - 1);
  }

  /** Parada numa estação: mais longa onde há integração com outra linha. */
  public dwellTimeMs(stationCode: string): number {
    return (this.catalog.find(stationCode)?.connections.length ?? 0) > 0 ? TRANSFER_DWELL_MS : DWELL_MS;
  }

  /** Próxima estação no sentido dado, ou `undefined` no fim da linha. */
  public nextStationCode(stationCode: string, direction: Direction): string | undefined {
    const index = this.catalog.indexOf(stationCode);
    if (index === -1) return undefined;
    return this.catalog.at(index + direction)?.code;
  }

  /** Sentido em que um trem segue depois de chegar a `stationCode` vindo no sentido `direction`. */
  public directionAfterArrival(stationCode: string, direction: Direction): Direction {
    return this.nextStationCode(stationCode, direction) === undefined ? (-direction as Direction) : direction;
  }

  /**
   * Tempo de uma volta completa (ida e volta), em ms: percursos nos dois sentidos,
   * paradas nas estações intermediárias e as duas manobras de terminal. Dividido
   * pela frota em serviço, dá o intervalo médio entre trens em cada plataforma.
   */
  public cycleTimeMs(speedKmH: number = LINE_SPEED_KMH): number {
    const codes = this.catalog.codes;
    let oneWay = 0;
    for (let index = 0; index < codes.length - 1; index += 1) {
      oneWay += this.segmentRunTimeMs(codes[index], codes[index + 1], speedKmH);
      // Parada em cada estação de chegada, exceto o terminal (que conta como manobra).
      if (index + 1 < codes.length - 1) oneWay += this.dwellTimeMs(codes[index + 1]);
    }
    return 2 * oneWay + 2 * TERMINAL_TURNAROUND_MS;
  }
}

/**
 * Marcha de um catálogo, calculada uma vez por catálogo.
 *
 * O catálogo é imutável e vem do cache por linha do `LineCatalogRepository`, então
 * a geometria derivada dele pode ser memorizada junto: a tabela de comprimentos é
 * consultada a cada ciclo do simulador, e recalculá-la por ciclo seria desperdício.
 */
const OPERATION_BY_CATALOG = new WeakMap<LineCatalog, LineOperation>();

export const operationFor = (catalog: LineCatalog): LineOperation => {
  const cached = OPERATION_BY_CATALOG.get(catalog);
  if (cached) return cached;
  const operation = new LineOperation(catalog);
  OPERATION_BY_CATALOG.set(catalog, operation);
  return operation;
};
