import React from 'react';

// Tipagem baseada em estados operacionais reais
type StatusType = 'healthy' | 'warning' | 'critical' | 'neutral';

interface StatusBadgeProps {
  status: StatusType;
  label: string;
  pulse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label, pulse = false }) => {
  // Lógica de negócio pura: sempre pulsa se for crítico, senão segue a prop.
  const isPulsing = pulse || status === 'critical';

  return (
    <span className={`status-badge badge-${status} font-mono`}>
      
      {/* O "LED" de Status */}
      <span className="badge-dot-container">
        {isPulsing && (
          <span className="badge-ping"></span>
        )}
        <span className="badge-dot"></span>
      </span>
      
      {label}
      
    </span>
  );
};