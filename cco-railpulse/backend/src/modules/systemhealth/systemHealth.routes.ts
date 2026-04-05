import { Router, Request, Response } from 'express';
import { db } from '../../infrastructure/db/timescale';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // Verificação de conectividade com o TimescaleDB (Ping)
    await db.query('SELECT 1');
    
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      memoryUsage: process.memoryUsage()
    });
  } catch (error) {
    console.error('[SystemHealth] Falha no probe de vitalidade', error);
    res.status(503).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      database: 'disconnected'
    });
  }
});

export default router;