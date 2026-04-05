import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface HeadwayEvent {
  event_time: string;
  headway_seconds: number;
}

interface HeadwayChartProps {
  data: HeadwayEvent[];
}

export const HeadwayChart: React.FC<HeadwayChartProps> = ({ data }) => {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: '250px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          
          {/* Definição do Gradiente SIL 4 (Saindo do Amarelo Vibrante para o Transparente) */}
          <defs>
            <linearGradient id="colorHeadway" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--sp-v4)" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="var(--sp-v4)" stopOpacity={0}/>
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} opacity={0.5} />
          
          <XAxis 
            dataKey="event_time" 
            stroke="var(--text-muted)" 
            fontSize={11}
            tickLine={false}
            axisLine={false}
            dy={10}
            minTickGap={50} // A MÁGICA: Força o espaçamento, evitando sobreposição de texto
            tickFormatter={(value) => {
              // Limpa os milissegundos ou datas longas, mantendo apenas HH:mm:ss
              if (!value) return '';
              const timeString = typeof value === 'string' ? value.split('T')[1] || value : value;
              return timeString.substring(0, 8); 
            }}
          />
          
          <YAxis 
            stroke="var(--text-muted)" 
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}s`}
          />
          
          <Tooltip 
            cursor={{ stroke: 'rgba(255, 255, 255, 0.2)', strokeWidth: 1, strokeDasharray: '5 5' }}
            contentStyle={{ 
              backgroundColor: 'var(--bg-panel)', 
              borderColor: 'var(--border-color)',
              color: 'var(--text-main)',
              borderRadius: '6px',
              fontFamily: 'monospace',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
            labelFormatter={(label) => `Horário: ${String(label).substring(0, 8)}`}
            formatter={(value: number) => [`${Math.round(value)} segundos`, 'Headway']}
          />
          
          <Area 
            type="monotone" 
            dataKey="headway_seconds" 
            stroke="var(--sp-v4)" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorHeadway)" // Aplica o gradiente definido acima
            isAnimationActive={false} // Desligamos a animação inicial para não bugar com atualizações constantes
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};