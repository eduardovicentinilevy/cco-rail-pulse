import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DwellTimeEvent {
  station: string;
  dwell_seconds: number;
}

interface DwellTimeChartProps {
  data: DwellTimeEvent[];
}

export const DwellTimeChart: React.FC<DwellTimeChartProps> = ({ data }) => {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '250px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
          
          <XAxis 
            dataKey="station" 
            stroke="var(--text-muted)" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            dy={10}
          />
          
          <YAxis 
            stroke="var(--text-muted)" 
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}s`}
          />
          
          <Tooltip 
            cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
            contentStyle={{ 
              backgroundColor: 'var(--bg-panel)', 
              borderColor: 'var(--border-color)',
              color: 'var(--text-main)',
              borderRadius: '4px',
              fontFamily: 'monospace'
            }}
            formatter={(value: number) => [`${value} segundos`, 'Retenção']}
          />
          
          {/* Cor var(--sp-vm) para manter a identidade visual */}
          <Bar 
            dataKey="dwell_seconds" 
            fill="var(--sp-vm)" 
            radius={[4, 4, 0, 0]} 
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};