// frontend/src/hooks/useFavorites.ts
import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../config/env';

interface FavoritesState {
  stations: string[];
  trains: string[];
}

const EMPTY_STATE: FavoritesState = { stations: [], trains: [] };

const readFavorites = (): FavoritesState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.favorites);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<FavoritesState>;
    return {
      stations: Array.isArray(parsed.stations) ? parsed.stations.filter((code) => typeof code === 'string') : [],
      trains: Array.isArray(parsed.trains) ? parsed.trains.filter((id) => typeof id === 'string') : [],
    };
  } catch {
    return EMPTY_STATE;
  }
};

const toggleInList = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export interface FavoritesControls {
  stationCodes: string[];
  trainIds: string[];
  isStationFavorite: (code: string) => boolean;
  isTrainFavorite: (id: string) => boolean;
  toggleStationFavorite: (code: string) => void;
  toggleTrainFavorite: (id: string) => void;
  count: number;
}

/**
 * Atalhos pessoais do operador — estações e composições acompanhadas com mais
 * frequência, persistidas em `localStorage` (não sincronizadas entre operadores).
 */
export const useFavorites = (): FavoritesControls => {
  const [state, setState] = useState<FavoritesState>(readFavorites);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(state));
    } catch {
      // Navegação privativa pode recusar a escrita; os favoritos valem só nesta sessão.
    }
  }, [state]);

  const isStationFavorite = useCallback((code: string) => state.stations.includes(code), [state.stations]);
  const isTrainFavorite = useCallback((id: string) => state.trains.includes(id), [state.trains]);

  const toggleStationFavorite = useCallback(
    (code: string) => setState((current) => ({ ...current, stations: toggleInList(current.stations, code) })),
    [],
  );

  const toggleTrainFavorite = useCallback(
    (id: string) => setState((current) => ({ ...current, trains: toggleInList(current.trains, id) })),
    [],
  );

  return {
    stationCodes: state.stations,
    trainIds: state.trains,
    isStationFavorite,
    isTrainFavorite,
    toggleStationFavorite,
    toggleTrainFavorite,
    count: state.stations.length + state.trains.length,
  };
};
