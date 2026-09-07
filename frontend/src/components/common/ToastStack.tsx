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

const TOAST_ICON: Record<ToastType, string> = {
  success: '✅',
  error: '🛑',
  info: 'ℹ️',
};

const TOAST_COLOR: Record<ToastType, string> = {
  success: 'var(--uni-success)',
  error: 'var(--uni-danger)',
  info: 'var(--uni-orange)',
};

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div style={styles.stack} role="status" aria-live="polite">
      {toasts.map(toast => (
        <div key={toast.id} style={{ ...styles.toast, borderColor: TOAST_COLOR[toast.type] }}>
          <span style={styles.icon}>{TOAST_ICON[toast.type]}</span>
          <span style={styles.message}>{toast.message}</span>
          <button onClick={() => onDismiss(toast.id)} style={styles.dismiss} aria-label="Fechar notificação">✕</button>
        </div>
      ))}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  stack: {
    position: 'fixed',
    bottom: '1.5rem',
    left: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    zIndex: 2000,
    maxWidth: '360px',
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    backgroundColor: 'var(--uni-bg-secondary)',
    border: '1px solid',
    borderRadius: '10px',
    padding: '0.75rem 0.9rem',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
    fontSize: '0.8rem',
    color: 'var(--uni-text-main)',
    fontFamily: 'var(--uni-font)',
    animation: 'railpulse-toast-in 0.25s ease',
  },
  icon: { fontSize: '0.9rem', flexShrink: 0 },
  message: { flex: 1, lineHeight: 1.35 },
  dismiss: {
    background: 'transparent',
    border: 'none',
    color: 'var(--uni-text-muted)',
    cursor: 'pointer',
    fontSize: '0.75rem',
    flexShrink: 0,
  },
};
