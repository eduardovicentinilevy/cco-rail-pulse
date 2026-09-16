// backend/domain/entities/Incident.ts
import { ValidationError } from '../../shared/errors';

export const INCIDENT_SEVERITIES = ['BAIXA', 'MÉDIA', 'ALTA', 'CRÍTICA'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_STATUSES = ['ABERTA', 'EM_ANDAMENTO', 'RESOLVIDA'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_CATEGORIES = [
  'ENERGIA',
  'SINALIZACAO',
  'VIA_PERMANENTE',
  'MATERIAL_RODANTE',
  'PASSAGEIRO',
  'OUTROS',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

/**
 * Transições permitidas no ciclo de vida de uma ocorrência.
 * Uma ocorrência resolvida é terminal: reabrir exige registrar uma nova.
 */
const ALLOWED_TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  ABERTA: ['EM_ANDAMENTO', 'RESOLVIDA'],
  EM_ANDAMENTO: ['RESOLVIDA'],
  RESOLVIDA: [],
};

export const isIncidentSeverity = (value: unknown): value is IncidentSeverity =>
  typeof value === 'string' && (INCIDENT_SEVERITIES as readonly string[]).includes(value);

export const isIncidentStatus = (value: unknown): value is IncidentStatus =>
  typeof value === 'string' && (INCIDENT_STATUSES as readonly string[]).includes(value);

export const isIncidentCategory = (value: unknown): value is IncidentCategory =>
  typeof value === 'string' && (INCIDENT_CATEGORIES as readonly string[]).includes(value);

export interface IncidentSnapshot {
  id: string;
  title: string;
  description: string;
  stationCode: string | null;
  trainId: string | null;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  openedBy: string;
  assignedTo: string | null;
  resolutionNote: string | null;
  openedAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /** Tempo até a resolução, em minutos. Null enquanto a ocorrência estiver aberta. */
  resolutionMinutes: number | null;
}

const MAX_TITLE = 120;
const MAX_TEXT = 2000;

export class Incident {
  constructor(
    public readonly id: string,
    public title: string,
    public description: string,
    public stationCode: string | null,
    public trainId: string | null,
    public category: IncidentCategory,
    public severity: IncidentSeverity,
    public status: IncidentStatus,
    public readonly openedBy: string,
    public assignedTo: string | null,
    public resolutionNote: string | null,
    public readonly openedAt: Date,
    public updatedAt: Date,
    public resolvedAt: Date | null,
  ) {}

  /** Valida o texto livre vindo do operador antes de qualquer persistência. */
  public static assertTitle(value: unknown): string {
    const title = String(value ?? '').trim();
    if (title.length < 5) throw new ValidationError('O título da ocorrência precisa de ao menos 5 caracteres.');
    if (title.length > MAX_TITLE) throw new ValidationError(`O título não pode exceder ${MAX_TITLE} caracteres.`);
    return title;
  }

  public static assertDescription(value: unknown): string {
    const description = String(value ?? '').trim();
    if (description.length < 10) {
      throw new ValidationError('Descreva a ocorrência com ao menos 10 caracteres.');
    }
    if (description.length > MAX_TEXT) throw new ValidationError(`A descrição não pode exceder ${MAX_TEXT} caracteres.`);
    return description;
  }

  public canTransitionTo(next: IncidentStatus): boolean {
    return ALLOWED_TRANSITIONS[this.status].includes(next);
  }

  public transitionTo(next: IncidentStatus, options: { assignedTo?: string | null; note?: string | null } = {}): void {
    if (next === this.status) {
      throw new ValidationError(`A ocorrência já está com status ${next}.`);
    }
    if (!this.canTransitionTo(next)) {
      throw new ValidationError(`Transição inválida: ${this.status} → ${next}.`);
    }

    if (next === 'RESOLVIDA') {
      const note = String(options.note ?? '').trim();
      if (note.length < 5) {
        throw new ValidationError('Registre a tratativa aplicada (mínimo de 5 caracteres) para resolver a ocorrência.');
      }
      this.resolutionNote = note.slice(0, MAX_TEXT);
      this.resolvedAt = new Date();
    }

    if (options.assignedTo !== undefined) this.assignedTo = options.assignedTo;

    this.status = next;
    this.updatedAt = new Date();
  }

  public get resolutionMinutes(): number | null {
    if (!this.resolvedAt) return null;
    return Math.max(0, Math.round((this.resolvedAt.getTime() - this.openedAt.getTime()) / 60_000));
  }

  public toSnapshot(): IncidentSnapshot {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      stationCode: this.stationCode,
      trainId: this.trainId,
      category: this.category,
      severity: this.severity,
      status: this.status,
      openedBy: this.openedBy,
      assignedTo: this.assignedTo,
      resolutionNote: this.resolutionNote,
      openedAt: this.openedAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      resolvedAt: this.resolvedAt?.toISOString() ?? null,
      resolutionMinutes: this.resolutionMinutes,
    };
  }
}
