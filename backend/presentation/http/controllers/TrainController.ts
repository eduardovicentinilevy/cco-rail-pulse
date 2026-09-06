// src/presentation/http/controllers/TrainController.ts
import { Request, Response } from 'express';
import { HaltTrainUseCase } from '../../../application/use-cases/HaltTrainUseCase';

export class TrainController {
  public static async halt(req: Request, res: Response) {
    const { trainId } = req.body;
    const operatorId = req.operator?.operatorId || 'SYSTEM';

    if (!trainId) {
      return res.status(400).json({ error: 'O ID da composição é obrigatório.' });
    }

    try {
      const useCase = new HaltTrainUseCase();
      await useCase.execute(trainId, operatorId);

      return res.status(200).json({
        status: 'EMERGENCY_SUCCESS',
        message: `Parada de emergência executada com sucesso para a composição ${trainId}`
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Erro interno ao processar parada de emergência.' });
    }
  }
}