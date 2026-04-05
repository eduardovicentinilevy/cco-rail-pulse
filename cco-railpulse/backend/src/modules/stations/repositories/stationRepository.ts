import { db } from '../../../infrastructure/db/timescale';
import { DwellTimeQueryDTO } from '../entities/StationModels';

export class StationRepository {
  static async getDwellTimes(query: DwellTimeQueryDTO): Promise<any[]> {
    // CTE para identificar agrupamentos (stop_id) do ciclo de portas abertas
    const sql = `
      WITH DoorEvents AS (
        SELECT 
          train_id,
          fleet_code,
          event_time,
          doors_open,
          LAG(doors_open) OVER (PARTITION BY train_id ORDER BY event_time) as prev_doors_open
        FROM tb_cbtc_telemetry
        WHERE event_time BETWEEN $1 AND $2
          ${query.fleet_code ? 'AND fleet_code = $3' : ''}
      ),
      StopGroups AS (
        SELECT 
          train_id,
          fleet_code,
          event_time,
          SUM(CASE WHEN doors_open = true AND (prev_doors_open = false OR prev_doors_open IS NULL) THEN 1 ELSE 0 END) 
            OVER (PARTITION BY train_id ORDER BY event_time) as stop_id
        FROM DoorEvents
        WHERE doors_open = true
      )
      SELECT 
        train_id,
        fleet_code,
        stop_id,
        MIN(event_time) as door_open_time,
        MAX(event_time) as door_close_time,
        EXTRACT(EPOCH FROM (MAX(event_time) - MIN(event_time))) as dwell_time_seconds
      FROM StopGroups
      GROUP BY train_id, fleet_code, stop_id
      HAVING EXTRACT(EPOCH FROM (MAX(event_time) - MIN(event_time))) > 0
      ORDER BY door_open_time DESC;
    `;
    
    const params: any[] = [query.start_time, query.end_time];
    if (query.fleet_code) params.push(query.fleet_code);

    const result = await db.query(sql, params);
    return result.rows;
  }
}