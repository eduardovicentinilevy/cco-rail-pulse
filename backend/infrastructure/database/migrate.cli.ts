// backend/infrastructure/database/migrate.cli.ts
//
// Comando de migração para uso fora do boot da aplicação (deploy, CI, operação):
//   npm run migrate          -> aplica as pendentes
//   npm run migrate:status   -> lista o que já foi aplicado
import { createLogger } from '../../shared/logger';
import { closeDatabase } from './postgres';
import { migrate, migrationStatus } from './migrator';
import { runSeed } from './seed';

const logger = createLogger('DB-CLI');

const commands = {
  up: async (): Promise<void> => {
    const applied = await migrate();
    if (applied.length === 0) logger.info('Nenhuma migração pendente.');
  },
  status: async (): Promise<void> => {
    for (const migration of await migrationStatus()) {
      const when = migration.appliedAt ? migration.appliedAt.toISOString() : 'pendente';
      logger.info(`${String(migration.version).padStart(3, '0')} ${migration.name} — ${when}`);
    }
  },
  seed: async (): Promise<void> => {
    await runSeed();
  },
} as const;

type CommandName = keyof typeof commands;

const isCommand = (value: string): value is CommandName => value in commands;

const main = async (): Promise<void> => {
  const requested = process.argv[2] ?? 'up';

  if (!isCommand(requested)) {
    logger.error(`Comando desconhecido: "${requested}". Use: ${Object.keys(commands).join(' | ')}.`);
    process.exitCode = 1;
    return;
  }

  await commands[requested]();
};

void main()
  .catch((error) => {
    logger.error('Falha ao executar o comando de migração.', error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase().catch(() => undefined));
