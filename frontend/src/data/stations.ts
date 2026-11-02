// frontend/src/data/stations.ts
// Catálogo local da Linha 2-Verde (Metrô de São Paulo), usado como carga inicial
// enquanto GET /api/network/stations não responde. O backend é a fonte de verdade.
import type { Station } from '../types';

export const LINE_NAME = 'Linha 2-Verde';
export const LINE_OPERATOR = 'Metrô de São Paulo';

/** Tração por terceiro trilho, 750 Vcc — mesmos limiares de `backend/domain/line.ts`. */
export const TRACTION_NOMINAL_V = 750;
export const VOLTAGE_WARNING_V = 700;
export const VOLTAGE_CRITICAL_V = 640;

interface StationSeed {
  order: number;
  code: string;
  name: string;
  substation: string;
  nominalVoltageV: number;
  connections: string[];
  headway: string;
}

const SEEDS: StationSeed[] = [
  { order: 1, code: 'VMD', name: 'Vila Madalena', substation: 'SR-01', nominalVoltageV: 752, connections: [], headway: '2min 20s' },
  { order: 2, code: 'SUM', name: 'Sumaré', substation: 'SR-01', nominalVoltageV: 748, connections: [], headway: '2min 15s' },
  { order: 3, code: 'CLI', name: 'Clínicas', substation: 'SR-02', nominalVoltageV: 750, connections: [], headway: '2min 12s' },
  { order: 4, code: 'CNS', name: 'Consolação', substation: 'SR-02', nominalVoltageV: 746, connections: ['L4-Amarela'], headway: '2min 10s' },
  { order: 5, code: 'TRI', name: 'Trianon-Masp', substation: 'SR-03', nominalVoltageV: 751, connections: [], headway: '2min 10s' },
  { order: 6, code: 'BGD', name: 'Brigadeiro', substation: 'SR-03', nominalVoltageV: 749, connections: [], headway: '2min 12s' },
  { order: 7, code: 'PSO', name: 'Paraíso', substation: 'SR-04', nominalVoltageV: 747, connections: ['L1-Azul'], headway: '2min 14s' },
  { order: 8, code: 'ANR', name: 'Ana Rosa', substation: 'SR-04', nominalVoltageV: 750, connections: ['L1-Azul'], headway: '2min 15s' },
  { order: 9, code: 'CKB', name: 'Chácara Klabin', substation: 'SR-05', nominalVoltageV: 748, connections: ['L5-Lilás'], headway: '2min 18s' },
  { order: 10, code: 'SIM', name: 'Santos-Imigrantes', substation: 'SR-05', nominalVoltageV: 745, connections: [], headway: '2min 20s' },
  // SR-06 com um grupo retificador fora de serviço no cenário simulado.
  { order: 11, code: 'AIP', name: 'Alto do Ipiranga', substation: 'SR-06', nominalVoltageV: 620, connections: [], headway: '3min 40s' },
  { order: 12, code: 'SAC', name: 'Sacomã', substation: 'SR-06', nominalVoltageV: 680, connections: ['Expresso Tiradentes'], headway: '2min 55s' },
  { order: 13, code: 'TTI', name: 'Tamanduateí', substation: 'SR-07', nominalVoltageV: 749, connections: ['CPTM L10-Turquesa'], headway: '2min 20s' },
  { order: 14, code: 'VPT', name: 'Vila Prudente', substation: 'SR-07', nominalVoltageV: 751, connections: ['L15-Prata'], headway: '2min 25s' },
];

/** Classificação de tensão idêntica à do simulador SCADA no backend. */
export const classifyVoltage = (voltageV: number): Station['status'] => {
  if (voltageV < VOLTAGE_CRITICAL_V) return 'CRÍTICO';
  if (voltageV < VOLTAGE_WARNING_V) return 'ATENÇÃO';
  return 'NORMAL';
};

export const LINE_STATIONS: Station[] = SEEDS.map((seed) => ({
  ...seed,
  voltageV: seed.nominalVoltageV,
  status: classifyVoltage(seed.nominalVoltageV),
}));

export const LINE_TERMINALS = {
  west: SEEDS[0].name,
  east: SEEDS[SEEDS.length - 1].name,
} as const;

const HEADWAY_BY_CODE = new Map(SEEDS.map((seed) => [seed.code, seed.headway]));
const CONNECTIONS_BY_CODE = new Map(SEEDS.map((seed) => [seed.code, seed.connections]));

/** Headway ainda não vem da API; complementamos o payload do backend com o catálogo local. */
export const headwayFor = (code: string): string => HEADWAY_BY_CODE.get(code) ?? '—';

/** Fallback para backends antigos que ainda não enviam `connections`. */
export const connectionsFor = (code: string): string[] => CONNECTIONS_BY_CODE.get(code) ?? [];

/** Identidade visual das integrações: número e cor como na sinalização das estações. */
export interface ConnectionStyle {
  short: string;
  color: string;
  /** Cor do texto sobre `color`, escolhida pelo contraste (≥ 4.5:1). */
  ink: string;
}

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
