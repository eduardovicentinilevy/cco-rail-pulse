import { useState, useEffect } from 'react';
import { ApiService } from '../../../services/api';
import type { HeadwayResponseDTO } from '../types'; // Reaproveitamos a tipagem base

export const useDwellTime = (fleetCode: string) => {
  const [data, setData] = useState<HeadwayResponseDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true; 

    const fetchDwellTime = async () => {
      setIsLoading(true);
      try {
        const end = new Date();
        const start = new Date(end.getTime() - 2 * 60 * 60 * 1000);
        
        const response = await ApiService.get<HeadwayResponseDTO>(
          `/analytics/dwell?fleet_code=${fleetCode}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`
        );
        
        if (isMounted) {
          setData(response);
        }
      } catch (error) {
        console.error('[Analytics] Falha ao processar curva de Dwell Time', error);
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