// frontend/src/App.tsx
import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { LoginScreen } from './components/LoginScreen';
import { CCODashboard } from './components/CCODashboard';

const AppContent: React.FC = () => {
  const { session, isRestoring, sessionNotice, login, logout, expireSession, updateAvatar, dismissNotice } = useAuth();

  // Enquanto a sessão restaurada é validada, evita piscar a tela de login.
  if (isRestoring) {
    return (
      <div className="rp-login" role="status" aria-live="polite">
        <div className="rp-empty">
          <span className="rp-spinner" aria-hidden="true" />
          <span>Restaurando a sessão do operador…</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginScreen onLogin={login} notice={sessionNotice} onDismissNotice={dismissNotice} />;
  }

  return (
    <CCODashboard
      session={session}
      onUpdateAvatar={updateAvatar}
      onExpireSession={expireSession}
      onLogout={logout}
    />
  );
};

export const App: React.FC = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
