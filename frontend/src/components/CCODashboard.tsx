// frontend/src/components/CCODashboard.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { wsService } from '../services/websocket.service';
import { LINE_STATIONS } from '../data/stations';
import type { AlarmEvent, OperatorSession, Station } from '../types';
import { Header, type ConnectionStatus } from './layout/Header';
import { TrackSchematic } from './dashboard/TrackSchematic';
import { StationsGrid } from './dashboard/StationsGrid';
import { SelectedStationPanel } from './dashboard/SelectedStationPanel';
import { AlarmFeed } from './dashboard/AlarmFeed';
import { AuditLogsView } from './reports/AuditLogsView';
import { OverviewView } from './views/OverviewView';
import { AnalyticsReportsView } from './views/AnalyticsReportsView';
import { AssetMaintenanceView } from './views/AssetMaintenanceView';
import { TimetableDispatchView } from './views/TimetableDispatchView';
import { CCOVisualWidgets } from './CCOVisualWidgets';
import { TSSChartWidget } from './TSSChartWidget';
import { ToastStack, type Toast, type ToastType } from './common/ToastStack';

interface CCODashboardProps {
  session: OperatorSession;
  onUpdateAvatar: (url: string) => void;
  onLogout: () => void;
}

type TabKey = 'overview' | 'ats' | 'energy' | 'assets' | 'analytics' | 'timetable';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: '🏠 Painel Executivo' },
  { key: 'ats', label: '🗺️ Malha ATS' },
  { key: 'energy', label: '⚡ Telemetria de Tração' },
  { key: 'assets', label: '🔧 Saúde de Ativos (TSS)' },
  { key: 'analytics', label: '📊 Relatórios & KPIs' },
  { key: 'timetable', label: '🕒 Escala & Partidas' },
];

const MAX_ALARMS = 30;

export const CCODashboard: React.FC<CCODashboardProps> = ({ session, onUpdateAvatar, onLogout }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [stations, setStations] = useState<Station[]>(LINE_STATIONS);
  const [selectedCode, setSelectedCode] = useState<string>(LINE_STATIONS[0].code);
  const [searchQuery, setSearchQuery] = useState('');
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [commandLoading, setCommandLoading] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  const [shiftStartedAt] = useState(() => Date.now());
  const nextAlarmId = useRef(1);

  const selectedStation = useMemo(
    () => stations.find(st => st.code === selectedCode) ?? stations[0],
    [stations, selectedCode]
  );

  const addAlarm = useCallback((stationCode: string, message: string, level: AlarmEvent['level']) => {
    setAlarms(prev => [
      { id: `alarm-${nextAlarmId.current++}`, timestamp: new Date().toLocaleTimeString('pt-BR'), stationCode, message, level },
      ...prev,
    ].slice(0, MAX_ALARMS));
  }, []);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const socket = wsService.connect();

    const handleConnect = () => {
      setConnectionStatus('online');
      addAlarm('CORE', 'Conexão estabelecida com o barramento de eventos do CCO', 'INFO');
    };

    const handleDisconnect = () => {
      setConnectionStatus('offline');
      addAlarm('CORE', 'Aviso: conexão com o Gateway perdida', 'WARNING');
    };

    const handleError = () => setConnectionStatus('offline');

    const handleTelemetryBatch = (batch: Array<{ currentStationCode: string; voltageKV?: number; status?: Station['status'] }>) => {
      setStations(prev =>
        prev.map(st => {
          const update = batch.find(b => b.currentStationCode === st.code);
          if (!update) return st;
          return {
            ...st,
            voltageKV: update.voltageKV ?? st.voltageKV,
            status: update.status ?? st.status,
          };
        })
      );
    };

    const handleCriticalAlert = (alert: { message: string; severity?: 'INFO' | 'WARNING' | 'CRITICAL' }) => {
      addAlarm('REDE', alert.message, alert.severity === 'CRITICAL' ? 'CRITICAL' : alert.severity === 'WARNING' ? 'WARNING' : 'INFO');
    };

    const handleCommandAck = (ack: { trainId: string; command: string; status: string }) => {
      setCommandLoading(false);
      if (ack.status === 'EXECUTED') {
        addToast(`Comando "${ack.command}" enviado para ${ack.trainId}.`, 'success');
      } else {
        addToast(`Falha ao enviar o comando "${ack.command}" para ${ack.trainId}.`, 'error');
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleError);
    socket.on('telemetry:batch', handleTelemetryBatch);
    socket.on('alert:critical', handleCriticalAlert);
    socket.on('train:command:acknowledged', handleCommandAck);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleError);
      socket.off('telemetry:batch', handleTelemetryBatch);
      socket.off('alert:critical', handleCriticalAlert);
      socket.off('train:command:acknowledged', handleCommandAck);
      wsService.disconnect();
    };
  }, [addAlarm, addToast]);

  const handleSelectStation = useCallback((station: Station) => {
    setSelectedCode(station.code);
  }, []);

  const handleSendCommand = useCallback((trainId: string, command: string) => {
    setCommandLoading(true);
    const socket = wsService.connect();
    socket.emit('train:command', {
      operatorId: session.operatorId,
      trainId,
      command,
      targetBlock: selectedStation.code,
    });
  }, [session.operatorId, selectedStation]);

  const handleInjectAlert = useCallback(() => {
    addAlarm(selectedStation.code, `Ocorrência registrada manualmente em ${selectedStation.name} pelo operador ${session.operatorId}`, 'WARNING');
    addToast('Ocorrência registrada no feed de eventos.', 'info');
  }, [addAlarm, addToast, selectedStation, session.operatorId]);

  const handleLogout = useCallback(() => {
    const confirmed = window.confirm('Deseja encerrar o turno e sair do sistema?');
    if (confirmed) onLogout();
  }, [onLogout]);

  const filteredStations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (query.length === 0) return stations;
    return stations.filter(st => st.name.toLowerCase().includes(query) || st.code.toLowerCase().includes(query));
  }, [stations, searchQuery]);

  return (
    <div style={styles.dashboardContainer}>
      <Header
        session={session}
        connectionStatus={connectionStatus}
        shiftStartedAt={shiftStartedAt}
        onUpdateAvatar={onUpdateAvatar}
        onOpenAuditLogs={() => setIsAuditOpen(true)}
        onLogout={handleLogout}
      />

      <nav style={styles.navTabs} role="tablist" aria-label="Seções do painel">
        {TABS.map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            style={{ ...styles.tabButton, ...(activeTab === tab.key ? styles.tabActive : {}) }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main style={styles.mainContent}>
        {activeTab === 'overview' && (
          <OverviewView stations={stations} alarms={alarms} connectionStatus={connectionStatus} onNavigate={(tab) => setActiveTab(tab as TabKey)} />
        )}

        {activeTab === 'ats' && (
          <div style={styles.atsContainer}>
            <TrackSchematic stations={stations} selectedStation={selectedStation} onSelectStation={handleSelectStation} />

            <div style={styles.searchRow}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar estação por nome ou código (ex: FGO, Perdizes)…"
                style={styles.searchInput}
                aria-label="Buscar estação"
              />
              {searchQuery && (
                <button style={styles.searchClear} onClick={() => setSearchQuery('')} aria-label="Limpar busca">✕</button>
              )}
            </div>

            <div style={styles.atsBody}>
              <div style={styles.gridColumn}>
                <StationsGrid stations={filteredStations} selectedStationCode={selectedStation.code} onSelectStation={handleSelectStation} />
              </div>
              <div style={styles.panelColumn}>
                <SelectedStationPanel
                  station={selectedStation}
                  onSendCommand={handleSendCommand}
                  onInjectAlert={handleInjectAlert}
                />
                {commandLoading && <p style={styles.loadingHint}>Enviando comando…</p>}
              </div>
            </div>

            <AlarmFeed alarms={alarms} />
          </div>
        )}

        {activeTab === 'energy' && (
          <>
            <CCOVisualWidgets />
            <TSSChartWidget />
          </>
        )}

        {activeTab === 'assets' && <AssetMaintenanceView />}
        {activeTab === 'analytics' && <AnalyticsReportsView />}
        {activeTab === 'timetable' && <TimetableDispatchView />}
      </main>

      {isAuditOpen && <AuditLogsView token={session.token} onClose={() => setIsAuditOpen(false)} />}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  dashboardContainer: {
    minHeight: '100vh',
    color: 'var(--uni-text-main)',
    fontFamily: 'var(--uni-font)',
    display: 'flex',
    flexDirection: 'column',
  },
  navTabs: {
    display: 'flex',
    gap: '0.5rem',
    padding: '1rem 1.75rem 0 1.75rem',
    backgroundColor: 'var(--uni-bg-secondary)',
    borderBottom: '1px solid var(--uni-border)',
    flexWrap: 'wrap',
  },
  tabButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--uni-text-muted)',
    padding: '0.75rem 1.15rem',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color: 'var(--uni-orange)',
    borderBottom: '2px solid var(--uni-orange)',
    backgroundColor: 'rgba(255, 102, 0, 0.05)',
  },
  mainContent: { padding: '1.75rem', flex: 1, overflowY: 'auto' },
  atsContainer: { display: 'flex', flexDirection: 'column', gap: '1.25rem', animation: 'railpulse-fade-in 0.3s ease' },
  searchRow: { display: 'flex', gap: '0.5rem', maxWidth: '420px' },
  searchInput: {
    flex: 1,
    backgroundColor: 'var(--uni-bg-secondary)',
    border: '1px solid var(--uni-border)',
    borderRadius: '8px',
    padding: '0.55rem 0.75rem',
    color: 'var(--uni-text-main)',
    fontSize: '0.8rem',
    outline: 'none',
  },
  searchClear: {
    backgroundColor: 'transparent',
    border: '1px solid var(--uni-border)',
    color: 'var(--uni-text-muted)',
    borderRadius: '8px',
    width: '36px',
    cursor: 'pointer',
  },
  atsBody: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '1.25rem', alignItems: 'start' },
  gridColumn: { minWidth: 0 },
  panelColumn: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  loadingHint: { fontSize: '0.7rem', color: 'var(--uni-orange)', textAlign: 'center', margin: 0 },
};
