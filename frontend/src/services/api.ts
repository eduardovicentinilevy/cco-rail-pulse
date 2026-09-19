// frontend/src/services/api.ts
import { apiUrl } from '../config/env';
import type { LineIdentity, TenantIdentity } from '../types';

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

export interface LoginSession {
  token: string;
  /** Crachá do operador. A chave interna do cadastro nunca sai do backend. */
  operatorId: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  tenant: TenantIdentity;
  line: LineIdentity;
}

export interface LoginMfaRequired {
  mfaRequired: true;
  challengeToken: string;
}

export type LoginResult = LoginSession | LoginMfaRequired;

export const isMfaRequired = (result: LoginResult): result is LoginMfaRequired => 'mfaRequired' in result;

export const api = {
  /**
   * `tenantSlug` identifica o cliente. Quando omitido, o backend resolve pelo
   * subdomínio (em produção) ou cai no cliente padrão da instalação.
   */
  login: (operatorId: string, password: string, tenantSlug?: string) =>
    request<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: tenantSlug ? { operatorId, password, tenantSlug } : { operatorId, password },
    }),

  loginMfa: (challengeToken: string, code: string) =>
    request<LoginSession>('/api/auth/login/mfa', { method: 'POST', body: { challengeToken, code } }),

  validateSession: (token: string) => request<{ valid: boolean }>('/api/auth/session', { token }),

  // --- Autenticação em duas etapas (2FA) ------------------------------------

  mfaStatus: (token: string) => request<{ enabled: boolean }>('/api/operator/mfa', { token }),

  mfaEnroll: (token: string) =>
    request<{ secret: string; otpauthUrl: string }>('/api/operator/mfa/enroll', { method: 'POST', token }),

  mfaConfirm: (token: string, code: string) =>
    request<{ enabled: true }>('/api/operator/mfa/confirm', { method: 'POST', token, body: { code } }),

  mfaDisable: (token: string, password: string) =>
    request<{ enabled: false }>('/api/operator/mfa/disable', { method: 'POST', token, body: { password } }),

  health: () =>
    request<{
      service: string;
      environment: string;
      architecture: string;
      status: string;
      database: string;
      databaseTime?: string;
      uptimeSeconds: number;
      telemetryIntervalMs: number;
      timestamp: string;
    }>('/health'),

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
    request<{ tenant: TenantIdentity; line: LineIdentity; stations: Array<Record<string, unknown>> }>(
      '/api/network/stations',
      { token },
    ),

  trains: (token: string) => request<Array<Record<string, unknown>>>('/api/network/trains', { token }),

  // --- Ocorrências ---------------------------------------------------------

  incidents: (
    token: string,
    params: { limit: number; offset: number; status?: string; severity?: string; search?: string },
  ) => {
    const query = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
    if (params.status) query.set('status', params.status);
    if (params.severity) query.set('severity', params.severity);
    if (params.search?.trim()) query.set('search', params.search.trim());
    return request<{ items: unknown[]; total: number; limit: number; offset: number }>(
      `/api/incidents?${query.toString()}`,
      { token },
    );
  },

  incidentStats: (token: string) =>
    request<{
      open: number;
      inProgress: number;
      resolved: number;
      critical: number;
      averageResolutionMinutes: number | null;
    }>('/api/incidents/stats', { token }),

  createIncident: (token: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/incidents', { method: 'POST', token, body }),

  changeIncidentStatus: (token: string, id: string, body: { status: string; resolutionNote?: string }) =>
    request<Record<string, unknown>>(`/api/incidents/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      token,
      body,
    }),

  // --- Equipe --------------------------------------------------------------

  team: (token: string) =>
    request<{ roles: Array<{ value: string; label: string }>; operators: unknown[] }>('/api/team', { token }),

  createOperator: (token: string, body: { id: string; name: string; role: string; password: string }) =>
    request<Record<string, unknown>>('/api/team', { method: 'POST', token, body }),

  changeOperatorRole: (token: string, id: string, role: string) =>
    request<Record<string, unknown>>(`/api/team/${encodeURIComponent(id)}/role`, {
      method: 'PATCH',
      token,
      body: { role },
    }),

  setOperatorActive: (token: string, id: string, isActive: boolean) =>
    request<Record<string, unknown>>(`/api/team/${encodeURIComponent(id)}/active`, {
      method: 'PATCH',
      token,
      body: { isActive },
    }),

  // --- Passagem de turno ---------------------------------------------------

  shiftReport: (token: string, since: string) =>
    request<Record<string, unknown>>(`/api/shift/report?since=${encodeURIComponent(since)}`, { token }),

  // --- Série histórica -----------------------------------------------------

  telemetryHistory: (token: string, params: { hours: number; stations: string[] }) => {
    const query = new URLSearchParams({ hours: String(params.hours) });
    if (params.stations.length > 0) query.set('stations', params.stations.join(','));
    return request<{ hours: number; samples: unknown[]; summary: unknown[] }>(
      `/api/network/telemetry/history?${query.toString()}`,
      { token },
    );
  },

  auditLogs: (token: string, params: { limit: number; offset: number; search?: string }) => {
    const query = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
    if (params.search?.trim()) query.set('search', params.search.trim());
    return request<{ items: unknown[]; total: number; limit: number; offset: number }>(
      `/api/audit-logs?${query.toString()}`,
      { token },
    );
  },

  // --- Central de Alarmes ---------------------------------------------------

  alarms: (
    token: string,
    params: { limit: number; offset: number; severity?: string; acknowledged?: boolean; search?: string },
  ) => {
    const query = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
    if (params.severity) query.set('severity', params.severity);
    if (params.acknowledged !== undefined) query.set('acknowledged', String(params.acknowledged));
    if (params.search?.trim()) query.set('search', params.search.trim());
    return request<{ items: unknown[]; total: number; limit: number; offset: number }>(
      `/api/alarms?${query.toString()}`,
      { token },
    );
  },

  alarmStats: (token: string) =>
    request<{ total: number; unacknowledged: number; criticalUnacknowledged: number; last24h: number }>(
      '/api/alarms/stats',
      { token },
    ),

  acknowledgeAlarm: (token: string, id: string) =>
    request<Record<string, unknown>>(`/api/alarms/${encodeURIComponent(id)}/ack`, { method: 'PATCH', token }),

  // --- Comunicações ----------------------------------------------------------

  communicationsMeta: (token: string) =>
    request<{ channels: Array<{ value: string; label: string }>; directions: string[] }>(
      '/api/communications/meta',
      { token },
    ),

  communications: (token: string, params: { limit: number; offset: number; channel?: string; search?: string }) => {
    const query = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
    if (params.channel) query.set('channel', params.channel);
    if (params.search?.trim()) query.set('search', params.search.trim());
    return request<{ items: unknown[]; total: number; limit: number; offset: number }>(
      `/api/communications?${query.toString()}`,
      { token },
    );
  },

  createCommunication: (token: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>('/api/communications', { method: 'POST', token, body }),

  // --- Procedimentos operacionais ---------------------------------------------

  proceduresMeta: (token: string) =>
    request<{ categories: Array<{ value: string; label: string }> }>('/api/procedures/meta', { token }),

  procedures: (token: string, params: { category?: string; search?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.category) query.set('category', params.category);
    if (params.search?.trim()) query.set('search', params.search.trim());
    const suffix = query.toString();
    return request<{ items: unknown[] }>(`/api/procedures${suffix ? `?${suffix}` : ''}`, { token });
  },
};
