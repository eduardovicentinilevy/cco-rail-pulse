import { Pool } from 'pg';
import 'dotenv/config';

// 1. DEBUG DE AMBIENTE: Mostra exatamente o que o Node.js está injetando
console.log('[DEBUG-DB] Parâmetros de Conexão Lidos:', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  database: process.env.DB_NAME,
});

// 2. BLINDAGEM DE SO: O .trim() remove quebras de linha ocultas (\r) do Windows
const pool = new Pool({
  host: process.env.DB_HOST?.trim(),
  port: Number(process.env.DB_PORT?.trim()),
  user: process.env.DB_USER?.trim(),
  password: process.env.DB_PASS?.trim(),
  database: process.env.DB_NAME?.trim(),
  max: 30,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Aumentado para 10s (Tolerância para a rede do Docker no Windows)
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool do TimescaleDB', err);
  process.exit(-1); 
});

/**
 * Interface de acesso ao banco isolada da camada de negócios (Clean Architecture)
 */
export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  getClient: () => pool.connect(),
};