import { NavLink } from 'react-router-dom';
import { BarChart2, AlertTriangle, Map, ShieldAlert } from 'lucide-react';

export const Sidebar = () => {
  const navItems = [
    { to: '/dashboard', icon: <Map size={18} />, label: 'PAINEL SINÓTICO' },
    { to: '/analytics', icon: <BarChart2 size={18} />, label: 'HEADWAY & DWELL' },
    { to: '/alerts', icon: <AlertTriangle size={18} />, label: 'FILA DE INCIDENTES' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Brand / Logo Area - Transparência Forçada */}
      <div 
        style={{ 
          borderBottom: '1px solid var(--border-color)', 
          padding: '2rem 1.5rem', 
          display: 'flex', 
          alignItems: 'center',
          background: 'transparent'
        }}
      >
        <ShieldAlert 
          size={24} 
          style={{ 
            color: 'var(--sp-cptm)', 
            filter: 'drop-shadow(0 0 8px rgba(227,6,19,0.5))', 
            marginRight: '0.75rem' 
          }} 
        />
        <h1 
          className="font-mono" 
          style={{ 
            fontSize: '1.1rem', 
            fontWeight: '900',
            color: 'var(--text-main)',
            textTransform: 'uppercase', 
            letterSpacing: '0.15em',
            margin: 0,
            background: 'transparent'
          }}
        >
          RailPulse <span style={{ color: 'var(--sp-metro)', fontStyle: 'italic' }}>CCO</span>
        </h1>
      </div>
      
      {/* Navegação Técnica */}
      <nav className="nav-menu" style={{ padding: '1.5rem 1rem', flex: 1 }}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span style={{ marginRight: '1rem', display: 'flex', alignItems: 'center' }}>
              {item.icon}
            </span>
            <span style={{ fontWeight: '900', letterSpacing: '0.05em' }}>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      
      {/* Footer da Sidebar - Profundidade Adicionada */}
      <div 
        style={{ 
          padding: '1.5rem', 
          borderTop: '1px solid var(--border-color)', 
          textAlign: 'center',
          background: 'rgba(0,0,0,0.2)',
          borderBottomLeftRadius: '12px'
        }}
      >
        <div className="font-mono" style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>
          Terminal de Operação
        </div>
        <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--sp-vm)', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          SIL 4 | STATUS: NOMINAL
        </div>
      </div>

    </div>
  );
};