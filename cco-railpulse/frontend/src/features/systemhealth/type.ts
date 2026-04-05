export interface SystemHealthDTO {
  status: 'healthy' | 'degraded' | 'critical';
  database: 'connected' | 'disconnected';
  timestamp: string;
}

export const _systemHealthTypes = true;