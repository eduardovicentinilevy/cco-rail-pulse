import http from 'http';
import { buildApp } from './core/config/app';
import { initializeWebSocket } from './infrastructure/websocket/socket';
import { db } from './infrastructure/db/timescale';
import { connectPublisher } from './infrastructure/redis/publisher';
import { startTelemetryWorker } from './infrastructure/workers/telemetryWorker'; // O Import do Worker
import 'dotenv/config';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // 1. Validação de Conexão com TimescaleDB (Com Resiliência)
    let retries = 5;
    while (retries > 0) {
      try {
        const client = await db.getClient();
        client.release();
        console.log('[DB] TimescaleDB operando em estabilidade.');
        break; // Conectou com sucesso
      } catch (error: any) {
        retries -= 1;
        console.warn(`[DB] Tentativa de conexão falhou. Aguardando... (Tentativas restantes: ${retries})`);
        if (retries === 0) throw error;
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    // 2. Conexão do Publisher do Redis
    await connectPublisher();
    console.log('[REDIS] Barramento de eventos operando em estabilidade.');

    // 3. Inicialização do App HTTP
    const app = buildApp();
    const server = http.createServer(app);

    // 4. Acoplamento dos WebSockets (Redis Backplane)
    await initializeWebSocket(server);

    // 5. Acoplamento do Ingestor de Dados Históricos (Pipeline de BI)
    await startTelemetryWorker();

    // 6. Abertura da Porta
    server.listen(PORT, () => {
      console.log(`[CORE] CCO-RailPulse Gateway ativo na porta ${PORT} | PID: ${process.pid}`);
    });

    // 7. Graceful Shutdown (Interceptação de Sinais)
    const gracefulShutdown = (signal: string) => {
      console.log(`\n[CORE] Sinal ${signal} recebido. Iniciando encerramento seguro...`);
      server.close(() => {
        console.log('[CORE] Servidor HTTP/WS encerrado.');
        process.exit(0);
      });

      // Força o encerramento se travar por mais de 10 segundos
      setTimeout(() => {
        console.error('[CORE] Encerramento forçado por Timeout.');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('[CORE] Falha catastrófica na inicialização do sistema.', error);
    process.exit(1);
  }
};

startServer();