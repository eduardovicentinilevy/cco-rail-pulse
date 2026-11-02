// frontend/src/components/common/ConnectionBadges.tsx
import React from 'react';
import { connectionStyle } from '../../data/stations';

interface ConnectionBadgesProps {
  connections: readonly string[];
  /** `compact` mostra só o número da linha; `full` acrescenta o nome. */
  variant?: 'compact' | 'full';
}

/** Integrações da estação, com o número e a cor de cada linha como na sinalização. */
export const ConnectionBadges: React.FC<ConnectionBadgesProps> = ({ connections, variant = 'compact' }) => {
  if (connections.length === 0) return null;

  return (
    <span className="rp-connections" aria-label={`Integração com ${connections.join(', ')}`}>
      {connections.map((connection) => {
        const style = connectionStyle(connection);
        return (
          <span key={connection} className="rp-connection" data-variant={variant} title={connection}>
            <span
              className="rp-connection__mark"
              style={{ backgroundColor: style.color, color: style.ink }}
              aria-hidden="true"
            >
              {style.short}
            </span>
            {variant === 'full' && <span className="rp-connection__name">{connection}</span>}
          </span>
        );
      })}
    </span>
  );
};
