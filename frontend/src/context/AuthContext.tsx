import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { OperatorSession } from '../types';
import { AuthContext } from './auth-context';
import type { LoginOutcome } from './auth-context';
import { api, ApiError, isMfaRequired, isPasswordChangeRequired } from '../services/api';
import type { LoginResult, LoginSession } from '../services/api';
import { wsService } from '../services/websocket.service';
import { DEFAULT_AVATAR_URL, STORAGE_KEYS } from '../config/env';

/** Antecedência com que o access token é renovado, para nunca expirar em uso. */
const REFRESH_MARGIN_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 5_000;

const readStoredSession = (): OperatorSession | null => {
  const raw = localStorage.getItem(STORAGE_KEYS.session);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OperatorSession>;
    // Descarta payloads corrompidos ou de versões antigas do app.
    if (!parsed?.token || !parsed.refreshToken || !parsed.operatorId) throw new Error('sessão inválida');
    return parsed as OperatorSession;
  } catch {
    localStorage.removeItem(STORAGE_KEYS.session);
    return null;
  }
};

const toSession = (data: LoginSession): OperatorSession => ({
  operatorId: data.operatorId,
  name: data.name,
  role: data.role as OperatorSession['role'],
  token: data.accessToken,
  refreshToken: data.refreshToken,
  expiresAt: Date.now() + data.expiresIn * 1000,
  avatarUrl: data.avatarUrl ?? DEFAULT_AVATAR_URL,
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<OperatorSession | null>(readStoredSession);
  const [isRestoring, setIsRestoring] = useState(() => readStoredSession() !== null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  /** Renovação em andamento: evita que dois efeitos queimem dois refresh tokens. */
  const refreshInFlightRef = useRef<Promise<OperatorSession | null> | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const persist = useCallback((next: OperatorSession | null) => {
    setSession(next);
    if (next) localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEYS.session);
  }, []);

  const clearSession = useCallback(
    (notice: string | null) => {
      wsService.disconnect();
      persist(null);
      setSessionNotice(notice);
    },
    [persist],
  );

  /**
   * Renova o par de tokens. A promessa é compartilhada enquanto está em voo para
   * que o token de renovação — que é de uso único — não seja apresentado duas vezes.
   */
  const refreshSession = useCallback(
    (refreshToken: string): Promise<OperatorSession | null> => {
      if (refreshInFlightRef.current) return refreshInFlightRef.current;

      const attempt = api
        .refresh(refreshToken)
        .then((data) => {
          const next = toSession(data);
          persist(next);
          return next;
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isAuthError) {
            // Outra aba pode ter renovado primeiro e gravado o par novo.
            const stored = readStoredSession();
            if (stored && stored.refreshToken !== refreshToken) {
              persist(stored);
              return stored;
            }
            clearSession('Sua sessão expirou. Autentique-se novamente para reassumir o turno.');
            return null;
          }
          // Falha de rede: mantém a sessão local — o painel indicará "Core Offline".
          throw error;
        })
        .finally(() => {
          refreshInFlightRef.current = null;
        });

      refreshInFlightRef.current = attempt;
      return attempt;
    },
    [clearSession, persist],
  );

  // Valida a sessão restaurada antes de liberar o painel: um token vencido no
  // armazenamento local não deve dar a impressão de sessão ativa.
  useEffect(() => {
    const restored = readStoredSession();
    // Sem sessão armazenada não há nada a validar — `isRestoring` já nasce falso.
    if (!restored) return;

    let cancelled = false;
    const finish = () => {
      if (!cancelled && isMountedRef.current) setIsRestoring(false);
    };

    const isExpiring = !restored.expiresAt || restored.expiresAt - Date.now() <= REFRESH_MARGIN_MS;
    const validation = isExpiring
      ? refreshSession(restored.refreshToken)
      : api.validateSession(restored.token);

    validation
      .then(finish)
      .catch((error: unknown) => {
        finish();
        if (cancelled) return;
        if (error instanceof ApiError && error.isAuthError) {
          clearSession('Sua sessão expirou. Autentique-se novamente para reassumir o turno.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession, refreshSession]);

  // Renova em segundo plano, um pouco antes do vencimento, para que o operador
  // não seja deslogado no meio de um turno.
  useEffect(() => {
    if (!session?.expiresAt) return;

    const delay = Math.max(session.expiresAt - Date.now() - REFRESH_MARGIN_MS, MIN_REFRESH_DELAY_MS);
    const timer = window.setTimeout(() => {
      void refreshSession(session.refreshToken).catch(() => undefined);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [session?.expiresAt, session?.refreshToken, refreshSession]);

  const finalizeLogin = useCallback(
    (data: LoginSession): LoginOutcome => {
      setSessionNotice(null);
      persist(toSession(data));
      return { status: 'authenticated' };
    },
    [persist],
  );

  const resolveLoginResult = useCallback(
    (result: LoginResult): LoginOutcome => {
      if (isMfaRequired(result)) return { status: 'mfa', challengeToken: result.challengeToken };
      if (isPasswordChangeRequired(result)) {
        return {
          status: 'password-change',
          changeToken: result.changeToken,
          minPasswordLength: result.minPasswordLength,
        };
      }
      return finalizeLogin(result);
    },
    [finalizeLogin],
  );

  const login = useCallback(
    async (operatorId: string, password: string) => resolveLoginResult(await api.login(operatorId, password)),
    [resolveLoginResult],
  );

  const completeMfaLogin = useCallback(
    async (challengeToken: string, code: string) => resolveLoginResult(await api.loginMfa(challengeToken, code)),
    [resolveLoginResult],
  );

  const completePasswordChange = useCallback(
    async (changeToken: string, newPassword: string) => {
      finalizeLogin(await api.setInitialPassword(changeToken, newPassword));
    },
    [finalizeLogin],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!session) return;
      // A troca derruba as demais sessões e devolve um par novo para esta aba.
      finalizeLogin(await api.changePassword(session.token, currentPassword, newPassword));
    },
    [finalizeLogin, session],
  );

  const logout = useCallback(() => {
    const token = session?.token;
    clearSession(null);
    // Revogar no servidor é best-effort: não bloqueia a saída do operador.
    if (token) void api.logout(token).catch(() => undefined);
  }, [clearSession, session?.token]);

  const expireSession = useCallback((reason: string) => clearSession(reason), [clearSession]);

  const updateAvatar = useCallback(
    async (avatarUrl: string) => {
      if (!session) return;
      const { avatarUrl: persisted } = await api.updateAvatar(session.token, avatarUrl);
      if (isMountedRef.current) persist({ ...session, avatarUrl: persisted });
    },
    [persist, session],
  );

  const value = useMemo(
    () => ({
      session,
      isRestoring,
      sessionNotice,
      login,
      completeMfaLogin,
      completePasswordChange,
      changePassword,
      logout,
      expireSession,
      updateAvatar,
      dismissNotice: () => setSessionNotice(null),
    }),
    [
      session,
      isRestoring,
      sessionNotice,
      login,
      completeMfaLogin,
      completePasswordChange,
      changePassword,
      logout,
      expireSession,
      updateAvatar,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
