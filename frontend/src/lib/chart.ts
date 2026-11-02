// frontend/src/lib/chart.ts

/**
 * Cores das séries de gráfico, em ordem fixa (tokens --chart-* em tokens.css,
 * validados para daltonismo nos dois temas). Verde, âmbar e vermelho ficam de
 * fora: pertencem à marca da Linha 2 e aos estados operacionais.
 */
export const SERIES_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'] as const;
