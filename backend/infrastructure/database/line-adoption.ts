// backend/infrastructure/database/line-adoption.ts
import type { PoolClient } from 'pg';

import { db, withTransaction } from './postgres';
import { LINE_ID, LINE_NAME, LINE_STATION_CODES, LINE_SUBSTATIONS } from '../../domain/line';
import { createLogger } from '../../shared/logger';

const logger = createLogger('DB-LINE');

/** Chave de `app_meta` com o identificador da malha que o banco representa. */
const LINE_META_KEY = 'line';

/** Serializa adoções concorrentes (duas instâncias subindo juntas). */
const LINE_ADOPTION_LOCK = 6_060_601;

const CURRENT_LINE_SQL = `SELECT value FROM app_meta WHERE key = '${LINE_META_KEY}'`;

const readRegisteredLine = async (
  run: (sql: string) => Promise<{ rows: Array<{ value: string }> }>,
): Promise<string | null> => (await run(CURRENT_LINE_SQL)).rows[0]?.value ?? null;

/**
 * Descarta o estado operacional que não pertence à malha corrente e grava qual
 * malha o banco passa a representar.
 *
 * Some só o que o CCO em execução leria errado: composições e telemetria de
 * estações que esta malha não tem (o simulador as ignoraria para sempre) e o
 * estado das seções de energia, porque os nomes das SRs se repetem entre malhas
 * mas alimentam outras estações. As seções voltam energizadas aqui mesmo, e não
 * na carga inicial, porque o motor de operação precisa delas mesmo num deploy
 * com `DB_SEED_ON_BOOT=false`.
 *
 * Ocorrências, OSs, comunicações e alarmes ficam: são registro histórico. A
 * biblioteca de procedimentos é conteúdo da carga inicial e é ela quem troca os
 * títulos substituídos: fazê-lo aqui apagaria a biblioteca de uma instalação que
 * sobe com a carga desligada e escreve os próprios procedimentos.
 */
const adoptCurrentLine = async (client: PoolClient, previousLine: string | null): Promise<void> => {
  const codes = [...LINE_STATION_CODES];

  const trains = await client.query(
    `DELETE FROM trains
     WHERE current_station_code <> ALL($1::text[])
        OR (next_station_code IS NOT NULL AND next_station_code <> ALL($1::text[]))`,
    [codes],
  );
  const samples = await client.query(`DELETE FROM telemetry_samples WHERE station_code <> ALL($1::text[])`, [codes]);

  await client.query(`DELETE FROM power_sections`);
  for (const substation of LINE_SUBSTATIONS) {
    await client.query(`INSERT INTO power_sections (substation) VALUES ($1) ON CONFLICT (substation) DO NOTHING`, [
      substation,
    ]);
  }

  // A categoria de OS de subestação de tração (TSS, em CA) virou subestação
  // retificadora (SR, em CC). As OSs ficam; só o rótulo da categoria muda.
  const workOrders = await client.query(
    `UPDATE work_orders SET category = 'SUBESTACAO_SR' WHERE category = 'TSS_SUBESTACAO'`,
  );

  await client.query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [LINE_META_KEY, LINE_ID],
  );

  logger.info(
    `Banco adotado para a ${LINE_NAME} (malha anterior: ${previousLine ?? 'não registrada'}): ` +
      `${trains.rowCount ?? 0} composição(ões) e ${samples.rowCount ?? 0} janela(s) de telemetria de outras ` +
      `estações removidas, ${workOrders.rowCount ?? 0} OS(s) recategorizada(s), ` +
      `${LINE_SUBSTATIONS.length} seção(ões) de energia reiniciada(s).`,
  );
};

/**
 * Adota a malha corrente, se o banco ainda não a registra.
 *
 * Não é uma migração versionada: não acontece numa versão fixa do schema, e sim
 * sempre que o `LINE_ID` do código divergir do que está gravado em `app_meta` —
 * um arquivo `.sql` numerado rodaria uma única vez e o checksum recusaria
 * reescrevê-lo. Roda junto das migrações, não da carga inicial, porque um deploy
 * real migra com `DB_SEED_ON_BOOT=false` e precisa do banco coerente de todo
 * jeito.
 *
 * Num boot normal é uma única consulta. Quando há o que fazer, tudo acontece em
 * uma transação, com o estado relido sob advisory lock para que duas instâncias
 * subindo juntas não adotem duas vezes.
 */
export const adoptLine = async (): Promise<void> => {
  if ((await readRegisteredLine((sql) => db.query(sql))) === LINE_ID) return;

  await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [LINE_ADOPTION_LOCK]);

    const registered = await readRegisteredLine((sql) => client.query(sql));
    if (registered === LINE_ID) return;

    await adoptCurrentLine(client, registered);
  });
};
