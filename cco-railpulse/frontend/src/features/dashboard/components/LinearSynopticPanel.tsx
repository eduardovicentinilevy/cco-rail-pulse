import React from 'react';
import type { TelemetryDTO } from '../types';

interface LinearSynopticPanelProps {
  trains: TelemetryDTO[];
}

const LINE_2_STATIONS = [
  { id: 'VPT', name: 'Vila Prudente', lng: -46.5822 },
  { id: 'TMD', name: 'Tamanduateí', lng: -46.5894 },
  { id: 'SAC', name: 'Sacomã', lng: -46.6026 },
  { id: 'AIP', name: 'Alto do Ipiranga', lng: -46.6125 },
  { id: 'IMG', name: 'Santos-Imigrantes', lng: -46.6200 },
  { id: 'CKL', name: 'Chácara Klabin', lng: -46.6300 },
  { id: 'ANR', name: 'Ana Rosa', lng: -46.6383 },
  { id: 'PSO', name: 'Paraíso', lng: -46.6397 },
  { id: 'BGD', name: 'Brigadeiro', lng: -46.6496 },
  { id: 'TRI', name: 'Trianon-Masp', lng: -46.6540 },
  { id: 'CNS', name: 'Consolação', lng: -46.6620 },
  { id: 'CLI', name: 'Clínicas', lng: -46.6710 },
  { id: 'SUM', name: 'Sumaré', lng: -46.6775 },
  { id: 'VMD', name: 'Vila Madalena', lng: -46.6898 }
];

// Pegamos os extremos reais para normalização
const LNG_VALUES = LINE_2_STATIONS.map(s => s.lng);
const MAX_LNG = Math.max(...LNG_VALUES); // Vila Prudente (Leste)
const MIN_LNG = Math.min(...LNG_VALUES); // Vila Madalena (Oeste)
const RANGE = MAX_LNG - MIN_LNG;

export const LinearSynopticPanel: React.FC<LinearSynopticPanelProps> = ({ trains }) => {
  
  /**
   * CORREÇÃO: Função de Normalização Linear de 0 a 100
   * Mapeia qualquer Longitude dentro do range da linha 2
   */
  const getPositionPercent = (currentLng: number) => {
    // 1. Clamp: Garante que o valor não fuja do range 0-100 mesmo com drift de GPS
    const clampedLng = Math.max(MIN_LNG, Math.min(MAX_LNG, currentLng));
    
    // 2. Cálculo de Progresso (Invertido para que VPT fique na esquerda e VMD na direita)
    // Se quiser VMD na esquerda, use: (clampedLng - MIN_LNG) / RANGE
    const progress = (MAX_LNG - clampedLng) / RANGE; 
    
    return progress * 100;
  };

  return (
    <div className="synoptic-wrapper" style={styles.wrapper}>
      
      <div className="synoptic-track" style={styles.track}>
        {LINE_2_STATIONS.map((station, index) => {
          const posPercent = getPositionPercent(station.lng);
          const isOdd = index % 2 !== 0;
          
          return (
            <div key={station.id} style={{ position: 'absolute', left: `${posPercent}%`, top: 0, height: '100%' }}>
              <div style={styles.stationTick} />
              <div style={{ ...styles.stationLabel, top: isOdd ? '26px' : '12px' }}>
                {station.id}
              </div>
            </div>
          );
        })}
      </div>
      
      {trains.filter(t => t.fleet_code === 'I').map(train => {
        const isAlert = train.doors_open;
        const isMoving = train.speed_kmh > 0;
        const position = getPositionPercent(train.longitude);

        return (
          <div 
            key={train.train_id}
            className="train-wrapper"
            style={{ 
              ...styles.trainWrapper, 
              left: `${position}%`,
              display: (position >= 0 && position <= 100) ? 'flex' : 'none' // Hard-stop visual
            }}
          >
            <span style={styles.trainHeader}>FROTA_I</span>
            <div style={{ ...styles.trainBody, borderColor: isAlert ? 'var(--sp-vm)' : '#8B3A2B' }}>
              <div style={styles.trainId}>TR {train.train_id}</div>
              <div style={{ ...styles.trainLed, backgroundColor: isMoving ? '#007A5E' : '#4A2511' }} />
            </div>
            <div style={{ ...styles.trainConnector, backgroundColor: isAlert ? 'var(--sp-vm)' : '#8B3A2B' }} />
            <div style={styles.telemetryBox}>
              <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: isMoving ? '#007A5E' : '#8c7b70' }}>
                {train.speed_kmh} <span style={{ fontSize: '0.45rem', opacity: 0.6 }}>KM/H</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const styles = {
  wrapper: {
    position: 'relative' as const,
    width: '100%',
    height: '220px',
    backgroundColor: '#16110D', 
    border: '1px solid #3A2318', 
    borderRadius: '8px',
    padding: '2rem 2rem', // Aumentado padding lateral para respiro das labels das pontas
    overflow: 'hidden',
    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)'
  },
  track: {
    position: 'absolute' as const,
    top: '50%',
    left: '2rem',
    right: '2rem',
    height: '4px',
    backgroundColor: '#007A5E', 
    transform: 'translateY(-50%)',
    boxShadow: '0 0 10px rgba(0, 122, 94, 0.4)'
  },
  stationTick: {
    width: '4px',
    height: '16px',
    backgroundColor: '#007A5E',
    transform: 'translate(-50%, -6px)',
    borderRadius: '2px'
  },
  stationLabel: {
    position: 'absolute' as const,
    transform: 'translateX(-50%)',
    fontFamily: 'monospace',
    fontSize: '0.55rem',
    color: '#8c7b70',
    fontWeight: 'bold',
    letterSpacing: '1px'
  },
  trainWrapper: {
    position: 'absolute' as const,
    top: '50%',
    transform: 'translate(-50%, -110%)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    transition: 'left 1s linear' 
  },
  trainHeader: {
    fontFamily: 'monospace',
    fontSize: '0.5rem',
    color: '#D4A373', 
    marginBottom: '4px',
    fontWeight: 'bold'
  },
  trainBody: {
    backgroundColor: '#1E140F',
    border: '2px solid',
    borderRadius: '4px',
    padding: '4px 8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 10,
    boxShadow: '0 4px 6px rgba(0,0,0,0.6)'
  },
  trainId: {
    fontFamily: 'monospace',
    fontSize: '0.75rem',
    color: '#E6CCB2',
    fontWeight: 'bold'
  },
  trainLed: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    boxShadow: '0 0 4px rgba(0,0,0,0.5)'
  },
  trainConnector: {
    width: '2px',
    height: '12px'
  },
  telemetryBox: {
    marginTop: '4px',
    backgroundColor: 'rgba(22, 17, 13, 0.8)',
    border: '1px solid #3A2318',
    padding: '2px 6px',
    borderRadius: '4px'
  }
};