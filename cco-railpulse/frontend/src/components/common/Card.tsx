import React from 'react';

interface CardProps {
  title: string;
  children: React.ReactNode;
  accent?: 'metro' | 'cptm' | 'v4' | 'vm';
  className?: string;
}

export const Card: React.FC<CardProps> = ({ title, children, accent, className = '' }) => {
  // Montagem dinâmica e limpa da classe de identidade visual
  const accentClass = accent ? `accent-${accent}` : '';

  return (
    <div className={`card ${accentClass} ${className}`.trim()}>
      
      <div className="card-header">
        <h3 className="card-title">
          {title}
        </h3>
        {/* Detalhe decorativo (Dash) direto e leve */}
        <div style={{ height: '4px', width: '32px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px' }} />
      </div>

      <div className="card-body">
        {children}
      </div>
      
    </div>
  );
};