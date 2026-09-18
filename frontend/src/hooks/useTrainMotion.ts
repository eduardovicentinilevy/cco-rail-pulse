import { useEffect, useRef, useState } from 'react';
import type { Train } from '../types';
import { easeInOutCubic, pointAtContinuousIndex } from '../lib/curve';
import type { CurveSegment, Point } from '../lib/curve';

interface Motion {
  fromIndex: number;
  toIndex: number;
  start: number;
  durationMs: number;
}

const MS_PER_HOP = 900;
const MIN_DURATION_MS = 700;
const MAX_DURATION_MS = 3800;

/**
 * Posição animada de cada composição sobre a curva do trilho.
 *
 * O backend só publica a estação atual do trem, não uma posição contínua —
 * a transição entre duas estações é reconstruída aqui via `requestAnimationFrame`,
 * simulando o trem percorrendo o traçado em vez de saltar de nó em nó a cada
 * atualização de telemetria. Um deslocamento de várias estações (reconexão,
 * ressincronização) dura proporcionalmente mais, para não parecer um teleporte.
 */
export const useTrainMotion = (
  trains: readonly Train[],
  stationIndex: ReadonlyMap<string, number>,
  points: readonly Point[],
  segments: readonly CurveSegment[],
): Map<string, Point> => {
  const [positions, setPositions] = useState<Map<string, Point>>(new Map());
  const motionsRef = useRef(new Map<string, Motion>());
  const frameRef = useRef<number | null>(null);
  const geometryRef = useRef({ points, segments });

  useEffect(() => {
    geometryRef.current = { points, segments };
  }, [points, segments]);

  useEffect(() => {
    const now = performance.now();
    const motions = motionsRef.current;
    let immediate: Map<string, Point> | null = null;
    let mustAnimate = false;

    for (const train of trains) {
      const targetIndex = stationIndex.get(train.currentStationCode);
      if (targetIndex === undefined) continue;

      const current = motions.get(train.trainId);
      if (!current) {
        // Primeira vez que vemos esta composição: aparece direto na posição, sem animar a origem.
        motions.set(train.trainId, { fromIndex: targetIndex, toIndex: targetIndex, start: now, durationMs: 0 });
        (immediate ??= new Map()).set(train.trainId, points[targetIndex]);
        continue;
      }

      if (current.toIndex !== targetIndex) {
        const hops = Math.max(1, Math.abs(targetIndex - current.toIndex));
        motions.set(train.trainId, {
          fromIndex: current.toIndex,
          toIndex: targetIndex,
          start: now,
          durationMs: Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, hops * MS_PER_HOP)),
        });
        mustAnimate = true;
      }
    }

    // Composições que saíram do snapshot (fim de turno, reconexão) não precisam mais de estado.
    for (const trainId of motions.keys()) {
      if (!trains.some((train) => train.trainId === trainId)) motions.delete(trainId);
    }

    if (immediate) {
      const snapshot = immediate;
      setPositions((previous) => {
        const next = new Map(previous);
        snapshot.forEach((point, id) => next.set(id, point));
        return next;
      });
    }

    if (mustAnimate && frameRef.current == null) {
      const tick = (time: number) => {
        const { points: currentPoints, segments: currentSegments } = geometryRef.current;
        let anyActive = false;
        const next = new Map<string, Point>();

        motions.forEach((motion, trainId) => {
          const t = motion.durationMs === 0 ? 1 : Math.min(1, (time - motion.start) / motion.durationMs);
          if (t < 1) anyActive = true;
          const continuousIndex = motion.fromIndex + (motion.toIndex - motion.fromIndex) * easeInOutCubic(t);
          next.set(trainId, pointAtContinuousIndex(currentPoints, currentSegments, continuousIndex));
        });

        setPositions(next);
        frameRef.current = anyActive ? requestAnimationFrame(tick) : null;
      };

      frameRef.current = requestAnimationFrame(tick);
    }
  }, [trains, stationIndex, points, segments]);

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  return positions;
};
