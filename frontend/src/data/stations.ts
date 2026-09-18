// frontend/src/data/stations.ts
// Helpers de apresentação da malha.
//
// Este arquivo já guardou um catálogo fixo das 15 estações da Linha 6-Laranja,
// duplicando o backend. A malha agora vem inteira de GET /api/network/stations,
// e o que sobra aqui são as conversões de exibição.
import type { Station } from '../types';

/** Classificação de tensão idêntica à do simulador SCADA no backend. */
export const classifyVoltage = (voltageKV: number): Station['status'] => {
  if (voltageKV < 22.5) return 'CRÍTICO';
  if (voltageKV < 23.8) return 'ATENÇÃO';
  return 'NORMAL';
};

/** Headway em segundos no formato do painel: `4min 10s`. */
export const formatHeadway = (seconds: number | null): string => {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';

  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes === 0) return `${rest}s`;
  return `${minutes}min ${String(rest).padStart(2, '0')}s`;
};
