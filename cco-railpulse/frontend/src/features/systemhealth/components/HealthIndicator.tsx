import React from 'react';
// Caso o seu path de import use '../' em vez de '@/', ajuste aqui
import { useSystemHealth } from '@/features/systemhealth/hooks/useSystemHealth';
import { Activity, WifiOff, Database } from 'lucide-react';

export const HealthIndicator: React.FC = () => {
  const { health, isOffline } = useSystemHealth();

  // -----------------------------------------------------
  // ESTADO CRÍTICO: Falha de comunicação ou degradação SIL
  // -----------------------------------------------------
  if (isOffline || health.status === 'degraded') {
    return (
      <div
        className="font-mono"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: 'var(--sp-cptm)',
          backgroundColor: 'rgba(227, 6, 19, 0.1)',
          padding: '0.4rem 1rem',
          borderRadius: '4px',
          border: '1px solid rgba(227, 6, 19, 0.4)',
          boxShadow: '0 0 15px rgba(227, 6, 19, 0.2)',
          fontSize: '0.65rem',
          fontWeight: '900',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          // Reaproveitando a animação de pulso do nosso CSS global
          animation: 'pulse-led 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
        }}
      >
        <WifiOff size={16} />
        <span>LINK DATA CENTER: INTERROMPIDO</span>
      </div>
    );
  }

  // -----------------------------------------------------
  // ESTADO NOMINAL: Operação em conformidade técnica
  // -----------------------------------------------------
  return (
    <div
      className="font-mono"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-panel-hover)',
        padding: '0.4rem 1rem',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        fontSize: '0.65rem'
      }}
    >
      {/* Bloco 1: Status do Node (ViaMobilidade Green) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Activity size={14} style={{ color: 'var(--sp-vm)', filter: 'drop-shadow(0 0 3px var(--sp-vm))' }} />
        <span style={{ fontWeight: '900', color: 'var(--text-main)', letterSpacing: '0.05em' }}>
          NODE VITAL: NOMINAL
        </span>
      </div>
      
      {/* Divisor Vertical Interno */}
      <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-color)' }}></div>
      
      {/* Bloco 2: Status do Banco de Dados (Metrô Blue) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Database size={12} style={{ color: 'var(--sp-metro)' }} />
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          DB: <span style={{ color: 'var(--text-main)', fontWeight: 'bold' }}>{health.database.toUpperCase()}</span>
        </span>
      </div>
    </div>
  );
};