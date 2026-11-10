import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import {
  extractBearerToken,
  signMfaChallengeToken,
  signOperatorToken,
  signPasswordChangeToken,
  verifyMfaChallengeToken,
  verifyOperatorToken,
  verifyPasswordChangeToken,
} from '../shared/jwt';

const SESSION_ID = '0f2a9c34-7d51-4f0e-8a1e-1b2c3d4e5f60';

describe('Tokens de sessão', () => {
  it('assina e verifica o payload do operador', () => {
    const token = signOperatorToken({ operatorId: 'EDP-042', role: 'SUPERVISOR', sessionId: SESSION_ID });
    const payload = verifyOperatorToken(token);

    assert.equal(payload?.operatorId, 'EDP-042');
    assert.equal(payload?.role, 'SUPERVISOR');
    assert.equal(payload?.sessionId, SESSION_ID);
  });

  it('rejeita token ausente, vazio ou adulterado', () => {
    assert.equal(verifyOperatorToken(null), null);
    assert.equal(verifyOperatorToken(''), null);
    assert.equal(verifyOperatorToken('nao.e.um.jwt'), null);

    const token = signOperatorToken({ operatorId: 'EDP-042', role: 'ADMIN', sessionId: SESSION_ID });
    assert.equal(verifyOperatorToken(`${token}x`), null);
  });

  it('não confia na assinatura de outro segredo', () => {
    // Header/payload válidos em base64url, assinatura arbitrária.
    const forged = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ operatorId: 'EDP-042', role: 'ADMIN', sid: SESSION_ID })).toString('base64url'),
      'assinatura-invalida',
    ].join('.');

    assert.equal(verifyOperatorToken(forged), null);
  });

  it('expira conforme a configuração, para que a renovação seja obrigatória', () => {
    const token = signOperatorToken({
      operatorId: 'EDP-042',
      role: 'ADMIN',
      sessionId: SESSION_ID,
      expiresIn: '-1s',
    });

    assert.equal(verifyOperatorToken(token), null);
  });

  it('rejeita um token legado, sem identificador de sessão', () => {
    // Tokens emitidos antes das sessões revogáveis não podem ser revogados —
    // aceitá-los deixaria um logout sem efeito até o vencimento.
    const legacy = jwt.sign({ operatorId: 'EDP-042', role: 'ADMIN', purpose: 'access' }, env.jwtSecret, {
      expiresIn: '8h',
    });

    assert.equal(verifyOperatorToken(legacy), null);
  });
});

describe('Tokens de etapa intermediária', () => {
  it('assina e verifica o desafio do 2FA, devolvendo apenas o operatorId', () => {
    const token = signMfaChallengeToken('EDP-042');
    assert.equal(verifyMfaChallengeToken(token), 'EDP-042');
  });

  it('assina e verifica o token de troca de senha', () => {
    const token = signPasswordChangeToken('EDP-042');
    assert.equal(verifyPasswordChangeToken(token), 'EDP-042');
  });

  it('não aceita um token de sessão comum no lugar de um desafio', () => {
    // Um token de sessão normal não carrega o propósito da etapa — não deve servir
    // de atalho para concluir o segundo fator sem ter passado pelo primeiro.
    const sessionToken = signOperatorToken({ operatorId: 'EDP-042', role: 'ADMIN', sessionId: SESSION_ID });

    assert.equal(verifyMfaChallengeToken(sessionToken), null);
    assert.equal(verifyPasswordChangeToken(sessionToken), null);
  });

  it('não troca um propósito pelo outro', () => {
    // O token que só deveria abrir a definição de senha não pode fechar o 2FA,
    // nem o desafio do 2FA pode redefinir a senha de alguém.
    assert.equal(verifyMfaChallengeToken(signPasswordChangeToken('EDP-042')), null);
    assert.equal(verifyPasswordChangeToken(signMfaChallengeToken('EDP-042')), null);
  });

  it('não abre sessão com um token de etapa intermediária', () => {
    assert.equal(verifyOperatorToken(signMfaChallengeToken('EDP-042')), null);
    assert.equal(verifyOperatorToken(signPasswordChangeToken('EDP-042')), null);
  });

  it('rejeita um desafio ausente, vazio ou adulterado', () => {
    assert.equal(verifyMfaChallengeToken(null), null);
    assert.equal(verifyMfaChallengeToken(''), null);
    assert.equal(verifyPasswordChangeToken(null), null);

    const token = signMfaChallengeToken('EDP-042');
    assert.equal(verifyMfaChallengeToken(`${token}x`), null);
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
