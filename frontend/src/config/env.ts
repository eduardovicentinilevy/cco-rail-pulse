// frontend/src/config/env.ts

/**
 * Origem do backend RailPulse CCO.
 *
 * Em desenvolvimento pode ficar vazia: o Vite faz proxy de `/api` e `/socket.io`
 * para o backend, evitando hardcode de `http://localhost:3333` pelo código.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** URL absoluta de um endpoint da API. */
export const apiUrl = (path: string): string => `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;

/** Origem usada pelo Socket.IO (string vazia = mesma origem servida pelo Vite). */
export const SOCKET_URL: string = API_URL;

/**
 * Exibe o campo de cliente na tela de acesso.
 *
 * Em produção o cliente vem do subdomínio e o campo é ruído; em desenvolvimento,
 * onde não há subdomínio, é a única forma de entrar como outro cliente.
 */
export const TENANT_PROMPT: boolean = String(import.meta.env.VITE_TENANT_PROMPT ?? '').toLowerCase() === 'true';

export const STORAGE_KEYS = {
  session: '@RailPulse:session',
  preferences: '@RailPulse:preferences',
} as const;

export { AVATAR_PLACEHOLDER as DEFAULT_AVATAR_URL } from '../assets/avatar-placeholder';
