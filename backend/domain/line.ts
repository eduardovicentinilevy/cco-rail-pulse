// backend/domain/line.ts
// Fonte única de verdade da malha da Linha 6-Laranja (concessionária Linha Uni).
// O frontend consome esta lista via GET /api/network/stations.

export interface LineStation {
  /** Ordem física da estação no traçado (1 = Brasilândia). */
  readonly order: number;
  readonly code: string;
  readonly name: string;
  /** Subestação retificadora (SR) que alimenta o trilho de alimentação no trecho. */
  readonly substation: string;
  /**
   * Tensão de referência no trilho de alimentação, em volts de corrente contínua.
   * O sistema é modelado em 750 Vcc; trechos em fim de alimentação ficam abaixo disso.
   */
  readonly nominalVoltageV: number;
  /** Integrações com outras linhas e modais, como sinalizadas na estação. */
  readonly connections: readonly string[];
  /** Coordenadas aproximadas da estação (WGS 84) — base das distâncias entre estações. */
  readonly lat: number;
  readonly lon: number;
}

/** Identificador estável da malha, gravado no banco para detectar troca de linha. */
export const LINE_ID = 'L6-LARANJA';
export const LINE_NAME = 'Linha 6-Laranja';
export const LINE_OPERATOR = 'Linha Uni';
/**
 * A Linha 6 não tem catenária: a tração é captada no nível do solo (terceiro
 * trilho). A tensão não é divulgada pela concessionária; o modelo adota 750 Vcc,
 * a mesma classe dos metrôs de terceiro trilho de São Paulo.
 */
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
  { order: 1, code: 'BRA', name: 'Brasilândia', substation: 'SR-01', nominalVoltageV: 752, connections: [], lat: -23.4683, lon: -46.6908 },
  { order: 2, code: 'MAR', name: 'Maristela', substation: 'SR-01', nominalVoltageV: 748, connections: [], lat: -23.476, lon: -46.6879 },
  // SR-02 opera com um grupo retificador fora de serviço no cenário simulado:
  // Itaberaba fica em fim de alimentação e a tensão cai abaixo da faixa crítica.
  { order: 3, code: 'ITA', name: 'Itaberaba-Hospital Vila Penteado', substation: 'SR-02', nominalVoltageV: 620, connections: [], lat: -23.4835, lon: -46.6851 },
  { order: 4, code: 'JPI', name: 'João Paulo I', substation: 'SR-02', nominalVoltageV: 746, connections: [], lat: -23.4912, lon: -46.6869 },
  // Freguesia do Ó, no pé da travessia do Rio Tietê, opera em atenção no cenário.
  { order: 5, code: 'FGO', name: 'Freguesia do Ó', substation: 'SR-03', nominalVoltageV: 680, connections: [], lat: -23.499, lon: -46.6937 },
  { order: 6, code: 'SMA', name: 'Santa Marina', substation: 'SR-03', nominalVoltageV: 749, connections: [], lat: -23.5117, lon: -46.6885 },
  { order: 7, code: 'AGB', name: 'Água Branca', substation: 'SR-04', nominalVoltageV: 750, connections: ['CPTM L7-Rubi'], lat: -23.5198, lon: -46.6873 },
  { order: 8, code: 'POM', name: 'Sesc-Pompeia', substation: 'SR-04', nominalVoltageV: 751, connections: [], lat: -23.5257, lon: -46.6837 },
  { order: 9, code: 'PDZ', name: 'Perdizes', substation: 'SR-05', nominalVoltageV: 748, connections: [], lat: -23.5317, lon: -46.6771 },
  { order: 10, code: 'PUC', name: 'PUC-Cardoso de Almeida', substation: 'SR-05', nominalVoltageV: 750, connections: [], lat: -23.5372, lon: -46.6706 },
  { order: 11, code: 'FAA', name: 'FAAP-Pacaembu', substation: 'SR-06', nominalVoltageV: 749, connections: [], lat: -23.544, lon: -46.662 },
  { order: 12, code: 'HGM', name: 'Higienópolis-Mackenzie', substation: 'SR-06', nominalVoltageV: 747, connections: ['L4-Amarela'], lat: -23.5474, lon: -46.652 },
  { order: 13, code: '14B', name: '14 Bis-Saracura', substation: 'SR-07', nominalVoltageV: 751, connections: [], lat: -23.5532, lon: -46.6466 },
  { order: 14, code: 'BLV', name: 'Bela Vista', substation: 'SR-07', nominalVoltageV: 749, connections: [], lat: -23.5573, lon: -46.6428 },
  { order: 15, code: 'SJQ', name: 'São Joaquim', substation: 'SR-08', nominalVoltageV: 750, connections: ['L1-Azul'], lat: -23.5617, lon: -46.6383 },
];

export const LINE_STATION_CODES: readonly string[] = LINE_STATIONS.map((station) => station.code);

/** Subestações retificadoras na ordem do traçado, sem repetição. */
export const LINE_SUBSTATIONS: readonly string[] = [...new Set(LINE_STATIONS.map((station) => station.substation))];

/**
 * Terminais da linha. As chaves seguem o sentido de circulação da API
 * (`west` = primeira estação, sentido -1; `east` = última, sentido 1): na
 * Linha 6 o traçado desce da zona noroeste (Brasilândia) ao centro (São Joaquim).
 */
export const LINE_TERMINALS = {
  west: LINE_STATIONS[0].name,
  east: LINE_STATIONS[LINE_STATIONS.length - 1].name,
} as const;

const STATION_BY_CODE = new Map(LINE_STATIONS.map((station) => [station.code, station]));

export const findStation = (code: string): LineStation | undefined =>
  STATION_BY_CODE.get(code.trim().toUpperCase());

export const isKnownStation = (code: string): boolean => STATION_BY_CODE.has(code.trim().toUpperCase());
