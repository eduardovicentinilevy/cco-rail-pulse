import { useState, useEffect } from 'react';
import { ApiService } from '@/services/api';
import type { SystemHealthDTO } from '../types';

export const useSystemHealth = (intervalMs: number = 30000) => {
  const [health, setHealth] = useState<SystemHealthDTO>({
    status: 'healthy',
    database: 'connected',
    timestamp: ''
  });
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    let isMounted = true; 
    let timeoutId: ReturnType<typeof setTimeout>;

    const checkHealth = async () => {
      try {
        const response = await ApiService.get<SystemHealthDTO>('/health');
        
        if (isMounted) {
          setHealth(response);
          setIsOffline(false);
        }
      } catch (error) {
        if (isMounted) {
          setHealth(prev => ({
            ...prev,
            status: 'degraded',
            database: 'disconnected',
            timestamp: new Date().toISOString()
          }));
          setIsOffline(true);
        }
      } finally {
        if (isMounted) {
          timeoutId = setTimeout(checkHealth, intervalMs);
        }
      }
    };

    checkHealth(); 

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [intervalMs]);

  return { health, isOffline };
};