import { useAlerts } from '../features/alerts/hooks/useAlerts';
import { Card } from '../components/common/Card';
import { StatusBadge } from '../components/common/StatusBadge';
import { ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';

export const Alerts = () => {
  // Adicionamos o isLoading que criamos no hook para evitar o erro de ordem
  const { alerts, acknowledgeAlert, isLoading } = useAlerts();
  
  // Ajustado para alert_id conforme o DTO
  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'EMERGENCY').length;
  const isCritical = criticalCount > 0;

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header de Segurança SIL 4 */}
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ShieldAlert color={isCritical ? '#FF4C4C' : '#007A5E'} size={32} />
            Fila de Incidentes <span style={{ color: 'var(--text-muted)', fontSize: '1rem', marginLeft: '0.5rem' }} className="font-mono">| EVENT_LOG_INT</span>
          </h2>
          <p className="page-subtitle font-mono mt-1">PROTOCOLO DE SEGURANÇA INTEGRADO - LINHA 2 VERDE</p>
        </div>
        
        <StatusBadge 
          status={isCritical ? 'critical' : 'healthy'} 
          label={isCritical ? `${criticalCount} ALARMES CRÍTICOS` : 'MALHA SEGURA'} 
          pulse={isCritical}
        />
      </div>

      {/* Grid de Monitoramento de Alarmes */}
      <div style={{ flex: 1, minHeight: 0, marginTop: '1.5rem' }}>
        <Card accent="cptm" title="Eventos Aguardando Acknowledgment (ACK)">
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
            <span className="font-mono" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>TOTAL_QUEUE: {alerts.length}</span>
            <span style={{ width: '1px', background: 'var(--border-color)' }}></span>
            <span className="font-mono" style={{ color: '#FF4C4C', fontSize: '0.65rem', fontWeight: 'bold' }}>UNRESOLVED: {criticalCount}</span>
          </div>

          <div className="custom-scrollbar" style={{ overflowY: 'auto', flex: 1 }}>
            {isLoading ? (
              <div style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <Loader2 size={32} className="animate-spin" color="var(--text-muted)" />
                <p className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SINCRONIZANDO BANCO DE DADOS...</p>
              </div>
            ) : alerts.length === 0 ? (
              <div style={{ height: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.3, gap: '1rem' }}>
                <CheckCircle2 size={48} color="#007A5E" />
                <p className="font-mono" style={{ fontSize: '0.85rem', letterSpacing: '0.1em' }}>NENHUM INCIDENTE NA FILA</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Severidade</th>
                    <th>Composição</th>
                    <th>Mensagem do Evento</th>
                    <th style={{ textAlign: 'right' }}>Ação Operacional</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => (
                    <tr key={alert.alert_id} className="data-table-row">
                      <td className="font-mono" style={{ color: 'var(--text-muted)' }}>
                        {new Date(alert.created_at).toLocaleTimeString()}
                      </td>
                      <td>
                        <span className="font-mono" style={{ 
                          fontSize: '0.65rem', fontWeight: 'bold', padding: '0.15rem 0.5rem', borderRadius: '4px',
                          background: alert.severity === 'EMERGENCY' ? 'rgba(255, 76, 76, 0.1)' : 'rgba(230, 126, 34, 0.1)',
                          color: alert.severity === 'EMERGENCY' ? '#FF4C4C' : '#E67E22',
                          border: `1px solid ${alert.severity === 'EMERGENCY' ? '#FF4C4C' : '#E67E22'}`
                        }}>
                          {alert.severity}
                        </span>
                      </td>
                      <td style={{ fontWeight: 'bold', textTransform: 'uppercase', fontFamily: 'monospace' }}>
                        {alert.fleet_code}-{alert.train_id}
                      </td>
                      <td style={{ color: '#E6CCB2', fontStyle: 'italic' }}>
                        "{alert.message}"
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          onClick={() => acknowledgeAlert(alert.alert_id)} 
                          className="btn-ack"
                          style={{
                            backgroundColor: 'transparent',
                            border: '1px solid #D4A373',
                            color: '#D4A373',
                            padding: '4px 12px',
                            borderRadius: '4px',
                            fontSize: '0.65rem',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
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