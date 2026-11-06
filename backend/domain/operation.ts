// backend/domain/operation.ts
// Regras de marcha da Linha 2-Verde: distâncias entre estações, perfil de
// velocidade, tempos de parada e sentido de circulação. Tudo puro — sem I/O —
// para que o simulador e a previsão de chegadas usem exatamente as mesmas contas.
import { LINE_STATIONS, LINE_STATION_CODES, findStation } from './line';
import type { LineStation } from './line';

/** 1 = sentido Vila Prudente (leste); -1 = sentido Vila Madalena (oeste). */
export type Direction = 1 | -1;

export const isDirection = (value: unknown): value is Direction => value === 1 || value === -1;

export const DIRECTION_LABELS: Record<Direction, string> = {
  1: `sentido ${LINE_STATIONS[LINE_STATIONS.length - 1].name}`,
  [-1]: `sentido ${LINE_STATIONS[0].name}`,
};

/** Velocidade máxima de linha adotada pela marcha simulada, em km/h. */
export const LINE_SPEED_KMH = 70;
/** Aceleração de partida e desaceleração de frenagem de serviço, em m/s². */
export const ACCELERATION_MS2 = 1.0;
export const SERVICE_BRAKING_MS2 = 1.0;

/**
 * As coordenadas dão a distância em linha reta; o traçado real tem curvas. O
 * fator calibra a soma das distâncias para os ~14,7 km da Linha 2.
 */
const ALIGNMENT_FACTOR = 1.015;

/** Parada típica numa estação, em ms. Estações de integração têm mais embarque. */
export const DWELL_MS = 25_000;
export const TRANSFER_DWELL_MS = 35_000;
/** Manobra de inversão de sentido num terminal, em ms. */
export const TERMINAL_TURNAROUND_MS = 120_000;

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distância de círculo máximo entre duas estações, em metros. */
export const haversineM = (a: Pick<LineStation, 'lat' | 'lon'>, b: Pick<LineStation, 'lat' | 'lon'>): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

const SEGMENT_LENGTH_BY_KEY = new Map<string, number>();
for (let index = 0; index < LINE_STATIONS.length - 1; index += 1) {
  const from = LINE_STATIONS[index];
  const to = LINE_STATIONS[index + 1];
  const length = Math.round(haversineM(from, to) * ALIGNMENT_FACTOR);
  SEGMENT_LENGTH_BY_KEY.set(`${from.code}>${to.code}`, length);
  SEGMENT_LENGTH_BY_KEY.set(`${to.code}>${from.code}`, length);
}

/** Comprimento do trecho entre duas estações vizinhas, em metros (`undefined` se não forem vizinhas). */
export const segmentLengthM = (fromCode: string, toCode: string): number | undefined =>
  SEGMENT_LENGTH_BY_KEY.get(`${fromCode}>${toCode}`);

/** Extensão total da linha, em metros. */
export const LINE_LENGTH_M = LINE_STATIONS.slice(1).reduce(
  (total, station, index) => total + (segmentLengthM(LINE_STATIONS[index].code, station.code) ?? 0),
  0,
);

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

/** Tempo de percurso entre estações vizinhas à velocidade dada, em ms. */
export const segmentRunTimeMs = (fromCode: string, toCode: string, maxSpeedKmH: number): number =>
  runTimeMs(segmentLengthM(fromCode, toCode) ?? 0, maxSpeedKmH);

export const isTerminal = (stationCode: string): boolean =>
  stationCode === LINE_STATION_CODES[0] || stationCode === LINE_STATION_CODES[LINE_STATION_CODES.length - 1];

/** Parada numa estação: mais longa onde há integração com outra linha. */
export const dwellTimeMs = (stationCode: string): number =>
  (findStation(stationCode)?.connections.length ?? 0) > 0 ? TRANSFER_DWELL_MS : DWELL_MS;

/** Próxima estação no sentido dado, ou `undefined` no fim da linha. */
export const nextStationCode = (stationCode: string, direction: Direction): string | undefined => {
  const index = LINE_STATION_CODES.indexOf(stationCode);
  if (index === -1) return undefined;
  return LINE_STATION_CODES[index + direction];
};

/** Sentido em que um trem segue depois de chegar a `stationCode` vindo no sentido `direction`. */
export const directionAfterArrival = (stationCode: string, direction: Direction): Direction =>
  nextStationCode(stationCode, direction) === undefined ? (-direction as Direction) : direction;

/**
 * Tempo de uma volta completa (ida e volta), em ms: percursos nos dois sentidos,
 * paradas nas estações intermediárias e as duas manobras de terminal. Dividido
 * pela frota em serviço, dá o intervalo médio entre trens em cada plataforma.
 */
export const cycleTimeMs = (speedKmH: number = LINE_SPEED_KMH): number => {
  let oneWay = 0;
  for (let index = 0; index < LINE_STATION_CODES.length - 1; index += 1) {
    oneWay += segmentRunTimeMs(LINE_STATION_CODES[index], LINE_STATION_CODES[index + 1], speedKmH);
    // Parada em cada estação de chegada, exceto o terminal (que conta como manobra).
    if (index + 1 < LINE_STATION_CODES.length - 1) oneWay += dwellTimeMs(LINE_STATION_CODES[index + 1]);
  }
  return 2 * oneWay + 2 * TERMINAL_TURNAROUND_MS;
};
