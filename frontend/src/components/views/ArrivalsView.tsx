// frontend/src/components/views/ArrivalsView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import type { ArrivalEntry, ArrivalsPayload, Train } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { formatClockDuration, secondsUntil } from '../../lib/arrivals';

interface ArrivalsViewProps {
  arrivals: ArrivalsPayload | null;
  /** `performance.now()` da última previsão recebida. */
  fetchedAt: number;
  trains: Train[];
  onSelectStation: (code: string) => void;
}

/** A contagem regressiva anda de segundo em segundo entre duas consultas ao backend. */
const useSecondTicker = (): number => {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};

const ArrivalCell: React.FC<{ entry: ArrivalEntry | undefined; elapsedMs: number }> = ({ entry, elapsedMs }) => {
  if (!entry) return <span className="text-dim">—</span>;
  const seconds = secondsUntil(entry.etaSeconds, elapsedMs);

  return (
    <span className="rp-arrival">
      <strong className="mono">{entry.trainId}</strong>{' '}
      {entry.atPlatform ? (
        <span className="rp-arrival__eta" data-state="platform">
          na plataforma
        </span>
      ) : seconds <= 30 ? (
        <span className="rp-arrival__eta" data-state="arriving">
          chegando
        </span>
      ) : (
        <span className="rp-arrival__eta mono">{formatClockDuration(seconds)}</span>
      )}
      {entry.held && (
        <span className="rp-badge" data-status="WARNING" title="Composição retida: a previsão não conta a espera">
          retido
        </span>
      )}
    </span>
  );
};

/** Intervalo previsto entre as duas próximas composições na plataforma. */
const headwayOf = (list: ArrivalEntry[]): number | null => (list.length >= 2 ? list[1].etaSeconds - list[0].etaSeconds : null);

export const ArrivalsView: React.FC<ArrivalsViewProps> = ({ arrivals, fetchedAt, trains, onSelectStation }) => {
  const now = useSecondTicker();
  const elapsedMs = Math.max(0, now - fetchedAt);

  const stopped = useMemo(
    () => trains.filter((train) => train.phase !== 'EM_MARCHA' && train.phase !== 'PLATAFORMA'),
    [trains],
  );

  if (!arrivals) {
    return (
      <EmptyState
        icon="clock"
        title="Calculando a previsão de chegadas…"
        hint="A previsão aparece assim que o motor de operação responder."
      />
    );
  }

  const { service, directions } = arrivals;
  const timeScale = arrivals.timeScale;

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Supervisão</span>
          <h2 className="rp-page-header__title">Chegadas &amp; intervalos</h2>
          <p className="rp-page-header__subtitle">
            Próximas composições em cada plataforma, projetadas pela marcha real — distância entre estações,
            paradas, manobra nos terminais e separação por bloco
          </p>
        </div>
        {timeScale > 1 && (
          <span className="rp-badge" data-status="INFO" title="SIMULATION_TIME_SCALE no backend">
            Relógio acelerado {timeScale}×
          </span>
        )}
      </div>

      <div className="rp-grid rp-grid--kpi">
        <article className="rp-metric" data-status="INFO">
          <span className="rp-metric__label">Composições em serviço</span>
          <span className="rp-metric__value">{service.trainsInService}</span>
          <span className="rp-metric__hint">Fora as imobilizadas pelo CCO</span>
        </article>
        <article className="rp-metric" data-status="NORMAL">
          <span className="rp-metric__label">Intervalo médio por plataforma</span>
          <span className="rp-metric__value mono">
            {service.headwaySeconds === null ? '—' : formatClockDuration(service.headwaySeconds)}
          </span>
          <span className="rp-metric__hint">Volta completa dividida pela frota em serviço</span>
        </article>
        <article className="rp-metric" data-status="INFO">
          <span className="rp-metric__label">Volta completa</span>
          <span className="rp-metric__value mono">{formatClockDuration(service.cycleSeconds)}</span>
          <span className="rp-metric__hint">Ida e volta, com paradas e manobras nos terminais</span>
        </article>
        <article className="rp-metric" data-status={stopped.length > 0 ? 'ATENÇÃO' : 'NORMAL'}>
          <span className="rp-metric__label">Retidas ou paradas</span>
          <span className="rp-metric__value">{stopped.length}</span>
          <span className="rp-metric__hint truncate">
            {stopped.length > 0 ? stopped.map((train) => train.trainId).join(', ') : 'Circulação fluindo'}
          </span>
        </article>
      </div>

      <section className="rp-card rp-card--flush" aria-label="Quadro de chegadas">
        <div className="rp-table-wrap">
          <table className="rp-table rp-arrivals-table">
            <caption className="sr-only">Próximas composições por estação e sentido</caption>
            <thead>
              <tr>
                <th scope="col" rowSpan={2}>
                  Estação
                </th>
                <th scope="colgroup" colSpan={3}>
                  ◀ {directions.west}
                </th>
                <th scope="colgroup" colSpan={3}>
                  {directions.east} ▶
                </th>
              </tr>
              <tr>
                <th scope="col">Próximo</th>
                <th scope="col">Seguinte</th>
                <th scope="col">Intervalo</th>
                <th scope="col">Próximo</th>
                <th scope="col">Seguinte</th>
                <th scope="col">Intervalo</th>
              </tr>
            </thead>
            <tbody>
              {arrivals.stations.map((station) => {
                const westHeadway = headwayOf(station.west);
                const eastHeadway = headwayOf(station.east);
                return (
                  <tr key={station.code}>
                    <td>
                      <button type="button" className="rp-btn rp-btn--link" onClick={() => onSelectStation(station.code)}>
                        <span className="rp-badge rp-badge--code">{station.code}</span> {station.name}
                      </button>
                    </td>
                    {station.west.length === 0 && station.code === arrivals.stations[0].code ? (
                      <td colSpan={3} className="text-dim">
                        Terminal — partidas no outro sentido
                      </td>
                    ) : (
                      <>
                        <td>
                          <ArrivalCell entry={station.west[0]} elapsedMs={elapsedMs} />
                        </td>
                        <td>
                          <ArrivalCell entry={station.west[1]} elapsedMs={elapsedMs} />
                        </td>
                        <td className="mono text-muted">{westHeadway === null ? '—' : formatClockDuration(westHeadway)}</td>
                      </>
                    )}
                    {station.east.length === 0 && station.code === arrivals.stations[arrivals.stations.length - 1].code ? (
                      <td colSpan={3} className="text-dim">
                        Terminal — partidas no outro sentido
                      </td>
                    ) : (
                      <>
                        <td>
                          <ArrivalCell entry={station.east[0]} elapsedMs={elapsedMs} />
                        </td>
                        <td>
                          <ArrivalCell entry={station.east[1]} elapsedMs={elapsedMs} />
                        </td>
                        <td className="mono text-muted">{eastHeadway === null ? '—' : formatClockDuration(eastHeadway)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
