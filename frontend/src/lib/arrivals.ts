// frontend/src/lib/arrivals.ts

/** Segundos que ainda faltam, descontando o tempo desde a última previsão recebida. */
export const secondsUntil = (etaSeconds: number, elapsedMs: number): number =>
  Math.max(0, Math.round(etaSeconds - elapsedMs / 1000));

/** Duração curta no formato do painel de passageiros: "45s", "2:05", "1h 04min". */
export const formatClockDuration = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}min`;
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
};
