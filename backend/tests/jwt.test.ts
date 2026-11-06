import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractBearerToken,
  signMfaChallengeToken,
  signOperatorToken,
  verifyMfaChallengeToken,
  verifyOperatorToken,
} from '../shared/jwt';

const SESSION = {
  operatorId: '5f3a0e4c-9b1d-4a7e-8c2f-0d6b1e9a3c77',
  credential: 'EDP-042',
  role: 'SUPERVISOR',
  tenantId: 'a1d2c3b4-1111-2222-3333-444455556666',
  lineId: 'b2e3d4c5-7777-8888-9999-aaaabbbbcccc',
};

describe('Tokens de sessão', () => {
  it('assina e verifica o payload do operador', () => {
    const payload = verifyOperatorToken(signOperatorToken(SESSION));

    assert.equal(payload?.operatorId, SESSION.operatorId);
    assert.equal(payload?.credential, 'EDP-042');
    assert.equal(payload?.role, 'SUPERVISOR');
  });

  /**
   * O escopo é o que impede uma sessão de alcançar o dado de outro cliente.
   * Se ele sobrevive à ida e volta do token, todo repositório a jusante filtra certo.
   */
  it('carrega o cliente e a linha da sessão', () => {
    const payload = verifyOperatorToken(signOperatorToken(SESSION));

    assert.equal(payload?.tenantId, SESSION.tenantId);
    assert.equal(payload?.lineId, SESSION.lineId);
  });

  /**
   * Um token sem escopo é recusado em vez de cair num cliente padrão: assumir um
   * padrão aqui abriria a porta do cliente errado para um token antigo ou forjado.
   */
  it('recusa um token sem cliente e linha em vez de assumir um padrão', () => {
    const semEscopo = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ operatorId: 'EDP-042', role: 'ADMIN' })).toString('base64url'),
      'assinatura-invalida',
    ].join('.');

    assert.equal(verifyOperatorToken(semEscopo), null);
  });

  it('rejeita token ausente, vazio ou adulterado', () => {
    assert.equal(verifyOperatorToken(null), null);
    assert.equal(verifyOperatorToken(''), null);
    assert.equal(verifyOperatorToken('nao.e.um.jwt'), null);

    assert.equal(verifyOperatorToken(`${signOperatorToken(SESSION)}x`), null);
  });

  it('não confia na assinatura de outro segredo', () => {
    // Header/payload válidos em base64url, assinatura arbitrária.
    const forged = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ ...SESSION, role: 'ADMIN' })).toString('base64url'),
      'assinatura-invalida',
    ].join('.');

    assert.equal(verifyOperatorToken(forged), null);
  });
});

describe('Token de desafio do 2FA', () => {
  const challenge = { operatorId: SESSION.operatorId, tenantId: SESSION.tenantId };

  it('assina e verifica, devolvendo apenas a identidade e o cliente', () => {
    const payload = verifyMfaChallengeToken(signMfaChallengeToken(challenge));

    // deepEqual estrito: o desafio carrega a identidade e o cliente, e nada mais.
    // Em especial não carrega `role` — o perfil só é atribuído depois do
    // segundo fator confirmado.
    assert.deepEqual(payload, challenge);
  });

  it('rejeita um token de sessão comum como se fosse um desafio', () => {
    // Um token de sessão normal não carrega `purpose: 'mfa_challenge'` — não deve
    // servir de atalho para concluir o segundo fator sem ter passado pelo primeiro.
    assert.equal(verifyMfaChallengeToken(signOperatorToken(SESSION)), null);
  });

  it('rejeita um desafio ausente, vazio ou adulterado', () => {
    assert.equal(verifyMfaChallengeToken(null), null);
    assert.equal(verifyMfaChallengeToken(''), null);

    assert.equal(verifyMfaChallengeToken(`${signMfaChallengeToken(challenge)}x`), null);
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
