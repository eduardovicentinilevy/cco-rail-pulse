// frontend/src/components/modals/PowerSectionDialog.tsx
import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import type { PowerSection, Train } from '../../types';

interface PowerSectionDialogProps {
  section: PowerSection;
  /** Composições hoje dentro da seção (paradas ou em marcha). */
  trainsInSection: Train[];
  isSubmitting: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/** Mesmo mínimo do backend (`MIN_DEENERGIZE_REASON_LENGTH`) — o servidor também valida. */
const MIN_REASON_LENGTH = 10;

/**
 * Confirmação de manobra de energia. Desenergizar exige motivo (vai para a trilha
 * de auditoria e para o alarme) e avisa quantas composições serão afetadas.
 */
export const PowerSectionDialog: React.FC<PowerSectionDialogProps> = ({
  section,
  trainsInSection,
  isSubmitting,
  onConfirm,
  onClose,
}) => {
  const [reason, setReason] = useState('');
  const deenergizing = section.energized;
  const running = trainsInSection.filter((train) => train.phase === 'EM_MARCHA');
  const trimmed = reason.trim();
  const canSubmit = !isSubmitting && (!deenergizing || trimmed.length >= MIN_REASON_LENGTH);

  return (
    <Modal
      title={deenergizing ? `Desenergizar a seção ${section.substation}` : `Reenergizar a seção ${section.substation}`}
      subtitle={`Terceiro trilho de ${section.stationCodes.join(' • ')}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rp-btn rp-btn--ghost" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </button>
          <button
            type="button"
            className={`rp-btn ${deenergizing ? 'rp-btn--danger' : 'rp-btn--primary'}`}
            onClick={() => onConfirm(trimmed)}
            disabled={!canSubmit}
          >
            {isSubmitting ? <span className="rp-spinner" aria-hidden="true" /> : null}
            {deenergizing ? 'Abrir disjuntores' : 'Fechar disjuntores'}
          </button>
        </>
      }
    >
      <div className="rp-stack rp-stack--tight">
        {deenergizing ? (
          <>
            <p className="rp-hint">
              O terceiro trilho fica sem tensão nas estações da seção. Nenhuma composição parte rumo a ela, e
              {running.length > 0
                ? ` ${running.length === 1 ? 'a composição' : `as ${running.length} composições`} em marcha (${running
                    .map((train) => train.trainId)
                    .join(', ')}) ${running.length === 1 ? 'para' : 'param'} no meio do trecho.`
                : ' nenhuma composição está em marcha nela agora.'}
            </p>
            <div className="rp-field">
              <label className="rp-label" htmlFor="power-reason">
                Motivo da manobra
              </label>
              <textarea
                id="power-reason"
                className="rp-input"
                rows={3}
                maxLength={300}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex: Inspeção do terceiro trilho entre PSO e ANR"
                aria-describedby="power-reason-hint"
              />
              <span id="power-reason-hint" className="rp-hint">
                Mínimo de {MIN_REASON_LENGTH} caracteres — fica registrado na trilha de auditoria e no alarme.
              </span>
            </div>
          </>
        ) : (
          <p className="rp-hint">
            Confirme com a manutenção que a via está liberada e sem equipes no trecho antes de devolver a tensão.
            {trainsInSection.length > 0 &&
              ` As composições paradas na seção (${trainsInSection.map((train) => train.trainId).join(', ')}) retomam a marcha.`}
          </p>
        )}
      </div>
    </Modal>
  );
};
