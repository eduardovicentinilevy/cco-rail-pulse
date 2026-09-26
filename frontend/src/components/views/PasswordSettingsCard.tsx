// frontend/src/components/views/PasswordSettingsCard.tsx
import React, { useCallback, useState } from 'react';
import { ApiError } from '../../services/api';
import { useAuth } from '../../context/useAuth';

/** Espelha o mínimo da política do backend; a validação completa é feita lá. */
const MIN_PASSWORD_LENGTH = 12;

/**
 * Troca de senha do próprio operador.
 *
 * A troca encerra as demais sessões da credencial, que é o que dá sentido a
 * trocar a senha por suspeita de comprometimento: quem já estava dentro sai.
 */
export const PasswordSettingsCard: React.FC<{ onAuthError: (message: string) => void }> = ({ onAuthError }) => {
  const { changePassword } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= MIN_PASSWORD_LENGTH && confirmPassword.length > 0 && !isBusy;

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!canSubmit) return;

      if (newPassword !== confirmPassword) {
        setError('A confirmação não confere com a nova senha.');
        return;
      }

      setIsBusy(true);
      setError(null);
      setSuccess(null);

      try {
        await changePassword(currentPassword, newPassword);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setSuccess('Senha atualizada. As demais sessões desta credencial foram encerradas.');
      } catch (err) {
        // 401 aqui é senha atual incorreta, não sessão expirada.
        if (err instanceof ApiError && err.status === 403) {
          onAuthError('Sua sessão expirou ao trocar a senha.');
          return;
        }
        setError(err instanceof Error && err.message ? err.message : 'Não foi possível trocar a senha.');
      } finally {
        setIsBusy(false);
      }
    },
    [canSubmit, changePassword, confirmPassword, currentPassword, newPassword, onAuthError],
  );

  return (
    <section className="rp-card">
      <header className="rp-card__header">
        <h3 className="rp-card__title">Senha de acesso</h3>
      </header>

      <form className="rp-stack rp-stack--tight" onSubmit={handleSubmit} noValidate>
        <div className="rp-field">
          <label className="rp-label" htmlFor="current-password">
            Senha atual
          </label>
          <input
            id="current-password"
            className="rp-input"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              if (error) setError(null);
            }}
            disabled={isBusy}
            required
          />
        </div>

        <div className="rp-field">
          <label className="rp-label" htmlFor="new-password">
            Nova senha
          </label>
          <input
            id="new-password"
            className="rp-input"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              if (error) setError(null);
            }}
            disabled={isBusy}
            required
          />
          <span className="rp-hint">
            Ao menos {MIN_PASSWORD_LENGTH} caracteres, com maiúscula, minúscula, número e símbolo. Não pode conter a sua
            credencial nem partes do seu nome.
          </span>
        </div>

        <div className="rp-field">
          <label className="rp-label" htmlFor="confirm-password">
            Confirme a nova senha
          </label>
          <input
            id="confirm-password"
            className="rp-input"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              if (error) setError(null);
            }}
            disabled={isBusy}
            required
          />
        </div>

        {error && (
          <p className="rp-login__error" role="alert">
            <span aria-hidden="true">⚠</span>
            {error}
          </p>
        )}

        {success && (
          <p className="rp-hint" role="status">
            {success}
          </p>
        )}

        <button type="submit" className="rp-btn rp-btn--primary" disabled={!canSubmit}>
          {isBusy && <span className="rp-spinner" aria-hidden="true" />}
          {isBusy ? 'Trocando…' : 'Trocar senha'}
        </button>
      </form>
    </section>
  );
};
