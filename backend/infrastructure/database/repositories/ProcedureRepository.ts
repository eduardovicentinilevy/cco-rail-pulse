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
  lineId: string;
  category?: ProcedureCategory;
  search?: string;
}

const SELECT_COLUMNS = 'id, category, title, summary, steps, updated_at';

/** Biblioteca de referência: pequena e majoritariamente estática, não precisa de paginação. */
export class ProcedureRepository {
  public static async list({ lineId, category, search }: ProcedureQuery): Promise<ProcedureSnapshot[]> {
    const filter = search?.trim() ? `%${search.trim()}%` : null;

    const result = await db.query<ProcedureRow>(
      `SELECT ${SELECT_COLUMNS} FROM procedures
       WHERE line_id = $1
         AND ($2::text IS NULL OR category = $2)
         AND ($3::text IS NULL OR title ILIKE $3 OR summary ILIKE $3)
       ORDER BY category, title`,
      [lineId, category ?? null, filter],
    );

    return result.rows.map(toSnapshot);
  }
}
