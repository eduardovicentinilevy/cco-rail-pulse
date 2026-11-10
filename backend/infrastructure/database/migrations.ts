// backend/infrastructure/database/migrations.ts
import bcrypt from 'bcrypt';
import type { PoolClient } from 'pg';
import { db, withTransaction } from './postgres';
import { env } from '../../config/env';
import {
  findStation,
  LINE_ID,
  LINE_NAME,
  LINE_STATION_CODES,
  LINE_SUBSTATIONS,
  TRACTION_NOMINAL_V,
  VOLTAGE_CRITICAL_V,
  VOLTAGE_WARNING_V,
} from '../../domain/line';
import { generateCompliantPassword } from '../../domain/password-policy';
import { operatorRepository } from '../repositories/pg-operator.repository';
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
  ALTER TABLE operators ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE operators ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

  -- Uma linha por geração de refresh token. Revogar é um UPDATE aqui, então vale
  -- na hora para todas as instâncias — inclusive para access tokens ainda válidos.
  CREATE TABLE IF NOT EXISTS auth_sessions (
    id UUID PRIMARY KEY,
    family_id UUID NOT NULL,
    operator_id VARCHAR(50) NOT NULL REFERENCES operators (id) ON DELETE CASCADE,
    refresh_token_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    rotated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(50),
    ip VARCHAR(64),
    user_agent TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_auth_sessions_family ON auth_sessions (family_id);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_operator ON auth_sessions (operator_id);
  CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions (absolute_expires_at);

  -- Contador de rate limit compartilhado: o incremento é atômico, então o teto
  -- vale para o conjunto das instâncias e não por processo.
  CREATE TABLE IF NOT EXISTS rate_limit_hits (
    bucket_key TEXT NOT NULL,
    window_start BIGINT NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (bucket_key, window_start)
  );

  CREATE INDEX IF NOT EXISTS idx_rate_limit_expires ON rate_limit_hits (expires_at);

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

  -- Metadados da instalação. A chave 'line' guarda qual malha o banco representa,
  -- para que uma troca de linha descarte o estado operacional da malha anterior.
  CREATE TABLE IF NOT EXISTS app_meta (
    key VARCHAR(40) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

/**
 * A primeira versão do CCO modelava a tração por catenária e guardava a tensão
 * em kV. As consultas olham só o schema corrente — o mesmo que `ALTER TABLE trains`
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
 * A tração é captada no solo (terceiro trilho, 750 Vcc): renomeia as colunas e
 * amplia a precisão. Cada bloco confere a própria coluna, então o DDL também é
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

/** Chave de `app_meta` com o identificador da malha que o banco representa. */
const LINE_META_KEY = 'line';

/** Serializa migrações de boot concorrentes (duas instâncias subindo juntas). */
const LINE_MIGRATION_LOCK = 6_060_601;

/**
 * Frota semeada: doze composições espalhadas pelos dois sentidos, no máximo uma
 * por plataforma e sentido — a mesma regra de bloco que o motor de operação usa.
 * Todas circulam normalmente; restrições de velocidade são comando do operador.
 */
const SEED_TRAINS: ReadonlyArray<[trainId: string, stationCode: string, direction: 1 | -1, status: string]> = [
  ['T-01', 'BRA', 1, 'NORMAL'],
  ['T-03', 'ITA', 1, 'NORMAL'],
  ['T-05', 'SMA', 1, 'NORMAL'],
  ['T-07', 'POM', 1, 'NORMAL'],
  ['T-09', 'PUC', 1, 'NORMAL'],
  ['T-11', '14B', 1, 'NORMAL'],
  ['T-13', 'SJQ', -1, 'NORMAL'],
  ['T-15', 'HGM', -1, 'NORMAL'],
  ['T-17', 'PUC', -1, 'NORMAL'],
  ['T-19', 'POM', -1, 'NORMAL'],
  ['T-21', 'SMA', -1, 'NORMAL'],
  ['T-22', 'ITA', -1, 'NORMAL'],
];

/** Equipe de plantão de vitrine, semeada apenas fora de produção. */
const SEED_TEAM: ReadonlyArray<[id: string, name: string, role: string]> = [
  ['MAR-109', 'Marina Rezende', 'OPERADOR'],
  ['SOU-012', 'Sousa Okamoto', 'OPERADOR'],
  ['LIV-551', 'Lívia Nakamura', 'SUPERVISOR'],
];

/**
 * Biblioteca de referência semeada para a Central de Procedimentos. A Linha 6
 * opera em modo automático sem condutor (UTO): a confirmação a bordo é feita
 * pelo CFTV e pelo interfone das composições, e o apoio presencial vem dos
 * agentes de estação.
 */
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
      'Acione a frenagem de emergência da composição envolvida pelo painel do CCO.',
      'Sem condutor a bordo, confirme pelo CFTV embarcado e pelo interfone dos carros que o trem parou e que não há feridos.',
      'Registre uma ocorrência de severidade CRÍTICA vinculando a composição e a estação do evento.',
      'Notifique o supervisor de plantão e mantenha o trecho interditado até a liberação formal.',
      'Só libere a composição após inspeção do trecho pela equipe de via permanente ou pelos agentes de estação.',
    ],
  },
  {
    category: 'ENERGIA',
    title: 'Desenergização de trecho do terceiro trilho',
    summary: `Corte controlado da alimentação de tração (${TRACTION_NOMINAL_V} Vcc, captada no solo) para intervenção segura na via.`,
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
    title: 'Falha de comunicação com o CBTC (operação sem condutor)',
    summary: 'Perda de supervisão entre o CCO e o sistema de controle de trens que conduz as composições automaticamente.',
    steps: [
      'Verifique o indicador de conexão no cabeçalho do painel e tente reconectar ao gateway.',
      'Sem supervisão, as composições automáticas param em posição segura: confirme onde está cada uma pelo painel e pelo CFTV.',
      'Embarque agentes de operação nas composições paradas para a condução em modo restrito, com autorização de movimento por rádio.',
      'Aumente o intervalo entre composições até restabelecer a operação automática e acione a equipe de sinalização.',
      'Registre o intervalo sem supervisão automática na passagem de turno, mesmo após o retorno.',
    ],
  },
  {
    category: 'METEOROLOGIA',
    title: 'Risco de alagamento na travessia do Rio Tietê',
    summary: 'Chuva intensa com risco de acúmulo de água nos acessos de Freguesia do Ó e Santa Marina, nas duas margens do rio.',
    steps: [
      'Acompanhe os alertas do CGE e o nível do Rio Tietê durante o evento de chuva.',
      'Solicite ronda nos acessos de Freguesia do Ó (FGO) e Santa Marina (SMA) e nos poços de drenagem do túnel sob o rio.',
      'Se houver água próxima ao terceiro trilho, retenha as composições nas plataformas, desenergize a seção e interdite o trecho.',
      'Mantenha contato com a Defesa Civil e registre a interdição como ocorrência.',
      'Só normalize a circulação após confirmação de via seca e liberada pela equipe de via permanente.',
    ],
  },
  {
    category: 'EVACUACAO',
    title: 'Evacuação de composição parada entre estações',
    summary: 'Desembarque de passageiros fora de plataforma, por falha prolongada ou risco à composição.',
    steps: [
      'Confirme a desenergização do terceiro trilho na seção e a ausência de tráfego antes de qualquer desembarque.',
      'Informe os passageiros pelo sistema de som de bordo e envie agentes de estação até a composição — não há condutor a bordo.',
      'Acione equipe de apoio e, se necessário, Corpo de Bombeiros e Defesa Civil.',
      'Conduza os passageiros pela saída de emergência da extremidade do trem e pela passarela do túnel até a estação mais próxima.',
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
      'Acione a segurança da estação pelo canal de rádio de segurança e acompanhe pelo CFTV.',
      'Só normalize a circulação após confirmação de via livre pela segurança ou pela via permanente.',
      'Registre a ocorrência com categoria OUTROS e severidade proporcional ao risco observado.',
    ],
  },
];

/**
 * Adota a malha corrente num banco que representava outra linha (ou nenhuma).
 * Some só o estado operacional que não faz sentido aqui: composições e telemetria
 * de estações que esta malha não tem (o simulador as ignoraria para sempre), o
 * estado das seções de energia (os nomes das SRs se repetem entre malhas, mas
 * alimentam outras estações) e os procedimentos que a biblioteca não semeia mais.
 * Ocorrências, OSs, comunicações e alarmes ficam: são registro histórico.
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
  // Recriadas energizadas pela carga inicial logo depois.
  await client.query(`DELETE FROM power_sections`);
  const procedures = await client.query(`DELETE FROM procedures WHERE title <> ALL($1::text[])`, [
    SEED_PROCEDURES.map((procedure) => procedure.title),
  ]);
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
      `estações removidas, ${procedures.rowCount ?? 0} procedimento(s) substituído(s), ` +
      `${workOrders.rowCount ?? 0} OS(s) recategorizada(s), seções de energia reiniciadas.`,
  );
};

interface LineStateRow {
  legacy: boolean;
  line: string | null;
}

/** Banco ainda em kV? E qual malha ele registra (`null` em bancos anteriores ao registro)? */
const LINE_STATE_SQL = `
  SELECT (${HAS_LEGACY_VOLTAGE_COLUMNS_SQL}) AS legacy,
         (SELECT value FROM app_meta WHERE key = '${LINE_META_KEY}') AS line
`;

const toLineState = (rows: LineStateRow[]): LineStateRow => ({
  legacy: Boolean(rows[0]?.legacy),
  line: rows[0]?.line ?? null,
});

/**
 * Migração de malha. Nos boots normais é uma única consulta: o banco já está em
 * volts e registrado para esta linha. Caso contrário, tudo acontece numa só
 * transação — se o processo cair no meio, nada fica pela metade e o próximo boot
 * refaz. O estado é relido sob um advisory lock para que duas instâncias subindo
 * juntas não migrem duas vezes.
 */
const migrateLine = async (): Promise<void> => {
  const initial = toLineState((await db.query<LineStateRow>(LINE_STATE_SQL)).rows);
  if (!initial.legacy && initial.line === LINE_ID) return;

  await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [LINE_MIGRATION_LOCK]);
    const state = toLineState((await client.query<LineStateRow>(LINE_STATE_SQL)).rows);

    if (state.legacy) {
      await client.query(LEGACY_VOLTAGE_COLUMNS_DDL);
      // Leituras em kV não se convertem em leituras de terceiro trilho: a série
      // e a última tensão de cada composição eram de outro sistema de tração.
      const trains = await client.query(`DELETE FROM trains`);
      const samples = await client.query(`DELETE FROM telemetry_samples`);
      logger.info(
        `Colunas de tensão migradas de kV para V: ${trains.rowCount ?? 0} composição(ões) e ` +
          `${samples.rowCount ?? 0} janela(s) de telemetria em kV descartadas.`,
      );
    }
    if (state.legacy || state.line !== LINE_ID) await adoptCurrentLine(client, state.line);
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

/**
 * Cria o operador inicial.
 *
 * Nenhuma senha vem no código. Com `SEED_OPERATOR_PASSWORD` a senha informada é
 * usada (já validada contra a política na carga do `env`); sem ela, o boot sorteia
 * uma senha de primeiro acesso e a imprime uma única vez. Nos dois casos a conta
 * nasce marcada para troca obrigatória, de modo que a credencial semeada nunca
 * permanece válida depois do primeiro login.
 */
const seedInitialOperator = async (): Promise<void> => {
  if (await operatorRepository.exists(env.seedOperatorId)) {
    // Mantém o perfil do operador inicial alinhado à configuração,
    // sem jamais sobrescrever a senha de uma conta já existente.
    await db.query(`UPDATE operators SET role = $2 WHERE id = $1 AND role <> $2`, [
      env.seedOperatorId,
      env.seedOperatorRole,
    ]);
    return;
  }

  const password = env.seedOperatorPassword ?? generateCompliantPassword();
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  await db.query(
    `INSERT INTO operators (id, name, role, password_hash, avatar_url, is_active, must_change_password)
     VALUES ($1, $2, $3, $4, NULL, TRUE, TRUE)
     ON CONFLICT (id) DO NOTHING`,
    [env.seedOperatorId, env.seedOperatorName, env.seedOperatorRole, passwordHash],
  );

  logger.info(`Operador inicial "${env.seedOperatorId}" criado como ${env.seedOperatorRole}.`);

  if (env.seedOperatorPassword) {
    logger.info('Senha inicial lida de SEED_OPERATOR_PASSWORD. A troca será exigida no primeiro acesso.');
    return;
  }

  logger.warn(
    [
      '',
      '  ┌───────────────────────────────────────────────────────────────────┐',
      '  │ SENHA DE PRIMEIRO ACESSO — exibida uma única vez                  │',
      `  │ Credencial: ${env.seedOperatorId.padEnd(54)}│`,
      `  │ Senha:      ${password.padEnd(54)}│`,
      '  │ Troque-a no primeiro login; ela não volta a ser exibida.          │',
      '  └───────────────────────────────────────────────────────────────────┘',
      '',
    ].join('\n'),
  );
};

/**
 * Semeia a equipe de vitrine fora de produção. Cada conta recebe uma senha
 * aleatória que ninguém conhece e nasce marcada para troca: elas povoam o cadastro
 * sem criar credenciais utilizáveis.
 */
const seedDemoTeam = async (): Promise<void> => {
  for (const [id, name, role] of SEED_TEAM) {
    if (await operatorRepository.exists(id)) continue;
    const passwordHash = await bcrypt.hash(generateCompliantPassword(), env.bcryptRounds);
    await operatorRepository.create({ id, name, role, passwordHash, mustChangePassword: true });
  }
};

/** Senhas de demonstração conhecidas, herdadas das versões de protótipo. */
const LEGACY_DEMO_PASSWORDS = ['123456', 'senha123', 'railpulse'];
const LEGACY_SWEEP_LIMIT = 500;

/**
 * Marca para troca obrigatória qualquer conta que ainda use uma senha de
 * demonstração — é o que impede que uma instalação antiga continue aberta com
 * "123456" depois da atualização.
 */
const flagLegacyDemoPasswords = async (): Promise<void> => {
  const operators = await operatorRepository.listPasswordHashes();

  if (operators.length > LEGACY_SWEEP_LIMIT) {
    logger.info('Cadastro grande demais para a varredura de senhas herdadas — etapa ignorada.');
    return;
  }

  const flagged: string[] = [];

  for (const operator of operators) {
    if (operator.mustChange) continue;

    for (const legacy of LEGACY_DEMO_PASSWORDS) {
      if (await bcrypt.compare(legacy, operator.passwordHash)) {
        await operatorRepository.requirePasswordChange(operator.id);
        flagged.push(operator.id);
        break;
      }
    }
  }

  if (flagged.length > 0) {
    logger.warn(`Senha de demonstração detectada — troca obrigatória exigida de: ${flagged.join(', ')}.`);
  }
};

export const runMigrations = async (): Promise<void> => {
  await db.query(DDL);
  await migrateLine();
  await renameLegacyOperatorRole();
  logger.info('Schema verificado (self-healing DDL aplicado).');

  await seedInitialOperator();
  if (env.seedDemoTeam) await seedDemoTeam();
  await flagLegacyDemoPasswords();

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
