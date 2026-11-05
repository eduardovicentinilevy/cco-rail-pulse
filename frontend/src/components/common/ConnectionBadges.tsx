// frontend/src/components/common/ConnectionBadges.tsx
import React from 'react';
import { connectionStyle } from '../../data/stations';

interface ConnectionBadgesProps {
  connections: readonly string[];
  /** `compact` mostra só o número da linha; `full` acrescenta o nome. */
  variant?: 'compact' | 'full';
}

/**
 * Integrações da estação, com o número e a cor de cada linha como na sinalização.
 *
 * Os círculos são só visuais: o leitor de tela recebe uma frase completa em texto
 * oculto. `aria-label` num `<span>` sem papel não seria anunciado, e o número
 * solto ("4") não diria nada a quem não vê a cor.
 */
export const ConnectionBadges: React.FC<ConnectionBadgesProps> = ({ connections, variant = 'compact' }) => {
  if (connections.length === 0) return null;

  return (
    <span className="rp-connections">
      <span className="sr-only">Integração com {connections.join(', ')}</span>
      {connections.map((connection) => {
        const style = connectionStyle(connection);
        return (
          <span key={connection} className="rp-connection" data-variant={variant} title={connection} aria-hidden="true">
            <span className="rp-connection__mark" style={{ backgroundColor: style.color, color: style.ink }}>
              {style.short}
            </span>
            {variant === 'full' && <span className="rp-connection__name">{connection}</span>}
          </span>
        );
      })}
    </span>
  );
};
