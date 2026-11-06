// backend/infrastructure/database/repositories/PowerSectionRepository.ts
//
// Seções de alimentação do terceiro trilho, sempre dentro de uma linha: a
// subestação retificadora é dado da malha, e duas linhas podem ter uma `SR-01`
// cada uma. Sem a linha no WHERE, desenergizar a seção de um cliente apagaria a
// tensão da seção homônima do outro.
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
  public static async list(lineId: string): Promise<PowerSectionRecord[]> {
    const result = await db.query<PowerSectionRow>(
      `SELECT substation, energized, reason, changed_by, changed_at
         FROM power_sections
        WHERE line_id = $1
        ORDER BY substation ASC`,
      [lineId],
    );
    return result.rows.map(toRecord);
  }

  public static async save(lineId: string, record: PowerSectionRecord): Promise<void> {
    await db.query(
      `INSERT INTO power_sections (line_id, substation, energized, reason, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (line_id, substation) DO UPDATE
       SET energized = EXCLUDED.energized, reason = EXCLUDED.reason,
           changed_by = EXCLUDED.changed_by, changed_at = EXCLUDED.changed_at`,
      [lineId, record.substation, record.energized, record.reason, record.changedBy, record.changedAt],
    );
  }
}
