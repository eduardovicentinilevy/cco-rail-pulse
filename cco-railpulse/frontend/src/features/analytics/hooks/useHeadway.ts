import { useState, useEffect } from 'react';
// Correção de Path: Substituído @/ por caminho relativo
import { ApiService } from '../../../services/api';
import type { HeadwayResponseDTO } from '../types';

export const useHeadway = (fleetCode: string) => {
  const [data, setData] = useState<HeadwayResponseDTO | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true; 

    const fetchHeadway = async () => {
      setIsLoading(true);
      try {
        const end = new Date();
        const start = new Date(end.getTime() - 2 * 60 * 60 * 1000);
        
        const response = await ApiService.get<HeadwayResponseDTO>(
          `/analytics/headway?fleet_code=${fleetCode}&start_time=${start.toISOString()}&end_time=${end.toISOString()}`
        );
        
        if (isMounted) {
          setData(response);
        }
      } catch (error) {
        console.error('[Analytics] Falha ao processar curva de Headway', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchHeadway();

    return () => {
      isMounted = false;
    };
  }, [fleetCode]);

  return { data, isLoading };
};