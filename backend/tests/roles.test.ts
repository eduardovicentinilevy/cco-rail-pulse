import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { can, isOperatorRole } from '../domain/roles';

describe('Controle de acesso por perfil', () => {
  it('todo operador autenticado pode comandar e tratar ocorrências', () => {
    for (const role of ['OPERATOR_SOC', 'SUPERVISOR', 'ADMIN']) {
      assert.equal(can(role, 'COMMAND_TRAIN'), true, role);
      assert.equal(can(role, 'MANAGE_INCIDENTS'), true, role);
      assert.equal(can(role, 'VIEW_OPERATORS'), true, role);
    }
  });

  it('gerir a equipe exige ao menos supervisor', () => {
    assert.equal(can('OPERATOR_SOC', 'MANAGE_OPERATORS'), false);
    assert.equal(can('SUPERVISOR', 'MANAGE_OPERATORS'), true);
    assert.equal(can('ADMIN', 'MANAGE_OPERATORS'), true);
  });

  it('administrar o sistema é exclusivo do ADMIN', () => {
    assert.equal(can('SUPERVISOR', 'ADMINISTER_SYSTEM'), false);
    assert.equal(can('ADMIN', 'ADMINISTER_SYSTEM'), true);
  });

  it('nega perfis desconhecidos ou ausentes', () => {
    assert.equal(can(undefined, 'COMMAND_TRAIN'), false);
    assert.equal(can('ROOT', 'COMMAND_TRAIN'), false);
    assert.equal(can('', 'VIEW_OPERATORS'), false);
  });

  it('valida perfis conhecidos', () => {
    assert.equal(isOperatorRole('ADMIN'), true);
    assert.equal(isOperatorRole('admin'), false);
    assert.equal(isOperatorRole(null), false);
  });
});
