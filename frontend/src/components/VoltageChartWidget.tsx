// frontend/src/components/VoltageChartWidget.tsx
import React, { useMemo } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Station } from '../types';
import { formatVoltage } from '../lib/format';
import { SERIES_COLORS } from '../lib/chart';
import { EmptyState } from './common/EmptyState';

/** Uma amostra do histórico: horário + tensão por código de estação. */
export interface VoltageSample {
  time: string;
  readings: Record<string, number>;
}

/** Uma série plotada: a estação e o slot de cor fixo que ela ocupa. */
export interface ChartSeries {
  code: string;
  slot: number;
}

interface VoltageChartWidgetProps {
  history: VoltageSample[];
  series: ChartSeries[];
  stations: Station[];
}


export const VoltageChartWidget: React.FC<VoltageChartWidgetProps> = ({ history, series, stations }) => {
  const nameByCode = useMemo(
    () => new Map(stations.map((station) => [station.code, station.name])),
    [stations],
  );

  const data = useMemo(
    () =>
      history.map((sample) => {
        const row: Record<string, string | number> = { time: sample.time };
        for (const { code } of series) {
          const value = sample.readings[code];
          if (typeof value === 'number') row[code] = value;
        }
        return row;
      }),
    [history, series],
  );

  if (data.length === 0) {
    return (
      <EmptyState
        icon="chart-line"
        title="Aguardando as primeiras leituras de telemetria…"
        hint="As curvas aparecem assim que o barramento publicar o próximo lote."
      />
    );
  }

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--cco-border)" vertical={false} />
          <XAxis dataKey="time" stroke="var(--cco-text-muted)" fontSize={10} tickMargin={8} minTickGap={24} />
          <YAxis
            stroke="var(--cco-text-muted)"
            fontSize={10}
            width={56}
            domain={['dataMin - 10', 'dataMax + 10']}
            tickFormatter={(value) => formatVoltage(Number(value))}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--cco-bg-secondary)',
              border: '1px solid var(--cco-border)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--cco-text-main)',
            }}
            labelStyle={{ color: 'var(--cco-text-muted)' }}
            formatter={(value, name) => [
              formatVoltage(Number(value)),
              nameByCode.get(String(name)) ?? String(name),
            ]}
          />
          <Legend
            iconType="plainline"
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            formatter={(value) => (
              <span style={{ color: 'var(--cco-text-muted)' }}>{nameByCode.get(String(value)) ?? String(value)}</span>
            )}
          />
          {series.map(({ code, slot }) => (
            <Line
              key={code}
              type="monotone"
              dataKey={code}
              stroke={SERIES_COLORS[slot % SERIES_COLORS.length]}
              strokeWidth={2}
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
