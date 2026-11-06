// frontend/src/components/dashboard/TrackSchematic.tsx
import React, { useMemo } from 'react';
import type { Station, Train } from '../../types';
import { stationAccessibleName } from '../../data/stations';
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
  /** Linha em operação — o título e os terminais saem daqui, não de texto fixo. */
  lineName: string;
  onSelectStation: (station: Station) => void;
}

/**
 * Esquemático CBTC da via, de um terminal da linha ao outro.
 *
 * As composições exibidas são as reais, vindas do backend via WebSocket — antes
 * o traçado animava trens fictícios que não correspondiam ao estado do sistema.
 */
export const TrackSchematic: React.FC<TrackSchematicProps> = ({
  stations,
  trains,
  selectedStation,
  lineName,
  onSelectStation,
}) => {
  // Os terminais são a primeira e a última estação da malha recebida, quaisquer
  // que sejam — antes estavam escritos no componente.
  const terminals = useMemo(() => {
    const first = stations[0]?.name;
    const last = stations.at(-1)?.name;
    return first && last && first !== last ? `${first} ➔ ${last}` : (first ?? '');
  }, [stations]);

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
    <section className="rp-track" aria-label={`Esquemático da via — ${lineName}`}>
      <div className="rp-row rp-row--between" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="rp-row">
          <h2 className="rp-section-title">Via CBTC — {lineName}</h2>
          <span className="rp-badge" data-status={trains.length > 0 ? 'NORMAL' : 'WARNING'}>
            <span className="rp-dot rp-dot--pulse" aria-hidden="true" />
            {trains.length} composições
          </span>
        </div>
        <span className="rp-card__subtitle">
          {terminals} • role horizontalmente para inspecionar a via
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
                  <span className="rp-station-node__dot">{station.position}</span>
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
