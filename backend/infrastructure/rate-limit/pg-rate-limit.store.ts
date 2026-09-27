// backend/infrastructure/rate-limit/pg-rate-limit.store.ts
import { db } from '../database/postgres';
import { env } from '../../config/env';
import { createLogger } from '../../shared/logger';
import { MemoryRateLimitStore, windowStartFor } from '../../presentation/http/middlewares/rate-limit.middleware';
import type { RateLimitStore, RateLimitVerdict } from '../../presentation/http/middlewares/rate-limit.middleware';

const logger = createLogger('RATE-LIMIT');

/**
 * Contador compartilhado no Postgres.
 *
 * O incremento é um único `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, ou seja,
 * atômico: duas instâncias atendendo o mesmo atacante enxergam o mesmo total, sem
 * necessidade de Redis nem de sessão sticky no balanceador.
 */
export class PostgresRateLimitStore implements RateLimitStore {
  /** Rede fora do ar não pode derrubar o login: cai para o contador local e avisa. */
  private readonly fallback = new MemoryRateLimitStore();
  private lastSweep = 0;

  public async hit(key: string, windowMs: number, now: number): Promise<RateLimitVerdict> {
    const windowStart = windowStartFor(now, windowMs);
    const resetAt = windowStart + windowMs;

    try {
      const result = await db.query<{ hits: number }>(
        `INSERT INTO rate_limit_hits (bucket_key, window_start, hits, expires_at)
         VALUES ($1, $2, 1, $3)
         ON CONFLICT (bucket_key, window_start)
         DO UPDATE SET hits = rate_limit_hits.hits + 1
         RETURNING hits`,
        [key, windowStart, new Date(resetAt)],
      );

      void this.sweep(now, windowMs);
      return { hits: Number(result.rows[0]?.hits ?? 1), resetAt };
    } catch (error) {
      logger.error('Contador compartilhado indisponível — limitando apenas nesta instância.', error);
      return this.fallback.hit(key, windowMs, now);
    }
  }

  public async reset(key: string): Promise<void> {
    await this.fallback.reset(key);
    try {
      await db.query(`DELETE FROM rate_limit_hits WHERE bucket_key = $1`, [key]);
    } catch (error) {
      logger.error('Falha ao liberar o contador compartilhado.', error);
    }
  }

  /** Limpeza oportunista das janelas vencidas, no máximo uma vez por janela. */
  private async sweep(now: number, windowMs: number): Promise<void> {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    try {
      await db.query(`DELETE FROM rate_limit_hits WHERE expires_at <= NOW()`);
    } catch {
      // Sem consequência: as linhas vencidas não são contabilizadas de qualquer forma.
    }
  }
}

/** Store escolhido por configuração — Postgres por padrão, memória em processos isolados. */
export const rateLimitStore: RateLimitStore =
  env.rateLimitStore === 'memory' ? new MemoryRateLimitStore() : new PostgresRateLimitStore();
