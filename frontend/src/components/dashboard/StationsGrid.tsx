// frontend/src/components/dashboard/StationsGrid.tsx
import React from 'react';
import type { Station } from '../../types';

interface StationsGridProps {
  stations: Station[];
  selectedStationCode: string;
  onSelectStation: (station: Station) => void;
}

export const StationsGrid: React.FC<StationsGridProps> = ({ stations, selectedStationCode, onSelectStation }) => {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.title}>Status Operacional das Estações (Linha 6)</h3>
        <span style={styles.subtitle}>Clique em uma estação para inspecionar parâmetros</span>
      </div>
      <div style={styles.grid}>
        {stations.map(st => {
          const isSelected = st.code === selectedStationCode;
          const isWarning = st.status === 'ATENÇÃO';
          return (
            <div 
              key={st.code}
              onClick={() => onSelectStation(st)}
              style={{
                ...styles.stationCard,
                borderColor: isSelected ? 'var(--uni-orange)' : isWarning ? 'var(--uni-warning)' : 'var(--uni-border)',
                backgroundColor: isSelected ? 'rgba(255, 102, 0, 0.08)' : 'var(--uni-bg-primary)'
              }}
            >
              <div style={styles.stationTop}>
                <span style={styles.codeBadge}>{st.code}</span>
                <span style={{
                  ...styles.statusBadge,
                  backgroundColor: isWarning ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: isWarning ? 'var(--uni-warning)' : 'var(--uni-success)'
                }}>
                  {st.status}
                </span>
              </div>
              <h4 style={styles.stationName}>{st.name}</h4>
              <div style={styles.stationFooter}>
                <span>Tensão: <strong>{st.voltageKV} kV</strong></span>
                <span>Headway: <strong>{st.headway}</strong></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  card: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '12px', padding: '1.25rem' },
  cardHeader: { marginBottom: '1rem' },
  title: { fontSize: '0.85rem', fontWeight: 700, color: 'var(--uni-text-main)' },
  subtitle: { fontSize: '0.7rem', color: 'var(--uni-text-muted)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.85rem' },
  stationCard: { backgroundColor: 'var(--uni-bg-primary)', border: '1px solid var(--uni-border)', borderRadius: '8px', padding: '0.85rem', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  stationTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  codeBadge: { fontSize: '0.65rem', fontWeight: 'bold', backgroundColor: 'var(--uni-bg-card)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: 'var(--uni-orange)', fontFamily: 'monospace' },
  statusBadge: { fontSize: '0.55rem', fontWeight: 'bold', padding: '0.15rem 0.4rem', borderRadius: '4px', fontFamily: 'monospace' },
  stationName: { fontSize: '0.8rem', fontWeight: 600, color: 'var(--uni-text-main)', height: '2.4em' },
  stationFooter: { display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--uni-text-muted)', borderTop: '1px solid var(--uni-border)', paddingTop: '0.4rem' }
};