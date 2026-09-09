// frontend/src/components/dashboard/SelectedStationPanel.tsx
import React, { useState } from 'react';
import type { OperationalCommand, Station, Train } from '../../types';
import { StatusPill } from '../common/StatusPill';
import type { ConfirmRequest } from '../common/ConfirmDialog';

interface SelectedStationPanelProps {
  station: Station;
  trains: Train[];
  pendingCommand: string | null;
  onSendCommand: (trainId: string, command: OperationalCommand) => void;
  onRequestConfirm: (request: ConfirmRequest) => void;
  onInjectAlert: () => void;
}

/** Terminal de controle da estação selecionada. */
export const SelectedStationPanel: React.FC<SelectedStationPanelProps> = ({
  station,
  trains,
  pendingCommand,
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
        <span className="rp-eyebrow">Terminal de controle</span>
        <h2 className="rp-card__title">{station.name}</h2>
        <span className="rp-card__subtitle mono">
          Código ATS: {station.code} • {station.substation}
        </span>
      </div>

      <div className="rp-terminal__metrics">
        <div className="rp-metric-row">
          <span>Status do bloco</span>
          <StatusPill status={station.status} />
        </div>
        <div className="rp-metric-row">
          <span>Tensão da catenária</span>
          <strong className="mono" style={{ color: 'var(--uni-orange)' }}>
            {station.voltageKV.toFixed(2)} kV
          </strong>
        </div>
        <div className="rp-metric-row">
          <span>Tensão nominal</span>
          <strong className="mono">{station.nominalVoltageKV.toFixed(1)} kV</strong>
        </div>
        <div className="rp-metric-row">
          <span>Headway operacional</span>
          <strong className="mono">{station.headway}</strong>
        </div>
      </div>

      <div className="rp-field">
        <label className="rp-label" htmlFor="target-train">
          Composição alvo no bloco
        </label>
        {hasTrain ? (
          <select
            id="target-train"
            className="rp-input"
            value={targetTrain!.trainId}
            onChange={(event) => setSelectedTrainId(event.target.value)}
            disabled={isBusy}
          >
            {trains.map((train) => (
              <option key={train.trainId} value={train.trainId}>
                {train.trainId} — {train.speedKmH} km/h ({train.status})
              </option>
            ))}
          </select>
        ) : (
          <p className="rp-hint">Nenhuma composição neste bloco no momento.</p>
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
