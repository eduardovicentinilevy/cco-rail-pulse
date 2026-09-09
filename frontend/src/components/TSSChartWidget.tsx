// frontend/src/components/TSSChartWidget.tsx
import React, { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Station } from '../types';
import { EmptyState } from './common/EmptyState';

/** Uma amostra do histórico: horário + tensão por código de estação. */
export interface VoltageSample {
  time: string;
  readings: Record<string, number>;
}

interface TSSChartWidgetProps {
  history: VoltageSample[];
  seriesCodes: string[];
  stations: Station[];
}

/** Paleta derivada do laranja oficial, mantendo contraste entre séries no tema escuro. */
const SERIES_COLORS = ['#ff6600', '#ffab2e', '#22e07a', '#ff4747'];

export const TSSChartWidget: React.FC<TSSChartWidgetProps> = ({ history, seriesCodes, stations }) => {
  const nameByCode = useMemo(
    () => new Map(stations.map((station) => [station.code, station.name])),
    [stations],
  );

  const data = useMemo(
    () =>
      history.map((sample) => {
        const row: Record<string, string | number> = { time: sample.time };
        for (const code of seriesCodes) {
          const value = sample.readings[code];
          if (typeof value === 'number') row[code] = value;
        }
        return row;
      }),
    [history, seriesCodes],
  );

  if (data.length === 0) {
    return (
      <EmptyState
        icon="📈"
        title="Aguardando as primeiras leituras de telemetria…"
        hint="As curvas aparecem assim que o barramento publicar o próximo lote."
      />
    );
  }

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" vertical={false} />
          <XAxis dataKey="time" stroke="#a3a3a3" fontSize={10} tickMargin={8} minTickGap={24} />
          <YAxis
            stroke="#a3a3a3"
            fontSize={10}
            width={56}
            domain={['dataMin - 0.3', 'dataMax + 0.3']}
            tickFormatter={(value) => `${Number(value).toFixed(1)} kV`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#141414',
              border: '1px solid #2e2e2e',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: '#a3a3a3' }}
            formatter={(value, name) => [
              `${Number(value).toFixed(2)} kV`,
              nameByCode.get(String(name)) ?? String(name),
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={(value) => nameByCode.get(String(value)) ?? String(value)}
          />
          {seriesCodes.map((code, index) => (
            <Line
              key={code}
              type="monotone"
              dataKey={code}
              stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
