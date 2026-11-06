// backend/presentation/http/middlewares/rate-limit.middleware.ts
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { TooManyRequestsError } from '../../../shared/errors';

export interface RateLimitVerdict {
  /** Tentativas contabilizadas na janela corrente, incluindo a atual. */
  hits: number;
  /** Instante (epoch ms) em que a janela se renova. */
  resetAt: number;
}

/** Porta do contador de tentativas — em memória (processo único) ou em Postgres (cluster). */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<RateLimitVerdict>;
  reset(key: string): Promise<void>;
}

/**
 * Início da janela fixa que contém `now`.
 *
 * Ancorar a janela no relógio, e não na primeira tentativa, é o que faz várias
 * instâncias concordarem sobre qual contador estão incrementando.
 */
export const windowStartFor = (now: number, windowMs: number): number => Math.floor(now / windowMs) * windowMs;

interface Bucket {
  count: number;
  expiresAt: number;
}

/** Contador local, sem dependências externas. Vale apenas para uma instância. */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;

  public async hit(key: string, windowMs: number, now: number): Promise<RateLimitVerdict> {
    this.sweep(now, windowMs);

    const resetAt = windowStartFor(now, windowMs) + windowMs;
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.expiresAt <= now) {
      this.buckets.set(key, { count: 1, expiresAt: resetAt });
      return { hits: 1, resetAt };
    }

    bucket.count += 1;
    return { hits: bucket.count, resetAt: bucket.expiresAt };
  }

  public async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  private sweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < windowMs) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * Limitador de tentativas por janela fixa.
 *
 * O contador vive no store injetado: trocar a implementação por Postgres é o que
 * mantém o limite válido com o CCO rodando em mais de uma instância.
 */
export class RateLimiter {
  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly store: RateLimitStore = new MemoryRateLimitStore(),
  ) {}

  /** Contabiliza uma tentativa e lança 429 quando o limite da janela é excedido. */
  public async consume(key: string): Promise<void> {
    const now = Date.now();
    const { hits, resetAt } = await this.store.hit(key, this.windowMs, now);

    if (hits > this.maxAttempts) {
      const retryInSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      throw new TooManyRequestsError(
        `Muitas tentativas de autenticação. Tente novamente em ${retryInSeconds}s.`,
      );
    }
  }

  /** Zera o contador após uma tentativa bem-sucedida. */
  public async reset(key: string): Promise<void> {
    await this.store.reset(key);
  }
}

/** Chave de limitação de uma requisição. Por padrão, a origem. */
export type RateLimitKeyResolver = (req: Request) => string;

const defaultKey: RateLimitKeyResolver = (req) => req.ip ?? 'unknown';

/** Middleware pronto para pendurar em um router inteiro. */
export const rateLimit = (limiter: RateLimiter, keyFor: RateLimitKeyResolver = defaultKey): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    limiter
      .consume(keyFor(req))
      .then(() => next())
      .catch(next);
  };
