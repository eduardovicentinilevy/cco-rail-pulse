// frontend/src/components/common/LineSilhouette.tsx
import React from 'react';
import { LINE_NAME, LINE_STATIONS, LINE_TERMINALS } from '../../data/stations';
import { ROUTE } from '../../data/lineGeometry';
import { buildCurveSegments, curveToPath } from '../../lib/curve';

/** Recorte do quadro do mapa (1000×440) que deixa só o traçado, com folga para os rótulos. */
const VIEW_BOX = '20 36 960 346';

// A mesma curva do mapa operacional: a ilustração da marca não é um desenho à
// parte — se a malha mudar, o traçado da tela de login muda junto.
const STOPS = LINE_STATIONS.filter((station) => ROUTE[station.code]).map((station) => ({
  station,
  ...ROUTE[station.code],
}));
const RAIL_PATH = curveToPath(STOPS, buildCurveSegments(STOPS));
const FIRST = STOPS[0];
const LAST = STOPS[STOPS.length - 1];

interface LineSilhouetteProps {
  className?: string;
}

/**
 * Traçado da linha como ilustração de marca: trilho, estações e terminais.
 * Decorativo para leitores de tela além do rótulo — os dados vivem no console.
 */
export const LineSilhouette: React.FC<LineSilhouetteProps> = ({ className }) => (
  <svg
    className={className}
    viewBox={VIEW_BOX}
    role="img"
    aria-label={`Traçado da ${LINE_NAME}, de ${LINE_TERMINALS.west} a ${LINE_TERMINALS.east}, com ${STOPS.length} estações`}
  >
    <path d={RAIL_PATH} className="rp-silhouette__glow" fill="none" />
    <path d={RAIL_PATH} className="rp-silhouette__rail" fill="none" />
    {STOPS.map(({ station, x, y }) => (
      <circle
        key={station.code}
        cx={x}
        cy={y}
        r={station.connections.length > 0 ? 9 : 6.5}
        className="rp-silhouette__stop"
        data-transfer={station.connections.length > 0}
      />
    ))}
    {FIRST && LAST && (
      <>
        <text x={FIRST.x - 8} y={FIRST.y - 24} className="rp-silhouette__terminal" textAnchor="start">
          {FIRST.station.name}
        </text>
        <text x={LAST.x + 8} y={LAST.y - 24} className="rp-silhouette__terminal" textAnchor="end">
          {LAST.station.name}
        </text>
      </>
    )}
  </svg>
);
