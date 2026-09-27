// backend/shared/logger.ts
import { AsyncLocalStorage } from 'async_hooks';

import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const LEVEL_ICON: Record<LogLevel, string> = {
  debug: '·',
  info: 'i',
  warn: '!',
  error: '×',
};

/** Campos herdados por todo log emitido dentro de um mesmo fluxo (ex.: uma requisição HTTP). */
export interface LogContext {
  requestId?: string;
  operatorId?: string;
}

const contextStorage = new AsyncLocalStorage<LogContext>();

/** Executa o bloco com campos que passam a acompanhar cada log emitido dentro dele. */
export const withLogContext = <T>(context: LogContext, handler: () => T): T =>
  contextStorage.run({ ...contextStorage.getStore(), ...context }, handler);

/** Acrescenta campos ao contexto ativo — ex.: o operador, conhecido só após o JWT. */
export const assignLogContext = (fields: LogContext): void => {
  const store = contextStorage.getStore();
  if (store) Object.assign(store, fields);
};

/** Contexto ativo, quando houver — útil para ecoar o requestId na resposta. */
export const currentLogContext = (): LogContext => contextStorage.getStore() ?? {};

const serializeError = (error: Error): Record<string, unknown> => ({
  name: error.name,
  message: error.message,
  stack: error.stack,
  ...('code' in error ? { code: (error as NodeJS.ErrnoException).code } : {}),
});

/**
 * Normaliza o segundo argumento dos métodos do logger. Erros viram um objeto
 * estruturado (nunca `{}`, como aconteceria em um JSON.stringify direto) e
 * objetos comuns entram como campos do evento.
 */
const serializeMeta = (meta: unknown): Record<string, unknown> => {
  if (meta === undefined) return {};
  if (meta instanceof Error) return { error: serializeError(meta) };
  if (Array.isArray(meta)) return { detail: meta };
  if (meta !== null && typeof meta === 'object') return meta as Record<string, unknown>;
  return { detail: meta };
};

const enabled = (level: LogLevel): boolean => LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[env.logLevel];

const sinkFor = (level: LogLevel): ((...args: unknown[]) => void) =>
  level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

const writeJson = (level: LogLevel, scope: string, message: string, meta: Record<string, unknown>): void => {
  const event = {
    timestamp: new Date().toISOString(),
    level,
    service: env.serviceName,
    version: env.appVersion,
    environment: env.nodeEnv,
    scope,
    message,
    ...currentLogContext(),
    ...meta,
  };

  // Uma linha por evento: é o formato que Docker, Loki, CloudWatch e afins consomem.
  sinkFor(level)(JSON.stringify(event));
};

const writePretty = (level: LogLevel, scope: string, message: string, meta: Record<string, unknown>): void => {
  const { requestId } = currentLogContext();
  const tag = requestId ? ` (${requestId.slice(0, 8)})` : '';
  const line = `${new Date().toISOString()} ${LEVEL_ICON[level]} [${scope}]${tag} ${message}`;
  const sink = sinkFor(level);

  if (Object.keys(meta).length === 0) sink(line);
  else sink(line, meta);
};

const write = (level: LogLevel, scope: string, message: string, meta?: unknown): void => {
  if (!enabled(level)) return;
  const fields = serializeMeta(meta);
  if (env.logFormat === 'json') writeJson(level, scope, message, fields);
  else writePretty(level, scope, message, fields);
};

/**
 * Logger com escopo por módulo e saída estruturada.
 *
 * Em produção emite uma linha JSON por evento (`LOG_FORMAT=json`), pronta para
 * ser coletada sem parser customizado; em desenvolvimento mantém a saída legível.
 */
export const createLogger = (scope: string) => ({
  debug: (message: string, meta?: unknown) => write('debug', scope, message, meta),
  info: (message: string, meta?: unknown) => write('info', scope, message, meta),
  warn: (message: string, meta?: unknown) => write('warn', scope, message, meta),
  error: (message: string, meta?: unknown) => write('error', scope, message, meta),
});

export type Logger = ReturnType<typeof createLogger>;
