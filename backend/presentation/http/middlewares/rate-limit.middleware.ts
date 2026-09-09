// backend/presentation/http/middlewares/rate-limit.middleware.ts
import { TooManyRequestsError } from '../../../shared/errors';

interface Bucket {
  count: number;
  expiresAt: number;
}

/**
 * Limitador de tentativas em memória (janela fixa), sem dependências externas.
 * Suficiente para uma instância única do CCO; em cluster, trocar por Redis.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  /** Contabiliza uma tentativa e lança 429 quando o limite da janela é excedido. */
  public consume(key: string): void {
    const now = Date.now();
    this.sweep(now);

    const bucket = this.buckets.get(key);

    if (!bucket || bucket.expiresAt <= now) {
      this.buckets.set(key, { count: 1, expiresAt: now + this.windowMs });
      return;
    }

    bucket.count += 1;

    if (bucket.count > this.maxAttempts) {
      const retryInSeconds = Math.ceil((bucket.expiresAt - now) / 1000);
      throw new TooManyRequestsError(
        `Muitas tentativas de autenticação. Tente novamente em ${retryInSeconds}s.`,
      );
    }
  }

  /** Zera o contador após uma tentativa bem-sucedida. */
  public reset(key: string): void {
    this.buckets.delete(key);
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt <= now) this.buckets.delete(key);
    }
  }
}
