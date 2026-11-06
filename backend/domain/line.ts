// backend/domain/line.ts
// Fonte única de verdade da malha da Linha 2-Verde (Metrô de São Paulo).
// O frontend consome esta lista via GET /api/network/stations.

export interface LineStation {
  /** Ordem física da estação no traçado (1 = Vila Madalena). */
  readonly order: number;
  readonly code: string;
  readonly name: string;
  /** Subestação retificadora (SR) que alimenta o terceiro trilho no trecho. */
  readonly substation: string;
  /**
   * Tensão de referência no terceiro trilho, em volts de corrente contínua.
   * O sistema é de 750 Vcc; trechos em fim de alimentação ficam abaixo disso.
   */
  readonly nominalVoltageV: number;
  /** Integrações com outras linhas e modais, como sinalizadas na estação. */
  readonly connections: readonly string[];
  /** Coordenadas aproximadas da estação (WGS 84) — base das distâncias entre estações. */
  readonly lat: number;
  readonly lon: number;
}

export const LINE_NAME = 'Linha 2-Verde';
export const LINE_OPERATOR = 'Metrô de São Paulo';
/** Tensão nominal do terceiro trilho. */
export const TRACTION_NOMINAL_V = 750;
/**
 * Limiares de alarme operacional do CCO (subtensão). Ficam bem acima do mínimo
 * permanente que a EN 50163 admite para 750 Vcc (500 V): o objetivo é avisar
 * o operador antes que o desempenho de tração caia, não no limite normativo.
 */
export const VOLTAGE_WARNING_V = 700;
export const VOLTAGE_CRITICAL_V = 640;

export type VoltageStatus = 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO';

export const classifyVoltage = (voltageV: number): VoltageStatus => {
  if (voltageV < VOLTAGE_CRITICAL_V) return 'CRÍTICO';
  if (voltageV < VOLTAGE_WARNING_V) return 'ATENÇÃO';
  return 'NORMAL';
};

export const LINE_STATIONS: readonly LineStation[] = [
  { order: 1, code: 'VMD', name: 'Vila Madalena', substation: 'SR-01', nominalVoltageV: 752, connections: [], lat: -23.5467, lon: -46.691 },
  { order: 2, code: 'SUM', name: 'Sumaré', substation: 'SR-01', nominalVoltageV: 748, connections: [], lat: -23.5509, lon: -46.6773 },
  { order: 3, code: 'CLI', name: 'Clínicas', substation: 'SR-02', nominalVoltageV: 750, connections: [], lat: -23.5544, lon: -46.6703 },
  { order: 4, code: 'CNS', name: 'Consolação', substation: 'SR-02', nominalVoltageV: 746, connections: ['L4-Amarela'], lat: -23.5578, lon: -46.6604 },
  { order: 5, code: 'TRI', name: 'Trianon-Masp', substation: 'SR-03', nominalVoltageV: 751, connections: [], lat: -23.5614, lon: -46.6566 },
  { order: 6, code: 'BGD', name: 'Brigadeiro', substation: 'SR-03', nominalVoltageV: 749, connections: [], lat: -23.5687, lon: -46.6493 },
  { order: 7, code: 'PSO', name: 'Paraíso', substation: 'SR-04', nominalVoltageV: 747, connections: ['L1-Azul'], lat: -23.5758, lon: -46.6409 },
  { order: 8, code: 'ANR', name: 'Ana Rosa', substation: 'SR-04', nominalVoltageV: 750, connections: ['L1-Azul'], lat: -23.5814, lon: -46.6382 },
  { order: 9, code: 'CKB', name: 'Chácara Klabin', substation: 'SR-05', nominalVoltageV: 748, connections: ['L5-Lilás'], lat: -23.5926, lon: -46.6292 },
  { order: 10, code: 'SIM', name: 'Santos-Imigrantes', substation: 'SR-05', nominalVoltageV: 745, connections: [], lat: -23.5965, lon: -46.6216 },
  // SR-06 opera com um grupo retificador fora de serviço no cenário simulado:
  // o trecho fica em fim de alimentação e a tensão cai abaixo da faixa normal.
  { order: 11, code: 'AIP', name: 'Alto do Ipiranga', substation: 'SR-06', nominalVoltageV: 620, connections: [], lat: -23.6027, lon: -46.6125 },
  { order: 12, code: 'SAC', name: 'Sacomã', substation: 'SR-06', nominalVoltageV: 680, connections: ['Expresso Tiradentes'], lat: -23.6017, lon: -46.6025 },
  { order: 13, code: 'TTI', name: 'Tamanduateí', substation: 'SR-07', nominalVoltageV: 749, connections: ['CPTM L10-Turquesa'], lat: -23.5931, lon: -46.589 },
  { order: 14, code: 'VPT', name: 'Vila Prudente', substation: 'SR-07', nominalVoltageV: 751, connections: ['L15-Prata'], lat: -23.5839, lon: -46.5808 },
];

export const LINE_STATION_CODES: readonly string[] = LINE_STATIONS.map((station) => station.code);

/** Subestações retificadoras na ordem do traçado, sem repetição. */
export const LINE_SUBSTATIONS: readonly string[] = [...new Set(LINE_STATIONS.map((station) => station.substation))];

export const LINE_TERMINALS = {
  west: LINE_STATIONS[0].name,
  east: LINE_STATIONS[LINE_STATIONS.length - 1].name,
} as const;

const STATION_BY_CODE = new Map(LINE_STATIONS.map((station) => [station.code, station]));

export const findStation = (code: string): LineStation | undefined =>
  STATION_BY_CODE.get(code.trim().toUpperCase());

export const isKnownStation = (code: string): boolean => STATION_BY_CODE.has(code.trim().toUpperCase());
