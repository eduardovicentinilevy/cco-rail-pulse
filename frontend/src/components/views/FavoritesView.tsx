// frontend/src/components/views/FavoritesView.tsx
import React, { useMemo } from 'react';
import type { Station, Train } from '../../types';
import type { FavoritesControls } from '../../hooks/useFavorites';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { formatVoltage } from '../../lib/format';
import { directionArrow, PHASE_LABELS } from '../../data/trains';

interface FavoritesViewProps {
  stations: Station[];
  trains: Train[];
  favorites: FavoritesControls;
  onGoToStation: (station: Station) => void;
  onGoToTrain: (train: Train) => void;
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({ stations, trains, favorites, onGoToStation, onGoToTrain }) => {
  const favoriteStations = useMemo(
    () => favorites.stationCodes.map((code) => stations.find((station) => station.code === code)).filter((s): s is Station => Boolean(s)),
    [favorites.stationCodes, stations],
  );

  const favoriteTrains = useMemo(
    () => favorites.trainIds.map((id) => trains.find((train) => train.trainId === id)).filter((t): t is Train => Boolean(t)),
    [favorites.trainIds, trains],
  );

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Atalhos</span>
          <h2 className="rp-page-header__title">Favoritos</h2>
          <p className="rp-page-header__subtitle">
            Estações e composições marcadas para acompanhamento rápido — salvo apenas neste navegador
          </p>
        </div>
      </div>

      <div className="rp-grid rp-grid--panels">
        <section className="rp-card" aria-label="Estações favoritas">
          <header className="rp-card__header">
            <h3 className="rp-card__title">Estações favoritas</h3>
            <span className="rp-badge">{favoriteStations.length}</span>
          </header>

          {favoriteStations.length === 0 ? (
            <EmptyState
              icon="☆"
              title="Nenhuma estação favoritada."
              hint="Na Via CBTC, selecione uma estação e use o botão ★ no terminal de controle."
            />
          ) : (
            <ul className="rp-feed">
              {favoriteStations.map((station) => (
                <li key={station.code} className="rp-feed__item" data-status={station.status}>
                  <span className="rp-feed__source">{station.code}</span>
                  <span className="rp-feed__message truncate">{station.name}</span>
                  <span className="mono text-muted">{formatVoltage(station.voltageV)}</span>
                  <StatusPill status={station.status} solid />
                  <button type="button" className="rp-btn rp-btn--link" onClick={() => onGoToStation(station)}>
                    Ver na malha
                  </button>
                  <button
                    type="button"
                    className="rp-icon-btn"
                    onClick={() => favorites.toggleStationFavorite(station.code)}
                    aria-label={`Remover ${station.name} dos favoritos`}
                    title="Remover dos favoritos"
                  >
                    ★
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rp-card" aria-label="Composições favoritas">
          <header className="rp-card__header">
            <h3 className="rp-card__title">Composições favoritas</h3>
            <span className="rp-badge">{favoriteTrains.length}</span>
          </header>

          {favoriteTrains.length === 0 ? (
            <EmptyState
              icon="☆"
              title="Nenhuma composição favoritada."
              hint="Na Via CBTC, selecione a composição alvo no terminal de controle e use o botão ★."
            />
          ) : (
            <ul className="rp-feed">
              {favoriteTrains.map((train) => (
                <li key={train.trainId} className="rp-feed__item" data-status={train.status}>
                  <span className="rp-feed__source">{train.trainId}</span>
                  <span className="rp-feed__message truncate">
                    {directionArrow(train.direction)} {train.currentStationCode}
                    {train.nextStationCode ? ` → ${train.nextStationCode}` : ''} • {PHASE_LABELS[train.phase]}
                  </span>
                  <StatusPill status={train.status} solid />
                  <button type="button" className="rp-btn rp-btn--link" onClick={() => onGoToTrain(train)}>
                    Ver na malha
                  </button>
                  <button
                    type="button"
                    className="rp-icon-btn"
                    onClick={() => favorites.toggleTrainFavorite(train.trainId)}
                    aria-label={`Remover ${train.trainId} dos favoritos`}
                    title="Remover dos favoritos"
                  >
                    ★
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};
