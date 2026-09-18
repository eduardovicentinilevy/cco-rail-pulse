// frontend/src/components/views/SystemStatusView.tsx
import React, { useCallback, useEffect } from 'react';
import { api } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { StatusPill } from '../common/StatusPill';
import { EmptyState } from '../common/EmptyState';
import { formatDuration, formatTime } from '../../lib/format';
import type { ConnectionStatus } from '../layout/Header';

type HealthSnapshot = Awaited<ReturnType<typeof api.health>>;

interface SystemStatusViewProps {
  connectionStatus: ConnectionStatus;
}

const CHECK_INTERVAL_MS = 15_000;

const GATEWAY_STATUS: Record<ConnectionStatus, { status: string; label: string }> = {
  online: { status: 'NORMAL', label: 'Conectado' },
  connecting: { status: 'ATENÇÃO', label: 'Conectando' },
  offline: { status: 'CRÍTICO', label: 'Desconectado' },
};

/**
 * Saúde da plataforma em um único painel.
 *
 * Sonda a API REST periodicamente e cruza o resultado com o estado do
 * WebSocket já mantido pelo painel principal — dando ao operador uma visão
 * de infraestrutura sem depender de um APM externo.
 */
export const SystemStatusView: React.FC<SystemStatusViewProps> = ({ connectionStatus }) => {
  const loadHealth = useCallback(() => api.health(), []);
  const { data: health, error, isLoading, reload } = useResource<HealthSnapshot>('health', loadHealth);

  // Reverifica periodicamente, sem exigir que o operador acione manualmente.
  useEffect(() => {
    const timer = window.setInterval(reload, CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [reload]);

  const gateway = GATEWAY_STATUS[connectionStatus];
  const apiOk = health?.status === 'ONLINE';
  const dbOk = health?.database === 'CONNECTED';
  const overallStatus = apiOk && dbOk && connectionStatus === 'online' ? 'NORMAL' : error ? 'CRÍTICO' : 'ATENÇÃO';
  const overallLabel = overallStatus === 'NORMAL' ? 'Operacional' : overallStatus === 'ATENÇÃO' ? 'Degradado' : 'Fora do ar';

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Infraestrutura</span>
          <h2 className="rp-page-header__title">Status do sistema</h2>
          <p className="rp-page-header__subtitle">
            Saúde da API, do banco de dados e do barramento de telemetria em tempo real
          </p>
        </div>
        <div className="rp-row">
          <button type="button" className="rp-btn" onClick={reload} disabled={isLoading}>
            {isLoading && <span className="rp-spinner" aria-hidden="true" />}
            Verificar agora
          </button>
        </div>
      </div>

      <div className="rp-grid rp-grid--kpi">
        <article className="rp-metric" data-status={overallStatus}>
          <span className="rp-metric__label">Status geral</span>
          <span className="rp-metric__value">{overallLabel}</span>
          <span className="rp-metric__hint">{health?.line ?? 'Linha 6-Laranja (Linha Uni)'}</span>
        </article>
        <article className="rp-metric" data-status={apiOk ? 'NORMAL' : 'CRÍTICO'}>
          <span className="rp-metric__label">Tempo ativo da API</span>
          <span className="rp-metric__value">{health ? formatDuration(health.uptimeSeconds) : '—'}</span>
          <span className="rp-metric__hint">Desde o último reinício do serviço</span>
        </article>
        <article className="rp-metric" data-status="NORMAL">
          <span className="rp-metric__label">Ambiente</span>
          <span className="rp-metric__value mono">{health?.environment ?? '—'}</span>
          <span className="rp-metric__hint">{health?.architecture ?? 'Event-Driven (EDA)'}</span>
        </article>
        <article className="rp-metric" data-status={gateway.status}>
          <span className="rp-metric__label">Barramento em tempo real</span>
          <span className="rp-metric__value">{gateway.label}</span>
          <span className="rp-metric__hint">WebSocket (Socket.IO) autenticado por JWT</span>
        </article>
      </div>

      <section className="rp-card rp-card--flush">
        <header className="rp-card__header" style={{ padding: 'var(--sp-5) var(--sp-5) 0' }}>
          <div>
            <h3 className="rp-card__title">Componentes monitorados</h3>
            <p className="rp-card__subtitle">
              {health ? `Última verificação às ${formatTime(health.timestamp)}` : 'Verificando…'} • a cada{' '}
              {CHECK_INTERVAL_MS / 1000}s
            </p>
          </div>
        </header>

        <div className="rp-check-list">
          <div className="rp-check-item">
            <span className="rp-check-item__icon" aria-hidden="true">
              ◈
            </span>
            <div className="rp-check-item__text">
              <span className="rp-check-item__title">API REST</span>
              <span className="rp-hint">Autenticação, ocorrências, equipe e relatórios</span>
            </div>
            <StatusPill status={apiOk ? 'NORMAL' : 'CRÍTICO'} label={apiOk ? 'Online' : 'Indisponível'} withDot />
          </div>

          <div className="rp-check-item">
            <span className="rp-check-item__icon" aria-hidden="true">
              ▤
            </span>
            <div className="rp-check-item__text">
              <span className="rp-check-item__title">Banco de dados PostgreSQL</span>
              <span className="rp-hint">Persistência de operadores, ocorrências e telemetria histórica</span>
            </div>
            <StatusPill status={dbOk ? 'NORMAL' : 'CRÍTICO'} label={dbOk ? 'Conectado' : 'Desconectado'} withDot />
          </div>

          <div className="rp-check-item">
            <span className="rp-check-item__icon" aria-hidden="true">
              ⇄
            </span>
            <div className="rp-check-item__text">
              <span className="rp-check-item__title">Gateway de telemetria (WebSocket)</span>
              <span className="rp-hint">Handshake autenticado por JWT — posição de trens e leituras de tensão</span>
            </div>
            <StatusPill status={gateway.status} label={gateway.label} withDot />
          </div>

          <div className="rp-check-item">
            <span className="rp-check-item__icon" aria-hidden="true">
              ⚡
            </span>
            <div className="rp-check-item__text">
              <span className="rp-check-item__title">Simulador de telemetria SCADA</span>
              <span className="rp-hint">
                {health
                  ? `Emitindo leituras a cada ${(health.telemetryIntervalMs / 1000).toFixed(0)}s`
                  : 'Aguardando confirmação da API'}
              </span>
            </div>
            <StatusPill status={apiOk ? 'NORMAL' : 'ATENÇÃO'} label={apiOk ? 'Ativo' : 'Indeterminado'} withDot />
          </div>
        </div>
      </section>

      {error && <EmptyState icon="⚠" title="Falha ao consultar a API REST." hint={error} />}
    </div>
  );
};
