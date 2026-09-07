// frontend/src/components/dashboard/AlarmFeed.tsx
import React from 'react';
import type { AlarmEvent } from '../../types';

interface AlarmFeedProps {
  alarms: AlarmEvent[];
}

const LEVEL_STYLES: Record<string, { bg: string; color: string }> = {
  CRITICAL: { bg: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5' },
  WARNING: { bg: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' },
  INFO: { bg: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd' },
};

export const AlarmFeed: React.FC<AlarmFeedProps> = ({ alarms }) => {
  return (
    <div style={styles.alarmFeedContainer}>
      <div style={styles.alarmFeedHeader}>
        <h3 style={styles.sectionTitle}>Feed de Ocorrências e Eventos da Via</h3>
        <span style={styles.alarmCount}>{alarms.length} Alertas</span>
      </div>

      {alarms.length === 0 ? (
        <p style={styles.emptyState}>Nenhuma ocorrência registrada.</p>
      ) : (
        <div style={styles.alarmList}>
          {alarms.map(alarm => {
            const levelStyle = LEVEL_STYLES[alarm.level] ?? LEVEL_STYLES.INFO;
            return (
              <div key={alarm.id} style={styles.alarmItem}>
                <span style={styles.alarmTime}>{alarm.timestamp}</span>
                <span style={styles.alarmCode}>{alarm.stationCode}</span>
                <span style={styles.alarmMessage}>{alarm.message}</span>
                <span
                  style={{
                    ...styles.alarmLevel,
                    backgroundColor: levelStyle.bg,
                    color: levelStyle.color,
                  }}
                >
                  {alarm.level}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  alarmFeedContainer: {
    marginTop: '1rem',
    backgroundColor: 'var(--uni-bg-secondary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '12px',
    padding: '1rem 1.25rem',
    fontFamily: 'var(--uni-font)',
  },
  alarmFeedHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  sectionTitle: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--uni-text-muted)',
  },
  alarmCount: {
    fontSize: '0.65rem',
    color: 'var(--uni-text-muted)',
    fontFamily: 'monospace',
  },
  emptyState: {
    fontSize: '0.75rem',
    color: 'var(--uni-text-muted)',
    padding: '0.75rem 0',
    textAlign: 'center',
  },
  alarmList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxHeight: '140px',
    overflowY: 'auto',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--uni-border) transparent',
  },
  alarmItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-border)',
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    fontSize: '0.75rem',
    gap: '1rem',
  },
  alarmTime: {
    fontFamily: 'monospace',
    color: 'var(--uni-text-muted)',
    fontSize: '0.7rem',
  },
  alarmCode: {
    fontFamily: 'monospace',
    fontWeight: 'bold',
    color: 'var(--uni-orange)',
  },
  alarmMessage: {
    flex: 1,
    color: 'var(--uni-text-main)',
  },
  alarmLevel: {
    fontSize: '0.6rem',
    fontWeight: 700,
    padding: '0.1rem 0.4rem',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
};