// backend/domain/procedures.ts

/** Categorias da biblioteca de procedimentos operacionais de referência do CCO. */
export const PROCEDURE_CATEGORIES = [
  'EMERGENCIA',
  'ENERGIA',
  'SINALIZACAO',
  'METEOROLOGIA',
  'EVACUACAO',
  'SEGURANCA',
] as const;
export type ProcedureCategory = (typeof PROCEDURE_CATEGORIES)[number];

export const PROCEDURE_CATEGORY_LABELS: Record<ProcedureCategory, string> = {
  EMERGENCIA: 'Emergência',
  ENERGIA: 'Energia de tração',
  SINALIZACAO: 'Sinalização / ATS',
  METEOROLOGIA: 'Meteorologia',
  EVACUACAO: 'Evacuação',
  SEGURANCA: 'Segurança',
};

export const isProcedureCategory = (value: unknown): value is ProcedureCategory =>
  typeof value === 'string' && (PROCEDURE_CATEGORIES as readonly string[]).includes(value);

export interface ProcedureSnapshot {
  id: string;
  category: ProcedureCategory;
  title: string;
  summary: string;
  steps: string[];
  updatedAt: string;
}
