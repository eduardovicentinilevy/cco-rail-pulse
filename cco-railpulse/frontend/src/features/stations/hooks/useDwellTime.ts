import { useState, useEffect } from 'react';
import { ApiService } from '@/services/api';
import type { DwellTimeResponseDTO } from '../types';

export const useDwellTime = (fleetCode: string) => {
  const [data, setData] = useState<DwellTimeResponseDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchDwellTime = async () => {
      setIsLoading(true);
      try {
        const end = new Date();
        const start = new Date(end.getTime() - 2 * 60 * 60 * 1000);

        const response = await ApiService.get<DwellTimeResponseDTO>(
          `/stations/dwell-time?fleet_code=${fleetCode}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`
        );

        if (isMounted) {
          setData(response);
        }
      } catch (error) {
        console.error('[Stations] Falha ao processar métricas de plataforma', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchDwellTime();

    return () => {
      isMounted = false;
    };
  }, [fleetCode]);

  return { data, isLoading };
};