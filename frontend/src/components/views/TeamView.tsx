// frontend/src/components/views/TeamView.tsx
import React, { useCallback, useMemo, useState } from 'react';
import type { OperatorProfile, OperatorSession, RoleOption } from '../../types';
import { api, ApiError } from '../../services/api';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { can, roleLabel } from '../../lib/permissions';
import { useResource } from '../../hooks/useResource';
import { useAuthErrorHandler } from '../../hooks/useAuthErrorHandler';
import { formatDateTime } from '../../lib/format';
import { DEFAULT_AVATAR_URL } from '../../config/env';
import type { ConfirmRequest } from '../common/ConfirmDialog';

interface TeamViewProps {
  session: OperatorSession;
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
  onRequestConfirm: (request: ConfirmRequest) => void;
  onAuthError: (message: string) => void;
}

const ROLE_TONE: Record<string, string> = {
  ADMIN: 'CRÍTICO',
  SUPERVISOR: 'ATENÇÃO',
  OPERADOR: 'INFO',
};

export const TeamView: React.FC<TeamViewProps> = ({ session, onNotify, onRequestConfirm, onAuthError }) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // O backend é a autoridade; aqui a checagem só desabilita o que seria negado.
  const canManage = can(session.role, 'MANAGE_OPERATORS');

  const load = useCallback(() => api.team(session.token), [session.token]);
  const handleError = useAuthErrorHandler(onAuthError, 'consultar o cadastro de operadores');
  const { data, error, isLoading, reload } = useResource('team', load, handleError);

  // Memoizado para manter a identidade estável entre renders (evita recalcular os KPIs).
  const operators = useMemo(() => (data?.operators ?? []) as OperatorProfile[], [data]);
  const roles = (data?.roles ?? []) as RoleOption[];

  const stats = useMemo(() => {
    const active = operators.filter((operator) => operator.isActive);
    return {
      total: operators.length,
      active: active.length,
      supervisors: active.filter((operator) => operator.role !== 'OPERADOR').length,
      neverLogged: operators.filter((operator) => operator.lastLoginAt === null).length,
    };
  }, [operators]);

  const handleRoleChange = async (operator: OperatorProfile, role: string) => {
    setBusyId(operator.id);
    try {
      await api.changeOperatorRole(session.token, operator.id, role);
      onNotify(`Perfil de ${operator.name} atualizado para ${roleLabel(role)}.`, 'success');
      reload();
    } catch (error) {
      if (error instanceof ApiError && error.isAuthError) {
        onAuthError('Sua sessão expirou ao alterar o perfil de acesso.');
        return;
      }
      onNotify(error instanceof Error ? error.message : 'Não foi possível alterar o perfil.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleActive = (operator: OperatorProfile) => {
    const activating = !operator.isActive;

    const apply = async () => {
      setBusyId(operator.id);
      try {
        await api.setOperatorActive(session.token, operator.id, activating);
        onNotify(`Credencial de ${operator.name} ${activating ? 'reativada' : 'revogada'}.`, 'success');
        reload();
      } catch (error) {
        if (error instanceof ApiError && error.isAuthError) {
          onAuthError('Sua sessão expirou ao alterar a credencial.');
          return;
        }
        onNotify(error instanceof Error ? error.message : 'Não foi possível alterar a credencial.', 'error');
      } finally {
        setBusyId(null);
      }
    };

    if (activating) {
      void apply();
      return;
    }

    // Revogar acesso derruba o operador do sistema — exige confirmação explícita.
    onRequestConfirm({
      title: 'Revogar credencial',
      message: `${operator.name} (${operator.id}) perderá o acesso ao Centro de Controle imediatamente. A ação fica registrada na trilha de auditoria.`,
      tone: 'danger',
      confirmLabel: 'Revogar acesso',
      onConfirm: () => void apply(),
    });
  };

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Equipe de operação</span>
          <h2 className="rp-page-header__title">Cadastro de operadores e credenciamento</h2>
          <p className="rp-page-header__subtitle">
            Perfis hierárquicos: cada nível herda as permissões dos níveis abaixo
          </p>
        </div>
        <button
          type="button"
          className="rp-btn rp-btn--primary"
          onClick={() => setIsCreateOpen(true)}
          disabled={!canManage}
          title={canManage ? undefined : 'Requer perfil de Supervisor ou Administrador'}
        >
          + Cadastrar operador
        </button>
      </div>

      {!canManage && (
        <p className="rp-login__error" role="status">
          <span aria-hidden="true">🔒</span>
          Seu perfil ({roleLabel(session.role)}) permite consultar o cadastro, mas não alterá-lo. As ações de gestão
          exigem Supervisor ou Administrador — a restrição é aplicada também no servidor.
        </p>
      )}

      <div className="rp-grid rp-grid--kpi">
        <article className="rp-metric" data-status="INFO">
          <span className="rp-metric__label">Operadores cadastrados</span>
          <span className="rp-metric__value">{stats.total}</span>
          <span className="rp-metric__hint">{stats.active} com credencial ativa</span>
        </article>
        <article className="rp-metric" data-status="ATENÇÃO">
          <span className="rp-metric__label">Supervisão</span>
          <span className="rp-metric__value">{stats.supervisors}</span>
          <span className="rp-metric__hint">Perfis com poder de gestão</span>
        </article>
        <article className="rp-metric" data-status={stats.total - stats.active > 0 ? 'CRÍTICO' : 'NORMAL'}>
          <span className="rp-metric__label">Credenciais revogadas</span>
          <span className="rp-metric__value">{stats.total - stats.active}</span>
          <span className="rp-metric__hint">Sem acesso ao Centro de Controle</span>
        </article>
        <article className="rp-metric" data-status="INFO">
          <span className="rp-metric__label">Nunca acessaram</span>
          <span className="rp-metric__value">{stats.neverLogged}</span>
          <span className="rp-metric__hint">Sem login registrado na auditoria</span>
        </article>
      </div>

      <section className="rp-card rp-card--flush">
        {isLoading && (
          <div className="rp-stack rp-stack--tight" style={{ padding: 'var(--sp-5)' }} aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="rp-skeleton" style={{ height: '3rem' }} />
            ))}
          </div>
        )}

        {!isLoading && error && (
          <EmptyState icon="⚠" title="Não foi possível carregar o cadastro." hint={error} />
        )}

        {!isLoading && !error && operators.length === 0 && <EmptyState icon="👥" title="Nenhum operador cadastrado." />}

        {!isLoading && operators.length > 0 && (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="sr-only">Operadores cadastrados no Centro de Controle</caption>
              <thead>
                <tr>
                  <th scope="col">Operador</th>
                  <th scope="col">Credencial</th>
                  <th scope="col">Perfil de acesso</th>
                  <th scope="col">Último acesso</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Ação</th>
                </tr>
              </thead>
              <tbody>
                {operators.map((operator) => {
                  const isSelf = operator.id === session.operatorId;
                  const isBusy = busyId === operator.id;

                  return (
                    <tr key={operator.id} style={{ opacity: operator.isActive ? 1 : 0.55 }}>
                      <td>
                        <span className="rp-row" style={{ gap: 'var(--sp-2)' }}>
                          <img
                            className="rp-profile__avatar"
                            src={operator.avatarUrl || DEFAULT_AVATAR_URL}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.src = DEFAULT_AVATAR_URL;
                            }}
                          />
                          <span>
                            <strong>{operator.name}</strong>
                            {isSelf && <span className="rp-hint"> (você)</span>}
                          </span>
                        </span>
                      </td>
                      <td className="mono">{operator.id}</td>
                      <td>
                        {canManage && !isSelf ? (
                          <select
                            className="rp-input"
                            value={operator.role}
                            onChange={(event) => void handleRoleChange(operator, event.target.value)}
                            disabled={isBusy || !operator.isActive}
                            aria-label={`Perfil de acesso de ${operator.name}`}
                          >
                            {roles.map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusPill status={ROLE_TONE[operator.role] ?? 'INFO'} label={roleLabel(operator.role)} />
                        )}
                      </td>
                      <td className="mono text-muted">
                        {operator.lastLoginAt ? formatDateTime(operator.lastLoginAt) : 'Nunca'}
                      </td>
                      <td>
                        <StatusPill
                          status={operator.isActive ? 'NORMAL' : 'CRÍTICO'}
                          label={operator.isActive ? 'Ativa' : 'Revogada'}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`rp-btn ${operator.isActive ? 'rp-btn--danger' : 'rp-btn--outline'}`}
                          onClick={() => handleToggleActive(operator)}
                          disabled={!canManage || isSelf || isBusy}
                          title={
                            isSelf
                              ? 'Não é possível revogar a própria credencial'
                              : canManage
                                ? undefined
                                : 'Requer perfil de Supervisor ou Administrador'
                          }
                        >
                          {operator.isActive ? 'Revogar' : 'Reativar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isCreateOpen && (
        <CreateOperatorModal
          session={session}
          roles={roles}
          onClose={() => setIsCreateOpen(false)}
          onCreated={(name) => {
            onNotify(`Operador ${name} cadastrado.`, 'success');
            setIsCreateOpen(false);
            reload();
          }}
          onAuthError={onAuthError}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

interface CreateOperatorModalProps {
  session: OperatorSession;
  roles: RoleOption[];
  onClose: () => void;
  onCreated: (name: string) => void;
  onAuthError: (message: string) => void;
}

const CREDENTIAL_PATTERN = /^[A-Z]{3}-\d{3}$/;

const CreateOperatorModal: React.FC<CreateOperatorModalProps> = ({
  session,
  roles,
  onClose,
  onCreated,
  onAuthError,
}) => {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('OPERADOR');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCredentialValid = CREDENTIAL_PATTERN.test(id);
  const canSubmit = isCredentialValid && name.trim().length >= 3 && password.length >= 6 && !isSaving;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSaving(true);
    setError(null);
    try {
      await api.createOperator(session.token, { id, name: name.trim(), role, password });
      onCreated(name.trim());
    } catch (err) {
      if (err instanceof ApiError && err.isAuthError) {
        onAuthError('Sua sessão expirou ao cadastrar o operador.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Não foi possível cadastrar o operador.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title="Cadastrar operador"
      subtitle="A credencial segue o padrão CCO: três letras, hífen e três dígitos"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rp-btn" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" form="rp-operator-form" className="rp-btn rp-btn--primary" disabled={!canSubmit}>
            {isSaving && <span className="rp-spinner" aria-hidden="true" />}
            {isSaving ? 'Cadastrando…' : 'Cadastrar operador'}
          </button>
        </>
      }
    >
      <form id="rp-operator-form" className="rp-stack" onSubmit={handleSubmit} noValidate>
        <div className="rp-field">
          <label className="rp-label" htmlFor="operator-id">
            Credencial
          </label>
          <input
            id="operator-id"
            className="rp-input mono"
            value={id}
            onChange={(event) => setId(event.target.value.toUpperCase())}
            placeholder="EDP-042"
            maxLength={7}
            aria-invalid={id.length > 0 && !isCredentialValid ? true : undefined}
            required
          />
          <span className="rp-hint">Três letras, hífen e três dígitos — ex.: MAR-109.</span>
        </div>

        <div className="rp-field">
          <label className="rp-label" htmlFor="operator-name">
            Nome completo
          </label>
          <input
            id="operator-name"
            className="rp-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome do operador"
            required
          />
        </div>

        <div className="rp-field">
          <label className="rp-label" htmlFor="operator-role">
            Perfil de acesso
          </label>
          <select id="operator-role" className="rp-input" value={role} onChange={(event) => setRole(event.target.value)}>
            {roles.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rp-field">
          <label className="rp-label" htmlFor="operator-password">
            Senha provisória
          </label>
          <input
            id="operator-password"
            className="rp-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mínimo de 6 caracteres"
            required
          />
          <span className="rp-hint">A senha é armazenada apenas como hash bcrypt.</span>
        </div>

        {error && (
          <p className="rp-login__error" role="alert">
            <span aria-hidden="true">⚠</span>
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
};
