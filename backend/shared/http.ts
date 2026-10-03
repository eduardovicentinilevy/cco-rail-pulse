// backend/shared/http.ts

/**
 * Normaliza um parâmetro de rota do Express 5, que pode chegar como array
 * quando o padrão da rota possui repetição.
 */
export const routeParam = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? '';

/**
 * Converte o id `SERIAL` que chegou pela rota, ou `null` se não for um inteiro.
 *
 * Estrito de propósito: `Number.parseInt('12abc')` devolve 12, e com isso uma URL
 * como `/api/work-orders/12abc` abriria a ordem #12 por engano. O escopo por
 * cliente não depende disto (a linha entra no `WHERE` junto do id), mas um id
 * que não é um id não deve chegar ao banco.
 */
export const serialId = (raw: string): number | null => {
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

/** Converte um parâmetro de paginação (`limit`/`offset`) para um inteiro dentro de uma faixa segura. */
export const toBoundedInt = (raw: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};
