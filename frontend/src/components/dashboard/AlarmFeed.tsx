// frontend/src/components/dashboard/AlarmFeed.tsx
import React from 'react';
import type { AlarmEvent } from '../../types';

interface AlarmFeedProps {
  alarms: AlarmEvent[];
}

export const AlarmFeed: React.FC<AlarmFeedProps> = ({ alarms }) => {
  return (
    <div style={styles.alarmFeedContainer}>
      <div style={styles.alarmFeedHeader}>
        <h3 style={styles.sectionTitle}>Feed de Ocorrências e Eventos da Via</h3>
        <span style={styles.alarmCount}>{alarms.length} Alertas</span>
      </div>
      <div style={styles.alarmList}>
        {alarms.map(alarm => (
          <div key={alarm.id} style={styles.alarmItem}>
            <span style={styles.alarmTime}>{alarm.timestamp}</span>
            <span style={styles.alarmCode}>{alarm.stationCode}</span>
            <span style={styles.alarmMessage}>{alarm.message}</span>
            <span style={{
              ...styles.alarmLevel,
              backgroundColor: alarm.level === 'CRITICAL' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
              color: alarm.level === 'CRITICAL' ? '#fca5a5' : '#fbbf24'
            }}>
              {alarm.level}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  alarmFeedContainer: {
    marginTop: '1rem',
    backgroundColor: '#110a06',
    border: '1px solid #331e13',
    borderRadius: '12px',
    padding: '1rem 1.25rem',
    fontFamily: '"Montserrat", sans-serif',
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
    color: '#a89d93',
  },
  alarmCount: {
    fontSize: '0.65rem',
    color: '#887c71',
    fontFamily: 'monospace',
  },
  alarmList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxHeight: '140px',
    overflowY: 'auto',
  },
  alarmItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0a0604',
    border: '1px solid #24140b',
    padding: '0.5rem 0.75rem',
    borderRadius: '6px',
    fontSize: '0.75rem',
    gap: '1rem',
  },
  alarmTime: {
    fontFamily: 'monospace',
    color: '#887c71',
    fontSize: '0.7rem',
  },
  alarmCode: {
    fontFamily: 'monospace',
    fontWeight: 'bold',
    color: '#a0522d',
  },
  alarmMessage: {
    flex: 1,
    color: '#d8cbb8',
  },
  alarmLevel: {
    fontSize: '0.6rem',
    fontWeight: 700,
    padding: '0.1rem 0.4rem',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
};