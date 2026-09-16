import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractBearerToken, signOperatorToken, verifyOperatorToken } from '../shared/jwt';

describe('Tokens de sessão', () => {
  it('assina e verifica o payload do operador', () => {
    const token = signOperatorToken({ operatorId: 'EDP-042', role: 'SUPERVISOR' });
    const payload = verifyOperatorToken(token);

    assert.equal(payload?.operatorId, 'EDP-042');
    assert.equal(payload?.role, 'SUPERVISOR');
  });

  it('rejeita token ausente, vazio ou adulterado', () => {
    assert.equal(verifyOperatorToken(null), null);
    assert.equal(verifyOperatorToken(''), null);
    assert.equal(verifyOperatorToken('nao.e.um.jwt'), null);

    const token = signOperatorToken({ operatorId: 'EDP-042', role: 'ADMIN' });
    assert.equal(verifyOperatorToken(`${token}x`), null);
  });

  it('não confia na assinatura de outro segredo', () => {
    // Header/payload válidos em base64url, assinatura arbitrária.
    const forged = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ operatorId: 'EDP-042', role: 'ADMIN' })).toString('base64url'),
      'assinatura-invalida',
    ].join('.');

    assert.equal(verifyOperatorToken(forged), null);
  });
});

describe('extractBearerToken', () => {
  it('extrai o token de um header bem formado', () => {
    assert.equal(extractBearerToken('Bearer abc.def.ghi'), 'abc.def.ghi');
  });

  it('ignora headers ausentes ou de outro esquema', () => {
    assert.equal(extractBearerToken(undefined), null);
    assert.equal(extractBearerToken('Basic abc'), null);
    assert.equal(extractBearerToken('Bearer '), null);
    assert.equal(extractBearerToken('bearer abc'), null);
  });
});
