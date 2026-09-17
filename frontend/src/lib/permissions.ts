// frontend/src/lib/permissions.ts
// Espelha backend/domain/roles.ts. O backend continua sendo a autoridade —
// aqui a checagem serve apenas para desabilitar controles que o operador não pode usar.
import type { OperatorRole } from '../types';

const ROLE_LEVEL: Record<OperatorRole, number> = {
  OPERADOR: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
};

const PERMISSIONS = {
  COMMAND_TRAIN: 'OPERADOR',
  MANAGE_INCIDENTS: 'OPERADOR',
  VIEW_OPERATORS: 'OPERADOR',
  MANAGE_OPERATORS: 'SUPERVISOR',
  ADMINISTER_SYSTEM: 'ADMIN',
} as const satisfies Record<string, OperatorRole>;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_LABELS: Record<OperatorRole, string> = {
  OPERADOR: 'Operador de Controle',
  SUPERVISOR: 'Supervisor de Operação',
  ADMIN: 'Administrador do Sistema',
};

const isOperatorRole = (value: string | undefined): value is OperatorRole => value != null && value in ROLE_LEVEL;

export const can = (role: string | undefined, permission: Permission): boolean =>
  isOperatorRole(role) && ROLE_LEVEL[role] >= ROLE_LEVEL[PERMISSIONS[permission]];

export const roleLabel = (role: string): string => (isOperatorRole(role) ? ROLE_LABELS[role] : role);
