// backend/infrastructure/database/postgres.ts
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { env } from '../../config/env';
import { createLogger } from '../../shared/logger';

const logger = createLogger('DB-POOL');

export const db = new Pool(
  env.database.url
    ? { connectionString: env.database.url }
    : {
        host: env.database.host,
        port: env.database.port,
        user: env.database.user,
        password: env.database.password,
        database: env.database.name,
      },
);

db.on('error', (error) => {
  // Erros em clientes ociosos não devem derrubar o processo do CCO.
  logger.error('Erro inesperado em cliente ocioso do pool.', error);
});

/**
 * Executa um bloco dentro de uma transação, liberando o client em qualquer desfecho.
 * Usado por comandos críticos que precisam de locking pessimista.
 */
export const withTransaction = async <T>(handler: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const closeDatabase = async (): Promise<void> => {
  await db.end();
  logger.info('Pool de conexões encerrado.');
};
