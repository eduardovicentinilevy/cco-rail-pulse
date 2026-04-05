import React, { useState } from 'react';
import { useTelemetry } from '../features/dashboard/hooks/useTelemetry';
import { Card } from '../components/common/Card';
import { LinearSynopticPanel } from '../features/dashboard/components/LinearSynopticPanel';
import { StatusBadge } from '../components/common/StatusBadge';
import { TelemetryCard } from '../features/dashboard/components/TelemetryCard';
import { TrainDrawer } from '../features/dashboard/components/TrainDrawer';

import type { TelemetryDTO } from '../features/dashboard/types'; 

export const Dashboard = () => {
  // Correção Arquitetural: Subscrição sintonizada para a Frota I (Linha 2 - Verde)
  const { trains, isConnected } = useTelemetry('I');
  
  const [selectedTrain, setSelectedTrain] = useState<TelemetryDTO | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleTrainClick = (train: TelemetryDTO) => {
    setSelectedTrain(train);
    setIsDrawerOpen(true);
  };

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      <div className="page-header">
        <div>
          <h2 className="page-title">
            Monitoramento de Via <span className="text-highlight" style={{ color: '#007A5E' }}>| Linha 2 - Verde</span>
          </h2>
          <p className="page-subtitle font-mono mt-1">SINALIZAÇÃO CBTC | SAFETY INTEGRITY LEVEL: SIL 4</p>
        </div>
        
        <div className="sync-badge font-mono">
          <span style={{ marginRight: '12px', color: 'var(--text-muted)' }}>LINK_STATUS:</span>
          <StatusBadge 
            status={isConnected ? 'healthy' : 'critical'} 
            label={isConnected ? 'CBTC SYNC' : 'CONNECTION LOST'} 
            pulse={!isConnected}
          />
        </div>
      </div>

      <div className="dashboard-grid" style={{ flex: 1, minHeight: 0 }}>
        
        <div className="col-9">
          {/* Título e estilização neutra para herdar os tons de madeira do componente filho */}
          <Card title="Painel Sinótico Linear - Frota I">
            <div className="synoptic-panel">
              <LinearSynopticPanel trains={trains} />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }} className="font-mono">
              <span>Modo: Automático (ATO/CBTC)</span>
              <span>Composições Ativas: {trains.length}</span>
            </div>
          </Card>
        </div>

        <div className="col-3">
          {/* Coluna lateral de telemetria também atualizada */}
          <Card title="Telemetria em Tempo Real">
            <div className="telemetry-list custom-scrollbar">
              {trains.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', opacity: 0.5 }}>
                  <p className="font-mono" style={{ fontSize: '0.75rem', letterSpacing: '0.1em' }}>
                    AGUARDANDO VARREDURA DA VIA...
                  </p>
                </div>
              ) : (
                trains.map(t => (
                   <TelemetryCard 
                     key={t.train_id} 
                     train={t} 
                     onClick={handleTrainClick} 
                   />
                ))
              )}
            </div>
          </Card>
        </div>

      </div>

      <TrainDrawer 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        train={selectedTrain} 
      />

    </div>
  );
};