// frontend/src/components/CCODashboard.tsx
import React, { useState } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { useAuth } from '../context/AuthContext';
import { Header } from './layout/Header';
import { TrackSchematic } from './dashboard/TrackSchematic';
import { StationsGrid } from './dashboard/StationsGrid';
import { AlarmFeed } from './dashboard/AlarmFeed';
import { SelectedStationPanel } from './dashboard/SelectedStationPanel';
import { AuditLogsView } from './reports/AuditLogsView';
import { TimetableDispatchView } from './views/TimetableDispatchView';
import { AssetMaintenanceView } from './views/AssetMaintenanceView';
import { AnalyticsReportsView } from './views/AnalyticsReportsView';
import type { AlarmEvent } from '../types';

const INITIAL_ALARMS: AlarmEvent[] = [
  { id: 'ALM-901', timestamp: '03:02:15', stationCode: 'AGU', message: 'Queda transitória de tensão na rede aérea', level: 'WARNING' },
];

export const CCODashboard: React.FC<{ operator: string; onLogout: () => void }> = ({ onLogout }) => {
  const { session, updateAvatar } = useAuth();
  const { stations, isConnected, selectedStation, setSelectedStation, sendCommand } = useTelemetry();
  const [alarms, setAlarms] = useState<AlarmEvent[]>(INITIAL_ALARMS);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'timetable' | 'assets' | 'analytics'>('overview');

  if (!session) return null;

  const handleInjectAlert = () => {
    const newAlarm: AlarmEvent = {
      id: `ALM-${Math.floor(100 + Math.random() * 900)}`,
      timestamp: new Date().toLocaleTimeString(),
      stationCode: selectedStation.code,
      message: `Comando manual de inspeção emitido para ${selectedStation.name}`,
      level: 'WARNING'
    };
    setAlarms(prev => [newAlarm, ...prev]);
  };

  return (
    <div style={styles.container}>
      <Header 
        session={session} 
        isConnected={isConnected} 
        onUpdateAvatar={updateAvatar}
        onOpenAuditLogs={() => setIsAuditModalOpen(true)} 
        onLogout={onLogout} 
      />

      {/* Barra de Abas — Navegação Principal Estilo Site Corporativo */}
      <nav style={styles.navBar}>
        <button 
          onClick={() => setActiveTab('overview')} 
          style={{ ...styles.navTab, ...(activeTab === 'overview' ? styles.navTabActive : {}) }}
        >
          🗺️ Visão Geral & ATS
        </button>
        <button 
          onClick={() => setActiveTab('timetable')} 
          style={{ ...styles.navTab, ...(activeTab === 'timetable' ? styles.navTabActive : {}) }}
        >
          ⏱️ Escala & Headway
        </button>
        <button 
          onClick={() => setActiveTab('assets')} 
          style={{ ...styles.navTab, ...(activeTab === 'assets' ? styles.navTabActive : {}) }}
        >
          ⚡ Ativos & Energia (TSS)
        </button>
        <button 
          onClick={() => setActiveTab('analytics')} 
          style={{ ...styles.navTab, ...(activeTab === 'analytics' ? styles.navTabActive : {}) }}
        >
          📊 Relatórios & KPIs
        </button>
      </nav>

      {/* Conteúdo Dinâmico Baseado na Aba Ativa */}
      {activeTab === 'overview' && (
        <>
          <TrackSchematic stations={stations} selectedStation={selectedStation} onSelectStation={setSelectedStation} />
          <main style={styles.main}>
            <div style={styles.leftColumn}>
              <StationsGrid stations={stations} selectedStationCode={selectedStation.code} onSelectStation={setSelectedStation} />
              <AlarmFeed alarms={alarms} />
            </div>
            <SelectedStationPanel station={selectedStation} onSendCommand={sendCommand} onInjectAlert={handleInjectAlert} />
          </main>
        </>
      )}

      {activeTab === 'timetable' && <TimetableDispatchView />}
      {activeTab === 'assets' && <AssetMaintenanceView />}
      {activeTab === 'analytics' && <AnalyticsReportsView />}

      {isAuditModalOpen && <AuditLogsView onClose={() => setIsAuditModalOpen(false)} />}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#050302', color: '#fdf8f0', fontFamily: '"Montserrat", sans-serif' },
  navBar: { display: 'flex', backgroundColor: '#110a06', borderBottom: '1px solid #331e13', padding: '0 1.5rem', gap: '0.5rem' },
  navTab: { backgroundColor: 'transparent', border: 'none', borderBottom: '2px solid transparent', color: '#887c71', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: '"Montserrat", sans-serif', transition: 'all 0.2s' },
  navTabActive: { color: '#ebcf98', borderBottomColor: '#a0522d', backgroundColor: 'rgba(160, 82, 45, 0.05)' },
  main: { flex: 1, padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem' },
  leftColumn: { display: 'flex', flexDirection: 'column', gap: '1rem' },
};