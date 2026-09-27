// frontend/src/components/views/WorkOrdersView.tsx
import React, { useCallback, useMemo, useState } from 'react';
import type {
  OperatorSession,
  Station,
  WorkOrder,
  WorkOrderPriority,
  WorkOrderStats,
  WorkOrderStatus,
} from '../../types';
import { WORK_ORDER_CATEGORIES, WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES } from '../../types';
import { api, ApiError } from '../../services/api';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useResource } from '../../hooks/useResource';
import { useAuthErrorHandler } from '../../hooks/useAuthErrorHandler';
import { downloadTextFile, formatDateTime, toCsv } from '../../lib/format';

interface WorkOrdersViewProps {
  session: OperatorSession;
  stations: Station[];
  /** Incrementado a cada evento `workorder:changed` — força a recarga da lista. */
  refreshToken: number;
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
  onAuthError: (message: string) => void;
}

const PAGE_SIZE = 20;

const CATEGORY_LABELS: Record<string, string> = {
  TSS_SUBESTACAO: 'Subestação (TSS)',
  VIA_PERMANENTE: 'Via permanente',
  SINALIZACAO_ATS: 'Sinalização / ATS',
  MATERIAL_RODANTE: 'Material rodante',
  INFRAESTRUTURA_ESTACAO: 'Infraestrutura da estação',
  OUTROS: 'Outros',
};

const priorityTone = (priority: WorkOrderPriority): string =>
  priority === 'URGENTE' ? 'CRÍTICO' : priority === 'ALTA' ? 'ATENÇÃO' : priority === 'MÉDIA' ? 'INFO' : 'NORMAL';

const statusTone = (status: WorkOrderStatus): string =>
  status === 'ABERTA' ? 'CRÍTICO' : status === 'EM_ANDAMENTO' ? 'ATENÇÃO' : status === 'CANCELADA' ? 'INFO' : 'NORMAL';

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUÍDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

export const WorkOrdersView: React.FC<WorkOrdersViewProps> = ({ session, stations, refreshToken, onNotify, onAuthError }) => {
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<WorkOrderStatus | 'ALL'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<WorkOrderPriority | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selected, setSelected] = useState<WorkOrder | null>(null);

  const debouncedSearch = useDebouncedValue(search, 350);

  const load = useCallback(
    async () => {
      const [page, stats] = await Promise.all([
        api.workOrders(session.token, {
          limit: PAGE_SIZE,
          offset,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          priority: priorityFilter === 'ALL' ? undefined : priorityFilter,
          search: debouncedSearch,
        }),
        api.workOrderStats(session.token),
      ]);
      return { workOrders: page.items as WorkOrder[], total: page.total, stats };
    },
    [session.token, offset, statusFilter, priorityFilter, debouncedSearch],
  );

  const handleError = useAuthErrorHandler(onAuthError, 'consultar as ordens de serviço');
  // `refreshToken` entra na chave: um evento `workorder:changed` refaz a consulta.
  const { data, error, isLoading, reload } = useResource(
    `${offset}|${statusFilter}|${priorityFilter}|${debouncedSearch}|${refreshToken}`,
    load,
    handleError,
  );

  const workOrders = data?.workOrders ?? [];
  const total = data?.total ?? 0;
  const stats: WorkOrderStats | null = data?.stats ?? null;

  const applyFilter = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setOffset(0);
  };

  const handleExport = () => {
    const csv = toCsv(
      ['ID', 'Título', 'Categoria', 'Prioridade', 'Status', 'Ativo', 'Estação', 'Aberta por', 'Abertura', 'Prazo', 'Conclusão (min)'],
      workOrders.map((workOrder) => [
        workOrder.id,
        workOrder.title,
        CATEGORY_LABELS[workOrder.category] ?? workOrder.category,
        workOrder.priority,
        workOrder.status,
        workOrder.assetCode ?? '—',
        workOrder.stationCode ?? '—',
        workOrder.openedByName ?? workOrder.openedBy,
        formatDateTime(workOrder.openedAt),
        workOrder.dueAt ? formatDateTime(workOrder.dueAt) : '—',
        workOrder.completionMinutes ?? '—',
      ]),
    );
    downloadTextFile(`railpulse-ordens-de-servico-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const kpis = useMemo(
    () => [
      {
        label: 'Abertas',
        value: String(stats?.open ?? 0),
        status: (stats?.open ?? 0) > 0 ? 'ATENÇÃO' : 'NORMAL',
        hint: 'Aguardando início do serviço',
      },
      {
        label: 'Em andamento',
        value: String(stats?.inProgress ?? 0),
        status: (stats?.inProgress ?? 0) > 0 ? 'ATENÇÃO' : 'NORMAL',
        hint: 'Com responsável designado',
      },
      {
        label: 'Atrasadas',
        value: String(stats?.overdue ?? 0),
        status: (stats?.overdue ?? 0) > 0 ? 'CRÍTICO' : 'NORMAL',
        hint: 'Prazo vencido e ainda não concluída',
      },
      {
        label: 'Tempo médio de execução',
        value: stats?.averageCompletionMinutes == null ? '—' : `${stats.averageCompletionMinutes} min`,
        status: 'INFO',
        hint: `Média sobre ${stats?.completed ?? 0} concluída(s)`,
      },
    ],
    [stats],
  );

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Manutenção</span>
          <h2 className="rp-page-header__title">Ordens de serviço</h2>
          <p className="rp-page-header__subtitle">
            Abertura, execução e encerramento de serviços de manutenção em ativos e estações
          </p>
        </div>
        <div className="rp-row">
          <button type="button" className="rp-btn" onClick={handleExport} disabled={workOrders.length === 0}>
            Exportar CSV
          </button>
          <button type="button" className="rp-btn rp-btn--primary" onClick={() => setIsCreateOpen(true)}>
            + Abrir OS
          </button>
        </div>
      </div>

      <div className="rp-grid rp-grid--kpi">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="rp-metric" data-status={kpi.status}>
            <span className="rp-metric__label">{kpi.label}</span>
            <span className="rp-metric__value">{kpi.value}</span>
            <span className="rp-metric__hint">{kpi.hint}</span>
          </article>
        ))}
      </div>

      <section className="rp-card">
        <header className="rp-card__header">
          <div className="rp-search">
            <span className="rp-search__icon" aria-hidden="true">
              ⌕
            </span>
            <input
              className="rp-input"
              type="search"
              value={search}
              onChange={(event) => applyFilter(setSearch, event.target.value)}
              placeholder="Buscar por título, descrição, ativo ou estação…"
              aria-label="Buscar ordens de serviço"
            />
            {search && (
              <button
                type="button"
                className="rp-search__clear"
                onClick={() => applyFilter(setSearch, '')}
                aria-label="Limpar busca"
              >
                ✕
              </button>
            )}
          </div>

          <div className="rp-row">
            <div className="rp-chip-row" role="group" aria-label="Filtrar por status">
              <span className="rp-chip-row__label">Status</span>
              {(['ALL', ...WORK_ORDER_STATUSES] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rp-chip"
                  aria-pressed={statusFilter === value}
                  onClick={() => applyFilter(setStatusFilter, value)}
                >
                  {value === 'ALL' ? 'Todos' : STATUS_LABELS[value]}
                </button>
              ))}
            </div>

            <div className="rp-chip-row" role="group" aria-label="Filtrar por prioridade">
              <span className="rp-chip-row__label">Prioridade</span>
              {(['ALL', ...WORK_ORDER_PRIORITIES] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rp-chip"
                  aria-pressed={priorityFilter === value}
                  onClick={() => applyFilter(setPriorityFilter, value)}
                >
                  {value === 'ALL' ? 'Todas' : value}
                </button>
              ))}
            </div>
          </div>
        </header>

        {isLoading ? (
          <div className="rp-stack rp-stack--tight" aria-busy="true">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="rp-skeleton" style={{ height: '2.75rem' }} />
            ))}
          </div>
        ) : error ? (
          <EmptyState icon="⚠" title="Não foi possível carregar as ordens de serviço." hint={error} />
        ) : workOrders.length === 0 ? (
          <EmptyState
            icon="✅"
            title="Nenhuma OS para os filtros atuais."
            hint="Abra uma ordem de serviço para iniciar um novo trabalho de manutenção."
          />
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="sr-only">Ordens de serviço de manutenção</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Serviço</th>
                  <th scope="col">Local</th>
                  <th scope="col">Prioridade</th>
                  <th scope="col">Status</th>
                  <th scope="col">Responsável</th>
                  <th scope="col">Prazo</th>
                  <th scope="col">Ação</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.map((workOrder) => (
                  <tr key={workOrder.id}>
                    <td className="rp-table__accent">#{workOrder.id}</td>
                    <td>
                      <strong>{workOrder.title}</strong>
                      <br />
                      <span className="rp-hint">{CATEGORY_LABELS[workOrder.category] ?? workOrder.category}</span>
                    </td>
                    <td className="mono">
                      {workOrder.stationCode ?? '—'}
                      {workOrder.assetCode ? ` · ${workOrder.assetCode}` : ''}
                    </td>
                    <td>
                      <StatusPill status={priorityTone(workOrder.priority)} label={workOrder.priority} />
                    </td>
                    <td>
                      <StatusPill status={statusTone(workOrder.status)} label={STATUS_LABELS[workOrder.status]} />
                    </td>
                    <td className="truncate">{workOrder.assignedToName ?? workOrder.assignedTo ?? '—'}</td>
                    <td className="mono text-muted">
                      {workOrder.dueAt ? (
                        <span data-status={workOrder.isOverdue ? 'CRÍTICO' : undefined}>
                          {formatDateTime(workOrder.dueAt)}
                          {workOrder.isOverdue ? ' ⚠' : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button type="button" className="rp-btn rp-btn--link" onClick={() => setSelected(workOrder)}>
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="rp-row rp-row--between" style={{ marginTop: 'var(--sp-4)' }}>
          <span className="rp-hint">
            {total} ordem(ns) de serviço • página {page} de {totalPages}
          </span>
          <div className="rp-row">
            <button
              type="button"
              className="rp-btn"
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              disabled={offset === 0}
            >
              ← Anterior
            </button>
            <button
              type="button"
              className="rp-btn"
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
            >
              Próxima →
            </button>
          </div>
        </footer>
      </section>

      {isCreateOpen && (
        <CreateWorkOrderModal
          session={session}
          stations={stations}
          onClose={() => setIsCreateOpen(false)}
          onCreated={(workOrder) => {
            onNotify(`OS #${workOrder.id} aberta.`, 'success');
            setIsCreateOpen(false);
            reload();
          }}
          onAuthError={onAuthError}
        />
      )}

      {selected && (
        <WorkOrderDetailModal
          session={session}
          workOrder={selected}
          onClose={() => setSelected(null)}
          onChanged={(message) => {
            onNotify(message, 'success');
            setSelected(null);
            reload();
          }}
          onError={(message) => onNotify(message, 'error')}
          onAuthError={onAuthError}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

interface CreateWorkOrderModalProps {
  session: OperatorSession;
  stations: Station[];
  onClose: () => void;
  onCreated: (workOrder: WorkOrder) => void;
  onAuthError: (message: string) => void;
}

const CreateWorkOrderModal: React.FC<CreateWorkOrderModalProps> = ({ session, stations, onClose, onCreated, onAuthError }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('TSS_SUBESTACAO');
  const [priority, setPriority] = useState<string>('MÉDIA');
  const [stationCode, setStationCode] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const created = await api.createWorkOrder(session.token, {
        title,
        description,
        category,
        priority,
        stationCode: stationCode || null,
        assetCode: assetCode || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      });
      onCreated(created as unknown as WorkOrder);
    } catch (err) {
      if (err instanceof ApiError && err.isAuthError) {
        onAuthError('Sua sessão expirou ao abrir a ordem de serviço.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Não foi possível abrir a ordem de serviço.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title="Abrir ordem de serviço"
      subtitle="A abertura é registrada na trilha de auditoria em nome do operador autenticado"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rp-btn" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" form="rp-workorder-form" className="rp-btn rp-btn--primary" disabled={isSaving}>
            {isSaving && <span className="rp-spinner" aria-hidden="true" />}
            {isSaving ? 'Abrindo…' : 'Abrir OS'}
          </button>
        </>
      }
    >
      <form id="rp-workorder-form" className="rp-stack" onSubmit={handleSubmit} noValidate>
        <div className="rp-field">
          <label className="rp-label" htmlFor="wo-title">
            Título
          </label>
          <input
            id="wo-title"
            className="rp-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex: Substituir disjuntor da TSS Freguesia do Ó"
            maxLength={120}
            required
          />
          <span className="rp-hint">{title.trim().length}/120 caracteres (mínimo 5)</span>
        </div>

        <div className="rp-field">
          <label className="rp-label" htmlFor="wo-description">
            Descrição do serviço
          </label>
          <textarea
            id="wo-description"
            className="rp-input"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Detalhe o que precisa ser feito, o motivo e o impacto na operação."
            maxLength={2000}
            required
          />
        </div>

        <div className="rp-grid rp-grid--kpi">
          <div className="rp-field">
            <label className="rp-label" htmlFor="wo-category">
              Categoria
            </label>
            <select id="wo-category" className="rp-input" value={category} onChange={(event) => setCategory(event.target.value)}>
              {WORK_ORDER_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="wo-priority">
              Prioridade
            </label>
            <select id="wo-priority" className="rp-input" value={priority} onChange={(event) => setPriority(event.target.value)}>
              {WORK_ORDER_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="wo-station">
              Estação (opcional)
            </label>
            <select id="wo-station" className="rp-input" value={stationCode} onChange={(event) => setStationCode(event.target.value)}>
              <option value="">Não se aplica</option>
              {stations.map((station) => (
                <option key={station.code} value={station.code}>
                  {station.code} — {station.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="wo-asset">
              Ativo (opcional)
            </label>
            <input
              id="wo-asset"
              className="rp-input"
              value={assetCode}
              onChange={(event) => setAssetCode(event.target.value)}
              placeholder="Ex: Escada rolante 2, TSS-FGO…"
              maxLength={80}
            />
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="wo-due">
              Prazo (opcional)
            </label>
            <input
              id="wo-due"
              type="datetime-local"
              className="rp-input"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </div>
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

// ---------------------------------------------------------------------------

interface WorkOrderDetailModalProps {
  session: OperatorSession;
  workOrder: WorkOrder;
  onClose: () => void;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
  onAuthError: (message: string) => void;
}

const WorkOrderDetailModal: React.FC<WorkOrderDetailModalProps> = ({
  session,
  workOrder,
  onClose,
  onChanged,
  onError,
  onAuthError,
}) => {
  const [completionNote, setCompletionNote] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const changeStatus = async (status: WorkOrderStatus) => {
    setIsBusy(true);
    try {
      await api.changeWorkOrderStatus(session.token, workOrder.id, {
        status,
        completionNote: status === 'CONCLUÍDA' || status === 'CANCELADA' ? completionNote : undefined,
      });
      onChanged(`OS #${workOrder.id} agora está ${STATUS_LABELS[status].toLowerCase()}.`);
    } catch (error) {
      if (error instanceof ApiError && error.isAuthError) {
        onAuthError('Sua sessão expirou ao atualizar a OS.');
        return;
      }
      onError(error instanceof Error ? error.message : 'Não foi possível atualizar a OS.');
    } finally {
      setIsBusy(false);
    }
  };

  const canStart = workOrder.status === 'ABERTA';
  const canComplete = workOrder.status === 'EM_ANDAMENTO';
  const canCancel = workOrder.status === 'ABERTA' || workOrder.status === 'EM_ANDAMENTO';

  return (
    <Modal
      title={`OS #${workOrder.id}`}
      subtitle={workOrder.title}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rp-btn" onClick={onClose} disabled={isBusy}>
            Fechar
          </button>
          {canCancel && (
            <button type="button" className="rp-btn" onClick={() => void changeStatus('CANCELADA')} disabled={isBusy}>
              Cancelar OS
            </button>
          )}
          {canStart && (
            <button
              type="button"
              className="rp-btn rp-btn--warning"
              onClick={() => void changeStatus('EM_ANDAMENTO')}
              disabled={isBusy}
            >
              Assumir serviço
            </button>
          )}
          {canComplete && (
            <button
              type="button"
              className="rp-btn rp-btn--primary"
              onClick={() => void changeStatus('CONCLUÍDA')}
              disabled={isBusy || completionNote.trim().length < 5}
              title={completionNote.trim().length < 5 ? 'Registre o serviço executado para concluir' : undefined}
            >
              {isBusy && <span className="rp-spinner" aria-hidden="true" />}
              Concluir OS
            </button>
          )}
        </>
      }
    >
      <div className="rp-row">
        <StatusPill status={statusTone(workOrder.status)} label={STATUS_LABELS[workOrder.status]} />
        <StatusPill status={priorityTone(workOrder.priority)} label={`Prioridade ${workOrder.priority}`} />
        <span className="rp-badge rp-badge--code">{CATEGORY_LABELS[workOrder.category] ?? workOrder.category}</span>
        {workOrder.isOverdue && <StatusPill status="CRÍTICO" label="Atrasada" />}
      </div>

      <div className="rp-terminal__metrics">
        <div className="rp-metric-row">
          <span>Local</span>
          <strong className="mono">
            {workOrder.stationCode ?? '—'}
            {workOrder.assetCode ? ` · ${workOrder.assetCode}` : ''}
          </strong>
        </div>
        <div className="rp-metric-row">
          <span>Aberta por</span>
          <strong>{workOrder.openedByName ?? workOrder.openedBy}</strong>
        </div>
        <div className="rp-metric-row">
          <span>Responsável</span>
          <strong>{workOrder.assignedToName ?? workOrder.assignedTo ?? 'Não designado'}</strong>
        </div>
        <div className="rp-metric-row">
          <span>Abertura</span>
          <strong className="mono">{formatDateTime(workOrder.openedAt)}</strong>
        </div>
        {workOrder.dueAt && (
          <div className="rp-metric-row">
            <span>Prazo</span>
            <strong className="mono">{formatDateTime(workOrder.dueAt)}</strong>
          </div>
        )}
        {workOrder.completedAt && (
          <div className="rp-metric-row">
            <span>Conclusão</span>
            <strong className="mono">
              {formatDateTime(workOrder.completedAt)} ({workOrder.completionMinutes} min)
            </strong>
          </div>
        )}
      </div>

      <div className="rp-field">
        <span className="rp-label">Descrição</span>
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--uni-text-muted)' }}>{workOrder.description}</p>
      </div>

      {workOrder.completionNote && (
        <div className="rp-field">
          <span className="rp-label">Serviço executado</span>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--uni-text-muted)' }}>
            {workOrder.completionNote}
          </p>
        </div>
      )}

      {canComplete && (
        <div className="rp-field">
          <label className="rp-label" htmlFor="completion-note">
            Registrar serviço executado para concluir
          </label>
          <textarea
            id="completion-note"
            className="rp-input"
            rows={3}
            value={completionNote}
            onChange={(event) => setCompletionNote(event.target.value)}
            placeholder="Descreva o serviço realizado e a condição final do ativo."
          />
          <span className="rp-hint">Mínimo de 5 caracteres — exigido para concluir a OS.</span>
        </div>
      )}
    </Modal>
  );
};
