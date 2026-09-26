// backend/infrastructure/database/seeds/linha-uni.ts
// Carga inicial do cliente de demonstração.
//
// Era o conteúdo de `backend/domain/line.ts`: as 15 estações da Linha 6-Laranja
// estavam fixas no domínio. Aqui elas são apenas dados de semeadura de um
// cliente entre outros — o domínio lê a malha do banco.

export interface StationSeed {
  readonly position: number;
  readonly code: string;
  readonly name: string;
  readonly substation: string;
  readonly nominalVoltageKV: number;
  readonly headwaySeconds: number;
  /** Posição normalizada (0–1) no traçado esquemático desenhado pelo painel. */
  readonly mapX: number;
  readonly mapY: number;
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
 */
export const LINHA_UNI_SEED: TenantSeed = {
  slug: 'linha-uni',
  name: 'Linha Uni',
  lines: [
    {
      code: 'L6',
      name: 'Linha 6-Laranja (Linha Uni)',
      stations: [
        { position: 1, code: 'BRA', name: 'Brasilândia', substation: 'TSS-01', nominalVoltageKV: 24.6, headwaySeconds: 250, mapX: 0.07, mapY: 0.11818 },
        { position: 2, code: 'MAR', name: 'Maristela', substation: 'TSS-01', nominalVoltageKV: 24.7, headwaySeconds: 245, mapX: 0.132, mapY: 0.19091 },
        { position: 3, code: 'ITA', name: 'Itaberaba-Hospital Vila Penteado', substation: 'TSS-02', nominalVoltageKV: 22.0, headwaySeconds: 570, mapX: 0.194, mapY: 0.26364 },
        { position: 4, code: 'JPI', name: 'João Paulo I', substation: 'TSS-02', nominalVoltageKV: 24.4, headwaySeconds: 252, mapX: 0.252, mapY: 0.34545 },
        { position: 5, code: 'FGO', name: 'Freguesia do Ó', substation: 'TSS-03', nominalVoltageKV: 23.2, headwaySeconds: 400, mapX: 0.312, mapY: 0.43182 },
        { position: 6, code: 'SMA', name: 'Santa Marina', substation: 'TSS-03', nominalVoltageKV: 24.6, headwaySeconds: 242, mapX: 0.384, mapY: 0.49545 },
        { position: 7, code: 'AGB', name: 'Água Branca', substation: 'TSS-04', nominalVoltageKV: 24.5, headwaySeconds: 240, mapX: 0.456, mapY: 0.54545 },
        { position: 8, code: 'POM', name: 'SESC-Pompeia', substation: 'TSS-04', nominalVoltageKV: 24.6, headwaySeconds: 238, mapX: 0.528, mapY: 0.58182 },
        { position: 9, code: 'PDZ', name: 'Perdizes', substation: 'TSS-05', nominalVoltageKV: 24.5, headwaySeconds: 244, mapX: 0.6, mapY: 0.61364 },
        { position: 10, code: 'PUC', name: 'PUC-Cardoso de Almeida', substation: 'TSS-05', nominalVoltageKV: 24.7, headwaySeconds: 235, mapX: 0.665, mapY: 0.64545 },
        { position: 11, code: 'FAA', name: 'FAAP-Pacaembu', substation: 'TSS-06', nominalVoltageKV: 24.6, headwaySeconds: 241, mapX: 0.726, mapY: 0.68636 },
        { position: 12, code: 'HGM', name: 'Higienópolis-Mackenzie', substation: 'TSS-06', nominalVoltageKV: 24.5, headwaySeconds: 243, mapX: 0.786, mapY: 0.73182 },
        { position: 13, code: '14B', name: '14 Bis-Saracura', substation: 'TSS-07', nominalVoltageKV: 24.6, headwaySeconds: 246, mapX: 0.844, mapY: 0.78636 },
        { position: 14, code: 'BLV', name: 'Bela Vista', substation: 'TSS-07', nominalVoltageKV: 24.7, headwaySeconds: 239, mapX: 0.9, mapY: 0.84091 },
        { position: 15, code: 'SJQ', name: 'São Joaquim', substation: 'TSS-08', nominalVoltageKV: 24.6, headwaySeconds: 240, mapX: 0.952, mapY: 0.9 },
      ],
    },
  ],
};

/** Composições semeadas na malha, posicionadas em estações reais do traçado. */
export const SEED_TRAINS: ReadonlyArray<
  [trainId: string, stationCode: string, speed: number, voltage: number, status: string]
> = [
  ['T-01', 'BRA', 45, 24.6, 'NORMAL'],
  ['T-04', 'FGO', 30, 23.2, 'ATENÇÃO'],
  ['T-07', 'PDZ', 50, 24.5, 'NORMAL'],
  ['T-12', '14B', 48, 24.6, 'NORMAL'],
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
