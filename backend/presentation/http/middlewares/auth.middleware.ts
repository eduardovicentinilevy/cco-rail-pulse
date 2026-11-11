// backend/presentation/http/middlewares/auth.middleware.ts
import type { Request, Response, NextFunction } from 'express';
import { extractBearerToken, verifyOperatorToken } from '../../../shared/jwt';
import type { OperatorTokenPayload } from '../../../shared/jwt';
import { lineCatalogRepository } from '../../../infrastructure/repositories/pg-line-catalog.repository';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import type { LineCatalog } from '../../../domain/line';
import { can } from '../../../domain/roles';
import type { Permission } from '../../../domain/roles';

export interface AuthenticatedRequest extends Request {
  operator?: OperatorTokenPayload;
}

/** Requisição já resolvida pelo `withLineCatalog`, com a malha da linha da sessão. */
export interface ScopedRequest extends AuthenticatedRequest {
  catalog?: LineCatalog;
}

/**
 * Valida a assinatura do token E revalida o operador contra o estado atual do banco.
 *
 * Um JWT válido só prova que o servidor o assinou uma vez — não prova que a conta segue
 * ativa nem que o perfil embutido nele ainda é o vigente. Sem esta segunda checagem,
 * desativar um operador ou rebaixar seu perfil em `Equipe` não teria efeito algum sobre
 * uma sessão já aberta até o token expirar sozinho (até `JWT_EXPIRES_IN`, um turno
 * inteiro por padrão) — a funcionalidade de "revogar credencial" seria só decorativa.
 * `operatorRepository.findById` já filtra `is_active = TRUE`, então um operador
 * desativado simplesmente não é encontrado aqui, e recebe o cliente do token, então a
 * busca nunca alcança o operador de outro cliente.
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

  const operator = await operatorRepository.findById(payload.tenantId, payload.operatorId);

  if (!operator) {
    res.status(401).json({ error: 'Credenciamento revogado ou operador inativo.', code: 'REVOKED' });
    return;
  }

  // O escopo (cliente e linha) vem do token, que é assinado; o perfil vem sempre fresco
  // do banco — nunca do token, que pode carregar um perfil já trocado desde que foi
  // assinado.
  req.operator = { ...payload, role: operator.role };
  next();
};

/**
 * Carrega a malha da linha da sessão e confirma que ela pertence ao cliente do
 * token. Roda depois do `verifyJwt` nas rotas que precisam do catálogo.
 */
export const withLineCatalog = async (req: ScopedRequest, res: Response, next: NextFunction): Promise<void> => {
  const operator = req.operator;
  if (!operator) {
    res.status(401).json({ error: 'Sessão expirada ou token inválido.', code: 'TOKEN_INVALID' });
    return;
  }

  try {
    req.catalog = await lineCatalogRepository.requireInTenant(operator.lineId, operator.tenantId);
    next();
  } catch {
    // A linha saiu do ar (desativada ou removida) enquanto a sessão seguia aberta.
    res.status(403).json({ error: 'A linha desta sessão não está mais disponível.', code: 'LINE_UNAVAILABLE' });
  }
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
