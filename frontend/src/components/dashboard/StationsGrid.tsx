// frontend/src/components/dashboard/StationsGrid.tsx
import React, { useState, useCallback } from 'react';
import type { Station } from '../../types';

interface StationsGridProps {
  stations: Station[];
  selectedStationCode: string;
  onSelectStation: (station: Station) => void;
}

export const StationsGrid: React.FC<StationsGridProps> = ({ stations, selectedStationCode, onSelectStation }) => {
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, station: Station) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelectStation(station);
      }
    },
    [onSelectStation]
  );

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h3 style={styles.title}>Status Operacional das Estações (Linha 6)</h3>
        <span style={styles.subtitle}>Clique em uma estação para inspecionar parâmetros</span>
      </div>

      {stations.length === 0 ? (
        <p style={styles.emptyState}>Nenhuma estação disponível no momento.</p>
      ) : (
        <div style={styles.grid}>
          {stations.map(st => {
            const isSelected = st.code === selectedStationCode;
            const isCritical = st.status === 'CRÍTICO';
            const isWarning = st.status === 'ATENÇÃO';
            const isHovered = hoveredCode === st.code;
            const statusColor = isCritical ? 'var(--uni-danger)' : isWarning ? 'var(--uni-warning)' : 'var(--uni-success)';
            const statusBg = isCritical ? 'rgba(255, 0, 0, 0.15)' : isWarning ? 'rgba(255, 102, 0, 0.15)' : 'rgba(0, 255, 102, 0.12)';
            return (
              <div
                key={st.code}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`Estação ${st.name}, status ${st.status}`}
                onClick={() => onSelectStation(st)}
                onKeyDown={(e) => handleKeyDown(e, st)}
                onMouseEnter={() => setHoveredCode(st.code)}
                onMouseLeave={() => setHoveredCode(null)}
                style={{
                  ...styles.stationCard,
                  borderColor: isSelected ? 'var(--uni-orange)' : isCritical || isWarning ? statusColor : 'var(--uni-border)',
                  backgroundColor: isSelected ? 'rgba(255, 102, 0, 0.08)' : 'var(--uni-bg-primary)',
                  transform: isHovered && !isSelected ? 'translateY(-2px)' : 'none',
                  boxShadow: isHovered && !isSelected ? '0 6px 16px rgba(0, 0, 0, 0.35)' : 'none',
                }}
              >
                <div style={styles.stationTop}>
                  <span style={styles.codeBadge}>{st.code}</span>
                  <span style={{ ...styles.statusBadge, backgroundColor: statusBg, color: statusColor }}>
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
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  card: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '12px', padding: '1.25rem' },
  cardHeader: { marginBottom: '1rem' },
  title: { fontSize: '0.85rem', fontWeight: 700, color: 'var(--uni-text-main)' },
  subtitle: { fontSize: '0.7rem', color: 'var(--uni-text-muted)' },
  emptyState: { fontSize: '0.8rem', color: 'var(--uni-text-muted)', textAlign: 'center', padding: '1.5rem 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.85rem' },
  stationCard: {
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '8px',
    padding: '0.85rem',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s, border-color 0.2s',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  stationTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  codeBadge: { fontSize: '0.65rem', fontWeight: 'bold', backgroundColor: 'var(--uni-bg-card)', padding: '0.15rem 0.4rem', borderRadius: '4px', color: 'var(--uni-orange)', fontFamily: 'monospace' },
  statusBadge: { fontSize: '0.55rem', fontWeight: 'bold', padding: '0.15rem 0.4rem', borderRadius: '4px', fontFamily: 'monospace' },
  stationName: { fontSize: '0.8rem', fontWeight: 600, color: 'var(--uni-text-main)', height: '2.4em' },
  stationFooter: { display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--uni-text-muted)', borderTop: '1px solid var(--uni-border)', paddingTop: '0.4rem' },
};