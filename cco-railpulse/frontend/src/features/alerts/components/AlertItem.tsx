import React from 'react';
import { AlertDTO } from '../types';
import { Button } from '../../../components/common/Button';
import { AlertTriangle, Clock } from 'lucide-react';

interface AlertItemProps {
  alert: AlertDTO;
  onAck: (id: string) => void;
}

export const AlertItem: React.FC<AlertItemProps> = ({ alert, onAck }) => {
  const isCritical = alert.severity === 'CRITICAL';
  
  // Mapeamento dinâmico ancorado no nosso Design System
  const severityColor = isCritical ? 'var(--sp-cptm)' : 'var(--sp-v4)';
  const severityBg = isCritical ? 'rgba(227, 6, 19, 0.1)' : 'rgba(255, 212, 0, 0.1)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '1rem', background: 'var(--bg-panel-hover)',
      border: '1px solid var(--border-color)',
      borderLeft: `4px solid ${severityColor}`, /* Identificador Visual de Borda */
      borderRadius: '6px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
    }}>
      
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        {/* Ícone com Halo Brilhante */}
        <div style={{ 
          padding: '0.5rem', borderRadius: '50%', background: severityBg, 
          color: severityColor, display: 'flex', boxShadow: `0 0 10px ${severityBg}`
        }}>
          <AlertTriangle size={20} />
        </div>
        
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '4px' }}>
            <h4 className="font-mono" style={{ color: 'var(--text-main)', fontWeight: '900', fontSize: '0.85rem', margin: 0, textTransform: 'uppercase' }}>
              TREM {alert.train_id} <span style={{ opacity: 0.5 }}>(FROTA {alert.fleet_code})</span>
            </h4>
            {/* Badge de Severidade */}
            <span className="font-mono" style={{
              fontSize: '0.55rem', padding: '0.15rem 0.4rem', borderRadius: '4px',
              fontWeight: '900', backgroundColor: severityColor, color: isCritical ? '#fff' : '#000',
              letterSpacing: '0.1em'
            }}>
              {alert.severity}
            </span>
          </div>
          
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: 0, fontStyle: 'italic' }}>
            "{alert.message}"
          </p>
          
          <div className="font-mono" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
            <Clock size={12} />
            <span>{new Date(alert.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>
      
      {/* Botão Global Reaproveitado */}
      <Button variant="ghost" onClick={() => onAck(alert.alert_id)}>
        Confirmar (ACK)
      </Button>
      
    </div>
  );
};