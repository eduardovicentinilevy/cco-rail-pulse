import { createContext } from 'react';
import type { OperatorSession } from '../types';

export interface AuthContextData {
  session: OperatorSession | null;
  login: (operatorId: string, password?: string) => Promise<void>;
  logout: () => void;
  updateAvatar: (avatarUrl: string) => void;
}

export const AuthContext = createContext<AuthContextData>({} as AuthContextData);
