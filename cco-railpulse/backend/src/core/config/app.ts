import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Importação dos Módulos de Negócio (Feature Folders)
import systemHealthRoutes from '../../modules/systemhealth/systemHealth.routes';
import dashboardRoutes from '../../modules/dashboard/dashboard.routes';
import fleetRoutes from '../../modules/fleet/fleet.routes';
import alertRoutes from '../../modules/alerts/alerts.routes';
import analyticsRoutes from '../../modules/analytics/analytics.routes';
import stationsRoutes from '../../modules/stations/stations.routes';

export const buildApp = (): Application => {
  const app = express();

  // ============================================================================
  // MIDDLEWARES GLOBAIS DE SEGURANÇA E PARSE
  // ============================================================================
  app.use(helmet()); // Mitigação de vulnerabilidades HTTP (HSTS, NoSniff, XSS Filter)
  
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? ['https://cco-railpulse.com'] : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-operator-role']
  }));

  app.use(express.json({ limit: '1mb' })); // Prevenção de ataques de esgotamento de memória
  app.use(express.urlencoded({ extended: true }));

  // ============================================================================
  // REGISTRO DE ROTAS DE DOMÍNIO
  // ============================================================================
  app.use('/api/v1/health', systemHealthRoutes);     // DevOps / Liveness Probe
  app.use('/api/v1/dashboard', dashboardRoutes);     // Ingestão de Telemetria CBTC
  app.use('/api/v1/fleet', fleetRoutes);             // Gateway Crítico (Override SIL 4)
  app.use('/api/v1/alerts', alertRoutes);            // Gestão de Incidentes (Fila/ACK)
  app.use('/api/v1/analytics', analyticsRoutes);     // Motor de Headway / Séries Temporais
  app.use('/api/v1/stations', stationsRoutes);       // Cálculo de Dwell Time e Eventos de Plataforma

  // ============================================================================
  // FALLBACK E TRATAMENTO GLOBAL DE EXCEÇÕES
  // ============================================================================
  
  // Interceptador de rotas inexistentes (404)
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint não mapeado no gateway CCO-RailPulse.' });
  });

  // Interceptador Global de Erros (500)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[CORE] Exceção Global Capturada:', err);
    
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.status(500).json({ 
      error: 'Falha interna no servidor CCO-RailPulse.',
      details: isProduction ? undefined : err.message 
    });
  });

  return app;
};