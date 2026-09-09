// frontend/src/components/views/TimetableDispatchView.tsx
import React, { useMemo, useState } from 'react';
import type { Station, Train } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { downloadTextFile, formatDateTime, toCsv } from '../../lib/format';

interface TimetableDispatchViewProps {
  trains: Train[];
  stations: Station[];
}

type DispatchStatus = 'EM_HORA' | 'ATRASADO' | 'ANTECIPADO';

/** Headway alvo da Linha 6 em operação normal, em segundos. */
const TARGET_HEADWAY_SEC = 180;
/** Velocidade de referência para a marcha em tabela, em km/h. */
const REFERENCE_SPEED_KMH = 45;

const classifyDispatch = (train: Train): DispatchStatus => {
  if (train.status === 'EMERGÊNCIA' || train.speedKmH < REFERENCE_SPEED_KMH * 0.6) return 'ATRASADO';
  if (train.speedKmH > REFERENCE_SPEED_KMH * 1.15) return 'ANTECIPADO';
  return 'EM_HORA';
};

/** Desvio de headway estimado pela diferença entre a marcha real e a de tabela. */
const estimateHeadway = (train: Train): number => {
  const ratio = REFERENCE_SPEED_KMH / Math.max(train.speedKmH, 1);
  return Math.round(Math.min(600, TARGET_HEADWAY_SEC * ratio));
};

export const TimetableDispatchView: React.FC<TimetableDispatchViewProps> = ({ trains, stations }) => {
  const [onlyDeviations, setOnlyDeviations] = useState(false);

  const stationNames = useMemo(
    () => new Map(stations.map((station) => [station.code, station.name])),
    [stations],
  );

  const dispatches = useMemo(
    () =>
      trains
        .map((train) => ({
          train,
          status: classifyDispatch(train),
          headwaySec: estimateHeadway(train),
          stationName: stationNames.get(train.currentStationCode) ?? train.currentStationCode,
        }))
        .sort((a, b) => a.train.trainId.localeCompare(b.train.trainId)),
    [trains, stationNames],
  );

  const visible = onlyDeviations ? dispatches.filter((item) => item.status !== 'EM_HORA') : dispatches;
  const deviationCount = dispatches.filter((item) => item.status !== 'EM_HORA').length;

  const handleExport = () => {
    const csv = toCsv(
      ['Trem', 'Estação', 'Velocidade (km/h)', 'Headway estimado (s)', 'Status', 'Atualizado em'],
      dispatches.map((item) => [
        item.train.trainId,
        item.stationName,
        item.train.speedKmH,
        item.headwaySec,
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
            Cumprimento da tabela horária estimado a partir da marcha real de cada composição
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
                  <th scope="col">Posição atual</th>
                  <th scope="col">Marcha</th>
                  <th scope="col">Headway alvo</th>
                  <th scope="col">Headway estimado</th>
                  <th scope="col">Atualizado</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ train, status, headwaySec, stationName }) => (
                  <tr key={train.trainId}>
                    <td>
                      <strong className="mono">{train.trainId}</strong>
                    </td>
                    <td className="truncate">{stationName}</td>
                    <td className="rp-table__accent">{train.speedKmH} km/h</td>
                    <td className="mono">{TARGET_HEADWAY_SEC}s</td>
                    <td className="rp-table__accent">{headwaySec}s</td>
                    <td className="mono text-muted">{formatDateTime(train.updatedAt)}</td>
                    <td>
                      <StatusPill status={status} label={status.replace('_', ' ')} />
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
