// frontend/src/components/layout/Header.tsx
import React, { useState } from 'react';
import type { OperatorSession } from '../../types';
import { UserProfileModal } from '../modals/UserProfileModal';
import { useClock, useElapsed } from '../../hooks/useClock';
import { DEFAULT_AVATAR_URL } from '../../config/env';
import type { CriticalAlerts } from '../../hooks/useCriticalAlerts';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

interface HeaderProps {
  session: OperatorSession;
  connectionStatus: ConnectionStatus;
  shiftStartedAt: number;
  criticalAlarms: number;
  alerts: CriticalAlerts;
  onOpenPalette: () => void;
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
  alerts,
  onOpenPalette,
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
        <div className="rp-header__left">
          <div className="truncate">
            <h1 className="rp-header__title">Centro de Controle Operacional</h1>
            <p className="rp-header__subtitle">Supervisão ATS &amp; telemetria SCADA • Brasilândia ➔ São Joaquim</p>
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

          <button
            type="button"
            className="rp-btn rp-btn--ghost rp-header__palette"
            onClick={onOpenPalette}
            title="Busca rápida de seções, estações e composições"
          >
            <span aria-hidden="true">⌕</span>
            Buscar
            <kbd className="rp-kbd">Ctrl</kbd>
            <kbd className="rp-kbd">K</kbd>
          </button>

          <button
            type="button"
            className="rp-icon-btn"
            onClick={alerts.toggleSound}
            aria-pressed={alerts.preferences.sound}
            title={alerts.preferences.sound ? 'Silenciar alertas sonoros' : 'Ativar alertas sonoros'}
          >
            {alerts.preferences.sound ? '🔔' : '🔇'}
          </button>

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
