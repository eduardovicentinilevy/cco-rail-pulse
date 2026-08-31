import { Request, Response } from 'express';
import { ProcessTelemetryUseCase } from '../../../application/use-cases/ProcessTelemetryUseCase';
import { TelemetryRepository } from '../../database/TelemetryRepository';

const telemetryRepo = new TelemetryRepository();
const processTelemetryUseCase = new ProcessTelemetryUseCase(telemetryRepo);

export class TelemetryController {
  async store(req: Request, res: Response): Promise<Response> {
    try {
      await processTelemetryUseCase.execute(req.body);
      return res.status(201).json({ message: 'Telemetry event processed successfully.' });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }

  async index(req: Request, res: Response): Promise<Response> {
    const data = await telemetryRepo.findLatest();
    return res.json(data);
  }
}