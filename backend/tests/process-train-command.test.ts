import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isLockTimeout } from '../application/use-cases/ProcessTrainCommand';

describe('ProcessTrainCommand — detecção de estouro de lock_timeout', () => {
  it('reconhece o código de erro do Postgres para lock_not_available (55P03)', () => {
    assert.equal(isLockTimeout({ code: '55P03' }), true);
  });

  it('rejeita outros códigos de erro do Postgres', () => {
    assert.equal(isLockTimeout({ code: '23505' }), false); // unique_violation
    assert.equal(isLockTimeout({ code: '40P01' }), false); // deadlock_detected — outra classe de erro
  });

  it('rejeita erros comuns sem código (ex.: ValidationError, Error genérico)', () => {
    assert.equal(isLockTimeout(new Error('qualquer coisa')), false);
    assert.equal(isLockTimeout(new TypeError('boom')), false);
  });

  it('rejeita valores que não são objetos', () => {
    assert.equal(isLockTimeout(null), false);
    assert.equal(isLockTimeout(undefined), false);
    assert.equal(isLockTimeout('55P03'), false);
    assert.equal(isLockTimeout(55), false);
  });
});
