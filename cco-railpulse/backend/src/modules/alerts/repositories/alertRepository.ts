import { db } from '../../../infrastructure/db/timescale';
import { AlertDTO, AckDTO } from '../entities/Alert';

export class AlertRepository {
  static async create(data: AlertDTO): Promise<string> {
    const query = `
      INSERT INTO tb_alerts (train_id, fleet_code, severity, message, created_at, acknowledged)
      VALUES ($1, $2, $3, $4, $5, false)
      RETURNING alert_id;
    `;
    const values = [data.train_id, data.fleet_code, data.severity, data.message, data.timestamp];
    const result = await db.query(query, values);
    return result.rows[0].alert_id;
  }

  static async acknowledge(data: AckDTO): Promise<void> {
    const query = `
      UPDATE tb_alerts 
      SET acknowledged = true, ack_by = $1, ack_at = NOW()
      WHERE alert_id = $2 AND acknowledged = false;
    `;
    const result = await db.query(query, [data.operator_id, data.alert_id]);
    
    if (result.rowCount === 0) {
      throw new Error('Alerta já reconhecido ou inexistente.');
    }
  }
}