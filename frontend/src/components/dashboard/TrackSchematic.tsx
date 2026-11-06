// frontend/src/components/dashboard/TrackSchematic.tsx
import React, { useMemo } from 'react';
import type { Station, Train } from '../../types';
import { LINE_NAME, LINE_TERMINALS, stationAccessibleName } from '../../data/stations';
import { ConnectionBadges } from '../common/ConnectionBadges';
import { directionArrow, PHASE_LABELS } from '../../data/trains';

/** Rótulo curto para caber no crachá do trem no esquemático. */
const PHASE_SHORT_LABELS: Record<Train['phase'], string> = {
  PLATAFORMA: 'plataforma',
  RETIDO: 'retido',
  EM_MARCHA: 'em marcha',
  PARADO_ENTRE_ESTACOES: 'parado no trecho',
  IMOBILIZADO: 'imobilizado',
};

interface TrackSchematicProps {
  stations: Station[];
  trains: Train[];
  selectedStation: Station;
  onSelectStation: (station: Station) => void;
}

/**
 * Esquemático CBTC da via, de Vila Madalena a Vila Prudente.
 *
 * As composições exibidas são as reais, vindas do backend via WebSocket — antes
 * o traçado animava trens fictícios que não correspondiam ao estado do sistema.
 */
export const TrackSchematic: React.FC<TrackSchematicProps> = ({
  stations,
  trains,
  selectedStation,
  onSelectStation,
}) => {
  const trainsByStation = useMemo(() => {
    const grouped = new Map<string, Train[]>();
    for (const train of trains) {
      const list = grouped.get(train.currentStationCode);
      if (list) list.push(train);
      else grouped.set(train.currentStationCode, [train]);
    }
    return grouped;
  }, [trains]);

  return (
    <section className="rp-track" aria-label={`Esquemático da via — ${LINE_NAME}`}>
      <div className="rp-row rp-row--between" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="rp-row">
          <h2 className="rp-section-title">Via CBTC — {LINE_NAME}</h2>
          <span className="rp-badge" data-status={trains.length > 0 ? 'NORMAL' : 'WARNING'}>
            <span className="rp-dot rp-dot--pulse" aria-hidden="true" />
            {trains.length} composições
          </span>
        </div>
        <span className="rp-card__subtitle">
          {LINE_TERMINALS.west} ➔ {LINE_TERMINALS.east} • role horizontalmente para inspecionar a via
        </span>
      </div>

      <div className="rp-track__scroll">
        <div className="rp-track__line">
          {stations.map((station) => {
            const isSelected = station.code === selectedStation.code;
            const isAlert = station.status !== 'NORMAL';
            const stationTrains = trainsByStation.get(station.code) ?? [];

            return (
              <button
                key={station.code}
                type="button"
                className="rp-station-node"
                data-status={station.status}
                data-alert={isAlert}
                aria-pressed={isSelected}
                // O nome acessível substitui o conteúdo do botão: as integrações vão nele.
                aria-label={stationAccessibleName(station)}
                onClick={() => onSelectStation(station)}
              >
                <span className="rp-station-node__trains">
                  {stationTrains.map((train) => (
                    <span
                      key={train.trainId}
                      className="rp-train-badge"
                      data-status={train.status}
                      data-phase={train.phase}
                      title={[
                        `${train.trainId} • ${PHASE_LABELS[train.phase]}`,
                        train.nextStationCode ? `rumo a ${train.nextStationCode}` : null,
                        train.holdReason,
                      ]
                        .filter(Boolean)
                        .join(' • ')}
                    >
                      <span className="rp-train-badge__id">
                        {directionArrow(train.direction)} {train.trainId}
                      </span>
                      <span className="rp-train-badge__speed">
                        {train.phase === 'EM_MARCHA'
                          ? `${train.speedKmH} km/h → ${train.nextStationCode}`
                          : PHASE_SHORT_LABELS[train.phase]}
                      </span>
                    </span>
                  ))}
                </span>

                <span className="rp-station-node__rail">
                  <span className="rp-station-node__dot">{station.order}</span>
                </span>

                <span className="rp-station-node__name">{station.name}</span>
                <ConnectionBadges connections={station.connections} />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
