// frontend/src/components/views/EnergyView.tsx
import React, { useMemo, useState } from 'react';
import type { OperatorSession, PowerSection, Station, Train } from '../../types';
import type { ChartSeries, VoltageSample } from '../VoltageChartWidget';
import { VoltageChartWidget } from '../VoltageChartWidget';
import { SERIES_COLORS } from '../../lib/chart';
import { StatusPill } from '../common/StatusPill';
import { formatNumber, formatVoltage } from '../../lib/format';
import { LINE_NAME, TRACTION_NOMINAL_V } from '../../data/stations';
import { api, ApiError } from '../../services/api';
import { can } from '../../lib/permissions';
import { formatDateTime } from '../../lib/format';
import { PowerSectionDialog } from '../modals/PowerSectionDialog';

interface EnergyViewProps {
  stations: Station[];
  history: VoltageSample[];
  trains: Train[];
  powerSections: PowerSection[];
  session: OperatorSession;
  onPowerChanged: (section: PowerSection) => void;
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
  onAuthError: (message: string) => void;
}

interface Substation {
  code: string;
  stations: Station[];
  voltageV: number;
  status: Station['status'];
}

const WORST_FIRST: Record<Station['status'], number> = { 'CRÍTICO': 0, 'ATENÇÃO': 1, NORMAL: 2 };

const MAX_SERIES = SERIES_COLORS.length;

/**
 * Telemetria do terceiro trilho agregada por subestação retificadora (SR).
 * Os valores vêm do barramento de telemetria em tempo real.
 */
export const EnergyView: React.FC<EnergyViewProps> = ({
  stations,
  history,
  trains,
  powerSections,
  session,
  onPowerChanged,
  onNotify,
  onAuthError,
}) => {
  const canControlPower = can(session.role, 'CONTROL_POWER');
  const [dialogSection, setDialogSection] = useState<PowerSection | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const powerBySubstation = useMemo(
    () => new Map(powerSections.map((section) => [section.substation, section])),
    [powerSections],
  );
  const stationSubstation = useMemo(
    () => new Map(stations.map((station) => [station.code, station.substation])),
    [stations],
  );
  /** Composições dentro da seção: paradas numa estação dela ou em marcha a partir dela. */
  const trainsInSection = (substation: string) =>
    trains.filter((train) => stationSubstation.get(train.currentStationCode) === substation);

  const handleConfirmPower = async (reason: string) => {
    if (!dialogSection) return;
    const target = dialogSection;
    setIsSubmitting(true);
    try {
      const result = await api.setPowerSection(session.token, target.substation, !target.energized, reason);
      onPowerChanged(result.section);
      onNotify(
        result.section.energized
          ? `Seção ${target.substation} reenergizada.`
          : `Seção ${target.substation} desenergizada — composições retidas fora dela.`,
        result.section.energized ? 'success' : 'info',
      );
      setDialogSection(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onAuthError('Sua sessão expirou. Autentique-se novamente para reassumir o turno.');
        return;
      }
      onNotify(error instanceof Error ? error.message : 'Falha na manobra de energia.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Cada série guarda o slot de cor que recebeu ao entrar: desmarcar ou trocar
  // uma estação nunca repinta as que continuam no gráfico.
  const [series, setSeries] = useState<ChartSeries[]>(() =>
    stations.slice(0, 2).map((station, slot) => ({ code: station.code, slot })),
  );
  const slotByCode = useMemo(() => new Map(series.map((item) => [item.code, item.slot])), [series]);

  const substations = useMemo<Substation[]>(() => {
    const grouped = new Map<string, Station[]>();
    for (const station of stations) {
      const list = grouped.get(station.substation);
      if (list) list.push(station);
      else grouped.set(station.substation, [station]);
    }

    return Array.from(grouped.entries())
      .map(([code, group]) => {
        const voltageV = group.reduce((sum, station) => sum + station.voltageV, 0) / group.length;
        // A subestação assume o pior status entre os trechos que alimenta.
        const status = group.reduce<Station['status']>(
          (worst, station) => (WORST_FIRST[station.status] < WORST_FIRST[worst] ? station.status : worst),
          'NORMAL',
        );
        return { code, stations: group, voltageV, status };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [stations]);

  const averageVoltage = useMemo(
    () => (stations.length === 0 ? 0 : stations.reduce((sum, station) => sum + station.voltageV, 0) / stations.length),
    [stations],
  );

  const toggleSeries = (code: string) => {
    setSeries((current) => {
      if (current.some((item) => item.code === code)) {
        // Mantém pelo menos uma série no gráfico.
        return current.length === 1 ? current : current.filter((item) => item.code !== code);
      }
      // Até quatro séries simultâneas: a mais antiga cede o lugar (e a cor) à nova.
      if (current.length >= MAX_SERIES) {
        return [...current.slice(1), { code, slot: current[0].slot }];
      }
      const used = new Set(current.map((item) => item.slot));
      const slot = Array.from({ length: MAX_SERIES }, (_, index) => index).find((index) => !used.has(index)) ?? 0;
      return [...current, { code, slot }];
    });
  };

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Energia de tração</span>
          <h2 className="rp-page-header__title">
            Subestações retificadoras — <span className="rp-nowrap">{LINE_NAME}</span>
          </h2>
          <p className="rp-page-header__subtitle">
            Tensão do terceiro trilho ({TRACTION_NOMINAL_V} Vcc nominal) por subestação, via barramento SCADA
          </p>
        </div>
        <span className="rp-header__stat">
          Tensão média da linha <strong className="mono">{formatVoltage(averageVoltage)}</strong>
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
          {substations.map((substation) => {
            const power = powerBySubstation.get(substation.code);
            const energized = power?.energized ?? true;
            const inSection = trainsInSection(substation.code);
            const running = inSection.filter((train) => train.phase === 'EM_MARCHA').length;
            const stopped = inSection.filter((train) => train.phase === 'PARADO_ENTRE_ESTACOES').length;

            return (
              <article
                key={substation.code}
                className="rp-sr-card"
                data-status={energized ? substation.status : 'CRÍTICO'}
                data-energized={energized}
              >
                <div className="rp-row rp-row--between">
                  <span className="rp-badge rp-badge--code">{substation.code}</span>
                  {energized ? (
                    <StatusPill status={substation.status} />
                  ) : (
                    <StatusPill status="CRÍTICO" label="DESENERGIZADA" solid />
                  )}
                </div>
                <span className="rp-card__subtitle truncate">
                  {substation.stations.map((station) => station.code).join(' • ')}
                </span>
                <div className="rp-sr-card__voltage">
                  <span className="rp-sr-card__value">{formatNumber(substation.voltageV, 0)}</span>
                  <span className="rp-sr-card__unit">Vcc</span>
                </div>
                <span className="rp-hint">
                  {running} em marcha
                  {stopped > 0 && ` • ${stopped} parada(s) no trecho`}
                </span>
                {!energized && power && (
                  <span className="rp-hint" title={power.reason ?? undefined}>
                    {power.changedBy ?? '—'} às {formatDateTime(power.changedAt)}
                    {power.reason ? ` — ${power.reason}` : ''}
                  </span>
                )}
                <button
                  type="button"
                  className={`rp-btn rp-btn--sm ${energized ? 'rp-btn--danger' : 'rp-btn--primary'}`}
                  disabled={!canControlPower || !power}
                  title={canControlPower ? undefined : 'Manobra de energia exige perfil de supervisor'}
                  onClick={() => power && setDialogSection(power)}
                >
                  {energized ? 'Desenergizar' : 'Reenergizar'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rp-card" aria-label="Histórico de tensão">
        <header className="rp-card__header">
          <div>
            <h3 className="rp-card__title">Histórico de tensão do terceiro trilho</h3>
            <p className="rp-card__subtitle">Selecione até quatro estações para comparar as curvas</p>
          </div>
        </header>

        <div className="rp-chip-row" role="group" aria-label="Estações plotadas no gráfico" style={{ marginBottom: 'var(--sp-4)' }}>
          {stations.map((station) => {
            const slot = slotByCode.get(station.code);
            return (
              <button
                key={station.code}
                type="button"
                className="rp-chip"
                aria-pressed={slot !== undefined}
                onClick={() => toggleSeries(station.code)}
                title={station.name}
              >
                {slot !== undefined && (
                  <span
                    className="rp-chip__swatch"
                    style={{ backgroundColor: SERIES_COLORS[slot] }}
                    aria-hidden="true"
                  />
                )}
                {station.code}
              </button>
            );
          })}
        </div>

        <VoltageChartWidget history={history} series={series} stations={stations} />
      </section>

      {dialogSection && (
        <PowerSectionDialog
          section={dialogSection}
          trainsInSection={trainsInSection(dialogSection.substation)}
          isSubmitting={isSubmitting}
          onConfirm={(reason) => void handleConfirmPower(reason)}
          onClose={() => !isSubmitting && setDialogSection(null)}
        />
      )}
    </div>
  );
};
