// frontend/src/components/views/ShiftHandoverView.tsx
import React, { useCallback, useMemo } from 'react';
import type { OperatorSession, ShiftReport } from '../../types';
import { api } from '../../services/api';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { useResource } from '../../hooks/useResource';
import { useAuthErrorHandler } from '../../hooks/useAuthErrorHandler';
import { downloadTextFile, formatDateTime, formatDuration, formatNumber, toCsv } from '../../lib/format';

interface ShiftHandoverViewProps {
  session: OperatorSession;
  shiftStartedAt: number;
  onAuthError: (message: string) => void;
}

const COMMAND_LABELS: Record<string, string> = {
  EMERGENCY_BRAKE_OVERRIDE: 'Frenagem de emergência',
  SPEED_RESTRICTION_20KM: 'Restrição de 20 km/h',
  RELEASE_SIGNAL: 'Liberação de sinal',
};

const severityTone = (severity: string): string =>
  severity === 'CRÍTICA' ? 'CRÍTICO' : severity === 'ALTA' ? 'ATENÇÃO' : severity === 'MÉDIA' ? 'INFO' : 'NORMAL';

/**
 * Relatório de passagem de turno.
 *
 * Consolida em uma página o que o operador que assume precisa saber: comandos
 * emitidos, ocorrências do turno, pendências herdadas e o comportamento da tensão.
 * A folha de estilo de impressão gera o documento assinável da passagem.
 */
export const ShiftHandoverView: React.FC<ShiftHandoverViewProps> = ({ session, shiftStartedAt, onAuthError }) => {
  // O início do turno é fixo na sessão; arredondar ao minuto evita refazer a
  // consulta a cada render por causa dos milissegundos.
  const since = useMemo(() => new Date(Math.floor(shiftStartedAt / 60_000) * 60_000).toISOString(), [shiftStartedAt]);

  const load = useCallback(() => api.shiftReport(session.token, since), [session.token, since]);
  const handleError = useAuthErrorHandler(onAuthError, 'montar o relatório de turno');
  const { data, error, isLoading, reload } = useResource(since, load, handleError);

  const report = data as ShiftReport | null;

  const handleExport = () => {
    if (!report) return;
    const csv = toCsv(
      ['Seção', 'Item', 'Detalhe', 'Valor'],
      [
        ['Turno', 'Início', formatDateTime(report.since), ''],
        ['Turno', 'Encerramento', formatDateTime(report.until), ''],
        ['Turno', 'Duração', formatDuration(report.durationMinutes * 60), ''],
        ['Turno', 'Operadores', report.operators.join(', '), String(report.operators.length)],
        ...report.commands.map((command) => [
          'Comandos',
          COMMAND_LABELS[command.action] ?? command.action,
          command.status,
          String(command.count),
        ]),
        ...report.incidentsOpened.map((incident) => [
          'Ocorrências abertas',
          `#${incident.id} ${incident.title}`,
          incident.severity,
          incident.status,
        ]),
        ...report.incidentsPending.map((incident) => [
          'Pendências herdadas',
          `#${incident.id} ${incident.title}`,
          incident.severity,
          incident.status,
        ]),
        ...report.voltageExtremes.map((row) => [
          'Tensão',
          `${row.stationCode} ${row.stationName}`,
          `min ${row.minKV} / méd ${row.avgKV} / máx ${row.maxKV} kV`,
          String(row.degradedBuckets),
        ]),
      ],
    );
    downloadTextFile(`railpulse-passagem-turno-${new Date().toISOString().slice(0, 16).replace(':', 'h')}.csv`, csv);
  };

  if (isLoading) {
    return (
      <div className="rp-stack" aria-busy="true">
        <div className="rp-skeleton" style={{ height: '5rem' }} />
        <div className="rp-skeleton" style={{ height: '14rem' }} />
      </div>
    );
  }

  if (error || !report) {
    return <EmptyState icon="⚠" title="Não foi possível montar o relatório de turno." hint={error ?? undefined} />;
  }

  const criticalPending = report.incidentsPending.filter((incident) => incident.severity === 'CRÍTICA').length;

  return (
    <div className="rp-stack rp-animate-in rp-printable">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Passagem de turno</span>
          <h2 className="rp-page-header__title">Relatório de turno — {session.name ?? session.operatorId}</h2>
          <p className="rp-page-header__subtitle">
            {formatDateTime(report.since)} até {formatDateTime(report.until)} •{' '}
            {formatDuration(report.durationMinutes * 60)} de turno
          </p>
        </div>
        <div className="rp-row rp-no-print">
          <button type="button" className="rp-btn" onClick={reload}>
            Atualizar
          </button>
          <button type="button" className="rp-btn" onClick={handleExport}>
            Exportar CSV
          </button>
          <button type="button" className="rp-btn rp-btn--primary" onClick={() => window.print()}>
            Imprimir passagem
          </button>
        </div>
      </div>

      <div className="rp-grid rp-grid--kpi">
        <article className="rp-metric" data-status={report.totalCommands > 0 ? 'ATENÇÃO' : 'NORMAL'}>
          <span className="rp-metric__label">Comandos emitidos</span>
          <span className="rp-metric__value">{report.totalCommands}</span>
          <span className="rp-metric__hint">Ações críticas registradas na auditoria</span>
        </article>
        <article className="rp-metric" data-status={report.incidentsOpened.length > 0 ? 'ATENÇÃO' : 'NORMAL'}>
          <span className="rp-metric__label">Ocorrências abertas</span>
          <span className="rp-metric__value">{report.incidentsOpened.length}</span>
          <span className="rp-metric__hint">{report.incidentsResolved.length} resolvidas no turno</span>
        </article>
        <article className="rp-metric" data-status={criticalPending > 0 ? 'CRÍTICO' : report.incidentsPending.length > 0 ? 'ATENÇÃO' : 'NORMAL'}>
          <span className="rp-metric__label">Pendências herdadas</span>
          <span className="rp-metric__value">{report.incidentsPending.length}</span>
          <span className="rp-metric__hint">
            {criticalPending > 0 ? `${criticalPending} de severidade crítica` : 'Nenhuma crítica em aberto'}
          </span>
        </article>
        <article className="rp-metric" data-status={report.degradedStations > 0 ? 'ATENÇÃO' : 'NORMAL'}>
          <span className="rp-metric__label">Estações degradadas</span>
          <span className="rp-metric__value">{report.degradedStations}</span>
          <span className="rp-metric__hint">Tensão fora da faixa nominal no período</span>
        </article>
      </div>

      <section className="rp-card">
        <header className="rp-card__header">
          <div>
            <h3 className="rp-card__title">Pendências para o próximo turno</h3>
            <p className="rp-card__subtitle">Ocorrências que seguem abertas, por severidade e antiguidade</p>
          </div>
          {report.incidentsPending.length > 0 && (
            <StatusPill status="CRÍTICO" label={`${report.incidentsPending.length} em aberto`} />
          )}
        </header>

        {report.incidentsPending.length === 0 ? (
          <EmptyState icon="✅" title="Nenhuma pendência — turno entregue sem ocorrências abertas." />
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="sr-only">Ocorrências em aberto na passagem de turno</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Ocorrência</th>
                  <th scope="col">Local</th>
                  <th scope="col">Severidade</th>
                  <th scope="col">Status</th>
                  <th scope="col">Aberta em</th>
                </tr>
              </thead>
              <tbody>
                {report.incidentsPending.map((incident) => (
                  <tr key={incident.id}>
                    <td className="rp-table__accent">#{incident.id}</td>
                    <td>{incident.title}</td>
                    <td className="mono">{incident.stationCode ?? '—'}</td>
                    <td>
                      <StatusPill status={severityTone(incident.severity)} label={incident.severity} />
                    </td>
                    <td className="mono">{incident.status.replace('_', ' ')}</td>
                    <td className="mono text-muted">{formatDateTime(incident.openedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rp-grid rp-grid--panels">
        <section className="rp-card">
          <header className="rp-card__header">
            <h3 className="rp-card__title">Comandos emitidos no turno</h3>
          </header>

          {report.commands.length === 0 ? (
            <EmptyState icon="🛈" title="Nenhum comando crítico emitido neste turno." />
          ) : (
            <ul className="rp-feed">
              {report.commands.map((command) => (
                <li
                  key={`${command.action}-${command.status}`}
                  className="rp-feed__item"
                  data-status={command.status === 'EXECUTED' ? 'NORMAL' : 'CRÍTICO'}
                >
                  <span className="rp-feed__message">{COMMAND_LABELS[command.action] ?? command.action}</span>
                  <StatusPill status={command.status === 'EXECUTED' ? 'NORMAL' : 'CRÍTICO'} label={command.status} />
                  <strong className="mono">{command.count}×</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rp-card">
          <header className="rp-card__header">
            <h3 className="rp-card__title">Ocorrências resolvidas no turno</h3>
          </header>

          {report.incidentsResolved.length === 0 ? (
            <EmptyState icon="🛈" title="Nenhuma ocorrência resolvida neste turno." />
          ) : (
            <ul className="rp-feed">
              {report.incidentsResolved.map((incident) => (
                <li key={incident.id} className="rp-feed__item" data-status="NORMAL">
                  <span className="rp-feed__source">#{incident.id}</span>
                  <span className="rp-feed__message truncate">{incident.title}</span>
                  <span className="mono text-muted">{incident.resolutionMinutes} min</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rp-card rp-card--flush">
        <header className="rp-card__header" style={{ padding: 'var(--sp-5) var(--sp-5) 0' }}>
          <div>
            <h3 className="rp-card__title">Comportamento da tensão no turno</h3>
            <p className="rp-card__subtitle">Extremos por estação e janelas fora da faixa nominal</p>
          </div>
        </header>

        {report.voltageExtremes.length === 0 ? (
          <EmptyState icon="📊" title="Sem janelas de telemetria arquivadas neste turno." />
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="sr-only">Extremos de tensão por estação durante o turno</caption>
              <thead>
                <tr>
                  <th scope="col">Estação</th>
                  <th scope="col">Mínima</th>
                  <th scope="col">Média</th>
                  <th scope="col">Máxima</th>
                  <th scope="col">Janelas degradadas</th>
                </tr>
              </thead>
              <tbody>
                {report.voltageExtremes.map((row) => (
                  <tr key={row.stationCode}>
                    <td>
                      <span className="rp-badge rp-badge--code">{row.stationCode}</span>{' '}
                      <span className="truncate">{row.stationName}</span>
                    </td>
                    <td className="mono">{formatNumber(row.minKV, 2)} kV</td>
                    <td className="rp-table__accent">{formatNumber(row.avgKV, 2)} kV</td>
                    <td className="mono">{formatNumber(row.maxKV, 2)} kV</td>
                    <td>
                      {row.degradedBuckets > 0 ? (
                        <StatusPill status="ATENÇÃO" label={`${row.degradedBuckets} janela(s)`} />
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rp-card rp-signature">
        <div>
          <span className="rp-label">Operador que entrega</span>
          <p className="rp-signature__line">{session.name ?? session.operatorId}</p>
          <span className="rp-hint mono">{session.operatorId}</span>
        </div>
        <div>
          <span className="rp-label">Operador que assume</span>
          <p className="rp-signature__line" />
          <span className="rp-hint">Credencial e assinatura</span>
        </div>
      </section>
    </div>
  );
};
