// backend/presentation/http/routes/team.routes.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { env } from '../../../config/env';
import { OPERATOR_ROLES, ROLE_LABELS, isOperatorRole } from '../../../domain/roles';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { routeParam } from '../../../shared/http';
import { verifyJwt, requirePermission } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const teamRouter: Router = Router();

teamRouter.use(verifyJwt);

/** Credencial no padrão CCO: três letras, hífen e três dígitos (ex.: EDP-042). */
const CREDENTIAL_PATTERN = /^[A-Z]{3}-\d{3}$/;
const MIN_PASSWORD_LENGTH = 6;

teamRouter.get('/', requirePermission('VIEW_OPERATORS'), async (req: AuthenticatedRequest, res) => {
  const operators = await operatorRepository.listAll(req.operator!.tenantId);
  res.status(200).json({
    roles: OPERATOR_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
    operators,
  });
});

teamRouter.post('/', requirePermission('MANAGE_OPERATORS'), async (req: AuthenticatedRequest, res) => {
  const { tenantId, credential } = req.operator!;
  const body = req.body ?? {};

  const id = String(body.id ?? '').trim().toUpperCase();
  if (!CREDENTIAL_PATTERN.test(id)) {
    throw new ValidationError('A credencial deve seguir o padrão CCO: três letras, hífen e três dígitos (ex.: EDP-042).');
  }

  const name = String(body.name ?? '').trim();
  if (name.length < 3) throw new ValidationError('Informe o nome completo do operador.');

  if (!isOperatorRole(body.role)) {
    throw new ValidationError(`Perfil inválido. Use um de: ${OPERATOR_ROLES.join(', ')}.`);
  }

  const password = String(body.password ?? '');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`A senha provisória precisa de ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }

  // A credencial só precisa ser única dentro do cliente: dois clientes podem ter
  // um EDP-042 cada, e a chave interna (UUID) é quem os distingue no banco.
  if (await operatorRepository.exists(tenantId, id)) {
    throw new ValidationError(`A credencial ${id} já está cadastrada.`);
  }

  await operatorRepository.create({
    tenantId,
    credential: id,
    name,
    role: body.role,
    passwordHash: await bcrypt.hash(password, env.bcryptRounds),
  });
  await operatorRepository.logAudit({
    tenantId,
    credential,
    action: 'OPERATOR_CREATED',
    target: `OPERATOR_${id}`,
    status: body.role,
  });

  res.status(201).json({ id, name, role: body.role, isActive: true });
});

teamRouter.patch('/:id/role', requirePermission('MANAGE_OPERATORS'), async (req: AuthenticatedRequest, res) => {
  const operatorId = routeParam(req.params.id).toUpperCase();
  const { tenantId, credential: requesterId } = req.operator!;

  if (!isOperatorRole(req.body?.role)) {
    throw new ValidationError(`Perfil inválido. Use um de: ${OPERATOR_ROLES.join(', ')}.`);
  }
  if (operatorId === requesterId) {
    // Impede que um supervisor se promova (ou se rebaixe) e perca o próprio acesso.
    throw new ValidationError('Não é possível alterar o próprio perfil de acesso.');
  }
  if (!(await operatorRepository.exists(tenantId, operatorId))) {
    throw new NotFoundError(`Operador ${operatorId} não encontrado.`);
  }

  await operatorRepository.updateRole(tenantId, operatorId, req.body.role);
  await operatorRepository.logAudit({
    tenantId,
    credential: requesterId,
    action: 'OPERATOR_ROLE_CHANGED',
    target: `OPERATOR_${operatorId}`,
    status: req.body.role,
  });

  res.status(200).json({ id: operatorId, role: req.body.role });
});

teamRouter.patch('/:id/active', requirePermission('MANAGE_OPERATORS'), async (req: AuthenticatedRequest, res) => {
  const operatorId = routeParam(req.params.id).toUpperCase();
  const { tenantId, credential: requesterId } = req.operator!;
  const isActive = Boolean(req.body?.isActive);

  if (operatorId === requesterId) {
    throw new ValidationError('Não é possível desativar a própria credencial.');
  }
  if (!(await operatorRepository.exists(tenantId, operatorId))) {
    throw new NotFoundError(`Operador ${operatorId} não encontrado.`);
  }

  await operatorRepository.setActive(tenantId, operatorId, isActive);
  await operatorRepository.logAudit({
    tenantId,
    credential: requesterId,
    action: isActive ? 'OPERATOR_ACTIVATED' : 'OPERATOR_DEACTIVATED',
    target: `OPERATOR_${operatorId}`,
    status: 'EXECUTED',
  });

  res.status(200).json({ id: operatorId, isActive });
});
