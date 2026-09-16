// backend/shared/http.ts

/**
 * Normaliza um parâmetro de rota do Express 5, que pode chegar como array
 * quando o padrão da rota possui repetição.
 */
export const routeParam = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? '';
