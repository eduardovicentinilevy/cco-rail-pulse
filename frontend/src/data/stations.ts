// frontend/src/data/stations.ts
// Catálogo local da Linha 6-Laranja (Linha Uni), usado como carga inicial enquanto
// GET /api/network/stations não responde. O backend é a fonte de verdade.
import type { Station } from '../types';

interface StationSeed {
  order: number;
  code: string;
  name: string;
  substation: string;
  nominalVoltageKV: number;
  headway: string;
}

const SEEDS: StationSeed[] = [
  { order: 1, code: 'BRA', name: 'Brasilândia', substation: 'TSS-01', nominalVoltageKV: 24.6, headway: '4min 10s' },
  { order: 2, code: 'MAR', name: 'Maristela', substation: 'TSS-01', nominalVoltageKV: 24.7, headway: '4min 05s' },
  { order: 3, code: 'ITA', name: 'Itaberaba-Hospital Vila Penteado', substation: 'TSS-02', nominalVoltageKV: 22.0, headway: '9min 30s' },
  { order: 4, code: 'JPI', name: 'João Paulo I', substation: 'TSS-02', nominalVoltageKV: 24.4, headway: '4min 12s' },
  { order: 5, code: 'FGO', name: 'Freguesia do Ó', substation: 'TSS-03', nominalVoltageKV: 23.2, headway: '6min 40s' },
  { order: 6, code: 'SMA', name: 'Santa Marina', substation: 'TSS-03', nominalVoltageKV: 24.6, headway: '4min 02s' },
  { order: 7, code: 'AGB', name: 'Água Branca', substation: 'TSS-04', nominalVoltageKV: 24.5, headway: '4min 00s' },
  { order: 8, code: 'POM', name: 'SESC-Pompeia', substation: 'TSS-04', nominalVoltageKV: 24.6, headway: '3min 58s' },
  { order: 9, code: 'PDZ', name: 'Perdizes', substation: 'TSS-05', nominalVoltageKV: 24.5, headway: '4min 04s' },
  { order: 10, code: 'PUC', name: 'PUC-Cardoso de Almeida', substation: 'TSS-05', nominalVoltageKV: 24.7, headway: '3min 55s' },
  { order: 11, code: 'FAA', name: 'FAAP-Pacaembu', substation: 'TSS-06', nominalVoltageKV: 24.6, headway: '4min 01s' },
  { order: 12, code: 'HGM', name: 'Higienópolis-Mackenzie', substation: 'TSS-06', nominalVoltageKV: 24.5, headway: '4min 03s' },
  { order: 13, code: '14B', name: '14 Bis-Saracura', substation: 'TSS-07', nominalVoltageKV: 24.6, headway: '4min 06s' },
  { order: 14, code: 'BLV', name: 'Bela Vista', substation: 'TSS-07', nominalVoltageKV: 24.7, headway: '3min 59s' },
  { order: 15, code: 'SJQ', name: 'São Joaquim', substation: 'TSS-08', nominalVoltageKV: 24.6, headway: '4min 00s' },
];

/** Classificação de tensão idêntica à do simulador SCADA no backend. */
export const classifyVoltage = (voltageKV: number): Station['status'] => {
  if (voltageKV < 22.5) return 'CRÍTICO';
  if (voltageKV < 23.8) return 'ATENÇÃO';
  return 'NORMAL';
};

export const LINE_STATIONS: Station[] = SEEDS.map((seed) => ({
  ...seed,
  voltageKV: seed.nominalVoltageKV,
  status: classifyVoltage(seed.nominalVoltageKV),
}));

const HEADWAY_BY_CODE = new Map(SEEDS.map((seed) => [seed.code, seed.headway]));

/** Headway ainda não vem da API; complementamos o payload do backend com o catálogo local. */
export const headwayFor = (code: string): string => HEADWAY_BY_CODE.get(code) ?? '—';
