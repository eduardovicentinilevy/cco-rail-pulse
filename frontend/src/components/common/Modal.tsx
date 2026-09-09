// frontend/src/components/common/Modal.tsx
import React, { useCallback, useId } from 'react';
import type { ReactNode } from 'react';
import { useModalBehavior } from '../../hooks/useModalBehavior';

interface ModalProps {
  title: string;
  subtitle?: string;
  wide?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Diálogo modal acessível: fecha no Escape e no clique fora, prende o foco e
 * devolve o foco ao elemento que o abriu.
 */
export const Modal: React.FC<ModalProps> = ({ title, subtitle, wide = false, onClose, footer, children }) => {
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useModalBehavior<HTMLDivElement>(onClose);

  const handleOverlayClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div className="rp-overlay" onMouseDown={handleOverlayClick}>
      <div
        ref={containerRef}
        className={`rp-modal${wide ? ' rp-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descriptionId : undefined}
      >
        <header className="rp-modal__header">
          <div>
            <h2 id={titleId} className="rp-modal__title">
              {title}
            </h2>
            {subtitle && (
              <p id={descriptionId} className="rp-modal__subtitle">
                {subtitle}
              </p>
            )}
          </div>
          <button type="button" className="rp-icon-btn" onClick={onClose} aria-label="Fechar diálogo">
            ✕
          </button>
        </header>

        <div className="rp-modal__body">{children}</div>

        {footer && <footer className="rp-modal__footer">{footer}</footer>}
      </div>
    </div>
  );
};
