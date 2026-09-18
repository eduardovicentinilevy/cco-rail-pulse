// frontend/src/components/views/SettingsView.tsx
import React from 'react';
import type { OperatorSession } from '../../types';
import type { CriticalAlerts } from '../../hooks/useCriticalAlerts';
import { roleLabel } from '../../lib/permissions';
import { MfaSettingsCard } from './MfaSettingsCard';

interface SettingsViewProps {
  session: OperatorSession;
  alerts: CriticalAlerts;
  onAuthError: (message: string) => void;
}

const SHORTCUTS: ReadonlyArray<{ keys: string[]; description: string }> = [
  { keys: ['Ctrl', 'K'], description: 'Abrir a paleta de comandos (busca seções, estações e composições)' },
  { keys: ['1', '…', '9', '0'], description: 'Ir direto para uma das dez seções do console' },
  { keys: ['/'], description: 'Focar a busca de estações na malha ATS' },
  { keys: ['Esc'], description: 'Fechar o modal, diálogo ou paleta ativo' },
  { keys: ['↑', '↓'], description: 'Navegar pela lista de resultados de um modal aberto' },
  { keys: ['↵'], description: 'Confirmar a seleção ativa na paleta de comandos' },
];

const DESKTOP_PERMISSION_HINT: Record<CriticalAlerts['notificationPermission'], string | null> = {
  default: null,
  granted: null,
  denied: 'Bloqueadas nas permissões do navegador — reative o acesso a notificações para este site.',
  unsupported: 'Este navegador não oferece notificações do sistema.',
};

/**
 * Preferências do operador.
 *
 * Concentra o que hoje ficava só na cabeça de quem operava — como alertas
 * soam, o que cada atalho faz — em um lugar consultável, em vez de exigir
 * que o próximo operador do turno redescubra tudo sozinho.
 */
export const SettingsView: React.FC<SettingsViewProps> = ({ session, alerts, onAuthError }) => {
  const desktopHint = DESKTOP_PERMISSION_HINT[alerts.notificationPermission];
  const desktopDisabled = alerts.notificationPermission === 'unsupported' || alerts.notificationPermission === 'denied';

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Preferências</span>
          <h2 className="rp-page-header__title">Configurações</h2>
          <p className="rp-page-header__subtitle">Perfil, alertas críticos e atalhos de teclado do console</p>
        </div>
      </div>

      <div className="rp-grid rp-grid--panels">
        <section className="rp-card">
          <header className="rp-card__header">
            <h3 className="rp-card__title">Perfil do operador</h3>
          </header>

          <div className="rp-stack rp-stack--tight">
            <div className="rp-field">
              <span className="rp-label">Nome</span>
              <span>{session.name ?? '—'}</span>
            </div>
            <div className="rp-field">
              <span className="rp-label">Credencial</span>
              <span className="mono">{session.operatorId}</span>
            </div>
            <div className="rp-field">
              <span className="rp-label">Perfil de acesso</span>
              <span>{roleLabel(session.role)}</span>
            </div>
            <p className="rp-hint">Para trocar o avatar, use o menu de perfil no cabeçalho do console.</p>
          </div>
        </section>

        <section className="rp-card">
          <header className="rp-card__header">
            <h3 className="rp-card__title">Alertas críticos</h3>
          </header>

          <div className="rp-option-row">
            <div>
              <p className="rp-option-row__title">Alerta sonoro</p>
              <p className="rp-hint">Toca um duplo aviso ao registrar uma ocorrência ou alerta crítico</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={alerts.preferences.sound}
              aria-label="Alternar alerta sonoro"
              className="rp-switch"
              onClick={alerts.toggleSound}
            />
          </div>

          <div className="rp-option-row">
            <div>
              <p className="rp-option-row__title">Notificações do sistema</p>
              <p className="rp-hint">{desktopHint ?? 'Exibe um aviso do navegador mesmo com o painel em segundo plano'}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={alerts.preferences.desktop}
              aria-label="Alternar notificações do sistema"
              className="rp-switch"
              disabled={desktopDisabled}
              onClick={() => (alerts.preferences.desktop ? alerts.disableDesktop() : void alerts.enableDesktop())}
            />
          </div>
        </section>

        <MfaSettingsCard token={session.token} onAuthError={onAuthError} />
      </div>

      <section className="rp-card rp-card--flush">
        <header className="rp-card__header" style={{ padding: 'var(--sp-5) var(--sp-5) 0' }}>
          <h3 className="rp-card__title">Atalhos de teclado</h3>
        </header>

        <div className="rp-table-wrap">
          <table className="rp-table">
            <caption className="sr-only">Atalhos de teclado do console</caption>
            <thead>
              <tr>
                <th scope="col">Tecla</th>
                <th scope="col">Ação</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((shortcut) => (
                <tr key={shortcut.description}>
                  <td>
                    {shortcut.keys.map((key) => (
                      <kbd key={key} className="rp-kbd">
                        {key}
                      </kbd>
                    ))}
                  </td>
                  <td>{shortcut.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
