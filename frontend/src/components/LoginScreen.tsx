// frontend/src/components/LoginScreen.tsx
import React, { useCallback, useRef, useState } from 'react';
import type { LoginOutcome } from '../context/auth-context';

interface LoginScreenProps {
  onLogin: (operatorId: string, password: string) => Promise<LoginOutcome>;
  onSubmitMfaCode: (challengeToken: string, code: string) => Promise<LoginOutcome>;
  /** Define a senha definitiva quando a conta está marcada para troca no primeiro acesso. */
  onSubmitNewPassword: (changeToken: string, newPassword: string) => Promise<void>;
  /** Aviso da sessão anterior (expiração, revogação). */
  notice?: string | null;
  onDismissNotice?: () => void;
}

interface PasswordChallenge {
  changeToken: string;
  minPasswordLength: number;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onLogin,
  onSubmitMfaCode,
  onSubmitNewPassword,
  notice,
  onDismissNotice,
}) => {
  const [operatorId, setOperatorId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Presente só quando a senha foi aceita e falta o código do autenticador.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const mfaCodeRef = useRef<HTMLInputElement>(null);

  // Presente quando a conta exige a troca de senha antes de abrir a sessão.
  const [passwordChallenge, setPasswordChallenge] = useState<PasswordChallenge | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const newPasswordRef = useRef<HTMLInputElement>(null);

  const trimmedOperatorId = operatorId.trim();
  const canSubmit = trimmedOperatorId.length > 0 && password.length > 0 && !isLoading;
  const canSubmitMfa = mfaCode.trim().length === 6 && !isLoading;
  const minPasswordLength = passwordChallenge?.minPasswordLength ?? 12;
  const canSubmitNewPassword =
    newPassword.length >= minPasswordLength && confirmPassword.length > 0 && !isLoading;

  /** Encaminha o desfecho do login para a etapa correspondente. */
  const applyOutcome = useCallback((outcome: LoginOutcome) => {
    if (outcome.status === 'mfa') {
      setChallengeToken(outcome.challengeToken);
      window.setTimeout(() => mfaCodeRef.current?.focus(), 0);
      return;
    }

    if (outcome.status === 'password-change') {
      setChallengeToken(null);
      setPassword('');
      setPasswordChallenge({ changeToken: outcome.changeToken, minPasswordLength: outcome.minPasswordLength });
      window.setTimeout(() => newPasswordRef.current?.focus(), 0);
    }
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!canSubmit) return;

      setIsLoading(true);
      setError(null);
      onDismissNotice?.();

      try {
        applyOutcome(await onLogin(trimmedOperatorId, password));
      } catch (err) {
        // Falha no login: mantém a credencial, limpa e refoca a senha.
        setPassword('');
        setError(err instanceof Error && err.message ? err.message : 'Credencial ou senha inválida. Tente novamente.');
        passwordRef.current?.focus();
      } finally {
        setIsLoading(false);
      }
    },
    [canSubmit, onLogin, onDismissNotice, trimmedOperatorId, password, applyOutcome],
  );

  const handleMfaSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!canSubmitMfa || !challengeToken) return;

      setIsLoading(true);
      setError(null);

      try {
        applyOutcome(await onSubmitMfaCode(challengeToken, mfaCode.trim()));
      } catch (err) {
        setMfaCode('');
        setError(err instanceof Error && err.message ? err.message : 'Código inválido. Tente novamente.');
        mfaCodeRef.current?.focus();
      } finally {
        setIsLoading(false);
      }
    },
    [canSubmitMfa, challengeToken, onSubmitMfaCode, mfaCode, applyOutcome],
  );

  const handleNewPasswordSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!canSubmitNewPassword || !passwordChallenge) return;

      if (newPassword !== confirmPassword) {
        setError('A confirmação não confere com a nova senha.');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        await onSubmitNewPassword(passwordChallenge.changeToken, newPassword);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : 'Não foi possível definir a nova senha.');
        newPasswordRef.current?.focus();
      } finally {
        setIsLoading(false);
      }
    },
    [canSubmitNewPassword, passwordChallenge, newPassword, confirmPassword, onSubmitNewPassword],
  );

  const handleBackToCredentials = useCallback(() => {
    setChallengeToken(null);
    setPasswordChallenge(null);
    setMfaCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
  }, []);

  const errorBlock = error && (
    <p id="login-error" className="rp-login__error" role="alert">
      <span aria-hidden="true">⚠</span>
      {error}
    </p>
  );

  return (
    <main className="rp-login">
      <div className="rp-login__card">
        <header className="rp-login__header">
          <span className="rp-login__tag">Acesso restrito</span>
          <h1 className="rp-login__title">RailPulse CCO</h1>
          <p className="rp-login__subtitle">Centro de Controle Operacional • Linha 6-Laranja (Linha Uni)</p>
        </header>

        {notice && (
          <p className="rp-login__error" role="status" style={{ marginBottom: 'var(--sp-4)' }}>
            {notice}
          </p>
        )}

        {passwordChallenge ? (
          <form className="rp-stack" onSubmit={handleNewPasswordSubmit} noValidate>
            <p className="rp-hint" style={{ marginBottom: 'var(--sp-2)' }}>
              Esta credencial ainda usa uma senha provisória. Defina a sua senha definitiva para assumir o turno.
            </p>

            <div className="rp-field">
              <label className="rp-label" htmlFor="newPassword">
                Nova senha
              </label>
              <input
                id="newPassword"
                name="newPassword"
                ref={newPasswordRef}
                className="rp-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••••••"
                aria-invalid={error ? true : undefined}
                aria-describedby="password-policy"
                disabled={isLoading}
                required
              />
              <p id="password-policy" className="rp-hint">
                Ao menos {minPasswordLength} caracteres, com maiúscula, minúscula, número e símbolo. Não pode conter a
                sua credencial nem partes do seu nome.
              </p>
            </div>

            <div className="rp-field">
              <label className="rp-label" htmlFor="confirmPassword">
                Confirme a nova senha
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                className="rp-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••••••"
                disabled={isLoading}
                required
              />
            </div>

            {errorBlock}

            <button
              type="submit"
              className="rp-btn rp-btn--primary rp-btn--lg rp-btn--block"
              disabled={!canSubmitNewPassword}
            >
              {isLoading && <span className="rp-spinner" aria-hidden="true" />}
              {isLoading ? 'Definindo…' : 'Definir senha e iniciar turno'}
            </button>

            <button
              type="button"
              className="rp-btn rp-btn--ghost rp-btn--block"
              onClick={handleBackToCredentials}
              disabled={isLoading}
            >
              Voltar
            </button>
          </form>
        ) : challengeToken ? (
          <form className="rp-stack" onSubmit={handleMfaSubmit} noValidate>
            <p className="rp-hint" style={{ marginBottom: 'var(--sp-2)' }}>
              Credencial confirmada. Digite o código de 6 dígitos do seu aplicativo autenticador.
            </p>

            <div className="rp-field">
              <label className="rp-label" htmlFor="mfaCode">
                Código de verificação
              </label>
              <input
                id="mfaCode"
                name="mfaCode"
                ref={mfaCodeRef}
                className="rp-input mono"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={mfaCode}
                onChange={(event) => {
                  setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                  if (error) setError(null);
                }}
                placeholder="000000"
                style={{ letterSpacing: '0.4em', textAlign: 'center', fontSize: 'var(--fs-xl)' }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'login-error' : undefined}
                disabled={isLoading}
                required
              />
            </div>

            {errorBlock}

            <button type="submit" className="rp-btn rp-btn--primary rp-btn--lg rp-btn--block" disabled={!canSubmitMfa}>
              {isLoading && <span className="rp-spinner" aria-hidden="true" />}
              {isLoading ? 'Verificando…' : 'Confirmar e iniciar turno'}
            </button>

            <button type="button" className="rp-btn rp-btn--ghost rp-btn--block" onClick={handleBackToCredentials} disabled={isLoading}>
              Voltar
            </button>
          </form>
        ) : (
          <form className="rp-stack" onSubmit={handleSubmit} noValidate>
            <div className="rp-field">
              <label className="rp-label" htmlFor="operatorId">
                Credencial do operador
              </label>
              <input
                id="operatorId"
                name="operatorId"
                className="rp-input mono"
                type="text"
                autoComplete="username"
                autoFocus
                value={operatorId}
                onChange={(event) => {
                  setOperatorId(event.target.value.toUpperCase());
                  if (error) setError(null);
                }}
                placeholder="Ex: EDP-042"
                disabled={isLoading}
                required
              />
            </div>

            <div className="rp-field">
              <label className="rp-label" htmlFor="password">
                Senha de acesso
              </label>
              <div className="rp-search">
                <input
                  id="password"
                  name="password"
                  ref={passwordRef}
                  className="rp-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="••••••••"
                  style={{ paddingLeft: '0.8rem' }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'login-error' : undefined}
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  className="rp-search__clear"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  disabled={isLoading}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {errorBlock}

            <button type="submit" className="rp-btn rp-btn--primary rp-btn--lg rp-btn--block" disabled={!canSubmit}>
              {isLoading && <span className="rp-spinner" aria-hidden="true" />}
              {isLoading ? 'Autenticando…' : 'Autenticar e iniciar turno'}
            </button>
          </form>
        )}

        <p className="rp-login__footer">
          Comandos e acessos ficam registrados na trilha de auditoria da operação.
        </p>
      </div>
    </main>
  );
};
