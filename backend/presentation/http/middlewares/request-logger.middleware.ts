// backend/presentation/http/middlewares/request-logger.middleware.ts
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import { createLogger, withLogContext } from '../../../shared/logger';

const logger = createLogger('HTTP');

/** Sondas de infraestrutura batem de segundo em segundo; no nível `info` só fariam ruído. */
const PROBE_PATHS = new Set(['/health', '/health/live', '/health/ready']);

const RESPONSE_HEADER = 'X-Request-Id';

/**
 * Log de acesso estruturado, com um identificador por requisição.
 *
 * O identificador vem do cabeçalho `X-Request-Id` quando o proxy já emite um
 * (preservando a correlação de ponta a ponta) e volta na resposta, de modo que
 * um operador possa citar o id de uma falha e encontrá-la no agregador de logs.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const inbound = req.headers['x-request-id'];
  const requestId = (Array.isArray(inbound) ? inbound[0] : inbound)?.trim() || crypto.randomUUID();
  const startedAt = process.hrtime.bigint();

  res.setHeader(RESPONSE_HEADER, requestId);

  withLogContext({ requestId }, () => {
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const event = {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
        ip: req.ip,
      };

      const message = `${req.method} ${req.originalUrl} ${res.statusCode}`;

      if (res.statusCode >= 500) logger.error(message, event);
      else if (res.statusCode >= 400) logger.warn(message, event);
      else if (PROBE_PATHS.has(req.path)) logger.debug(message, event);
      else logger.info(message, event);
    });

    next();
  });
};
