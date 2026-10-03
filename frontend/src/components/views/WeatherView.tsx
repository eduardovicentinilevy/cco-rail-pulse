// frontend/src/components/views/WeatherView.tsx
import React, { useEffect, useMemo, useState } from 'react';
import type { Station } from '../../types';
import { StatusPill } from '../common/StatusPill';
import { EmptyState } from '../common/EmptyState';
import { hashString } from '../../lib/hash';
import { formatNumber } from '../../lib/format';

interface WeatherViewProps {
  stations: Station[];
}

/**
 * Fração das estações tratadas como suscetíveis a alagamento.
 *
 * Antes eram dois códigos fixos da Linha 6-Laranja (o trecho que cruza a faixa do
 * Rio Tietê), o que deixava o painel inerte na malha de qualquer outro cliente. A
 * suscetibilidade agora sai do hash do código da estação: estável entre recargas,
 * e válida para qualquer malha. Onde o trecho sensível é real, o procedimento de
 * METEOROLOGIA da linha é que o nomeia.
 */
const FLOOD_PRONE_RATIO = 0.15;

const TIME_BUCKET_MS = 10 * 60_000;

/** Espalha um hash inteiro em [0, 1) — determinístico, sem depender de `Math.random`. */
const pseudoRandom = (seed: number): number => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

interface WeatherSample {
  temperatureC: number;
  rainMmH: number;
  windKmH: number;
}

type RiskLevel = 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO';

interface StationWeather extends WeatherSample {
  station: Station;
  floodRisk: RiskLevel;
  heatRisk: RiskLevel;
  windRisk: RiskLevel;
  overallRisk: RiskLevel;
  advisories: string[];
}

const worstOf = (...levels: RiskLevel[]): RiskLevel => {
  if (levels.includes('CRÍTICO')) return 'CRÍTICO';
  if (levels.includes('ATENÇÃO')) return 'ATENÇÃO';
  return 'NORMAL';
};

/** Condições simuladas — sem integração real (INMET/CPTEC) neste ambiente de demonstração. */
const deriveWeather = (station: Station, bucket: number): StationWeather => {
  const seed = hashString(`${station.code}:${bucket}`);
  const temperatureC = 18 + pseudoRandom(seed) * 22;
  const rainRoll = pseudoRandom(seed + 1);
  const rainMmH = rainRoll < 0.7 ? 0 : ((rainRoll - 0.7) / 0.3) * 45;
  const windKmH = pseudoRandom(seed + 2) * 70;

  const canFlood = (hashString(`FLOOD-${station.code}`) % 100) / 100 < FLOOD_PRONE_RATIO;
  const floodRisk: RiskLevel = canFlood && rainMmH > 25 ? 'CRÍTICO' : canFlood && rainMmH > 10 ? 'ATENÇÃO' : 'NORMAL';
  const heatRisk: RiskLevel = temperatureC > 38 ? 'CRÍTICO' : temperatureC > 34 ? 'ATENÇÃO' : 'NORMAL';
  const windRisk: RiskLevel = windKmH > 60 ? 'CRÍTICO' : windKmH > 45 ? 'ATENÇÃO' : 'NORMAL';

  const advisories: string[] = [];
  if (floodRisk !== 'NORMAL') advisories.push('Risco de alagamento no trecho da estação — ver os procedimentos de METEOROLOGIA da linha.');
  if (heatRisk !== 'NORMAL') advisories.push('Risco de dilatação da via permanente por calor — monitore trechos sensíveis.');
  if (windRisk !== 'NORMAL') advisories.push('Vento acima do limite operacional da catenária — avalie restrição de velocidade.');

  return {
    station,
    temperatureC,
    rainMmH,
    windKmH,
    floodRisk,
    heatRisk,
    windRisk,
    overallRisk: worstOf(floodRisk, heatRisk, windRisk),
    advisories,
  };
};

export const WeatherView: React.FC<WeatherViewProps> = ({ stations }) => {
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [bucket, setBucket] = useState(() => Math.floor(Date.now() / TIME_BUCKET_MS));

  // As condições avançam para o próximo "boletim" a cada janela de 10 minutos.
  useEffect(() => {
    const interval = window.setInterval(() => setBucket(Math.floor(Date.now() / TIME_BUCKET_MS)), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const readings = useMemo(() => stations.map((station) => deriveWeather(station, bucket)), [stations, bucket]);
  const visible = onlyAlerts ? readings.filter((reading) => reading.overallRisk !== 'NORMAL') : readings;
  const alertCount = readings.filter((reading) => reading.overallRisk !== 'NORMAL').length;

  const avgTemperature = readings.length === 0 ? 0 : readings.reduce((sum, r) => sum + r.temperatureC, 0) / readings.length;
  const maxWind = readings.length === 0 ? 0 : Math.max(...readings.map((r) => r.windKmH));
  const rainingStations = readings.filter((r) => r.rainMmH > 0).length;

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Supervisão</span>
          <h2 className="rp-page-header__title">Clima &amp; riscos operacionais</h2>
          <p className="rp-page-header__subtitle">
            Condições simuladas por estação — substitua por uma integração real (INMET/CPTEC) em produção
          </p>
        </div>
        <button type="button" className="rp-chip" aria-pressed={onlyAlerts} onClick={() => setOnlyAlerts((v) => !v)}>
          Somente com risco ({alertCount})
        </button>
      </div>

      <div className="rp-grid rp-grid--kpi">
        <article className="rp-metric" data-status="INFO">
          <span className="rp-metric__label">Temperatura média da malha</span>
          <span className="rp-metric__value">{formatNumber(avgTemperature, 1)}°C</span>
          <span className="rp-metric__hint">Média simulada entre as {stations.length} estações</span>
        </article>
        <article className="rp-metric" data-status={maxWind > 60 ? 'CRÍTICO' : maxWind > 45 ? 'ATENÇÃO' : 'NORMAL'}>
          <span className="rp-metric__label">Vento máximo</span>
          <span className="rp-metric__value">{formatNumber(maxWind, 0)} km/h</span>
          <span className="rp-metric__hint">Limite operacional da catenária: 60 km/h</span>
        </article>
        <article className="rp-metric" data-status={rainingStations > 0 ? 'ATENÇÃO' : 'NORMAL'}>
          <span className="rp-metric__label">Estações sob chuva</span>
          <span className="rp-metric__value">{rainingStations} / {stations.length}</span>
          <span className="rp-metric__hint">Precipitação simulada acima de 0 mm/h</span>
        </article>
        <article className="rp-metric" data-status={alertCount > 0 ? 'CRÍTICO' : 'NORMAL'}>
          <span className="rp-metric__label">Estações em risco</span>
          <span className="rp-metric__value">{alertCount}</span>
          <span className="rp-metric__hint">Alagamento, calor na via ou vento na catenária</span>
        </article>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon="☀️" title="Nenhuma estação com risco climático no momento." hint="Todas as condições estão dentro da faixa operacional." />
      ) : (
        <div className="rp-grid rp-grid--panels">
          {visible.map((reading) => (
            <article key={reading.station.code} className="rp-card rp-stack rp-stack--tight" data-status={reading.overallRisk}>
              <div className="rp-row rp-row--between">
                <span className="rp-badge rp-badge--code">{reading.station.code}</span>
                <StatusPill status={reading.overallRisk} label={reading.overallRisk} />
              </div>

              <h3 className="rp-card__title truncate">{reading.station.name}</h3>

              <div className="rp-metric-row">
                <span>Temperatura</span>
                <strong className="mono">{formatNumber(reading.temperatureC, 1)}°C</strong>
              </div>
              <div className="rp-metric-row">
                <span>Precipitação</span>
                <strong className="mono">{formatNumber(reading.rainMmH, 1)} mm/h</strong>
              </div>
              <div className="rp-metric-row">
                <span>Vento</span>
                <strong className="mono">{formatNumber(reading.windKmH, 0)} km/h</strong>
              </div>

              {reading.advisories.length > 0 && (
                <ul className="rp-stack rp-stack--tight" style={{ marginTop: 'var(--sp-2)' }}>
                  {reading.advisories.map((advisory) => (
                    <li key={advisory} className="rp-hint" style={{ color: 'var(--uni-warning)' }}>
                      ⚠ {advisory}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
