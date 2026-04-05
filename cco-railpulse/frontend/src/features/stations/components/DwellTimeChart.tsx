import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { DwellTimeEventDTO } from '../types';

interface DwellTimeChartProps {
  data: DwellTimeEventDTO[];
}

export const DwellTimeChart: React.FC<DwellTimeChartProps> = ({ data }) => {
  // Tratamento de dados: Foco nas últimas 15 paradas para análise de fluxo
  const formattedData = data.map((item) => ({
    name: `TR ${item.train_id}`, // Padronizado para bater com a identidade visual da UI
    dwell_time_seconds: item.dwell_time_seconds,
    // Threshold de segurança ferroviária: > 45s é retenção crítica
    isCritical: item.dwell_time_seconds > 45 
  })).slice(0, 15);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '280px', backgroundColor: 'var(--bg-panel-hover)', borderRadius: '6px', padding: '0.5rem' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
          {/* Grade Industrial acoplada ao Design System */}
          <CartesianGrid strokeDasharray="2 2" stroke="var(--border-color)" vertical={false} />
          
          <XAxis 
            dataKey="name" 
            stroke="var(--text-muted)" 
            fontSize={9} 
            tickLine={false} 
            axisLine={false} 
            fontFamily="JetBrains Mono, monospace"
            dy={10}
          />
          
          <YAxis 
            stroke="var(--text-muted)" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false} 
            unit="s" 
            fontFamily="JetBrains Mono, monospace"
          />
          
          <Tooltip 
            cursor={{ fill: 'var(--bg-panel-hover)' }}
            contentStyle={{ 
              backgroundColor: 'var(--bg-panel)', 
              borderColor: 'var(--border-color)', 
              borderRadius: '6px',
              fontSize: '11px',
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--text-main)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}
            itemStyle={{ fontWeight: '900', color: 'var(--text-main)' }}
          />

          <Bar 
            dataKey="dwell_time_seconds" 
            name="Dwell Time" 
            radius={[2, 2, 0, 0]}
            barSize={20}
            animationDuration={1500}
          >
            {formattedData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                /* Mix SP: Verde ViaMobilidade para normal, Vermelho CPTM para crítico */
                fill={entry.isCritical ? 'var(--sp-cptm)' : 'var(--sp-vm)'} 
                style={{ transition: 'fill 0.5s ease' }}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};