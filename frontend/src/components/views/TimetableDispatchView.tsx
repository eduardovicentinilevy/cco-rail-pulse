// frontend/src/components/views/TimetableDispatchView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import type { ArrivalsPayload, Station, Train } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { downloadTextFile, formatDateTime, toCsv } from '../../lib/format';
import { formatClockDuration } from '../../lib/arrivals';
import { directionArrow, PHASE_LABELS, PHASE_STATUS, trainProgress } from '../../data/trains';

interface TimetableDispatchViewProps {
  trains: Train[];
  stations: Station[];
  /** Intervalo e ciclo da operação, vindos da previsão de chegadas (`null` até a primeira consulta). */
  service: ArrivalsPayload['service'] | null;
}

type DispatchStatus = 'EM_HORA' | 'ATRASADO';

const DISPATCH_LABELS: Record<DispatchStatus, string> = { EM_HORA: 'Em hora', ATRASADO: 'Atrasado' };

/**
 * Uma composição perde a tabela quando está retida, parada no trecho, imobilizada
 * ou circulando sob restrição de velocidade (V.R.).
 */
const classifyDispatch = (train: Train): DispatchStatus =>
  train.phase === 'RETIDO' ||
  train.phase === 'PARADO_ENTRE_ESTACOES' ||
  train.phase === 'IMOBILIZADO' ||
  train.status === 'ATENÇÃO'
    ? 'ATRASADO'
    : 'EM_HORA';

/** Há quanto tempo a composição está parada fora da rotina (desde o último registro de estado). */
const stoppedForSeconds = (train: Train, now: number): number | null =>
  train.phase === 'RETIDO' || train.phase === 'PARADO_ENTRE_ESTACOES' || train.phase === 'IMOBILIZADO'
    ? Math.max(0, Math.round((now - Date.parse(train.updatedAt)) / 1000))
    : null;

export const TimetableDispatchView: React.FC<TimetableDispatchViewProps> = ({ trains, stations, service }) => {
  const [onlyDeviations, setOnlyDeviations] = useState(false);
  // Dois relógios: o de parede (para "parado há", comparado ao carimbo do servidor) e o
  // monotônico (para o andamento no trecho, comparado à chegada do snapshot).
  const [clock, setClock] = useState(() => ({ wall: Date.now(), mono: performance.now() }));

  // "Parado há" e o andamento no trecho avançam a cada segundo.
  useEffect(() => {
    const timer = window.setInterval(() => setClock({ wall: Date.now(), mono: performance.now() }), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stationNames = useMemo(
    () => new Map(stations.map((station) => [station.code, station.name])),
    [stations],
  );

  /**
   * Sentidos e intervalo-alvo saem da malha da sessão, não de constante: o
   * traçado é da linha (nem toda linha corre de oeste para leste) e o intervalo
   * de projeto é cadastro de cada estação.
   */
  const terminals = useMemo(
    () => ({
      forward: stations[stations.length - 1]?.name ?? 'sentido crescente',
      backward: stations[0]?.name ?? 'sentido decrescente',
    }),
    [stations],
  );
  const targetHeadwaySec = useMemo(() => {
    const declared = stations
      .map((station) => station.headwaySeconds)
      .filter((value): value is number => value !== null && value > 0);
    return declared.length > 0 ? Math.min(...declared) : null;
  }, [stations]);

  const dispatches = useMemo(
    () =>
      trains
        .map((train) => {
          const from = stationNames.get(train.currentStationCode) ?? train.currentStationCode;
          const to = train.nextStationCode ? (stationNames.get(train.nextStationCode) ?? train.nextStationCode) : null;
          const progress = Math.round(trainProgress(train, clock.mono) * 100);
          return {
            train,
            status: classifyDispatch(train),
            position: to ? `${from} → ${to} (${progress}%)` : from,
            stoppedFor: stoppedForSeconds(train, clock.wall),
          };
        })
        .sort((a, b) => a.train.trainId.localeCompare(b.train.trainId)),
    [trains, stationNames, clock],
  );

  const visible = onlyDeviations ? dispatches.filter((item) => item.status !== 'EM_HORA') : dispatches;
  const deviationCount = dispatches.filter((item) => item.status !== 'EM_HORA').length;
  const headway = service?.headwaySeconds ?? null;

  const handleExport = () => {
    const csv = toCsv(
      ['Trem', 'Sentido', 'Posição', 'Situação', 'Velocidade (km/h)', 'Parado há (s)', 'Status', 'Atualizado em'],
      dispatches.map((item) => [
        item.train.trainId,
        item.train.direction === 1 ? terminals.forward : terminals.backward,
        item.position,
        PHASE_LABELS[item.train.phase],
        item.train.speedKmH,
        item.stoppedFor ?? '',
        item.status,
        formatDateTime(item.train.updatedAt),
      ]),
    );
    downloadTextFile(`railpulse-escala-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Operação</span>
          <h2 className="rp-page-header__title">Escala e partidas (headway)</h2>
          <p className="rp-page-header__subtitle">
            Situação de cada composição e intervalo real da linha, a partir da marcha simulada
          </p>
        </div>
        <div className="rp-row">
          <button
            type="button"
            className="rp-chip"
            aria-pressed={onlyDeviations}
            onClick={() => setOnlyDeviations((value) => !value)}
          >
            Somente desvios ({deviationCount})
          </button>
          <button type="button" className="rp-btn" onClick={handleExport} disabled={dispatches.length === 0}>
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="rp-grid rp-grid--kpi">
        <article className="rp-metric" data-status="INFO">
          <span className="rp-metric__label">Intervalo-alvo (pico)</span>
          <span className="rp-metric__value mono">
            {targetHeadwaySec === null ? '—' : formatClockDuration(targetHeadwaySec)}
          </span>
          <span className="rp-metric__hint">Menor intervalo cadastrado na malha</span>
        </article>
        <article
          className="rp-metric"
          data-status={
            headway === null || targetHeadwaySec === null
              ? 'INFO'
              : headway <= targetHeadwaySec * 1.5
                ? 'NORMAL'
                : 'ATENÇÃO'
          }
        >
          <span className="rp-metric__label">Intervalo real por plataforma</span>
          <span className="rp-metric__value mono">{headway === null ? '—' : formatClockDuration(headway)}</span>
          <span className="rp-metric__hint">
            {service ? `${service.trainsInService} composições em serviço` : 'Aguardando a previsão de chegadas'}
          </span>
        </article>
        <article className="rp-metric" data-status={deviationCount > 0 ? 'ATENÇÃO' : 'NORMAL'}>
          <span className="rp-metric__label">Fora da tabela</span>
          <span className="rp-metric__value">
            {deviationCount} / {dispatches.length}
          </span>
          <span className="rp-metric__hint">Retidas, paradas, imobilizadas ou sob V.R.</span>
        </article>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="🕒"
          title={dispatches.length === 0 ? 'Nenhuma composição em circulação.' : 'Nenhum desvio de tabela no momento.'}
        />
      ) : (
        <div className="rp-card rp-card--flush">
          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="sr-only">Composições em circulação e aderência à tabela horária</caption>
              <thead>
                <tr>
                  <th scope="col">Composição</th>
                  <th scope="col">Sentido</th>
                  <th scope="col">Posição</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Marcha</th>
                  <th scope="col">Parado há</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ train, status, position, stoppedFor }) => (
                  <tr key={train.trainId}>
                    <td>
                      <strong className="mono">{train.trainId}</strong>
                    </td>
                    <td className="truncate">
                      {directionArrow(train.direction)} {train.direction === 1 ? terminals.forward : terminals.backward}
                    </td>
                    <td className="truncate" title={train.holdReason ?? undefined}>
                      {position}
                    </td>
                    <td>
                      <StatusPill status={PHASE_STATUS[train.phase]} label={PHASE_LABELS[train.phase]} />
                    </td>
                    <td className="rp-table__accent">{train.phase === 'EM_MARCHA' ? `${train.speedKmH} km/h` : '—'}</td>
                    <td className="mono text-muted">{stoppedFor === null ? '—' : formatClockDuration(stoppedFor)}</td>
                    <td>
                      <StatusPill status={status} label={DISPATCH_LABELS[status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
