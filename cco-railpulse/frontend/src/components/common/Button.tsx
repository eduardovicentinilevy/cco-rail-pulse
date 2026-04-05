import React, { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'danger' | 'ghost';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, variant = 'primary', isLoading, className = '', ...props 
}) => {
  return (
    <button 
      className={`btn btn-${variant} ${className}`.trim()} 
      disabled={isLoading || props.disabled} 
      {...props}
    >
      {isLoading && <span className="spinner"></span>}
      {children}
    </button>
  );
};