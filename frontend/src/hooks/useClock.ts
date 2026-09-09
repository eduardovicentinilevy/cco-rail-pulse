import { useEffect, useState } from 'react';
import { formatTime, formatDuration } from '../lib/format';

/** Relógio de parede do CCO, atualizado a cada segundo. */
export const useClock = (): string => {
  const [time, setTime] = useState(() => formatTime());

  useEffect(() => {
    const timer = window.setInterval(() => setTime(formatTime()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return time;
};

/** Tempo decorrido de turno, formatado como HH:MM:SS. */
export const useElapsed = (startedAt: number): string => {
  const [elapsed, setElapsed] = useState(() => formatDuration((Date.now() - startedAt) / 1000));

  useEffect(() => {
    const update = () => setElapsed(formatDuration((Date.now() - startedAt) / 1000));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return elapsed;
};
