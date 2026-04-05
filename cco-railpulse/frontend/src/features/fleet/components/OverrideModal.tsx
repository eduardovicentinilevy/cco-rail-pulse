import React, { useState } from 'react';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { useEmergencyStop } from '../hooks/useEmergencyStop';
import { AlertTriangle } from 'lucide-react';

interface OverrideModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainId: number;
}

export const OverrideModal: React.FC<OverrideModalProps> = ({ isOpen, onClose, trainId }) => {
  const [reason, setReason] = useState('');
  const { triggerEmergencyBrake, isPending, error } = useEmergencyStop();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleOverride = async () => {
    const success = await triggerEmergencyBrake({
      train_id: trainId,
      reason,
      // TODO (Security): Substituir pelo ID extraído do token JWT real na camada de contexto/auth
      operator_id: 'a1b2c3d4-mock-uuid-9999' 
    });

    if (success) {
      setSuccessMsg('Comando processado pelo Controlador Vital.');
      setTimeout(() => {
        setSuccessMsg(null);
        setReason(''); // Limpa o estado para a próxima abertura
        onClose();
      }, 3000);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`PARADA DE EMERGÊNCIA - TREM ${trainId}`} isCritical>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Caixa de Alerta Crítico */}
        <div style={{ 
          background: 'rgba(227, 6, 19, 0.1)', 
          border: '1px solid var(--sp-cptm)', 
          color: 'var(--sp-cptm)', 
          padding: '0.75rem 1rem', 
          borderRadius: '6px', 
          fontSize: '0.8rem', 
          display: 'flex', 
          alignItems: 'flex-start', 
          gap: '0.75rem',
          boxShadow: 'inset 0 0 15px rgba(227, 6, 19, 0.1)'
        }}>
          <AlertTriangle style={{ flexShrink: 0, marginTop: '2px' }} size={18} />
          <p style={{ margin: 0, lineHeight: 1.5, letterSpacing: '0.02em' }}>
            <strong style={{ fontWeight: '900' }}>ATENÇÃO:</strong> Esta ação anula o protocolo CBTC e aciona diretamente os atuadores de frenagem do trem via Gateway SIL 4.
          </p>
        </div>

        {/* Input de Justificativa para Auditoria */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
            Motivo da Intervenção (Obrigatório para Auditoria)
          </label>
          <textarea 
            className="custom-scrollbar font-mono"
            style={{
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '0.75rem',
              color: 'var(--text-main)',
              fontSize: '0.75rem',
              outline: 'none',
              resize: 'none',
              minHeight: '80px',
              boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)'
            }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Invasão de via, princípio de incêndio, perda total de telemetria..."
          />
        </div>

        {/* Mensagens de Feedback */}
        {error && <p className="font-mono" style={{ color: 'var(--sp-cptm)', fontSize: '0.7rem', fontWeight: 'bold', margin: 0 }}>ERROR: {error}</p>}
        {successMsg && <p className="font-mono" style={{ color: 'var(--sp-vm)', fontSize: '0.7rem', fontWeight: 'bold', margin: 0 }}>SYS: {successMsg}</p>}

        {/* Botões de Ação */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleOverride} isLoading={isPending} disabled={reason.trim().length < 5}>
            CONFIRMAR OVERRIDE
          </Button>
        </div>

      </div>
    </Modal>
  );
};