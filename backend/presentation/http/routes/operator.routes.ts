// backend/presentation/http/routes/operator.routes.ts
import { Router } from 'express';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { NotFoundError, ValidationError } from '../../../shared/errors';
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
  const operator = await operatorRepository.findById(req.operator!.operatorId);
  if (!operator) throw new NotFoundError('Operador não encontrado.');

  res.status(200).json({
    operatorId: operator.id,
    name: operator.name,
    role: operator.role,
    avatarUrl: operator.avatar_url,
  });
});

/** Persiste o avatar no banco — antes o ajuste vivia apenas no localStorage do navegador. */
operatorRouter.patch('/profile/avatar', async (req: AuthenticatedRequest, res) => {
  const avatarUrl = assertHttpUrl(req.body?.avatarUrl);
  const operatorId = req.operator!.operatorId;

  const operator = await operatorRepository.findById(operatorId);
  if (!operator) throw new NotFoundError('Operador não encontrado.');

  await operatorRepository.updateAvatar(operatorId, avatarUrl);
  await operatorRepository.logAudit(operatorId, 'UPDATE_AVATAR', `OPERATOR_${operatorId}`, 'SUCCESS');

  res.status(200).json({ operatorId, avatarUrl });
});
