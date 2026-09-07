import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const db = new Pool({
  // Ajuste a string de conexão caso a senha do seu Postgres local seja diferente
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/railpulse_cco'
});