import React from 'react';
import { AlertTriangle, CheckCircle, Clock, Train } from 'lucide-react';
import { useAlerts } from '../../features/alerts/hooks/useAlerts';
import type { AlertDTO } from '../../features/alerts/types';

export const IncidentTable: React.FC = () => {
  const { alerts, acknowledgeAlert, isLoading } = useAlerts();

  // Mapeamento de cores SIL 4 baseado na gravidade
  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'EMERGENCY': return { color: '#FF4C4C', bg: 'rgba(255, 76, 76, 0.1)', border: '#FF4C4C' };
      case 'CRITICAL': return { color: '#E67E22', bg: 'rgba(230, 126, 34, 0.1)', border: '#E67E22' };
      default: return { color: '#F1C40F', bg: 'rgba(241, 196, 15, 0.1)', border: '#F1C40F' };
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }} className="font-mono">
        SINCRONIZANDO FILA DE EVENTOS...
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <table style={styles.table}>
        <thead>
          <tr style={styles.theadRow}>
            <th style={styles.th}>STATUS</th>
            <th style={styles.th}>TIMESTAMP</th>
            <th style={styles.th}>COMPOSIÇÃO</th>
            <th style={styles.th}>INCIDENTE</th>
            <th style={styles.th}>AÇÃO</th>
          </tr>
        </thead>
        <tbody className="custom-scrollbar">
          {alerts.length === 0 ? (
            <tr>
              <td colSpan={5} style={styles.emptyCell}>
                <CheckCircle size={16} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <p className="font-mono">SISTEMA NOMINAL - NENHUMA ANOMALIA NA VIA</p>
              </td>
            </tr>
          ) : (
            alerts.map((alert: AlertDTO) => {
              const theme = getSeverityStyle(alert.severity);
              return (
                <tr key={alert.alert_id} style={styles.tr}>
                  <td style={styles.td}>
                    <div style={{ ...styles.badge, color: theme.color, backgroundColor: theme.bg, borderColor: theme.border }}>
                      {alert.severity}
                    </div>
                  </td>
                  <td style={{ ...styles.td, color: 'var(--text-muted)' }} className="font-mono">
                    {new Date(alert.created_at).toLocaleTimeString()}
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Train size={14} color="#D4A373" />
                      <span className="font-mono" style={{ fontWeight: 'bold' }}>{alert.fleet_code}-{alert.train_id}</span>
                    </div>
                  </td>
                  <td style={{ ...styles.td, color: '#E6CCB2' }}>{alert.message}</td>
                  <td style={styles.td}>
                    <button 
                      onClick={() => acknowledgeAlert(alert.alert_id)}
                      className="ack-button"
                      style={styles.ackButton}
                    >
                      RECONHECER
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

const styles = {
  container: {
    width: '100%',
    overflowX: 'auto' as const,
    backgroundColor: '#16110D', // Fundo madeira escura orgânica
    borderRadius: '8px',
    border: '1px solid #3A2318',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    textAlign: 'left' as const,
  },
  theadRow: {
    borderBottom: '2px solid #3A2318',
    backgroundColor: '#1E140F',
  },
  th: {
    padding: '12px 16px',
    fontSize: '0.65rem',
    color: '#8c7b70',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  tr: {
    borderBottom: '1px solid #2A1A12',
    transition: 'background-color 0.2s',
  },
  td: {
    padding: '14px 16px',
    fontSize: '0.8rem',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '0.6rem',
    fontWeight: '900',
    border: '1px solid',
  },
  ackButton: {
    backgroundColor: 'transparent',
    border: '1px solid #D4A373',
    color: '#D4A373',
    padding: '4px 12px',
    borderRadius: '4px',
    fontSize: '0.65rem',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    transition: 'all 0.2s',
  },
  emptyCell: {
    padding: '4rem',
    textAlign: 'center' as const,
    color: '#007A5E', // Verde nominal
    fontSize: '0.75rem',
  }
};