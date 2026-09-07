// frontend/src/components/views/OverviewView.tsx
import React, { useMemo } from 'react';
import type { AlarmEvent, Station } from '../../types';
import type { ConnectionStatus } from '../layout/Header';

interface OverviewViewProps {
  stations: Station[];
  alarms: AlarmEvent[];
  connectionStatus: ConnectionStatus;
  onNavigate: (tab: string) => void;
}

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Sincronizando com o barramento de eventos…',
  online: 'Todos os sistemas operando em tempo real',
  offline: 'Conexão com o Core perdida — dados podem estar desatualizados',
};

export const OverviewView: React.FC<OverviewViewProps> = ({ stations, alarms, connectionStatus, onNavigate }) => {
  const attentionStations = useMemo(() => stations.filter(s => s.status !== 'NORMAL'), [stations]);
  const criticalCount = useMemo(() => stations.filter(s => s.status === 'CRÍTICO').length, [stations]);
  const avgVoltage = useMemo(
    () => (stations.length === 0 ? 0 : stations.reduce((sum, s) => sum + s.voltageKV, 0) / stations.length),
    [stations]
  );
  const activeTrainIds = useMemo(
    () => Array.from(new Set(stations.flatMap(s => s.trains))),
    [stations]
  );

  const kpis = [
    {
      label: 'Estações em Atenção/Crítico',
      value: `${attentionStations.length} / ${stations.length}`,
      tone: attentionStations.length === 0 ? 'success' : criticalCount > 0 ? 'danger' : 'warning',
      hint: criticalCount > 0 ? `${criticalCount} em estado crítico` : 'Malha dentro dos parâmetros',
    },
    {
      label: 'Tensão Média da Catenária',
      value: `${avgVoltage.toFixed(1)} kV`,
      tone: avgVoltage < 23.5 ? 'warning' : 'success',
      hint: 'Faixa nominal: 23.5 – 25.0 kV',
    },
    {
      label: 'Composições em Circulação',
      value: String(activeTrainIds.length),
      tone: 'info',
      hint: activeTrainIds.length > 0 ? activeTrainIds.join(', ') : 'Nenhum trem ativo',
    },
    {
      label: 'Índice de Pontualidade (24h)',
      value: '99.4%',
      tone: 'success',
      hint: 'Meta contratual: > 98.5%',
    },
  ] as const;

  return (
    <div style={styles.container}>
      <div style={styles.banner}>
        <div>
          <span style={styles.bannerTag}>Painel Executivo</span>
          <h2 style={styles.bannerTitle}>Visão Geral da Malha — Linha 6-Laranja</h2>
          <p style={styles.bannerSubtitle}>{CONNECTION_LABEL[connectionStatus]}</p>
        </div>
        <div style={{ ...styles.connectionDot, backgroundColor: connectionStatus === 'online' ? 'var(--uni-success)' : connectionStatus === 'connecting' ? 'var(--uni-warning)' : 'var(--uni-danger)' }} />
      </div>

      <div style={styles.kpiGrid}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={styles.kpiCard}>
            <span style={styles.kpiLabel}>{kpi.label}</span>
            <span style={{ ...styles.kpiValue, color: TONE_COLOR[kpi.tone] }}>{kpi.value}</span>
            <span style={styles.kpiHint}>{kpi.hint}</span>
          </div>
        ))}
      </div>

      <div style={styles.bottomGrid}>
        <div style={styles.panelCard}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Estações que Exigem Atenção</h3>
            <button style={styles.linkButton} onClick={() => onNavigate('ats')}>Ver Malha ATS →</button>
          </div>
          {attentionStations.length === 0 ? (
            <p style={styles.emptyState}>Todas as 15 estações operando em condição normal.</p>
          ) : (
            <div style={styles.stationList}>
              {attentionStations.map(st => (
                <div key={st.code} style={styles.stationRow}>
                  <span style={styles.stationCode}>{st.code}</span>
                  <span style={styles.stationName}>{st.name}</span>
                  <span style={{ ...styles.stationStatus, color: st.status === 'CRÍTICO' ? 'var(--uni-danger)' : 'var(--uni-warning)' }}>
                    {st.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.panelCard}>
          <div style={styles.panelHeader}>
            <h3 style={styles.panelTitle}>Últimas Ocorrências</h3>
            <button style={styles.linkButton} onClick={() => onNavigate('assets')}>Ver Ativos →</button>
          </div>
          {alarms.length === 0 ? (
            <p style={styles.emptyState}>Nenhuma ocorrência registrada nesta sessão.</p>
          ) : (
            <div style={styles.stationList}>
              {alarms.slice(0, 5).map(alarm => (
                <div key={alarm.id} style={styles.stationRow}>
                  <span style={styles.alarmTime}>{alarm.timestamp}</span>
                  <span style={styles.stationName}>{alarm.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const TONE_COLOR: Record<'success' | 'warning' | 'danger' | 'info', string> = {
  success: 'var(--uni-success)',
  warning: 'var(--uni-warning)',
  danger: 'var(--uni-danger)',
  info: 'var(--uni-text-main)',
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'railpulse-fade-in 0.3s ease' },
  banner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'var(--uni-bg-secondary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '12px',
    padding: '1.5rem',
  },
  bannerTag: { fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--uni-orange)', letterSpacing: '0.08em' },
  bannerTitle: { fontSize: '1.15rem', fontWeight: 800, color: 'var(--uni-text-main)', margin: '0.35rem 0' },
  bannerSubtitle: { fontSize: '0.78rem', color: 'var(--uni-text-muted)', margin: 0 },
  connectionDot: { width: '14px', height: '14px', borderRadius: '50%', boxShadow: '0 0 16px currentColor', flexShrink: 0, animation: 'railpulse-pulse 2s ease-in-out infinite' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' },
  kpiCard: {
    backgroundColor: 'var(--uni-bg-secondary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '12px',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  kpiLabel: { fontSize: '0.7rem', color: 'var(--uni-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' },
  kpiValue: { fontSize: '1.7rem', fontWeight: 800, fontFamily: 'monospace' },
  kpiHint: { fontSize: '0.68rem', color: 'var(--uni-text-muted)' },
  bottomGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' },
  panelCard: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '12px', padding: '1.25rem' },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  panelTitle: { fontSize: '0.85rem', fontWeight: 700, color: 'var(--uni-text-main)', margin: 0 },
  linkButton: { background: 'transparent', border: 'none', color: 'var(--uni-orange)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' },
  emptyState: { fontSize: '0.78rem', color: 'var(--uni-text-muted)', textAlign: 'center', padding: '1rem 0' },
  stationList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  stationRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '8px',
    padding: '0.55rem 0.75rem',
    fontSize: '0.75rem',
  },
  stationCode: { fontFamily: 'monospace', fontWeight: 700, color: 'var(--uni-orange)', flexShrink: 0 },
  stationName: { flex: 1, color: 'var(--uni-text-main)' },
  stationStatus: { fontFamily: 'monospace', fontWeight: 700, fontSize: '0.7rem', flexShrink: 0 },
  alarmTime: { fontFamily: 'monospace', color: 'var(--uni-text-muted)', fontSize: '0.7rem', flexShrink: 0 },
};
