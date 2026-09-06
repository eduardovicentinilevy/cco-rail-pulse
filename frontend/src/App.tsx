// frontend/src/App.tsx
import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { CCODashboard } from './components/CCODashboard';

const AppContent: React.FC = () => {
  const { session, login, logout } = useAuth();

  // Garante limpeza imediata se houver inconsistência na sessão
  useEffect(() => {
    const rawSession = localStorage.getItem('@RailPulse:session');
    if (rawSession && !session) {
      localStorage.removeItem('@RailPulse:session');
      window.location.reload();
    }
  }, [session]);

  // Se não houver sessão ativa, renderiza obrigatoriamente a tela de login
  if (!session) {
    return <LoginScreen onLogin={login} />;
  }

  // Se estiver autenticado, exibe o painel de controle do CCO
  return <CCODashboard operator={session.operatorId} onLogout={logout} />;
};

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;