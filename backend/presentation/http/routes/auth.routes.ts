// backend/presentation/http/routes/auth.routes.ts
import { Router } from 'express';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { env } from '../../../config/env';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import type { OperatorEntity } from '../../../infrastructure/repositories/pg-operator.repository';
import { authSessionService } from '../../../infrastructure/auth/session-service';
import { rateLimitStore } from '../../../infrastructure/rate-limit/pg-rate-limit.store';
import { REVOCATION_REASONS } from '../../../domain/entities/AuthSession';
import { describeViolations, validatePassword } from '../../../domain/password-policy';
import {
  signMfaChallengeToken,
  signPasswordChangeToken,
  verifyMfaChallengeToken,
  verifyPasswordChangeToken,
} from '../../../shared/jwt';
import { verifyTotpStep } from '../../../shared/totp';
import { UnauthorizedError, ValidationError } from '../../../shared/errors';
import { RateLimiter } from '../middlewares/rate-limit.middleware';
import { verifyJwt } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const authRouter: Router = Router();

const loginLimiter = new RateLimiter(env.loginMaxAttempts, env.loginWindowMs, rateLimitStore);
/**
 * Reforço independente de IP: a chave acima (`IP:credencial`) já limita força bruta
 * por origem, mas `req.ip` só é confiável quando não há proxy mentindo sobre o cliente
 * real. Este segundo limitador, chaveado só pela credencial, garante um teto total de
 * tentativas contra uma conta específica mesmo que o componente de IP seja neutralizado
 * (proxy mal configurado, ou simplesmente muitos IPs de verdade em paralelo).
 */
const loginLimiterByOperator = new RateLimiter(env.loginMaxAttempts, env.loginWindowMs, rateLimitStore);
// Um código de 6 dígitos tem 1.000.000 de combinações — mesmo um limite folgado
// torna a força bruta impraticável dentro da validade do desafio.
const mfaLimiter = new RateLimiter(8, 60_000, rateLimitStore);
const refreshLimiter = new RateLimiter(30, 60_000, rateLimitStore);
const passwordLimiter = new RateLimiter(10, 900_000, rateLimitStore);

/**
 * Hash descartável usado quando a credencial não existe.
 * Gerado uma única vez no boot para que o custo de CPU do `compare` seja o mesmo
 * de um login legítimo — mitigação de *timing attack* na enumeração de operadores.
 */
const decoyHashPromise = bcrypt.hash('decoy-password-for-constant-time-compare', env.bcryptRounds);

const clientMeta = (req: Request) => ({
  ip: req.ip ?? null,
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 512) : null,
});

const readString = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Emite o par access/refresh e devolve o perfil que o painel exibe no cabeçalho. */
const issueSession = async (req: Request, res: Response, operator: OperatorEntity): Promise<Response> => {
  const session = await authSessionService.issue({ id: operator.id, role: operator.role }, clientMeta(req));

  return res.status(200).json({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: session.expiresIn,
    operatorId: operator.id,
    name: operator.name,
    role: operator.role,
    avatarUrl: operator.avatar_url,
  });
};

/**
 * Último passo do login. Quando a senha está marcada para troca obrigatória,
 * nenhuma sessão é aberta: sai apenas um token que abre exclusivamente a rota de
 * definição de senha.
 */
const completeLogin = async (req: Request, res: Response, operator: OperatorEntity): Promise<Response> => {
  if (operator.must_change_password) {
    await operatorRepository.logAudit(operator.id, 'PASSWORD_CHANGE_REQUIRED', 'AUTH_SYSTEM', 'PENDING');
    return res.status(200).json({
      passwordChangeRequired: true,
      changeToken: signPasswordChangeToken(operator.id),
      minPasswordLength: env.passwordMinLength,
    });
  }

  await operatorRepository.logAudit(operator.id, 'LOGIN_SUCCESS', 'AUTH_SYSTEM', 'SUCCESS');
  return issueSession(req, res, operator);
};

/** Aplica a política e recusa a nova senha quando ela repete a atual. */
const assertNewPasswordIsAcceptable = async (
  operator: OperatorEntity,
  newPassword: string,
): Promise<void> => {
  const violations = validatePassword(
    newPassword,
    { operatorId: operator.id, name: operator.name },
    { minLength: env.passwordMinLength },
  );

  if (violations.length > 0) {
    throw new ValidationError(describeViolations(violations));
  }

  if (await bcrypt.compare(newPassword, operator.password_hash)) {
    throw new ValidationError('A nova senha precisa ser diferente da atual.');
  }
};

/**
 * Troca a senha, derruba todas as sessões vivas do operador e abre uma nova.
 * Trocar a senha por suspeita de comprometimento só faz sentido se expulsar
 * quem já estava dentro.
 */
const applyNewPassword = async (
  req: Request,
  res: Response,
  operator: OperatorEntity,
  newPassword: string,
): Promise<Response> => {
  await assertNewPasswordIsAcceptable(operator, newPassword);

  await operatorRepository.updatePassword(operator.id, await bcrypt.hash(newPassword, env.bcryptRounds));
  await authSessionService.revokeOperator(operator.id, REVOCATION_REASONS.passwordChanged);
  await operatorRepository.logAudit(operator.id, 'PASSWORD_CHANGED', `OPERATOR_${operator.id}`, 'SUCCESS');
  await passwordLimiter.reset(operator.id);

  return issueSession(req, res, { ...operator, must_change_password: false });
};

authRouter.post('/login', async (req, res) => {
  const operatorId = readString(req.body?.operatorId).trim();
  const password = readString(req.body?.password);

  if (!operatorId || !password) {
    throw new ValidationError('Credencial e senha são obrigatórias.');
  }

  const normalizedId = operatorId.toUpperCase();
  const rateKey = `login:${req.ip ?? 'unknown'}:${normalizedId}`;
  await loginLimiter.consume(rateKey);
  await loginLimiterByOperator.consume(`login:${normalizedId}`);

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

  await loginLimiter.reset(rateKey);
  await loginLimiterByOperator.reset(`login:${normalizedId}`);

  // Segundo fator ativo: a senha só abre um desafio curto, nunca a sessão em si.
  if (operator.mfa_enabled) {
    await operatorRepository.logAudit(operator.id, 'LOGIN_MFA_CHALLENGE', 'AUTH_SYSTEM', 'PENDING');
    return res.status(200).json({ mfaRequired: true, challengeToken: signMfaChallengeToken(operator.id) });
  }

  return completeLogin(req, res, operator);
});

/** Segunda etapa do login: troca o desafio de senha por uma sessão, mediante o código do autenticador. */
authRouter.post('/login/mfa', async (req, res) => {
  const operatorId = verifyMfaChallengeToken(readString(req.body?.challengeToken));
  const invalidChallenge = {
    error: 'Desafio de autenticação inválido ou expirado. Faça login novamente.',
    code: 'INVALID_CHALLENGE',
  };

  if (!operatorId) {
    return res.status(401).json(invalidChallenge);
  }

  await mfaLimiter.consume(`mfa:${operatorId}`);

  const operator = await operatorRepository.findById(operatorId);
  if (!operator || !operator.mfa_enabled || !operator.mfa_secret) {
    return res.status(401).json(invalidChallenge);
  }

  const step = verifyTotpStep(operator.mfa_secret, readString(req.body?.code));
  const lastUsedStep = operator.mfa_last_used_step == null ? null : Number(operator.mfa_last_used_step);

  // Código não bate, ou bate mas já foi usado (mesmo passo ou um anterior) — nunca aceitar de novo.
  if (step === null || (lastUsedStep !== null && step <= lastUsedStep)) {
    await operatorRepository.logAudit(operator.id, 'LOGIN_MFA_FAILED', 'AUTH_SYSTEM', 'UNAUTHORIZED');
    return res.status(401).json({ error: 'Código de verificação inválido.', code: 'INVALID_MFA_CODE' });
  }

  await operatorRepository.setMfaLastUsedStep(operator.id, step);
  await mfaLimiter.reset(`mfa:${operatorId}`);
  return completeLogin(req, res, operator);
});

/**
 * Renova a sessão rotacionando o refresh token.
 * O token apresentado é queimado no processo: apresentá-lo de novo derruba a família inteira.
 */
authRouter.post('/refresh', async (req, res) => {
  const refreshToken = readString(req.body?.refreshToken);
  if (!refreshToken) throw new ValidationError('Informe o token de renovação.');

  await refreshLimiter.consume(`refresh:${req.ip ?? 'unknown'}`);

  const session = await authSessionService.refresh(refreshToken, clientMeta(req));
  const operator = await operatorRepository.findById(session.operatorId);

  await operatorRepository.logAudit(session.operatorId, 'TOKEN_REFRESHED', 'AUTH_SYSTEM', 'SUCCESS');

  res.status(200).json({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: session.expiresIn,
    operatorId: session.operatorId,
    name: operator?.name ?? null,
    role: session.role,
    avatarUrl: operator?.avatar_url ?? null,
  });
});

/**
 * Primeiro acesso: define a senha definitiva usando o token emitido no login.
 * Só chega aqui quem já provou a senha atual (e o segundo fator, quando ativo).
 */
authRouter.post('/password/initial', async (req, res) => {
  const operatorId = verifyPasswordChangeToken(readString(req.body?.changeToken));

  if (!operatorId) {
    throw new UnauthorizedError('Solicitação de troca de senha inválida ou expirada. Faça login novamente.');
  }

  await passwordLimiter.consume(operatorId);

  const operator = await operatorRepository.findById(operatorId);
  if (!operator) {
    throw new UnauthorizedError('Credencial inválida ou operador inativo.');
  }

  return applyNewPassword(req, res, operator, readString(req.body?.newPassword));
});

/** Troca de senha com a sessão já aberta: exige a senha atual. */
authRouter.post('/password', verifyJwt, async (req: AuthenticatedRequest, res) => {
  const operatorId = req.operator!.operatorId;
  await passwordLimiter.consume(operatorId);

  const operator = await operatorRepository.findById(operatorId);
  if (!operator) throw new UnauthorizedError('Credencial inválida ou operador inativo.');

  const currentPassword = readString(req.body?.currentPassword);
  const isCurrentValid = currentPassword.length > 0 && (await bcrypt.compare(currentPassword, operator.password_hash));

  if (!isCurrentValid) {
    await operatorRepository.logAudit(operatorId, 'PASSWORD_CHANGE_FAILED', `OPERATOR_${operatorId}`, 'UNAUTHORIZED');
    throw new UnauthorizedError('Senha atual incorreta.');
  }

  return applyNewPassword(req, res, operator, readString(req.body?.newPassword));
});

/** Permite ao frontend validar a sessão restaurada do armazenamento local. */
authRouter.get('/session', verifyJwt, (req: AuthenticatedRequest, res) => {
  res.status(200).json({ valid: true, operator: req.operator });
});

authRouter.post('/logout', verifyJwt, async (req: AuthenticatedRequest, res) => {
  const { operatorId, sessionId } = req.operator!;
  await authSessionService.revokeSession(sessionId, REVOCATION_REASONS.logout);
  await operatorRepository.logAudit(operatorId, 'LOGOUT', 'AUTH_SYSTEM', 'SUCCESS');
  res.status(204).send();
});

/** Encerra a sessão em todos os dispositivos — a saída de emergência de quem perdeu um terminal. */
authRouter.post('/logout/all', verifyJwt, async (req: AuthenticatedRequest, res) => {
  const operatorId = req.operator!.operatorId;
  const revoked = await authSessionService.revokeOperator(operatorId, REVOCATION_REASONS.logoutAll);
  await operatorRepository.logAudit(operatorId, 'LOGOUT_ALL', 'AUTH_SYSTEM', String(revoked));
  res.status(200).json({ revokedSessions: revoked });
});
