import { z } from 'zod';

export const DwellTimeQuerySchema = z.object({
  fleet_code: z.enum(['I', 'J', 'L']).optional(),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
});

export type DwellTimeQueryDTO = z.infer<typeof DwellTimeQuerySchema>;