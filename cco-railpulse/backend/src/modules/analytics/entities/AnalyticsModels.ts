import { z } from 'zod';

export const HeadwayQuerySchema = z.object({
  fleet_code: z.enum(['I', 'J', 'L']),
  start_time: z.string().datetime(),
  end_time: z.string().datetime(),
});

export type HeadwayQueryDTO = z.infer<typeof HeadwayQuerySchema>;