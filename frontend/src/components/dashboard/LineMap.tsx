// frontend/src/components/dashboard/LineMap.tsx
import React, { useMemo } from 'react';
import type { Station, Train } from '../../types';
import { formatVoltage } from '../../lib/format';
import { LINE_NAME } from '../../data/stations';
import { buildCurveSegments, curveToPath } from '../../lib/curve';
import type { Point } from '../../lib/curve';
import { useTrainMotion } from '../../hooks/useTrainMotion';

interface LineMapProps {
  stations: Station[];
  trains: Train[];
  selectedStation: Station;
  onSelectStation: (station: Station) => void;
}

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 440;

/**
 * Traçado da Linha 2-Verde, de Vila Madalena (oeste) a Vila Prudente (leste),
 * projetado a partir das coordenadas geográficas das estações. O eixo vertical
 * é comprimido para caber no painel: preserva a forma — o trecho sob a
 * Av. Paulista, a descida ao Ipiranga e a volta para o norte em Vila Prudente —
 * sem pretender ser cartografia exata.
 */
const ROUTE: Record<string, { x: number; y: number }> = {
  VMD: { x: 70, y: 70 },
  SUM: { x: 177, y: 92 },
  CLI: { x: 232, y: 111 },
  CNS: { x: 309, y: 129 },
  TRI: { x: 338, y: 149 },
  BGD: { x: 395, y: 188 },
  PSO: { x: 461, y: 226 },
  ANR: { x: 482, y: 256 },
  CKB: { x: 552, y: 316 },
  SIM: { x: 612, y: 337 },
  AIP: { x: 683, y: 370 },
  SAC: { x: 761, y: 365 },
  TTI: { x: 866, y: 319 },
  VPT: { x: 930, y: 269 },
};

const STATUS_COLOR: Record<Station['status'], string> = {
  NORMAL: 'var(--cco-success)',
  'ATENÇÃO': 'var(--cco-warning)',
  'CRÍTICO': 'var(--cco-danger)',
};

export const LineMap: React.FC<LineMapProps> = ({ stations, trains, selectedStation, onSelectStation }) => {
  const points = useMemo(
    () => stations.map((station) => ({ station, ...(ROUTE[station.code] ?? { x: 0, y: 0 }) })),
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

  const trainMarkers = useMemo(() => {
    // Composições na mesma estação empilham as etiquetas em vez de sobrepô-las.
    const perStation = new Map<string, number>();
    return trains
      .map((train) => ({ train, position: animatedPositions.get(train.trainId) }))
      .filter((marker): marker is { train: Train; position: Point } => marker.position != null)
      .map((marker) => {
        const stack = perStation.get(marker.train.currentStationCode) ?? 0;
        perStation.set(marker.train.currentStationCode, stack + 1);
        return { ...marker, stack };
      });
  }, [trains, animatedPositions]);

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
        aria-label={`Mapa da ${LINE_NAME} com a posição das composições`}
      >
        <defs>
          <linearGradient id="rp-rail-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--cco-green-bright)" />
            <stop offset="100%" stopColor="var(--cco-green-deep)" />
          </linearGradient>
          <filter id="rp-rail-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Referências urbanas: o eixo da Av. Paulista (CNS–PSO) e o Rio
            Tamanduateí, cruzado entre Sacomã e Tamanduateí. */}
        <path d="M 292 120 L 421 202" className="rp-map__avenue" fill="none" />
        <text x="318" y="196" className="rp-map__avenue-label" transform="rotate(32.4 318 196)">
          Av. Paulista
        </text>
        <path
          d="M 1014 516 C 960 450, 905 388, 835 334 S 720 220, 671 173 S 600 100, 562 61"
          className="rp-map__river"
          fill="none"
        />
        <text x="742" y="214" className="rp-map__river-label" transform="rotate(43 742 214)">
          Rio Tamanduateí
        </text>

        {/* Halo do trilho, depois o trilho sólido por cima. */}
        <path d={path} className="rp-map__rail-glow" fill="none" filter="url(#rp-rail-glow)" />
        <path d={path} className="rp-map__rail" fill="none" stroke="url(#rp-rail-gradient)" />

        {trainMarkers.map(({ train, position, stack }) => (
          <g
            key={train.trainId}
            className="rp-map__train"
            style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
          >
            <circle r="13" className="rp-map__train-halo" data-status={train.status} />
            <rect
              x="-20"
              y={-30 - stack * 18}
              width="40"
              height="15"
              rx="4"
              className="rp-map__train-tag"
              data-status={train.status}
            />
            <text y={-19 - stack * 18} className="rp-map__train-label">
              {train.trainId}
            </text>
          </g>
        ))}

        {points.map(({ station, x, y }, index) => {
          const isSelected = station.code === selectedStation.code;
          // Rótulos alternam acima e abaixo para não colidirem entre si; onde há
          // composição, o rótulo desce para não ser coberto pela etiqueta do trem.
          const labelAbove = index % 2 === 0 && !occupiedAbove.has(station.code);
          // O terminal leste fica no fim de uma subida: o rótulo vai à direita
          // do nó, longe do trilho e da etiqueta de trem.
          const isEastTerminal = index === points.length - 1;
          const label = isEastTerminal
            ? { x: x + 13, y: y + 4, anchor: 'start' as const }
            : { x, y: labelAbove ? y - 16 : y + 26, anchor: index === 0 ? ('start' as const) : ('middle' as const) };

          return (
            <g
              key={station.code}
              className="rp-map__station"
              data-status={station.status}
              data-selected={isSelected}
              role="button"
              tabIndex={0}
              aria-label={`Estação ${station.name}, status ${station.status}, ${formatVoltage(station.voltageV)}`}
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
              <text x={label.x} y={label.y} className="rp-map__label" textAnchor={label.anchor}>
                {station.code}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
