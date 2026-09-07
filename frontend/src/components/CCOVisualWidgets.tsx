// frontend/src/components/CCOVisualWidgets.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

type Severity = 'CRITICAL' | 'WARNING' | 'INFO';

interface AlertItem {
  id: string;
  timestamp: string;
  trainOrSubstation: string;
  message: string;
  severity: Severity;
}

interface TSSItem {
  code: string;
  name: string;
  voltage: number;
  status: 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO';
}

const SEVERITY_STYLES: Record<Severity, { color: string; border: string }> = {
  CRITICAL: { color: 'var(--uni-danger)', border: 'var(--uni-danger)' },
  WARNING: { color: 'var(--uni-orange)', border: 'var(--uni-orange)' },
  INFO: { color: 'var(--uni-text-muted)', border: 'var(--uni-border)' },
};

const STATUS_DOT_COLOR: Record<TSSItem['status'], string> = {
  NORMAL: 'var(--uni-success)',
  ATENÇÃO: 'var(--uni-orange)',
  'CRÍTICO': 'var(--uni-danger)',
};

const SEVERITY_FILTERS: Array<Severity | 'ALL'> = ['ALL', 'CRITICAL', 'WARNING', 'INFO'];

const RANDOM_TRAINS = ['T-01', 'T-02', 'T-04', 'T-07'];
const RANDOM_MESSAGES = [
  'Transição de via automatizada concluída',
  'Leitura de baliza ATS confirmada',
  'Flutuação menor de corrente no pantógrafo',
];
const CRITICAL_MESSAGES = [
  'Perda de comunicação com baliza ATP',
  'Sobrecorrente detectada no pantógrafo',
];

export const CCOVisualWidgets: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertItem[]>([
    { id: 'seed-1', timestamp: '08:59:10', trainOrSubstation: 'T-04', message: 'Queda temporária de sinal ATP no bloco 4', severity: 'WARNING' },
    { id: 'seed-2', timestamp: '08:58:22', trainOrSubstation: 'TSS-BRA', message: 'Tensão nominal estabilizada em 24.8 kV', severity: 'INFO' },
  ]);
  const [severityFilter, setSeverityFilter] = useState<Severity | 'ALL'>('ALL');
  const nextAlertId = useRef(3);

  const [substations] = useState<TSSItem[]>([
    { code: 'TSS-01', name: 'Brasilândia', voltage: 24.6, status: 'NORMAL' },
    { code: 'TSS-02', name: 'João Paulo I', voltage: 23.2, status: 'ATENÇÃO' },
    { code: 'TSS-03', name: 'Freguesia do Ó', voltage: 24.9, status: 'NORMAL' },
    { code: 'TSS-04', name: 'Água Branca', voltage: 24.5, status: 'NORMAL' },
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      const roll = Math.random();
      const severity: Severity = roll > 0.93 ? 'CRITICAL' : roll > 0.7 ? 'WARNING' : 'INFO';
      const message =
        severity === 'CRITICAL'
          ? CRITICAL_MESSAGES[Math.floor(Math.random() * CRITICAL_MESSAGES.length)]
          : RANDOM_MESSAGES[Math.floor(Math.random() * RANDOM_MESSAGES.length)];

      const newAlert: AlertItem = {
        id: `alert-${nextAlertId.current++}`,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        trainOrSubstation: RANDOM_TRAINS[Math.floor(Math.random() * RANDOM_TRAINS.length)],
        message,
        severity,
      };

      setAlerts(prev => [newAlert, ...prev].slice(0, 8));
    }, 6000);

    return () => clearInterval(interval);
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  }, []);

  const visibleAlerts = useMemo(
    () => (severityFilter === 'ALL' ? alerts : alerts.filter(a => a.severity === severityFilter)),
    [alerts, severityFilter]
  );

  const averageVoltage = useMemo(
    () => (substations.length === 0 ? 0 : substations.reduce((sum, s) => sum + s.voltage, 0) / substations.length),
    [substations]
  );

  return (
    <div style={styles.container}>
      <div style={styles.sectionCard}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>⚡ Status de Subestações (TSS — Linha 6)</h3>
          <span style={styles.liveBadge}>● TEMPO REAL</span>
        </div>

        <div style={styles.tssSummary}>
          <span>Tensão média da linha:</span>
          <strong style={styles.tssSummaryValue}>{averageVoltage.toFixed(1)} kV</strong>
        </div>

        {substations.length === 0 ? (
          <p style={styles.emptyState}>Nenhuma subestação monitorada.</p>
        ) : (
          <div style={styles.tssGrid}>
            {substations.map((tss) => (
              <div key={tss.code} style={styles.tssCard}>
                <div style={styles.tssTopRow}>
                  <span style={styles.tssCode}>{tss.code}</span>
                  <span
                    style={{
                      ...styles.statusDot,
                      backgroundColor: STATUS_DOT_COLOR[tss.status],
                      boxShadow: `0 0 8px ${STATUS_DOT_COLOR[tss.status]}`,
                    }}
                    title={tss.status}
                  />
                </div>
                <div style={styles.tssName}>{tss.name}</div>
                <div style={styles.tssVoltageContainer}>
                  <span style={styles.voltageValue}>{tss.voltage}</span>
                  <span style={styles.voltageUnit}>kV</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.sectionCard}>
        <div style={styles.sectionHeader}>
          <h3 style={styles.sectionTitle}>🛡️ Feed de Alertas de Segurança & Telemetria</h3>
          <span style={styles.logCountBadge}>{visibleAlerts.length} eventos ativos</span>
        </div>

        <div style={styles.filterRow} role="group" aria-label="Filtrar por severidade">
          {SEVERITY_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setSeverityFilter(f)}
              style={{
                ...styles.filterChip,
                ...(severityFilter === f ? styles.filterChipActive : {}),
              }}
            >
              {f === 'ALL' ? 'Todos' : f}
            </button>
          ))}
        </div>

        {visibleAlerts.length === 0 ? (
          <p style={styles.emptyState}>Nenhum evento para este filtro.</p>
        ) : (
          <div style={styles.alertList} role="log" aria-live="polite">
            {visibleAlerts.map((alert) => {
              const sev = SEVERITY_STYLES[alert.severity];
              return (
                <div key={alert.id} style={styles.alertItem}>
                  <span style={styles.alertTime}>{alert.timestamp}</span>
                  <span style={styles.alertTarget}>{alert.trainOrSubstation}</span>
                  <span style={styles.alertMsg}>{alert.message}</span>
                  <span style={{ ...styles.severityTag, borderColor: sev.border, color: sev.color }}>
                    {alert.severity}
                  </span>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    style={styles.dismissBtn}
                    aria-label={`Reconhecer alerta: ${alert.message}`}
                    title="Reconhecer"
                  >
                    ✓
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
    gap: '1.5rem',
    marginTop: '1.5rem',
    fontFamily: 'var(--uni-font)',
  },
  sectionCard: {
    backgroundColor: 'var(--uni-bg-secondary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '10px',
    padding: '1.25rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    borderBottom: '1px solid var(--uni-border)',
    paddingBottom: '0.75rem',
  },
  sectionTitle: { fontSize: '0.95rem', fontWeight: 700, color: 'var(--uni-text-main)', margin: 0 },
  liveBadge: {
    fontSize: '0.65rem',
    fontWeight: 700,
    color: 'var(--uni-success)',
    backgroundColor: 'rgba(0, 255, 102, 0.1)',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
  },
  logCountBadge: {
    fontSize: '0.7rem',
    color: 'var(--uni-text-muted)',
    backgroundColor: 'var(--uni-bg-card)',
    padding: '0.2rem 0.6rem',
    borderRadius: '4px',
  },
  tssSummary: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: 'var(--uni-text-muted)',
    marginBottom: '0.85rem',
  },
  tssSummaryValue: { color: 'var(--uni-orange)', fontFamily: 'monospace' },
  emptyState: { fontSize: '0.75rem', color: 'var(--uni-text-muted)', textAlign: 'center', padding: '1rem 0' },
  tssGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' },
  tssCard: {
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '8px',
    padding: '1rem',
  },
  tssTopRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' },
  tssCode: { fontSize: '0.75rem', fontWeight: 800, color: 'var(--uni-orange)' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%' },
  tssName: { fontSize: '0.85rem', fontWeight: 600, color: 'var(--uni-text-main)', marginBottom: '0.6rem' },
  tssVoltageContainer: { display: 'flex', alignItems: 'baseline', gap: '0.3rem' },
  voltageValue: { fontSize: '1.3rem', fontWeight: 800, color: 'var(--uni-text-main)' },
  voltageUnit: { fontSize: '0.75rem', color: 'var(--uni-text-muted)', fontWeight: 600 },
  filterRow: { display: 'flex', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' },
  filterChip: {
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-border)',
    color: 'var(--uni-text-muted)',
    fontSize: '0.65rem',
    fontWeight: 600,
    padding: '0.25rem 0.6rem',
    borderRadius: '20px',
    cursor: 'pointer',
  },
  filterChipActive: {
    borderColor: 'var(--uni-orange)',
    color: 'var(--uni-orange)',
    backgroundColor: 'rgba(255, 102, 0, 0.1)',
  },
  alertList: { display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '220px', overflowY: 'auto' },
  alertItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-bg-card)',
    padding: '0.6rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    gap: '0.5rem',
  },
  alertTime: { color: 'var(--uni-text-muted)', fontSize: '0.75rem', fontFamily: 'monospace' },
  alertTarget: {
    backgroundColor: 'var(--uni-orange)',
    color: '#FFFFFF',
    fontWeight: 700,
    fontSize: '0.7rem',
    padding: '0.1rem 0.4rem',
    borderRadius: '3px',
  },
  alertMsg: {
    color: 'var(--uni-text-main)',
    flex: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  severityTag: { fontSize: '0.65rem', fontWeight: 700, border: '1px solid', padding: '0.1rem 0.4rem', borderRadius: '3px' },
  dismissBtn: {
    backgroundColor: 'transparent',
    border: '1px solid var(--uni-border)',
    color: 'var(--uni-text-muted)',
    borderRadius: '4px',
    width: '22px',
    height: '22px',
    cursor: 'pointer',
    fontSize: '0.7rem',
    lineHeight: 1,
    flexShrink: 0,
  },
};