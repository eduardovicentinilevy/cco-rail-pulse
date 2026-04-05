import React, { ReactNode } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  isCritical?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, isCritical = false }) => {
  if (!isOpen) return null;

  const criticalClass = isCritical ? 'critical' : '';

  return (
    <div className="modal-overlay">
      <div className={`modal-container ${criticalClass}`}>
        
        <div className={`modal-header ${criticalClass}`}>
          <h3 className="modal-title font-mono">
            {title}
          </h3>
          <button onClick={onClose} className="modal-close" aria-label="Fechar">
            &times;
          </button>
        </div>
        
        <div className="modal-body">
          {children}
        </div>

      </div>
    </div>
  );
};