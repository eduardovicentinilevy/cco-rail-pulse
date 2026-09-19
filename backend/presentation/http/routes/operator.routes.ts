// backend/presentation/http/routes/operator.routes.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../../shared/errors';
import { buildOtpAuthUrl, generateTotpSecret, verifyTotp } from '../../../shared/totp';
import { verifyJwt } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const operatorRouter: Router = Router();

operatorRouter.use(verifyJwt);

const MAX_AVATAR_URL_LENGTH = 2048;

const assertHttpUrl = (value: unknown): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError('Informe a URL da nova foto de perfil.');
  }
  const url = value.trim();
  if (url.length > MAX_AVATAR_URL_LENGTH) {
    throw new ValidationError('A URL informada é longa demais.');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError('A URL informada é inválida.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ValidationError('A URL deve utilizar o protocolo http ou https.');
  }
  return url;
};

operatorRouter.get('/profile', async (req: AuthenticatedRequest, res) => {
  const { tenantId, operatorId } = req.operator!;
  const operator = await operatorRepository.findById(tenantId, operatorId);
  if (!operator) throw new NotFoundError('Operador não encontrado.');

  res.status(200).json({
    operatorId: operator.login_id,
    name: operator.name,
    role: operator.role,
    avatarUrl: operator.avatar_url,
  });
});

/** Persiste o avatar no banco — antes o ajuste vivia apenas no localStorage do navegador. */
operatorRouter.patch('/profile/avatar', async (req: AuthenticatedRequest, res) => {
  const avatarUrl = assertHttpUrl(req.body?.avatarUrl);
  const { tenantId, operatorId, credential } = req.operator!;

  const operator = await operatorRepository.findById(tenantId, operatorId);
  if (!operator) throw new NotFoundError('Operador não encontrado.');

  await operatorRepository.updateAvatar(operator.id, avatarUrl);
  await operatorRepository.logAudit({
    tenantId,
    credential,
    action: 'UPDATE_AVATAR',
    target: `OPERATOR_${credential}`,
    status: 'SUCCESS',
  });

  res.status(200).json({ operatorId: credential, avatarUrl });
});

// --- Autenticação em duas etapas (2FA/TOTP) ---------------------------------

operatorRouter.get('/mfa', async (req: AuthenticatedRequest, res) => {
  const { tenantId, operatorId } = req.operator!;
  const operator = await operatorRepository.findById(tenantId, operatorId);
  if (!operator) throw new NotFoundError('Operador não encontrado.');

  res.status(200).json({ enabled: operator.mfa_enabled });
});

/** Gera um novo segredo, ainda pendente de confirmação — não ativa o 2FA por si só. */
operatorRouter.post('/mfa/enroll', async (req: AuthenticatedRequest, res) => {
  const { tenantId, operatorId } = req.operator!;
  const operator = await operatorRepository.findById(tenantId, operatorId);
  if (!operator) throw new NotFoundError('Operador não encontrado.');

  const secret = generateTotpSecret();
  await operatorRepository.setPendingMfaSecret(operator.id, secret);

  // O rótulo no aplicativo autenticador é o crachá, não a chave interna.
  res.status(200).json({ secret, otpauthUrl: buildOtpAuthUrl(secret, operator.login_id) });
});

/** Confirma o segredo pendente com um código válido — só então o 2FA passa a ser exigido no login. */
operatorRouter.post('/mfa/confirm', async (req: AuthenticatedRequest, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const { tenantId, operatorId } = req.operator!;
  const operator = await operatorRepository.findById(tenantId, operatorId);
  if (!operator) throw new NotFoundError('Operador não encontrado.');
  if (!operator.mfa_secret) throw new ValidationError('Gere um novo código secreto antes de confirmar.');

  if (!verifyTotp(operator.mfa_secret, code)) {
    throw new ValidationError('Código de verificação inválido.');
  }

  await operatorRepository.confirmMfa(operator.id);
  await operatorRepository.logAudit({
    tenantId,
    credential: operator.login_id,
    action: 'MFA_ENABLED',
    target: `OPERATOR_${operator.login_id}`,
    status: 'SUCCESS',
  });
  res.status(200).json({ enabled: true });
});

/** Exige a senha atual para desativar o 2FA — é o único freio contra um dispositivo desbloqueado sozinho. */
operatorRouter.post('/mfa/disable', async (req: AuthenticatedRequest, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const { tenantId, operatorId } = req.operator!;

  const operator = await operatorRepository.findById(tenantId, operatorId);
  if (!operator) throw new NotFoundError('Operador não encontrado.');

  const isPasswordValid = password.length > 0 && (await bcrypt.compare(password, operator.password_hash));
  if (!isPasswordValid) throw new UnauthorizedError('Senha incorreta.');

  await operatorRepository.disableMfa(operator.id);
  await operatorRepository.logAudit({
    tenantId,
    credential: operator.login_id,
    action: 'MFA_DISABLED',
    target: `OPERATOR_${operator.login_id}`,
    status: 'SUCCESS',
  });
  res.status(200).json({ enabled: false });
});
