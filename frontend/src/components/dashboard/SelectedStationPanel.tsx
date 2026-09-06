// frontend/src/components/dashboard/SelectedStationPanel.tsx
import React from 'react';
import type { Station } from '../../types';

interface SelectedStationPanelProps {
  station: Station;
  onSendCommand: (trainId: string, command: string) => void;
  onInjectAlert: () => void;
}

export const SelectedStationPanel: React.FC<SelectedStationPanelProps> = ({ station, onSendCommand, onInjectAlert }) => {
  return (
    <aside style={styles.panel}>
      <div style={styles.panelHeader}>
        <span style={styles.panelTag}>Terminal de Controle</span>
        <h3 style={styles.stationTitle}>{station.name}</h3>
        <span style={styles.codeText}>Código ATS: {station.code}</span>
      </div>

      <div style={styles.metricsBox}>
        <div style={styles.metricRow}>
          <span>Status do Bloco:</span>
          <strong style={{ color: station.status === 'ATENÇÃO' ? 'var(--uni-warning)' : 'var(--uni-success)' }}>
            {station.status}
          </strong>
        </div>
        <div style={styles.metricRow}>
          <span>Tensão Catenária:</span>
          <strong style={{ fontFamily: 'monospace', color: 'var(--uni-orange)' }}>{station.voltageKV} kV</strong>
        </div>
        <div style={styles.metricRow}>
          <span>Headway Operacional:</span>
          <strong style={{ fontFamily: 'monospace' }}>{station.headway}</strong>
        </div>
        <div style={styles.metricRow}>
          <span>Trens no Bloco:</span>
          <strong style={{ fontFamily: 'monospace', color: 'var(--uni-text-main)' }}>
            {station.trains.length > 0 ? station.trains.join(', ') : 'Nenhum'}
          </strong>
        </div>
      </div>

      <div style={styles.actionsGroup}>
        <h4 style={styles.actionsTitle}>Comandos Críticos de Segurança</h4>
        <button 
          onClick={() => onSendCommand(station.trains[0] || 'T-01', 'EMERGENCY_BRAKE')} 
          style={styles.dangerBtn}
        >
          🚨 Acionar Frenagem de Emergência
        </button>
        <button 
          onClick={() => onSendCommand(station.trains[0] || 'T-01', 'SPEED_RESTRICTION_20')} 
          style={styles.warningBtn}
        >
          ⚠️ Impor Limite 20 km/h (V.R.)
        </button>
        <button 
          onClick={onInjectAlert} 
          style={styles.secondaryBtn}
        >
          📌 Registrar Ocorrência na Estação
        </button>
      </div>
    </aside>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  panel: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '12px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', height: 'fit-content' },
  panelHeader: { display: 'flex', flexDirection: 'column', gap: '0.2rem', borderBottom: '1px solid var(--uni-border)', paddingBottom: '0.85rem' },
  panelTag: { fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--uni-orange)', letterSpacing: '0.05em' },
  stationTitle: { fontSize: '1rem', fontWeight: 700, color: 'var(--uni-text-main)' },
  codeText: { fontSize: '0.7rem', color: 'var(--uni-text-muted)', fontFamily: 'monospace' },
  metricsBox: { backgroundColor: 'var(--uni-bg-primary)', border: '1px solid var(--uni-border)', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.75rem' },
  metricRow: { display: 'flex', justifyContent: 'space-between', color: 'var(--uni-text-muted)' },
  actionsGroup: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  actionsTitle: { fontSize: '0.75rem', fontWeight: 700, color: 'var(--uni-text-main)', marginBottom: '0.2rem' },
  dangerBtn: { backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--uni-danger)', color: '#fca5a5', padding: '0.65rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  warningBtn: { backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid var(--uni-warning)', color: '#fde68a', padding: '0.65rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' },
  secondaryBtn: { backgroundColor: 'var(--uni-bg-card)', border: '1px solid var(--uni-border)', color: 'var(--uni-text-main)', padding: '0.65rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }
};