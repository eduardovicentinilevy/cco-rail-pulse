import { db } from '../../../infrastructure/db/timescale';
import { HeadwayQueryDTO } from '../entities/AnalyticsModels';

export class AnalyticsRepository {
  static async getHeadwayDistribution(query: HeadwayQueryDTO): Promise<any[]> {
    const sql = `
      WITH StationArrivals AS (
        SELECT 
          train_id,
          event_time,
          LAG(event_time) OVER (PARTITION BY fleet_code ORDER BY event_time) as previous_train_time
        FROM tb_cbtc_telemetry
        WHERE fleet_code = $1 
          AND event_time BETWEEN $2 AND $3
          AND doors_open = true 
      )
      SELECT 
        train_id,
        event_time,
        EXTRACT(EPOCH FROM (event_time - previous_train_time)) AS headway_seconds
      FROM StationArrivals
      WHERE previous_train_time IS NOT NULL;
    `;
    
    const result = await db.query(sql, [query.fleet_code, query.start_time, query.end_time]);
    return result.rows;
  }

  // Novo motor de extração de Dwell Time
  static async getDwellTimeDistribution(query: HeadwayQueryDTO): Promise<any[]> {
    const sql = `
      SELECT 
        'Trem ' || train_id AS station,
        COUNT(*) AS dwell_seconds
      FROM tb_cbtc_telemetry
      WHERE fleet_code = $1 
        AND event_time BETWEEN $2 AND $3
        AND doors_open = true
      GROUP BY train_id
      ORDER BY dwell_seconds DESC
      LIMIT 10;
    `;
    
    const result = await db.query(sql, [query.fleet_code, query.start_time, query.end_time]);
    return result.rows;
  }
}