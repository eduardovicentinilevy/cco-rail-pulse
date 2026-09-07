import { db } from '../database/postgres';

export interface OperatorEntity {
  id: string;
  name: string;
  role: string;
  password_hash: string;
  avatar_url: string | null;
  is_active: boolean;
}

export class PgOperatorRepository {
  public async findById(operatorId: string): Promise<OperatorEntity | null> {
    const query = `
      SELECT id, name, role, password_hash, avatar_url, is_active 
      FROM operators 
      WHERE id = $1 AND is_active = TRUE
    `;
    const result = await db.query(query, [operatorId.toUpperCase()]);
    if (result.rows.length === 0) return null;
    return result.rows[0] as OperatorEntity;
  }

  public async logAudit(operatorId: string, action: string, target: string, status: string): Promise<void> {
    const query = `
      INSERT INTO audit_logs (operator_id, action, target, status) 
      VALUES ($1, $2, $3, $4)
    `;
    await db.query(query, [operatorId, action, target, status]);
  }
}