// frontend/src/components/dashboard/LineMap.tsx
import React, { useMemo } from 'react';
import type { Station, Train } from '../../types';
import { buildCurveSegments, curveToPath } from '../../lib/curve';
import type { Point } from '../../lib/curve';
import { useTrainMotion } from '../../hooks/useTrainMotion';

interface LineMapProps {
  stations: Station[];
  trains: Train[];
  selectedStation: Station;
  /** Nome da linha desenhada, usado na descrição acessível do mapa. */
  lineName: string;
  onSelectStation: (station: Station) => void;
}

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 440;

/**
 * Posição de uma estação na tela.
 *
 * Vem de `mapX`/`mapY` do catálogo — coordenadas normalizadas (0–1) cadastradas
 * por linha. Antes o traçado da Linha 6-Laranja estava escrito neste arquivo, o
 * que desenhava a mesma linha para qualquer cliente. Sem coordenada cadastrada,
 * a estação é distribuída uniformemente ao longo de um eixo reto, para que uma
 * linha recém-cadastrada ainda apareça no mapa.
 */
const positionOf = (station: Station, index: number, total: number): { x: number; y: number } => {
  if (station.mapX != null && station.mapY != null) {
    return { x: station.mapX * VIEW_WIDTH, y: station.mapY * VIEW_HEIGHT };
  }

  const progress = total > 1 ? index / (total - 1) : 0.5;
  return { x: 70 + progress * (VIEW_WIDTH - 140), y: VIEW_HEIGHT / 2 };
};

const STATUS_COLOR: Record<Station['status'], string> = {
  NORMAL: 'var(--uni-success)',
  'ATENÇÃO': 'var(--uni-warning)',
  'CRÍTICO': 'var(--uni-danger)',
};

export const LineMap: React.FC<LineMapProps> = ({
  stations,
  trains,
  selectedStation,
  lineName,
  onSelectStation,
}) => {
  const points = useMemo(
    () => stations.map((station, index) => ({ station, ...positionOf(station, index, stations.length) })),
    [stations],
  );

  // Curva Catmull-Rom (convertida para Bézier cúbica) compartilhada entre o
  // desenho do trilho e a animação do trem — os dois precisam da mesma curva.
  const segments = useMemo(() => buildCurveSegments(points), [points]);
  const path = useMemo(() => curveToPath(points, segments), [points, segments]);
  const stationIndex = useMemo(() => new Map(points.map((point, index) => [point.station.code, index])), [points]);

  // A posição real do trem entre duas atualizações de telemetria é interpolada
  // sobre a curva do trilho, simulando o deslocamento estação a estação.
  const animatedPositions = useTrainMotion(trains, stationIndex, points, segments);

  const trainMarkers = useMemo(
    () =>
      trains
        .map((train) => ({ train, position: animatedPositions.get(train.trainId) }))
        .filter((marker): marker is { train: Train; position: Point } => marker.position != null),
    [trains, animatedPositions],
  );

  /** Onde há composição, a etiqueta do trem ocupa o espaço acima do nó. */
  const occupiedAbove = useMemo(
    () => new Set(trains.map((train) => train.currentStationCode)),
    [trains],
  );

  return (
    <div className="rp-map">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="rp-map__canvas"
        role="img"
        aria-label={`Mapa da ${lineName} com a posição das composições`}
      >
        <defs>
          <linearGradient id="rp-rail-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--uni-orange-bright)" />
            <stop offset="100%" stopColor="var(--uni-orange-deep)" />
          </linearGradient>
          <filter id="rp-rail-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Halo do trilho, depois o trilho sólido por cima. */}
        <path d={path} className="rp-map__rail-glow" fill="none" filter="url(#rp-rail-glow)" />
        <path d={path} className="rp-map__rail" fill="none" stroke="url(#rp-rail-gradient)" />

        {trainMarkers.map(({ train, position }) => (
          <g
            key={train.trainId}
            className="rp-map__train"
            style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
          >
            <circle r="13" className="rp-map__train-halo" data-status={train.status} />
            <rect x="-20" y="-30" width="40" height="15" rx="4" className="rp-map__train-tag" data-status={train.status} />
            <text y="-19" className="rp-map__train-label">
              {train.trainId}
            </text>
          </g>
        ))}

        {points.map(({ station, x, y }, index) => {
          const isSelected = station.code === selectedStation.code;
          // Rótulos alternam acima e abaixo para não colidirem entre si; onde há
          // composição, o rótulo desce para não ser coberto pela etiqueta do trem.
          const labelAbove = index % 2 === 0 && !occupiedAbove.has(station.code);

          return (
            <g
              key={station.code}
              className="rp-map__station"
              data-status={station.status}
              data-selected={isSelected}
              role="button"
              tabIndex={0}
              aria-label={`Estação ${station.name}, status ${station.status}, ${station.voltageKV.toFixed(2)} kV`}
              aria-pressed={isSelected}
              onClick={() => onSelectStation(station)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectStation(station);
                }
              }}
            >
              {/* Alvo de clique generoso, invisível. */}
              <circle cx={x} cy={y} r="22" fill="transparent" />
              {station.status !== 'NORMAL' && (
                <circle cx={x} cy={y} r="14" className="rp-map__alert-ring" fill={STATUS_COLOR[station.status]} />
              )}
              <circle cx={x} cy={y} r={isSelected ? 9 : 6.5} className="rp-map__node" />
              <text
                x={x}
                y={labelAbove ? y - 16 : y + 26}
                className="rp-map__label"
                textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
              >
                {station.code}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="rp-map__legend">
        <span className="rp-map__legend-item">
          <span className="rp-dot" data-status="NORMAL" /> Nominal
        </span>
        <span className="rp-map__legend-item">
          <span className="rp-dot" data-status="ATENÇÃO" /> Atenção
        </span>
        <span className="rp-map__legend-item">
          <span className="rp-dot" data-status="CRÍTICO" /> Crítico
        </span>
        <span className="rp-map__legend-item">
          <span className="rp-map__legend-train" aria-hidden="true" /> Composição em circulação
        </span>
      </div>
    </div>
  );
};
