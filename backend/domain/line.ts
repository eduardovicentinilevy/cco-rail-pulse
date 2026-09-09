// backend/domain/line.ts
// Fonte única de verdade da malha da Linha 6-Laranja (Linha Uni).
// O frontend consome esta lista via GET /api/stations.

export interface LineStation {
  /** Ordem física da estação no traçado (1 = Brasilândia). */
  readonly order: number;
  readonly code: string;
  readonly name: string;
  /** Subestação de tração que alimenta o trecho. */
  readonly substation: string;
  /** Tensão nominal de projeto da catenária, em kV. */
  readonly nominalVoltageKV: number;
}

export const LINE_NAME = 'Linha 6-Laranja (Linha Uni)';

export const LINE_STATIONS: readonly LineStation[] = [
  { order: 1, code: 'BRA', name: 'Brasilândia', substation: 'TSS-01', nominalVoltageKV: 24.6 },
  { order: 2, code: 'MAR', name: 'Maristela', substation: 'TSS-01', nominalVoltageKV: 24.7 },
  { order: 3, code: 'ITA', name: 'Itaberaba-Hospital Vila Penteado', substation: 'TSS-02', nominalVoltageKV: 22.0 },
  { order: 4, code: 'JPI', name: 'João Paulo I', substation: 'TSS-02', nominalVoltageKV: 24.4 },
  { order: 5, code: 'FGO', name: 'Freguesia do Ó', substation: 'TSS-03', nominalVoltageKV: 23.2 },
  { order: 6, code: 'SMA', name: 'Santa Marina', substation: 'TSS-03', nominalVoltageKV: 24.6 },
  { order: 7, code: 'AGB', name: 'Água Branca', substation: 'TSS-04', nominalVoltageKV: 24.5 },
  { order: 8, code: 'POM', name: 'SESC-Pompeia', substation: 'TSS-04', nominalVoltageKV: 24.6 },
  { order: 9, code: 'PDZ', name: 'Perdizes', substation: 'TSS-05', nominalVoltageKV: 24.5 },
  { order: 10, code: 'PUC', name: 'PUC-Cardoso de Almeida', substation: 'TSS-05', nominalVoltageKV: 24.7 },
  { order: 11, code: 'FAA', name: 'FAAP-Pacaembu', substation: 'TSS-06', nominalVoltageKV: 24.6 },
  { order: 12, code: 'HGM', name: 'Higienópolis-Mackenzie', substation: 'TSS-06', nominalVoltageKV: 24.5 },
  { order: 13, code: '14B', name: '14 Bis-Saracura', substation: 'TSS-07', nominalVoltageKV: 24.6 },
  { order: 14, code: 'BLV', name: 'Bela Vista', substation: 'TSS-07', nominalVoltageKV: 24.7 },
  { order: 15, code: 'SJQ', name: 'São Joaquim', substation: 'TSS-08', nominalVoltageKV: 24.6 },
];

export const LINE_STATION_CODES: readonly string[] = LINE_STATIONS.map((station) => station.code);

const STATION_BY_CODE = new Map(LINE_STATIONS.map((station) => [station.code, station]));

export const findStation = (code: string): LineStation | undefined =>
  STATION_BY_CODE.get(code.trim().toUpperCase());

export const isKnownStation = (code: string): boolean => STATION_BY_CODE.has(code.trim().toUpperCase());
