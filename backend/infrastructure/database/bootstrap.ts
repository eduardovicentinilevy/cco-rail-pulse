// backend/infrastructure/database/bootstrap.ts
import { env } from '../../config/env';
import { createLogger } from '../../shared/logger';
import { migrate } from './migrator';
import { runSeed } from './seed';

const logger = createLogger('DB-BOOT');

/**
 * Prepara o banco antes de o CCO abrir a porta HTTP.
 *
 * Em produção é comum rodar as migrações como um passo separado do deploy
 * (`npm run migrate`) e subir a aplicação com `DB_MIGRATE_ON_BOOT=false`, para
 * que várias réplicas não disputem o schema — daí os dois interruptores.
 */
export const prepareDatabase = async (): Promise<void> => {
  if (env.migrateOnBoot) {
    await migrate();
  } else {
    logger.info('Migrações no boot desativadas (DB_MIGRATE_ON_BOOT=false).');
  }

  if (env.seedOnBoot) {
    await runSeed();
  } else {
    logger.info('Carga inicial no boot desativada (DB_SEED_ON_BOOT=false).');
  }
};
