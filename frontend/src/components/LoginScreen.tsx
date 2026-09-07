// frontend/src/components/LoginScreen.tsx
import React, { useCallback, useRef, useState } from 'react';

interface LoginScreenProps {
  onLogin: (operatorId: string, password: string) => Promise<void>;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [operatorId, setOperatorId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const trimmedOperatorId = operatorId.trim();
  const trimmedPassword = password.trim();
  const canSubmit = trimmedOperatorId.length > 0 && trimmedPassword.length > 0 && !isLoading;

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsLoading(true);
    setError(null);
    try {
      await onLogin(trimmedOperatorId, trimmedPassword);
    } catch (err) {
      // Falha no login: mantém a credencial, limpa e refoca a senha
      setPassword('');
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Credencial ou senha inválida. Tente novamente.'
      );
      passwordRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  }, [canSubmit, onLogin, trimmedOperatorId, trimmedPassword]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.tag}>Acesso Restrito</span>
          <h1 style={styles.title}>RailPulse CCO</h1>
          <p style={styles.subtitle}>Linha 6-Laranja (Linha Uni)</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form} noValidate>
          <div style={styles.inputGroup}>
            <label htmlFor="operatorId" style={styles.label}>
              Credencial do Operador
            </label>
            <input
              id="operatorId"
              name="operatorId"
              type="text"
              autoComplete="username"
              autoFocus
              value={operatorId}
              onChange={(e) => {
                setOperatorId(e.target.value.toUpperCase());
                if (error) setError(null);
              }}
              placeholder="Ex: EDP-042"
              style={styles.input}
              disabled={isLoading}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label htmlFor="password" style={styles.label}>
              Senha de Acesso
            </label>
            <input
              id="password"
              name="password"
              ref={passwordRef}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="••••••••"
              style={styles.input}
              disabled={isLoading}
              aria-invalid={!!error}
              aria-describedby={error ? 'login-error' : undefined}
              required
            />
          </div>

          {error && (
            <p id="login-error" role="alert" style={styles.error}>
              {error}
            </p>
          )}

          <button
            type="submit"
            style={{
              ...styles.button,
              opacity: canSubmit ? 1 : 0.6,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
            disabled={!canSubmit}
          >
            {isLoading ? 'Autenticando...' : 'Autenticar e Iniciar Turno'}
          </button>
        </form>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'var(--uni-font)' },
  card: {
    backgroundColor: 'var(--uni-bg-secondary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '12px',
    padding: '2.5rem',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 102, 0, 0.06)',
    borderTop: '2px solid var(--uni-orange)',
    animation: 'railpulse-fade-in 0.35s ease',
  },
  header: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem', textAlign: 'center' },
  tag: { backgroundColor: 'rgba(255, 102, 0, 0.15)', color: 'var(--uni-orange)', fontSize: '0.7rem', fontWeight: 'bold', padding: '0.3rem 0.6rem', borderRadius: '4px', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.05em' },
  title: { fontSize: '1.5rem', fontWeight: 800, color: 'var(--uni-text-main)', margin: '0' },
  subtitle: { fontSize: '0.85rem', color: 'var(--uni-text-muted)', marginTop: '0.2rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.75rem', color: 'var(--uni-text-muted)', fontWeight: 600 },
  input: { backgroundColor: 'var(--uni-bg-primary)', border: '1px solid var(--uni-border)', borderRadius: '8px', padding: '0.75rem', color: 'var(--uni-text-main)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s' },
  error: { color: '#ff6b6b', fontSize: '0.8rem', margin: 0, textAlign: 'center' },
  button: { backgroundColor: 'var(--uni-orange)', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.85rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem', transition: 'all 0.2s' }
};