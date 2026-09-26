// backend/presentation/http/routes/auth.routes.ts
import { Router } from 'express';
import type { Response } from 'express';
import bcrypt from 'bcrypt';
import { env } from '../../../config/env';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import type { OperatorEntity } from '../../../infrastructure/repositories/pg-operator.repository';
import { lineCatalogRepository } from '../../../infrastructure/repositories/pg-line-catalog.repository';
import { signMfaChallengeToken, signOperatorToken, verifyMfaChallengeToken } from '../../../shared/jwt';
import { verifyTotpStep } from '../../../shared/totp';
import { ValidationError } from '../../../shared/errors';
import { RateLimiter } from '../middlewares/rate-limit.middleware';
import { verifyJwt } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';
import { resolveTenantSlug } from '../tenant-resolution';

export const authRouter: Router = Router();

/**
 * Resposta de sessão emitida tanto pelo login direto quanto pela conclusão do 2FA.
 *
 * `operatorId` é o crachá, não a chave interna: o id interno resolve a unicidade
 * no banco e nunca sai do backend. O painel recebe também o cliente e a linha da
 * sessão, que é o que lhe permite exibir a malha sem nada fixo no código.
 */
const issueSession = async (res: Response, operator: OperatorEntity, lineId: string): Promise<Response> => {
  const catalog = await lineCatalogRepository.require(lineId);

  return res.status(200).json({
    token: signOperatorToken({
      operatorId: operator.id,
      credential: operator.login_id,
      role: operator.role,
      tenantId: operator.tenant_id,
      lineId,
    }),
    operatorId: operator.login_id,
    name: operator.name,
    role: operator.role,
    avatarUrl: operator.avatar_url,
    tenant: { id: catalog.tenantId, name: catalog.line.tenantName },
    line: { id: catalog.id, code: catalog.line.code, name: catalog.name },
  });
};

const loginLimiter = new RateLimiter(env.loginMaxAttempts, env.loginWindowMs);
/**
 * Reforço independente de IP: a chave acima (`IP:cliente:credencial`) já limita força bruta
 * por origem, mas `req.ip` só é confiável quando não há proxy mentindo sobre o cliente
 * real. Este segundo limitador, chaveado só pela credencial, garante um teto total de
 * tentativas contra uma conta específica mesmo que o componente de IP seja neutralizado
 * (proxy mal configurado, ou simplesmente muitos IPs de verdade em paralelo). A chave
 * é `cliente:credencial`, não a credencial solta: o teto é por conta, e a conta é do
 * cliente.
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

const INVALID_CREDENTIALS = { error: 'Credencial inválida ou operador inativo.', code: 'INVALID_CREDENTIALS' };

authRouter.post('/login', async (req, res) => {
  const operatorId = typeof req.body?.operatorId === 'string' ? req.body.operatorId.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!operatorId || !password) {
    throw new ValidationError('Credencial e senha são obrigatórias.');
  }

  const tenantSlug = resolveTenantSlug(req);
  // A chave da conta inclui o cliente: duas instalações podem ter a mesma credencial,
  // e uma cota compartilhada deixaria um cliente trancar a conta homônima do outro.
  const accountKey = `${tenantSlug}:${operatorId.toUpperCase()}`;
  const rateKey = `${req.ip ?? 'unknown'}:${accountKey}`;
  loginLimiter.consume(rateKey);
  loginLimiterByOperator.consume(accountKey);

  const tenant = await lineCatalogRepository.tenantBySlug(tenantSlug);

  // Cliente inexistente ou desativado responde igual a senha errada: dizer
  // "este cliente não existe" entregaria a lista de clientes da instalação.
  if (!tenant?.isActive) {
    await bcrypt.compare(password, await decoyHashPromise);
    return res.status(401).json(INVALID_CREDENTIALS);
  }

  const operator = await operatorRepository.findByCredential(tenant.id, operatorId);

  if (!operator) {
    await bcrypt.compare(password, await decoyHashPromise);
    return res.status(401).json(INVALID_CREDENTIALS);
  }

  const isPasswordValid = await bcrypt.compare(password, operator.password_hash);

  if (!isPasswordValid) {
    await operatorRepository.logAudit({
      tenantId: tenant.id,
      credential: operator.login_id,
      action: 'LOGIN_FAILED',
      target: 'AUTH_SYSTEM',
      status: 'UNAUTHORIZED',
    });
    return res.status(401).json(INVALID_CREDENTIALS);
  }

  const lineId = await lineCatalogRepository.defaultLineId(tenant.id);
  if (!lineId) {
    throw new ValidationError('Este cliente ainda não tem uma linha cadastrada. Procure o administrador.');
  }

  loginLimiter.reset(rateKey);
  loginLimiterByOperator.reset(accountKey);

  // Segundo fator ativo: a senha só abre um desafio de 5 minutos, nunca a sessão em si.
  if (operator.mfa_enabled) {
    await operatorRepository.logAudit({
      tenantId: tenant.id,
      credential: operator.login_id,
      action: 'LOGIN_MFA_CHALLENGE',
      target: 'AUTH_SYSTEM',
      status: 'PENDING',
    });
    return res.status(200).json({
      mfaRequired: true,
      challengeToken: signMfaChallengeToken({ operatorId: operator.id, tenantId: tenant.id }),
    });
  }

  await operatorRepository.logAudit({
    tenantId: tenant.id,
    credential: operator.login_id,
    action: 'LOGIN_SUCCESS',
    target: 'AUTH_SYSTEM',
    status: 'SUCCESS',
  });
  return issueSession(res, operator, lineId);
});

/** Segunda etapa do login: troca o desafio de senha por uma sessão, mediante o código do autenticador. */
authRouter.post('/login/mfa', async (req, res) => {
  const challengeToken = typeof req.body?.challengeToken === 'string' ? req.body.challengeToken : '';
  const code = typeof req.body?.code === 'string' ? req.body.code : '';

  const challenge = verifyMfaChallengeToken(challengeToken);
  const invalidChallenge = {
    error: 'Desafio de autenticação inválido ou expirado. Faça login novamente.',
    code: 'INVALID_CHALLENGE',
  };

  if (!challenge) {
    return res.status(401).json(invalidChallenge);
  }

  mfaLimiter.consume(challenge.operatorId);

  const operator = await operatorRepository.findById(challenge.tenantId, challenge.operatorId);
  if (!operator || !operator.mfa_enabled || !operator.mfa_secret) {
    return res.status(401).json(invalidChallenge);
  }

  const step = verifyTotpStep(operator.mfa_secret, code);
  const lastUsedStep = operator.mfa_last_used_step == null ? null : Number(operator.mfa_last_used_step);

  // Código não bate, ou bate mas já foi usado (mesmo passo ou um anterior) — nunca aceitar de novo.
  if (step === null || (lastUsedStep !== null && step <= lastUsedStep)) {
    await operatorRepository.logAudit({
      tenantId: operator.tenant_id,
      credential: operator.login_id,
      action: 'LOGIN_MFA_FAILED',
      target: 'AUTH_SYSTEM',
      status: 'UNAUTHORIZED',
    });
    return res.status(401).json({ error: 'Código de verificação inválido.', code: 'INVALID_MFA_CODE' });
  }

  const lineId = await lineCatalogRepository.defaultLineId(operator.tenant_id);
  if (!lineId) {
    throw new ValidationError('Este cliente ainda não tem uma linha cadastrada. Procure o administrador.');
  }

  await operatorRepository.setMfaLastUsedStep(operator.id, step);
  mfaLimiter.reset(challenge.operatorId);
  await operatorRepository.logAudit({
    tenantId: operator.tenant_id,
    credential: operator.login_id,
    action: 'LOGIN_SUCCESS',
    target: 'AUTH_SYSTEM',
    status: 'SUCCESS',
  });
  return issueSession(res, operator, lineId);
});

/** Permite ao frontend validar a sessão restaurada do localStorage. */
authRouter.get('/session', verifyJwt, (req: AuthenticatedRequest, res) => {
  const operator = req.operator!;
  res.status(200).json({
    valid: true,
    operator: {
      operatorId: operator.credential,
      role: operator.role,
      tenantId: operator.tenantId,
      lineId: operator.lineId,
    },
  });
});

authRouter.post('/logout', verifyJwt, async (req: AuthenticatedRequest, res) => {
  const operator = req.operator!;
  await operatorRepository.logAudit({
    tenantId: operator.tenantId,
    credential: operator.credential,
    action: 'LOGOUT',
    target: 'AUTH_SYSTEM',
    status: 'SUCCESS',
  });
  res.status(204).send();
});
