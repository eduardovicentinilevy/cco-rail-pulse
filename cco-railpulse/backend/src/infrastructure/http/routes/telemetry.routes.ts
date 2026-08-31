import { Router } from 'express';
import { TelemetryController } from '../controllers/TelemetryController';

const telemetryRouter = Router();
const controller = new TelemetryController();

telemetryRouter.post('/telemetry', controller.store);
telemetryRouter.get('/telemetry', controller.index);

export { telemetryRouter };