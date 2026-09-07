// frontend/src/components/layout/Header.tsx
import React, { useState, useEffect } from 'react';
import type { OperatorSession } from '../../types';
import { UserProfileModal } from '../modals/UserProfileModal';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

interface HeaderProps {
  session: OperatorSession;
  connectionStatus: ConnectionStatus;
  shiftStartedAt: number;
  onUpdateAvatar: (url: string) => void;
  onOpenAuditLogs: () => void;
  onLogout: () => void;
}

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Conectando…',
  online: 'Core Online',
  offline: 'Core Offline',
};

const CONNECTION_COLOR: Record<ConnectionStatus, string> = {
  connecting: 'var(--uni-warning)',
  online: 'var(--uni-success)',
  offline: 'var(--uni-danger)',
};

const useClock = () => {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('pt-BR'));
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString('pt-BR')), 1000);
    return () => clearInterval(timer);
  }, []);
  return time;
};

const useShiftElapsed = (startedAt: number) => {
  const [elapsed, setElapsed] = useState('00:00:00');
  useEffect(() => {
    const format = () => {
      const totalSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      const s = String(totalSeconds % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };
    format();
    const timer = setInterval(format, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return elapsed;
};

export const Header: React.FC<HeaderProps> = ({
  session,
  connectionStatus,
  shiftStartedAt,
  onUpdateAvatar,
  onOpenAuditLogs,
  onLogout,
}) => {
  const currentTime = useClock();
  const shiftElapsed = useShiftElapsed(shiftStartedAt);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const connectionColor = CONNECTION_COLOR[connectionStatus];

  return (
    <>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoBox}>L06-UNI</div>
          <div>
            <h1 style={styles.headerTitle}>RailPulse CCO — Linha 6 Laranja</h1>
            <p style={styles.headerSubtitle}>Centro de Controle Operacional • Supervisão ATS &amp; SCADA</p>
          </div>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.shiftBox}>
            ⏱️ Turno: <strong style={styles.mono}>{shiftElapsed}</strong>
          </div>
          <div style={styles.clockBox}>🕒 {currentTime}</div>

          <div
            style={{
              ...styles.telemetryBadge,
              borderColor: connectionColor,
              color: connectionColor,
              backgroundColor: `${connectionColor}1A`,
            }}
          >
            <span style={{ ...styles.pulseDot, backgroundColor: connectionColor, boxShadow: `0 0 8px ${connectionColor}` }} />
            {CONNECTION_LABEL[connectionStatus]}
          </div>

          <button onClick={onOpenAuditLogs} style={styles.auditButton}>📋 Auditoria</button>

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
              <span style={styles.operatorName}>{session.name || session.operatorId}</span>
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
  header: {
    backgroundColor: 'var(--uni-bg-secondary)',
    borderBottom: '1px solid var(--uni-border)',
    padding: '0.85rem 1.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'var(--uni-font)',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '1rem' },
  logoBox: {
    backgroundColor: 'var(--uni-orange)',
    color: '#fff',
    fontWeight: 900,
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.85rem',
    boxShadow: '0 0 16px var(--uni-orange-glow)',
  },
  headerTitle: { fontSize: '1.05rem', fontWeight: 700, color: 'var(--uni-text-main)', margin: 0 },
  headerSubtitle: { fontSize: '0.72rem', color: 'var(--uni-text-muted)', margin: 0, marginTop: '0.1rem' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' },
  mono: { fontFamily: 'monospace' },
  shiftBox: {
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-border)',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    color: 'var(--uni-text-muted)',
  },
  clockBox: {
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-border)',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontFamily: 'monospace',
    color: 'var(--uni-text-main)',
  },
  telemetryBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    border: '1px solid',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  pulseDot: { width: '7px', height: '7px', borderRadius: '50%', animation: 'railpulse-pulse 2s ease-in-out infinite' },
  auditButton: {
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-border)',
    color: 'var(--uni-text-main)',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '0.4rem 0.85rem',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },
  profileTrigger: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    backgroundColor: 'var(--uni-bg-primary)',
    border: '1px solid var(--uni-border)',
    padding: '0.25rem 0.9rem 0.25rem 0.25rem',
    borderRadius: '20px',
    cursor: 'pointer',
    transition: 'border-color 0.15s',
  },
  avatarImg: { width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--uni-orange)' },
  operatorInfoText: { display: 'flex', flexDirection: 'column', textAlign: 'left' },
  operatorName: { fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--uni-text-main)' },
  operatorRole: { fontSize: '0.55rem', color: 'var(--uni-text-muted)', fontFamily: 'monospace' },
  logoutButton: {
    backgroundColor: 'transparent',
    border: '1px solid var(--uni-orange)',
    color: 'var(--uni-orange)',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '0.4rem 0.85rem',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};
