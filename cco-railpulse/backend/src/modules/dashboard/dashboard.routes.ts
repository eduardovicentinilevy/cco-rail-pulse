import { Router } from 'express';
import { TelemetrySchema } from './entities/Telemetry';
import { IngestTelemetryUseCase } from './useCases/ingestTelemetry';

const router = Router();

// Alta taxa de transferência (UDP-like via HTTP POST ou gRPC futuramente)
router.post('/telemetry', async (req, res) => {
  try {
    const validData = TelemetrySchema.parse(req.body);
    await IngestTelemetryUseCase.execute(validData);
    res.status(202).send(); // Accepted - Desacopla a resposta da persistência
  } catch (error) {
    res.status(400).json({ error: 'Payload de telemetria inválido' });
  }
});

export default router;