import { Router } from 'express';
import { AckSchema, AlertSchema } from './entities/Alert';
import { ProcessAlertUseCase } from './useCases/processAlert';
import { AcknowledgeAlertUseCase } from './useCases/acknowledgeAlert';

const router = Router();

// Endpoint interno para serviços de monitoramento injetarem anomalias
router.post('/', async (req, res) => {
  try {
    const validData = AlertSchema.parse(req.body);
    await ProcessAlertUseCase.execute(validData);
    res.status(201).json({ message: 'Alerta registrado e propagado.' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Ação do operador no Painel React (Exige assinatura do Operador)
router.post('/ack', async (req, res) => {
  try {
    const validData = AckSchema.parse(req.body);
    await AcknowledgeAlertUseCase.execute(validData);
    res.status(200).json({ message: 'Alerta reconhecido com sucesso.' });
  } catch (error: any) {
    res.status(409).json({ error: error.message });
  }
});

export default router;