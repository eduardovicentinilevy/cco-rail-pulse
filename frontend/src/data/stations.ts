// frontend/src/data/stations.ts
// Catálogo local da Linha 6-Laranja (Linha Uni), usado como carga inicial
// enquanto GET /api/network/stations não responde. O backend é a fonte de verdade.
import type { Station, StationStatus } from '../types';
import { formatVoltage } from '../lib/format';

export const LINE_NAME = 'Linha 6-Laranja';
export const LINE_OPERATOR = 'Linha Uni';

/**
 * Tração captada no solo (terceiro trilho), modelada em 750 Vcc — espelho de
 * `backend/domain/line.ts`. O painel precisa deles antes (e sem) resposta da
 * API; o teste de contrato `backend/tests/frontend-catalog.test.ts` falha se os
 * dois lados divergirem.
 */
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
  { order: 1, code: 'BRA', name: 'Brasilândia', substation: 'SR-01', nominalVoltageV: 752, connections: [], headway: '4min 05s' },
  { order: 2, code: 'MAR', name: 'Maristela', substation: 'SR-01', nominalVoltageV: 748, connections: [], headway: '4min 02s' },
  // SR-02 com um grupo retificador fora de serviço no cenário simulado.
  { order: 3, code: 'ITA', name: 'Itaberaba-Hospital Vila Penteado', substation: 'SR-02', nominalVoltageV: 620, connections: [], headway: '5min 40s' },
  { order: 4, code: 'JPI', name: 'João Paulo I', substation: 'SR-02', nominalVoltageV: 746, connections: [], headway: '4min 10s' },
  { order: 5, code: 'FGO', name: 'Freguesia do Ó', substation: 'SR-03', nominalVoltageV: 680, connections: [], headway: '4min 50s' },
  { order: 6, code: 'SMA', name: 'Santa Marina', substation: 'SR-03', nominalVoltageV: 749, connections: [], headway: '4min 04s' },
  { order: 7, code: 'AGB', name: 'Água Branca', substation: 'SR-04', nominalVoltageV: 750, connections: ['CPTM L7-Rubi'], headway: '4min 00s' },
  { order: 8, code: 'POM', name: 'Sesc-Pompeia', substation: 'SR-04', nominalVoltageV: 751, connections: [], headway: '3min 58s' },
  { order: 9, code: 'PDZ', name: 'Perdizes', substation: 'SR-05', nominalVoltageV: 748, connections: [], headway: '4min 01s' },
  { order: 10, code: 'PUC', name: 'PUC-Cardoso de Almeida', substation: 'SR-05', nominalVoltageV: 750, connections: [], headway: '3min 59s' },
  { order: 11, code: 'FAA', name: 'FAAP-Pacaembu', substation: 'SR-06', nominalVoltageV: 749, connections: [], headway: '4min 01s' },
  { order: 12, code: 'HGM', name: 'Higienópolis-Mackenzie', substation: 'SR-06', nominalVoltageV: 747, connections: ['L4-Amarela'], headway: '4min 03s' },
  { order: 13, code: '14B', name: '14 Bis-Saracura', substation: 'SR-07', nominalVoltageV: 751, connections: [], headway: '4min 02s' },
  { order: 14, code: 'BLV', name: 'Bela Vista', substation: 'SR-07', nominalVoltageV: 749, connections: [], headway: '4min 00s' },
  { order: 15, code: 'SJQ', name: 'São Joaquim', substation: 'SR-08', nominalVoltageV: 750, connections: ['L1-Azul'], headway: '4min 05s' },
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

const SEED_BY_CODE = new Map(SEEDS.map((seed) => [seed.code, seed]));

const STATION_STATUSES: readonly StationStatus[] = ['NORMAL', 'ATENÇÃO', 'CRÍTICO'];

export const isStationStatus = (value: unknown): value is StationStatus =>
  typeof value === 'string' && (STATION_STATUSES as readonly string[]).includes(value);

export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const textOr = (value: unknown, fallback: string): string => (typeof value === 'string' && value ? value : fallback);

/**
 * Converte um item de GET /api/network/stations no modelo do painel.
 *
 * O frontend e o backend sobem separados: uma aba aberta durante um deploy, ou
 * um backend de outra versão, pode mandar campos ausentes ou com outro nome.
 * Todo campo inválido cai no catálogo local (ou num neutro) em vez de chegar
 * `undefined` à interface — onde um `formatVoltage(undefined)` derrubaria o
 * console inteiro. O headway ainda não vem da API e sai sempre do catálogo.
 */
export const normalizeStation = (raw: Record<string, unknown>): Station | null => {
  if (typeof raw.code !== 'string' || raw.code.length === 0) return null;

  const seed = SEED_BY_CODE.get(raw.code);
  const nominalVoltageV = isFiniteNumber(raw.nominalVoltageV)
    ? raw.nominalVoltageV
    : (seed?.nominalVoltageV ?? TRACTION_NOMINAL_V);
  const voltageV = isFiniteNumber(raw.voltageV) ? raw.voltageV : nominalVoltageV;

  return {
    order: isFiniteNumber(raw.order) ? raw.order : (seed?.order ?? 0),
    code: raw.code,
    name: textOr(raw.name, seed?.name ?? raw.code),
    substation: textOr(raw.substation, seed?.substation ?? '—'),
    nominalVoltageV,
    voltageV,
    status: isStationStatus(raw.status) ? raw.status : classifyVoltage(voltageV),
    headway: seed?.headway ?? '—',
    connections: Array.isArray(raw.connections)
      ? raw.connections.filter((item): item is string => typeof item === 'string')
      : (seed?.connections ?? []),
  };
};

/** Nome acessível de uma estação: o que um leitor de tela anuncia nos botões da malha. */
export const stationAccessibleName = (station: Station): string => {
  const base = `Estação ${station.name}, status ${station.status}, ${formatVoltage(station.voltageV)}`;
  return station.connections.length > 0 ? `${base}, integração com ${station.connections.join(', ')}` : base;
};

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
  'CPTM L7-Rubi': { short: '7', color: '#a6185c', ink: '#ffffff' },
};

export const connectionStyle = (connection: string): ConnectionStyle =>
  CONNECTION_STYLES[connection] ?? { short: connection.slice(0, 2).toUpperCase(), color: '#56616b', ink: '#ffffff' };
