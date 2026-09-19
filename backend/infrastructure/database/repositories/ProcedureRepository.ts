// backend/infrastructure/database/repositories/ProcedureRepository.ts
import { db } from '../postgres';
import type { ProcedureCategory, ProcedureSnapshot } from '../../../domain/procedures';

interface ProcedureRow {
  id: number;
  category: string;
  title: string;
  summary: string;
  steps: string[];
  updated_at: Date;
}

const toSnapshot = (row: ProcedureRow): ProcedureSnapshot => ({
  id: String(row.id),
  category: row.category as ProcedureCategory,
  title: row.title,
  summary: row.summary,
  steps: row.steps,
  updatedAt: row.updated_at.toISOString(),
});

export interface ProcedureQuery {
  category?: ProcedureCategory;
  search?: string;
}

const SELECT_COLUMNS = 'id, category, title, summary, steps, updated_at';

/** Biblioteca de referência: pequena e majoritariamente estática, não precisa de paginação. */
export class ProcedureRepository {
  public static async list({ category, search }: ProcedureQuery): Promise<ProcedureSnapshot[]> {
    const filter = search?.trim() ? `%${search.trim()}%` : null;

    const result = await db.query<ProcedureRow>(
      `SELECT ${SELECT_COLUMNS} FROM procedures
       WHERE ($1::text IS NULL OR category = $1)
         AND ($2::text IS NULL OR title ILIKE $2 OR summary ILIKE $2)
       ORDER BY category, title`,
      [category ?? null, filter],
    );

    return result.rows.map(toSnapshot);
  }
}
