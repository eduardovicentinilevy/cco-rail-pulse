// frontend/src/components/dashboard/TrackSchematic.tsx
import React, { useMemo } from 'react';
import type { Station, Train } from '../../types';

interface TrackSchematicProps {
  stations: Station[];
  trains: Train[];
  selectedStation: Station;
  onSelectStation: (station: Station) => void;
}

/**
 * Esquemático ATS da malha tronco.
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
    <section className="rp-track" aria-label="Esquemático ATS da malha tronco">
      <div className="rp-row rp-row--between" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="rp-row">
          <h2 className="rp-section-title">ATS / Malha Tronco — Linha 6-Laranja</h2>
          <span className="rp-badge" data-status={trains.length > 0 ? 'NORMAL' : 'WARNING'}>
            <span className="rp-dot rp-dot--pulse" aria-hidden="true" />
            {trains.length} composições
          </span>
        </div>
        <span className="rp-card__subtitle">Brasilândia ➔ São Joaquim • role horizontalmente para inspecionar a via</span>
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
                aria-label={`Estação ${station.name}, status ${station.status}, ${station.voltageKV.toFixed(2)} kV`}
                onClick={() => onSelectStation(station)}
              >
                <span className="rp-station-node__trains">
                  {stationTrains.map((train) => (
                    <span
                      key={train.trainId}
                      className="rp-train-badge"
                      data-status={train.status}
                      title={`${train.trainId} • ${train.speedKmH} km/h • ${train.status}`}
                    >
                      <span className="rp-train-badge__id">{train.trainId}</span>
                      <span className="rp-train-badge__speed">{train.speedKmH} km/h</span>
                    </span>
                  ))}
                </span>

                <span className="rp-station-node__rail">
                  <span className="rp-station-node__dot">{station.order}</span>
                </span>

                <span className="rp-station-node__name">{station.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
