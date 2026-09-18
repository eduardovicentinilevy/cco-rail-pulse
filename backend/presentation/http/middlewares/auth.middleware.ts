// backend/presentation/http/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { extractBearerToken, verifyOperatorToken } from '../../../shared/jwt';
import type { OperatorTokenPayload } from '../../../shared/jwt';
import { can } from '../../../domain/roles';
import { assignLogContext } from '../../../shared/logger';
import type { Permission } from '../../../domain/roles';

export interface AuthenticatedRequest extends Request {
  operator?: OperatorTokenPayload;
}

export const verifyJwt = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ error: 'Acesso negado. Token JWT ausente ou malformado.', code: 'TOKEN_MISSING' });
    return;
  }

  const operator = verifyOperatorToken(token);

  if (!operator) {
    res.status(401).json({ error: 'Sessão expirada ou token inválido.', code: 'TOKEN_INVALID' });
    return;
  }

  req.operator = operator;
  // Correlaciona os logs da requisição ao operador autenticado.
  assignLogContext({ operatorId: operator.operatorId });
  next();
};

/** Restringe uma rota a perfis específicos de operador. */
export const requireRole = (...roles: string[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.operator || !roles.includes(req.operator.role)) {
      res.status(403).json({ error: 'Credenciamento insuficiente para esta operação.', code: 'FORBIDDEN' });
      return;
    }
    next();
  };

/**
 * Restringe uma rota por permissão em vez de perfil literal.
 * Como os perfis são hierárquicos, isso evita listar cada nível superior em toda rota.
 */
export const requirePermission = (permission: Permission) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!can(req.operator?.role, permission)) {
      res.status(403).json({
        error: 'Credenciamento insuficiente para esta operação.',
        code: 'FORBIDDEN',
        requiredPermission: permission,
      });
      return;
    }
    next();
  };
