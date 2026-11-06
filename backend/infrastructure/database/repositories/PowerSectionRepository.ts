// backend/infrastructure/database/repositories/PowerSectionRepository.ts
import { db } from '../postgres';

export interface PowerSectionRecord {
  substation: string;
  energized: boolean;
  reason: string | null;
  changedBy: string | null;
  changedAt: string;
}

interface PowerSectionRow {
  substation: string;
  energized: boolean;
  reason: string | null;
  changed_by: string | null;
  changed_at: Date;
}

const toRecord = (row: PowerSectionRow): PowerSectionRecord => ({
  substation: row.substation,
  energized: row.energized,
  reason: row.reason,
  changedBy: row.changed_by,
  changedAt: new Date(row.changed_at).toISOString(),
});

export class PowerSectionRepository {
  public static async list(): Promise<PowerSectionRecord[]> {
    const result = await db.query<PowerSectionRow>(
      `SELECT substation, energized, reason, changed_by, changed_at FROM power_sections ORDER BY substation ASC`,
    );
    return result.rows.map(toRecord);
  }

  public static async save(record: PowerSectionRecord): Promise<void> {
    await db.query(
      `INSERT INTO power_sections (substation, energized, reason, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (substation) DO UPDATE
       SET energized = EXCLUDED.energized, reason = EXCLUDED.reason,
           changed_by = EXCLUDED.changed_by, changed_at = EXCLUDED.changed_at`,
      [record.substation, record.energized, record.reason, record.changedBy, record.changedAt],
    );
  }
}
