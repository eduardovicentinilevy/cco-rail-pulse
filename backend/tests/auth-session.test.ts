import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { AuthSessionService } from '../application/services/AuthSessionService';
import type { OperatorLookup } from '../application/services/AuthSessionService';
import { InMemorySessionStore } from '../infrastructure/auth/in-memory-session.store';
import { REVOCATION_REASONS } from '../domain/entities/AuthSession';
import { verifyOperatorToken } from '../shared/jwt';
import { hashRefreshToken } from '../shared/refresh-token';
import { UnauthorizedError } from '../shared/errors';

const MINUTE = 60_000;
const DAY = 86_400_000;

const OPERATOR = { id: 'EDP-042', role: 'SUPERVISOR' };

/** Relógio controlado: a expiração é regra de negócio, não deve depender de `setTimeout`. */
class Clock {
  constructor(private current = new Date('2026-09-18T12:00:00.000Z')) {}
  public now = (): Date => this.current;
  public advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

let store: InMemorySessionStore;
let clock: Clock;
let known: Map<string, { id: string; role: string }>;

const lookup: OperatorLookup = async (operatorId) => known.get(operatorId) ?? null;

const buildService = (reuseGraceMs = 0): AuthSessionService =>
  new AuthSessionService(store, lookup, {
    accessTokenTtlMs: 15 * MINUTE,
    refreshTtlMs: 7 * DAY,
    absoluteTtlMs: 30 * DAY,
    reuseGraceMs,
    now: clock.now,
  });

beforeEach(() => {
  store = new InMemorySessionStore();
  clock = new Clock();
  known = new Map([[OPERATOR.id, { ...OPERATOR }]]);
});

describe('Emissão de sessão', () => {
  it('entrega um access token verificável e um refresh token opaco', async () => {
    const session = await buildService().issue(OPERATOR);
    const payload = verifyOperatorToken(session.accessToken);

    assert.equal(payload?.operatorId, 'EDP-042');
    assert.equal(payload?.role, 'SUPERVISOR');
    assert.equal(payload?.sessionId, session.sessionId);
    assert.equal(session.expiresIn, 900);
    // O refresh token não é um JWT nem carrega claims legíveis.
    assert.equal(session.refreshToken.includes('.'), false);
  });

  it('nunca grava o refresh token em claro', async () => {
    const session = await buildService().issue(OPERATOR);
    const record = await store.findByRefreshHash(hashRefreshToken(session.refreshToken));

    assert.ok(record);
    assert.notEqual(record?.refreshTokenHash, session.refreshToken);
  });

  it('marca a sessão como ativa para o middleware', async () => {
    const service = buildService();
    const session = await service.issue(OPERATOR);
    assert.equal(await service.isActive(session.sessionId), true);
  });

  it('limita a janela do refresh ao teto absoluto da sessão', async () => {
    const service = new AuthSessionService(store, lookup, {
      accessTokenTtlMs: 15 * MINUTE,
      refreshTtlMs: 7 * DAY,
      absoluteTtlMs: DAY,
      now: clock.now,
    });

    const session = await service.issue(OPERATOR);
    assert.equal(session.refreshExpiresAt.getTime(), clock.now().getTime() + DAY);
  });
});

describe('Renovação de sessão', () => {
  it('rotaciona o par a cada renovação', async () => {
    const service = buildService();
    const first = await service.issue(OPERATOR);

    clock.advance(MINUTE);
    const second = await service.refresh(first.refreshToken);

    assert.notEqual(second.refreshToken, first.refreshToken);
    assert.notEqual(second.sessionId, first.sessionId);
    assert.equal(verifyOperatorToken(second.accessToken)?.operatorId, 'EDP-042');
  });

  it('invalida o refresh token anterior', async () => {
    const service = buildService();
    const first = await service.issue(OPERATOR);
    await service.refresh(first.refreshToken);

    await assert.rejects(() => service.refresh(first.refreshToken), UnauthorizedError);
  });

  it('derruba a família inteira quando um token já usado reaparece', async () => {
    const service = buildService();
    const first = await service.issue(OPERATOR);
    const second = await service.refresh(first.refreshToken);

    // Reuso do token antigo: sinal de cópia vazada.
    await assert.rejects(() => service.refresh(first.refreshToken), /reuso/i);

    assert.equal(await service.isActive(second.sessionId), false);
    await assert.rejects(() => service.refresh(second.refreshToken), UnauthorizedError);
  });

  it('trata o reuso dentro da tolerância como corrida entre abas, sem derrubar a sessão', async () => {
    const service = buildService(20_000);
    const first = await service.issue(OPERATOR);
    const second = await service.refresh(first.refreshToken);

    clock.advance(5_000);
    await assert.rejects(() => service.refresh(first.refreshToken), UnauthorizedError);

    // A sessão da aba que venceu a corrida continua utilizável.
    assert.equal(await service.isActive(second.sessionId), true);
    await assert.doesNotReject(() => service.refresh(second.refreshToken));
  });

  it('derruba a sessão quando o reuso acontece depois da tolerância', async () => {
    const service = buildService(20_000);
    const first = await service.issue(OPERATOR);
    const second = await service.refresh(first.refreshToken);

    clock.advance(60_000);
    await assert.rejects(() => service.refresh(first.refreshToken), /reuso/i);
    assert.equal(await service.isActive(second.sessionId), false);
  });

  it('recusa um refresh token desconhecido', async () => {
    await assert.rejects(() => buildService().refresh('token-que-nunca-existiu'), UnauthorizedError);
  });

  it('recusa um refresh token vencido', async () => {
    const service = buildService();
    const session = await service.issue(OPERATOR);

    clock.advance(7 * DAY + MINUTE);
    await assert.rejects(() => service.refresh(session.refreshToken), UnauthorizedError);
  });

  it('não ultrapassa o teto absoluto mesmo com renovações contínuas', async () => {
    const service = buildService();
    let current = await service.issue(OPERATOR);

    for (let week = 0; week < 4; week += 1) {
      clock.advance(6 * DAY);
      current = await service.refresh(current.refreshToken);
    }

    clock.advance(6 * DAY);
    await assert.rejects(() => service.refresh(current.refreshToken), UnauthorizedError);
  });

  it('acompanha o perfil atual do operador em vez de repetir o do login', async () => {
    const service = buildService();
    const session = await service.issue(OPERATOR);

    known.set(OPERATOR.id, { id: OPERATOR.id, role: 'OPERADOR' });
    const renewed = await service.refresh(session.refreshToken);

    assert.equal(verifyOperatorToken(renewed.accessToken)?.role, 'OPERADOR');
  });

  it('corta a renovação de um operador desativado', async () => {
    const service = buildService();
    const session = await service.issue(OPERATOR);

    known.delete(OPERATOR.id);

    await assert.rejects(() => service.refresh(session.refreshToken), UnauthorizedError);
    assert.equal(await service.isActive(session.sessionId), false);
  });
});

describe('Revogação de sessão', () => {
  it('encerra a sessão apresentada e todas as suas renovações', async () => {
    const service = buildService();
    const first = await service.issue(OPERATOR);
    const second = await service.refresh(first.refreshToken);

    await service.revokeSession(second.sessionId, REVOCATION_REASONS.logout);

    assert.equal(await service.isActive(first.sessionId), false);
    assert.equal(await service.isActive(second.sessionId), false);
  });

  it('revogar uma sessão não alcança as outras do mesmo operador', async () => {
    const service = buildService();
    const painel = await service.issue(OPERATOR);
    const celular = await service.issue(OPERATOR);

    await service.revokeSession(painel.sessionId, REVOCATION_REASONS.logout);

    assert.equal(await service.isActive(painel.sessionId), false);
    assert.equal(await service.isActive(celular.sessionId), true);
  });

  it('encerra todos os dispositivos do operador de uma vez', async () => {
    const service = buildService();
    const painel = await service.issue(OPERATOR);
    const celular = await service.issue(OPERATOR);

    assert.equal(await service.revokeOperator(OPERATOR.id, REVOCATION_REASONS.passwordChanged), 2);
    assert.equal(await service.isActive(painel.sessionId), false);
    assert.equal(await service.isActive(celular.sessionId), false);
  });

  it('não renova uma sessão revogada', async () => {
    const service = buildService();
    const session = await service.issue(OPERATOR);

    await service.revokeSession(session.sessionId, REVOCATION_REASONS.logout);
    await assert.rejects(() => service.refresh(session.refreshToken), UnauthorizedError);
  });

  it('ignora silenciosamente a revogação de uma sessão inexistente', async () => {
    await assert.doesNotReject(() => buildService().revokeSession('sessao-inexistente', REVOCATION_REASONS.logout));
  });
});

describe('Limpeza de sessões', () => {
  it('remove apenas o que passou do teto absoluto', async () => {
    const service = buildService();
    await service.issue(OPERATOR);

    assert.equal(await service.purgeExpired(), 0);

    clock.advance(30 * DAY + MINUTE);
    assert.equal(await service.purgeExpired(), 1);
    assert.equal(store.size, 0);
  });
});
