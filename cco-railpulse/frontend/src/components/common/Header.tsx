// Correção cirúrgica: ../../ para voltar até a pasta src/
import { HealthIndicator } from '../../features/systemhealth/components/HealthIndicator';

export const Header = () => {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', height: '100%' }}>
      
      {/* ESQUERDA: Área de Status */}
      <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <div className="font-mono" style={{ 
          fontSize: '0.7rem', 
          fontWeight: '900', 
          color: 'var(--text-muted)', 
          letterSpacing: '0.25em', 
          textTransform: 'uppercase' 
        }}>
          System Status
        </div>
        
        {/* Divisor Vertical Elegante */}
        <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border-color)' }}></div>
        
        {/* Container do Indicador para garantir alinhamento interno */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <HealthIndicator />
        </div>
      </div>

      {/* DIREITA: Painel do Operador */}
      <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        
        <div className="user-info" style={{ textAlign: 'right' }}>
          <div className="user-name" style={{ fontSize: '0.85rem', fontWeight: '900', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            EDUARDO LEVY
          </div>
          <div className="user-role font-mono" style={{ color: 'var(--sp-v4)', fontSize: '0.6rem', fontWeight: 'bold', letterSpacing: '0.1em', marginTop: '2px' }}>
            CCO SUPERVISOR | SIL 4
          </div>
        </div>
        
        {/* Divisor Vertical Elegante */}
        <div style={{ height: '32px', width: '1px', backgroundColor: 'var(--border-color)' }}></div>
        
        {/* Avatar Estilo Badge */}
        <div className="user-avatar font-mono" title="Credencial Nível 4">
          EL
        </div>

      </div>

    </div>
  );
};