type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ICON: Record<LogLevel, string> = {
  debug: '·',
  info: 'i',
  warn: '!',
  error: '×',
};

const write = (level: LogLevel, scope: string, message: string, meta?: unknown) => {
  const line = `${new Date().toISOString()} ${LEVEL_ICON[level]} [${scope}] ${message}`;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta === undefined) sink(line);
  else sink(line, meta);
};

/** Logger mínimo e sem dependências, com escopo por módulo. */
export const createLogger = (scope: string) => ({
  debug: (message: string, meta?: unknown) => write('debug', scope, message, meta),
  info: (message: string, meta?: unknown) => write('info', scope, message, meta),
  warn: (message: string, meta?: unknown) => write('warn', scope, message, meta),
  error: (message: string, meta?: unknown) => write('error', scope, message, meta),
});

export type Logger = ReturnType<typeof createLogger>;
