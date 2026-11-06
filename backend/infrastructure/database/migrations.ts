// backend/infrastructure/database/migrations.ts
import bcrypt from 'bcrypt';
import type { PoolClient } from 'pg';
import { db, withTransaction } from './postgres';
import { env } from '../../config/env';
import {
  findStation,
  LINE_STATION_CODES,
  LINE_SUBSTATIONS,
  TRACTION_NOMINAL_V,
  VOLTAGE_CRITICAL_V,
  VOLTAGE_WARNING_V,
} from '../../domain/line';
import { createLogger } from '../../shared/logger';

const logger = createLogger('DB-MIGRATE');

const DDL = `
  CREATE TABLE IF NOT EXISTS operators (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'OPERADOR',
    password_hash VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    mfa_secret TEXT,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_last_used_step BIGINT
  );

  -- Self-healing: bancos criados antes do 2FA não têm essas colunas.
  ALTER TABLE operators ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
  ALTER TABLE operators ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  -- Impede o reuso do mesmo código TOTP dentro da janela de tolerância (±30s).
  ALTER TABLE operators ADD COLUMN IF NOT EXISTS mfa_last_used_step BIGINT;

  CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    operator_id VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    target VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_operator ON audit_logs (operator_id);

  CREATE TABLE IF NOT EXISTS trains (
    train_id VARCHAR(20) PRIMARY KEY,
    current_station_code VARCHAR(10) NOT NULL,
    speed_kmh NUMERIC(5, 1) NOT NULL,
    voltage_v NUMERIC(6, 1) NOT NULL,
    status VARCHAR(20) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Estado de marcha (motor de operação). ADD COLUMN IF NOT EXISTS também alcança
  -- bancos criados antes destas colunas existirem.
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS direction SMALLINT NOT NULL DEFAULT 1 CHECK (direction IN (1, -1));
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS next_station_code VARCHAR(10);
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS segment_progress REAL NOT NULL DEFAULT 0;
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS progress_at TIMESTAMPTZ;
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS remaining_ms INTEGER;
  ALTER TABLE trains ADD COLUMN IF NOT EXISTS hold_reason VARCHAR(160);

  -- Seções de alimentação do terceiro trilho, uma por subestação retificadora.
  CREATE TABLE IF NOT EXISTS power_sections (
    substation VARCHAR(10) PRIMARY KEY,
    energized BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT,
    changed_by VARCHAR(50),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    station_code VARCHAR(10),
    train_id VARCHAR(20),
    category VARCHAR(30) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
    opened_by VARCHAR(50) NOT NULL,
    assigned_to VARCHAR(50),
    resolution_note TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status, opened_at DESC);
  CREATE INDEX IF NOT EXISTS idx_incidents_station ON incidents (station_code);

  CREATE TABLE IF NOT EXISTS work_orders (
    id SERIAL PRIMARY KEY,
    title VARCHAR(120) NOT NULL,
    description TEXT NOT NULL,
    asset_code VARCHAR(80),
    station_code VARCHAR(10),
    category VARCHAR(40) NOT NULL,
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ABERTA',
    opened_by VARCHAR(50) NOT NULL,
    assigned_to VARCHAR(50),
    completion_note TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders (status, opened_at DESC);
  CREATE INDEX IF NOT EXISTS idx_work_orders_station ON work_orders (station_code);

  -- Série histórica agregada por janela: uma linha por estação por janela,
  -- em vez de uma linha por leitura (que geraria 5 escritas por segundo).
  CREATE TABLE IF NOT EXISTS telemetry_samples (
    id BIGSERIAL PRIMARY KEY,
    station_code VARCHAR(10) NOT NULL,
    bucket_at TIMESTAMPTZ NOT NULL,
    min_v NUMERIC(6, 1) NOT NULL,
    avg_v NUMERIC(6, 1) NOT NULL,
    max_v NUMERIC(6, 1) NOT NULL,
    readings INTEGER NOT NULL,
    UNIQUE (station_code, bucket_at)
  );

  CREATE INDEX IF NOT EXISTS idx_telemetry_bucket ON telemetry_samples (bucket_at DESC);

  -- Histórico persistido de alarmes: o feed ao vivo do painel vive só na sessão do
  -- navegador, então sem esta tabela um alarme desaparece ao recarregar a página.
  CREATE TABLE IF NOT EXISTS alarms (
    id SERIAL PRIMARY KEY,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_by VARCHAR(50),
    acknowledged_at TIMESTAMPTZ
  );

  CREATE INDEX IF NOT EXISTS idx_alarms_created_at ON alarms (created_at DESC);

  CREATE TABLE IF NOT EXISTS communications (
    id SERIAL PRIMARY KEY,
    channel VARCHAR(30) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    station_code VARCHAR(10),
    train_id VARCHAR(20),
    operator_id VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_communications_created_at ON communications (created_at DESC);

  CREATE TABLE IF NOT EXISTS procedures (
    id SERIAL PRIMARY KEY,
    category VARCHAR(40) NOT NULL,
    title VARCHAR(160) NOT NULL UNIQUE,
    summary TEXT NOT NULL,
    steps JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_procedures_category ON procedures (category);
`;

/**
 * Bancos criados na versão da Linha 6-Laranja guardavam tensão de catenária em kV.
 * As consultas olham só o schema corrente — o mesmo que `ALTER TABLE trains`
 * resolve —, para que uma cópia antiga em outro schema não dispare a migração.
 */
const HAS_LEGACY_VOLTAGE_COLUMNS_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND ((table_name = 'trains' AND column_name = 'voltage_kv')
        OR (table_name = 'telemetry_samples' AND column_name = 'min_kv'))
  ) AS legacy
`;

/**
 * A Linha 2-Verde é alimentada por terceiro trilho em 750 Vcc: renomeia as colunas
 * e amplia a precisão. Cada bloco confere a própria coluna, então o DDL também é
 * seguro num banco migrado pela metade.
 */
const LEGACY_VOLTAGE_COLUMNS_DDL = `
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'trains' AND column_name = 'voltage_kv'
    ) THEN
      ALTER TABLE trains RENAME COLUMN voltage_kv TO voltage_v;
      ALTER TABLE trains ALTER COLUMN voltage_v TYPE NUMERIC(6, 1);
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'telemetry_samples' AND column_name = 'min_kv'
    ) THEN
      ALTER TABLE telemetry_samples RENAME COLUMN min_kv TO min_v;
      ALTER TABLE telemetry_samples RENAME COLUMN avg_kv TO avg_v;
      ALTER TABLE telemetry_samples RENAME COLUMN max_kv TO max_v;
      ALTER TABLE telemetry_samples
        ALTER COLUMN min_v TYPE NUMERIC(6, 1),
        ALTER COLUMN avg_v TYPE NUMERIC(6, 1),
        ALTER COLUMN max_v TYPE NUMERIC(6, 1);
    END IF;
  END $$;
`;

/** Procedimentos semeados na versão da Linha 6-Laranja, substituídos pela biblioteca da Linha 2. */
const LEGACY_PROCEDURE_TITLES = [
  'Desenergização de trecho da catenária',
  'Subtensão ou sobretensão em subestação (TSS)',
  'Risco de alagamento no entorno do Rio Tietê',
  'Falha de comunicação com o sistema ATS',
];

/**
 * Frota semeada: doze composições espalhadas pelos dois sentidos, no máximo uma
 * por plataforma e sentido — a mesma regra de bloco que o motor de operação usa.
 * Todas circulam normalmente; restrições de velocidade são comando do operador.
 */
const SEED_TRAINS: ReadonlyArray<[trainId: string, stationCode: string, direction: 1 | -1, status: string]> = [
  ['T-01', 'VMD', 1, 'NORMAL'],
  ['T-04', 'CNS', 1, 'NORMAL'],
  ['T-07', 'PSO', 1, 'NORMAL'],
  ['T-10', 'CKB', 1, 'NORMAL'],
  ['T-13', 'SAC', -1, 'NORMAL'],
  ['T-16', 'VPT', -1, 'NORMAL'],
  ['T-19', 'AIP', 1, 'NORMAL'],
  ['T-22', 'SIM', -1, 'NORMAL'],
  ['T-25', 'TTI', 1, 'NORMAL'],
  ['T-28', 'ANR', -1, 'NORMAL'],
  ['T-31', 'BGD', -1, 'NORMAL'],
  ['T-34', 'SUM', -1, 'NORMAL'],
];

/** Equipe de plantão semeada para demonstrar o cadastro e os perfis de acesso. */
const SEED_TEAM: ReadonlyArray<[id: string, name: string, role: string]> = [
  ['MAR-109', 'Marina Rezende', 'OPERADOR'],
  ['SOU-012', 'Sousa Okamoto', 'OPERADOR'],
  ['LIV-551', 'Lívia Nakamura', 'SUPERVISOR'],
];

/** Biblioteca de referência semeada para a Central de Procedimentos. */
const SEED_PROCEDURES: ReadonlyArray<{
  category: string;
  title: string;
  summary: string;
  steps: string[];
}> = [
  {
    category: 'EMERGENCIA',
    title: 'Acionamento de frenagem de emergência',
    summary: 'Parada imediata de uma composição diante de risco iminente à via ou a pessoas.',
    steps: [
      'Emita o comando EMERGENCY_BRAKE_OVERRIDE para a composição envolvida a partir do terminal da estação.',
      'Confirme com o operador de trem pelo rádio que o freio foi aplicado e que não há feridos.',
      'Registre uma ocorrência de severidade CRÍTICA vinculando a composição e a estação do evento.',
      'Notifique o supervisor de plantão e mantenha a via interditada até a liberação formal.',
      'Só libere o sinal (RELEASE_SIGNAL) após inspeção visual do trecho pela equipe de via permanente.',
    ],
  },
  {
    category: 'ENERGIA',
    title: 'Desenergização de trecho do terceiro trilho',
    summary: `Corte controlado da alimentação de tração (${TRACTION_NOMINAL_V} Vcc) para intervenção segura na via.`,
    steps: [
      'Confirme com a manutenção qual subestação retificadora (SR) e qual seção elétrica precisam ser isoladas.',
      'Retire ou retenha nas plataformas as composições da seção antes do corte — nenhuma pode ficar entre estações.',
      'Abra os disjuntores da seção em Energia de tração (perfil supervisor), registrando o motivo da manobra.',
      'Aguarde a confirmação de ausência de tensão e o aterramento da seção antes de autorizar qualquer equipe na via.',
      'Registre horário de corte e de religamento na trilha de auditoria e na passagem de turno.',
    ],
  },
  {
    category: 'ENERGIA',
    title: 'Subtensão no terceiro trilho (SR)',
    summary: `Leitura abaixo da faixa operacional — menos de ${VOLTAGE_WARNING_V} V (atenção) ou ${VOLTAGE_CRITICAL_V} V (crítico) em ${TRACTION_NOMINAL_V} Vcc.`,
    steps: [
      'Verifique no painel de Telemetria SR se o desvio é pontual (pico de demanda) ou uma tendência sustentada.',
      'Compare com as estações vizinhas da mesma SR: um desvio isolado sugere medição, não alimentação.',
      `Abaixo de ${VOLTAGE_CRITICAL_V} V, restrinja a velocidade das composições na seção — a tração perde desempenho e pode haver parada entre estações.`,
      'Acione a manutenção de energia informando a SR, a leitura e o horário de início do desvio.',
      'Abra uma ocorrência de categoria ENERGIA se o desvio persistir por mais de cinco minutos.',
    ],
  },
  {
    category: 'SINALIZACAO',
    title: 'Falha de comunicação com o sistema ATS/CBTC',
    summary: 'Perda de supervisão entre o painel do CCO e o sistema de sinalização e controle de trens.',
    steps: [
      'Verifique o indicador de conexão no cabeçalho do painel e tente reconectar ao gateway.',
      'Se a falha persistir, passe a operação ao modo de condução restrita, com autorização de movimento por rádio.',
      'Aumente o intervalo entre composições até restabelecer a supervisão automática.',
      'Acione a equipe de sinalização informando o horário exato da perda de comunicação.',
      'Registre o intervalo sem supervisão automática na passagem de turno, mesmo após o retorno.',
    ],
  },
  {
    category: 'METEOROLOGIA',
    title: 'Risco de alagamento na várzea do Tamanduateí',
    summary: 'Chuva intensa com risco de acúmulo de água nos acessos e na integração com a CPTM em Tamanduateí.',
    steps: [
      'Acompanhe os alertas do CGE e o nível do rio Tamanduateí durante o evento de chuva.',
      'Solicite ronda nos acessos de Tamanduateí (TTI) e na passagem de integração com a CPTM Linha 10-Turquesa.',
      'Se houver água próxima ao terceiro trilho, desenergize a seção e interdite o trecho antes de qualquer outra ação.',
      'Mantenha contato com a Defesa Civil e com o CCO da CPTM; registre a interdição como ocorrência.',
      'Só normalize a circulação após confirmação de via seca e liberada pela equipe de via permanente.',
    ],
  },
  {
    category: 'EVACUACAO',
    title: 'Evacuação de composição parada entre estações',
    summary: 'Desembarque de passageiros fora de plataforma, por falha prolongada ou risco à composição.',
    steps: [
      'Confirme a desenergização do terceiro trilho na seção e a ausência de tráfego antes de qualquer desembarque.',
      'Oriente o operador de trem a informar os passageiros e preparar o desembarque pela passarela de emergência.',
      'Acione equipe de apoio e, se necessário, Corpo de Bombeiros e Defesa Civil.',
      'Conduza os passageiros a pé até a estação mais próxima, sempre afastados do terceiro trilho.',
      'Registre a ocorrência com horário de parada, de início e de fim da evacuação.',
    ],
  },
  {
    category: 'SEGURANCA',
    title: 'Invasão de via ou plataforma',
    summary: 'Pessoa ou objeto estranho na via — com o terceiro trilho energizado, o risco é de eletrocução.',
    steps: [
      'Retenha nas plataformas as composições que se aproximam do trecho afetado.',
      'Solicite a desenergização imediata do terceiro trilho na seção se houver pessoa na via.',
      'Acione a segurança da estação pelo canal de rádio de segurança.',
      'Só normalize a circulação após confirmação de via livre pela segurança ou pela via permanente.',
      'Registre a ocorrência com categoria OUTROS e severidade proporcional ao risco observado.',
    ],
  },
];

/**
 * Remove o estado operacional herdado da Linha 6-Laranja: composições paradas em
 * estações que não existem nesta malha (o simulador as ignoraria para sempre), a
 * série histórica medida em kV e os procedimentos substituídos. Ocorrências, OSs
 * e comunicações antigas ficam: são registro histórico, não estado da malha.
 */
const purgeLegacyLineData = async (client: PoolClient): Promise<void> => {
  const codes = [...LINE_STATION_CODES];
  const trains = await client.query(`DELETE FROM trains WHERE current_station_code <> ALL($1::text[])`, [codes]);
  const samples = await client.query(`DELETE FROM telemetry_samples WHERE station_code <> ALL($1::text[])`, [codes]);
  const procedures = await client.query(`DELETE FROM procedures WHERE title = ANY($1::text[])`, [
    LEGACY_PROCEDURE_TITLES,
  ]);
  // A categoria de OS de subestação de tração (TSS, em CA) virou subestação
  // retificadora (SR, em CC). As OSs ficam; só o rótulo da categoria muda.
  const workOrders = await client.query(
    `UPDATE work_orders SET category = 'SUBESTACAO_SR' WHERE category = 'TSS_SUBESTACAO'`,
  );

  logger.info(
    `Dados da malha anterior migrados: ${trains.rowCount ?? 0} composição(ões) e ` +
      `${samples.rowCount ?? 0} janela(s) de telemetria removidas, ${procedures.rowCount ?? 0} procedimento(s) ` +
      `substituído(s), ${workOrders.rowCount ?? 0} OS(s) recategorizada(s).`,
  );
};

/**
 * Migração única da malha da Linha 6 para a Linha 2. Só roda quando as colunas
 * em kV ainda existem — nos boots seguintes é uma única consulta ao catálogo.
 * Renomear as colunas e limpar os dados antigos acontece na mesma transação: se
 * o processo cair no meio, nada fica pela metade e o próximo boot refaz tudo.
 */
const migrateLegacyLine = async (): Promise<void> => {
  const detection = await db.query<{ legacy: boolean }>(HAS_LEGACY_VOLTAGE_COLUMNS_SQL);
  if (!detection.rows[0]?.legacy) return;

  await withTransaction(async (client) => {
    await client.query(LEGACY_VOLTAGE_COLUMNS_DDL);
    await purgeLegacyLineData(client);
  });
};

/**
 * Renomeia o perfil `OPERATOR_SOC` (jargão de centro de operações de segurança,
 * herdado por engano) para `OPERADOR`. Idempotente: em bancos novos não há
 * linhas a converter e o DEFAULT já nasce correto.
 */
const renameLegacyOperatorRole = async (): Promise<void> => {
  const updated = await db.query(`UPDATE operators SET role = 'OPERADOR' WHERE role = 'OPERATOR_SOC'`);

  // O DEFAULT do CREATE TABLE não alcança tabelas que já existem.
  await db.query(`ALTER TABLE operators ALTER COLUMN role SET DEFAULT 'OPERADOR'`);

  if (updated.rowCount && updated.rowCount > 0) {
    logger.info(`Perfil OPERATOR_SOC migrado para OPERADOR em ${updated.rowCount} operador(es).`);
  }
};

export const runMigrations = async (): Promise<void> => {
  await db.query(DDL);
  await migrateLegacyLine();
  await renameLegacyOperatorRole();
  logger.info('Schema verificado (self-healing DDL aplicado).');

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

  for (const [trainId, stationCode, direction, status] of SEED_TRAINS) {
    const station = findStation(stationCode);
    if (!station) continue;
    await db.query(
      `INSERT INTO trains (train_id, current_station_code, speed_kmh, voltage_v, status, direction)
       VALUES ($1, $2, 0, $3, $4, $5)
       ON CONFLICT (train_id) DO NOTHING`,
      [trainId, stationCode, station.nominalVoltageV, status, direction],
    );
  }

  for (const substation of LINE_SUBSTATIONS) {
    await db.query(`INSERT INTO power_sections (substation) VALUES ($1) ON CONFLICT (substation) DO NOTHING`, [
      substation,
    ]);
  }

  for (const procedure of SEED_PROCEDURES) {
    await db.query(
      `INSERT INTO procedures (category, title, summary, steps)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (title) DO UPDATE
       SET category = EXCLUDED.category, summary = EXCLUDED.summary, steps = EXCLUDED.steps, updated_at = NOW()
       WHERE procedures.summary IS DISTINCT FROM EXCLUDED.summary
          OR procedures.steps IS DISTINCT FROM EXCLUDED.steps
          OR procedures.category IS DISTINCT FROM EXCLUDED.category`,
      [procedure.category, procedure.title, procedure.summary, JSON.stringify(procedure.steps)],
    );
  }

  logger.info('Carga inicial (auto-seeding) sincronizada.');
};
