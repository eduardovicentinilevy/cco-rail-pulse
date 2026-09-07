// frontend/src/components/dashboard/SelectedStationPanel.tsx
import React, { useState } from 'react';
import type { Station } from '../../types';

interface SelectedStationPanelProps {
  station: Station;
  onSendCommand: (trainId: string, command: string) => void;
  onInjectAlert: () => void;
}

type ActionKey = 'brake' | 'speed' | 'alert';

export const SelectedStationPanel: React.FC<SelectedStationPanelProps> = ({
  station,
  onSendCommand,
  onInjectAlert,
}) => {
  const [hoveredAction, setHoveredAction] = useState<ActionKey | null>(null);
  const hasTrain = station.trains.length > 0;
  const targetTrain = station.trains[0];

  const handleEmergencyBrake = () => {
    if (!targetTrain) return;
    const confirmed = window.confirm(
      `Confirmar frenagem de emergência para o trem ${targetTrain}? Esta ação é irreversível.`
    );
    if (confirmed) onSendCommand(targetTrain, 'EMERGENCY_BRAKE');
  };

  const handleSpeedRestriction = () => {
    if (!targetTrain) return;
    onSendCommand(targetTrain, 'SPEED_RESTRICTION_20');
  };

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
            {hasTrain ? station.trains.join(', ') : 'Nenhum'}
          </strong>
        </div>
      </div>

      <div style={styles.actionsGroup}>
        <h4 style={styles.actionsTitle}>Comandos Críticos de Segurança</h4>
        <button
          onClick={handleEmergencyBrake}
          onMouseEnter={() => setHoveredAction('brake')}
          onMouseLeave={() => setHoveredAction(null)}
          disabled={!hasTrain}
          title={!hasTrain ? 'Nenhum trem neste bloco' : undefined}
          style={{
            ...styles.dangerBtn,
            ...(hoveredAction === 'brake' && hasTrain ? styles.dangerBtnHover : {}),
            ...(!hasTrain ? styles.btnDisabled : {}),
          }}
        >
          🚨 Acionar Frenagem de Emergência
        </button>
        <button
          onClick={handleSpeedRestriction}
          onMouseEnter={() => setHoveredAction('speed')}
          onMouseLeave={() => setHoveredAction(null)}
          disabled={!hasTrain}
          title={!hasTrain ? 'Nenhum trem neste bloco' : undefined}
          style={{
            ...styles.warningBtn,
            ...(hoveredAction === 'speed' && hasTrain ? styles.warningBtnHover : {}),
            ...(!hasTrain ? styles.btnDisabled : {}),
          }}
        >
          ⚠️ Impor Limite 20 km/h (V.R.)
        </button>
        <button
          onClick={onInjectAlert}
          onMouseEnter={() => setHoveredAction('alert')}
          onMouseLeave={() => setHoveredAction(null)}
          style={{
            ...styles.secondaryBtn,
            ...(hoveredAction === 'alert' ? styles.secondaryBtnHover : {}),
          }}
        >
          📌 Registrar Ocorrência na Estação
        </button>
      </div>
    </aside>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  panel: {
    backgroundColor: 'var(--uni-bg-secondary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '12px',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.25rem',
    height: 'fit-content',
  },
  panelHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
    borderBottom: '1px solid var(--uni-border)',
    paddingBottom: '0.85rem',
  },
  panelTag: { fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--uni-orange)', letterSpacing: '0.05em' },
  stationTitle: { fontSize: '1rem', fontWeight: 700, color: 'var(--uni-text-main)' },
  codeText: { fontSize: '0.7rem', color: 'var(--uni-text-muted)', fontFamily: 'monospace' },
  metricsBox: {
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '8px',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    fontSize: '0.75rem',
  },
  metricRow: { display: 'flex', justifyContent: 'space-between', color: 'var(--uni-text-muted)' },
  actionsGroup: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  actionsTitle: { fontSize: '0.75rem', fontWeight: 700, color: 'var(--uni-text-main)', marginBottom: '0.2rem' },
  dangerBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid var(--uni-danger)',
    color: '#fca5a5',
    padding: '0.65rem',
    borderRadius: '8px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.15s, transform 0.15s',
  },
  dangerBtnHover: { backgroundColor: 'rgba(239, 68, 68, 0.28)', transform: 'translateY(-1px)' },
  warningBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid var(--uni-warning)',
    color: '#fde68a',
    padding: '0.65rem',
    borderRadius: '8px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.15s, transform 0.15s',
  },
  warningBtnHover: { backgroundColor: 'rgba(245, 158, 11, 0.26)', transform: 'translateY(-1px)' },
  secondaryBtn: {
    backgroundColor: 'var(--uni-bg-card)',
    border: '1px solid var(--uni-border)',
    color: 'var(--uni-text-main)',
    padding: '0.65rem',
    borderRadius: '8px',
    fontSize: '0.75rem',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background-color 0.15s, transform 0.15s',
  },
  secondaryBtnHover: { backgroundColor: 'var(--uni-bg-primary)', transform: 'translateY(-1px)' },
  btnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
};