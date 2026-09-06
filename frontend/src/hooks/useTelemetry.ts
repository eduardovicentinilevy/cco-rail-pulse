import { useState, useEffect, useCallback } from 'react';
import type { Station, StationStatus } from '../types';
import { wsService } from '../services/websocket.service';

const INITIAL_STATIONS: Station[] = [
  { code: 'BRA', name: 'Brasilândia', status: 'NORMAL', trains: ['T-01'], headway: '3 min', voltageKV: 24.8 },
  { code: 'MAR', name: 'Maristela', status: 'NORMAL', trains: ['T-02'], headway: '3 min', voltageKV: 25.0 },
  { code: 'IVP', name: 'Itaberaba-Hospital Vila Penteado', status: 'NORMAL', trains: ['T-03'], headway: '4 min', voltageKV: 24.9 },
  { code: 'JOI', name: 'João Paulo I', status: 'NORMAL', trains: ['T-04'], headway: '3 min', voltageKV: 25.1 },
  { code: 'FOC', name: 'Freguesia do Ó', status: 'NORMAL', trains: ['T-05'], headway: '3 min', voltageKV: 24.7 },
  { code: 'SMA', name: 'Santa Marina', status: 'NORMAL', trains: ['T-06'], headway: '3 min', voltageKV: 25.0 },
  { code: 'AGU', name: 'Água Branca', status: 'ATENÇÃO', trains: ['T-07', 'T-08'], headway: '6 min', voltageKV: 23.2 },
  { code: 'SBO', name: 'SESC-Pompeia', status: 'NORMAL', trains: ['T-09'], headway: '3 min', voltageKV: 25.0 },
  { code: 'PER', name: 'Perdizes', status: 'NORMAL', trains: ['T-10'], headway: '3 min', voltageKV: 24.9 },
  { code: 'PUC', name: 'PUC-Cardoso de Almeida', status: 'NORMAL', trains: ['T-11'], headway: '3 min', voltageKV: 25.0 },
  { code: 'FAA', name: 'FAAP-Pacaembu', status: 'NORMAL', trains: ['T-12'], headway: '3 min', voltageKV: 25.2 },
  { code: 'HIG', name: 'Higienópolis-Mackenzie', status: 'NORMAL', trains: ['T-13'], headway: '2 min', voltageKV: 24.8 },
  { code: '14B', name: '14 Bis-Saracura', status: 'NORMAL', trains: ['T-14'], headway: '3 min', voltageKV: 25.0 },
  { code: 'BEL', name: 'Bela Vista', status: 'NORMAL', trains: ['T-15'], headway: '3 min', voltageKV: 24.9 },
  { code: 'SJO', name: 'São Joaquim', status: 'NORMAL', trains: ['T-16'], headway: '3 min', voltageKV: 25.0 },
];

export const useTelemetry = () => {
  const [stations, setStations] = useState<Station[]>(INITIAL_STATIONS);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [selectedStation, setSelectedStation] = useState<Station>(INITIAL_STATIONS[0]);

  useEffect(() => {
    const socket = wsService.connect();

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('telemetry:batch', (updatedTrains: any[]) => {
      setStations((prev) =>
        prev.map((st) => {
          const liveTrain = updatedTrains.find((t) => t.currentStationCode === st.code);
          if (liveTrain) {
            return {
              ...st,
              voltageKV: liveTrain.voltageKV,
              status: (liveTrain.status === 'EMERGÊNCIA' ? 'ATENÇÃO' : 'NORMAL') as StationStatus,
            };
          }
          return st;
        })
      );
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('telemetry:batch');
      wsService.disconnect();
    };
  }, []);

  const sendCommand = useCallback((trainId: string, command: 'HALT' | 'RESTRICT' | 'RELEASE') => {
    wsService.emitCommand(trainId, command);
  }, []);

  return { stations, isConnected, selectedStation, setSelectedStation, sendCommand };
};