// backend/presentation/http/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { extractBearerToken, verifyOperatorToken } from '../../../shared/jwt';
import type { OperatorTokenPayload } from '../../../shared/jwt';
import { authSessionService } from '../../../infrastructure/auth/session-service';
import { can } from '../../../domain/roles';
import type { Permission } from '../../../domain/roles';

export interface AuthenticatedRequest extends Request {
  operator?: OperatorTokenPayload;
}

/**
 * Autentica pelo access token e confere se a sessão continua viva.
 *
 * A assinatura sozinha não basta: um logout, uma troca de senha ou a desativação
 * do operador precisam invalidar o token imediatamente, e não só quando ele vencer.
 */
export const verifyJwt: RequestHandler = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
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

  authSessionService
    .isActive(operator.sessionId)
    .then((isActive) => {
      if (!isActive) {
        res.status(401).json({ error: 'Sessão encerrada. Autentique-se novamente.', code: 'SESSION_REVOKED' });
        return;
      }
      req.operator = operator;
      next();
    })
    .catch(next);
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
