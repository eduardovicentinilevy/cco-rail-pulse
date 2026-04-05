export interface OverrideCommandDTO {
  train_id: number;
  reason: string;
  operator_id: string; // Extraído do JWT do Operador em Produção
}

export interface OverrideResponseDTO {
  status: 'ACKNOWLEDGED' | 'REJECTED';
  message?: string;
  error?: string;
}