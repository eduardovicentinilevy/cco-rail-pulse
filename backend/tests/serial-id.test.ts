import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { serialId } from '../shared/http';

describe('serialId', () => {
  it('aceita um id inteiro', () => {
    assert.equal(serialId('12'), 12);
    assert.equal(serialId('0'), 0);
  });

  it('recusa um id com sufixo — "12abc" não pode virar o registro #12', () => {
    // `Number.parseInt('12abc')` devolve 12; é justamente o que o helper evita.
    assert.equal(serialId('12abc'), null);
    assert.equal(serialId('12 '), null);
    assert.equal(serialId('1.5'), null);
    assert.equal(serialId('-3'), null);
  });

  it('recusa entrada vazia ou não numérica', () => {
    assert.equal(serialId(''), null);
    assert.equal(serialId('abc'), null);
  });

  it('recusa um inteiro além do que o JavaScript representa com exatidão', () => {
    assert.equal(serialId('9'.repeat(25)), null);
  });
});
