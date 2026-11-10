// frontend/src/data/lineGeometry.ts
// Geometria do mapa da Linha 6-Laranja. Tudo — estações, Rio Tietê, rosa dos
// ventos e rótulos — sai das coordenadas geográficas pela MESMA projeção: mudar
// o enquadramento move o desenho inteiro junto, em vez de deixar referências
// desenhadas à mão soltas do trilho.
import { buildCurveSegments, curveToPath } from '../lib/curve';
import type { Point } from '../lib/curve';

export const VIEW_WIDTH = 1000;
export const VIEW_HEIGHT = 440;
const PADDING = 70;
/** Exagero vertical máximo em relação ao horizontal: deixa a forma da linha legível sem deformá-la demais. */
const MAX_VERTICAL_EXAGGERATION = 1.5;

interface GeoPoint {
  lat: number;
  lon: number;
}

/** Coordenadas aproximadas das estações (graus decimais, WGS 84). */
export const STATION_COORDS: Readonly<Record<string, GeoPoint>> = {
  BRA: { lat: -23.4683, lon: -46.6908 },
  MAR: { lat: -23.476, lon: -46.6879 },
  ITA: { lat: -23.4835, lon: -46.6851 },
  JPI: { lat: -23.4912, lon: -46.6869 },
  FGO: { lat: -23.499, lon: -46.6937 },
  SMA: { lat: -23.5117, lon: -46.6885 },
  AGB: { lat: -23.5198, lon: -46.6873 },
  POM: { lat: -23.5257, lon: -46.6837 },
  PDZ: { lat: -23.5317, lon: -46.6771 },
  PUC: { lat: -23.5372, lon: -46.6706 },
  FAA: { lat: -23.544, lon: -46.662 },
  HGM: { lat: -23.5474, lon: -46.652 },
  '14B': { lat: -23.5532, lon: -46.6466 },
  BLV: { lat: -23.5573, lon: -46.6428 },
  SJQ: { lat: -23.5617, lon: -46.6383 },
};

/** Curso aproximado do Rio Tietê, atravessado por baixo entre Freguesia do Ó e Santa Marina. */
const TIETE: readonly GeoPoint[] = [
  { lat: -23.5135, lon: -46.745 },
  { lat: -23.5098, lon: -46.72 },
  { lat: -23.5082, lon: -46.6935 },
  { lat: -23.5115, lon: -46.6745 },
  { lat: -23.5165, lon: -46.655 },
  { lat: -23.5198, lon: -46.632 },
];

// --- Projeção -----------------------------------------------------------------
// 1) Plano local em metros (equirretangular na latitude média da linha);
// 2) rotação que deixa o eixo Brasilândia → São Joaquim na horizontal — a linha
//    desce da zona noroeste ao centro, e na vertical não caberia no painel largo;
// 3) escala para o quadro. Como o mapa sai girado, ele desenha a rosa dos ventos.

const METERS_PER_DEGREE = 111_320;
const stationPoints = Object.values(STATION_COORDS);
const LAT0 = stationPoints.reduce((sum, point) => sum + point.lat, 0) / stationPoints.length;
const LON0 = stationPoints.reduce((sum, point) => sum + point.lon, 0) / stationPoints.length;
const COS_LAT0 = Math.cos((LAT0 * Math.PI) / 180);

const toLocal = ({ lat, lon }: GeoPoint) => ({
  east: (lon - LON0) * METERS_PER_DEGREE * COS_LAT0,
  north: (lat - LAT0) * METERS_PER_DEGREE,
});

const firstTerminal = toLocal(stationPoints[0]);
const lastTerminal = toLocal(stationPoints[stationPoints.length - 1]);
const AXIS_ANGLE = Math.atan2(lastTerminal.north - firstTerminal.north, lastTerminal.east - firstTerminal.east);
const COS_AXIS = Math.cos(AXIS_ANGLE);
const SIN_AXIS = Math.sin(AXIS_ANGLE);

/** `along`: ao longo do eixo da linha; `across`: à esquerda de quem segue para São Joaquim. */
const toAxis = (point: GeoPoint) => {
  const { east, north } = toLocal(point);
  return { along: east * COS_AXIS + north * SIN_AXIS, across: -east * SIN_AXIS + north * COS_AXIS };
};

const axisPoints = stationPoints.map(toAxis);
const alongMin = Math.min(...axisPoints.map((p) => p.along));
const alongMax = Math.max(...axisPoints.map((p) => p.along));
const acrossMin = Math.min(...axisPoints.map((p) => p.across));
const acrossMax = Math.max(...axisPoints.map((p) => p.across));

const scaleX = (VIEW_WIDTH - 2 * PADDING) / (alongMax - alongMin);
const scaleY = Math.min((VIEW_HEIGHT - 2 * PADDING) / (acrossMax - acrossMin), scaleX * MAX_VERTICAL_EXAGGERATION);
// Centraliza verticalmente quando o exagero máximo deixa sobra no quadro.
const offsetY = (VIEW_HEIGHT - (acrossMax - acrossMin) * scaleY) / 2;

const round = (value: number) => Math.round(value * 10) / 10;

export const project = (point: GeoPoint): Point => {
  const { along, across } = toAxis(point);
  return {
    x: round(PADDING + (along - alongMin) * scaleX),
    y: round(offsetY + (acrossMax - across) * scaleY),
  };
};

/** Posição de cada estação no SVG, por código. */
export const ROUTE: Readonly<Record<string, Point>> = Object.fromEntries(
  Object.entries(STATION_COORDS).map(([code, point]) => [code, project(point)]),
);

export interface MapLabel {
  x: number;
  y: number;
  /** Rotação em graus, sempre legível (texto nunca de cabeça para baixo). */
  angle: number;
}

/**
 * Rótulo ao longo do segmento a→b, deslocado `offset` px na perpendicular
 * (positivo = lado esquerdo de quem segue de a para b na tela).
 */
const labelAlong = (a: Point, b: Point, offset: number): MapLabel => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return {
    x: round((a.x + b.x) / 2 + (dy / length) * offset),
    y: round((a.y + b.y) / 2 - (dx / length) * offset),
    angle: round(angle),
  };
};

const river = TIETE.map(project);

export const RIVER = {
  name: 'Rio Tietê',
  path: curveToPath(river, buildCurveSegments(river)),
  // A montante (leste) da travessia, no vão livre entre os dois braços da linha.
  label: labelAlong(river[3], river[4], 14),
};

/**
 * Rosa dos ventos: o norte é a direção, na tela, de um ponto um pouco ao norte
 * do centro da malha — a mesma projeção (girada e com escalas próprias) que
 * desenha as estações, então a seta nunca desmente o desenho.
 */
const center = project({ lat: LAT0, lon: LON0 });
const northOfCenter = project({ lat: LAT0 + 0.01, lon: LON0 });
const northLength = Math.hypot(northOfCenter.x - center.x, northOfCenter.y - center.y) || 1;

export const NORTH = {
  /** Posição da rosa no quadro: canto inferior direito, longe do trilho e do rio. */
  x: VIEW_WIDTH - 58,
  y: VIEW_HEIGHT - 58,
  /** Vetor unitário do norte na tela (y cresce para baixo). */
  dx: round(((northOfCenter.x - center.x) / northLength) * 100) / 100,
  dy: round(((northOfCenter.y - center.y) / northLength) * 100) / 100,
  /** Ângulo de rotação do símbolo, em graus, a partir de "para cima". */
  angle: round((Math.atan2(northOfCenter.x - center.x, -(northOfCenter.y - center.y)) * 180) / Math.PI),
};
