// frontend/src/components/dashboard/AlarmFeed.tsx
import React, { useMemo, useState } from 'react';
import type { AlarmEvent, AlarmLevel } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { downloadTextFile, toCsv } from '../../lib/format';

interface AlarmFeedProps {
  alarms: AlarmEvent[];
  onClear: () => void;
  onAcknowledge: (id: string) => void;
}

const FILTERS: ReadonlyArray<{ key: AlarmLevel | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'Todos' },
  { key: 'CRITICAL', label: 'Críticos' },
  { key: 'WARNING', label: 'Atenção' },
  { key: 'INFO', label: 'Informativos' },
];

export const AlarmFeed: React.FC<AlarmFeedProps> = ({ alarms, onClear, onAcknowledge }) => {
  const [filter, setFilter] = useState<AlarmLevel | 'ALL'>('ALL');

  const visibleAlarms = useMemo(
    () => (filter === 'ALL' ? alarms : alarms.filter((alarm) => alarm.level === filter)),
    [alarms, filter],
  );

  const criticalCount = useMemo(() => alarms.filter((alarm) => alarm.level === 'CRITICAL').length, [alarms]);

  const handleExport = () => {
    const csv = toCsv(
      ['Horário', 'Origem', 'Nível', 'Mensagem'],
      alarms.map((alarm) => [alarm.timestamp, alarm.stationCode, alarm.level, alarm.message]),
    );
    downloadTextFile(`railpulse-ocorrencias-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <section className="rp-card" aria-label="Feed de ocorrências e eventos da via">
      <header className="rp-card__header">
        <div className="rp-row">
          <h2 className="rp-section-title">Feed de ocorrências e eventos da via</h2>
          {criticalCount > 0 && <StatusPill status="CRITICAL" label={`${criticalCount} críticos`} />}
        </div>

        <div className="rp-row rp-stack--tight">
          <div className="rp-chip-row" role="group" aria-label="Filtrar ocorrências por nível">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                className="rp-chip"
                aria-pressed={filter === option.key}
                onClick={() => setFilter(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="rp-btn rp-btn--ghost" onClick={handleExport} disabled={alarms.length === 0}>
            Exportar CSV
          </button>
          <button type="button" className="rp-btn rp-btn--ghost" onClick={onClear} disabled={alarms.length === 0}>
            Limpar
          </button>
        </div>
      </header>

      {visibleAlarms.length === 0 ? (
        <EmptyState
          icon="✅"
          title={alarms.length === 0 ? 'Nenhuma ocorrência registrada nesta sessão.' : 'Nenhuma ocorrência para este filtro.'}
          hint="Eventos da malha e comandos de operadores aparecem aqui em tempo real."
        />
      ) : (
        <ul className="rp-feed rp-feed--tall" role="log" aria-live="polite">
          {visibleAlarms.map((alarm) => (
            <li
              key={alarm.id}
              className="rp-feed__item"
              data-status={alarm.level}
              style={{ opacity: alarm.acknowledged ? 0.55 : 1 }}
            >
              <span className="rp-feed__time">{alarm.timestamp}</span>
              <span className="rp-feed__source">{alarm.stationCode}</span>
              <span className="rp-feed__message">{alarm.message}</span>
              <StatusPill status={alarm.level} outline />
              <button
                type="button"
                className="rp-icon-btn"
                onClick={() => onAcknowledge(alarm.id)}
                disabled={alarm.acknowledged}
                aria-label={`Reconhecer ocorrência: ${alarm.message}`}
                title={alarm.acknowledged ? 'Reconhecida' : 'Reconhecer'}
              >
                ✓
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
