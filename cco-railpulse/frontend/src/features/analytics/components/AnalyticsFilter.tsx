import React from 'react';
import { Filter, Calendar, Train, Download } from 'lucide-react';
import { Button } from '../../../components/common/Button';

// Tipagem estrita para garantir que o pai e o filho falem a mesma língua
export interface AnalyticsFilterOptions {
  timeRange: '1h' | '6h' | '12h' | '24h';
  fleet: 'J' | 'G' | 'P' | 'ALL';
}

interface AnalyticsFilterProps {
  currentFilters: AnalyticsFilterOptions;
  onFilterChange: (newFilters: AnalyticsFilterOptions) => void;
}

export const AnalyticsFilter: React.FC<AnalyticsFilterProps> = ({ currentFilters, onFilterChange }) => {
  
  // Função auxiliar para lidar com a mudança parcial de estado
  const handleChange = (key: keyof AnalyticsFilterOptions, value: string) => {
    onFilterChange({
      ...currentFilters,
      [key]: value
    });
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '1rem 1.5rem',
      backgroundColor: 'var(--bg-panel)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      marginBottom: '1.5rem',
      boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.5)'
    }}>
      
      {/* LADO ESQUERDO: Controles de Filtro */}
      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
        
        {/* Label Indicativo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
          <Filter size={16} />
          <span className="font-mono" style={{ fontSize: '0.65rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Filtros Ativos
          </span>
        </div>

        {/* Separador Vertical */}
        <div style={{ width: '1px', height: '20px', backgroundColor: 'var(--border-color)' }}></div>

        {/* Select: Horizonte de Tempo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Calendar size={14} style={{ color: 'var(--sp-metro)' }} />
          <select
            className="font-mono"
            value={currentFilters.timeRange}
            onChange={(e) => handleChange('timeRange', e.target.value)}
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              padding: '0.3rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.7rem',
              outline: 'none',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            <option value="1h">Última Hora</option>
            <option value="6h">Últimas 6 Horas</option>
            <option value="12h">Últimas 12 Horas</option>
            <option value="24h">Últimas 24 Horas</option>
          </select>
        </div>

        {/* Select: Frota / Linha */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Train size={14} style={{ color: 'var(--sp-v4)' }} />
          <select
            className="font-mono"
            value={currentFilters.fleet}
            onChange={(e) => handleChange('fleet', e.target.value)}
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-color)',
              padding: '0.3rem 0.5rem',
              borderRadius: '4px',
              fontSize: '0.7rem',
              outline: 'none',
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            <option value="J">Frota J (L4 - Amarela)</option>
            <option value="G">Frota G (L3 - Vermelha)</option>
            <option value="P">Frota P (L5 - Lilás)</option>
            <option value="ALL">Todas as Frotas</option>
          </select>
        </div>

      </div>

      {/* LADO DIREITO: Ações Secundárias */}
      <div>
        <Button variant="ghost" style={{ fontSize: '0.65rem', padding: '0.4rem 0.75rem', border: '1px solid var(--border-color)' }}>
          <Download size={14} />
          Exportar Relatório
        </Button>
      </div>

    </div>
  );
};