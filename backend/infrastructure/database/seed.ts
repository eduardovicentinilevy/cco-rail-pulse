// backend/infrastructure/database/seed.ts
import bcrypt from 'bcrypt';

import { db } from './postgres';
import { env } from '../../config/env';
import { LINE_STATIONS } from '../../domain/line';
import { createLogger } from '../../shared/logger';

const logger = createLogger('DB-SEED');

/** Composições semeadas na malha, posicionadas em estações reais do traçado. */
const SEED_TRAINS: ReadonlyArray<[trainId: string, stationCode: string, speed: number, voltage: number, status: string]> = [
  ['T-01', 'BRA', 45, 24.6, 'NORMAL'],
  ['T-04', 'FGO', 30, 23.2, 'ATENÇÃO'],
  ['T-07', 'PDZ', 50, 24.5, 'NORMAL'],
  ['T-12', '14B', 48, 24.6, 'NORMAL'],
];

/** Equipe de plantão semeada para demonstrar o cadastro e os perfis de acesso. */
const SEED_TEAM: ReadonlyArray<[id: string, name: string, role: string]> = [
  ['MAR-109', 'Marina Rezende', 'OPERADOR'],
  ['SOU-012', 'Sousa Okamoto', 'OPERADOR'],
  ['LIV-551', 'Lívia Nakamura', 'SUPERVISOR'],
];

/**
 * Carga inicial de demonstração: operador padrão, equipe de plantão e composições.
 *
 * É idempotente (`ON CONFLICT DO NOTHING`) e nunca sobrescreve a senha de uma
 * conta existente. Em produção costuma ser desligada com `DB_SEED_ON_BOOT=false`,
 * já que as credenciais de demonstração são públicas.
 */
export const runSeed = async (): Promise<void> => {
  const passwordHash = await bcrypt.hash(env.seedOperatorPassword, env.bcryptRounds);

  const seeded = await db.query(
    `INSERT INTO operators (id, name, role, password_hash, avatar_url, is_active)
     VALUES ($1, $2, $3, $4, NULL, TRUE)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [env.seedOperatorId, env.seedOperatorName, env.seedOperatorRole, passwordHash],
  );

  if (seeded.rowCount && seeded.rowCount > 0) {
    logger.info(`Operador padrão "${env.seedOperatorId}" criado como ${env.seedOperatorRole}.`);
  } else {
    // Mantém o perfil do operador de demonstração alinhado à configuração,
    // sem jamais sobrescrever a senha de uma conta já existente.
    await db.query(`UPDATE operators SET role = $2 WHERE id = $1 AND role <> $2`, [
      env.seedOperatorId,
      env.seedOperatorRole,
    ]);
  }

  // A equipe de plantão compartilha a senha padrão apenas em ambiente de demonstração.
  for (const [id, name, role] of SEED_TEAM) {
    await db.query(
      `INSERT INTO operators (id, name, role, password_hash, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [id, name, role, passwordHash],
    );
  }

  const knownCodes = new Set(LINE_STATIONS.map((station) => station.code));
  for (const [trainId, stationCode, speed, voltage, status] of SEED_TRAINS) {
    if (!knownCodes.has(stationCode)) continue;
    await db.query(
      `INSERT INTO trains (train_id, current_station_code, speed_kmh, voltage_kv, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (train_id) DO NOTHING`,
      [trainId, stationCode, speed, voltage, status],
    );
  }

  logger.info('Carga inicial sincronizada.');
};
