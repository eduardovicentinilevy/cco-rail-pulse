// frontend/src/components/views/IncidentsView.tsx
import React, { useCallback, useMemo, useState } from 'react';
import type {
  Incident,
  IncidentSeverity,
  IncidentStats,
  IncidentStatus,
  OperatorSession,
  Station,
  Train,
} from '../../types';
import { INCIDENT_CATEGORIES, INCIDENT_SEVERITIES, INCIDENT_STATUSES } from '../../types';
import { api, ApiError } from '../../services/api';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useResource } from '../../hooks/useResource';
import { useAuthErrorHandler } from '../../hooks/useAuthErrorHandler';
import { downloadTextFile, formatDateTime, toCsv } from '../../lib/format';

interface IncidentsViewProps {
  session: OperatorSession;
  stations: Station[];
  trains: Train[];
  /** Incrementado a cada evento `incident:changed` — força a recarga da lista. */
  refreshToken: number;
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
  onAuthError: (message: string) => void;
}

const PAGE_SIZE = 20;

const CATEGORY_LABELS: Record<string, string> = {
  ENERGIA: 'Energia de tração',
  SINALIZACAO: 'Sinalização / ATS',
  VIA_PERMANENTE: 'Via permanente',
  MATERIAL_RODANTE: 'Material rodante',
  PASSAGEIRO: 'Atendimento a passageiro',
  OUTROS: 'Outros',
};

/** Mapeia severidade e status da ocorrência para a paleta do design system. */
const severityTone = (severity: IncidentSeverity): string =>
  severity === 'CRÍTICA' ? 'CRÍTICO' : severity === 'ALTA' ? 'ATENÇÃO' : severity === 'MÉDIA' ? 'INFO' : 'NORMAL';

const statusTone = (status: IncidentStatus): string =>
  status === 'ABERTA' ? 'CRÍTICO' : status === 'EM_ANDAMENTO' ? 'ATENÇÃO' : 'NORMAL';

const STATUS_LABELS: Record<IncidentStatus, string> = {
  ABERTA: 'Aberta',
  EM_ANDAMENTO: 'Em andamento',
  RESOLVIDA: 'Resolvida',
};

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  session,
  stations,
  trains,
  refreshToken,
  onNotify,
  onAuthError,
}) => {
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'ALL'>('ALL');
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Incident | null>(null);

  const debouncedSearch = useDebouncedValue(search, 350);

  const load = useCallback(
    async () => {
      const [page, stats] = await Promise.all([
        api.incidents(session.token, {
          limit: PAGE_SIZE,
          offset,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          severity: severityFilter === 'ALL' ? undefined : severityFilter,
          search: debouncedSearch,
        }),
        api.incidentStats(session.token),
      ]);
      return { incidents: page.items as Incident[], total: page.total, stats };
    },
    [session.token, offset, statusFilter, severityFilter, debouncedSearch],
  );

  const handleError = useAuthErrorHandler(onAuthError, 'consultar as ocorrências');
  // `refreshToken` entra na chave: um evento `incident:changed` refaz a consulta.
  const { data, error, isLoading, reload } = useResource(
    `${offset}|${statusFilter}|${severityFilter}|${debouncedSearch}|${refreshToken}`,
    load,
    handleError,
  );

  const incidents = data?.incidents ?? [];
  const total = data?.total ?? 0;
  const stats: IncidentStats | null = data?.stats ?? null;

  /** Filtros sempre reiniciam a paginação — ajuste feito no handler, não em efeito. */
  const applyFilter = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setOffset(0);
  };

  const handleExport = () => {
    const csv = toCsv(
      ['ID', 'Título', 'Categoria', 'Severidade', 'Status', 'Estação', 'Trem', 'Aberta por', 'Abertura', 'Resolução (min)'],
      incidents.map((incident) => [
        incident.id,
        incident.title,
        CATEGORY_LABELS[incident.category] ?? incident.category,
        incident.severity,
        incident.status,
        incident.stationCode ?? '—',
        incident.trainId ?? '—',
        incident.openedByName ?? incident.openedBy,
        formatDateTime(incident.openedAt),
        incident.resolutionMinutes ?? '—',
      ]),
    );
    downloadTextFile(`railpulse-ocorrencias-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const kpis = useMemo(
    () => [
      {
        label: 'Abertas',
        value: String(stats?.open ?? 0),
        status: (stats?.open ?? 0) > 0 ? 'CRÍTICO' : 'NORMAL',
        hint: 'Aguardando início da tratativa',
      },
      {
        label: 'Em andamento',
        value: String(stats?.inProgress ?? 0),
        status: (stats?.inProgress ?? 0) > 0 ? 'ATENÇÃO' : 'NORMAL',
        hint: 'Com responsável designado',
      },
      {
        label: 'Críticas em aberto',
        value: String(stats?.critical ?? 0),
        status: (stats?.critical ?? 0) > 0 ? 'CRÍTICO' : 'NORMAL',
        hint: 'Severidade CRÍTICA não resolvida',
      },
      {
        label: 'MTTR',
        value: stats?.averageResolutionMinutes == null ? '—' : `${stats.averageResolutionMinutes} min`,
        status: 'INFO',
        hint: `Média sobre ${stats?.resolved ?? 0} resolvida(s)`,
      },
    ],
    [stats],
  );

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Gestão de ocorrências</span>
          <h2 className="rp-page-header__title">Registro e tratativa de ocorrências</h2>
          <p className="rp-page-header__subtitle">
            Ciclo de vida completo com trilha de auditoria — abertura, tratativa e resolução
          </p>
        </div>
        <div className="rp-row">
          <button type="button" className="rp-btn" onClick={handleExport} disabled={incidents.length === 0}>
            Exportar CSV
          </button>
          <button type="button" className="rp-btn rp-btn--primary" onClick={() => setIsCreateOpen(true)}>
            + Registrar ocorrência
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
              placeholder="Buscar por título, descrição, estação ou trem…"
              aria-label="Buscar ocorrências"
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
              {(['ALL', ...INCIDENT_STATUSES] as const).map((value) => (
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

            <div className="rp-chip-row" role="group" aria-label="Filtrar por severidade">
              <span className="rp-chip-row__label">Severidade</span>
              {(['ALL', ...INCIDENT_SEVERITIES] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rp-chip"
                  aria-pressed={severityFilter === value}
                  onClick={() => applyFilter(setSeverityFilter, value)}
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
          <EmptyState icon="⚠" title="Não foi possível carregar as ocorrências." hint={error} />
        ) : incidents.length === 0 ? (
          <EmptyState
            icon="✅"
            title="Nenhuma ocorrência para os filtros atuais."
            hint="Registre uma ocorrência para iniciar a tratativa formal."
          />
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="sr-only">Ocorrências registradas no Centro de Controle</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Ocorrência</th>
                  <th scope="col">Local</th>
                  <th scope="col">Severidade</th>
                  <th scope="col">Status</th>
                  <th scope="col">Responsável</th>
                  <th scope="col">Abertura</th>
                  <th scope="col">Ação</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td className="rp-table__accent">#{incident.id}</td>
                    <td>
                      <strong>{incident.title}</strong>
                      <br />
                      <span className="rp-hint">{CATEGORY_LABELS[incident.category] ?? incident.category}</span>
                    </td>
                    <td className="mono">
                      {incident.stationCode ?? '—'}
                      {incident.trainId ? ` · ${incident.trainId}` : ''}
                    </td>
                    <td>
                      <StatusPill status={severityTone(incident.severity)} label={incident.severity} />
                    </td>
                    <td>
                      <StatusPill status={statusTone(incident.status)} label={STATUS_LABELS[incident.status]} />
                    </td>
                    <td className="truncate">{incident.assignedToName ?? incident.assignedTo ?? '—'}</td>
                    <td className="mono text-muted">{formatDateTime(incident.openedAt)}</td>
                    <td>
                      <button type="button" className="rp-btn rp-btn--link" onClick={() => setSelected(incident)}>
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
            {total} ocorrência(s) • página {page} de {totalPages}
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
        <CreateIncidentModal
          session={session}
          stations={stations}
          trains={trains}
          onClose={() => setIsCreateOpen(false)}
          onCreated={(incident) => {
            onNotify(`Ocorrência #${incident.id} registrada.`, 'success');
            setIsCreateOpen(false);
            reload();
          }}
          onAuthError={onAuthError}
        />
      )}

      {selected && (
        <IncidentDetailModal
          session={session}
          incident={selected}
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

interface CreateIncidentModalProps {
  session: OperatorSession;
  stations: Station[];
  trains: Train[];
  onClose: () => void;
  onCreated: (incident: Incident) => void;
  onAuthError: (message: string) => void;
}

const CreateIncidentModal: React.FC<CreateIncidentModalProps> = ({
  session,
  stations,
  trains,
  onClose,
  onCreated,
  onAuthError,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('ENERGIA');
  const [severity, setSeverity] = useState<string>('MÉDIA');
  const [stationCode, setStationCode] = useState('');
  const [trainId, setTrainId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const created = await api.createIncident(session.token, {
        title,
        description,
        category,
        severity,
        stationCode: stationCode || null,
        trainId: trainId || null,
      });
      onCreated(created as unknown as Incident);
    } catch (err) {
      if (err instanceof ApiError && err.isAuthError) {
        onAuthError('Sua sessão expirou ao registrar a ocorrência.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a ocorrência.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title="Registrar ocorrência"
      subtitle="A abertura é registrada na trilha de auditoria em nome do operador autenticado"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rp-btn" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" form="rp-incident-form" className="rp-btn rp-btn--primary" disabled={isSaving}>
            {isSaving && <span className="rp-spinner" aria-hidden="true" />}
            {isSaving ? 'Registrando…' : 'Registrar ocorrência'}
          </button>
        </>
      }
    >
      <form id="rp-incident-form" className="rp-stack" onSubmit={handleSubmit} noValidate>
        <div className="rp-field">
          <label className="rp-label" htmlFor="incident-title">
            Título
          </label>
          <input
            id="incident-title"
            className="rp-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex: Sobrecorrente no pantógrafo do T-04"
            maxLength={120}
            required
          />
          <span className="rp-hint">{title.trim().length}/120 caracteres (mínimo 5)</span>
        </div>

        <div className="rp-field">
          <label className="rp-label" htmlFor="incident-description">
            Descrição
          </label>
          <textarea
            id="incident-description"
            className="rp-input"
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Detalhe o que foi observado, o impacto na operação e as ações já tomadas."
            maxLength={2000}
            required
          />
        </div>

        <div className="rp-grid rp-grid--kpi">
          <div className="rp-field">
            <label className="rp-label" htmlFor="incident-category">
              Categoria
            </label>
            <select
              id="incident-category"
              className="rp-input"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {INCIDENT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value] ?? value}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="incident-severity">
              Severidade
            </label>
            <select
              id="incident-severity"
              className="rp-input"
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              {INCIDENT_SEVERITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="incident-station">
              Estação (opcional)
            </label>
            <select
              id="incident-station"
              className="rp-input"
              value={stationCode}
              onChange={(event) => setStationCode(event.target.value)}
            >
              <option value="">Não se aplica</option>
              {stations.map((station) => (
                <option key={station.code} value={station.code}>
                  {station.code} — {station.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="incident-train">
              Composição (opcional)
            </label>
            <select
              id="incident-train"
              className="rp-input"
              value={trainId}
              onChange={(event) => setTrainId(event.target.value)}
            >
              <option value="">Não se aplica</option>
              {trains.map((train) => (
                <option key={train.trainId} value={train.trainId}>
                  {train.trainId} ({train.currentStationCode})
                </option>
              ))}
            </select>
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

interface IncidentDetailModalProps {
  session: OperatorSession;
  incident: Incident;
  onClose: () => void;
  onChanged: (message: string) => void;
  onError: (message: string) => void;
  onAuthError: (message: string) => void;
}

const IncidentDetailModal: React.FC<IncidentDetailModalProps> = ({
  session,
  incident,
  onClose,
  onChanged,
  onError,
  onAuthError,
}) => {
  const [resolutionNote, setResolutionNote] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const changeStatus = async (status: IncidentStatus) => {
    setIsBusy(true);
    try {
      await api.changeIncidentStatus(session.token, incident.id, {
        status,
        resolutionNote: status === 'RESOLVIDA' ? resolutionNote : undefined,
      });
      onChanged(`Ocorrência #${incident.id} agora está ${STATUS_LABELS[status].toLowerCase()}.`);
    } catch (error) {
      if (error instanceof ApiError && error.isAuthError) {
        onAuthError('Sua sessão expirou ao atualizar a ocorrência.');
        return;
      }
      onError(error instanceof Error ? error.message : 'Não foi possível atualizar a ocorrência.');
    } finally {
      setIsBusy(false);
    }
  };

  const canStart = incident.status === 'ABERTA';
  const canResolve = incident.status !== 'RESOLVIDA';

  return (
    <Modal
      title={`Ocorrência #${incident.id}`}
      subtitle={incident.title}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rp-btn" onClick={onClose} disabled={isBusy}>
            Fechar
          </button>
          {canStart && (
            <button
              type="button"
              className="rp-btn rp-btn--warning"
              onClick={() => void changeStatus('EM_ANDAMENTO')}
              disabled={isBusy}
            >
              Assumir tratativa
            </button>
          )}
          {canResolve && (
            <button
              type="button"
              className="rp-btn rp-btn--primary"
              onClick={() => void changeStatus('RESOLVIDA')}
              disabled={isBusy || resolutionNote.trim().length < 5}
              title={resolutionNote.trim().length < 5 ? 'Registre a tratativa aplicada para resolver' : undefined}
            >
              {isBusy && <span className="rp-spinner" aria-hidden="true" />}
              Resolver ocorrência
            </button>
          )}
        </>
      }
    >
      <div className="rp-row">
        <StatusPill status={statusTone(incident.status)} label={STATUS_LABELS[incident.status]} />
        <StatusPill status={severityTone(incident.severity)} label={`Severidade ${incident.severity}`} />
        <span className="rp-badge rp-badge--code">{CATEGORY_LABELS[incident.category] ?? incident.category}</span>
      </div>

      <div className="rp-terminal__metrics">
        <div className="rp-metric-row">
          <span>Local</span>
          <strong className="mono">
            {incident.stationCode ?? '—'}
            {incident.trainId ? ` · ${incident.trainId}` : ''}
          </strong>
        </div>
        <div className="rp-metric-row">
          <span>Aberta por</span>
          <strong>{incident.openedByName ?? incident.openedBy}</strong>
        </div>
        <div className="rp-metric-row">
          <span>Responsável</span>
          <strong>{incident.assignedToName ?? incident.assignedTo ?? 'Não designado'}</strong>
        </div>
        <div className="rp-metric-row">
          <span>Abertura</span>
          <strong className="mono">{formatDateTime(incident.openedAt)}</strong>
        </div>
        {incident.resolvedAt && (
          <div className="rp-metric-row">
            <span>Resolução</span>
            <strong className="mono">
              {formatDateTime(incident.resolvedAt)} ({incident.resolutionMinutes} min)
            </strong>
          </div>
        )}
      </div>

      <div className="rp-field">
        <span className="rp-label">Descrição</span>
        <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--uni-text-muted)' }}>
          {incident.description}
        </p>
      </div>

      {incident.resolutionNote && (
        <div className="rp-field">
          <span className="rp-label">Tratativa aplicada</span>
          <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--uni-text-muted)' }}>
            {incident.resolutionNote}
          </p>
        </div>
      )}

      {canResolve && (
        <div className="rp-field">
          <label className="rp-label" htmlFor="resolution-note">
            Registrar tratativa para resolver
          </label>
          <textarea
            id="resolution-note"
            className="rp-input"
            rows={3}
            value={resolutionNote}
            onChange={(event) => setResolutionNote(event.target.value)}
            placeholder="Descreva a ação corretiva aplicada e a condição final do trecho."
          />
          <span className="rp-hint">Mínimo de 5 caracteres — exigido para encerrar a ocorrência.</span>
        </div>
      )}
    </Modal>
  );
};
