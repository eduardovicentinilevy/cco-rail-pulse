// frontend/src/data/stations.ts
// Malha oficial da Linha 6-Laranja (Linha Uni) — fonte única de estações,
// espelhando os códigos usados pelo simulador de telemetria do backend.
import type { Station } from '../types';

export const LINE_STATIONS: Station[] = [
  { id: 1, code: 'BRA', name: 'Brasilândia', status: 'NORMAL', trains: ['T-01'], voltageKV: 24.6, headway: '4min 10s' },
  { id: 2, code: 'MAR', name: 'Maristela', status: 'NORMAL', trains: [], voltageKV: 24.7, headway: '4min 05s' },
  { id: 3, code: 'ITA', name: 'Itaberaba-Hospital Vila Penteado', status: 'CRÍTICO', trains: [], voltageKV: 21.9, headway: '9min 30s' },
  { id: 4, code: 'JPI', name: 'João Paulo I', status: 'NORMAL', trains: [], voltageKV: 24.4, headway: '4min 12s' },
  { id: 5, code: 'FGO', name: 'Freguesia do Ó', status: 'ATENÇÃO', trains: ['T-04'], voltageKV: 23.2, headway: '6min 40s' },
  { id: 6, code: 'SMA', name: 'Santa Marina', status: 'NORMAL', trains: [], voltageKV: 24.6, headway: '4min 02s' },
  { id: 7, code: 'AGB', name: 'Água Branca', status: 'NORMAL', trains: [], voltageKV: 24.5, headway: '4min 00s' },
  { id: 8, code: 'POM', name: 'SESC-Pompeia', status: 'NORMAL', trains: [], voltageKV: 24.6, headway: '3min 58s' },
  { id: 9, code: 'PDZ', name: 'Perdizes', status: 'NORMAL', trains: ['T-07'], voltageKV: 24.5, headway: '4min 04s' },
  { id: 10, code: 'PUC', name: 'PUC-Cardoso de Almeida', status: 'NORMAL', trains: [], voltageKV: 24.7, headway: '3min 55s' },
  { id: 11, code: 'FAA', name: 'FAAP-Pacaembu', status: 'NORMAL', trains: [], voltageKV: 24.6, headway: '4min 01s' },
  { id: 12, code: 'HGM', name: 'Higienópolis-Mackenzie', status: 'NORMAL', trains: [], voltageKV: 24.5, headway: '4min 03s' },
  { id: 13, code: '14B', name: '14 Bis-Saracura', status: 'NORMAL', trains: ['T-12'], voltageKV: 24.6, headway: '4min 06s' },
  { id: 14, code: 'BLV', name: 'Bela Vista', status: 'NORMAL', trains: [], voltageKV: 24.7, headway: '3min 59s' },
  { id: 15, code: 'SJQ', name: 'São Joaquim', status: 'NORMAL', trains: [], voltageKV: 24.6, headway: '4min 00s' },
];
