// backend/shared/duration.ts

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Converte durações no formato aceito pelo `jsonwebtoken` ("15m", "8h", "900")
 * em milissegundos, para que a API possa informar ao cliente quando renovar.
 */
export const parseDurationMs = (value: string | number, fallbackMs = 900_000): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value * 1_000 : fallbackMs;

  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/i.exec(value.trim());
  if (!match) return fallbackMs;

  const amount = Number.parseFloat(match[1]);
  // Sem sufixo o `jsonwebtoken` interpreta o número como segundos.
  const unit = (match[2] ?? 's').toLowerCase();

  return Math.round(amount * UNIT_MS[unit]);
};

export const parseDurationSeconds = (value: string | number, fallbackMs?: number): number =>
  Math.round(parseDurationMs(value, fallbackMs) / 1_000);
