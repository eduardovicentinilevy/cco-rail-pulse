// frontend/src/components/views/AnalyticsReportsView.tsx
import React, { useMemo } from 'react';
import type { AlarmEvent, Station, Train } from '../../types';
import { formatNumber, downloadTextFile, toCsv } from '../../lib/format';

interface AnalyticsReportsViewProps {
  stations: Station[];
  trains: Train[];
  alarms: AlarmEvent[];
}

interface Interference {
  label: string;
  value: number;
  status: string;
}

export const AnalyticsReportsView: React.FC<AnalyticsReportsViewProps> = ({ stations, trains, alarms }) => {
  const metrics = useMemo(() => {
    const normalStations = stations.filter((station) => station.status === 'NORMAL').length;
    const availability = stations.length === 0 ? 0 : (normalStations / stations.length) * 100;
    const runningTrains = trains.filter((train) => train.status !== 'EMERGÊNCIA').length;
    const avgSpeed = trains.length === 0 ? 0 : trains.reduce((sum, train) => sum + train.speedKmH, 0) / trains.length;

    return [
      { label: 'Disponibilidade da malha', value: `${formatNumber(availability, 1)}%`, status: availability >= 90 ? 'NORMAL' : 'ATENÇÃO', hint: `${normalStations} de ${stations.length} estações nominais` },
      { label: 'Composições em marcha', value: `${runningTrains} / ${trains.length}`, status: runningTrains === trains.length ? 'NORMAL' : 'CRÍTICO', hint: 'Trens fora de emergência' },
      { label: 'Velocidade média da frota', value: `${formatNumber(avgSpeed, 1)} km/h`, status: avgSpeed >= 35 ? 'NORMAL' : 'ATENÇÃO', hint: 'Média instantânea das composições' },
      { label: 'Ocorrências na sessão', value: String(alarms.length), status: alarms.some((a) => a.level === 'CRITICAL') ? 'CRÍTICO' : 'INFO', hint: `${alarms.filter((a) => a.level === 'CRITICAL').length} críticas` },
    ] as const;
  }, [stations, trains, alarms]);

  // Distribuição real das ocorrências da sessão por categoria inferida da mensagem.
  const interferences = useMemo<Interference[]>(() => {
    const buckets: Record<string, { count: number; status: string }> = {
      'Alimentação aérea': { count: 0, status: 'ATENÇÃO' },
      'Sinalização / ATS': { count: 0, status: 'INFO' },
      'Comandos operacionais': { count: 0, status: 'CRÍTICO' },
      'Via permanente': { count: 0, status: 'NORMAL' },
    };

    for (const alarm of alarms) {
      const message = alarm.message.toLowerCase();
      if (message.includes('comando')) buckets['Comandos operacionais'].count += 1;
      else if (message.includes('tensão') || message.includes('catenária') || message.includes('subestação')) {
        buckets['Alimentação aérea'].count += 1;
      } else if (message.includes('ats') || message.includes('sinal') || message.includes('baliza')) {
        buckets['Sinalização / ATS'].count += 1;
      } else buckets['Via permanente'].count += 1;
    }

    return Object.entries(buckets).map(([label, { count, status }]) => ({ label, value: count, status }));
  }, [alarms]);

  const maxInterference = Math.max(1, ...interferences.map((item) => item.value));

  const handleExport = () => {
    const csv = toCsv(
      ['Indicador', 'Valor', 'Observação'],
      metrics.map((metric) => [metric.label, metric.value, metric.hint]),
    );
    downloadTextFile(`railpulse-kpis-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Análises</span>
          <h2 className="rp-page-header__title">Relatórios de desempenho &amp; KPIs</h2>
          <p className="rp-page-header__subtitle">Indicadores calculados sobre o estado corrente da malha</p>
        </div>
        <button type="button" className="rp-btn" onClick={handleExport}>
          Exportar KPIs (CSV)
        </button>
      </div>

      <div className="rp-grid rp-grid--kpi">
        {metrics.map((metric) => (
          <article key={metric.label} className="rp-metric" data-status={metric.status}>
            <span className="rp-metric__label">{metric.label}</span>
            <span className="rp-metric__value">{metric.value}</span>
            <span className="rp-metric__hint">{metric.hint}</span>
          </article>
        ))}
      </div>

      <section className="rp-card" aria-label="Análise de interferências por categoria">
        <header className="rp-card__header">
          <div>
            <h3 className="rp-card__title">Interferências por categoria</h3>
            <p className="rp-card__subtitle">Classificação automática das ocorrências registradas nesta sessão</p>
          </div>
        </header>

        <div className="rp-bars">
          {interferences.map((item) => (
            <div key={item.label} className="rp-bars__group" data-status={item.status}>
              <span className="rp-bars__value">{item.value}</span>
              <div
                className="rp-bars__bar"
                style={{ height: `${Math.max(4, (item.value / maxInterference) * 100)}%` }}
                role="img"
                aria-label={`${item.label}: ${item.value} ocorrências`}
              />
              <span className="rp-bars__label">{item.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
