// frontend/src/components/LoginScreen.tsx
import React, { useCallback, useRef, useState } from 'react';
import { LINE_NAME, LINE_OPERATOR, LINE_STATIONS, LINE_TERMINALS, TRACTION_NOMINAL_V } from '../data/stations';
import { LineSilhouette } from './common/LineSilhouette';
import { Icon } from './common/Icon';

interface LoginScreenProps {
  onLogin: (operatorId: string, password: string) => Promise<{ mfaRequired: boolean; challengeToken?: string }>;
  onSubmitMfaCode: (challengeToken: string, code: string) => Promise<void>;
  /** Aviso da sessão anterior (expiração, revogação). */
  notice?: string | null;
  onDismissNotice?: () => void;
}

/** Números da malha exibidos no painel de marca — todos derivados do catálogo. */
const BRAND_FACTS = [
  { label: 'Estações', value: String(LINE_STATIONS.length) },
  { label: 'Subestações', value: String(new Set(LINE_STATIONS.map((station) => station.substation)).size) },
  { label: 'Tração', value: `${TRACTION_NOMINAL_V} Vcc` },
];

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
      {/* Painel de marca: paleta fixa em marinho, como o telão da sala de controle. */}
      <section className="rp-login__brand" aria-label={`${LINE_NAME} — ${LINE_OPERATOR}`}>
        <div className="rp-login__brand-top">
          <span className="rp-login__mark" aria-hidden="true">
            6
          </span>
          <span className="rp-login__wordmark">
            <strong>RailPulse CCO</strong>
            <span>
              {LINE_NAME} • {LINE_OPERATOR}
            </span>
          </span>
        </div>

        <div className="rp-login__brand-body">
          <p className="rp-login__headline">Centro de Controle Operacional</p>
          <p className="rp-login__lede">
            Supervisão CBTC, energia de tração e ocorrências de {LINE_TERMINALS.west} a {LINE_TERMINALS.east}, em
            tempo real.
          </p>
          <LineSilhouette className="rp-login__route" />
        </div>

        <dl className="rp-login__facts">
          {BRAND_FACTS.map((fact) => (
            <div key={fact.label} className="rp-login__fact">
              <dt>{fact.label}</dt>
              <dd className="mono">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rp-login__panel">
        <div className="rp-login__card">
          <header className="rp-login__header">
            <span className="rp-login__tag">
              <Icon name="lock" />
              Acesso restrito
            </span>
            <h1 className="rp-login__title">{challengeToken ? 'Verificação em duas etapas' : 'Iniciar turno'}</h1>
            <p className="rp-login__subtitle">
              {challengeToken
                ? 'Confirme o código do seu aplicativo autenticador.'
                : 'Entre com a sua credencial de operador do CCO.'}
            </p>
          </header>

          {notice && (
            <p className="rp-login__error" role="status" style={{ marginBottom: 'var(--sp-4)' }}>
              {notice}
            </p>
          )}

          {challengeToken ? (
            <form className="rp-stack" onSubmit={handleMfaSubmit} noValidate>
              <p className="rp-hint">Credencial confirmada. Digite o código de 6 dígitos.</p>

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
                  <Icon name="alert" />
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
                    <Icon name={showPassword ? 'eye-off' : 'eye'} />
                  </button>
                </div>
              </div>

              {error && (
                <p id="login-error" className="rp-login__error" role="alert">
                  <Icon name="alert" />
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
            <Icon name="shield" />
            Comandos e acessos ficam registrados na trilha de auditoria da operação.
          </p>
        </div>
      </section>
    </main>
  );
};
