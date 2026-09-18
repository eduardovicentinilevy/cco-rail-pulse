// frontend/src/lib/curve.ts
export interface Point {
  x: number;
  y: number;
}

export interface CurveSegment {
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
}

/**
 * Segmentos cúbicos de Bézier equivalentes a uma Catmull-Rom pelos mesmos pontos.
 *
 * Compartilhados entre o desenho do trilho e a animação do trem: os dois
 * precisam da mesma curva, ou a composição pareceria deslizar fora dos trilhos.
 */
export const buildCurveSegments = (points: readonly Point[]): CurveSegment[] => {
  const segments: CurveSegment[] = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const previous = points[i - 1] ?? points[i];
    const current = points[i];
    const next = points[i + 1];
    const afterNext = points[i + 2] ?? next;

    const p1 = { x: current.x + (next.x - previous.x) / 6, y: current.y + (next.y - previous.y) / 6 };
    const p2 = { x: next.x - (afterNext.x - current.x) / 6, y: next.y - (afterNext.y - current.y) / 6 };

    segments.push({ p0: current, p1, p2, p3: next });
  }

  return segments;
};

export const curveToPath = (points: readonly Point[], segments: readonly CurveSegment[]): string => {
  if (points.length < 2) return '';

  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (const segment of segments) {
    commands.push(`C ${segment.p1.x} ${segment.p1.y}, ${segment.p2.x} ${segment.p2.y}, ${segment.p3.x} ${segment.p3.y}`);
  }
  return commands.join(' ');
};

const cubicPointAt = (segment: CurveSegment, t: number): Point => {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * segment.p0.x + b * segment.p1.x + c * segment.p2.x + d * segment.p3.x,
    y: a * segment.p0.y + b * segment.p1.y + c * segment.p2.y + d * segment.p3.y,
  };
};

/**
 * Ponto sobre a curva numa posição contínua entre estações — ex.: 3.4 é 40%
 * do caminho entre a 4ª estação (índice 3) e a 5ª (índice 4). É assim que o
 * trem é desenhado em trânsito, e não teletransportado de nó em nó.
 */
export const pointAtContinuousIndex = (
  points: readonly Point[],
  segments: readonly CurveSegment[],
  continuousIndex: number,
): Point => {
  const maxIndex = points.length - 1;
  const clamped = Math.min(Math.max(continuousIndex, 0), maxIndex);
  if (maxIndex <= 0 || clamped >= maxIndex) return points[maxIndex] ?? points[0];

  const segmentIndex = Math.floor(clamped);
  const localT = clamped - segmentIndex;
  return cubicPointAt(segments[segmentIndex], localT);
};

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
