import { useCallback, useEffect, useState } from 'react';
import type { Train } from '../types';
import { pointAtContinuousIndex } from '../lib/curve';
import type { CurveSegment, Point } from '../lib/curve';
import { isTrainMoving, trainProgress } from '../data/trains';

/** ~15 quadros por segundo: o trem anda devagar na escala do mapa; mais que isso só gasta CPU. */
const FRAME_INTERVAL_MS = 66;

/**
 * Posição de cada composição sobre a curva do trilho.
 *
 * O backend publica a marcha real de cada trem — trecho em curso, fração já
 * percorrida e tempo que falta — e este hook só a projeta no tempo: um trem que
 * leva 90 s entre duas estações leva 90 s cruzando o mapa, para na plataforma
 * pelo tempo da parada, e um trem parado no meio do trecho fica parado ali.
 * A animação usa o relógio do navegador a partir da chegada do snapshot, então
 * não depende de os relógios do servidor e do cliente baterem.
 */
export const useTrainMotion = (
  trains: readonly Train[],
  stationIndex: ReadonlyMap<string, number>,
  points: readonly Point[],
  segments: readonly CurveSegment[],
): Map<string, Point> => {
  const [positions, setPositions] = useState<Map<string, Point>>(() => new Map());

  const compute = useCallback(
    (now: number): Map<string, Point> => {
      const next = new Map<string, Point>();
      for (const train of trains) {
        const from = stationIndex.get(train.currentStationCode);
        if (from === undefined) continue;

        let index = from;
        if (train.movement && train.nextStationCode) {
          const to = stationIndex.get(train.nextStationCode);
          if (to !== undefined) index = from + (to - from) * trainProgress(train, now);
        }
        next.set(train.trainId, pointAtContinuousIndex(points, segments, index));
      }
      return next;
    },
    [trains, stationIndex, points, segments],
  );

  useEffect(() => {
    let frame: number | null = null;
    let lastPaint = -Infinity;

    const tick = (time: number) => {
      if (time - lastPaint >= FRAME_INTERVAL_MS) {
        lastPaint = time;
        setPositions(compute(time));
      }
      // Sem trem andando, o laço para; o próximo snapshot do backend o reinicia.
      frame = trains.some((train) => isTrainMoving(train, time)) ? requestAnimationFrame(tick) : null;
    };

    frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [compute, trains]);

  return positions;
};
