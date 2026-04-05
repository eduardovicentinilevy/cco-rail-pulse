import { Router } from 'express';
import { DwellTimeQuerySchema } from './entities/StationModels';
import { CalculateDwellTimeUseCase } from './useCases/calculateDwellTime';

const router = Router();

router.get('/dwell-time', async (req, res) => {
  try {
    const validQuery = DwellTimeQuerySchema.parse(req.query);
    const result = await CalculateDwellTimeUseCase.execute(validQuery);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: 'Parâmetros de consulta Dwell Time inválidos', details: error.errors });
  }
});

export default router;