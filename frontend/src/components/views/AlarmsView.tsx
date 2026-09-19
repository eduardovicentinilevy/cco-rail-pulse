// frontend/src/components/views/AlarmsView.tsx
import React, { useCallback, useMemo, useState } from 'react';
import type { AlarmLevel, AlarmLogEntry, AlarmStats, OperatorSession } from '../../types';
import { api, ApiError } from '../../services/api';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useResource } from '../../hooks/useResource';
import { useAuthErrorHandler } from '../../hooks/useAuthErrorHandler';
import { downloadTextFile, formatDateTime, toCsv } from '../../lib/format';

interface AlarmsViewProps {
  session: OperatorSession;
  /** Incrementado a cada `alert:critical` recebido — sinaliza que um novo alarme foi persistido. */
  refreshToken: number;
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
  onAuthError: (message: string) => void;
  /** Notifica o painel que um alarme foi reconhecido, para recalcular o contador da navegação. */
  onAcknowledged?: () => void;
}

const PAGE_SIZE = 20;

const SEVERITY_LABELS: Record<AlarmLevel, string> = {
  INFO: 'Informativo',
  WARNING: 'Atenção',
  CRITICAL: 'Crítico',
};

const ACK_FILTERS: ReadonlyArray<{ key: 'ALL' | 'PENDING' | 'ACKED'; label: string }> = [
  { key: 'ALL', label: 'Todos' },
  { key: 'PENDING', label: 'Pendentes' },
  { key: 'ACKED', label: 'Reconhecidos' },
];

export const AlarmsView: React.FC<AlarmsViewProps> = ({
  session,
  refreshToken,
  onNotify,
  onAuthError,
  onAcknowledged,
}) => {
  const [offset, setOffset] = useState(0);
  const [severityFilter, setSeverityFilter] = useState<AlarmLevel | 'ALL'>('ALL');
  const [ackFilter, setAckFilter] = useState<'ALL' | 'PENDING' | 'ACKED'>('ALL');
  const [search, setSearch] = useState('');
  const [ackingId, setAckingId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 350);

  const load = useCallback(async () => {
    const [page, stats] = await Promise.all([
      api.alarms(session.token, {
        limit: PAGE_SIZE,
        offset,
        severity: severityFilter === 'ALL' ? undefined : severityFilter,
        acknowledged: ackFilter === 'ALL' ? undefined : ackFilter === 'ACKED',
        search: debouncedSearch,
      }),
      api.alarmStats(session.token),
    ]);
    return { alarms: page.items as AlarmLogEntry[], total: page.total, stats };
  }, [session.token, offset, severityFilter, ackFilter, debouncedSearch]);

  const handleError = useAuthErrorHandler(onAuthError, 'consultar a central de alarmes');
  const { data, error, isLoading, reload } = useResource(
    `${offset}|${severityFilter}|${ackFilter}|${debouncedSearch}|${refreshToken}`,
    load,
    handleError,
  );

  const alarms = data?.alarms ?? [];
  const total = data?.total ?? 0;
  const stats: AlarmStats | null = data?.stats ?? null;

  const applyFilter = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setOffset(0);
  };

  const handleAcknowledge = async (alarm: AlarmLogEntry) => {
    setAckingId(alarm.id);
    try {
      await api.acknowledgeAlarm(session.token, alarm.id);
      onNotify(`Alarme #${alarm.id} reconhecido.`, 'success');
      reload();
      onAcknowledged?.();
    } catch (err) {
      if (err instanceof ApiError && err.isAuthError) {
        onAuthError('Sua sessão expirou ao reconhecer o alarme.');
        return;
      }
      onNotify(err instanceof Error ? err.message : 'Não foi possível reconhecer o alarme.', 'error');
    } finally {
      setAckingId(null);
    }
  };

  const handleExport = () => {
    const csv = toCsv(
      ['ID', 'Severidade', 'Mensagem', 'Horário', 'Reconhecido por', 'Reconhecido em'],
      alarms.map((alarm) => [
        alarm.id,
        alarm.severity,
        alarm.message,
        formatDateTime(alarm.createdAt),
        alarm.acknowledgedBy ?? '—',
        alarm.acknowledgedAt ? formatDateTime(alarm.acknowledgedAt) : '—',
      ]),
    );
    downloadTextFile(`railpulse-alarmes-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const kpis = useMemo(
    () => [
      {
        label: 'Total no histórico',
        value: String(stats?.total ?? 0),
        status: 'INFO',
        hint: 'Alarmes persistidos desde a implantação',
      },
      {
        label: 'Pendentes',
        value: String(stats?.unacknowledged ?? 0),
        status: (stats?.unacknowledged ?? 0) > 0 ? 'ATENÇÃO' : 'NORMAL',
        hint: 'Aguardando reconhecimento do operador',
      },
      {
        label: 'Críticos pendentes',
        value: String(stats?.criticalUnacknowledged ?? 0),
        status: (stats?.criticalUnacknowledged ?? 0) > 0 ? 'CRÍTICO' : 'NORMAL',
        hint: 'Severidade CRITICAL não reconhecida',
      },
      {
        label: 'Últimas 24h',
        value: String(stats?.last24h ?? 0),
        status: 'INFO',
        hint: 'Volume de alarmes no período recente',
      },
    ],
    [stats],
  );

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Central de Alarmes</span>
          <h2 className="rp-page-header__title">Histórico de alarmes da malha</h2>
          <p className="rp-page-header__subtitle">
            Registro persistido entre turnos — o feed ao vivo da Malha ATS mostra só a sessão atual
          </p>
        </div>
        <button type="button" className="rp-btn" onClick={handleExport} disabled={alarms.length === 0}>
          Exportar CSV
        </button>
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
              placeholder="Buscar por mensagem do alarme…"
              aria-label="Buscar alarmes"
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
            <div className="rp-chip-row" role="group" aria-label="Filtrar por severidade">
              <span className="rp-chip-row__label">Severidade</span>
              {(['ALL', 'INFO', 'WARNING', 'CRITICAL'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className="rp-chip"
                  aria-pressed={severityFilter === value}
                  onClick={() => applyFilter(setSeverityFilter, value)}
                >
                  {value === 'ALL' ? 'Todas' : SEVERITY_LABELS[value]}
                </button>
              ))}
            </div>

            <div className="rp-chip-row" role="group" aria-label="Filtrar por reconhecimento">
              <span className="rp-chip-row__label">Status</span>
              {ACK_FILTERS.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className="rp-chip"
                  aria-pressed={ackFilter === filter.key}
                  onClick={() => applyFilter(setAckFilter, filter.key)}
                >
                  {filter.label}
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
          <EmptyState icon="⚠" title="Não foi possível carregar os alarmes." hint={error} />
        ) : alarms.length === 0 ? (
          <EmptyState
            icon="✅"
            title="Nenhum alarme para os filtros atuais."
            hint="Alarmes surgem automaticamente a partir de ocorrências e comandos críticos."
          />
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="sr-only">Alarmes registrados no histórico do CCO</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Severidade</th>
                  <th scope="col">Mensagem</th>
                  <th scope="col">Horário</th>
                  <th scope="col">Reconhecimento</th>
                  <th scope="col">Ação</th>
                </tr>
              </thead>
              <tbody>
                {alarms.map((alarm) => (
                  <tr key={alarm.id}>
                    <td className="rp-table__accent">#{alarm.id}</td>
                    <td>
                      <StatusPill status={alarm.severity} label={SEVERITY_LABELS[alarm.severity]} />
                    </td>
                    <td className="truncate">{alarm.message}</td>
                    <td className="mono text-muted">{formatDateTime(alarm.createdAt)}</td>
                    <td className="truncate">
                      {alarm.acknowledgedBy ? (
                        <>
                          {alarm.acknowledgedBy}
                          <br />
                          <span className="rp-hint">{formatDateTime(alarm.acknowledgedAt!)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {alarm.acknowledgedBy ? (
                        <span className="rp-hint">Reconhecido</span>
                      ) : (
                        <button
                          type="button"
                          className="rp-btn rp-btn--link"
                          disabled={ackingId === alarm.id}
                          onClick={() => void handleAcknowledge(alarm)}
                        >
                          {ackingId === alarm.id ? 'Reconhecendo…' : 'Reconhecer'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="rp-row rp-row--between" style={{ marginTop: 'var(--sp-4)' }}>
          <span className="rp-hint">
            {total} alarme(s) • página {page} de {totalPages}
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
    </div>
  );
};
