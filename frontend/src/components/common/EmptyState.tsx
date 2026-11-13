// frontend/src/components/common/EmptyState.tsx
import React from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

interface EmptyStateProps {
  icon?: IconName;
  title: string;
  hint?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon = 'info', title, hint }) => (
  <div className="rp-empty">
    <span className="rp-empty__icon">
      <Icon name={icon} size="1.4rem" />
    </span>
    <span className="rp-empty__title">{title}</span>
    {hint && <span className="rp-empty__hint">{hint}</span>}
  </div>
);
