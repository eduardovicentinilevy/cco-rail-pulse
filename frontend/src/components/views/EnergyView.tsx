// frontend/src/components/views/EnergyView.tsx
import React, { useMemo, useState } from 'react';
import type { Station } from '../../types';
import type { VoltageSample } from '../TSSChartWidget';
import { TSSChartWidget } from '../TSSChartWidget';
import { StatusPill } from '../common/StatusPill';
import { formatNumber } from '../../lib/format';

interface EnergyViewProps {
  stations: Station[];
  history: VoltageSample[];
}

interface Substation {
  code: string;
  stations: Station[];
  voltageKV: number;
  status: Station['status'];
}

const WORST_FIRST: Record<Station['status'], number> = { 'CRÍTICO': 0, 'ATENÇÃO': 1, NORMAL: 2 };

/**
 * Telemetria de tração agregada por subestação (TSS).
 * Os valores vêm do barramento de telemetria — antes esta tela exibia dados fixos.
 */
export const EnergyView: React.FC<EnergyViewProps> = ({ stations, history }) => {
  const [selectedCodes, setSelectedCodes] = useState<string[]>(() =>
    stations.slice(0, 2).map((station) => station.code),
  );

  const substations = useMemo<Substation[]>(() => {
    const grouped = new Map<string, Station[]>();
    for (const station of stations) {
      const list = grouped.get(station.substation);
      if (list) list.push(station);
      else grouped.set(station.substation, [station]);
    }

    return Array.from(grouped.entries())
      .map(([code, group]) => {
        const voltageKV = group.reduce((sum, station) => sum + station.voltageKV, 0) / group.length;
        // A subestação assume o pior status entre os trechos que alimenta.
        const status = group.reduce<Station['status']>(
          (worst, station) => (WORST_FIRST[station.status] < WORST_FIRST[worst] ? station.status : worst),
          'NORMAL',
        );
        return { code, stations: group, voltageKV, status };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [stations]);

  const averageVoltage = useMemo(
    () => (stations.length === 0 ? 0 : stations.reduce((sum, station) => sum + station.voltageKV, 0) / stations.length),
    [stations],
  );

  const toggleSeries = (code: string) => {
    setSelectedCodes((current) => {
      if (current.includes(code)) {
        // Mantém pelo menos uma série no gráfico.
        return current.length === 1 ? current : current.filter((item) => item !== code);
      }
      // Até quatro séries simultâneas preservam a legibilidade do gráfico.
      return current.length >= 4 ? [...current.slice(1), code] : [...current, code];
    });
  };

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Energia de tração</span>
          <h2 className="rp-page-header__title">Telemetria SCADA das subestações (TSS)</h2>
          <p className="rp-page-header__subtitle">
            Leitura de tensão da catenária por subestação, atualizada pelo barramento de eventos
          </p>
        </div>
        <span className="rp-header__stat">
          Tensão média da linha <strong className="mono">{formatNumber(averageVoltage, 2)} kV</strong>
        </span>
      </div>

      <section className="rp-card" aria-label="Status das subestações">
        <header className="rp-card__header">
          <h3 className="rp-card__title">Subestações retificadoras</h3>
          <span className="rp-badge" data-status="NORMAL">
            <span className="rp-dot rp-dot--pulse" aria-hidden="true" />
            Tempo real
          </span>
        </header>

        <div className="rp-grid rp-grid--cards">
          {substations.map((substation) => (
            <article key={substation.code} className="rp-tss-card" data-status={substation.status}>
              <div className="rp-row rp-row--between">
                <span className="rp-badge rp-badge--code">{substation.code}</span>
                <StatusPill status={substation.status} />
              </div>
              <span className="rp-card__subtitle truncate">
                {substation.stations.map((station) => station.code).join(' • ')}
              </span>
              <div className="rp-tss-card__voltage">
                <span className="rp-tss-card__value">{formatNumber(substation.voltageKV, 2)}</span>
                <span className="rp-tss-card__unit">kV</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rp-card" aria-label="Histórico de tensão">
        <header className="rp-card__header">
          <div>
            <h3 className="rp-card__title">Histórico de tensão da catenária</h3>
            <p className="rp-card__subtitle">Selecione até quatro estações para comparar as curvas</p>
          </div>
        </header>

        <div className="rp-chip-row" role="group" aria-label="Estações plotadas no gráfico" style={{ marginBottom: 'var(--sp-4)' }}>
          {stations.map((station) => (
            <button
              key={station.code}
              type="button"
              className="rp-chip"
              aria-pressed={selectedCodes.includes(station.code)}
              onClick={() => toggleSeries(station.code)}
              title={station.name}
            >
              {station.code}
            </button>
          ))}
        </div>

        <TSSChartWidget history={history} seriesCodes={selectedCodes} stations={stations} />
      </section>
    </div>
  );
};
