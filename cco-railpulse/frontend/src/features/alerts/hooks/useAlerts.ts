import { useState, useEffect, useCallback } from 'react';
import { wsService } from '../../../services/websocket';
import { ApiService } from '../../../services/api';
import type { AlertDTO } from '../types';

export const useAlerts = () => {
  const [alerts, setAlerts] = useState<AlertDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInitialAlerts = useCallback(async () => {
    try {
      setIsLoading(true);
      // Garanta que o ApiService tenha o prefixo /api/v1 configurado no baseURL
      const data = await ApiService.get<AlertDTO[]>('/alerts/active');
      setAlerts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('[ALERTS_HOOK] Erro ao carregar alertas:', error);
      setAlerts([]); // Fallback para lista vazia em caso de 404
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialAlerts();

    const socket = wsService.connect();

    const handleNewAlert = (data: { payload: AlertDTO }) => {
      setAlerts(prev => {
        const exists = prev.some(a => a.alert_id === data.payload.alert_id);
        if (exists) return prev;
        return [data.payload, ...prev];
      });
    };

    const handleAlertAck = (data: { payload: { alert_id: string } }) => {
      setAlerts(prev => prev.filter(a => a.alert_id !== data.payload.alert_id));
    };

    socket.on('NEW_ALERT', handleNewAlert);
    socket.on('ALERT_ACKNOWLEDGED', handleAlertAck);

    return () => {
      socket.off('NEW_ALERT', handleNewAlert);
      socket.off('ALERT_ACKNOWLEDGED', handleAlertAck);
    };
  }, [fetchInitialAlerts]);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      await ApiService.post('/alerts/ack', {
        alert_id: alertId,
        operator_id: 'eduardo-levy-cco-sup'
      });
      setAlerts(prev => prev.filter(a => a.alert_id !== alertId));
    } catch (error) {
      console.error('[ALERTS_HOOK] Erro no ACK:', error);
    }
  }, []);

  return { alerts, acknowledgeAlert, isLoading };
};