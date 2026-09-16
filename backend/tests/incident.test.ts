import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { Incident } from '../domain/entities/Incident';
import { ValidationError } from '../shared/errors';

const buildIncident = (overrides: Partial<{ status: 'ABERTA' | 'EM_ANDAMENTO' | 'RESOLVIDA'; openedAt: Date }> = {}) =>
  new Incident(
    '1',
    'Sobrecorrente no pantógrafo do T-04',
    'Leitura de corrente acima do limite no trecho FGO-SMA durante a partida.',
    'FGO',
    'T-04',
    'ENERGIA',
    'ALTA',
    overrides.status ?? 'ABERTA',
    'EDP-042',
    null,
    null,
    overrides.openedAt ?? new Date('2026-09-16T10:00:00Z'),
    new Date('2026-09-16T10:00:00Z'),
    null,
  );

describe('Incident — validação de entrada', () => {
  it('rejeita título curto demais', () => {
    assert.throws(() => Incident.assertTitle('abc'), ValidationError);
  });

  it('rejeita título acima de 120 caracteres', () => {
    assert.throws(() => Incident.assertTitle('a'.repeat(121)), ValidationError);
  });

  it('remove espaços em volta do título', () => {
    assert.equal(Incident.assertTitle('   Falha de sinalização   '), 'Falha de sinalização');
  });

  it('exige descrição com ao menos 10 caracteres', () => {
    assert.throws(() => Incident.assertDescription('curta'), ValidationError);
    assert.equal(Incident.assertDescription('descrição suficiente'), 'descrição suficiente');
  });
});

describe('Incident — ciclo de vida', () => {
  it('permite ABERTA → EM_ANDAMENTO', () => {
    const incident = buildIncident();
    incident.transitionTo('EM_ANDAMENTO', { assignedTo: 'MAR-109' });

    assert.equal(incident.status, 'EM_ANDAMENTO');
    assert.equal(incident.assignedTo, 'MAR-109');
    assert.equal(incident.resolvedAt, null);
  });

  it('rejeita transição para o mesmo status', () => {
    const incident = buildIncident();
    assert.throws(() => incident.transitionTo('ABERTA'), ValidationError);
  });

  it('rejeita voltar de EM_ANDAMENTO para ABERTA', () => {
    const incident = buildIncident({ status: 'EM_ANDAMENTO' });
    assert.throws(() => incident.transitionTo('ABERTA'), ValidationError);
  });

  it('trata RESOLVIDA como estado terminal', () => {
    const incident = buildIncident({ status: 'RESOLVIDA' });
    assert.equal(incident.canTransitionTo('ABERTA'), false);
    assert.equal(incident.canTransitionTo('EM_ANDAMENTO'), false);
  });

  it('exige tratativa registrada para resolver', () => {
    const incident = buildIncident();
    assert.throws(() => incident.transitionTo('RESOLVIDA', { note: '' }), ValidationError);
    assert.throws(() => incident.transitionTo('RESOLVIDA', { note: 'ok' }), ValidationError);
    assert.equal(incident.status, 'ABERTA', 'a transição inválida não pode alterar o estado');
  });

  it('carimba a resolução e calcula o tempo de tratativa', () => {
    const incident = buildIncident({ openedAt: new Date(Date.now() - 45 * 60_000) });
    incident.transitionTo('RESOLVIDA', { note: 'Disjuntor rearmado e trecho normalizado.' });

    assert.equal(incident.status, 'RESOLVIDA');
    assert.ok(incident.resolvedAt instanceof Date);
    assert.equal(incident.resolutionMinutes, 45);
  });

  it('mantém resolutionMinutes nulo enquanto aberta', () => {
    assert.equal(buildIncident().resolutionMinutes, null);
  });
});

describe('Incident — serialização', () => {
  it('expõe datas em ISO 8601', () => {
    const snapshot = buildIncident().toSnapshot();

    assert.equal(snapshot.openedAt, '2026-09-16T10:00:00.000Z');
    assert.equal(snapshot.resolvedAt, null);
    assert.equal(snapshot.stationCode, 'FGO');
    assert.equal(snapshot.severity, 'ALTA');
  });
});
