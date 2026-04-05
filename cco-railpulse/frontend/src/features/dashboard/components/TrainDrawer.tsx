import React from 'react';
import type { TelemetryDTO } from '../types';
import { X, Activity, Cpu, Radio, Gauge } from 'lucide-react';
import { StatusBadge } from '../../../components/common/StatusBadge';

interface TrainDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  train: TelemetryDTO | null;
}

export const TrainDrawer: React.FC<TrainDrawerProps> = ({ isOpen, onClose, train }) => {
  // Se não estiver aberto ou não tiver trem selecionado, não renderiza a estrutura pesada
  if (!isOpen || !train) return null;

  return (
    <>
      {/* Overlay Escuro (Fundo borrado quando a gaveta abre) */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', 
          backdropFilter: 'blur(2px)', zIndex: 40
        }}
      />

      {/* Painel Drawer Lateral */}
      <div 
        style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: '400px',
          backgroundColor: 'var(--bg-base)', borderLeft: '1px solid var(--border-color)',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.9)', zIndex: 50,
          display: 'flex', flexDirection: 'column',
          // Animação de entrada
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {/* Header do Drawer */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: 'var(--bg-panel)' }}>
           <div>
             <h2 className="font-mono" style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>
               COMPOSIÇÃO {train.train_id}
             </h2>
             <p className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--sp-metro)', margin: 0, marginTop: '6px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
               DIAGNÓSTICO PROFUNDO | FROTA {train.fleet_code || 'J'}
             </p>
           </div>
           <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', transition: 'color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.color = '#fff'} onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}>
             <X size={24} />
           </button>
        </div>

        {/* Corpo do Drawer (Scrollável) */}
        <div className="custom-scrollbar" style={{ padding: '1.5rem', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

           {/* Status Principal de Comunicação */}
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'var(--bg-panel-hover)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>SINAL CBTC (VOBC)</span>
              <StatusBadge status="healthy" label="LINK_ESTÁVEL" pulse />
           </div>

           {/* Grid de Sensores Internos */}
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              
              <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'rgba(0,0,0,0.3)' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    <Gauge size={14} />
                    <span className="font-mono" style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>VELOCIDADE</span>
                 </div>
                 <div className="font-mono" style={{ fontSize: '1.5rem', fontWeight: '900', color: train.speed_kmh > 0 ? 'var(--sp-v4)' : 'var(--text-main)' }}>
                    {train.speed_kmh} <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>KM/H</span>
                 </div>
              </div>

              <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'rgba(0,0,0,0.3)' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    <Activity size={14} />
                    <span className="font-mono" style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>ESTADO PORTAS</span>
                 </div>
                 <div className="font-mono" style={{ fontSize: '1.1rem', fontWeight: '900', color: train.doors_open ? 'var(--sp-cptm)' : 'var(--sp-vm)' }}>
                    {train.doors_open ? 'ABERTAS' : 'FECHADAS'}
                 </div>
              </div>

              <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'rgba(0,0,0,0.3)' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    <Cpu size={14} />
                    <span className="font-mono" style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>MODO OPERAÇÃO</span>
                 </div>
                 <div className="font-mono" style={{ fontSize: '1.1rem', fontWeight: '900', color: 'var(--text-main)' }}>
                    ATO (AUTO)
                 </div>
              </div>

              <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'rgba(0,0,0,0.3)' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    <Radio size={14} />
                    <span className="font-mono" style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>LATÊNCIA RÁDIO</span>
                 </div>
                 <div className="font-mono" style={{ fontSize: '1.1rem', fontWeight: '900', color: 'var(--sp-vm)' }}>
                    12 <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>ms</span>
                 </div>
              </div>

           </div>
        </div>
      </div>
    </>
  );
};