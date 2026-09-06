// backend/infrastructure/database/postgres.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';

// Garante que as variáveis de ambiente estão carregadas
dotenv.config();

// Configuração do Connection Pool visando performance e estabilidade
export const db = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  max: 20, // Limite de conexões simultâneas no pool
  idleTimeoutMillis: 30000, // Encerra conexões inativas após 30s
  connectionTimeoutMillis: 2000, // Timeout rápido para evitar gargalos na subida
});

// Listener de eventos críticos do Pool para monitoramento do SOC
db.on('connect', () => {
  // Conexão estabelecida com sucesso (mantido silencioso para não poluir os logs)
});

db.on('error', (err) => {
  console.error('[DB-FATAL-ERROR] Erro inesperado no Pool do PostgreSQL:', err);
  // Em um ambiente Kubernetes/Docker, forçaríamos a reinicialização do container
  process.exit(-1);
});