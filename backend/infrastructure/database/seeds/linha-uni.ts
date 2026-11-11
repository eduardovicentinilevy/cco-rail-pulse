// backend/infrastructure/database/seeds/linha-uni.ts
// Carga inicial do cliente de demonstração.
//
// Era o conteúdo de `backend/domain/line.ts`: as estações da linha estavam fixas
// no domínio — as 15 da Linha 6-Laranja, depois as 14 da Linha 2-Verde, e agora
// outra vez a 6. Aqui elas são apenas dados de semeadura de um cliente entre
// outros; o domínio lê a malha do banco. Cada troca dessas, que no master é um
// commit que reescreve o domínio, aqui é uma linha de cadastro diferente.

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
  /**
   * Posição normalizada (0–1) no traçado esquemático.
   *
   * Só é necessária para a linha cadastrada sem coordenada geográfica: onde há
   * `lat`/`lon`, o painel projeta o traçado delas, girando-o para o eixo entre
   * os terminais da própria linha. Esta malha tem coordenadas, então aqui é nula.
   */
  readonly mapX: number | null;
  readonly mapY: number | null;
  /** Coordenadas aproximadas da estação (WGS 84) — base das distâncias da marcha. */
  readonly lat: number;
  readonly lon: number;
}

export interface LineSeed {
  readonly code: string;
  readonly name: string;
  /**
   * Identificador da malha que esta semeadura escreve. Quando ele muda, o deploy
   * trocou o traçado da linha de demonstração, e o estado operacional da malha
   * anterior (composições, seções de energia, estações que saíram) é descartado.
   */
  readonly meshVersion: string;
  /**
   * Códigos que esta linha já teve. Como o cliente, a linha de demonstração é
   * renomeada em vez de duplicada: a ocorrência aberta na malha anterior, a
   * trilha e a série histórica continuam penduradas na mesma linha.
   */
  readonly previousCodes: readonly string[];
  /**
   * Quanto a via é mais longa que a reta entre as estações, para esta malha.
   * Calibrado para os ~15,3 km da Linha 6-Laranja.
   */
  readonly alignmentFactor: number;
  readonly stations: readonly StationSeed[];
}

export interface TenantSeed {
  readonly slug: string;
  readonly name: string;
  /**
   * Identificadores que este cliente já teve. A semeadura renomeia o registro
   * em vez de criar um segundo: os dados do cliente de demonstração — e o
   * destino do backfill — são os mesmos de antes do nome mudar.
   */
  readonly previousSlugs: readonly string[];
  readonly lines: readonly LineSeed[];
}

/**
 * Cliente semeado quando o banco ainda não tem nenhum.
 *
 * Também é o destino do backfill: as linhas gravadas antes do multi-tenant
 * (operadores, ocorrências, composições, telemetria) passam a pertencer a ele.
 *
 * A Linha 6-Laranja é operada pela concessionária Linha Uni, e é ela o cliente
 * de demonstração. O traçado não é cadastrado como desenho: as coordenadas
 * geográficas das estações bastam, e o painel as projeta girando o eixo
 * Brasilândia → São Joaquim para a horizontal.
 */
export const DEMO_TENANT_SEED: TenantSeed = {
  slug: 'linha-uni',
  name: 'Linha Uni',
  previousSlugs: ['metro-sp'],
  lines: [
    {
      code: 'L6',
      name: 'Linha 6-Laranja',
      meshVersion: 'L6-LARANJA',
      previousCodes: ['L2'],
      alignmentFactor: 1.163,
      stations: [
        { position: 1, code: 'BRA', name: 'Brasilândia', substation: 'SR-01', nominalVoltageV: 752, connections: [], headwaySeconds: 130, mapX: null, mapY: null, lat: -23.4683, lon: -46.6908 },
        { position: 2, code: 'MAR', name: 'Maristela', substation: 'SR-01', nominalVoltageV: 748, connections: [], headwaySeconds: 120, mapX: null, mapY: null, lat: -23.476, lon: -46.6879 },
        { position: 3, code: 'ITA', name: 'Itaberaba-Hospital Vila Penteado', substation: 'SR-02', nominalVoltageV: 620, connections: [], headwaySeconds: 200, mapX: null, mapY: null, lat: -23.4835, lon: -46.6851 },
        { position: 4, code: 'JPI', name: 'João Paulo I', substation: 'SR-02', nominalVoltageV: 746, connections: [], headwaySeconds: 125, mapX: null, mapY: null, lat: -23.4912, lon: -46.6869 },
        { position: 5, code: 'FGO', name: 'Freguesia do Ó', substation: 'SR-03', nominalVoltageV: 680, connections: [], headwaySeconds: 170, mapX: null, mapY: null, lat: -23.499, lon: -46.6937 },
        { position: 6, code: 'SMA', name: 'Santa Marina', substation: 'SR-03', nominalVoltageV: 749, connections: [], headwaySeconds: 120, mapX: null, mapY: null, lat: -23.5117, lon: -46.6885 },
        { position: 7, code: 'AGB', name: 'Água Branca', substation: 'SR-04', nominalVoltageV: 750, connections: ['CPTM L7-Rubi'], headwaySeconds: 118, mapX: null, mapY: null, lat: -23.5198, lon: -46.6873 },
        { position: 8, code: 'POM', name: 'Sesc-Pompeia', substation: 'SR-04', nominalVoltageV: 751, connections: [], headwaySeconds: 118, mapX: null, mapY: null, lat: -23.5257, lon: -46.6837 },
        { position: 9, code: 'PDZ', name: 'Perdizes', substation: 'SR-05', nominalVoltageV: 748, connections: [], headwaySeconds: 118, mapX: null, mapY: null, lat: -23.5317, lon: -46.6771 },
        { position: 10, code: 'PUC', name: 'PUC-Cardoso de Almeida', substation: 'SR-05', nominalVoltageV: 750, connections: [], headwaySeconds: 118, mapX: null, mapY: null, lat: -23.5372, lon: -46.6706 },
        { position: 11, code: 'FAA', name: 'FAAP-Pacaembu', substation: 'SR-06', nominalVoltageV: 749, connections: [], headwaySeconds: 120, mapX: null, mapY: null, lat: -23.544, lon: -46.662 },
        { position: 12, code: 'HGM', name: 'Higienópolis-Mackenzie', substation: 'SR-06', nominalVoltageV: 747, connections: ['L4-Amarela'], headwaySeconds: 122, mapX: null, mapY: null, lat: -23.5474, lon: -46.652 },
        { position: 13, code: '14B', name: '14 Bis-Saracura', substation: 'SR-07', nominalVoltageV: 751, connections: [], headwaySeconds: 120, mapX: null, mapY: null, lat: -23.5532, lon: -46.6466 },
        { position: 14, code: 'BLV', name: 'Bela Vista', substation: 'SR-07', nominalVoltageV: 749, connections: [], headwaySeconds: 122, mapX: null, mapY: null, lat: -23.5573, lon: -46.6428 },
        { position: 15, code: 'SJQ', name: 'São Joaquim', substation: 'SR-08', nominalVoltageV: 750, connections: ['L1-Azul'], headwaySeconds: 130, mapX: null, mapY: null, lat: -23.5617, lon: -46.6383 },
      ],
    },
  ],
};

export const SEED_TRAINS: ReadonlyArray<
  [trainId: string, stationCode: string, direction: 1 | -1, status: string]
> = [
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
export const SEED_TEAM: ReadonlyArray<[credential: string, name: string, role: string]> = [
  ['MAR-109', 'Marina Rezende', 'OPERADOR'],
  ['SOU-012', 'Sousa Okamoto', 'OPERADOR'],
  ['LIV-551', 'Lívia Nakamura', 'SUPERVISOR'],
];

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
