// backend/infrastructure/database/seeds/metro-sp.ts
// Carga inicial do cliente de demonstração.
//
// Era o conteúdo de `backend/domain/line.ts`: as estações da linha estavam fixas
// no domínio — primeiro as 15 da Linha 6-Laranja, depois as 14 da Linha 2-Verde.
// Aqui elas são apenas dados de semeadura de um cliente entre outros; o domínio
// lê a malha do banco.

import { TRACTION_NOMINAL_V, VOLTAGE_CRITICAL_V, VOLTAGE_WARNING_V } from '../../../domain/line';

export interface StationSeed {
  readonly position: number;
  readonly code: string;
  readonly name: string;
  readonly substation: string;
  /** Tensão de referência do trecho, em volts de corrente contínua. */
  readonly nominalVoltageV: number;
  /** Integrações sinalizadas na estação, como o painel as exibe. */
  readonly connections: readonly string[];
  readonly headwaySeconds: number;
  /** Posição normalizada (0–1) no traçado esquemático desenhado pelo painel. */
  readonly mapX: number;
  readonly mapY: number;
  /** Coordenadas aproximadas da estação (WGS 84) — base das distâncias da marcha. */
  readonly lat: number;
  readonly lon: number;
}

export interface LineSeed {
  readonly code: string;
  readonly name: string;
  readonly stations: readonly StationSeed[];
}

export interface TenantSeed {
  readonly slug: string;
  readonly name: string;
  readonly lines: readonly LineSeed[];
}

/**
 * Cliente semeado quando o banco ainda não tem nenhum.
 *
 * Também é o destino do backfill: as linhas gravadas antes do multi-tenant
 * (operadores, ocorrências, composições, telemetria) passam a pertencer a ele.
 *
 * O traçado vem das coordenadas geográficas das estações, projetadas e
 * normalizadas (0–1): o eixo vertical é comprimido para caber no painel, o que
 * preserva a forma — o trecho sob a Av. Paulista, a descida ao Ipiranga e a
 * volta para o norte em Vila Prudente — sem pretender ser cartografia exata.
 */
export const METRO_SP_SEED: TenantSeed = {
  slug: 'metro-sp',
  name: 'Metrô de São Paulo',
  lines: [
    {
      code: 'L2',
      name: 'Linha 2-Verde',
      stations: [
        { position: 1, code: 'VMD', name: 'Vila Madalena', substation: 'SR-01', nominalVoltageV: 752, connections: [], headwaySeconds: 140, mapX: 0.07, mapY: 0.15909, lat: -23.5467, lon: -46.691 },
        { position: 2, code: 'SUM', name: 'Sumaré', substation: 'SR-01', nominalVoltageV: 748, connections: [], headwaySeconds: 135, mapX: 0.177, mapY: 0.20909, lat: -23.5509, lon: -46.6773 },
        { position: 3, code: 'CLI', name: 'Clínicas', substation: 'SR-02', nominalVoltageV: 750, connections: [], headwaySeconds: 132, mapX: 0.232, mapY: 0.25227, lat: -23.5544, lon: -46.6703 },
        { position: 4, code: 'CNS', name: 'Consolação', substation: 'SR-02', nominalVoltageV: 746, connections: ['L4-Amarela'], headwaySeconds: 130, mapX: 0.309, mapY: 0.29318, lat: -23.5578, lon: -46.6604 },
        { position: 5, code: 'TRI', name: 'Trianon-Masp', substation: 'SR-03', nominalVoltageV: 751, connections: [], headwaySeconds: 130, mapX: 0.338, mapY: 0.33864, lat: -23.5614, lon: -46.6566 },
        { position: 6, code: 'BGD', name: 'Brigadeiro', substation: 'SR-03', nominalVoltageV: 749, connections: [], headwaySeconds: 132, mapX: 0.395, mapY: 0.42727, lat: -23.5687, lon: -46.6493 },
        { position: 7, code: 'PSO', name: 'Paraíso', substation: 'SR-04', nominalVoltageV: 747, connections: ['L1-Azul'], headwaySeconds: 134, mapX: 0.461, mapY: 0.51364, lat: -23.5758, lon: -46.6409 },
        { position: 8, code: 'ANR', name: 'Ana Rosa', substation: 'SR-04', nominalVoltageV: 750, connections: ['L1-Azul'], headwaySeconds: 135, mapX: 0.482, mapY: 0.58182, lat: -23.5814, lon: -46.6382 },
        { position: 9, code: 'CKB', name: 'Chácara Klabin', substation: 'SR-05', nominalVoltageV: 748, connections: ['L5-Lilás'], headwaySeconds: 138, mapX: 0.552, mapY: 0.71818, lat: -23.5926, lon: -46.6292 },
        { position: 10, code: 'SIM', name: 'Santos-Imigrantes', substation: 'SR-05', nominalVoltageV: 745, connections: [], headwaySeconds: 140, mapX: 0.612, mapY: 0.76591, lat: -23.5965, lon: -46.6216 },
        // SR-06 opera com um grupo retificador fora de serviço no cenário simulado:
        // o trecho fica em fim de alimentação e a tensão cai abaixo da faixa normal.
        { position: 11, code: 'AIP', name: 'Alto do Ipiranga', substation: 'SR-06', nominalVoltageV: 620, connections: [], headwaySeconds: 220, mapX: 0.683, mapY: 0.84091, lat: -23.6027, lon: -46.6125 },
        { position: 12, code: 'SAC', name: 'Sacomã', substation: 'SR-06', nominalVoltageV: 680, connections: ['Expresso Tiradentes'], headwaySeconds: 175, mapX: 0.761, mapY: 0.82955, lat: -23.6017, lon: -46.6025 },
        { position: 13, code: 'TTI', name: 'Tamanduateí', substation: 'SR-07', nominalVoltageV: 749, connections: ['CPTM L10-Turquesa'], headwaySeconds: 140, mapX: 0.866, mapY: 0.725, lat: -23.5931, lon: -46.589 },
        { position: 14, code: 'VPT', name: 'Vila Prudente', substation: 'SR-07', nominalVoltageV: 751, connections: ['L15-Prata'], headwaySeconds: 145, mapX: 0.93, mapY: 0.61136, lat: -23.5839, lon: -46.5808 },
      ],
    },
  ],
};

/**
 * Frota semeada: doze composições espalhadas pelos dois sentidos, no máximo uma
 * por plataforma e sentido — a mesma regra de bloco que o motor de operação usa.
 * Todas começam paradas na plataforma; a tensão de cada uma é a do trecho em que
 * ela está, lida do cadastro da estação, e não um número repetido aqui.
 */
export const SEED_TRAINS: ReadonlyArray<
  [trainId: string, stationCode: string, direction: 1 | -1, status: string]
> = [
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
export const SEED_TEAM: ReadonlyArray<[credential: string, name: string, role: string]> = [
  ['MAR-109', 'Marina Rezende', 'OPERADOR'],
  ['SOU-012', 'Sousa Okamoto', 'OPERADOR'],
  ['LIV-551', 'Lívia Nakamura', 'SUPERVISOR'],
];

/** Biblioteca de referência da Central de Procedimentos, semeada junto com a malha. */
export const SEED_PROCEDURES: ReadonlyArray<{
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
      'Solicite ao controle de energia a abertura dos disjuntores de alimentação do terceiro trilho na seção.',
      'Aguarde a confirmação de ausência de tensão e o aterramento da seção antes de autorizar qualquer equipe na via.',
      'Registre horário de corte e de religamento na trilha de auditoria e na passagem de turno.',
    ],
  },
  {
    category: 'ENERGIA',
    title: 'Subtensão no terceiro trilho (SR)',
    summary:
      `Leitura abaixo da faixa operacional — menos de ${VOLTAGE_WARNING_V} V (atenção) ou ${VOLTAGE_CRITICAL_V} V (crítico) em ${TRACTION_NOMINAL_V} Vcc.`,
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
