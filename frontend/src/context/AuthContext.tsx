import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { OperatorSession } from '../types';

interface AuthContextData {
  session: OperatorSession | null;
  login: (operatorId: string, password?: string) => Promise<void>;
  logout: () => void;
  updateAvatar: (avatarUrl: string) => void;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<OperatorSession | null>(() => {
    const saved = localStorage.getItem('@RailPulse:session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        localStorage.removeItem('@RailPulse:session');
        return null;
      }
    }
    return null;
  });

  const login = async (operatorId: string, password?: string) => {
    try {
      const response = await fetch('http://localhost:3333/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorId, password })
      });

      if (!response.ok) {
        throw new Error('Falha na autenticação.');
      }

      const data = await response.json();

      const newSession: OperatorSession = {
        operatorId: data.operatorId,
        role: data.role,
        token: data.token,
        avatarUrl: data.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'
      };
      
      setSession(newSession);
      localStorage.setItem('@RailPulse:session', JSON.stringify(newSession));
    } catch (error) {
      console.error('[AUTH] Erro:', error);
      alert('Erro de Autenticação: Credencial ou Senha inválida.');
      throw error; 
    }
  };

  const updateAvatar = (avatarUrl: string) => {
    if (!session) return;
    const updatedSession = { ...session, avatarUrl };
    setSession(updatedSession);
    localStorage.setItem('@RailPulse:session', JSON.stringify(updatedSession));
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem('@RailPulse:session');
  };

  return (
    <AuthContext.Provider value={{ session, login, logout, updateAvatar }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);