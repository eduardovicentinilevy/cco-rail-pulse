// frontend/src/data/lineGeometry.ts
// Projeção do mapa da linha.
//
// Tudo o que o mapa desenha sai daqui, por uma única projeção: mudar o
// enquadramento move o desenho inteiro junto, em vez de deixar referências
// desenhadas à mão soltas do trilho.
//
// A projeção é construída para a malha que o backend mandou — não para uma
// linha escrita neste arquivo. Ela parte das coordenadas geográficas das
// estações, gira o traçado para o eixo entre os terminais daquela linha ficar
// na horizontal (o painel é largo; na vertical a linha não caberia) e escala
// para o quadro. Nenhum passo pergunta qual linha é: a média das coordenadas e
// o eixo saem das estações recebidas, então a malha de outro cliente é
// desenhada com o enquadramento dela.
//
// Sem coordenada geográfica cadastrada, vale a coordenada normalizada (0–1) da
// estação e, na falta das duas, um eixo reto — para que uma linha recém-
// cadastrada ainda apareça no mapa.
import type { Station } from '../types';
import type { Point } from '../lib/curve';

export const VIEW_WIDTH = 1000;
export const VIEW_HEIGHT = 440;

/** Folga nas laterais do quadro. */
const PADDING = 70;
/** Exagero vertical máximo em relação ao horizontal: deixa a forma legível sem deformá-la demais. */
const MAX_VERTICAL_EXAGGERATION = 1.5;
const METERS_PER_DEGREE = 111_320;

export interface GeoPoint {
  lat: number;
  lon: number;
}

const round = (value: number): number => Math.round(value * 10) / 10;

/** Coordenada normalizada (0–1) do traçado para o ponto no SVG. */
export const project = (x: number, y: number): Point => ({
  x: round(x * VIEW_WIDTH),
  y: round(y * VIEW_HEIGHT),
});

export interface CompassRose {
  x: number;
  y: number;
  /** Vetor unitário do norte na tela (y cresce para baixo). */
  dx: number;
  dy: number;
  /** Ângulo de rotação do símbolo, em graus, a partir de "para cima". */
  angle: number;
}

export interface LineProjection {
  /** Posição de uma estação no quadro. */
  stationPoint: (station: Station, index: number, total: number) => Point;
  /**
   * Rosa dos ventos, quando a projeção é geográfica: o mapa sai girado, e sem
   * ela o desenho não diz para que lado fica o norte. `null` quando o traçado
   * vem de coordenada normalizada, que não tem orientação geográfica nenhuma.
   */
  compass: CompassRose | null;
}

const geoOf = (station: Station): GeoPoint | null =>
  station.lat === null || station.lon === null ? null : { lat: station.lat, lon: station.lon };

/** Distribuição ao longo de um eixo reto, para a linha sem coordenada alguma. */
const evenly = (index: number, total: number): Point => ({
  x: round(PADDING + (total > 1 ? index / (total - 1) : 0.5) * (VIEW_WIDTH - 2 * PADDING)),
  y: VIEW_HEIGHT / 2,
});

const normalizedProjection = (): LineProjection => ({
  stationPoint: (station, index, total) =>
    station.mapX != null && station.mapY != null ? project(station.mapX, station.mapY) : evenly(index, total),
  compass: null,
});

/**
 * Projeção geográfica da malha recebida.
 *
 * 1) plano local em metros (equirretangular na latitude média da linha);
 * 2) rotação que deixa o eixo primeiro terminal → último na horizontal;
 * 3) escala para o quadro, centrada na vertical.
 */
const geographicProjection = (points: readonly GeoPoint[]): LineProjection => {
  const lat0 = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lon0 = points.reduce((sum, point) => sum + point.lon, 0) / points.length;
  const cosLat0 = Math.cos((lat0 * Math.PI) / 180);

  const toLocal = ({ lat, lon }: GeoPoint) => ({
    east: (lon - lon0) * METERS_PER_DEGREE * cosLat0,
    north: (lat - lat0) * METERS_PER_DEGREE,
  });

  const first = toLocal(points[0]);
  const last = toLocal(points[points.length - 1]);
  const axisAngle = Math.atan2(last.north - first.north, last.east - first.east);
  const cosAxis = Math.cos(axisAngle);
  const sinAxis = Math.sin(axisAngle);

  const toAxis = (point: GeoPoint) => {
    const { east, north } = toLocal(point);
    return { along: east * cosAxis + north * sinAxis, across: -east * sinAxis + north * cosAxis };
  };

  const axisPoints = points.map(toAxis);
  const alongMin = Math.min(...axisPoints.map((p) => p.along));
  const alongMax = Math.max(...axisPoints.map((p) => p.along));
  const acrossMin = Math.min(...axisPoints.map((p) => p.across));
  const acrossMax = Math.max(...axisPoints.map((p) => p.across));

  const alongSpan = alongMax - alongMin;
  const acrossSpan = acrossMax - acrossMin;
  const scaleX = alongSpan > 0 ? (VIEW_WIDTH - 2 * PADDING) / alongSpan : 0;
  const scaleY =
    acrossSpan > 0 ? Math.min((VIEW_HEIGHT - 2 * PADDING) / acrossSpan, scaleX * MAX_VERTICAL_EXAGGERATION) : 0;
  const offsetY = (VIEW_HEIGHT - acrossSpan * scaleY) / 2;

  const projectGeo = (point: GeoPoint): Point => {
    const { along, across } = toAxis(point);
    return {
      x: round(PADDING + (along - alongMin) * scaleX),
      y: round(offsetY + (acrossMax - across) * scaleY),
    };
  };

  const center = projectGeo({ lat: lat0, lon: lon0 });
  const northOfCenter = projectGeo({ lat: lat0 + 0.01, lon: lon0 });
  const northLength = Math.hypot(northOfCenter.x - center.x, northOfCenter.y - center.y) || 1;

  return {
    stationPoint: (station, index, total) => {
      const geo = geoOf(station);
      return geo ? projectGeo(geo) : normalizedProjection().stationPoint(station, index, total);
    },
    compass: {
      // Canto inferior direito, longe do trilho.
      x: VIEW_WIDTH - 58,
      y: VIEW_HEIGHT - 58,
      dx: Math.round(((northOfCenter.x - center.x) / northLength) * 100) / 100,
      dy: Math.round(((northOfCenter.y - center.y) / northLength) * 100) / 100,
      angle: round((Math.atan2(northOfCenter.x - center.x, -(northOfCenter.y - center.y)) * 180) / Math.PI),
    },
  };
};

/**
 * Projeção da malha recebida. Geográfica quando toda estação tem coordenada —
 * é o que faz o desenho concordar com as distâncias que a marcha mede —, e pela
 * coordenada normalizada do cadastro quando falta alguma.
 */
export const projectionFor = (stations: readonly Station[]): LineProjection => {
  const points = stations.map(geoOf);
  if (stations.length < 2 || points.some((point) => point === null)) return normalizedProjection();

  const geo = points as GeoPoint[];
  // Malha cujas estações têm todas a mesma coordenada: não há eixo para girar.
  const spread = geo.some((point) => point.lat !== geo[0].lat || point.lon !== geo[0].lon);
  return spread ? geographicProjection(geo) : normalizedProjection();
};

/**
 * Posição de uma estação na tela, projetando a malha a cada chamada.
 *
 * Conveniência para quem tem uma estação só em mão; o mapa constrói a projeção
 * uma vez por malha com `projectionFor`.
 */
export const projectStation = (station: Station, index: number, total: number): Point =>
  normalizedProjection().stationPoint(station, index, total);
