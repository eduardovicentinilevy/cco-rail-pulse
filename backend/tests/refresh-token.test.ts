import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateRefreshToken, hashRefreshToken, refreshTokenHashEquals } from '../shared/refresh-token';
import { parseDurationMs, parseDurationSeconds } from '../shared/duration';

describe('Refresh token', () => {
  it('gera um segredo opaco com 384 bits de entropia', () => {
    const { token } = generateRefreshToken();

    assert.equal(Buffer.from(token, 'base64url').length, 48);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });

  it('não repete o segredo entre emissões', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateRefreshToken().token));
    assert.equal(tokens.size, 100);
  });

  it('entrega o hash que vai para o banco, nunca o segredo', () => {
    const { token, hash } = generateRefreshToken();

    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]+$/);
    assert.notEqual(hash, token);
    assert.equal(hash.includes(token), false);
  });

  it('o hash é determinístico, para permitir a busca pela apresentação do token', () => {
    const { token, hash } = generateRefreshToken();
    assert.equal(hashRefreshToken(token), hash);
    assert.notEqual(hashRefreshToken(`${token}x`), hash);
  });

  it('compara hashes em tempo constante', () => {
    const { token, hash } = generateRefreshToken();

    assert.equal(refreshTokenHashEquals(hash, hashRefreshToken(token)), true);
    assert.equal(refreshTokenHashEquals(hash, hashRefreshToken('outro')), false);
    assert.equal(refreshTokenHashEquals(hash, 'curto'), false);
  });
});

describe('Duração das credenciais', () => {
  it('entende os formatos aceitos pelo assinador de tokens', () => {
    assert.equal(parseDurationMs('15m'), 900_000);
    assert.equal(parseDurationMs('8h'), 28_800_000);
    assert.equal(parseDurationMs('30s'), 30_000);
    assert.equal(parseDurationMs('7d'), 604_800_000);
    assert.equal(parseDurationMs('250ms'), 250);
  });

  it('trata número puro como segundos, igual ao assinador', () => {
    assert.equal(parseDurationMs('900'), 900_000);
    assert.equal(parseDurationMs(900), 900_000);
  });

  it('cai no padrão diante de um valor sem sentido', () => {
    assert.equal(parseDurationMs('qualquer coisa'), 900_000);
    assert.equal(parseDurationMs('', 60_000), 60_000);
  });

  it('converte para segundos, que é o que a API informa ao painel', () => {
    assert.equal(parseDurationSeconds('15m'), 900);
  });
});
