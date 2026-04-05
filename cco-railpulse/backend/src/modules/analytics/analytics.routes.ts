import { Router } from 'express';
import { HeadwayQuerySchema } from './entities/AnalyticsModels';
import { CalculateHeadwayUseCase } from './useCases/calculateHeadway';
import { CalculateDwellTimeUseCase } from './useCases/calculateDwellTime';

const router = Router();

// Rota existente do Headway (Gráfico da Esquerda)
router.get('/headway', async (req, res) => {
  try {
    const validQuery = HeadwayQuerySchema.parse(req.query);
    const result = await CalculateHeadwayUseCase.execute(validQuery);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: 'Parâmetros de consulta inválidos', details: error.errors });
  }
});

// Nova rota do Dwell Time (Gráfico da Direita)
router.get('/dwell', async (req, res) => {
  try {
    const validQuery = HeadwayQuerySchema.parse(req.query);
    const result = await CalculateDwellTimeUseCase.execute(validQuery);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: 'Parâmetros de consulta inválidos', details: error.errors });
  }
});

export default router;