// backend/infrastructure/database/migrator.ts
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { db } from './postgres';
import { createLogger } from '../../shared/logger';

const logger = createLogger('DB-MIGRATE');

/**
 * Diretório das migrações. O caminho é relativo a este módulo para valer tanto
 * em desenvolvimento (`tsx`, sobre o fonte) quanto em produção (`backend/dist`,
 * para onde os `.sql` são copiados pelo build).
 */
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Chave do advisory lock do Postgres. Duas instâncias subindo ao mesmo tempo
 * (um rolling deploy, por exemplo) serializam a migração em vez de disputá-la.
 */
const MIGRATION_LOCK_KEY = 4_120_6060;

const FILENAME_PATTERN = /^(\d{3,})_([a-z0-9_]+)\.sql$/;

export interface Migration {
  version: number;
  name: string;
  filename: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  appliedAt: Date;
}

export interface MigrationStatus {
  version: number;
  name: string;
  appliedAt: Date | null;
}

const checksumOf = (sql: string): string =>
  // Normaliza a quebra de linha para que o checksum não mude entre Windows e Linux.
  crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

/** Lê e ordena as migrações do disco, recusando nomes fora do padrão `NNN_nome.sql`. */
export const loadMigrations = (directory: string = MIGRATIONS_DIR): Migration[] => {
  const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql'));

  const migrations = files.map((filename) => {
    const match = FILENAME_PATTERN.exec(filename);
    if (!match) {
      throw new Error(
        `[MIGRATE] Nome de migração inválido: "${filename}". Use o padrão NNN_descricao_em_snake_case.sql.`,
      );
    }

    const sql = fs.readFileSync(path.join(directory, filename), 'utf8');
    return {
      version: Number.parseInt(match[1], 10),
      name: match[2],
      filename,
      sql,
      checksum: checksumOf(sql),
    };
  });

  migrations.sort((a, b) => a.version - b.version);

  const duplicated = migrations.find((migration, index) => index > 0 && migrations[index - 1].version === migration.version);
  if (duplicated) {
    throw new Error(`[MIGRATE] Duas migrações compartilham a versão ${duplicated.version}.`);
  }

  return migrations;
};

const ensureLedger = async (): Promise<void> => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const readLedger = async (): Promise<Map<number, AppliedMigration>> => {
  const { rows } = await db.query<{ version: number; name: string; checksum: string; applied_at: Date }>(
    'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version',
  );

  return new Map(
    rows.map((row) => [
      row.version,
      { version: row.version, name: row.name, checksum: row.checksum, appliedAt: row.applied_at },
    ]),
  );
};

/**
 * Uma migração já aplicada é imutável: editar o arquivo deixaria os ambientes
 * divergentes em silêncio, com o mesmo número descrevendo schemas diferentes.
 */
const assertNoDrift = (migration: Migration, applied: AppliedMigration): void => {
  if (applied.checksum === migration.checksum) return;

  throw new Error(
    `[MIGRATE] A migração ${migration.filename} mudou depois de aplicada neste banco. ` +
      'Migrações aplicadas são imutáveis: reverta o arquivo e crie uma nova migração com a alteração.',
  );
};

const applyMigration = async (migration: Migration): Promise<void> => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(migration.sql);
    await client.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [
      migration.version,
      migration.name,
      migration.checksum,
    ]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Aplica as migrações pendentes, em ordem, cada uma em sua própria transação.
 * Retorna as que foram aplicadas nesta execução (vazio quando já estava em dia).
 */
export const migrate = async (directory: string = MIGRATIONS_DIR): Promise<Migration[]> => {
  const migrations = loadMigrations(directory);

  await db.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  try {
    await ensureLedger();
    const applied = await readLedger();
    const pending: Migration[] = [];

    for (const migration of migrations) {
      const record = applied.get(migration.version);
      if (record) {
        assertNoDrift(migration, record);
        continue;
      }
      pending.push(migration);
    }

    if (pending.length === 0) {
      logger.info('Schema em dia.', { applied: applied.size });
      return [];
    }

    for (const migration of pending) {
      await applyMigration(migration);
      logger.info(`Migração aplicada: ${migration.filename}`, { version: migration.version });
    }

    logger.info(`${pending.length} migração(ões) aplicada(s).`, { version: pending[pending.length - 1].version });
    return pending;
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
  }
};

/** Situação de cada migração conhecida — usado pelo comando `npm run migrate:status`. */
export const migrationStatus = async (directory: string = MIGRATIONS_DIR): Promise<MigrationStatus[]> => {
  await ensureLedger();
  const applied = await readLedger();

  return loadMigrations(directory).map((migration) => ({
    version: migration.version,
    name: migration.filename,
    appliedAt: applied.get(migration.version)?.appliedAt ?? null,
  }));
};
