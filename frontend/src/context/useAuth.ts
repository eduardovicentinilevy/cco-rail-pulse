import { useContext } from 'react';
import { AuthContext } from './auth-context';
import type { AuthContextData } from './auth-context';

/** Acesso à sessão do operador. Falha explicitamente fora do AuthProvider. */
export const useAuth = (): AuthContextData => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth precisa ser usado dentro de <AuthProvider>.');
  }
  return context;
};
