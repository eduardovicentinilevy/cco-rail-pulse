import React from 'react';
import { AlertDTO } from '../types';
import { AlertItem } from './AlertItem';
import { ShieldCheck } from 'lucide-react';

interface AlertListProps {
  alerts: AlertDTO[];
  onAck: (id: string) => void;
}

export const AlertList: React.FC<AlertListProps> = ({ alerts, onAck }) => {
  // Empty State (Malha Segura)
  if (alerts.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '3rem 1rem', backgroundColor: 'rgba(0,0,0,0.2)',
        border: '1px dashed var(--border-color)', borderRadius: '8px',
        textAlign: 'center'
      }}>
        <ShieldCheck size={48} style={{ color: 'var(--sp-vm)', marginBottom: '1rem', opacity: 0.8 }} />
        <h3 className="font-mono" style={{ fontSize: '0.85rem', fontWeight: '900', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '0.5rem' }}>
          Nenhum evento crítico ativo
        </h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          A malha metroferroviária opera sob normalidade.
        </p>
      </div>
    );
  }

  // Lista de Eventos Ativos
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {alerts.map(alert => (
        <AlertItem key={alert.alert_id} alert={alert} onAck={onAck} />
      ))}
    </div>
  );
};