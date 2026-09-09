// frontend/src/components/views/OverviewView.tsx
import React, { useMemo } from 'react';
import type { AlarmEvent, Station, Train } from '../../types';
import type { ConnectionStatus } from '../layout/Header';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { formatNumber } from '../../lib/format';

interface OverviewViewProps {
  stations: Station[];
  trains: Train[];
  alarms: AlarmEvent[];
  connectionStatus: ConnectionStatus;
  onNavigate: (tab: 'ats' | 'energy' | 'assets') => void;
  onSelectStation: (station: Station) => void;
}

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Sincronizando com o barramento de eventos…',
  online: 'Todos os sistemas operando em tempo real',
  offline: 'Conexão com o Core perdida — os dados podem estar desatualizados',
};

export const OverviewView: React.FC<OverviewViewProps> = ({
  stations,
  trains,
  alarms,
  connectionStatus,
  onNavigate,
  onSelectStation,
}) => {
  const { attentionStations, criticalCount, avgVoltage, haltedTrains } = useMemo(() => {
    const attention = stations.filter((station) => station.status !== 'NORMAL');
    return {
      attentionStations: attention,
      criticalCount: attention.filter((station) => station.status === 'CRÍTICO').length,
      avgVoltage:
        stations.length === 0 ? 0 : stations.reduce((sum, station) => sum + station.voltageKV, 0) / stations.length,
      haltedTrains: trains.filter((train) => train.status === 'EMERGÊNCIA'),
    };
  }, [stations, trains]);

  const kpis = [
    {
      label: 'Estações em atenção/crítico',
      value: `${attentionStations.length} / ${stations.length}`,
      status: attentionStations.length === 0 ? 'NORMAL' : criticalCount > 0 ? 'CRÍTICO' : 'ATENÇÃO',
      hint: criticalCount > 0 ? `${criticalCount} em estado crítico` : 'Malha dentro dos parâmetros',
    },
    {
      label: 'Tensão média da catenária',
      value: `${formatNumber(avgVoltage, 2)} kV`,
      status: avgVoltage < 23.5 ? 'ATENÇÃO' : 'NORMAL',
      hint: 'Faixa nominal: 23,5 – 25,0 kV',
    },
    {
      label: 'Composições em circulação',
      value: String(trains.length),
      status: haltedTrains.length > 0 ? 'CRÍTICO' : 'INFO',
      hint:
        haltedTrains.length > 0
          ? `${haltedTrains.map((train) => train.trainId).join(', ')} em emergência`
          : trains.map((train) => train.trainId).join(', ') || 'Nenhuma composição ativa',
    },
    {
      label: 'Índice de pontualidade (24h)',
      value: '99,4%',
      status: 'NORMAL',
      hint: 'Meta contratual: > 98,5%',
    },
  ] as const;

  return (
    <div className="rp-stack rp-animate-in">
      <section className="rp-card rp-row rp-row--between" aria-label="Situação geral da malha">
        <div>
          <span className="rp-eyebrow">Painel executivo</span>
          <h2 className="rp-page-header__title">Visão geral da malha — Linha 6-Laranja</h2>
          <p className="rp-page-header__subtitle">{CONNECTION_LABEL[connectionStatus]}</p>
        </div>
        <span className="rp-dot rp-dot--lg rp-dot--pulse" data-status={connectionStatus} aria-hidden="true" />
      </section>

      <div className="rp-grid rp-grid--kpi">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="rp-metric" data-status={kpi.status}>
            <span className="rp-metric__label">{kpi.label}</span>
            <span className="rp-metric__value">{kpi.value}</span>
            <span className="rp-metric__hint">{kpi.hint}</span>
          </article>
        ))}
      </div>

      <div className="rp-grid rp-grid--panels">
        <section className="rp-card" aria-label="Estações que exigem atenção">
          <header className="rp-card__header">
            <h3 className="rp-card__title">Estações que exigem atenção</h3>
            <button type="button" className="rp-btn rp-btn--link" onClick={() => onNavigate('ats')}>
              Ver malha ATS →
            </button>
          </header>

          {attentionStations.length === 0 ? (
            <EmptyState icon="✅" title={`Todas as ${stations.length} estações operando em condição normal.`} />
          ) : (
            <ul className="rp-feed">
              {attentionStations.map((station) => (
                <li key={station.code} className="rp-feed__item" data-status={station.status}>
                  <span className="rp-feed__source">{station.code}</span>
                  <span className="rp-feed__message truncate">{station.name}</span>
                  <span className="mono text-muted">{station.voltageKV.toFixed(2)} kV</span>
                  <StatusPill status={station.status} />
                  <button
                    type="button"
                    className="rp-btn rp-btn--link"
                    onClick={() => {
                      onSelectStation(station);
                      onNavigate('ats');
                    }}
                  >
                    Inspecionar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rp-card" aria-label="Últimas ocorrências">
          <header className="rp-card__header">
            <h3 className="rp-card__title">Últimas ocorrências</h3>
            <button type="button" className="rp-btn rp-btn--link" onClick={() => onNavigate('assets')}>
              Ver ativos →
            </button>
          </header>

          {alarms.length === 0 ? (
            <EmptyState icon="🛈" title="Nenhuma ocorrência registrada nesta sessão." />
          ) : (
            <ul className="rp-feed">
              {alarms.slice(0, 6).map((alarm) => (
                <li key={alarm.id} className="rp-feed__item" data-status={alarm.level}>
                  <span className="rp-feed__time">{alarm.timestamp}</span>
                  <span className="rp-feed__source">{alarm.stationCode}</span>
                  <span className="rp-feed__message truncate">{alarm.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
