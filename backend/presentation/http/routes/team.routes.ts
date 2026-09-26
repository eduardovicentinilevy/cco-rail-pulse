// backend/presentation/http/routes/team.routes.ts
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { env } from '../../../config/env';
import { OPERATOR_ROLES, ROLE_LABELS, isOperatorRole } from '../../../domain/roles';
import { describeViolations, validatePassword } from '../../../domain/password-policy';
import { REVOCATION_REASONS } from '../../../domain/entities/AuthSession';
import { operatorRepository } from '../../../infrastructure/repositories/pg-operator.repository';
import { authSessionService } from '../../../infrastructure/auth/session-service';
import { domainEventBus } from '../../../application/events/event-bus';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { routeParam } from '../../../shared/http';
import { verifyJwt, requirePermission } from '../middlewares/auth.middleware';
import type { AuthenticatedRequest } from '../middlewares/auth.middleware';

export const teamRouter: Router = Router();

teamRouter.use(verifyJwt);

/** Credencial no padrão CCO: três letras, hífen e três dígitos (ex.: EDP-042). */
const CREDENTIAL_PATTERN = /^[A-Z]{3}-\d{3}$/;

teamRouter.get('/', requirePermission('VIEW_OPERATORS'), async (_req, res) => {
  const operators = await operatorRepository.listAll();
  res.status(200).json({
    roles: OPERATOR_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
    operators,
  });
});

teamRouter.post('/', requirePermission('MANAGE_OPERATORS'), async (req: AuthenticatedRequest, res) => {
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

  // A senha provisória é definida por outra pessoa: passa pela mesma política e
  // vale só até o primeiro acesso, quando o dono é obrigado a trocá-la.
  const password = String(body.password ?? '');
  const violations = validatePassword(password, { operatorId: id, name }, { minLength: env.passwordMinLength });
  if (violations.length > 0) {
    throw new ValidationError(describeViolations(violations));
  }

  if (await operatorRepository.exists(id)) {
    throw new ValidationError(`A credencial ${id} já está cadastrada.`);
  }

  await operatorRepository.create({
    id,
    name,
    role: body.role,
    passwordHash: await bcrypt.hash(password, env.bcryptRounds),
    mustChangePassword: true,
  });
  await operatorRepository.logAudit(req.operator!.operatorId, 'OPERATOR_CREATED', `OPERATOR_${id}`, body.role);

  res.status(201).json({ id, name, role: body.role, isActive: true, mustChangePassword: true });
});

teamRouter.patch('/:id/role', requirePermission('MANAGE_OPERATORS'), async (req: AuthenticatedRequest, res) => {
  const operatorId = routeParam(req.params.id).toUpperCase();
  const requesterId = req.operator!.operatorId;

  if (!isOperatorRole(req.body?.role)) {
    throw new ValidationError(`Perfil inválido. Use um de: ${OPERATOR_ROLES.join(', ')}.`);
  }
  if (operatorId === requesterId) {
    // Impede que um supervisor se promova (ou se rebaixe) e perca o próprio acesso.
    throw new ValidationError('Não é possível alterar o próprio perfil de acesso.');
  }
  if (!(await operatorRepository.exists(operatorId))) {
    throw new NotFoundError(`Operador ${operatorId} não encontrado.`);
  }

  await operatorRepository.updateRole(operatorId, req.body.role);
  // O perfil viaja dentro do access token: sem derrubar as sessões, o operador
  // seguiria com o credenciamento antigo até o token vencer.
  await authSessionService.revokeOperator(operatorId, REVOCATION_REASONS.adminRevoked);
  await operatorRepository.logAudit(requesterId, 'OPERATOR_ROLE_CHANGED', `OPERATOR_${operatorId}`, req.body.role);

  res.status(200).json({ id: operatorId, role: req.body.role });
});

teamRouter.patch('/:id/active', requirePermission('MANAGE_OPERATORS'), async (req: AuthenticatedRequest, res) => {
  const operatorId = routeParam(req.params.id).toUpperCase();
  const requesterId = req.operator!.operatorId;
  const isActive = Boolean(req.body?.isActive);

  if (operatorId === requesterId) {
    throw new ValidationError('Não é possível desativar a própria credencial.');
  }
  if (!(await operatorRepository.exists(operatorId))) {
    throw new NotFoundError(`Operador ${operatorId} não encontrado.`);
  }

  await operatorRepository.setActive(operatorId, isActive);

  // Desativar precisa valer na hora, inclusive para quem já está com o painel aberto.
  // Revogar as sessões basta para o REST, que revalida a cada requisição; um WebSocket
  // já aberto não faz uma nova requisição sozinho, então também é derrubado por evento.
  if (!isActive) {
    await authSessionService.revokeOperator(operatorId, REVOCATION_REASONS.operatorDisabled);
    domainEventBus.emit('operator:deactivated', { operatorId });
  }

  await operatorRepository.logAudit(
    requesterId,
    isActive ? 'OPERATOR_ACTIVATED' : 'OPERATOR_DEACTIVATED',
    `OPERATOR_${operatorId}`,
    'EXECUTED',
  );

  res.status(200).json({ id: operatorId, isActive });
});
