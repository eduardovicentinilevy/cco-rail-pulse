import { z } from 'zod';

export const AlertSchema = z.object({
  train_id: z.number().int().positive(),
  fleet_code: z.enum(['I', 'J', 'L']),
  severity: z.enum(['WARNING', 'CRITICAL']),
  message: z.string().min(5),
  timestamp: z.string().datetime(),
});

export const AckSchema = z.object({
  alert_id: z.string().uuid(),
  operator_id: z.string().uuid(),
});

export type AlertDTO = z.infer<typeof AlertSchema>;
export type AckDTO = z.infer<typeof AckSchema>;