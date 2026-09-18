// frontend/src/components/LoginScreen.tsx
import React, { useCallback, useRef, useState } from 'react';

interface LoginScreenProps {
  onLogin: (operatorId: string, password: string) => Promise<{ mfaRequired: boolean; challengeToken?: string }>;
  onSubmitMfaCode: (challengeToken: string, code: string) => Promise<void>;
  /** Aviso da sessão anterior (expiração, revogação). */
  notice?: string | null;
  onDismissNotice?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onSubmitMfaCode, notice, onDismissNotice }) => {
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

  const trimmedOperatorId = operatorId.trim();
  const canSubmit = trimmedOperatorId.length > 0 && password.length > 0 && !isLoading;
  const canSubmitMfa = mfaCode.trim().length === 6 && !isLoading;

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!canSubmit) return;

      setIsLoading(true);
      setError(null);
      onDismissNotice?.();

      try {
        const result = await onLogin(trimmedOperatorId, password);
        if (result.mfaRequired && result.challengeToken) {
          setChallengeToken(result.challengeToken);
          window.setTimeout(() => mfaCodeRef.current?.focus(), 0);
        }
      } catch (err) {
        // Falha no login: mantém a credencial, limpa e refoca a senha.
        setPassword('');
        setError(err instanceof Error && err.message ? err.message : 'Credencial ou senha inválida. Tente novamente.');
        passwordRef.current?.focus();
      } finally {
        setIsLoading(false);
      }
    },
    [canSubmit, onLogin, onDismissNotice, trimmedOperatorId, password],
  );

  const handleMfaSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!canSubmitMfa || !challengeToken) return;

      setIsLoading(true);
      setError(null);

      try {
        await onSubmitMfaCode(challengeToken, mfaCode.trim());
      } catch (err) {
        setMfaCode('');
        setError(err instanceof Error && err.message ? err.message : 'Código inválido. Tente novamente.');
        mfaCodeRef.current?.focus();
      } finally {
        setIsLoading(false);
      }
    },
    [canSubmitMfa, challengeToken, onSubmitMfaCode, mfaCode],
  );

  const handleBackToCredentials = useCallback(() => {
    setChallengeToken(null);
    setMfaCode('');
    setError(null);
  }, []);

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

        {challengeToken ? (
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

            {error && (
              <p id="login-error" className="rp-login__error" role="alert">
                <span aria-hidden="true">⚠</span>
                {error}
              </p>
            )}

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

            {error && (
              <p id="login-error" className="rp-login__error" role="alert">
                <span aria-hidden="true">⚠</span>
                {error}
              </p>
            )}

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
