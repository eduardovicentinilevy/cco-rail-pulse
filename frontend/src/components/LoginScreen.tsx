// frontend/src/components/LoginScreen.tsx
import React, { useState } from 'react';

interface LoginScreenProps {
  onLogin: (operatorId: string, password?: string) => Promise<void>;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [operatorId, setOperatorId] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (operatorId.trim() && password.trim()) {
      setIsLoading(true);
      try {
        await onLogin(operatorId.trim(), password.trim());
      } catch (error) {
        // Falha no login: reseta apenas a senha
        setPassword('');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <span style={styles.tag}>Acesso Restrito</span>
          <h1 style={styles.title}>RailPulse CCO</h1>
          <p style={styles.subtitle}>Linha 6-Laranja (Linha Uni)</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Credencial do Operador</label>
            <input 
              type="text" 
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value.toUpperCase())}
              placeholder="Ex: EDP-042"
              style={styles.input}
              disabled={isLoading}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Senha de Acesso</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={styles.input}
              disabled={isLoading}
              required
            />
          </div>

          <button type="submit" style={{...styles.button, opacity: isLoading ? 0.7 : 1}} disabled={isLoading}>
            {isLoading ? 'Autenticando...' : 'Autenticar e Iniciar Turno'}
          </button>
        </form>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: 'var(--uni-bg-primary)', fontFamily: 'var(--uni-font)' },
  card: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '12px', padding: '2.5rem', width: '100%', maxWidth: '400px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' },
  header: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem', textAlign: 'center' },
  tag: { backgroundColor: 'rgba(255, 102, 0, 0.15)', color: 'var(--uni-orange)', fontSize: '0.7rem', fontWeight: 'bold', padding: '0.3rem 0.6rem', borderRadius: '4px', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.05em' },
  title: { fontSize: '1.5rem', fontWeight: 800, color: 'var(--uni-text-main)', margin: '0' },
  subtitle: { fontSize: '0.85rem', color: 'var(--uni-text-muted)', marginTop: '0.2rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.75rem', color: 'var(--uni-text-muted)', fontWeight: 600 },
  input: { backgroundColor: 'var(--uni-bg-primary)', border: '1px solid var(--uni-border)', borderRadius: '8px', padding: '0.75rem', color: 'var(--uni-text-main)', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s' },
  button: { backgroundColor: 'var(--uni-orange)', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.85rem', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.5rem', transition: 'all 0.2s' }
};