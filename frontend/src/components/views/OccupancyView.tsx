// frontend/src/components/views/OccupancyView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import type { Station } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { formatNumber } from '../../lib/format';
import { hashString } from '../../lib/hash';

interface OccupancyViewProps {
  stations: Station[];
}

const TICK_MS = 4000;
const SUPERLOTACAO_THRESHOLD = 85;
const ELEVADA_THRESHOLD = 60;

/** Curva com dois picos (pico da manhã às 8h, pico da tarde às 18h), em [0, 1]. */
const peakFactor = (hour: number, minute: number): number => {
  const decimalHour = hour + minute / 60;
  const morning = Math.exp(-((decimalHour - 8) ** 2) / 4.5);
  const evening = Math.exp(-((decimalHour - 18) ** 2) / 5);
  return Math.min(1, morning + evening);
};

/** Estações no meio do traçado concentram mais baldeação e fluxo do que os terminais. */
const centralityWeight = (position: number, total: number): number => {
  const center = (total - 1) / 2;
  const distance = Math.abs(position - 1 - center) / center;
  return 1 - distance * 0.7;
};

interface OccupancyRow {
  station: Station;
  percent: number;
  trend: 'up' | 'down' | 'flat';
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const OccupancyView: React.FC<OccupancyViewProps> = ({ stations }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo<OccupancyRow[]>(() => {
    const nowDate = new Date(now);
    const peak = peakFactor(nowDate.getHours(), nowDate.getMinutes());
    const totalStations = stations.length || 1;

    return stations.map((station) => {
      const seed = hashString(station.code);
      const phase = (seed % 1000) / 1000;
      const oscillation = Math.sin(now / 60_000 + phase * Math.PI * 2);
      const weight = centralityWeight(station.position, totalStations);

      // Tendência: compara a leitura corrente contra a curva-base (sem a oscilação de curto prazo),
      // ou seja, se o fluxo está momentaneamente acima ou abaixo do esperado para o horário.
      const baseline = 12 + weight * 38 + peak * 36;
      const raw = baseline + oscillation * 9;
      const percent = Math.round(clamp(raw, 4, 97));
      const delta = raw - baseline;
      const trend: OccupancyRow['trend'] = delta > 1.5 ? 'up' : delta < -1.5 ? 'down' : 'flat';

      return { station, percent, trend };
    });
  }, [stations, now]);

  const stats = useMemo(() => {
    if (rows.length === 0) return { average: 0, overCrowded: 0, busiest: null as OccupancyRow | null, quietest: null as OccupancyRow | null };

    const average = Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / rows.length);
    const overCrowded = rows.filter((row) => row.percent >= SUPERLOTACAO_THRESHOLD).length;
    const busiest = rows.reduce((max, row) => (row.percent > max.percent ? row : max), rows[0]);
    const quietest = rows.reduce((min, row) => (row.percent < min.percent ? row : min), rows[0]);

    return { average, overCrowded, busiest, quietest };
  }, [rows]);

  const statusFor = (percent: number): string =>
    percent >= SUPERLOTACAO_THRESHOLD ? 'CRÍTICO' : percent >= ELEVADA_THRESHOLD ? 'ATENÇÃO' : 'NORMAL';

  const labelFor = (percent: number): string =>
    percent >= SUPERLOTACAO_THRESHOLD ? 'Superlotação' : percent >= ELEVADA_THRESHOLD ? 'Elevada' : 'Normal';

  const trendGlyph: Record<OccupancyRow['trend'], string> = { up: '↑', down: '↓', flat: '→' };

  const kpis = [
    { label: 'Ocupação média da malha', value: `${stats.average}%`, status: statusFor(stats.average), hint: 'Média das 15 estações no ciclo atual' },
    {
      label: 'Estações em superlotação',
      value: String(stats.overCrowded),
      status: stats.overCrowded > 0 ? 'CRÍTICO' : 'NORMAL',
      hint: `Acima de ${SUPERLOTACAO_THRESHOLD}% da capacidade de plataforma`,
    },
    {
      label: 'Estação mais carregada',
      value: stats.busiest ? `${stats.busiest.station.code} · ${stats.busiest.percent}%` : '—',
      status: stats.busiest ? statusFor(stats.busiest.percent) : 'NORMAL',
      hint: stats.busiest?.station.name ?? '',
    },
    {
      label: 'Estação mais tranquila',
      value: stats.quietest ? `${stats.quietest.station.code} · ${stats.quietest.percent}%` : '—',
      status: 'NORMAL',
      hint: stats.quietest?.station.name ?? '',
    },
  ];

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Supervisão</span>
          <h2 className="rp-page-header__title">Ocupação de plataformas</h2>
          <p className="rp-page-header__subtitle">
            Estimativa de fluxo de passageiros por estação, combinando horário de pico e posição no traçado
          </p>
        </div>
      </div>

      <div className="rp-grid rp-grid--kpi">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="rp-metric" data-status={kpi.status}>
            <span className="rp-metric__label">{kpi.label}</span>
            <span className="rp-metric__value">{kpi.value}</span>
            <span className="rp-metric__hint">{kpi.hint}</span>
          </article>
        ))}
      </div>

      <section className="rp-card">
        <header className="rp-card__header">
          <div>
            <h3 className="rp-card__title">Ocupação estimada por estação</h3>
            <p className="rp-card__subtitle">Atualizado a cada {TICK_MS / 1000} segundos</p>
          </div>
        </header>

        {rows.length === 0 ? (
          <EmptyState icon="🚶" title="Sem estações carregadas para estimar ocupação." />
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="sr-only">Ocupação estimada de plataforma por estação</caption>
              <thead>
                <tr>
                  <th scope="col">Estação</th>
                  <th scope="col">Ocupação</th>
                  <th scope="col">Tendência</th>
                  <th scope="col">Condição</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.station.code}>
                    <td>
                      <span className="rp-badge rp-badge--code">{row.station.code}</span>{' '}
                      <span className="truncate">{row.station.name}</span>
                    </td>
                    <td style={{ minWidth: '12rem' }}>
                      <div className="rp-row" style={{ gap: 'var(--sp-2)' }}>
                        <div
                          style={{
                            flex: 1,
                            height: '0.5rem',
                            borderRadius: '999px',
                            background: 'var(--uni-border)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${row.percent}%`,
                              height: '100%',
                              borderRadius: '999px',
                              background:
                                row.percent >= SUPERLOTACAO_THRESHOLD
                                  ? 'var(--uni-danger)'
                                  : row.percent >= ELEVADA_THRESHOLD
                                    ? 'var(--uni-warning)'
                                    : 'var(--uni-success)',
                            }}
                          />
                        </div>
                        <span className="mono">{formatNumber(row.percent, 0)}%</span>
                      </div>
                    </td>
                    <td className="mono text-muted">{trendGlyph[row.trend]}</td>
                    <td>
                      <StatusPill status={statusFor(row.percent)} label={labelFor(row.percent)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
