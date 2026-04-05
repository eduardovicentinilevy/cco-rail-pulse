import { useAlerts } from '../features/alerts/hooks/useAlerts';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';

export const Alerts = () => {
  const { alerts, acknowledgeAlert } = useAlerts();
  
  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;
  const isCritical = criticalCount > 0;

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header de Segurança SIL 4 */}
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ShieldAlert color={isCritical ? 'var(--sp-cptm)' : 'var(--sp-vm)'} size={32} />
            Fila de Incidentes <span style={{ color: 'var(--text-muted)', fontSize: '1rem', marginLeft: '0.5rem' }} className="font-mono">| EVENT_LOG_INT</span>
          </h2>
          <p className="page-subtitle font-mono mt-1">PROTOCOLO DE SEGURANÇA INTEGRADO - CPTM/METRÔ</p>
        </div>
        
        <StatusBadge 
          status={isCritical ? 'critical' : 'healthy'} 
          label={isCritical ? `${criticalCount} ALARMES CRÍTICOS` : 'MALHA SEGURA'} 
          pulse={isCritical}
        />
      </div>

      {/* Grid de Monitoramento de Alarmes */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Card accent="cptm" title="Eventos Aguardando Acknowledgment (ACK)">
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
            <span className="font-mono" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>TOTAL_QUEUE: {alerts.length}</span>
            <span style={{ width: '1px', background: 'var(--border-color)' }}></span>
            <span className="font-mono" style={{ color: 'var(--sp-cptm)', fontSize: '0.65rem', fontWeight: 'bold' }}>UNRESOLVED: {criticalCount}</span>
          </div>

          <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1 }}>
            {alerts.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3, gap: '1rem' }}>
                <CheckCircle2 size={48} color="var(--sp-vm)" />
                <p className="font-mono" style={{ fontSize: '0.85rem', letterSpacing: '0.1em' }}>NENHUM INCIDENTE NA FILA</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Severidade</th>
                    <th>Equipamento / Local</th>
                    <th>Mensagem do Evento</th>
                    <th style={{ textAlign: 'right' }}>Ação Operacional</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => (
                    <tr key={alert.id} className="data-table-row">
                      <td className="font-mono" style={{ color: 'var(--text-muted)' }}>
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </td>
                      <td>
                        <span className={`font-mono ${alert.severity === 'CRITICAL' ? 'text-highlight' : ''}`} style={{ 
                          fontSize: '0.65rem', fontWeight: 'bold', padding: '0.15rem 0.5rem', borderRadius: '4px',
                          background: alert.severity === 'CRITICAL' ? 'rgba(227, 6, 19, 0.1)' : 'rgba(255, 212, 0, 0.1)',
                          color: alert.severity === 'CRITICAL' ? 'var(--sp-cptm)' : 'var(--sp-v4)',
                          border: `1px solid ${alert.severity === 'CRITICAL' ? 'rgba(227, 6, 19, 0.3)' : 'rgba(255, 212, 0, 0.3)'}`
                        }}>
                          {alert.severity}
                        </span>
                      </td>
                      <td style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>
                        {alert.source || 'SINALIZAÇÃO_CBTC'}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        "{alert.message}"
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => acknowledgeAlert(alert.id)} className="btn-ack">
                          Confirmar (ACK)
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};