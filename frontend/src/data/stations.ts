// frontend/src/data/stations.ts
// Helpers de apresentação da malha.
//
// Este arquivo já guardou um catálogo fixo das estações da linha, duplicando o
// backend. A malha agora vem inteira de GET /api/network/stations, e o que sobra
// aqui são as conversões de exibição.
import type { Station } from '../types';

/**
 * Limiares de subtensão do terceiro trilho (750 Vcc), iguais aos de
 * `backend/domain/line.ts` — o painel classifica a leitura que recebe sem
 * precisar de uma segunda ida ao servidor.
 */
export const TRACTION_NOMINAL_V = 750;
export const VOLTAGE_WARNING_V = 700;
export const VOLTAGE_CRITICAL_V = 640;

/** Classificação de tensão idêntica à do simulador SCADA no backend. */
export const classifyVoltage = (voltageV: number): Station['status'] => {
  if (voltageV < VOLTAGE_CRITICAL_V) return 'CRÍTICO';
  if (voltageV < VOLTAGE_WARNING_V) return 'ATENÇÃO';
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

/** Identidade visual das integrações: número e cor como na sinalização das estações. */
export interface ConnectionStyle {
  short: string;
  color: string;
  /** Cor do texto sobre `color`, escolhida pelo contraste (≥ 4.5:1). */
  ink: string;
}

/**
 * Cores das integrações conhecidas da rede de São Paulo.
 *
 * É tabela de apresentação, não malha: a integração em si é dado cadastrado na
 * estação (`connections`). Uma integração que não esteja aqui ainda aparece,
 * com a cor neutra do fallback — nenhuma linha fica sem desenho por isso.
 */
const CONNECTION_STYLES: Record<string, ConnectionStyle> = {
  'L1-Azul': { short: '1', color: '#0455a1', ink: '#ffffff' },
  'L4-Amarela': { short: '4', color: '#fed304', ink: '#1b1b1b' },
  'L5-Lilás': { short: '5', color: '#9b3894', ink: '#ffffff' },
  'L15-Prata': { short: '15', color: '#a3a8ab', ink: '#1b1b1b' },
  'CPTM L10-Turquesa': { short: '10', color: '#00a6a6', ink: '#0b1f1f' },
  'Expresso Tiradentes': { short: 'ET', color: '#56616b', ink: '#ffffff' },
};

export const connectionStyle = (connection: string): ConnectionStyle =>
  CONNECTION_STYLES[connection] ?? { short: connection.slice(0, 2).toUpperCase(), color: '#56616b', ink: '#ffffff' };
