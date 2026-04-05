import { useState } from 'react';
import { ApiService } from '../../../services/api';
import { OverrideCommandDTO, OverrideResponseDTO } from '../types';

export const useEmergencyStop = () => {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const triggerEmergencyBrake = async (payload: OverrideCommandDTO): Promise<boolean> => {
    setIsPending(true);
    setError(null);
    
    try {
      // Injeta manualmente o RBAC (Mock). Em prod: Interceptor do Axios/Fetch injeta o JWT bearer.
      const response = await ApiService.post<OverrideResponseDTO>('/fleet/override', payload, {
        'x-operator-role': 'CCO_SUPERVISOR' 
      });
      
      return response.status === 'ACKNOWLEDGED';
    } catch (err: any) {
      setError(err.message || 'Falha catastrófica de comunicação com o Controlador Lógico Programável.');
      return false;
    } finally {
      setIsPending(false);
    }
  };

  return { triggerEmergencyBrake, isPending, error };
};