// frontend/src/components/common/StatusPill.tsx
import React from 'react';

interface StatusPillProps {
  status: string;
  label?: string;
  outline?: boolean;
  /** Fundo saturado + texto branco — o padrão do quadro de status do site institucional. */
  solid?: boolean;
  withDot?: boolean;
}

/**
 * Pílula de status. A cor vem do CSS via `data-status`, mantendo a paleta
 * centralizada em um único lugar em vez de espalhada em estilos inline.
 */
export const StatusPill: React.FC<StatusPillProps> = ({ status, label, outline = false, solid = false, withDot = false }) => (
  <span
    className={`rp-badge${outline ? ' rp-badge--outline' : ''}${solid ? ' rp-badge--solid' : ''}`}
    data-status={status}
  >
    {withDot && <span className="rp-dot" aria-hidden="true" />}
    {label ?? status}
  </span>
);
