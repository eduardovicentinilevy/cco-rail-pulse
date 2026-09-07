import React, { useEffect } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { LoginScreen } from './components/LoginScreen';
import { CCODashboard } from './components/CCODashboard';

const AppContent: React.FC = () => {
  const { session, login, logout, updateAvatar } = useAuth();

  useEffect(() => {
    const rawSession = localStorage.getItem('@RailPulse:session');
    if (rawSession && !session) {
      localStorage.removeItem('@RailPulse:session');
      window.location.reload();
    }
  }, [session]);

  if (!session) {
    return <LoginScreen onLogin={login} />;
  }

  return <CCODashboard session={session} onUpdateAvatar={updateAvatar} onLogout={logout} />;
};

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;