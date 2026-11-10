// backend/infrastructure/database/seed.ts
import bcrypt from 'bcrypt';

import { db } from './postgres';
import { env } from '../../config/env';
import {
  findStation,
  LINE_SUBSTATIONS,
  TRACTION_NOMINAL_V,
  VOLTAGE_CRITICAL_V,
  VOLTAGE_WARNING_V,
} from '../../domain/line';
import { createLogger } from '../../shared/logger';

const logger = createLogger('DB-SEED');

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

/** Equipe de plantão semeada para demonstrar o cadastro e os perfis de acesso. */
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

  // Uma seção de alimentação por subestação retificadora do traçado, energizada.
  for (const substation of LINE_SUBSTATIONS) {
    await db.query(`INSERT INTO power_sections (substation) VALUES ($1) ON CONFLICT (substation) DO NOTHING`, [
      substation,
    ]);
  }

  // A biblioteca é conteúdo desta carga, então é ela quem troca os títulos que
  // uma versão anterior do projeto semeou — e não a adoção de malha, que roda
  // também num deploy real. Numa instalação de verdade a carga fica desligada
  // (`DB_SEED_ON_BOOT=false`) e a biblioteca é do operador; aqui, onde ela roda,
  // o que não está em `SEED_PROCEDURES` é resto de demonstração.
  const replaced = await db.query(`DELETE FROM procedures WHERE title <> ALL($1::text[])`, [
    SEED_PROCEDURES.map((procedure) => procedure.title),
  ]);
  if (replaced.rowCount && replaced.rowCount > 0) {
    logger.info(`${replaced.rowCount} procedimento(s) de uma versão anterior da biblioteca removido(s).`);
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

  logger.info('Carga inicial sincronizada.');
};
