// backend/domain/dispatch.ts
// Decisão de despacho de uma composição, regra a regra. Função pura: recebe o
// estado da frota e o contexto (relógio, energia, fim das paradas) e devolve a
// próxima ação. O simulador só aplica o que esta função decide — e os testes
// cobrem cada regra sem banco, sem timers e sem aleatoriedade.
import type { TrainSession } from './entities/TrainSession';
import type { LineCatalog } from './line';
import type { Direction, LineOperation } from './operation';

export interface DispatchContext {
  /**
   * Marcha da linha em que a composição circula — é dela que saem a vizinhança
   * das estações e os terminais. Sem isso o despacho só saberia decidir numa
   * linha por processo, e a `PSO` de um cliente seguiria para a `ANR` de outro.
   */
  operation: LineOperation;
  now: Date;
  /** Instante (epoch ms) em que termina a parada da composição na plataforma; ausente = pode partir. */
  dwellUntil: (trainId: string) => number | undefined;
  /** A subestação retificadora alimenta o terceiro trilho? */
  isEnergized: (substation: string) => boolean;
  /** Última partida (epoch ms) da plataforma no sentido dado; ausente = sem referência ainda. */
  lastDepartureAt?: (stationCode: string, direction: Direction) => number | undefined;
  /** Intervalo mínimo entre partidas da mesma plataforma, em ms de relógio; 0 desliga a regulação. */
  minHeadwayMs?: number;
}

export type DispatchAction =
  | { type: 'NONE' }
  | { type: 'ARRIVE' }
  | { type: 'DEPART'; toStationCode: string }
  | { type: 'HOLD'; reason: string }
  | { type: 'SUSPEND'; reason: string }
  | { type: 'RESUME' }
  | { type: 'REVERSE' }
  | { type: 'SETTLE' }
  /** Regulação de intervalo: prolonga a parada até `untilMs` (epoch ms). Não é retenção — é a rotina. */
  | { type: 'REGULATE'; untilMs: number };

const NONE: DispatchAction = { type: 'NONE' };

/** Primeira subestação desenergizada entre as que alimentam as estações dadas. */
export const deenergizedSubstation = (
  catalog: LineCatalog,
  stationCodes: readonly string[],
  isEnergized: (substation: string) => boolean,
): string | undefined => {
  for (const code of stationCodes) {
    const substation = catalog.find(code)?.substation;
    if (substation && !isEnergized(substation)) return substation;
  }
  return undefined;
};

export const noPowerReason = (substation: string): string => `Seção ${substation} sem tensão no terceiro trilho`;

/**
 * Composição que ocupa o bloco de destino no mesmo sentido: parada na plataforma
 * de destino, ou já a caminho dela. Cada sentido tem a própria via, então um trem
 * no sentido oposto nunca bloqueia.
 */
export const blockingTrain = (
  train: TrainSession,
  toStationCode: string,
  fleet: readonly TrainSession[],
): TrainSession | undefined =>
  fleet.find(
    (other) =>
      other.trainId !== train.trainId &&
      other.direction === train.direction &&
      (other.motion ? other.motion.toStationCode === toStationCode : other.currentStationCode === toStationCode),
  );

export const blockedReason = (blocker: TrainSession): string => `Aguardando via livre — ${blocker.trainId} à frente`;

export const planTrain = (
  train: TrainSession,
  fleet: readonly TrainSession[],
  context: DispatchContext,
): DispatchAction => {
  // Frenagem de emergência: nada se move até o CCO liberar a composição.
  if (train.status === 'EMERGÊNCIA') return NONE;
  const { catalog } = context.operation;
  // Estação fora da malha (dado corrompido ou de outra linha): sem traçado, não há
  // o que decidir — sem esta guarda o trem inverteria o sentido para sempre.
  if (!catalog.has(train.currentStationCode)) return NONE;

  const motion = train.motion;
  if (motion) {
    const unpowered = deenergizedSubstation(
      catalog,
      [train.currentStationCode, motion.toStationCode],
      context.isEnergized,
    );

    if (motion.remainingMs !== null) {
      // Sem tensão no trecho o trem perde tração e para onde estiver.
      if (unpowered) return { type: 'SUSPEND', reason: noPowerReason(unpowered) };
      return train.isArrivalDue(context.now) ? { type: 'ARRIVE' } : NONE;
    }

    // Marcha suspensa: retoma quando a energia volta.
    if (unpowered) {
      const reason = noPowerReason(unpowered);
      return train.holdReason === reason ? NONE : { type: 'SUSPEND', reason };
    }
    return { type: 'RESUME' };
  }

  // Na plataforma: velocidade residual de um estado anterior é zerada.
  const dwellUntil = context.dwellUntil(train.trainId);
  if (dwellUntil !== undefined && context.now.getTime() < dwellUntil) {
    return train.speedKmH > 0 ? { type: 'SETTLE' } : NONE;
  }

  const next = context.operation.nextStationCode(train.currentStationCode, train.direction);
  // Fim da linha no sentido atual: manobra de inversão.
  if (next === undefined) return { type: 'REVERSE' };

  const unpowered = deenergizedSubstation(catalog, [train.currentStationCode, next], context.isEnergized);
  if (unpowered) {
    const reason = noPowerReason(unpowered);
    return train.holdReason === reason ? NONE : { type: 'HOLD', reason };
  }

  const blocker = blockingTrain(train, next, fleet);
  if (blocker) {
    const reason = blockedReason(blocker);
    return train.holdReason === reason ? NONE : { type: 'HOLD', reason };
  }

  // Regulação de intervalo (como no ATS real): sem ela, quem vem atrás alcança o
  // trem da frente e a frota vira um comboio. A composição espera na plataforma
  // até completar o intervalo mínimo desde a última partida dali, no mesmo sentido.
  const minHeadway = context.minHeadwayMs ?? 0;
  const lastDeparture = context.lastDepartureAt?.(train.currentStationCode, train.direction);
  if (minHeadway > 0 && lastDeparture !== undefined) {
    const earliest = lastDeparture + minHeadway;
    if (context.now.getTime() < earliest) return { type: 'REGULATE', untilMs: earliest };
  }

  return { type: 'DEPART', toStationCode: next };
};
