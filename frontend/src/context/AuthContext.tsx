import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { OperatorSession } from '../types';
import { AuthContext } from './auth-context';
import { api, ApiError } from '../services/api';
import { wsService } from '../services/websocket.service';
import { DEFAULT_AVATAR_URL, STORAGE_KEYS } from '../config/env';

const readStoredSession = (): OperatorSession | null => {
  const raw = localStorage.getItem(STORAGE_KEYS.session);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<OperatorSession>;
    // Descarta payloads corrompidos ou de versões antigas do app.
    if (!parsed?.token || !parsed.operatorId) throw new Error('sessão inválida');
    return parsed as OperatorSession;
  } catch {
    localStorage.removeItem(STORAGE_KEYS.session);
    return null;
  }
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<OperatorSession | null>(readStoredSession);
  const [isRestoring, setIsRestoring] = useState(() => readStoredSession() !== null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const isMountedRef = useRef(true);

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

  // Valida o token restaurado antes de liberar o painel: um JWT expirado no
  // localStorage não deve dar a impressão de sessão ativa.
  useEffect(() => {
    const restored = readStoredSession();
    // Sem sessão armazenada não há nada a validar — `isRestoring` já nasce falso.
    if (!restored) return;

    let cancelled = false;

    api
      .validateSession(restored.token)
      .then(() => {
        if (!cancelled) setIsRestoring(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setIsRestoring(false);
        if (error instanceof ApiError && error.isAuthError) {
          clearSession('Sua sessão expirou. Autentique-se novamente para reassumir o turno.');
        }
        // Erro de rede: mantém a sessão local — o painel indicará "Core Offline".
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(
    async (operatorId: string, password: string) => {
      const data = await api.login(operatorId, password);
      setSessionNotice(null);
      persist({
        operatorId: data.operatorId,
        name: data.name,
        role: data.role as OperatorSession['role'],
        token: data.token,
        avatarUrl: data.avatarUrl ?? DEFAULT_AVATAR_URL,
      });
    },
    [persist],
  );

  const logout = useCallback(() => {
    const token = session?.token;
    clearSession(null);
    // Auditoria do encerramento é best-effort: não bloqueia a saída do operador.
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
      logout,
      expireSession,
      updateAvatar,
      dismissNotice: () => setSessionNotice(null),
    }),
    [session, isRestoring, sessionNotice, login, logout, expireSession, updateAvatar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
