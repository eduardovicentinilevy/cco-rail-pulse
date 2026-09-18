import { createContext } from 'react';
import type { OperatorSession } from '../types';

export interface AuthContextData {
  session: OperatorSession | null;
  /** True enquanto a sessão restaurada do localStorage ainda está sendo validada. */
  isRestoring: boolean;
  /** Mensagem exibida na tela de login quando a sessão anterior foi encerrada. */
  sessionNotice: string | null;
  /** Devolve `{ mfaRequired: true }` quando a senha está correta mas falta o segundo fator. */
  login: (operatorId: string, password: string) => Promise<{ mfaRequired: boolean; challengeToken?: string }>;
  /** Conclui o login iniciado por `login` quando o operador tem 2FA ativo. */
  completeMfaLogin: (challengeToken: string, code: string) => Promise<void>;
  logout: () => void;
  /** Encerra a sessão por expiração/revogação, informando o motivo ao operador. */
  expireSession: (reason: string) => void;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  dismissNotice: () => void;
}

export const AuthContext = createContext<AuthContextData | null>(null);
