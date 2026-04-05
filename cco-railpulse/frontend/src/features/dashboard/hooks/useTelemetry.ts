import { useState, useEffect, useMemo } from 'react';
import { wsService } from '../../../services/websocket';
import type { TelemetryDTO } from '../../types';

export const useTelemetry = (fleetCode: string) => {
  const [trains, setTrains] = useState<Record<number, TelemetryDTO>>({});
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = wsService.connect();

    const onConnect = () => {
      setIsConnected(true);
      console.log(`[CBTC-LINK] Conexão estabelecida. Solicitando frota: ${fleetCode}`);
      socket.emit('telemetry:subscribe', fleetCode);
    };

    const onDisconnect = () => setIsConnected(false);

    // 🕵️ O Espião: Captura QUALQUER evento do WebSocket
    const spy = (eventName: string, ...args: any[]) => {
      // Ignoramos os eventos internos do Socket.io
      if (!['connect', 'disconnect', 'telemetry:subscribe'].includes(eventName)) {
        console.log(`[CBTC-SPY] Sinal interceptado -> Evento: "${eventName}"`, args);
      }
    };
    socket.onAny(spy);

    // Handler defensivo: Aceita tanto { payload: data } quanto o data direto
    const onTelemetryUpdate = (data: any) => {
      const payload = data?.payload || data;
      
      if (!payload || !payload.train_id) return;

      setTrains(prev => ({
        ...prev,
        [payload.train_id]: payload
      }));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('TELEMETRY_UPDATE', onTelemetryUpdate); // O suspeito principal

    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('TELEMETRY_UPDATE', onTelemetryUpdate);
      socket.offAny(spy);
    };
  }, [fleetCode]);

  // Transformação memoizada (Performance Boost)
  const trainList = useMemo(() => Object.values(trains), [trains]);

  return { trains: trainList, isConnected };
};