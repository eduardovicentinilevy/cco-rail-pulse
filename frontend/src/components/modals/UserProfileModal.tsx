// frontend/src/components/modals/UserProfileModal.tsx
import React, { useState } from 'react';
import type { OperatorSession } from '../../types';
import { Modal } from '../common/Modal';
import { DEFAULT_AVATAR_URL } from '../../config/env';

interface UserProfileModalProps {
  session: OperatorSession;
  onUpdateAvatar: (url: string) => Promise<void>;
  onClose: () => void;
}

const isValidHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ session, onUpdateAvatar, onClose }) => {
  const [avatarInput, setAvatarInput] = useState(session.avatarUrl ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = avatarInput.trim();
  const hasChanges = trimmed.length > 0 && trimmed !== (session.avatarUrl ?? '');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!hasChanges) {
      onClose();
      return;
    }

    if (!isValidHttpUrl(trimmed)) {
      setError('Informe uma URL http(s) válida para a imagem.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      // A persistência é no backend: o avatar passa a acompanhar o operador
      // em qualquer estação de trabalho, não só neste navegador.
      await onUpdateAvatar(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o avatar.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title="Perfil do operador"
      subtitle="Credenciamento e identificação visual no Centro de Controle"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rp-btn" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" form="rp-profile-form" className="rp-btn rp-btn--primary" disabled={isSaving}>
            {isSaving && <span className="rp-spinner" aria-hidden="true" />}
            {isSaving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </>
      }
    >
      <form id="rp-profile-form" className="rp-stack" onSubmit={handleSubmit} noValidate>
        <div className="rp-row" style={{ padding: 'var(--sp-4)', background: 'var(--uni-bg-primary)', border: '1px solid var(--uni-border)', borderRadius: 'var(--radius-md)' }}>
          <img
            className="rp-profile__avatar rp-profile__avatar--lg"
            src={trimmed || DEFAULT_AVATAR_URL}
            alt=""
            onError={(event) => {
              event.currentTarget.src = DEFAULT_AVATAR_URL;
            }}
          />
          <div className="rp-stack rp-stack--tight">
            <span className="rp-badge rp-badge--code">{session.operatorId}</span>
            <strong>{session.name ?? session.operatorId}</strong>
            <span className="rp-badge" data-status="NORMAL" role="status">
              <span className="rp-dot rp-dot--pulse" aria-hidden="true" />
              Sessão ativa e segura
            </span>
          </div>
        </div>

        <div className="rp-field">
          <label className="rp-label" htmlFor="avatarUrl">
            URL da foto de perfil
          </label>
          <input
            id="avatarUrl"
            className="rp-input"
            type="url"
            inputMode="url"
            value={avatarInput}
            onChange={(event) => {
              setAvatarInput(event.target.value);
              if (error) setError(null);
            }}
            placeholder="https://exemplo.com/sua-foto.jpg"
            aria-invalid={error ? true : undefined}
            aria-describedby="avatarUrl-hint"
            disabled={isSaving}
          />
          <span id="avatarUrl-hint" className="rp-hint">
            Link direto de uma imagem pública. A alteração é salva no cadastro do operador.
          </span>
          {error && (
            <span className="rp-login__error" role="alert">
              {error}
            </span>
          )}
        </div>

        <div className="rp-terminal__metrics">
          <div className="rp-metric-row">
            <span>Eixo operacional</span>
            <strong>Brasilândia ➔ São Joaquim</strong>
          </div>
          <div className="rp-metric-row">
            <span>Perfil de acesso</span>
            <strong className="mono">{session.role}</strong>
          </div>
          <div className="rp-metric-row">
            <span>Nível de credenciamento</span>
            <strong className="rp-status-text" data-status="NORMAL">
              Nível 3 — comandos críticos ativos
            </strong>
          </div>
        </div>
      </form>
    </Modal>
  );
};
