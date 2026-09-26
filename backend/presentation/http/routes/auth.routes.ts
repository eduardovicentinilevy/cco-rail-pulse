// backend/presentation/http/routes/auth.routes.ts
import { Router } from 'express';
import type { Response } from 'express';
import bcrypt from 'bcrypt';
import { env } from '../../../config/env';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import type { OperatorEntity } from '../../../infrastructure/repositories/pg-operator.repository';
import { signMfaChallengeToken, signOperatorToken, verifyMfaChallengeToken } from '../../../shared/jwt';
import { verifyTotpStep } from '../../../shared/totp';
import { ValidationError } from '../../../shared/errors';
import { RateLimiter } from '../middlewares/rate-limit.middleware';
import { verifyJwt } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const authRouter: Router = Router();

/** Resposta de sessão emitida tanto pelo login direto quanto pela conclusão do 2FA. */
const issueSession = (res: Response, operator: OperatorEntity): void => {
  res.status(200).json({
    token: signOperatorToken({ operatorId: operator.id, role: operator.role }),
    operatorId: operator.id,
    name: operator.name,
    role: operator.role,
    avatarUrl: operator.avatar_url,
  });
};

const loginLimiter = new RateLimiter(env.loginMaxAttempts, env.loginWindowMs);
/**
 * Reforço independente de IP: a chave acima (`IP:credencial`) já limita força bruta
 * por origem, mas `req.ip` só é confiável quando não há proxy mentindo sobre o cliente
 * real. Este segundo limitador, chaveado só pela credencial, garante um teto total de
 * tentativas contra uma conta específica mesmo que o componente de IP seja neutralizado
 * (proxy mal configurado, ou simplesmente muitos IPs de verdade em paralelo).
 */
const loginLimiterByOperator = new RateLimiter(env.loginMaxAttempts, env.loginWindowMs);
// Um código de 6 dígitos tem 1.000.000 de combinações — mesmo um limite folgado
// torna a força bruta impraticável dentro da validade do desafio (5 minutos).
const mfaLimiter = new RateLimiter(8, 60_000);

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

  const normalizedId = operatorId.toUpperCase();
  const rateKey = `${req.ip ?? 'unknown'}:${normalizedId}`;
  loginLimiter.consume(rateKey);
  loginLimiterByOperator.consume(normalizedId);

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
  loginLimiterByOperator.reset(normalizedId);

  // Segundo fator ativo: a senha só abre um desafio de 5 minutos, nunca a sessão em si.
  if (operator.mfa_enabled) {
    await operatorRepository.logAudit(operator.id, 'LOGIN_MFA_CHALLENGE', 'AUTH_SYSTEM', 'PENDING');
    return res.status(200).json({ mfaRequired: true, challengeToken: signMfaChallengeToken(operator.id) });
  }

  await operatorRepository.logAudit(operator.id, 'LOGIN_SUCCESS', 'AUTH_SYSTEM', 'SUCCESS');
  return issueSession(res, operator);
});

/** Segunda etapa do login: troca o desafio de senha por uma sessão, mediante o código do autenticador. */
authRouter.post('/login/mfa', async (req, res) => {
  const challengeToken = typeof req.body?.challengeToken === 'string' ? req.body.challengeToken : '';
  const code = typeof req.body?.code === 'string' ? req.body.code : '';

  const operatorId = verifyMfaChallengeToken(challengeToken);
  const invalidChallenge = { error: 'Desafio de autenticação inválido ou expirado. Faça login novamente.', code: 'INVALID_CHALLENGE' };

  if (!operatorId) {
    return res.status(401).json(invalidChallenge);
  }

  mfaLimiter.consume(operatorId);

  const operator = await operatorRepository.findById(operatorId);
  if (!operator || !operator.mfa_enabled || !operator.mfa_secret) {
    return res.status(401).json(invalidChallenge);
  }

  const step = verifyTotpStep(operator.mfa_secret, code);
  const lastUsedStep = operator.mfa_last_used_step == null ? null : Number(operator.mfa_last_used_step);

  // Código não bate, ou bate mas já foi usado (mesmo passo ou um anterior) — nunca aceitar de novo.
  if (step === null || (lastUsedStep !== null && step <= lastUsedStep)) {
    await operatorRepository.logAudit(operator.id, 'LOGIN_MFA_FAILED', 'AUTH_SYSTEM', 'UNAUTHORIZED');
    return res.status(401).json({ error: 'Código de verificação inválido.', code: 'INVALID_MFA_CODE' });
  }

  await operatorRepository.setMfaLastUsedStep(operator.id, step);
  mfaLimiter.reset(operatorId);
  await operatorRepository.logAudit(operator.id, 'LOGIN_SUCCESS', 'AUTH_SYSTEM', 'SUCCESS');
  return issueSession(res, operator);
});

/** Permite ao frontend validar a sessão restaurada do localStorage. */
authRouter.get('/session', verifyJwt, (req: AuthenticatedRequest, res) => {
  res.status(200).json({ valid: true, operator: req.operator });
});

authRouter.post('/logout', verifyJwt, async (req: AuthenticatedRequest, res) => {
  await operatorRepository.logAudit(req.operator!.operatorId, 'LOGOUT', 'AUTH_SYSTEM', 'SUCCESS');
  res.status(204).send();
});
