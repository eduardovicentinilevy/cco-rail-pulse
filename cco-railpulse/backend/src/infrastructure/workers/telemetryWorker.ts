import { createClient } from 'redis';
import { Pool } from 'pg';

// 1. Conexão com o Banco Histórico (TimescaleDB / PostgreSQL)
const dbPool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5444,
  user: process.env.DB_USER || 'railpulse_admin',
  password: process.env.DB_PASS || 'secure_password',
  database: process.env.DB_NAME || 'ccorailpulse',
});

export const startTelemetryWorker = async () => {
  console.log('[WORKER] Inicializando Ingestão de Dados Históricos...');

  const subscriber = createClient({ 
    url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}` 
  });

  subscriber.on('error', (err) => console.error('[WORKER] Falha no Redis:', err));
  await subscriber.connect();

  await subscriber.subscribe('telemetry', async (message) => {
    try {
      const payload = JSON.parse(message);

      // Query alinhada com o tb_cbtc_telemetry do init.sql
      const query = `
        INSERT INTO tb_cbtc_telemetry 
        (fleet_code, train_id, speed_kmh, latitude, longitude, doors_open, cbtc_sync_status, event_time)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `;
      
      const values = [
        payload.fleet_code,
        payload.train_id,
        payload.speed_kmh,
        payload.latitude,
        payload.longitude,
        payload.doors_open,
        payload.cbtc_sync_status || 'SYNCED'
      ];

      await dbPool.query(query, values);
      
    } catch (error) {
      console.error('[WORKER] Falha ao persistir telemetria:', error);
    }
  });

  console.log('[WORKER] Escutando barramento SIL 4 e gravando no TimescaleDB.');
};