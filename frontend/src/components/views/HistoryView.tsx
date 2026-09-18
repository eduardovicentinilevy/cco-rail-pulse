// frontend/src/components/views/HistoryView.tsx
import React, { useCallback, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HistorySample, HistorySummaryRow, OperatorSession, Station } from '../../types';
import { api } from '../../services/api';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { downloadTextFile, formatNumber, toCsv } from '../../lib/format';
import { useResource } from '../../hooks/useResource';
import { useAuthErrorHandler } from '../../hooks/useAuthErrorHandler';

interface HistoryViewProps {
  session: OperatorSession;
  stations: Station[];
  onAuthError: (message: string) => void;
}

const RANGES: ReadonlyArray<{ hours: number; label: string }> = [
  { hours: 1, label: '1 h' },
  { hours: 6, label: '6 h' },
  { hours: 24, label: '24 h' },
  { hours: 72, label: '3 dias' },
  { hours: 168, label: '7 dias' },
];

const TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DAY_TIME_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Abaixo de 24 h o eixo mostra apenas hora:minuto; acima, inclui o dia. */
const axisFormatter = (hours: number) => (value: string) =>
  (hours <= 24 ? TIME_FORMAT : DAY_TIME_FORMAT).format(new Date(value));

interface ChartRow {
  bucketAt: string;
  avg: number;
  /** Faixa [min, max] da janela — desenhada como área de dispersão. */
  band: [number, number];
}

export const HistoryView: React.FC<HistoryViewProps> = ({ session, stations, onAuthError }) => {
  const [hours, setHours] = useState(6);
  const [stationCode, setStationCode] = useState(() => stations[0]?.code ?? 'BRA');

  const load = useCallback(
    () => api.telemetryHistory(session.token, { hours, stations: [stationCode] }),
    [session.token, hours, stationCode],
  );

  const handleError = useAuthErrorHandler(onAuthError, 'consultar a série histórica');
  const { data, error, isLoading } = useResource(`${hours}|${stationCode}`, load, handleError);

  // Memoizado para manter a identidade estável entre renders (evita recalcular o gráfico).
  const samples = useMemo(() => (data?.samples ?? []) as HistorySample[], [data]);
  const summary = (data?.summary ?? []) as HistorySummaryRow[];

  const chartData = useMemo<ChartRow[]>(
    () =>
      samples.map((sample) => ({
        bucketAt: sample.bucketAt,
        avg: sample.avgKV,
        band: [sample.minKV, sample.maxKV],
      })),
    [samples],
  );

  const stationName = stations.find((station) => station.code === stationCode)?.name ?? stationCode;
  const nominal = stations.find((station) => station.code === stationCode)?.nominalVoltageKV ?? null;

  const handleExport = () => {
    const csv = toCsv(
      ['Estação', 'Janela', 'Mínima (kV)', 'Média (kV)', 'Máxima (kV)'],
      samples.map((sample) => [
        sample.stationCode,
        new Date(sample.bucketAt).toISOString(),
        sample.minKV,
        sample.avgKV,
        sample.maxKV,
      ]),
    );
    downloadTextFile(`railpulse-historico-${stationCode}-${hours}h.csv`, csv);
  };

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Série histórica</span>
          <h2 className="rp-page-header__title">Histórico de tensão da catenária</h2>
          <p className="rp-page-header__subtitle">
            Leituras agregadas por janela (mínima, média e máxima) e persistidas no PostgreSQL
          </p>
        </div>
        <button type="button" className="rp-btn" onClick={handleExport} disabled={samples.length === 0}>
          Exportar série (CSV)
        </button>
      </div>

      <section className="rp-card">
        <header className="rp-card__header">
          <div className="rp-row">
            <label className="rp-label" htmlFor="history-station">
              Estação
            </label>
            <select
              id="history-station"
              className="rp-input"
              style={{ maxWidth: '18rem' }}
              value={stationCode}
              onChange={(event) => setStationCode(event.target.value)}
            >
              {stations.map((station) => (
                <option key={station.code} value={station.code}>
                  {station.code} — {station.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-chip-row" role="group" aria-label="Período da série histórica">
            {RANGES.map((range) => (
              <button
                key={range.hours}
                type="button"
                className="rp-chip"
                aria-pressed={hours === range.hours}
                onClick={() => setHours(range.hours)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </header>

        {isLoading && <div className="rp-skeleton" style={{ height: '18rem' }} aria-busy="true" />}

        {!isLoading && error && (
          <EmptyState icon="⚠" title="Não foi possível carregar a série histórica." hint={error} />
        )}

        {!isLoading && !error && chartData.length === 0 && (
          <EmptyState
            icon="🕑"
            title="Ainda não há janelas arquivadas para este período."
            hint="O arquivamento grava uma janela por minuto — aguarde o próximo fechamento."
          />
        )}

        {!isLoading && chartData.length > 0 && (
          <>
            <div className="rp-row" style={{ marginBottom: 'var(--sp-3)' }}>
              <span className="rp-card__subtitle">
                {stationName} • {chartData.length} janelas no período
              </span>
              {nominal !== null && <span className="rp-badge rp-badge--code">Nominal {formatNumber(nominal, 1)} kV</span>}
            </div>

            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e2e2e" vertical={false} />
                  <XAxis
                    dataKey="bucketAt"
                    stroke="#a3a3a3"
                    fontSize={10}
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={axisFormatter(hours)}
                  />
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
                    labelFormatter={(value) => DAY_TIME_FORMAT.format(new Date(String(value)))}
                    formatter={(value, name) => {
                      if (Array.isArray(value)) {
                        return [`${Number(value[0]).toFixed(2)} – ${Number(value[1]).toFixed(2)} kV`, 'Faixa min/máx'];
                      }
                      return [`${Number(value).toFixed(2)} kV`, name === 'avg' ? 'Média da janela' : String(name)];
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    formatter={(value) => (value === 'avg' ? 'Média da janela' : 'Faixa min/máx')}
                  />
                  <Area
                    type="monotone"
                    dataKey="band"
                    stroke="none"
                    fill="#f2871a"
                    fillOpacity={0.16}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    stroke="#f2871a"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <section className="rp-card rp-card--flush">
        <header className="rp-card__header" style={{ padding: 'var(--sp-5) var(--sp-5) 0' }}>
          <div>
            <h3 className="rp-card__title">Resumo por estação no período</h3>
            <p className="rp-card__subtitle">Extremos observados em todas as janelas arquivadas</p>
          </div>
        </header>

        {summary.length === 0 ? (
          <EmptyState icon="📊" title="Sem dados agregados para o período selecionado." />
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="sr-only">Extremos de tensão por estação no período</caption>
              <thead>
                <tr>
                  <th scope="col">Estação</th>
                  <th scope="col">Mínima</th>
                  <th scope="col">Média</th>
                  <th scope="col">Máxima</th>
                  <th scope="col">Janelas</th>
                  <th scope="col">Condição</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => {
                  const station = stations.find((item) => item.code === row.stationCode);
                  const condition = row.minKV < 22.5 ? 'CRÍTICO' : row.minKV < 23.8 ? 'ATENÇÃO' : 'NORMAL';

                  return (
                    <tr key={row.stationCode}>
                      <td>
                        <span className="rp-badge rp-badge--code">{row.stationCode}</span>{' '}
                        <span className="truncate">{station?.name ?? ''}</span>
                      </td>
                      <td className="mono">{formatNumber(row.minKV, 2)} kV</td>
                      <td className="rp-table__accent">{formatNumber(row.avgKV, 2)} kV</td>
                      <td className="mono">{formatNumber(row.maxKV, 2)} kV</td>
                      <td className="mono text-muted">{row.buckets}</td>
                      <td>
                        <StatusPill status={condition} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
