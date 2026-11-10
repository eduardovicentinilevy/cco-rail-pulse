import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  generateCompliantPassword,
  isPasswordCompliant,
  validatePassword,
} from '../domain/password-policy';

const STRONG = 'Trilho#Sul7Kv';

describe('Política de senha', () => {
  it('aceita uma senha forte', () => {
    assert.deepEqual(validatePassword(STRONG), []);
  });

  it('recusa a senha de demonstração do protótipo', () => {
    assert.equal(isPasswordCompliant('123456'), false);
  });

  it('exige o comprimento mínimo', () => {
    const violations = validatePassword('Ab3#xY9z');
    assert.ok(violations.some((violation) => violation.includes(String(PASSWORD_MIN_LENGTH))));
  });

  it('exige minúscula, maiúscula, número e símbolo', () => {
    assert.ok(validatePassword('trilhosuldozn').some((v) => v.includes('maiúscula')));
    assert.ok(validatePassword('TRILHOSULDOZN').some((v) => v.includes('minúscula')));
    assert.ok(validatePassword('TrilhoSulDoZn').some((v) => v.includes('número')));
    assert.ok(validatePassword('TrilhoSulDoZn7').some((v) => v.includes('símbolo')));
  });

  it('recusa senha maior do que o bcrypt consegue considerar', () => {
    const violations = validatePassword(`${'A1#b'.repeat(20)}`);
    assert.ok(violations.some((violation) => violation.includes(String(PASSWORD_MAX_BYTES))));
  });

  it('recusa termos de dicionário e jargão do produto', () => {
    for (const weak of ['RailPulse#2026', 'MinhaSenha#123x', 'Qwerty#Aberto9']) {
      assert.equal(isPasswordCompliant(weak), false, `deveria recusar ${weak}`);
    }
  });

  it('recusa sequências e repetições longas', () => {
    assert.ok(validatePassword('Trilho#abcd99').some((v) => v.includes('sequências')));
    assert.ok(validatePassword('Trilho#Sulllll9').some((v) => v.includes('repetir')));
  });

  it('não deixa a credencial nem o nome virarem a própria senha', () => {
    const context = { operatorId: 'EDP-042', name: 'Eduardo Vicentini Levy' };

    assert.ok(validatePassword('Metro#Edp042Sul', context).some((v) => v.includes('credencial')));
    assert.ok(validatePassword('Xis#Vicentini9K', context).some((v) => v.includes('credencial')));
    // A mesma senha passa quando não é a credencial de quem a está definindo.
    assert.deepEqual(validatePassword('Xis#Vicentini9K', { operatorId: 'MAR-109', name: 'Marina Rezende' }), []);
  });

  it('ignora acentuação ao comparar com o nome', () => {
    const violations = validatePassword('Nakamura#Liv9K', { operatorId: 'LIV-551', name: 'Lívia Nakamura' });
    assert.ok(violations.some((v) => v.includes('credencial')));
  });

  it('respeita um mínimo elevado por configuração, nunca um reduzido', () => {
    assert.ok(validatePassword(STRONG, {}, { minLength: 24 }).some((v) => v.includes('24')));
    assert.deepEqual(validatePassword(STRONG, {}, { minLength: 4 }), []);
  });

  it('reporta todas as violações de uma vez', () => {
    assert.ok(validatePassword('senha').length >= 4);
  });

  it('exige que a senha seja informada', () => {
    assert.deepEqual(validatePassword(''), ['Informe a nova senha.']);
  });

  it('gera senhas de primeiro acesso em conformidade com a própria política', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const generated = generateCompliantPassword();
      assert.deepEqual(validatePassword(generated), [], `senha gerada fora da política: ${generated}`);
    }
  });

  it('não repete a senha de primeiro acesso entre instalações', () => {
    const generated = new Set(Array.from({ length: 20 }, () => generateCompliantPassword()));
    assert.equal(generated.size, 20);
  });
});
