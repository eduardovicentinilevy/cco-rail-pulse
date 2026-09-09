// frontend/src/components/common/ToastStack.tsx
import React from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastStackProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const TOAST_ICON: Record<ToastType, string> = { success: '✔', error: '⨯', info: 'ℹ' };
const TOAST_STATUS: Record<ToastType, string> = { success: 'NORMAL', error: 'CRITICAL', info: 'INFO' };

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="rp-toast-stack" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="rp-toast" data-status={TOAST_STATUS[toast.type]}>
          <span className="rp-toast__icon" aria-hidden="true">
            {TOAST_ICON[toast.type]}
          </span>
          <span className="rp-toast__message">{toast.message}</span>
          <button type="button" className="rp-icon-btn" onClick={() => onDismiss(toast.id)} aria-label="Fechar notificação">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};
