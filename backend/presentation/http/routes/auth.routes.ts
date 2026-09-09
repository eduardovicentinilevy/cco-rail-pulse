// backend/presentation/http/routes/auth.routes.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { env } from '../../../config/env';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { signOperatorToken } from '../../../shared/jwt';
import { ValidationError } from '../../../shared/errors';
import { RateLimiter } from '../middlewares/rate-limit.middleware';
import { verifyJwt } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const authRouter: Router = Router();

const loginLimiter = new RateLimiter(env.loginMaxAttempts, env.loginWindowMs);

/**
 * Hash descartável usado quando a credencial não existe.
 * Gerado uma única vez no boot para que o custo de CPU do `compare` seja o mesmo
 * de um login legítimo — mitigação de *timing attack* na enumeração de operadores.
 */
const decoyHashPromise = bcrypt.hash('decoy-password-for-constant-time-compare', env.bcryptRounds);

authRouter.post('/login', async (req, res) => {
  const operatorId = typeof req.body?.operatorId === 'string' ? req.body.operatorId.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!operatorId || !password) {
    throw new ValidationError('Credencial e senha são obrigatórias.');
  }

  const rateKey = `${req.ip ?? 'unknown'}:${operatorId.toUpperCase()}`;
  loginLimiter.consume(rateKey);

  const operator = await operatorRepository.findById(operatorId);
  const invalidCredentials = { error: 'Credencial inválida ou operador inativo.', code: 'INVALID_CREDENTIALS' };

  if (!operator) {
    await bcrypt.compare(password, await decoyHashPromise);
    return res.status(401).json(invalidCredentials);
  }

  const isPasswordValid = await bcrypt.compare(password, operator.password_hash);

  if (!isPasswordValid) {
    await operatorRepository.logAudit(operator.id, 'LOGIN_FAILED', 'AUTH_SYSTEM', 'UNAUTHORIZED');
    return res.status(401).json(invalidCredentials);
  }

  loginLimiter.reset(rateKey);
  await operatorRepository.logAudit(operator.id, 'LOGIN_SUCCESS', 'AUTH_SYSTEM', 'SUCCESS');

  return res.status(200).json({
    token: signOperatorToken({ operatorId: operator.id, role: operator.role }),
    operatorId: operator.id,
    name: operator.name,
    role: operator.role,
    avatarUrl: operator.avatar_url,
  });
});

/** Permite ao frontend validar a sessão restaurada do localStorage. */
authRouter.get('/session', verifyJwt, (req: AuthenticatedRequest, res) => {
  res.status(200).json({ valid: true, operator: req.operator });
});

authRouter.post('/logout', verifyJwt, async (req: AuthenticatedRequest, res) => {
  await operatorRepository.logAudit(req.operator!.operatorId, 'LOGOUT', 'AUTH_SYSTEM', 'SUCCESS');
  res.status(204).send();
});
