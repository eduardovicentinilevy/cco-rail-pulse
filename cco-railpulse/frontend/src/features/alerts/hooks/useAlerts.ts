import { useState, useEffect, useCallback } from 'react';
import { wsService } from '@/services/websocket';
import { ApiService } from '@/services/api';
import type { AlertDTO } from '../types';

export const useAlerts = () => {
  const [alerts, setAlerts] = useState<AlertDTO[]>([]);

  useEffect(() => {
    const socket = wsService.connect();

    const handleNewAlert = (data: { payload: AlertDTO }) => {
      setAlerts(prev => [data.payload, ...prev]);
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
  }, []);

  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      await ApiService.post('/alerts/ack', {
        alert_id: alertId,
        operator_id: 'a1b2c3d4-mock-uuid-9999'
      });
      
      setAlerts(prev => prev.filter(a => a.alert_id !== alertId));
    } catch (error) {
      console.error('Falha ao assinar ACK:', error);
    }
  }, []);

  return { alerts, acknowledgeAlert };
};