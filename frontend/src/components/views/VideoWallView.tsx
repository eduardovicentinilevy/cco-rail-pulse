// frontend/src/components/views/VideoWallView.tsx
import React, { useMemo } from 'react';
import type { AlarmEvent, Station, Train } from '../../types';
import type { ConnectionStatus } from '../layout/Header';
import { TrackSchematic } from '../dashboard/TrackSchematic';
import { useClock } from '../../hooks/useClock';
import { hashString } from '../../lib/hash';

interface VideoWallViewProps {
  stations: Station[];
  trains: Train[];
  alarms: AlarmEvent[];
  connectionStatus: ConnectionStatus;
  selectedStation: Station;
  onSelectStation: (station: Station) => void;
}

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'SINCRONIZANDO',
  online: 'CORE ONLINE',
  offline: 'CORE OFFLINE',
};

/** Câmera de plataforma por estação — uma por bloco, como os segmentos do painel físico. */
const CAMERA_OFFLINE_CHANCE = 0.08;

interface WallCamera {
  station: Station;
  online: boolean;
}

/** Mosaico de câmeras para o telão de operação — um flagrante por estação da malha. */
export const VideoWallView: React.FC<VideoWallViewProps> = ({
  stations,
  trains,
  alarms,
  connectionStatus,
  selectedStation,
  onSelectStation,
}) => {
  const clock = useClock();

  const statusFingerprint = stations.map((station) => `${station.code}:${station.status}`).join('|');

  const cameras = useMemo<WallCamera[]>(
    () =>
      stations.map((station) => {
        const chance = station.status === 'NORMAL' ? CAMERA_OFFLINE_CHANCE : CAMERA_OFFLINE_CHANCE * 3;
        const roll = (hashString(`WALL-${station.code}`) % 1000) / 1000;
        return { station, online: roll >= chance };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusFingerprint],
  );

  const recentAlarms = alarms.slice(0, 10);
  const criticalCount = alarms.filter((alarm) => alarm.level === 'CRITICAL' && !alarm.acknowledged).length;

  return (
    <div className="rp-wall">
      <header className="rp-wall__header">
        <div className="rp-wall__title">
          <span className="rp-wall__eyebrow">Sala de Controle — Linha 6-Laranja</span>
          <h2>Mosaico Operacional</h2>
        </div>
        <div className="rp-wall__status">
          <span className="rp-wall__badge" data-status={connectionStatus}>
            <span className="rp-dot rp-dot--pulse" aria-hidden="true" />
            {CONNECTION_LABEL[connectionStatus]}
          </span>
          {criticalCount > 0 && <span className="rp-wall__badge" data-status="offline">{criticalCount} CRÍTICOS</span>}
          <span className="rp-wall__clock mono">{clock}</span>
        </div>
      </header>

      <div className="rp-wall__body">
        <section className="rp-wall__panel rp-wall__panel--schematic" aria-label="Painel de sinalização">
          <TrackSchematic
            stations={stations}
            trains={trains}
            selectedStation={selectedStation}
            onSelectStation={onSelectStation}
          />
        </section>

        <div className="rp-wall__side">
          <section className="rp-wall__panel rp-wall__panel--cams" aria-label="Mosaico de câmeras CFTV">
            <div className="rp-wall__cam-grid">
              {cameras.map(({ station, online }) => (
                <button
                  key={station.code}
                  type="button"
                  className="rp-wall__cam-tile"
                  data-online={online}
                  aria-pressed={station.code === selectedStation.code}
                  onClick={() => onSelectStation(station)}
                >
                  <span className="rp-wall__cam-noise" aria-hidden="true" />
                  <span className="rp-wall__cam-code mono">{station.code}</span>
                  {online ? (
                    <span className="rp-wall__cam-live">● LIVE</span>
                  ) : (
                    <span className="rp-wall__cam-offline">SEM SINAL</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section className="rp-wall__panel rp-wall__panel--ticker" aria-label="Últimos eventos da malha">
            <h3 className="rp-wall__panel-title">Últimos eventos</h3>
            {recentAlarms.length === 0 ? (
              <p className="rp-wall__empty">Nenhum evento registrado nesta sessão.</p>
            ) : (
              <ul className="rp-wall__ticker" role="log" aria-live="polite">
                {recentAlarms.map((alarm) => (
                  <li key={alarm.id} className="rp-wall__ticker-item" data-level={alarm.level}>
                    <span className="mono">{alarm.timestamp}</span>
                    <span className="mono">{alarm.stationCode}</span>
                    <span className="truncate">{alarm.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
