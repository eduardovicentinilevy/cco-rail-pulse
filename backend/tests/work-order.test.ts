import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { WorkOrder } from '../domain/entities/WorkOrder';
import { ValidationError } from '../shared/errors';

const buildWorkOrder = (
  overrides: Partial<{ status: 'ABERTA' | 'EM_ANDAMENTO' | 'CONCLUÍDA' | 'CANCELADA'; openedAt: Date; dueAt: Date | null }> = {},
) =>
  new WorkOrder(
    '1',
    'Substituir disjuntor da TSS Freguesia do Ó',
    'Disjuntor com sinais de sobreaquecimento identificados na última ronda de manutenção.',
    'TSS-FGO',
    'FGO',
    'TSS_SUBESTACAO',
    'ALTA',
    overrides.status ?? 'ABERTA',
    'EDP-042',
    null,
    null,
    overrides.openedAt ?? new Date('2026-09-16T10:00:00Z'),
    new Date('2026-09-16T10:00:00Z'),
    null,
    overrides.dueAt !== undefined ? overrides.dueAt : null,
  );

describe('WorkOrder — validação de entrada', () => {
  it('rejeita título curto demais', () => {
    assert.throws(() => WorkOrder.assertTitle('abc'), ValidationError);
  });

  it('rejeita título acima de 120 caracteres', () => {
    assert.throws(() => WorkOrder.assertTitle('a'.repeat(121)), ValidationError);
  });

  it('remove espaços em volta do título', () => {
    assert.equal(WorkOrder.assertTitle('   Trocar lâmpada do sinal   '), 'Trocar lâmpada do sinal');
  });

  it('exige descrição com ao menos 10 caracteres', () => {
    assert.throws(() => WorkOrder.assertDescription('curta'), ValidationError);
    assert.equal(WorkOrder.assertDescription('descrição suficiente'), 'descrição suficiente');
  });

  it('trata a identificação do ativo como opcional', () => {
    assert.equal(WorkOrder.assertAssetCode(''), null);
    assert.equal(WorkOrder.assertAssetCode('   '), null);
    assert.equal(WorkOrder.assertAssetCode(' TSS-FGO '), 'TSS-FGO');
  });

  it('rejeita identificação do ativo acima de 80 caracteres', () => {
    assert.throws(() => WorkOrder.assertAssetCode('a'.repeat(81)), ValidationError);
  });
});

describe('WorkOrder — ciclo de vida', () => {
  it('permite ABERTA → EM_ANDAMENTO', () => {
    const workOrder = buildWorkOrder();
    workOrder.transitionTo('EM_ANDAMENTO', { assignedTo: 'MAR-109' });

    assert.equal(workOrder.status, 'EM_ANDAMENTO');
    assert.equal(workOrder.assignedTo, 'MAR-109');
    assert.equal(workOrder.completedAt, null);
  });

  it('permite ABERTA → CANCELADA diretamente', () => {
    const workOrder = buildWorkOrder();
    workOrder.transitionTo('CANCELADA', { note: 'Duplicada de outra OS já aberta.' });

    assert.equal(workOrder.status, 'CANCELADA');
  });

  it('rejeita transição para o mesmo status', () => {
    const workOrder = buildWorkOrder();
    assert.throws(() => workOrder.transitionTo('ABERTA'), ValidationError);
  });

  it('rejeita voltar de EM_ANDAMENTO para ABERTA', () => {
    const workOrder = buildWorkOrder({ status: 'EM_ANDAMENTO' });
    assert.throws(() => workOrder.transitionTo('ABERTA'), ValidationError);
  });

  it('trata CONCLUÍDA e CANCELADA como estados terminais', () => {
    const completed = buildWorkOrder({ status: 'CONCLUÍDA' });
    assert.equal(completed.canTransitionTo('EM_ANDAMENTO'), false);

    const cancelled = buildWorkOrder({ status: 'CANCELADA' });
    assert.equal(cancelled.canTransitionTo('ABERTA'), false);
  });

  it('exige o serviço executado registrado para concluir', () => {
    const workOrder = buildWorkOrder({ status: 'EM_ANDAMENTO' });
    assert.throws(() => workOrder.transitionTo('CONCLUÍDA', { note: '' }), ValidationError);
    assert.throws(() => workOrder.transitionTo('CONCLUÍDA', { note: 'ok' }), ValidationError);
    assert.equal(workOrder.status, 'EM_ANDAMENTO', 'a transição inválida não pode alterar o estado');
  });

  it('carimba a conclusão e calcula o tempo de execução', () => {
    const workOrder = buildWorkOrder({ status: 'EM_ANDAMENTO', openedAt: new Date(Date.now() - 90 * 60_000) });
    workOrder.transitionTo('CONCLUÍDA', { note: 'Disjuntor substituído e trecho normalizado.' });

    assert.equal(workOrder.status, 'CONCLUÍDA');
    assert.ok(workOrder.completedAt instanceof Date);
    assert.equal(workOrder.completionMinutes, 90);
  });

  it('mantém completionMinutes nulo enquanto não concluída', () => {
    assert.equal(buildWorkOrder().completionMinutes, null);
  });
});

describe('WorkOrder — prazo (dueAt)', () => {
  it('não está atrasada sem prazo definido', () => {
    assert.equal(buildWorkOrder({ dueAt: null }).isOverdue, false);
  });

  it('está atrasada quando o prazo já passou e a OS segue aberta', () => {
    const workOrder = buildWorkOrder({ dueAt: new Date(Date.now() - 60_000) });
    assert.equal(workOrder.isOverdue, true);
  });

  it('não considera atrasada uma OS já concluída, mesmo com prazo vencido', () => {
    const workOrder = buildWorkOrder({ status: 'CONCLUÍDA', dueAt: new Date(Date.now() - 60_000) });
    assert.equal(workOrder.isOverdue, false);
  });

  it('não está atrasada quando o prazo ainda não chegou', () => {
    const workOrder = buildWorkOrder({ dueAt: new Date(Date.now() + 60_000) });
    assert.equal(workOrder.isOverdue, false);
  });
});

describe('WorkOrder — serialização', () => {
  it('expõe datas em ISO 8601', () => {
    const snapshot = buildWorkOrder().toSnapshot();

    assert.equal(snapshot.openedAt, '2026-09-16T10:00:00.000Z');
    assert.equal(snapshot.completedAt, null);
    assert.equal(snapshot.stationCode, 'FGO');
    assert.equal(snapshot.assetCode, 'TSS-FGO');
    assert.equal(snapshot.priority, 'ALTA');
  });
});
