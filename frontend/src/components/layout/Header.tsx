// frontend/src/components/layout/Header.tsx
import React, { useState } from 'react';
import type { OperatorSession } from '../../types';
import { UserProfileModal } from '../modals/UserProfileModal';
import { useClock, useElapsed } from '../../hooks/useClock';
import { DEFAULT_AVATAR_URL } from '../../config/env';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

interface HeaderProps {
  session: OperatorSession;
  connectionStatus: ConnectionStatus;
  shiftStartedAt: number;
  criticalAlarms: number;
  onUpdateAvatar: (url: string) => Promise<void>;
  onOpenAuditLogs: () => void;
  onReconnect: () => void;
  onLogout: () => void;
}

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Conectando…',
  online: 'Core Online',
  offline: 'Core Offline',
};

export const Header: React.FC<HeaderProps> = ({
  session,
  connectionStatus,
  shiftStartedAt,
  criticalAlarms,
  onUpdateAvatar,
  onOpenAuditLogs,
  onReconnect,
  onLogout,
}) => {
  const currentTime = useClock();
  const shiftElapsed = useElapsed(shiftStartedAt);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <>
      <header className="rp-header">
        <div className="rp-header__brand">
          <span className="rp-header__logo">L06-UNI</span>
          <div className="truncate">
            <h1 className="rp-header__title">RailPulse CCO — Linha 6-Laranja</h1>
            <p className="rp-header__subtitle">Centro de Controle Operacional • Supervisão ATS &amp; SCADA</p>
          </div>
        </div>

        <div className="rp-header__actions">
          <span className="rp-header__stat rp-header__stat--optional">
            Turno <strong className="mono">{shiftElapsed}</strong>
          </span>
          <span className="rp-header__stat mono" aria-label="Hora atual">
            {currentTime}
          </span>

          <span className="rp-header__connection" data-status={connectionStatus} role="status">
            <span className="rp-dot rp-dot--pulse" aria-hidden="true" />
            {CONNECTION_LABEL[connectionStatus]}
          </span>

          {connectionStatus === 'offline' && (
            <button type="button" className="rp-btn rp-btn--outline" onClick={onReconnect}>
              Reconectar
            </button>
          )}

          <button type="button" className="rp-btn" onClick={onOpenAuditLogs}>
            Auditoria
            {criticalAlarms > 0 && (
              <span className="rp-badge" data-status="CRITICAL">
                {criticalAlarms}
              </span>
            )}
          </button>

          <button
            type="button"
            className="rp-profile"
            onClick={() => setIsProfileOpen(true)}
            aria-haspopup="dialog"
            title="Gerenciar perfil do operador"
          >
            <img
              className="rp-profile__avatar"
              src={session.avatarUrl || DEFAULT_AVATAR_URL}
              alt=""
              onError={(event) => {
                event.currentTarget.src = DEFAULT_AVATAR_URL;
              }}
            />
            <span className="rp-profile__text">
              <span className="rp-profile__name">{session.name || session.operatorId}</span>
              <span className="rp-profile__role">{session.role}</span>
            </span>
          </button>

          <button type="button" className="rp-btn rp-btn--outline" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      {isProfileOpen && (
        <UserProfileModal session={session} onUpdateAvatar={onUpdateAvatar} onClose={() => setIsProfileOpen(false)} />
      )}
    </>
  );
};
