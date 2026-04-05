import { Router, Request, Response } from 'express';
import { OverrideSchema, TriggerEmergencyStopUseCase } from './useCases/triggerEmergencyStop';
import { requireRole } from '../../core/middlewares/rbac';

const router = Router();

/**
 * @route   POST /api/v1/fleet/override
 * @desc    Aciona o comando de Parada de Emergência (Intervenção Vital)
 * @access  Restrito (Requer role CCO_SUPERVISOR ou ADMIN)
 */
router.post('/override', requireRole('CCO_SUPERVISOR'), async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Validação Sintática Rigorosa (Zod)
    // Impede que payloads mutados alcancem a camada de hardware
    const validData = OverrideSchema.parse(req.body);
    
    // 2. Execução do Caso de Uso (Comunicação com o Controlador Lógico Programável - SIL 4)
    const success = await TriggerEmergencyStopUseCase.execute(validData);
    
    if (success) {
      res.status(200).json({ 
        status: 'ACKNOWLEDGED',
        message: `Comando de parada para o trem ${validData.train_id} acatado pelo Vital Computer.` 
      });
    } else {
      res.status(502).json({ 
        status: 'REJECTED',
        error: 'O Vital Computer rejeitou o comando. Verifique a contingência de hardware (2oo3).' 
      });
    }
  } catch (error: any) {
    if (error.name === 'ZodError') {
      res.status(400).json({ 
        error: 'Assinatura do comando de Override inválida ou incompleta.', 
        details: error.errors 
      });
    } else {
      // Falhas de rede (mTLS) ou indisponibilidade do Gateway
      res.status(503).json({ 
        error: 'Falha de comunicação segura com o Gateway SIL 4.',
        details: error.message
      });
    }
  }
});

export default router;