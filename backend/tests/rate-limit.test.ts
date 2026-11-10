import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MemoryRateLimitStore,
  RateLimiter,
  windowStartFor,
} from '../presentation/http/middlewares/rate-limit.middleware';
import type { RateLimitStore } from '../presentation/http/middlewares/rate-limit.middleware';
import { TooManyRequestsError } from '../shared/errors';

describe('RateLimiter', () => {
  it('permite tentativas até o limite da janela', async () => {
    const limiter = new RateLimiter(3, 60_000);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await assert.doesNotReject(() => limiter.consume('EDP-042'));
    }
  });

  it('bloqueia a partir da tentativa excedente', async () => {
    const limiter = new RateLimiter(2, 60_000);
    await limiter.consume('EDP-042');
    await limiter.consume('EDP-042');
    await assert.rejects(() => limiter.consume('EDP-042'), TooManyRequestsError);
  });

  it('isola contadores por chave', async () => {
    const limiter = new RateLimiter(1, 60_000);
    await limiter.consume('EDP-042');
    await assert.doesNotReject(() => limiter.consume('MAR-109'));
    await assert.rejects(() => limiter.consume('EDP-042'), TooManyRequestsError);
  });

  it('libera a chave após um login bem-sucedido', async () => {
    const limiter = new RateLimiter(1, 60_000);
    await limiter.consume('EDP-042');
    await limiter.reset('EDP-042');
    await assert.doesNotReject(() => limiter.consume('EDP-042'));
  });

  it('reabre a janela quando ela expira', async () => {
    const limiter = new RateLimiter(1, 20);
    await limiter.consume('EDP-042');
    await assert.rejects(() => limiter.consume('EDP-042'), TooManyRequestsError);

    await new Promise((resolve) => setTimeout(resolve, 40));
    await assert.doesNotReject(() => limiter.consume('EDP-042'));
  });

  it('informa o tempo de espera na mensagem', async () => {
    const limiter = new RateLimiter(1, 60_000);
    await limiter.consume('EDP-042');
    await assert.rejects(() => limiter.consume('EDP-042'), /Tente novamente em \d+s/);
  });
});

describe('Rate limit com mais de uma instância', () => {
  it('soma as tentativas atendidas por instâncias diferentes', async () => {
    // Duas instâncias do CCO atrás do balanceador, um único contador compartilhado.
    const shared = new MemoryRateLimitStore();
    const instanceA = new RateLimiter(3, 60_000, shared);
    const instanceB = new RateLimiter(3, 60_000, shared);

    await instanceA.consume('login:EDP-042');
    await instanceB.consume('login:EDP-042');
    await instanceA.consume('login:EDP-042');

    // A quarta tentativa cai na outra instância e ainda assim é barrada.
    await assert.rejects(() => instanceB.consume('login:EDP-042'), TooManyRequestsError);
  });

  it('o login bem-sucedido em uma instância libera a chave nas demais', async () => {
    const shared = new MemoryRateLimitStore();
    const instanceA = new RateLimiter(1, 60_000, shared);
    const instanceB = new RateLimiter(1, 60_000, shared);

    await instanceA.consume('login:EDP-042');
    await instanceA.reset('login:EDP-042');

    await assert.doesNotReject(() => instanceB.consume('login:EDP-042'));
  });

  it('ancora a janela no relógio, para que as instâncias contem a mesma', () => {
    const windowMs = 60_000;
    const start = windowStartFor(1_758_204_123_456, windowMs);

    assert.equal(start % windowMs, 0);
    assert.equal(windowStartFor(start + 1, windowMs), start);
    assert.equal(windowStartFor(start + windowMs - 1, windowMs), start);
    assert.equal(windowStartFor(start + windowMs, windowMs), start + windowMs);
  });

  it('propaga o veredito do store compartilhado, sem contagem local', async () => {
    // Store que responde como o Postgres responderia a uma instância recém-subida:
    // o contador já está acima do teto, apesar de esta ser a primeira tentativa aqui.
    const remote: RateLimitStore = {
      hit: async (_key, windowMs, now) => ({ hits: 99, resetAt: windowStartFor(now, windowMs) + windowMs }),
      reset: async () => undefined,
    };

    await assert.rejects(() => new RateLimiter(8, 60_000, remote).consume('login:EDP-042'), TooManyRequestsError);
  });
});
