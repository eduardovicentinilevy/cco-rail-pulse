// backend/shared/http.ts

/**
 * Normaliza um parâmetro de rota do Express 5, que pode chegar como array
 * quando o padrão da rota possui repetição.
 */
export const routeParam = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? '';

/** Converte um parâmetro de paginação (`limit`/`offset`) para um inteiro dentro de uma faixa segura. */
export const toBoundedInt = (raw: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};
