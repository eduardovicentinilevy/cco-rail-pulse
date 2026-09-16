import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { RateLimiter } from '../presentation/http/middlewares/rate-limit.middleware';
import { TooManyRequestsError } from '../shared/errors';

describe('RateLimiter', () => {
  it('permite tentativas até o limite da janela', () => {
    const limiter = new RateLimiter(3, 60_000);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.doesNotThrow(() => limiter.consume('EDP-042'));
    }
  });

  it('bloqueia a partir da tentativa excedente', () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.consume('EDP-042');
    limiter.consume('EDP-042');
    assert.throws(() => limiter.consume('EDP-042'), TooManyRequestsError);
  });

  it('isola contadores por chave', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.consume('EDP-042');
    assert.doesNotThrow(() => limiter.consume('MAR-109'));
    assert.throws(() => limiter.consume('EDP-042'), TooManyRequestsError);
  });

  it('libera a chave após um login bem-sucedido', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.consume('EDP-042');
    limiter.reset('EDP-042');
    assert.doesNotThrow(() => limiter.consume('EDP-042'));
  });

  it('reabre a janela quando ela expira', async () => {
    const limiter = new RateLimiter(1, 20);
    limiter.consume('EDP-042');
    assert.throws(() => limiter.consume('EDP-042'), TooManyRequestsError);

    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.doesNotThrow(() => limiter.consume('EDP-042'));
  });

  it('informa o tempo de espera na mensagem', () => {
    const limiter = new RateLimiter(1, 60_000);
    limiter.consume('EDP-042');
    assert.throws(() => limiter.consume('EDP-042'), /Tente novamente em \d+s/);
  });
});
