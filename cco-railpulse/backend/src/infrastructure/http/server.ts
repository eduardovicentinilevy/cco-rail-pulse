import express from 'express';
import cors from 'cors';
import { telemetryRouter } from './routes/telemetry.routes';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api', telemetryRouter);

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`[Server] CCO Rail Pulse Backend running on port ${PORT}`);
});