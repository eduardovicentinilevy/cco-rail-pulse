// frontend/src/data/lineGeometry.ts
// Geometria do mapa da Linha 2-Verde. Tudo — estações, Av. Paulista, Rio
// Tamanduateí e os rótulos — sai das coordenadas geográficas pela MESMA
// projeção: mudar o enquadramento move o desenho inteiro junto, em vez de
// deixar referências desenhadas à mão soltas do trilho.
import { buildCurveSegments, curveToPath } from '../lib/curve';
import type { Point } from '../lib/curve';

export const VIEW_WIDTH = 1000;
export const VIEW_HEIGHT = 440;
const PADDING = 70;

interface GeoPoint {
  lat: number;
  lon: number;
}

/** Coordenadas aproximadas das estações (graus decimais, WGS 84). */
export const STATION_COORDS: Readonly<Record<string, GeoPoint>> = {
  VMD: { lat: -23.5467, lon: -46.691 },
  SUM: { lat: -23.5509, lon: -46.6773 },
  CLI: { lat: -23.5544, lon: -46.6703 },
  CNS: { lat: -23.5578, lon: -46.6604 },
  TRI: { lat: -23.5614, lon: -46.6566 },
  BGD: { lat: -23.5687, lon: -46.6493 },
  PSO: { lat: -23.5758, lon: -46.6409 },
  ANR: { lat: -23.5814, lon: -46.6382 },
  CKB: { lat: -23.5926, lon: -46.6292 },
  SIM: { lat: -23.5965, lon: -46.6216 },
  AIP: { lat: -23.6027, lon: -46.6125 },
  SAC: { lat: -23.6017, lon: -46.6025 },
  TTI: { lat: -23.5931, lon: -46.589 },
  VPT: { lat: -23.5839, lon: -46.5808 },
};

/** Eixo da Av. Paulista sob o qual a linha corre (de antes de CNS até perto de PSO). */
const PAULISTA: readonly GeoPoint[] = [
  { lat: -23.556, lon: -46.6625 },
  { lat: -23.5713, lon: -46.646 },
];

/** Curso aproximado do Rio Tamanduateí, cruzado pela linha entre SAC e TTI. */
const TAMANDUATEI: readonly GeoPoint[] = [
  { lat: -23.63, lon: -46.57 },
  { lat: -23.606, lon: -46.584 },
  { lat: -23.596, lon: -46.593 },
  { lat: -23.582, lon: -46.603 },
  { lat: -23.566, lon: -46.614 },
  { lat: -23.545, lon: -46.628 },
];

const coords = Object.values(STATION_COORDS);
const lonMin = Math.min(...coords.map((c) => c.lon));
const lonMax = Math.max(...coords.map((c) => c.lon));
const latMin = Math.min(...coords.map((c) => c.lat));
const latMax = Math.max(...coords.map((c) => c.lat));

// Escalas independentes: o traçado ocupa o painel inteiro e o eixo vertical sai
// comprimido — preserva a forma da linha, sem pretender ser cartografia exata.
const scaleX = (VIEW_WIDTH - 2 * PADDING) / (lonMax - lonMin);
const scaleY = (VIEW_HEIGHT - 2 * PADDING) / (latMax - latMin);

const round = (value: number) => Math.round(value * 10) / 10;

export const project = ({ lat, lon }: GeoPoint): Point => ({
  x: round(PADDING + (lon - lonMin) * scaleX),
  y: round(PADDING + (latMax - lat) * scaleY),
});

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

const paulista = PAULISTA.map(project);
const river = TAMANDUATEI.map(project);

export const AVENUE = {
  path: `M ${paulista[0].x} ${paulista[0].y} L ${paulista[1].x} ${paulista[1].y}`,
  // Do lado sudoeste do eixo: o lado norte já tem os rótulos das estações.
  label: labelAlong(paulista[0], paulista[1], -34),
};

export const RIVER = {
  path: curveToPath(river, buildCurveSegments(river)),
  // A nordeste do curso, longe do trilho que passa ao sul.
  label: labelAlong(river[3], river[4], -24),
};
