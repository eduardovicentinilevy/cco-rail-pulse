// backend/domain/communications.ts

/** Meios de comunicação registrados pelo CCO — espelha os canais de um despacho ferroviário real. */
export const COMMUNICATION_CHANNELS = [
  'RADIO_TREM',
  'RADIO_MANUTENCAO',
  'RADIO_SEGURANCA',
  'TELEFONE',
  'PRESENCIAL',
] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  RADIO_TREM: 'Rádio — condução',
  RADIO_MANUTENCAO: 'Rádio — manutenção',
  RADIO_SEGURANCA: 'Rádio — segurança patrimonial',
  TELEFONE: 'Telefone',
  PRESENCIAL: 'Presencial',
};

export const COMMUNICATION_DIRECTIONS = ['ENVIADA', 'RECEBIDA'] as const;
export type CommunicationDirection = (typeof COMMUNICATION_DIRECTIONS)[number];

export const isCommunicationChannel = (value: unknown): value is CommunicationChannel =>
  typeof value === 'string' && (COMMUNICATION_CHANNELS as readonly string[]).includes(value);

export const isCommunicationDirection = (value: unknown): value is CommunicationDirection =>
  typeof value === 'string' && (COMMUNICATION_DIRECTIONS as readonly string[]).includes(value);

export interface CommunicationSnapshot {
  id: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  stationCode: string | null;
  trainId: string | null;
  operatorId: string;
  message: string;
  createdAt: string;
}
