// frontend/src/components/views/AssetMaintenanceView.tsx
import React, { useMemo, useState } from 'react';
import type { Station } from '../../types';
import { StatusPill } from '../common/StatusPill';
import { EmptyState } from '../common/EmptyState';
import { formatVoltage } from '../../lib/format';
import { TRACTION_NOMINAL_V } from '../../data/stations';

interface AssetMaintenanceViewProps {
  stations: Station[];
}

type AssetStatus = 'OPERACIONAL' | 'MANUTENÇÃO_PREVENTIVA' | 'ALERTA_TERMICO';

interface SubstationAsset {
  code: string;
  name: string;
  voltageClass: string;
  measuredV: number;
  loadPercent: number;
  status: AssetStatus;
  stationCodes: string[];
}

const HIGH_LOAD_THRESHOLD = 80;
const PREVENTIVE_LOAD_THRESHOLD = 70;

/**
 * Deriva a carga dos grupos retificadores a partir do afundamento de tensão
 * no terceiro trilho: quanto mais a leitura cai abaixo dos 750 Vcc nominais,
 * mais a subestação está sendo solicitada (ou opera com grupo a menos).
 */
const estimateLoad = (measuredV: number): number => {
  const sag = Math.max(0, TRACTION_NOMINAL_V - measuredV);
  return Math.min(99, Math.round(45 + (sag / TRACTION_NOMINAL_V) * 450));
};

const classifyAsset = (loadPercent: number): AssetStatus => {
  if (loadPercent > HIGH_LOAD_THRESHOLD) return 'ALERTA_TERMICO';
  if (loadPercent > PREVENTIVE_LOAD_THRESHOLD) return 'MANUTENÇÃO_PREVENTIVA';
  return 'OPERACIONAL';
};

export const AssetMaintenanceView: React.FC<AssetMaintenanceViewProps> = ({ stations }) => {
  const [onlyAlerts, setOnlyAlerts] = useState(false);

  const assets = useMemo<SubstationAsset[]>(() => {
    const grouped = new Map<string, Station[]>();
    for (const station of stations) {
      const list = grouped.get(station.substation);
      if (list) list.push(station);
      else grouped.set(station.substation, [station]);
    }

    return Array.from(grouped.entries())
      .map(([code, group]) => {
        const measuredV = group.reduce((sum, station) => sum + station.voltageV, 0) / group.length;
        const loadPercent = estimateLoad(measuredV);

        return {
          code,
          name: `Subestação Retificadora ${group[0].name}`,
          // Recebe 22 kV CA da subestação primária e entrega 750 Vcc ao terceiro trilho.
          voltageClass: '22 kV CA → 750 Vcc',
          measuredV,
          loadPercent,
          status: classifyAsset(loadPercent),
          stationCodes: group.map((station) => station.code),
        };
      })
      .sort((a, b) => b.loadPercent - a.loadPercent);
  }, [stations]);

  const visibleAssets = onlyAlerts ? assets.filter((asset) => asset.status !== 'OPERACIONAL') : assets;
  const alertCount = assets.filter((asset) => asset.status !== 'OPERACIONAL').length;

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Ativos &amp; energia</span>
          <h2 className="rp-page-header__title">Saúde de ativos (SR &amp; AMV)</h2>
          <p className="rp-page-header__subtitle">
            Carga estimada dos grupos retificadores a partir do afundamento de tensão no terceiro trilho
          </p>
        </div>
        <button type="button" className="rp-chip" aria-pressed={onlyAlerts} onClick={() => setOnlyAlerts((v) => !v)}>
          Somente com alerta ({alertCount})
        </button>
      </div>

      {visibleAssets.length === 0 ? (
        <EmptyState icon="check-circle" title="Nenhum ativo em alerta." hint="Todas as subestações operam dentro da faixa nominal." />
      ) : (
        <div className="rp-grid rp-grid--panels">
          {visibleAssets.map((asset) => (
            <article key={asset.code} className="rp-card rp-stack rp-stack--tight" data-status={asset.status}>
              <div className="rp-row rp-row--between">
                <span className="rp-badge rp-badge--code">{asset.code}</span>
                <StatusPill status={asset.status} label={asset.status.replace(/_/g, ' ')} />
              </div>

              <h3 className="rp-card__title truncate">{asset.name}</h3>
              <p className="rp-card__subtitle mono">Trechos: {asset.stationCodes.join(' • ')}</p>

              <div className="rp-metric-row">
                <span>Classe de tensão</span>
                <strong className="mono">{asset.voltageClass}</strong>
              </div>
              <div className="rp-metric-row">
                <span>Tensão medida</span>
                <strong className="mono">{formatVoltage(asset.measuredV)}</strong>
              </div>
              <div className="rp-metric-row">
                <span>Carga dos retificadores</span>
                <strong className="mono">{asset.loadPercent}%</strong>
              </div>

              <div
                className="rp-progress"
                role="meter"
                aria-valuenow={asset.loadPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Carga dos grupos retificadores da ${asset.code}`}
              >
                <div className="rp-progress__fill" style={{ width: `${asset.loadPercent}%` }} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
