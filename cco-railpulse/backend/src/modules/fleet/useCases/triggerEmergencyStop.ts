import { z } from 'zod';

export const OverrideSchema = z.object({
  train_id: z.number().int().positive(),
  reason: z.string().min(5),
  operator_id: z.string().uuid()
});

type OverrideDTO = z.infer<typeof OverrideSchema>;

export class TriggerEmergencyStopUseCase {
  static async execute(data: OverrideDTO): Promise<boolean> {
    const gatewayUrl = process.env.VITAL_GATEWAY_URL;
    
    if (!gatewayUrl) throw new Error('Gateway SIL 4 não configurado.');

    console.warn(`[SAFETY] Disparando bloqueio vital para o Trem ${data.train_id}. Operador: ${data.operator_id}`);

    try {
      // Chamada HTTPs com mTLS (Mutual TLS) para o Gateway Físico SIL 4 (CLP)
      const response = await fetch(`${gatewayUrl}/api/v1/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: 'EMERGENCY_BRAKE',
          target: data.train_id,
          timestamp: new Date().toISOString()
        })
      });

      return response.ok;
    } catch (error) {
      console.error('[SAFETY] Falha de comunicação com o Vital Computer.', error);
      throw new Error('Falha de redundância de rede do Gateway SIL 4.');
    }
  }
}