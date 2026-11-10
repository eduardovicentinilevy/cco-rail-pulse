// frontend/src/components/dashboard/LineMap.tsx
import React, { useMemo } from 'react';
import type { Station, Train } from '../../types';
import { LINE_NAME, stationAccessibleName } from '../../data/stations';
import { PHASE_LABELS } from '../../data/trains';
import { NORTH, RIVER, ROUTE, VIEW_HEIGHT, VIEW_WIDTH } from '../../data/lineGeometry';
import { buildCurveSegments, curveToPath } from '../../lib/curve';
import type { Point } from '../../lib/curve';
import { useTrainMotion } from '../../hooks/useTrainMotion';

interface LineMapProps {
  stations: Station[];
  trains: Train[];
  selectedStation: Station;
  onSelectStation: (station: Station) => void;
}

/** Etiqueta do trem: largura e passo vertical entre etiquetas empilhadas. */
const TAG_WIDTH = 50;
const TAG_STEP = 18;
/** Caixa aproximada do rótulo da estação (3 caracteres mono, 12px), com folga. */
const LABEL_HALF_WIDTH = 16;
const LABEL_HEIGHT = 12;

/** Fio da lateral do trem até o meio da etiqueta empilhada no nível `stack`. */
const leaderPoints = (stack: number): string => {
  const side = -TAG_WIDTH / 2 - 4;
  const tagMiddle = -22.5 - stack * TAG_STEP;
  return `-10,-8 ${side},-8 ${side},${tagMiddle} ${-TAG_WIDTH / 2},${tagMiddle}`;
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
    // Empilha pela posição DESENHADA, não pela estação: um trem ainda em trânsito
    // não disputa lugar com quem está parado, e dois trens que se cruzam no meio
    // do trecho também não se sobrepõem.
    const placed: Array<{ x: number; tagY: number }> = [];
    return trains
      .map((train) => ({ train, position: animatedPositions.get(train.trainId) }))
      .filter((marker): marker is { train: Train; position: Point } => marker.position != null)
      .map((marker) => {
        const tagY = (level: number) => marker.position.y - level * TAG_STEP;
        let stack = 0;
        while (
          placed.some(
            (other) =>
              Math.abs(other.x - marker.position.x) < TAG_WIDTH + 2 && Math.abs(other.tagY - tagY(stack)) < TAG_STEP,
          )
        ) {
          stack += 1;
        }
        placed.push({ x: marker.position.x, tagY: tagY(stack) });
        return { ...marker, stack };
      });
  }, [trains, animatedPositions]);

  /** Caixas das etiquetas de trem como desenhadas neste quadro (posição + empilhamento). */
  const tagBoxes = useMemo(
    () =>
      trainMarkers.map(({ position, stack }) => {
        const top = position.y - 30 - stack * TAG_STEP;
        return { left: position.x - TAG_WIDTH / 2, right: position.x + TAG_WIDTH / 2, top, bottom: top + 15 };
      }),
    [trainMarkers],
  );

  /** Área do rótulo [left, right] com linha de base em `baseline` encoberta por etiquetas de trem. */
  const labelCoverage = (left: number, right: number, baseline: number): number =>
    tagBoxes.reduce((total, box) => {
      const width = Math.min(box.right, right) - Math.max(box.left, left);
      const height = Math.min(box.bottom, baseline + 2) - Math.max(box.top, baseline - LABEL_HEIGHT);
      return width > 0 && height > 0 ? total + width * height : total;
    }, 0);

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
            <stop offset="0%" stopColor="var(--cco-brand-bright)" />
            <stop offset="100%" stopColor="var(--cco-brand-deep)" />
          </linearGradient>
          <filter id="rp-rail-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Referência urbana projetada das mesmas coordenadas das estações: o Rio
            Tietê, atravessado em túnel entre Freguesia do Ó (FGO) e Santa Marina (SMA). */}
        <path d={RIVER.path} className="rp-map__river" fill="none" />
        <text
          x={RIVER.label.x}
          y={RIVER.label.y}
          className="rp-map__river-label"
          textAnchor="middle"
          transform={`rotate(${RIVER.label.angle} ${RIVER.label.x} ${RIVER.label.y})`}
        >
          {RIVER.name}
        </text>

        {/* O mapa é girado para a linha caber deitada no painel: a rosa indica o norte real. */}
        <g className="rp-map__compass" transform={`translate(${NORTH.x} ${NORTH.y})`} aria-hidden="true">
          <circle r="22" className="rp-map__compass-ring" />
          <g transform={`rotate(${NORTH.angle})`}>
            <path d="M 0 -17 L 6 2 L 0 -2 L -6 2 Z" className="rp-map__compass-needle" />
            <path d="M 0 17 L 6 2 L 0 -2 L -6 2 Z" className="rp-map__compass-tail" />
          </g>
          <text
            x={NORTH.dx * 32}
            y={NORTH.dy * 32 + 4}
            className="rp-map__compass-label"
            textAnchor="middle"
          >
            N
          </text>
        </g>

        {/* Halo do trilho, depois o trilho sólido por cima. */}
        <path d={path} className="rp-map__rail-glow" fill="none" filter="url(#rp-rail-glow)" />
        <path d={path} className="rp-map__rail" fill="none" stroke="url(#rp-rail-gradient)" />

        {trainMarkers.map(({ train, position, stack }) => (
          <g
            key={train.trainId}
            className="rp-map__train"
            style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
          >
            <title>
              {[`${train.trainId} — ${PHASE_LABELS[train.phase]}`, train.holdReason].filter(Boolean).join(': ')}
            </title>
            <circle r="13" className="rp-map__train-halo" data-status={train.status} />
            {/* Etiqueta empilhada: um fio pela lateral esquerda da pilha liga a etiqueta
                ao trem — por fora, para não riscar as etiquetas de baixo. */}
            {stack > 0 && (
              <polyline
                points={leaderPoints(stack)}
                className="rp-map__train-leader"
                data-status={train.status}
                fill="none"
              />
            )}
            <rect
              x={-TAG_WIDTH / 2}
              y={-30 - stack * TAG_STEP}
              width={TAG_WIDTH}
              height="15"
              rx="4"
              className="rp-map__train-tag"
              data-status={train.status}
              data-phase={train.phase}
            />
            <text y={-19 - stack * TAG_STEP} className="rp-map__train-label">
              {train.direction === 1 ? `${train.trainId} ▸` : `◂ ${train.trainId}`}
            </text>
          </g>
        ))}

        {points.map(({ station, x, y }, index) => {
          const isSelected = station.code === selectedStation.code;
          // Rótulos alternam acima e abaixo para não colidirem entre si. Se etiquetas
          // de trem — desta estação ou de uma vizinha próxima — encobrirem o lado
          // preferido mais do que o outro, o rótulo troca de lado.
          const above = y - 16;
          const below = y + 26;
          const [preferred, alternate] = index % 2 === 0 ? [above, below] : [below, above];
          // O primeiro terminal ancora o texto no início; os demais, no centro.
          const [left, right] =
            index === 0 ? [x, x + 2 * LABEL_HALF_WIDTH] : [x - LABEL_HALF_WIDTH, x + LABEL_HALF_WIDTH];
          const labelY =
            labelCoverage(left, right, preferred) <= labelCoverage(left, right, alternate) ? preferred : alternate;
          // O último terminal fica no fim de uma subida: o rótulo vai à direita
          // do nó, longe do trilho e da etiqueta de trem.
          const isEastTerminal = index === points.length - 1;
          const label = isEastTerminal
            ? { x: x + 13, y: y + 4, anchor: 'start' as const }
            : { x, y: labelY, anchor: index === 0 ? ('start' as const) : ('middle' as const) };

          return (
            <g
              key={station.code}
              className="rp-map__station"
              data-status={station.status}
              data-selected={isSelected}
              role="button"
              tabIndex={0}
              aria-label={stationAccessibleName(station)}
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
