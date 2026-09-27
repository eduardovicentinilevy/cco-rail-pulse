// backend/domain/entities/WorkOrder.ts
import { ValidationError } from '../../shared/errors';

export const WORK_ORDER_PRIORITIES = ['BAIXA', 'MÉDIA', 'ALTA', 'URGENTE'] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

export const WORK_ORDER_STATUSES = ['ABERTA', 'EM_ANDAMENTO', 'CONCLUÍDA', 'CANCELADA'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];

export const WORK_ORDER_CATEGORIES = [
  'TSS_SUBESTACAO',
  'VIA_PERMANENTE',
  'SINALIZACAO_ATS',
  'MATERIAL_RODANTE',
  'INFRAESTRUTURA_ESTACAO',
  'OUTROS',
] as const;
export type WorkOrderCategory = (typeof WORK_ORDER_CATEGORIES)[number];

/**
 * Transições permitidas no ciclo de vida de uma OS.
 * CONCLUÍDA e CANCELADA são terminais: reabrir exige uma nova ordem.
 */
const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  ABERTA: ['EM_ANDAMENTO', 'CANCELADA'],
  EM_ANDAMENTO: ['CONCLUÍDA', 'CANCELADA'],
  CONCLUÍDA: [],
  CANCELADA: [],
};

export const isWorkOrderPriority = (value: unknown): value is WorkOrderPriority =>
  typeof value === 'string' && (WORK_ORDER_PRIORITIES as readonly string[]).includes(value);

export const isWorkOrderStatus = (value: unknown): value is WorkOrderStatus =>
  typeof value === 'string' && (WORK_ORDER_STATUSES as readonly string[]).includes(value);

export const isWorkOrderCategory = (value: unknown): value is WorkOrderCategory =>
  typeof value === 'string' && (WORK_ORDER_CATEGORIES as readonly string[]).includes(value);

export interface WorkOrderSnapshot {
  id: string;
  title: string;
  description: string;
  assetCode: string | null;
  stationCode: string | null;
  category: WorkOrderCategory;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  openedBy: string;
  assignedTo: string | null;
  completionNote: string | null;
  openedAt: string;
  updatedAt: string;
  completedAt: string | null;
  dueAt: string | null;
  /** Tempo até a conclusão, em minutos. Null enquanto a OS não estiver concluída. */
  completionMinutes: number | null;
  /** Prazo vencido e a OS ainda não chegou a um estado terminal. */
  isOverdue: boolean;
}

const MAX_TITLE = 120;
const MAX_TEXT = 2000;
const MAX_ASSET_CODE = 80;

export class WorkOrder {
  constructor(
    public readonly id: string,
    public title: string,
    public description: string,
    public assetCode: string | null,
    public stationCode: string | null,
    public category: WorkOrderCategory,
    public priority: WorkOrderPriority,
    public status: WorkOrderStatus,
    public readonly openedBy: string,
    public assignedTo: string | null,
    public completionNote: string | null,
    public readonly openedAt: Date,
    public updatedAt: Date,
    public completedAt: Date | null,
    public readonly dueAt: Date | null,
  ) {}

  public static assertTitle(value: unknown): string {
    const title = String(value ?? '').trim();
    if (title.length < 5) throw new ValidationError('O título da OS precisa de ao menos 5 caracteres.');
    if (title.length > MAX_TITLE) throw new ValidationError(`O título não pode exceder ${MAX_TITLE} caracteres.`);
    return title;
  }

  public static assertDescription(value: unknown): string {
    const description = String(value ?? '').trim();
    if (description.length < 10) {
      throw new ValidationError('Descreva o serviço com ao menos 10 caracteres.');
    }
    if (description.length > MAX_TEXT) throw new ValidationError(`A descrição não pode exceder ${MAX_TEXT} caracteres.`);
    return description;
  }

  public static assertAssetCode(value: unknown): string | null {
    const text = String(value ?? '').trim();
    if (text.length === 0) return null;
    if (text.length > MAX_ASSET_CODE) {
      throw new ValidationError(`A identificação do ativo não pode exceder ${MAX_ASSET_CODE} caracteres.`);
    }
    return text;
  }

  public canTransitionTo(next: WorkOrderStatus): boolean {
    return ALLOWED_TRANSITIONS[this.status].includes(next);
  }

  public transitionTo(next: WorkOrderStatus, options: { assignedTo?: string | null; note?: string | null } = {}): void {
    if (next === this.status) {
      throw new ValidationError(`A OS já está com status ${next}.`);
    }
    if (!this.canTransitionTo(next)) {
      throw new ValidationError(`Transição inválida: ${this.status} → ${next}.`);
    }

    if (next === 'CONCLUÍDA') {
      const note = String(options.note ?? '').trim();
      if (note.length < 5) {
        throw new ValidationError('Registre o serviço executado (mínimo de 5 caracteres) para concluir a OS.');
      }
      this.completionNote = note.slice(0, MAX_TEXT);
      this.completedAt = new Date();
    }

    if (next === 'CANCELADA') {
      const note = String(options.note ?? '').trim();
      this.completionNote = note.length > 0 ? note.slice(0, MAX_TEXT) : this.completionNote;
    }

    if (options.assignedTo !== undefined) this.assignedTo = options.assignedTo;

    this.status = next;
    this.updatedAt = new Date();
  }

  public get completionMinutes(): number | null {
    if (!this.completedAt) return null;
    return Math.max(0, Math.round((this.completedAt.getTime() - this.openedAt.getTime()) / 60_000));
  }

  public get isOverdue(): boolean {
    if (!this.dueAt) return false;
    if (this.status === 'CONCLUÍDA' || this.status === 'CANCELADA') return false;
    return this.dueAt.getTime() < Date.now();
  }

  public toSnapshot(): WorkOrderSnapshot {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      assetCode: this.assetCode,
      stationCode: this.stationCode,
      category: this.category,
      priority: this.priority,
      status: this.status,
      openedBy: this.openedBy,
      assignedTo: this.assignedTo,
      completionNote: this.completionNote,
      openedAt: this.openedAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      completedAt: this.completedAt?.toISOString() ?? null,
      dueAt: this.dueAt?.toISOString() ?? null,
      completionMinutes: this.completionMinutes,
      isOverdue: this.isOverdue,
    };
  }
}
