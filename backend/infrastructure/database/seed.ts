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
