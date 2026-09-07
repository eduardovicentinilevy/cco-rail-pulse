import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { CCODashboard } from './components/CCODashboard';

const AppContent: React.FC = () => {
  const { session, login, logout } = useAuth();

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