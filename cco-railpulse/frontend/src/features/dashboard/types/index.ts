// Caminho: src/features/dashboard/types/index.ts (ou types.ts)

export interface TelemetryDTO {
  fleet_code: 'I' | 'J' | 'L';
  train_id: number;
  speed_kmh: number;
  latitude: number;
  longitude: number;
  doors_open: boolean;
  cbtc_sync_status: 'SYNCED' | 'DEGRADED' | 'LOST';
  timestamp?: string;
}
export const _telemetryTypes = true;