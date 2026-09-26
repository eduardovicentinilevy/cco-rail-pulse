import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  base32Decode,
  base32Encode,
  buildOtpAuthUrl,
  currentTotp,
  generateTotpSecret,
  verifyTotp,
  verifyTotpStep,
} from '../shared/totp';

describe('TOTP — base32', () => {
  it('faz o roundtrip de qualquer buffer', () => {
    for (const input of [Buffer.from([]), Buffer.from([1]), Buffer.from('segredo-de-teste'), Buffer.alloc(20, 7)]) {
      assert.deepEqual(base32Decode(base32Encode(input)), input);
    }
  });

  it('usa apenas o alfabeto RFC 4648', () => {
    const encoded = base32Encode(Buffer.from('qualquer coisa aqui'));
    assert.match(encoded, /^[A-Z2-7]+$/);
  });
});

describe('TOTP — geração e verificação', () => {
  it('gera um segredo de 160 bits (32 caracteres em base32)', () => {
    const secret = generateTotpSecret();
    assert.equal(secret.length, 32);
    assert.equal(base32Decode(secret).length, 20);
  });

  it('aceita o código do passo corrente', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    assert.ok(verifyTotp(secret, currentTotp(secret, now), now));
  });

  it('tolera ±30s de dessincronia de relógio', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = currentTotp(secret, now);

    assert.ok(verifyTotp(secret, code, now - 29_000));
    assert.ok(verifyTotp(secret, code, now + 29_000));
  });

  it('rejeita um código fora da janela de tolerância', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = currentTotp(secret, now);

    assert.equal(verifyTotp(secret, code, now + 90_000), false);
  });

  it('rejeita código de outro segredo', () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const now = Date.now();

    assert.equal(verifyTotp(secretA, currentTotp(secretB, now), now), false);
  });

  it('rejeita entradas que não têm o formato de um código de 6 dígitos', () => {
    const secret = generateTotpSecret();
    for (const malformed of ['', '12345', '1234567', 'abcdef']) {
      assert.equal(verifyTotp(secret, malformed), false);
    }
  });

  it('ignora espaços ao redor do código, como quem cola do app autenticador', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    assert.ok(verifyTotp(secret, ` ${currentTotp(secret, now)} `, now));
  });

  it('monta uma URI otpauth:// reconhecida por apps autenticadores', () => {
    const url = buildOtpAuthUrl('ABCDEFGHIJKLMNOP', 'EDP-042');
    assert.match(url, /^otpauth:\/\/totp\//);
    assert.match(url, /secret=ABCDEFGHIJKLMNOP/);
    assert.match(url, /digits=6/);
    assert.match(url, /period=30/);
  });
});

describe('TOTP — verifyTotpStep (base da proteção contra reuso)', () => {
  it('retorna o número do passo quando o código bate', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const step = verifyTotpStep(secret, currentTotp(secret, now), now);
    assert.equal(typeof step, 'number');
  });

  it('retorna o MESMO passo para o mesmo código — é isso que permite detectar reuso', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = currentTotp(secret, now);

    assert.equal(verifyTotpStep(secret, code, now), verifyTotpStep(secret, code, now));
  });

  it('passos de janelas de 30s diferentes são números diferentes', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const stepNow = verifyTotpStep(secret, currentTotp(secret, now), now);
    const stepLater = verifyTotpStep(secret, currentTotp(secret, now + 30_000), now + 30_000);

    assert.notEqual(stepNow, stepLater);
    assert.ok(stepLater! > stepNow!);
  });

  it('retorna null para código inválido ou fora da janela', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = currentTotp(secret, now);

    assert.equal(verifyTotpStep(secret, 'abcdef', now), null);
    assert.equal(verifyTotpStep(secret, code, now + 90_000), null);
  });

  it('verifyTotp é exatamente "verifyTotpStep não é null"', () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = currentTotp(secret, now);

    assert.equal(verifyTotp(secret, code, now), verifyTotpStep(secret, code, now) !== null);
    assert.equal(verifyTotp(secret, '000000', now), verifyTotpStep(secret, '000000', now) !== null);
  });
});
