// src/presentation/http/routes/train.routes.ts
import { Router, Request, Response } from 'express';
import { AuthMiddleware } from '../middlewares/AuthMiddleware';
import { ExecuteTrainCommandUseCase } from '../../../application/use-cases/ExecuteTrainCommandUseCase';
import { AuditLogger } from '../../../infrastructure/security/AuditLogger';

const trainRouter = Router();

// Protege todas as rotas de infraestrutura de trens com o middleware de autenticação JWT
trainRouter.use(AuthMiddleware);

trainRouter.post('/command', (req: Request, res: Response) => {
  const { trainId, command, targetBlock } = req.body;
  const operatorId = req.operator?.operatorId || 'SYSTEM';

  if (!trainId || !command || !targetBlock) {
    return res.status(400).json({ error: 'Parâmetros insuficientes para execução do comando na via.' });
  }

  try {
    const useCase = new ExecuteTrainCommandUseCase();
    const result = useCase.execute({ operatorId, trainId, command, targetBlock });

    return res.status(200).json({
      status: 'COMMAND_EXECUTED',
      message: `Comando ${command} aplicado com sucesso na composição ${trainId}`,
      data: result
    });
  } catch (error: any) {
    AuditLogger.record({
      operatorId,
      action: 'COMMAND_EXECUTION_ERROR',
      targetResource: `TRAIN_${trainId}`,
      severity: 'CRITICAL'
    });
    return res.status(500).json({ error: 'Falha interna ao processar comando crítico de via.' });
  }
});

export { trainRouter };