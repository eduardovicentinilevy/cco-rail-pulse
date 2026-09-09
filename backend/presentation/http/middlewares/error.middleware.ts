// backend/presentation/http/middlewares/error.middleware.ts
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../../shared/errors';
import { createLogger } from '../../../shared/logger';

const logger = createLogger('HTTP');

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.originalUrl}`, code: 'ROUTE_NOT_FOUND' });
};

/** Error handler central: converte AppError em resposta e blinda erros inesperados. */
export const errorHandler = (error: unknown, req: Request, res: Response, _next: NextFunction): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: error.message, code: error.code });
    return;
  }

  logger.error(`Falha não tratada em ${req.method} ${req.originalUrl}`, error);
  res.status(500).json({ error: 'Erro interno no servidor.', code: 'INTERNAL_ERROR' });
};
