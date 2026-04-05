import { z } from 'zod';

export const TelemetrySchema = z.object({
  fleet_code: z.enum(['I', 'J', 'L']),
  train_id: z.number().int().positive(),
  speed_kmh: z.number().min(0).max(120), // Limite físico da via
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  doors_open: z.boolean(),
  cbtc_sync_status: z.enum(['SYNCED', 'DEGRADED', 'LOST'])
});

export type TelemetryDTO = z.infer<typeof TelemetrySchema>;