// frontend/src/services/api.ts
import { apiUrl } from '../config/env';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** Sessão expirada ou credenciamento revogado — o painel deve encerrar o turno. */
  public get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  token?: string;
  body?: unknown;
}

const parseBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/** Cliente HTTP único: injeta o Bearer token e normaliza erros da API. */
export const request = async <T>(path: string, { token, body, headers, ...init }: RequestOptions = {}): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Não foi possível contatar o servidor do CCO. Verifique a rede.', 'NETWORK_ERROR');
  }

  const payload = await parseBody(response);

  if (!response.ok) {
    const details = (payload ?? {}) as { error?: string; code?: string };
    throw new ApiError(response.status, details.error ?? `Falha na requisição (HTTP ${response.status}).`, details.code);
  }

  return payload as T;
};

export const api = {
  login: (operatorId: string, password: string) =>
    request<{ token: string; operatorId: string; name: string; role: string; avatarUrl: string | null }>(
      '/api/auth/login',
      { method: 'POST', body: { operatorId, password } },
    ),

  validateSession: (token: string) => request<{ valid: boolean }>('/api/auth/session', { token }),

  logout: (token: string) => request<null>('/api/auth/logout', { method: 'POST', token }),

  profile: (token: string) =>
    request<{ operatorId: string; name: string; role: string; avatarUrl: string | null }>('/api/operator/profile', {
      token,
    }),

  updateAvatar: (token: string, avatarUrl: string) =>
    request<{ operatorId: string; avatarUrl: string }>('/api/operator/profile/avatar', {
      method: 'PATCH',
      token,
      body: { avatarUrl },
    }),

  stations: (token: string) =>
    request<{ line: string; stations: Array<Record<string, unknown>> }>('/api/network/stations', { token }),

  trains: (token: string) => request<Array<Record<string, unknown>>>('/api/network/trains', { token }),

  auditLogs: (token: string, params: { limit: number; offset: number; search?: string }) => {
    const query = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
    if (params.search?.trim()) query.set('search', params.search.trim());
    return request<{ items: unknown[]; total: number; limit: number; offset: number }>(
      `/api/audit-logs?${query.toString()}`,
      { token },
    );
  },
};
