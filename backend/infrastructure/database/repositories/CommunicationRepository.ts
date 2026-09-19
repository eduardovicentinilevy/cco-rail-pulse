// backend/infrastructure/database/repositories/CommunicationRepository.ts
import { db } from '../postgres';
import type { CommunicationChannel, CommunicationDirection, CommunicationSnapshot } from '../../../domain/communications';

interface CommunicationRow {
  id: number;
  channel: string;
  direction: string;
  station_code: string | null;
  train_id: string | null;
  operator_id: string;
  message: string;
  created_at: Date;
}

const toSnapshot = (row: CommunicationRow): CommunicationSnapshot => ({
  id: String(row.id),
  channel: row.channel as CommunicationChannel,
  direction: row.direction as CommunicationDirection,
  stationCode: row.station_code,
  trainId: row.train_id,
  operatorId: row.operator_id,
  message: row.message,
  createdAt: row.created_at.toISOString(),
});

export interface CreateCommunicationInput {
  lineId: string;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  stationCode: string | null;
  trainId: string | null;
  operatorId: string;
  message: string;
}

export interface CommunicationQuery {
  lineId: string;
  limit: number;
  offset: number;
  channel?: CommunicationChannel;
  search?: string;
}

export interface CommunicationPage {
  items: CommunicationSnapshot[];
  total: number;
  limit: number;
  offset: number;
}

const SELECT_COLUMNS = 'id, channel, direction, station_code, train_id, operator_id, message, created_at';

export class CommunicationRepository {
  public static async create(input: CreateCommunicationInput): Promise<CommunicationSnapshot> {
    const result = await db.query<CommunicationRow>(
      `INSERT INTO communications (line_id, channel, direction, station_code, train_id, operator_id, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.lineId,
        input.channel,
        input.direction,
        input.stationCode,
        input.trainId,
        input.operatorId,
        input.message,
      ],
    );
    return toSnapshot(result.rows[0]);
  }

  public static async list({
    lineId,
    limit,
    offset,
    channel,
    search,
  }: CommunicationQuery): Promise<CommunicationPage> {
    const filter = search?.trim() ? `%${search.trim()}%` : null;

    const whereClause = (lineParam: number, channelParam: number, searchParam: number) => `
      line_id = $${lineParam}
      AND ($${channelParam}::text IS NULL OR channel = $${channelParam})
      AND (
        $${searchParam}::text IS NULL
        OR message ILIKE $${searchParam}
        OR station_code ILIKE $${searchParam}
        OR train_id ILIKE $${searchParam}
      )
    `;

    const [page, count] = await Promise.all([
      db.query<CommunicationRow>(
        `SELECT ${SELECT_COLUMNS} FROM communications
         WHERE ${whereClause(3, 4, 5)}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset, lineId, channel ?? null, filter],
      ),
      db.query<{ total: string }>(
        `SELECT COUNT(*)::text AS total FROM communications WHERE ${whereClause(1, 2, 3)}`,
        [lineId, channel ?? null, filter],
      ),
    ]);

    return {
      items: page.rows.map(toSnapshot),
      total: Number(count.rows[0]?.total ?? 0),
      limit,
      offset,
    };
  }
}
