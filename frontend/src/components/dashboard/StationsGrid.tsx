// frontend/src/components/dashboard/StationsGrid.tsx
import React from 'react';
import type { Station, Train } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';

interface StationsGridProps {
  stations: Station[];
  trains: Train[];
  selectedStationCode: string;
  totalStations: number;
  onSelectStation: (station: Station) => void;
}

export const StationsGrid: React.FC<StationsGridProps> = ({
  stations,
  trains,
  selectedStationCode,
  totalStations,
  onSelectStation,
}) => (
  <section className="rp-card" aria-label="Status operacional das estações">
    <header className="rp-card__header">
      <div>
        <h2 className="rp-card__title">Status operacional das estações</h2>
        <p className="rp-card__subtitle">Selecione uma estação para inspecionar parâmetros e emitir comandos</p>
      </div>
      <span className="rp-badge">
        {stations.length} de {totalStations}
      </span>
    </header>

    {stations.length === 0 ? (
      <EmptyState icon="🔎" title="Nenhuma estação corresponde ao filtro." hint="Ajuste a busca ou limpe os filtros." />
    ) : (
      <div className="rp-grid rp-grid--cards">
        {stations.map((station) => {
          const stationTrains = trains.filter((train) => train.currentStationCode === station.code);
          return (
            <button
              key={station.code}
              type="button"
              className="rp-station-card"
              data-status={station.status}
              data-alert={station.status !== 'NORMAL'}
              aria-pressed={station.code === selectedStationCode}
              aria-label={`Estação ${station.name}, status ${station.status}`}
              onClick={() => onSelectStation(station)}
            >
              <span className="rp-row rp-row--between">
                <span className="rp-badge rp-badge--code">{station.code}</span>
                <StatusPill status={station.status} />
              </span>

              <span className="rp-station-card__name">{station.name}</span>

              <span className="rp-station-card__footer">
                <span>
                  Tensão <strong>{station.voltageKV.toFixed(2)} kV</strong>
                </span>
                <span>
                  Trens <strong>{stationTrains.length > 0 ? stationTrains.map((t) => t.trainId).join(', ') : '—'}</strong>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    )}
  </section>
);
