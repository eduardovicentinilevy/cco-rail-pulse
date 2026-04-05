import React from 'react';
import type { TelemetryDTO } from '../types';

interface TelemetryCardProps {
  train: TelemetryDTO;
  onClick?: (train: TelemetryDTO) => void;
}

export const TelemetryCard: React.FC<TelemetryCardProps> = ({ train, onClick }) => {
  const isMoving = train.speed_kmh > 0;
  
  // Lógica visual dinâmica baseada no domínio
  const speedColor = isMoving ? 'var(--sp-v4)' : 'var(--text-muted)';
  const doorColor = train.doors_open ? 'var(--sp-cptm)' : 'var(--sp-vm)';

  return (
    <div 
      className="telemetry-item font-mono"
      onClick={() => onClick && onClick(train)}
      style={{ 
        cursor: onClick ? 'pointer' : 'default',
        // Um indicador sutil na borda se o trem estiver em movimento
        borderLeft: `3px solid ${isMoving ? 'var(--sp-metro)' : 'transparent'}`
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
         <span className="telemetry-id">TR {train.train_id}</span>
         <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
           FROTA {train.fleet_code || 'J'}
         </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
         <span className="telemetry-speed" style={{ color: speedColor }}>
           {train.speed_kmh} <span style={{ fontSize: '0.6rem', opacity: 0.7 }}>KM/H</span>
         </span>
         <span style={{ fontSize: '0.55rem', color: doorColor, fontWeight: '900', letterSpacing: '0.05em' }}>
           {train.doors_open ? 'PORTAS ABERTAS' : 'PORTAS FECHADAS'}
         </span>
      </div>
    </div>
  );
};