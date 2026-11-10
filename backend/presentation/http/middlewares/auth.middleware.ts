// backend/presentation/http/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { extractBearerToken, verifyOperatorToken } from '../../../shared/jwt';
import type { OperatorTokenPayload } from '../../../shared/jwt';
import { authSessionService } from '../../../infrastructure/auth/session-service';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { can } from '../../../domain/roles';
import type { Permission } from '../../../domain/roles';

export interface AuthenticatedRequest extends Request {
  operator?: OperatorTokenPayload;
}

/**
 * Autentica pelo access token, confere se a sessão continua viva e revalida o
 * operador contra o estado atual do banco.
 *
 * A assinatura sozinha não prova nada além de que o servidor assinou o token uma vez:
 * um logout, uma troca de senha, um rebaixamento de perfil ou a desativação da conta
 * precisam valer na hora, e não só quando o token vencer. São duas checagens porque
 * cobrem coisas diferentes — a sessão responde por "este token ainda vale", e a leitura
 * do operador responde por "esta conta ainda existe com este perfil".
 * `operatorRepository.findById` já filtra `is_active = TRUE`, então um operador
 * desativado simplesmente não é encontrado aqui.
 */
export const verifyJwt = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const token = extractBearerToken(req.headers.authorization);

  if (!token) {
    res.status(401).json({ error: 'Acesso negado. Token JWT ausente ou malformado.', code: 'TOKEN_MISSING' });
    return;
  }

  const payload = verifyOperatorToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Sessão expirada ou token inválido.', code: 'TOKEN_INVALID' });
    return;
  }

  if (!(await authSessionService.isActive(payload.sessionId))) {
    res.status(401).json({ error: 'Sessão encerrada. Autentique-se novamente.', code: 'SESSION_REVOKED' });
    return;
  }

  const operator = await operatorRepository.findById(payload.operatorId);

  if (!operator) {
    res.status(401).json({ error: 'Credenciamento revogado ou operador inativo.', code: 'REVOKED' });
    return;
  }

  // O perfil vem sempre fresco do banco — nunca do token, que pode carregar um perfil
  // já trocado desde que foi assinado.
  req.operator = { operatorId: operator.id, role: operator.role, sessionId: payload.sessionId };
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
