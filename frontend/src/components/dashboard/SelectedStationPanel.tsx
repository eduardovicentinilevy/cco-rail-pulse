// frontend/src/components/dashboard/SelectedStationPanel.tsx
import React, { useState } from 'react';
import type { OperationalCommand, PowerSection, Station, StationArrivalBoard, Train } from '../../types';
import { formatHeadway } from '../../data/stations';
import { StatusPill } from '../common/StatusPill';
import { ConnectionBadges } from '../common/ConnectionBadges';
import { formatVoltage } from '../../lib/format';
import { formatClockDuration, secondsUntil } from '../../lib/arrivals';
import { directionArrow, PHASE_LABELS } from '../../data/trains';
import type { ConfirmRequest } from '../common/ConfirmDialog';

interface SelectedStationPanelProps {
  station: Station;
  trains: Train[];
  /** Previsão de chegadas desta estação; ausente enquanto a primeira consulta não volta. */
  arrivals?: StationArrivalBoard;
  /** Rótulos dos dois sentidos, vindos da própria previsão. */
  /** Nome de cada sentido, vindo dos terminais da linha da sessão. */
  directionLabels?: { forward: string; backward: string };
  /** Tempo desde a última previsão, para a contagem regressiva. */
  arrivalsElapsedMs?: number;
  /** Seção de energia que alimenta a estação. */
  power?: PowerSection;
  pendingCommand: string | null;
  isStationFavorite: boolean;
  onToggleStationFavorite: (code: string) => void;
  isTrainFavorite: (id: string) => boolean;
  onToggleTrainFavorite: (id: string) => void;
  onSendCommand: (trainId: string, command: OperationalCommand) => void;
  onRequestConfirm: (request: ConfirmRequest) => void;
  onInjectAlert: () => void;
}

/** Terminal de controle da estação selecionada. */
export const SelectedStationPanel: React.FC<SelectedStationPanelProps> = ({
  station,
  trains,
  arrivals,
  directionLabels,
  arrivalsElapsedMs = 0,
  power,
  pendingCommand,
  isStationFavorite,
  onToggleStationFavorite,
  isTrainFavorite,
  onToggleTrainFavorite,
  onSendCommand,
  onRequestConfirm,
  onInjectAlert,
}) => {
  const [selectedTrainId, setSelectedTrainId] = useState<string | null>(null);

  // O trem escolhido pelo operador só vale enquanto ele estiver neste bloco.
  const targetTrain = trains.find((train) => train.trainId === selectedTrainId) ?? trains[0];
  const hasTrain = Boolean(targetTrain);
  const isBusy = pendingCommand !== null;

  const handleEmergencyBrake = () => {
    if (!targetTrain) return;
    onRequestConfirm({
      title: 'Confirmar frenagem de emergência',
      message: `A composição ${targetTrain.trainId} será imobilizada imediatamente em ${station.name}. A ação é registrada na trilha de auditoria e não pode ser desfeita automaticamente.`,
      tone: 'danger',
      confirmLabel: 'Acionar frenagem',
      onConfirm: () => onSendCommand(targetTrain.trainId, 'EMERGENCY_BRAKE_OVERRIDE'),
    });
  };

  const handleSpeedRestriction = () => {
    if (!targetTrain) return;
    onSendCommand(targetTrain.trainId, 'SPEED_RESTRICTION_20KM');
  };

  const handleRelease = () => {
    if (!targetTrain) return;
    onRequestConfirm({
      title: 'Liberar sinal e normalizar marcha',
      message: `A composição ${targetTrain.trainId} voltará à velocidade de cruzeiro. Confirme que a via está desimpedida antes de prosseguir.`,
      tone: 'warning',
      confirmLabel: 'Liberar composição',
      onConfirm: () => onSendCommand(targetTrain.trainId, 'RELEASE_SIGNAL'),
    });
  };

  return (
    <aside className="rp-card rp-stack" aria-label={`Terminal de controle — ${station.name}`}>
      <div className="rp-terminal__header">
        <span className="rp-row rp-row--between">
          <span className="rp-eyebrow">Terminal de controle</span>
          <button
            type="button"
            className="rp-icon-btn"
            onClick={() => onToggleStationFavorite(station.code)}
            aria-pressed={isStationFavorite}
            title={isStationFavorite ? 'Remover estação dos favoritos' : 'Adicionar estação aos favoritos'}
          >
            {isStationFavorite ? '★' : '☆'}
          </button>
        </span>
        <h2 className="rp-card__title">{station.name}</h2>
        <span className="rp-card__subtitle mono">
          Código: {station.code} • Alimentação {station.substation}
        </span>
        {station.connections.length > 0 && (
          <span className="rp-row" style={{ gap: 'var(--sp-2)', marginTop: 'var(--sp-2)' }}>
            <span className="rp-card__subtitle">Integração</span>
            <ConnectionBadges connections={station.connections} variant="full" />
          </span>
        )}
      </div>

      {power && !power.energized && (
        <p className="rp-hint" role="status" data-status="CRÍTICO" style={{ color: 'var(--rp-status)' }}>
          ⚡ Seção {power.substation} desenergizada — nenhuma composição parte rumo a esta estação.
        </p>
      )}

      <div className="rp-terminal__metrics">
        <div className="rp-metric-row">
          <span>Status do bloco</span>
          <StatusPill status={station.status} />
        </div>
        <div className="rp-metric-row">
          <span>Terceiro trilho</span>
          <strong className="mono" style={{ color: 'var(--cco-brand-ink)' }}>
            {formatVoltage(station.voltageV)}
          </strong>
        </div>
        <div className="rp-metric-row">
          <span>Tensão de referência</span>
          <strong className="mono">{formatVoltage(station.nominalVoltageV)}</strong>
        </div>
        <div className="rp-metric-row">
          <span>Headway operacional</span>
          <strong className="mono">{formatHeadway(station.headwaySeconds)}</strong>
        </div>
      </div>

      <div className="rp-stack rp-stack--tight" aria-label="Próximas composições nesta estação">
        <h3 className="rp-section-title">Próximos trens</h3>
        {arrivals && directionLabels ? (
          (
            [
              ['backward', directionLabels.backward, '◀'],
              ['forward', directionLabels.forward, '▶'],
            ] as const
          ).map(([key, label, arrow]) => {
            const next = arrivals[key][0];
            return (
              <div key={key} className="rp-metric-row">
                <span>
                  {arrow} {label}
                </span>
                <strong className="mono">
                  {!next
                    ? '—'
                    : next.atPlatform
                      ? `${next.trainId} na plataforma`
                      : `${next.trainId} em ${formatClockDuration(secondsUntil(next.etaSeconds, arrivalsElapsedMs))}`}
                  {next?.held ? ' (retido)' : ''}
                </strong>
              </div>
            );
          })
        ) : (
          <p className="rp-hint">Calculando a previsão…</p>
        )}
      </div>

      <div className="rp-field">
        <label className="rp-label" htmlFor="target-train">
          Composição alvo no bloco
        </label>
        {hasTrain ? (
          <span className="rp-row">
            <select
              id="target-train"
              className="rp-input"
              value={targetTrain!.trainId}
              onChange={(event) => setSelectedTrainId(event.target.value)}
              disabled={isBusy}
              style={{ flex: 1 }}
            >
              {trains.map((train) => (
                <option key={train.trainId} value={train.trainId}>
                  {directionArrow(train.direction)} {train.trainId} — {PHASE_LABELS[train.phase]}
                  {train.phase === 'EM_MARCHA' ? ` a ${train.speedKmH} km/h` : ''} ({train.status})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rp-icon-btn"
              onClick={() => onToggleTrainFavorite(targetTrain!.trainId)}
              aria-pressed={isTrainFavorite(targetTrain!.trainId)}
              title={
                isTrainFavorite(targetTrain!.trainId)
                  ? 'Remover composição dos favoritos'
                  : 'Adicionar composição aos favoritos'
              }
            >
              {isTrainFavorite(targetTrain!.trainId) ? '★' : '☆'}
            </button>
          </span>
        ) : (
          <p className="rp-hint">Nenhuma composição neste bloco no momento.</p>
        )}
        {targetTrain?.holdReason && (
          <p className="rp-hint" role="status">
            {PHASE_LABELS[targetTrain.phase]}: {targetTrain.holdReason}
          </p>
        )}
      </div>

      <div className="rp-stack rp-stack--tight">
        <h3 className="rp-section-title">Comandos críticos de segurança</h3>

        <button
          type="button"
          className="rp-btn rp-btn--command rp-btn--danger"
          onClick={handleEmergencyBrake}
          disabled={!hasTrain || isBusy}
          title={!hasTrain ? 'Nenhum trem neste bloco' : undefined}
        >
          {pendingCommand === 'EMERGENCY_BRAKE_OVERRIDE' ? <span className="rp-spinner" aria-hidden="true" /> : '🚨'}
          Acionar frenagem de emergência
        </button>

        <button
          type="button"
          className="rp-btn rp-btn--command rp-btn--warning"
          onClick={handleSpeedRestriction}
          disabled={!hasTrain || isBusy}
          title={!hasTrain ? 'Nenhum trem neste bloco' : undefined}
        >
          {pendingCommand === 'SPEED_RESTRICTION_20KM' ? <span className="rp-spinner" aria-hidden="true" /> : '⚠️'}
          Impor restrição de 20 km/h (V.R.)
        </button>

        <button
          type="button"
          className="rp-btn rp-btn--command"
          onClick={handleRelease}
          disabled={!hasTrain || isBusy}
          title={!hasTrain ? 'Nenhum trem neste bloco' : undefined}
        >
          {pendingCommand === 'RELEASE_SIGNAL' ? <span className="rp-spinner" aria-hidden="true" /> : '✅'}
          Liberar sinal e normalizar marcha
        </button>

        <button type="button" className="rp-btn rp-btn--command" onClick={onInjectAlert}>
          📌 Registrar ocorrência na estação
        </button>
      </div>
    </aside>
  );
};
