// frontend/src/components/layout/Header.tsx
import React, { useState, useEffect } from 'react';
import type { OperatorSession } from '../../types';
import { UserProfileModal } from '../modals/UserProfileModal';

interface HeaderProps {
  session: OperatorSession;
  isConnected: boolean;
  onUpdateAvatar: (url: string) => void;
  onOpenAuditLogs: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ session, isConnected, onUpdateAvatar, onOpenAuditLogs, onLogout }) => {
  const [currentTime, setCurrentTime] = useState<string>(new Date().toLocaleTimeString());
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoBox}>L06-UNI</div>
          <div>
            <h1 style={styles.headerTitle}>RailPulse CCO — Linha 6 Laranja</h1>
            <p style={styles.headerSubtitle}>Centro de Controle Operacional • Supervisão ATS</p>
          </div>
        </div>
        
        <div style={styles.headerCenter}>
          <div style={styles.clockBox}>🕒 {currentTime}</div>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.telemetryBadge}>
            <span style={{ ...styles.pulseDot, backgroundColor: isConnected ? 'var(--uni-success)' : 'var(--uni-danger)' }} />
            <span>{isConnected ? 'Core Online' : 'Reconectando...'}</span>
          </div>
          
          <button onClick={onOpenAuditLogs} style={styles.auditButton}>Auditoria</button>

          <div style={styles.profileTrigger} onClick={() => setIsProfileModalOpen(true)} title="Gerenciar Perfil">
            <img 
              src={session.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'} 
              alt={session.operatorId} 
              style={styles.avatarImg}
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
              }}
            />
            <div style={styles.operatorInfoText}>
              <span style={styles.operatorName}>{session.operatorId}</span>
              <span style={styles.operatorRole}>{session.role}</span>
            </div>
          </div>

          <button onClick={onLogout} style={styles.logoutButton}>Sair</button>
        </div>
      </header>

      {isProfileModalOpen && (
        <UserProfileModal 
          session={session} 
          onUpdateAvatar={onUpdateAvatar} 
          onClose={() => setIsProfileModalOpen(false)} 
        />
      )}
    </>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  header: { backgroundColor: 'var(--uni-bg-secondary)', borderBottom: '1px solid var(--uni-border)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--uni-font)' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '1rem' },
  logoBox: { backgroundColor: 'var(--uni-orange)', color: '#fff', fontWeight: 900, padding: '0.35rem 0.65rem', borderRadius: '6px', fontSize: '0.85rem' },
  headerTitle: { fontSize: '0.9rem', fontWeight: 700, color: 'var(--uni-text-main)' },
  headerSubtitle: { fontSize: '0.7rem', color: 'var(--uni-text-muted)', marginTop: '0.1rem' },
  headerCenter: { display: 'flex', alignItems: 'center' },
  clockBox: { backgroundColor: 'var(--uni-bg-card)', border: '1px solid var(--uni-border)', padding: '0.35rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--uni-orange)', fontWeight: 'bold', fontFamily: 'monospace' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  telemetryBadge: { display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'var(--uni-bg-card)', padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid var(--uni-border)', fontSize: '0.75rem', color: 'var(--uni-text-main)' },
  pulseDot: { width: '8px', height: '8px', borderRadius: '50%', boxShadow: '0 0 8px currentColor' },
  auditButton: { backgroundColor: 'var(--uni-bg-card)', border: '1px solid var(--uni-border)', color: 'var(--uni-text-main)', fontSize: '0.75rem', fontWeight: 600, padding: '0.4rem 0.85rem', borderRadius: '6px', cursor: 'pointer' },
  profileTrigger: { display: 'flex', alignItems: 'center', gap: '0.6rem', backgroundColor: 'var(--uni-bg-primary)', border: '1px solid var(--uni-border)', padding: '0.25rem 0.6rem 0.25rem 0.25rem', borderRadius: '20px', cursor: 'pointer' },
  avatarImg: { width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--uni-orange)' },
  operatorInfoText: { display: 'flex', flexDirection: 'column', textAlign: 'left' },
  operatorName: { fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--uni-text-main)', fontFamily: 'monospace' },
  operatorRole: { fontSize: '0.55rem', color: 'var(--uni-text-muted)' },
  logoutButton: { backgroundColor: 'var(--uni-border)', border: 'none', color: 'var(--uni-text-main)', fontSize: '0.75rem', fontWeight: 600, padding: '0.4rem 0.85rem', borderRadius: '6px', cursor: 'pointer' },
};