// backend/infrastructure/database/migrations.ts
import bcrypt from 'bcrypt';
import { db } from './postgres';
import { env } from '../../config/env';
import { LINE_STATIONS } from '../../domain/line';
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
    voltage_kv NUMERIC(5, 2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

  -- Série histórica agregada por janela: uma linha por estação por janela,
  -- em vez de uma linha por leitura (que geraria 5 escritas por segundo).
  CREATE TABLE IF NOT EXISTS telemetry_samples (
    id BIGSERIAL PRIMARY KEY,
    station_code VARCHAR(10) NOT NULL,
    bucket_at TIMESTAMPTZ NOT NULL,
    min_kv NUMERIC(5, 2) NOT NULL,
    avg_kv NUMERIC(5, 2) NOT NULL,
    max_kv NUMERIC(5, 2) NOT NULL,
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
      'Emita o comando EMERGENCY_BRAKE_OVERRIDE para a composição envolvida a partir do painel da estação.',
      'Confirme com o maquinista pelo rádio de condução que o freio foi aplicado e que não há feridos.',
      'Registre uma ocorrência de severidade CRÍTICA vinculando a composição e a estação do evento.',
      'Notifique o supervisor de plantão e mantenha a via interditada até a liberação formal.',
      'Só libere o sinal (RELEASE_SIGNAL) após inspeção visual do trecho pela equipe de via permanente.',
    ],
  },
  {
    category: 'ENERGIA',
    title: 'Desenergização de trecho da catenária',
    summary: 'Corte controlado de energia de tração em uma subestação para intervenção segura.',
    steps: [
      'Confirme com a manutenção qual subestação (TSS) precisa ser isolada e o trecho de estações afetado.',
      'Restrinja a velocidade das composições no trecho (SPEED_RESTRICTION_20KM) antes do corte.',
      'Solicite à concessionária de energia ou ao quadro de força a abertura do disjuntor da subestação.',
      'Aguarde a confirmação de tensão zero antes de autorizar qualquer equipe a acessar a catenária.',
      'Registre horário de corte e de religamento na trilha de auditoria e na passagem de turno.',
    ],
  },
  {
    category: 'ENERGIA',
    title: 'Subtensão ou sobretensão em subestação (TSS)',
    summary: 'Leitura de tensão fora da faixa nominal — abaixo de 23,8 kV (atenção) ou 22,5 kV (crítico).',
    steps: [
      'Verifique no painel de Telemetria TSS se o desvio é pontual (ruído) ou uma tendência sustentada.',
      'Compare com estações vizinhas da mesma subestação: um desvio isolado sugere sensor, não a rede.',
      'Abaixo de 22,5 kV, restrinja a velocidade das composições no trecho até a normalização.',
      'Acione a manutenção de energia informando a subestação, a leitura e o horário de início do desvio.',
      'Abra uma ocorrência de categoria ENERGIA se o desvio persistir por mais de cinco minutos.',
    ],
  },
  {
    category: 'SINALIZACAO',
    title: 'Falha de comunicação com o sistema ATS',
    summary: 'Perda de sincronismo entre o painel do CCO e o sistema de sinalização/supervisão da malha.',
    steps: [
      'Verifique o indicador de conexão no cabeçalho do painel e tente reconectar ao gateway.',
      'Se a falha persistir, mude a operação para o modo de despacho por rádio com os maquinistas.',
      'Reduza a velocidade de todas as composições em campo até restabelecer a supervisão automática.',
      'Acione a equipe de TI/sinalização informando o horário exato da perda de comunicação.',
      'Registre o intervalo sem supervisão automática na passagem de turno, mesmo após o retorno.',
    ],
  },
  {
    category: 'METEOROLOGIA',
    title: 'Risco de alagamento no entorno do Rio Tietê',
    summary: 'Chuva intensa com risco de acúmulo de água próximo ao trecho que cruza a faixa do Tietê.',
    steps: [
      'Acompanhe o boletim meteorológico e o nível do rio nas estações mais próximas da faixa (FGO–SMA).',
      'Solicite ronda visual da via permanente no trecho de cruzamento assim que a chuva se intensificar.',
      'Se houver água sobre o lastro, restrinja a velocidade e avalie a interdição preventiva do trecho.',
      'Mantenha contato constante com a Defesa Civil e registre qualquer interdição como ocorrência.',
      'Só normalize a velocidade após confirmação de via seca e liberada pela equipe de via permanente.',
    ],
  },
  {
    category: 'EVACUACAO',
    title: 'Evacuação de composição parada entre estações',
    summary: 'Desembarque de passageiros fora de plataforma, por falha prolongada ou risco à composição.',
    steps: [
      'Confirme que a via está desenergizada e sem tráfego antes de autorizar qualquer desembarque.',
      'Oriente o maquinista a informar os passageiros e preparar o desembarque pela via de fuga mais próxima.',
      'Acione equipe de apoio e, se necessário, corpo de bombeiros e Defesa Civil.',
      'Conduza os passageiros a pé até a estação mais próxima, sempre pelo lado oposto à via oposta.',
      'Registre a ocorrência com horário de parada, de início e de fim da evacuação.',
    ],
  },
  {
    category: 'SEGURANCA',
    title: 'Invasão de via ou plataforma',
    summary: 'Pessoa ou objeto estranho identificado na via, colocando em risco a circulação.',
    steps: [
      'Restrinja imediatamente a velocidade das composições que se aproximam do trecho afetado.',
      'Se o risco for iminente, acione a frenagem de emergência da composição mais próxima.',
      'Acione a segurança patrimonial da estação pelo canal de rádio de segurança.',
      'Só normalize a circulação após confirmação de via livre pela segurança ou pela via permanente.',
      'Registre a ocorrência com categoria OUTROS e severidade proporcional ao risco observado.',
    ],
  },
];

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

  for (const procedure of SEED_PROCEDURES) {
    await db.query(
      `INSERT INTO procedures (category, title, summary, steps)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (title) DO NOTHING`,
      [procedure.category, procedure.title, procedure.summary, JSON.stringify(procedure.steps)],
    );
  }

  logger.info('Carga inicial (auto-seeding) sincronizada.');
};
