export interface AlertDTO {
  alert_id: string;
  train_id: number;
  fleet_code: string;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  created_at: string;
  acknowledged?: boolean;
}

export interface AckPayloadDTO {
  alert_id: string;
  operator_id: string;
}