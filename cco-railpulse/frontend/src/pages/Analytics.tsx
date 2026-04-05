import React from 'react';
import { Card } from '../components/common/Card';
import { Activity, Clock } from 'lucide-react';

import { useHeadway } from '../features/analytics/hooks/useHeadway';
import { HeadwayChart } from '../features/analytics/components/HeadwayChart';

// Importações do novo módulo de retenção
import { useDwellTime } from '../features/analytics/hooks/useDwellTime';
import { DwellTimeChart } from '../features/analytics/components/DwellTimeChart';

export const Analytics = () => {
  const { data: headwayData, isLoading: isLoadingHeadway } = useHeadway('J');
  const { data: dwellData, isLoading: isLoadingDwell } = useDwellTime('J');

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      <div className="page-header">
        <div>
          <h2 className="page-title">
            Business Intelligence <span className="text-highlight">| Frota J</span>
          </h2>
          <p className="page-subtitle font-mono mt-1">CCO OPERATIONAL UNIT - REAL TIME ANALYTICS</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="font-mono" style={{ display: 'block', fontSize: '0.65rem', color: 'var(--sp-metro)', fontWeight: 'bold' }}>SISTEMA INTEGRADO</span>
          <span style={{ fontSize: '0.75rem', fontWeight: '900', color: 'var(--text-main)' }}>LINHA 4 - AMARELA</span>
        </div>
      </div>

      <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
        <div className="col-3">
          <Card title="MÉDIA DE HEADWAY (2H)" accent="v4">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="font-mono" style={{ fontSize: '2.5rem', fontWeight: '900' }}>
                {isLoadingHeadway ? '--' : headwayData?.average_headway_seconds || 0}
                <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '4px' }}>seg</span>
              </div>
              <Activity color="var(--sp-v4)" size={32} style={{ opacity: 0.5 }} />
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--sp-vm)', fontWeight: 'bold', textTransform: 'uppercase' }}>▲ Atualizado via TimescaleDB</div>
          </Card>
        </div>

        <div className="col-3">
          <Card title="RETENÇÃO MÉDIA (DWELL)" accent="vm">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="font-mono" style={{ fontSize: '2.5rem', fontWeight: '900' }}>
                {/* Fallback de retenção calculado de forma simples com base no topo do gráfico */}
                {isLoadingDwell ? '--' : (dwellData?.events?.[0]?.dwell_seconds || 0)}
                <span style={{ fontSize: '1rem', color: 'var(--text-muted)', marginLeft: '4px' }}>seg</span>
              </div>
              <Clock color="var(--sp-vm)" size={32} style={{ opacity: 0.5 }} />
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>Top Peak Dwell Time</div>
          </Card>
        </div>
      </div>

      <div className="dashboard-grid" style={{ flex: 1 }}>
        <div className="col-6">
          <Card title="DISTRIBUIÇÃO DO HEADWAY INTER-TRENS">
            <div style={{ height: '300px', marginTop: '1rem' }}>
              {isLoadingHeadway ? (
                 <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                   <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Consultando Banco de Dados...</span>
                 </div>
              ) : headwayData && headwayData.events && headwayData.events.length > 0 ? (
                 <HeadwayChart data={headwayData.events} />
              ) : (
                 <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                   <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sem dados na via nas últimas 2 horas</span>
                 </div>
              )}
            </div>
          </Card>
        </div>

        <div className="col-6">
          <Card title="PICOS DE RETENÇÃO (DWELL TIME)">
            <div style={{ height: '300px', marginTop: '1rem' }}>
              {isLoadingDwell ? (
                 <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                   <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Processando Retenções...</span>
                 </div>
              ) : dwellData && dwellData.events && dwellData.events.length > 0 ? (
                 <DwellTimeChart data={dwellData.events} />
              ) : (
                 <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
                   <span className="font-mono" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Nenhuma retenção registrada</span>
                 </div>
              )}
            </div>
          </Card>
        </div>
      </div>
      
    </div>
  );
};