// backend/domain/roles.ts

export const OPERATOR_ROLES = ['OPERATOR_SOC', 'SUPERVISOR', 'ADMIN'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

/** Nível hierárquico: um perfil herda todas as permissões dos níveis abaixo. */
const ROLE_LEVEL: Record<OperatorRole, number> = {
  OPERATOR_SOC: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
};

export const PERMISSIONS = {
  /** Emitir comandos críticos de segurança na malha. */
  COMMAND_TRAIN: 'OPERATOR_SOC',
  /** Registrar e tratar ocorrências. */
  MANAGE_INCIDENTS: 'OPERATOR_SOC',
  /** Consultar o cadastro de operadores. */
  VIEW_OPERATORS: 'OPERATOR_SOC',
  /** Criar operadores e alterar perfis/ativação. */
  MANAGE_OPERATORS: 'SUPERVISOR',
  /** Remover definitivamente registros do cadastro. */
  ADMINISTER_SYSTEM: 'ADMIN',
} as const satisfies Record<string, OperatorRole>;

export type Permission = keyof typeof PERMISSIONS;

export const isOperatorRole = (value: unknown): value is OperatorRole =>
  typeof value === 'string' && (OPERATOR_ROLES as readonly string[]).includes(value);

/** Verdadeiro quando `role` alcança o nível mínimo exigido pela permissão. */
export const can = (role: string | undefined, permission: Permission): boolean => {
  if (!isOperatorRole(role)) return false;
  return ROLE_LEVEL[role] >= ROLE_LEVEL[PERMISSIONS[permission]];
};

export const ROLE_LABELS: Record<OperatorRole, string> = {
  OPERATOR_SOC: 'Operador SOC',
  SUPERVISOR: 'Supervisor de Operação',
  ADMIN: 'Administrador do Sistema',
};
