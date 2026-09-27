import { createContext } from 'react';
import type { OperatorSession } from '../types';

/** Desfecho de uma tentativa de login: sessão aberta ou etapa pendente. */
export type LoginOutcome =
  | { status: 'authenticated' }
  | { status: 'mfa'; challengeToken: string }
  | { status: 'password-change'; changeToken: string; minPasswordLength: number };

export interface AuthContextData {
  session: OperatorSession | null;
  /** True enquanto a sessão restaurada do armazenamento local ainda está sendo validada. */
  isRestoring: boolean;
  /** Mensagem exibida na tela de login quando a sessão anterior foi encerrada. */
  sessionNotice: string | null;
  /** Indica se a sessão foi aberta ou se falta o segundo fator / a troca de senha. */
  login: (operatorId: string, password: string) => Promise<LoginOutcome>;
  /** Conclui o login iniciado por `login` quando o operador tem 2FA ativo. */
  completeMfaLogin: (challengeToken: string, code: string) => Promise<LoginOutcome>;
  /** Define a senha definitiva no primeiro acesso e abre a sessão. */
  completePasswordChange: (changeToken: string, newPassword: string) => Promise<void>;
  /** Troca a senha com a sessão aberta, encerrando as demais sessões do operador. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
  /** Encerra a sessão por expiração/revogação, informando o motivo ao operador. */
  expireSession: (reason: string) => void;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  dismissNotice: () => void;
}

export const AuthContext = createContext<AuthContextData | null>(null);
