// frontend/src/components/dashboard/TrackSchematic.tsx
import React, { useState, useEffect, useCallback } from 'react';
import type { Station } from '../../types';

interface TrackSchematicProps {
  stations: Station[];
  selectedStation: Station;
  onSelectStation: (station: Station) => void;
}

interface SimulatedTrain {
  id: string;
  stationIndex: number;
  speed: number;
}

const MIN_SPEED = 55;
const SPEED_JITTER = 18;
const TRAIN_TICK_MS = 4000;

export const TrackSchematic: React.FC<TrackSchematicProps> = ({
  stations,
  selectedStation,
  onSelectStation,
}) => {
  const [activeTrains, setActiveTrains] = useState<SimulatedTrain[]>([
    { id: 'T-01', stationIndex: 0, speed: 64 },
    { id: 'T-04', stationIndex: 3, speed: 60 },
    { id: 'T-08', stationIndex: 7, speed: 52 },
    { id: 'T-12', stationIndex: 11, speed: 67 },
  ]);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  useEffect(() => {
    if (stations.length === 0) return;
    const interval = setInterval(() => {
      setActiveTrains(prev =>
        prev.map(train => ({
          ...train,
          stationIndex: (train.stationIndex + 1) % stations.length,
          speed: Math.floor(MIN_SPEED + Math.random() * SPEED_JITTER),
        }))
      );
    }, TRAIN_TICK_MS);

    return () => clearInterval(interval);
  }, [stations.length]);

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
    <section style={styles.container}>
      <div style={styles.header}>
        <div style={styles.titleGroup}>
          <span style={styles.sectionTitle}>ATS / Malha Tronco — Linha 6-Laranja (Linha Uni)</span>
          <span style={styles.liveDot} />
          <span style={styles.liveText}>Sincronizado</span>
        </div>
        <span style={styles.subText}>Brasilândia ➔ São Joaquim • Arraste horizontalmente para inspecionar a via</span>
      </div>

      <div style={styles.scrollContainer}>
        <div style={styles.trackLineGrid}>
          {stations.map((st, idx) => {
            const isSelected = selectedStation.code === st.code;
            const isCritical = st.status === 'CRÍTICO';
            const isWarning = st.status === 'ATENÇÃO';
            const isHovered = hoveredCode === st.code;
            const statusColor = isCritical ? 'var(--uni-danger)' : isWarning ? 'var(--uni-warning)' : 'var(--uni-border)';
            const trainsAtThisStation = activeTrains.filter(t => t.stationIndex === idx);

            return (
              <div
                key={st.code}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`Estação ${st.name}, status ${st.status}`}
                style={{
                  ...styles.stationColumn,
                  transform: isHovered ? 'translateY(-2px)' : 'none',
                }}
                onClick={() => onSelectStation(st)}
                onKeyDown={(e) => handleKeyDown(e, st)}
                onMouseEnter={() => setHoveredCode(st.code)}
                onMouseLeave={() => setHoveredCode(null)}
              >
                {/* Slot superior para Trens em Trânsito */}
                <div style={styles.trainSlot}>
                  {trainsAtThisStation.map(train => (
                    <div key={train.id} style={styles.trainBadge} title={`Velocidade: ${train.speed} km/h`}>
                      <span style={styles.trainId}>🚆 {train.id}</span>
                      <span style={styles.trainSpeed}>{train.speed} km/h</span>
                    </div>
                  ))}
                </div>

                {/* Linha do Trilho com o Nó Central */}
                <div style={styles.railTrackSegment}>
                  <div style={styles.railBarHorizontal} />
                  <div
                    style={{
                      ...styles.nodeDot,
                      borderColor: isSelected ? 'var(--uni-orange)' : statusColor,
                      backgroundColor: isSelected
                        ? 'var(--uni-orange)'
                        : isCritical || isWarning
                        ? statusColor
                        : 'var(--uni-bg-card)',
                      boxShadow: isSelected
                        ? '0 0 14px var(--uni-orange-glow)'
                        : isCritical
                        ? '0 0 8px rgba(255, 0, 0, 0.4)'
                        : isHovered
                        ? '0 0 8px rgba(255, 102, 0, 0.25)'
                        : 'none',
                    }}
                  >
                    <span style={styles.nodeIndex}>{idx + 1}</span>
                  </div>
                </div>

                {/* Nome da Estação alinhado */}
                <span
                  style={{
                    ...styles.stationName,
                    color: isSelected ? '#ffffff' : 'var(--uni-text-muted)',
                    fontWeight: isSelected ? 700 : 500,
                    backgroundColor: isSelected
                      ? 'rgba(255, 102, 0, 0.15)'
                      : isHovered
                      ? 'rgba(255, 102, 0, 0.06)'
                      : 'transparent',
                    borderColor: isSelected ? 'rgba(255, 102, 0, 0.4)' : 'transparent',
                  }}
                >
                  {st.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: 'var(--uni-bg-secondary)',
    borderBottom: '1px solid var(--uni-border)',
    padding: '1.25rem 1.5rem',
    fontFamily: 'var(--uni-font)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  titleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
  },
  sectionTitle: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--uni-text-muted)',
  },
  liveDot: {
    width: '7px',
    height: '7px',
    backgroundColor: 'var(--uni-success)',
    borderRadius: '50%',
    boxShadow: '0 0 6px var(--uni-success)',
    animation: 'railpulse-pulse 2s ease-in-out infinite',
  },
  liveText: {
    fontSize: '0.65rem',
    color: 'var(--uni-success)',
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  subText: {
    fontSize: '0.7rem',
    color: 'var(--uni-text-muted)',
  },
  scrollContainer: {
    overflowX: 'auto',
    paddingBottom: '0.5rem',
    scrollbarWidth: 'thin',
    scrollbarColor: 'var(--uni-border) transparent',
  },
  trackLineGrid: {
    display: 'flex',
    gap: '1.5rem',
    minWidth: 'max-content',
    padding: '0.5rem 0.5rem',
  },
  stationColumn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '130px',
    cursor: 'pointer',
    gap: '0.5rem',
    transition: 'transform 0.2s ease',
    borderRadius: '8px',
  },
  trainSlot: {
    height: '34px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: '100%',
  },
  trainBadge: {
    backgroundColor: 'var(--uni-bg-card)',
    border: '1px solid var(--uni-orange)',
    borderRadius: '6px',
    padding: '0.15rem 0.4rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.3rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  },
  trainId: {
    fontSize: '0.6rem',
    fontWeight: 'bold',
    color: 'var(--uni-orange)',
    fontFamily: 'monospace',
  },
  trainSpeed: {
    fontSize: '0.55rem',
    color: 'var(--uni-text-muted)',
    fontFamily: 'monospace',
  },
  railTrackSegment: {
    position: 'relative',
    width: '100%',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railBarHorizontal: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: '4px',
    backgroundColor: 'var(--uni-bg-primary)',
    borderTop: '1px solid var(--uni-border)',
    borderBottom: '1px solid var(--uni-border)',
    transform: 'translateY(-50%)',
    zIndex: 1,
  },
  nodeDot: {
    position: 'relative',
    zIndex: 2,
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'box-shadow 0.2s, background-color 0.2s',
  },
  nodeIndex: {
    fontSize: '0.6rem',
    fontWeight: 'bold',
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  stationName: {
    fontSize: '0.65rem',
    textAlign: 'center',
    lineHeight: '1.25',
    height: '2.6em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.15rem 0.35rem',
    borderRadius: '6px',
    border: '1px solid transparent',
    width: '100%',
    transition: 'all 0.2s',
  },
};