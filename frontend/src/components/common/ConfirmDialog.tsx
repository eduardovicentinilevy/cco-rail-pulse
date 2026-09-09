// frontend/src/components/common/ConfirmDialog.tsx
import React from 'react';
import { Modal } from './Modal';

export interface ConfirmRequest {
  title: string;
  message: string;
  /** Destaque visual do botão de confirmação. */
  tone?: 'danger' | 'warning' | 'primary';
  confirmLabel?: string;
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  request: ConfirmRequest;
  onClose: () => void;
}

const TONE_CLASS: Record<NonNullable<ConfirmRequest['tone']>, string> = {
  danger: 'rp-btn--danger',
  warning: 'rp-btn--warning',
  primary: 'rp-btn--primary',
};

/**
 * Confirmação de comandos críticos.
 * Substitui `window.confirm`, que bloqueia a thread e não segue a identidade do CCO.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ request, onClose }) => {
  const { title, message, tone = 'danger', confirmLabel = 'Confirmar', onConfirm } = request;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rp-btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={`rp-btn ${TONE_CLASS[tone]}`} onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--uni-text-muted)' }}>{message}</p>
    </Modal>
  );
};
