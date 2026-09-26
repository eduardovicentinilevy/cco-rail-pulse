// frontend/src/components/views/MfaSettingsCard.tsx
import React, { useCallback, useState } from 'react';
import { api, ApiError } from '../../services/api';
import { useResource } from '../../hooks/useResource';
import { useAuthErrorHandler } from '../../hooks/useAuthErrorHandler';

interface MfaSettingsCardProps {
  token: string;
  onAuthError: (message: string) => void;
}

type Stage = 'idle' | 'enrolling' | 'disabling';

/** Blocos de 4 caracteres — mais fácil de digitar manualmente no app autenticador do que uma sequência corrida. */
const chunkSecret = (secret: string): string => secret.match(/.{1,4}/g)?.join(' ') ?? secret;

/**
 * Autenticação em duas etapas (TOTP).
 *
 * Sem um segundo fator, uma senha vazada basta para operar comandos críticos
 * sobre trens reais — o console é isso que separa uma credencial roubada de
 * uma sessão de fato aberta.
 */
export const MfaSettingsCard: React.FC<MfaSettingsCardProps> = ({ token, onAuthError }) => {
  const handleAuthError = useAuthErrorHandler(onAuthError, 'consultar o status do 2FA');
  const loadStatus = useCallback(() => api.mfaStatus(token), [token]);
  const { data, isLoading, reload } = useResource('mfa-status', loadStatus, handleAuthError);

  const [stage, setStage] = useState<Stage>('idle');
  const [pending, setPending] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const enabled = data?.enabled ?? false;

  const handleError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.isAuthError) {
        onAuthError('Sua sessão expirou.');
        return;
      }
      setError(err instanceof Error && err.message ? err.message : fallback);
    },
    [onAuthError],
  );

  const startEnroll = useCallback(async () => {
    setError(null);
    setIsBusy(true);
    try {
      const result = await api.mfaEnroll(token);
      setPending(result);
      setPassword('');
      setStage('enrolling');
    } catch (err) {
      handleError(err, 'Não foi possível gerar o segredo.');
    } finally {
      setIsBusy(false);
    }
  }, [token, handleError]);

  const confirmEnroll = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (code.trim().length !== 6 || password.length === 0) return;

      setError(null);
      setIsBusy(true);
      try {
        await api.mfaConfirm(token, code.trim(), password);
        setStage('idle');
        setPending(null);
        setCode('');
        setPassword('');
        reload();
      } catch (err) {
        handleError(err, 'Código de verificação inválido.');
      } finally {
        setIsBusy(false);
      }
    },
    [token, code, password, reload, handleError],
  );

  const cancelEnroll = useCallback(() => {
    setStage('idle');
    setPending(null);
    setCode('');
    setPassword('');
    setError(null);
  }, []);

  const confirmDisable = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (password.length === 0) return;

      setError(null);
      setIsBusy(true);
      try {
        await api.mfaDisable(token, password);
        setStage('idle');
        setPassword('');
        reload();
      } catch (err) {
        handleError(err, 'Não foi possível desativar o 2FA.');
      } finally {
        setIsBusy(false);
      }
    },
    [token, password, reload, handleError],
  );

  const cancelDisable = useCallback(() => {
    setStage('idle');
    setPassword('');
    setError(null);
  }, []);

  return (
    <section className="rp-card">
      <header className="rp-card__header">
        <h3 className="rp-card__title">Autenticação em duas etapas</h3>
      </header>

      {isLoading ? (
        <p className="rp-hint">Verificando status…</p>
      ) : stage === 'enrolling' && pending ? (
        <form className="rp-stack rp-stack--tight" onSubmit={confirmEnroll}>
          <p className="rp-hint">
            Adicione esta chave no seu aplicativo autenticador (Google Authenticator, Authy, 1Password…) e digite o
            código de 6 dígitos gerado para confirmar a ativação.
          </p>
          <div className="rp-field">
            <span className="rp-label">Chave secreta</span>
            <span className="mono" style={{ letterSpacing: '0.08em', wordBreak: 'break-all' }}>
              {chunkSecret(pending.secret)}
            </span>
          </div>
          <div className="rp-field">
            <label className="rp-label" htmlFor="mfa-confirm-code">
              Código de verificação
            </label>
            <input
              id="mfa-confirm-code"
              className="rp-input mono"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                if (error) setError(null);
              }}
              placeholder="000000"
              autoFocus
              required
            />
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="mfa-confirm-password">
              Senha de acesso
            </label>
            <input
              id="mfa-confirm-password"
              className="rp-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError(null);
              }}
              required
            />
            <span className="rp-hint">Confirma que é você mesmo ativando — evita que uma sessão aberta sozinha ligue o 2FA.</span>
          </div>

          {error && (
            <p className="rp-login__error" role="alert">
              <span aria-hidden="true">⚠</span> {error}
            </p>
          )}

          <div className="rp-row">
            <button
              type="submit"
              className="rp-btn rp-btn--primary"
              disabled={isBusy || code.trim().length !== 6 || password.length === 0}
            >
              {isBusy && <span className="rp-spinner" aria-hidden="true" />}
              Confirmar ativação
            </button>
            <button type="button" className="rp-btn rp-btn--ghost" onClick={cancelEnroll} disabled={isBusy}>
              Cancelar
            </button>
          </div>
        </form>
      ) : stage === 'disabling' ? (
        <form className="rp-stack rp-stack--tight" onSubmit={confirmDisable}>
          <p className="rp-hint">Confirme sua senha para desativar a autenticação em duas etapas.</p>
          <div className="rp-field">
            <label className="rp-label" htmlFor="mfa-disable-password">
              Senha de acesso
            </label>
            <input
              id="mfa-disable-password"
              className="rp-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError(null);
              }}
              autoFocus
              required
            />
          </div>

          {error && (
            <p className="rp-login__error" role="alert">
              <span aria-hidden="true">⚠</span> {error}
            </p>
          )}

          <div className="rp-row">
            <button type="submit" className="rp-btn rp-btn--danger" disabled={isBusy || password.length === 0}>
              {isBusy && <span className="rp-spinner" aria-hidden="true" />}
              Desativar 2FA
            </button>
            <button type="button" className="rp-btn rp-btn--ghost" onClick={cancelDisable} disabled={isBusy}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="rp-option-row">
          <div>
            <p className="rp-option-row__title">{enabled ? 'Ativa' : 'Inativa'}</p>
            <p className="rp-hint">
              {enabled
                ? 'O login exige o código do seu aplicativo autenticador além da senha.'
                : 'Exige um código de 6 dígitos no login, além da senha — protege a conta mesmo se a senha vazar.'}
            </p>
          </div>
          {enabled ? (
            <button type="button" className="rp-btn rp-btn--outline" onClick={() => setStage('disabling')}>
              Desativar
            </button>
          ) : (
            <button type="button" className="rp-btn rp-btn--primary" onClick={startEnroll} disabled={isBusy}>
              {isBusy && <span className="rp-spinner" aria-hidden="true" />}
              Ativar
            </button>
          )}
        </div>
      )}
    </section>
  );
};
