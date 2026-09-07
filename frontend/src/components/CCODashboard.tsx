// frontend/src/components/CCODashboard.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { wsService } from '../services/websocket.service';
import { CCOVisualWidgets } from './CCOVisualWidgets';
import { TSSChartWidget } from './TSSChartWidget';

interface CCODashboardProps {
  operator: string;
  onLogout: () => void;
}

interface TrackStation {
  id: number;
  code: string;
  name: string;
  status: 'NORMAL' | 'ATENÇÃO' | 'CRÍTICO';
  train: string | null;
  voltageKV: number;
  headway: string;
}

type ConnectionStatus = 'connecting' | 'online' | 'offline';

interface HistoryEntry {
  id: string;
  timestamp: string;
  message: string;
}

const INITIAL_STATIONS: TrackStation[] = [
  { id: 1, code: 'BRA', name: 'Brasilândia', status: 'NORMAL', train: 'T-01', voltageKV: 24.6, headway: '4min 10s' },
  { id: 2, code: 'MAR', name: 'Maristela', status: 'NORMAL', train: null, voltageKV: 24.7, headway: '4min 05s' },
  { id: 3, code: 'ITA', name: 'Itaberaba-Hospital Vila Penteado', status: 'CRÍTICO', train: null, voltageKV: 21.9, headway: '9min 30s' },
  { id: 4, code: 'JPI', name: 'João Paulo I', status: 'NORMAL', train: null, voltageKV: 24.4, headway: '4min 12s' },
  { id: 5, code: 'FGO', name: 'Freguesia do Ó', status: 'ATENÇÃO', train: 'T-04', voltageKV: 23.2, headway: '6min 40s' },
  { id: 6, code: 'SMA', name: 'Santa Marina', status: 'NORMAL', train: null, voltageKV: 24.6, headway: '4min 02s' },
  { id: 7, code: 'AGB', name: 'Água Branca', status: 'NORMAL', train: null, voltageKV: 24.5, headway: '4min 00s' },
  { id: 8, code: 'POM', name: 'SESC-Pompeia', status: 'NORMAL', train: null, voltageKV: 24.6, headway: '3min 58s' },
  { id: 9, code: 'PDZ', name: 'Perdizes', status: 'NORMAL', train: 'T-07', voltageKV: 24.5, headway: '4min 04s' },
  { id: 10, code: 'PUC', name: 'PUC-Cardoso de Almeida', status: 'NORMAL', train: null, voltageKV: 24.7, headway: '3min 55s' },
  { id: 11, code: 'FAA', name: 'FAAP-Pacaembu', status: 'NORMAL', train: null, voltageKV: 24.6, headway: '4min 01s' },
  { id: 12, code: 'HGM', name: 'Higienópolis-Mackenzie', status: 'NORMAL', train: null, voltageKV: 24.5, headway: '4min 03s' },
  { id: 13, code: '14B', name: '14 Bis-Saracura', status: 'NORMAL', train: 'T-12', voltageKV: 24.6, headway: '4min 06s' },
  { id: 14, code: 'BLV', name: 'Bela Vista', status: 'NORMAL', train: null, voltageKV: 24.7, headway: '3min 59s' },
  { id: 15, code: 'SJQ', name: 'São Joaquim', status: 'NORMAL', train: null, voltageKV: 24.6, headway: '4min 00s' },
];

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Conectando…',
  online: 'Core Online',
  offline: 'Core Offline',
};

const CONNECTION_COLOR: Record<ConnectionStatus, string> = {
  connecting: '#FF6600',
  online: '#00FF66',
  offline: '#FF0000',
};

const MAX_HISTORY_ENTRIES = 15;

const Clock: React.FC = () => {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('pt-BR'));

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString('pt-BR')), 1000);
    return () => clearInterval(timer);
  }, []);

  return <div style={styles.clockBox}>🕒 {time}</div>;
};

const ShiftTimer: React.FC<{ startedAt: number }> = ({ startedAt }) => {
  const [elapsedLabel, setElapsedLabel] = useState('00:00:00');

  useEffect(() => {
    const format = () => {
      const totalSeconds = Math.floor((Date.now() - startedAt) / 1000);
      const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
      const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
      const s = String(totalSeconds % 60).padStart(2, '0');
      setElapsedLabel(`${h}:${m}:${s}`);
    };
    format();
    const timer = setInterval(format, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return <div style={styles.shiftBox}>⏱️ Turno: <strong style={{ fontFamily: 'monospace' }}>{elapsedLabel}</strong></div>;
};

const statusBorderColor = (status: TrackStation['status']) => {
  if (status === 'CRÍTICO') return '#FF0000';
  if (status === 'ATENÇÃO') return '#FF6600';
  return '#2E2E2E';
};

export const CCODashboard: React.FC<CCODashboardProps> = ({ operator, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'ats' | 'energy'>('ats');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [stations, setStations] = useState<TrackStation[]>(INITIAL_STATIONS);
  const [selectedStation, setSelectedStation] = useState<TrackStation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [commandLoading, setCommandLoading] = useState(false);

  const shiftStartRef = useRef(Date.now());
  const stationRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const addHistoryEntry = useCallback((message: string) => {
    setHistory(prev => [
      { id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date().toLocaleTimeString('pt-BR'), message },
      ...prev,
    ].slice(0, MAX_HISTORY_ENTRIES));
  }, []);

  useEffect(() => {
    const socket = wsService.connect();

    const handleConnect = () => {
      setConnectionStatus('online');
      addHistoryEntry('Conexão estabelecida com o barramento de eventos do CCO');
    };

    const handleDisconnect = () => {
      setConnectionStatus('offline');
      addHistoryEntry('Aviso: Conexão com o Gateway perdida');
    };

    const handleError = () => setConnectionStatus('offline');

    const handleTelemetryBatch = (batch: any[]) => {
      setStations(prev =>
        prev.map(st => {
          const update = batch.find(b => b.currentStationCode === st.code);
          if (!update) return st;
          return {
            ...st,
            voltageKV: update.voltageKV ?? st.voltageKV,
            status: update.status === 'ATENÇÃO' ? 'ATENÇÃO' : update.status === 'CRÍTICO' ? 'CRÍTICO' : st.status,
          };
        })
      );
    };

    const handleCriticalAlert = (alert: { message: string }) => {
      addHistoryEntry(`⚡ ALERTA REDE: ${alert.message}`);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleError);
    socket.on('telemetry:batch', handleTelemetryBatch);
    socket.on('alert:critical', handleCriticalAlert);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleError);
      socket.off('telemetry:batch', handleTelemetryBatch);
      socket.off('alert:critical', handleCriticalAlert);
      wsService.disconnect();
    };
  }, [addHistoryEntry]);

  const selectStation = useCallback((station: TrackStation, source: 'click' | 'search') => {
    setSelectedStation(current => {
      const next = current?.id === station.id ? null : station;
      addHistoryEntry(
        next
          ? `Estação ${station.name} (${station.code}) inspecionada${source === 'search' ? ' via busca rápida' : ''}`
          : `Inspeção da estação ${station.name} encerrada`
      );
      return next;
    });
  }, [addHistoryEntry]);

  const handleDispatchCommand = useCallback(async (commandName: string) => {
    if (!selectedStation) return;
    setCommandLoading(true);
    const socket = wsService.connect();

    socket.emit('train:command', {
      operatorId: operator,
      trainId: selectedStation.train || `BLOCO-${selectedStation.code}`,
      command: commandName,
    });

    setTimeout(() => {
      setCommandLoading(false);
      addHistoryEntry(`Comando [${commandName}] enviado com sucesso para ${selectedStation.name}`);
      alert(`Comando operacional "${commandName}" disparado com sucesso para ${selectedStation.name}.`);
    }, 400);
  }, [selectedStation, operator, addHistoryEntry]);

  const handleStationKeyDown = useCallback((e: React.KeyboardEvent, station: TrackStation) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectStation(station, 'click');
    }
  }, [selectStation]);

  const handleLogout = useCallback(() => {
    const confirmed = window.confirm('Deseja encerrar o turno e sair do sistema?');
    if (confirmed) onLogout();
  }, [onLogout]);

  const attentionCount = useMemo(
    () => stations.filter(st => st.status !== 'NORMAL').length,
    [stations]
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const matchesQuery = useCallback(
    (st: TrackStation) =>
      normalizedQuery.length === 0 ||
      st.name.toLowerCase().includes(normalizedQuery) ||
      st.code.toLowerCase().includes(normalizedQuery),
    [normalizedQuery]
  );

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const match = stations.find(matchesQuery);
    if (!match) return;
    selectStation(match, 'search');
    stationRefs.current[match.id]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [stations, matchesQuery, selectStation]);

  return (
    <div style={styles.dashboardContainer}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logoBadge}>L06-UNI</span>
          <div>
            <h1 style={styles.headerTitle}>RailPulse CCO — Linha 6 Laranja</h1>
            <p style={styles.headerSubtitle}>Centro de Controle Operacional • Supervisão ATS & SCADA</p>
          </div>
        </div>

        <div style={styles.headerRight}>
          <ShiftTimer startedAt={shiftStartRef.current} />
          <Clock />
          <div
            style={{
              ...styles.coreStatusBadge,
              borderColor: CONNECTION_COLOR[connectionStatus],
              color: CONNECTION_COLOR[connectionStatus],
              backgroundColor: `${CONNECTION_COLOR[connectionStatus]}1A`,
            }}
          >
            <span
              style={{
                ...styles.onlineDot,
                backgroundColor: CONNECTION_COLOR[connectionStatus],
                boxShadow: `0 0 6px ${CONNECTION_COLOR[connectionStatus]}`,
              }}
            />
            {CONNECTION_LABEL[connectionStatus]}
          </div>
          <div style={styles.operatorBadge}>
            👤 {operator} <span style={styles.roleTag}>OPERATOR_SOC</span>
          </div>
          <button onClick={handleLogout} style={styles.logoutButton}>Sair</button>
        </div>
      </header>

      <nav style={styles.navTabs} role="tablist" aria-label="Seções do painel">
        <button
          role="tab"
          aria-selected={activeTab === 'ats'}
          style={{ ...styles.tabButton, ...(activeTab === 'ats' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('ats')}
        >
          🗺️ Visão Geral & ATS
          {attentionCount > 0 && <span style={styles.tabBadge}>{attentionCount}</span>}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'energy'}
          style={{ ...styles.tabButton, ...(activeTab === 'energy' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('energy')}
        >
          ⚡ Ativos & Energia (TSS)
        </button>
      </nav>

      <main style={styles.mainContent}>
        {activeTab === 'ats' ? (
          <>
            <div style={styles.trackInfoBar}>
              <span style={styles.trackTitle}>ATS / MALHA TRONCO — LINHA 6-LARANJA (LINHA UNI) • 15 ESTAÇÕES</span>
              <div style={styles.trackSync}>
                <span style={styles.syncDot} /> Tempo Real Ativo
              </div>
            </div>
            <div style={styles.routeDescription}>
              Brasilândia → São Joaquim • Clique em uma estação para inspecionar parâmetros de via e comandos operacionais
            </div>

            <div style={styles.searchRow}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar estação por nome ou código (ex: FGO, Perdizes)…"
                style={styles.searchInput}
                aria-label="Buscar estação"
              />
              {searchQuery && (
                <button style={styles.searchClear} onClick={() => setSearchQuery('')} aria-label="Limpar busca">
                  ✕
                </button>
              )}
            </div>

            <div style={styles.railwayContainer}>
              <div style={styles.railTrackLine} />
              <div style={styles.stationsScroll}>
                {stations.map((st) => {
                  const isSelected = selectedStation?.id === st.id;
                  const isDimmed = normalizedQuery.length > 0 && !matchesQuery(st);
                  return (
                    <div
                      key={st.id}
                      ref={(el) => { stationRefs.current[st.id] = el; }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      aria-label={`Estação ${st.name}, status ${st.status}`}
                      style={{ ...styles.stationNode, opacity: isDimmed ? 0.35 : 1 }}
                      onClick={() => selectStation(st, 'click')}
                      onKeyDown={(e) => handleStationKeyDown(e, st)}
                    >
                      {st.train && <div style={styles.trainTag}>🚆 {st.train}</div>}
                      <div
                        style={{
                          ...styles.stationCircle,
                          borderColor: statusBorderColor(st.status),
                          backgroundColor: isSelected ? '#FF6600' : '#0A0A0A',
                          boxShadow: isSelected ? '0 0 12px rgba(255,102,0,0.6)' : 'none',
                        }}
                      >
                        {st.id}
                      </div>
                      <span
                        style={{
                          ...styles.stationName,
                          color: isSelected ? '#FFFFFF' : '#A3A3A3',
                        }}
                      >
                        {st.name}
                      </span>
                      <span style={styles.stationCode}>{st.code}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedStation && (
              <div style={styles.stationDetailPanel}>
                <div style={styles.stationDetailHeader}>
                  <span>
                    <strong>{selectedStation.name}</strong> · Código <code>{selectedStation.code}</code>
                  </span>
                  <button style={styles.stationDetailClose} onClick={() => selectStation(selectedStation, 'click')} aria-label="Fechar detalhes">
                    ✕
                  </button>
                </div>
                <div style={styles.stationGridInfo}>
                  <div style={styles.stationDetailRow}>
                    <span>Status Operacional:</span>
                    <strong style={{ color: statusBorderColor(selectedStation.status) }}>{selectedStation.status}</strong>
                  </div>
                  <div style={styles.stationDetailRow}>
                    <span>Trem Atribuído:</span>
                    <strong>{selectedStation.train ?? 'Nenhum no bloco'}</strong>
                  </div>
                  <div style={styles.stationDetailRow}>
                    <span>Tensão Catenária:</span>
                    <strong style={{ fontFamily: 'monospace', color: '#FF6600' }}>{selectedStation.voltageKV} kV</strong>
                  </div>
                  <div style={styles.stationDetailRow}>
                    <span>Headway:</span>
                    <strong style={{ fontFamily: 'monospace' }}>{selectedStation.headway}</strong>
                  </div>
                </div>

                <div style={styles.actionToolbar}>
                  <span style={styles.actionLabel}>Painel de Ações do CCO:</span>
                  <div style={styles.actionButtons}>
                    <button 
                      disabled={commandLoading} 
                      onClick={() => handleDispatchCommand('EMERGENCY_BRAKE_OVERRIDE')} 
                      style={styles.actionBtnDanger}
                    >
                      🛑 Aplicar Bloqueio / SIV
                    </button>
                    <button 
                      disabled={commandLoading} 
                      onClick={() => handleDispatchCommand('SPEED_RESTRICTION_20KM')} 
                      style={styles.actionBtnWarning}
                    >
                      ⚠️ Limitar Velocidade (20km/h)
                    </button>
                    <button 
                      disabled={commandLoading} 
                      onClick={() => handleDispatchCommand('ALIGN_SIGNALS_NORMAL')} 
                      style={styles.actionBtnNormal}
                    >
                      ✅ Normalizar Sinais ATS
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div style={styles.historyPanel}>
              <div style={styles.historyHeader}>
                <span>📋 Log de Eventos da Sessão (Event-Driven Core)</span>
                <span style={styles.historyCount}>{history.length} eventos</span>
              </div>
              {history.length === 0 ? (
                <p style={styles.emptyState}>Aguardando telemetria em tempo real…</p>
              ) : (
                <div style={styles.historyList}>
                  {history.map(entry => (
                    <div key={entry.id} style={styles.historyItem}>
                      <span style={styles.historyTime}>{entry.timestamp}</span>
                      <span>{entry.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <CCOVisualWidgets />
            <TSSChartWidget />
          </>
        )}
      </main>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  dashboardContainer: {
    minHeight: '100vh',
    backgroundColor: '#0A0A0A',
    color: '#FFFFFF',
    fontFamily: '"Montserrat", sans-serif',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    backgroundColor: '#141414',
    borderBottom: '1px solid #2E2E2E',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: '1rem' },
  logoBadge: {
    backgroundColor: '#FF6600',
    color: '#FFFFFF',
    fontWeight: 800,
    fontSize: '0.85rem',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
  },
  headerTitle: { fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#FFFFFF' },
  headerSubtitle: { fontSize: '0.75rem', color: '#A3A3A3', margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' },
  shiftBox: {
    backgroundColor: '#0A0A0A',
    border: '1px solid #2E2E2E',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.85rem',
    color: '#A3A3A3',
  },
  clockBox: {
    backgroundColor: '#0A0A0A',
    border: '1px solid #2E2E2E',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontFamily: 'monospace',
    color: '#FFFFFF',
  },
  coreStatusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    border: '1px solid',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
  },
  onlineDot: { width: '6px', height: '6px', borderRadius: '50%' },
  operatorBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    backgroundColor: '#0A0A0A',
    border: '1px solid #2E2E2E',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.8rem',
  },
  roleTag: {
    fontSize: '0.65rem',
    backgroundColor: '#FF6600',
    color: '#FFFFFF',
    padding: '0.1rem 0.3rem',
    borderRadius: '3px',
    fontWeight: 700,
  },
  logoutButton: {
    backgroundColor: 'transparent',
    border: '1px solid #FF6600',
    color: '#FF6600',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  navTabs: {
    display: 'flex',
    gap: '0.5rem',
    padding: '1rem 2rem 0 2rem',
    backgroundColor: '#141414',
    borderBottom: '1px solid #2E2E2E',
  },
  tabButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#A3A3A3',
    padding: '0.75rem 1.25rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
  },
  tabActive: {
    color: '#FF6600',
    borderBottom: '2px solid #FF6600',
    backgroundColor: 'rgba(255, 102, 0, 0.05)',
  },
  tabBadge: {
    backgroundColor: '#FF6600',
    color: '#FFFFFF',
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '0.05rem 0.4rem',
    borderRadius: '10px',
  },
  mainContent: { padding: '2rem', flex: 1, overflowY: 'auto' },
  trackInfoBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' },
  trackTitle: { fontSize: '0.85rem', fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.05em' },
  trackSync: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: '#00FF66' },
  syncDot: { width: '6px', height: '6px', backgroundColor: '#00FF66', borderRadius: '50%' },
  routeDescription: { fontSize: '0.75rem', color: '#A3A3A3', marginBottom: '1rem' },
  searchRow: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', maxWidth: '420px' },
  searchInput: {
    flex: 1,
    backgroundColor: '#141414',
    border: '1px solid #2E2E2E',
    borderRadius: '8px',
    padding: '0.55rem 0.75rem',
    color: '#FFFFFF',
    fontSize: '0.8rem',
    outline: 'none',
  },
  searchClear: {
    backgroundColor: 'transparent',
    border: '1px solid #2E2E2E',
    color: '#A3A3A3',
    borderRadius: '8px',
    width: '36px',
    cursor: 'pointer',
  },
  railwayContainer: {
    position: 'relative',
    backgroundColor: '#141414',
    border: '1px solid #2E2E2E',
    borderRadius: '10px',
    padding: '2rem 1rem',
    overflowX: 'auto',
    marginBottom: '1rem',
  },
  railTrackLine: {
    position: 'absolute',
    top: '55%',
    left: '2rem',
    right: '2rem',
    height: '4px',
    backgroundColor: '#2E2E2E',
    zIndex: 1,
  },
  stationsScroll: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minWidth: '1500px',
    position: 'relative',
    zIndex: 2,
    padding: '0 1rem',
    gap: '0.5rem',
  },
  stationNode: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  trainTag: {
    position: 'absolute',
    top: '-32px',
    backgroundColor: '#FF6600',
    color: '#FFFFFF',
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '0.2rem 0.4rem',
    borderRadius: '4px',
    whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(255, 102, 0, 0.4)',
  },
  stationCircle: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: '0.5rem',
  },
  stationName: { fontSize: '0.7rem', textAlign: 'center', maxWidth: '95px', lineHeight: 1.2 },
  stationCode: { fontSize: '0.6rem', color: '#666666', fontFamily: 'monospace', marginTop: '0.15rem' },
  stationDetailPanel: {
    backgroundColor: '#141414',
    border: '1px solid #FF6600',
    borderRadius: '10px',
    padding: '1.25rem',
    marginBottom: '1rem',
    fontSize: '0.8rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  stationDetailHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #2E2E2E',
    paddingBottom: '0.5rem',
  },
  stationDetailClose: {
    background: 'transparent',
    border: 'none',
    color: '#A3A3A3',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  stationGridInfo: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '0.5rem 1rem',
  },
  stationDetailRow: { display: 'flex', justifyContent: 'space-between', color: '#A3A3A3' },
  actionToolbar: {
    marginTop: '0.5rem',
    borderTop: '1px solid #2E2E2E',
    paddingTop: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  actionLabel: { fontSize: '0.75rem', fontWeight: 700, color: '#FFFFFF' },
  actionButtons: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  actionBtnDanger: {
    backgroundColor: 'rgba(255, 0, 0, 0.15)',
    border: '1px solid #FF0000',
    color: '#FF0000',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  actionBtnWarning: {
    backgroundColor: 'rgba(255, 102, 0, 0.15)',
    border: '1px solid #FF6600',
    color: '#FF6600',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  actionBtnNormal: {
    backgroundColor: 'rgba(0, 255, 102, 0.15)',
    border: '1px solid #00FF66',
    color: '#00FF66',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  historyPanel: {
    backgroundColor: '#141414',
    border: '1px solid #2E2E2E',
    borderRadius: '10px',
    padding: '1rem 1.25rem',
  },
  historyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#FFFFFF',
    marginBottom: '0.6rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #2E2E2E',
  },
  historyCount: { color: '#A3A3A3', fontWeight: 500 },
  historyList: { display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '160px', overflowY: 'auto' },
  historyItem: {
    display: 'flex',
    gap: '0.75rem',
    fontSize: '0.75rem',
    color: '#A3A3A3',
  },
  historyTime: { fontFamily: 'monospace', color: '#FF6600', flexShrink: 0 },
  emptyState: { fontSize: '0.75rem', color: '#A3A3A3', textAlign: 'center', padding: '0.5rem 0' },
};