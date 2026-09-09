// frontend/src/components/common/EmptyState.tsx
import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  hint?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = '🛈', title, hint }) => (
  <div className="rp-empty">
    <span className="rp-empty__icon" aria-hidden="true">
      {icon}
    </span>
    <span>{title}</span>
    {hint && <span className="rp-empty__hint">{hint}</span>}
  </div>
);
