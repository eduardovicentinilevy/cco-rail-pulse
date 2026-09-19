// frontend/src/components/CCODashboard.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { wsService } from '../services/websocket.service';
import { api, ApiError } from '../services/api';

import type {
  AlarmEvent,
  AlarmLevel,
  OperationalCommand,
  OperatorSession,
  Station,
  StationStatus,
  Train,
} from '../types';
import { Header } from './layout/Header';
import type { ConnectionStatus } from './layout/Header';
import { Sidebar } from './layout/Sidebar';
import type { NavGroup } from './layout/Sidebar';
import { TrackSchematic } from './dashboard/TrackSchematic';
import { LineMap } from './dashboard/LineMap';
import { StationsGrid } from './dashboard/StationsGrid';
import { SelectedStationPanel } from './dashboard/SelectedStationPanel';
import { AlarmFeed } from './dashboard/AlarmFeed';
import { AuditLogsView } from './reports/AuditLogsView';
import { OverviewView } from './views/OverviewView';
import { EnergyView } from './views/EnergyView';
import { AnalyticsReportsView } from './views/AnalyticsReportsView';
import { AssetMaintenanceView } from './views/AssetMaintenanceView';
import { TimetableDispatchView } from './views/TimetableDispatchView';
import { IncidentsView } from './views/IncidentsView';
import { AlarmsView } from './views/AlarmsView';
import { OccupancyView } from './views/OccupancyView';
import { CamerasView } from './views/CamerasView';
import { CommunicationsView } from './views/CommunicationsView';
import { ProceduresView } from './views/ProceduresView';
import { TeamView } from './views/TeamView';
import { HistoryView } from './views/HistoryView';
import { ShiftHandoverView } from './views/ShiftHandoverView';
import { SystemStatusView } from './views/SystemStatusView';
import { SettingsView } from './views/SettingsView';
import { EmptyState } from './common/EmptyState';
import { ToastStack } from './common/ToastStack';
import type { Toast, ToastType } from './common/ToastStack';
import { ConfirmDialog } from './common/ConfirmDialog';
import type { ConfirmRequest } from './common/ConfirmDialog';
import { CommandPalette } from './common/CommandPalette';
import type { PaletteAction } from './common/CommandPalette';
import { useCriticalAlerts } from '../hooks/useCriticalAlerts';
import type { VoltageSample } from './TSSChartWidget';
import { formatTime } from '../lib/format';

interface CCODashboardProps {
  session: OperatorSession;
  onUpdateAvatar: (url: string) => Promise<void>;
  onExpireSession: (reason: string) => void;
  onLogout: () => void;
}

type TabKey =
  | 'overview'
  | 'ats'
  | 'incidents'
  | 'alarms'
  | 'occupancy'
  | 'cameras'
  | 'energy'
  | 'history'
  | 'assets'
  | 'analytics'
  | 'timetable'
  | 'handover'
  | 'comms'
  | 'procedures'
  | 'team'
  | 'status'
  | 'settings';

/** Ordem da navegação — também define a ordem dos atalhos numéricos (1–9 e 0, até a décima seção). */
const NAV_ORDER: readonly TabKey[] = [
  'overview',
  'ats',
  'incidents',
  'energy',
  'history',
  'assets',
  'analytics',
  'timetable',
  'handover',
  'team',
  'status',
  'settings',
  'alarms',
  'comms',
  'procedures',
  'occupancy',
  'cameras',
];

const NAV_GROUPS: ReadonlyArray<NavGroup<TabKey>> = [
  {
    label: 'Supervisão',
    items: [
      { key: 'overview', label: 'Painel executivo', icon: '◉' },
      { key: 'ats', label: 'Malha ATS', icon: '⌖' },
      { key: 'incidents', label: 'Ocorrências', icon: '⚠' },
      { key: 'alarms', label: 'Central de Alarmes', icon: '◍' },
      { key: 'occupancy', label: 'Ocupação', icon: '◐' },
      { key: 'cameras', label: 'CFTV', icon: '◙' },
    ],
  },
  {
    label: 'Energia & ativos',
    items: [
      { key: 'energy', label: 'Telemetria TSS', icon: '⚡' },
      { key: 'history', label: 'Série histórica', icon: '◫' },
      { key: 'assets', label: 'Saúde de ativos', icon: '⚙' },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { key: 'analytics', label: 'Relatórios & KPIs', icon: '◧' },
      { key: 'timetable', label: 'Escala & partidas', icon: '◔' },
      { key: 'handover', label: 'Passagem de turno', icon: '⇄' },
      { key: 'comms', label: 'Comunicações', icon: '☏' },
      { key: 'procedures', label: 'Procedimentos', icon: '▤' },
      { key: 'team', label: 'Equipe', icon: '⬡' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { key: 'status', label: 'Status do sistema', icon: '◈' },
      { key: 'settings', label: 'Configurações', icon: '⚑' },
    ],
  },
];

const STATUS_FILTERS: ReadonlyArray<{ key: StationStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'Todas' },
  { key: 'CRÍTICO', label: 'Críticas' },
  { key: 'ATENÇÃO', label: 'Atenção' },
  { key: 'NORMAL', label: 'Normais' },
];

const MAX_ALARMS = 60;
const MAX_HISTORY_SAMPLES = 40;
const TOAST_TTL_MS = 4500;

export const CCODashboard: React.FC<CCODashboardProps> = ({
  session,
  onUpdateAvatar,
  onExpireSession,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  // A malha chega inteira da API; até lá não há catálogo local que a substitua.
  const [stations, setStations] = useState<Station[]>([]);
  const [trains, setTrains] = useState<Train[]>([]);
  const [history, setHistory] = useState<VoltageSample[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StationStatus | 'ALL'>('ALL');
  const [alarms, setAlarms] = useState<AlarmEvent[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  /** Incrementado a cada evento `incident:changed` — sinaliza recarga à aba de ocorrências. */
  const [incidentRefresh, setIncidentRefresh] = useState(0);
  const [openIncidents, setOpenIncidents] = useState(0);
  /** Incrementado a cada `alert:critical` — sinaliza recarga à Central de Alarmes. */
  const [alarmRefresh, setAlarmRefresh] = useState(0);
  const [pendingAlarms, setPendingAlarms] = useState(0);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [atsView, setAtsView] = useState<'schematic' | 'map'>('schematic');

  const [shiftStartedAt] = useState(() => Date.now());
  const alerts = useCriticalAlerts();
  const { notify: notifyCritical } = alerts;
  const nextAlarmId = useRef(1);
  const toastTimers = useRef(new Map<string, number>());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Indefinido enquanto o catálogo não chega: nenhuma estação é "a primeira"
  // antes de saber qual é a malha desta linha.
  const selectedStation = useMemo(
    () => stations.find((station) => station.code === selectedCode) ?? stations[0],
    [stations, selectedCode],
  ) as Station | undefined;

  const addAlarm = useCallback((stationCode: string, message: string, level: AlarmLevel) => {
    setAlarms((previous) =>
      [
        { id: `alarm-${nextAlarmId.current++}`, timestamp: formatTime(), stationCode, message, level },
        ...previous,
      ].slice(0, MAX_ALARMS),
    );
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      toastTimers.current.delete(id);
    }
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, type: ToastType) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((previous) => [...previous, { id, message, type }]);
      // O timer é rastreado para poder ser cancelado no unmount e no fechamento manual.
      toastTimers.current.set(id, window.setTimeout(() => dismissToast(id), TOAST_TTL_MS));
    },
    [dismissToast],
  );

  useEffect(() => {
    const timers = toastTimers.current;
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // Carga inicial via REST: o catálogo de estações e as composições persistidas.
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const [stationsPayload, trainsPayload] = await Promise.all([
          api.stations(session.token),
          api.trains(session.token),
        ]);
        if (cancelled) return;

        const catalog = stationsPayload.stations as unknown as Station[];
        setStations(catalog);
        // A estação em foco é a primeira da malha recebida, seja ela qual for.
        setSelectedCode((current) => (catalog.some((s) => s.code === current) ? current : (catalog[0]?.code ?? '')));
        setTrains(trainsPayload as unknown as Train[]);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.isAuthError) {
          onExpireSession('Sua sessão expirou. Autentique-se novamente para reassumir o turno.');
          return;
        }
        // Não há mais catálogo local para servir de reserva: sem a API o painel
        // não tem malha para desenhar, e precisa dizer isso em vez de fingir uma.
        addAlarm('CORE', 'Carga inicial via API indisponível — malha da linha não pôde ser carregada', 'CRITICAL');
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [session.token, addAlarm, onExpireSession]);

  // Conexão com o gateway de telemetria.
  useEffect(() => {
    const socket = wsService.connect(session.token);

    const handleConnect = () => {
      setConnectionStatus('online');
      addAlarm('CORE', 'Conexão estabelecida com o barramento de eventos do CCO', 'INFO');
    };

    const handleDisconnect = () => {
      setConnectionStatus('offline');
      addAlarm('CORE', 'Conexão com o Gateway perdida — tentando reconectar', 'WARNING');
    };

    const handleConnectError = (error: Error) => {
      setConnectionStatus('offline');
      // O gateway recusa o handshake quando o JWT expira: encerrar o turno é o correto.
      if (error.message === 'UNAUTHORIZED') {
        onExpireSession('Sua sessão expirou. Autentique-se novamente para reassumir o turno.');
      }
    };

    const handleTelemetryBatch = (batch: Array<{ currentStationCode: string; voltageKV: number; status: StationStatus }>) => {
      setStations((previous) => {
        const updates = new Map(batch.map((item) => [item.currentStationCode, item]));
        return previous.map((station) => {
          const update = updates.get(station.code);
          return update ? { ...station, voltageKV: update.voltageKV, status: update.status } : station;
        });
      });

      setHistory((previous) => {
        const readings: Record<string, number> = {};
        for (const item of batch) readings[item.currentStationCode] = item.voltageKV;
        return [...previous, { time: formatTime(), readings }].slice(-MAX_HISTORY_SAMPLES);
      });
    };

    const upsertTrain = (train: Train) =>
      setTrains((previous) => {
        const index = previous.findIndex((item) => item.trainId === train.trainId);
        if (index === -1) return [...previous, train];
        const next = [...previous];
        next[index] = train;
        return next;
      });

    const handleCriticalAlert = (alert: { message: string; severity?: AlarmLevel }) => {
      addAlarm('REDE', alert.message, alert.severity ?? 'INFO');
      setAlarmRefresh((value) => value + 1);
      if (alert.severity === 'CRITICAL') notifyCritical('Alerta crítico na malha', alert.message);
    };

    const handleIncidentChanged = (incident: {
      id: string;
      title: string;
      status: string;
      severity?: string;
    }) => {
      setIncidentRefresh((value) => value + 1);
      addAlarm(
        'OCORR',
        `Ocorrência #${incident.id} (${incident.title}) → ${incident.status.replace('_', ' ').toLowerCase()}`,
        incident.status === 'RESOLVIDA' ? 'INFO' : 'WARNING',
      );
      if (incident.severity === 'CRÍTICA' && incident.status !== 'RESOLVIDA') {
        notifyCritical(`Ocorrência crítica #${incident.id}`, incident.title);
      }
    };

    const handleCommandAck = (ack: { trainId: string; command: string; status: string; message?: string }) => {
      setPendingCommand(null);
      if (ack.status === 'EXECUTED') {
        addToast(`Comando "${ack.command}" executado em ${ack.trainId}.`, 'success');
      } else {
        addToast(ack.message ?? `Falha ao executar "${ack.command}" em ${ack.trainId}.`, 'error');
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('telemetry:batch', handleTelemetryBatch);
    socket.on('train:sync', setTrains);
    socket.on('train:updated', upsertTrain);
    socket.on('alert:critical', handleCriticalAlert);
    socket.on('incident:changed', handleIncidentChanged);
    socket.on('train:command:acknowledged', handleCommandAck);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('telemetry:batch', handleTelemetryBatch);
      socket.off('train:sync', setTrains);
      socket.off('train:updated', upsertTrain);
      socket.off('alert:critical', handleCriticalAlert);
      socket.off('incident:changed', handleIncidentChanged);
      socket.off('train:command:acknowledged', handleCommandAck);
    };
  }, [session.token, addAlarm, addToast, notifyCritical, onExpireSession]);

  // Contador de ocorrências abertas exibido no cabeçalho; recarrega a cada mudança.
  useEffect(() => {
    let cancelled = false;

    api
      .incidentStats(session.token)
      .then((stats) => {
        if (!cancelled) setOpenIncidents(stats.open + stats.inProgress);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [session.token, incidentRefresh]);

  // Contador de alarmes pendentes exibido no item de navegação; recarrega a cada novo alarme.
  useEffect(() => {
    let cancelled = false;

    api
      .alarmStats(session.token)
      .then((stats) => {
        if (!cancelled) setPendingAlarms(stats.unacknowledged);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [session.token, alarmRefresh]);

  const criticalAlarms = useMemo(
    () => alarms.filter((alarm) => alarm.level === 'CRITICAL' && !alarm.acknowledged).length,
    [alarms],
  );

  // O título da aba funciona como alerta periférico quando o painel está em segundo plano.
  useEffect(() => {
    document.title =
      criticalAlarms > 0 ? `(${criticalAlarms}) RailPulse CCO` : `RailPulse CCO — ${session.line.name}`;
  }, [criticalAlarms, session.line.name]);

  // Atalhos de teclado: 1–6 alternam abas, "/" foca a busca da malha.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('input, textarea, select') ?? false;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsPaletteOpen((open) => !open);
        return;
      }

      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        setActiveTab('ats');
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      if (isTyping || event.ctrlKey || event.metaKey || event.altKey) return;

      // 1–9 cobrem as nove primeiras seções; 0 alcança a décima.
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit)) return;

      const index = digit === 0 ? 9 : digit - 1;
      if (index < NAV_ORDER.length) setActiveTab(NAV_ORDER[index]);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectStation = useCallback((station: Station) => setSelectedCode(station.code), []);

  const handleSendCommand = useCallback(
    (trainId: string, command: OperationalCommand) => {
      if (!selectedStation) return;

      const delivered = wsService.sendCommand(trainId, command, selectedStation.code);
      if (!delivered) {
        addToast('Sem conexão com o Gateway — comando não enviado.', 'error');
        return;
      }
      setPendingCommand(command);
    },
    [addToast, selectedStation],
  );

  const handleInjectAlert = useCallback(() => {
    if (!selectedStation) return;

    addAlarm(
      selectedStation.code,
      `Ocorrência registrada manualmente em ${selectedStation.name} pelo operador ${session.operatorId}`,
      'WARNING',
    );
    addToast('Ocorrência registrada no feed de eventos.', 'info');
  }, [addAlarm, addToast, selectedStation, session.operatorId]);

  const handleAcknowledgeAlarm = useCallback((id: string) => {
    setAlarms((previous) => previous.map((alarm) => (alarm.id === id ? { ...alarm, acknowledged: true } : alarm)));
  }, []);

  const handleLogout = useCallback(() => {
    setConfirmRequest({
      title: 'Encerrar turno',
      message: 'Deseja encerrar o turno e sair do sistema? A sessão será registrada na trilha de auditoria.',
      tone: 'warning',
      confirmLabel: 'Encerrar turno',
      onConfirm: onLogout,
    });
  }, [onLogout]);

  const filteredStations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return stations.filter((station) => {
      const matchesStatus = statusFilter === 'ALL' || station.status === statusFilter;
      const matchesQuery =
        query.length === 0 ||
        station.name.toLowerCase().includes(query) ||
        station.code.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [stations, searchQuery, statusFilter]);

  const selectedStationTrains = useMemo(
    () => trains.filter((train) => train.currentStationCode === selectedStation?.code),
    [trains, selectedStation],
  );

  // Seções, estações e composições viram alvos navegáveis pela paleta.
  const paletteActions = useMemo<PaletteAction[]>(() => {
    const sections = NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => {
        // Só as dez primeiras seções têm atalho numérico (1–9 e 0); as demais
        // só são alcançáveis pela paleta ou pela barra lateral.
        const index = NAV_ORDER.indexOf(item.key);
        const digitHint = index < 9 ? `${index + 1}` : index === 9 ? '0' : undefined;

        return {
          id: `nav-${item.key}`,
          label: item.label,
          group: 'Seções',
          icon: item.icon,
          hint: digitHint,
          keywords: group.label,
          run: () => setActiveTab(item.key),
        };
      }),
    );

    const stationActions = stations.map((station) => ({
      id: `station-${station.code}`,
      label: `${station.code} — ${station.name}`,
      group: 'Estações',
      icon: '⌖',
      hint: `${station.voltageKV.toFixed(2)} kV`,
      keywords: `${station.substation} ${station.status}`,
      run: () => {
        setSelectedCode(station.code);
        setActiveTab('ats');
      },
    }));

    const trainActions = trains.map((train) => ({
      id: `train-${train.trainId}`,
      label: `${train.trainId} — ${train.speedKmH} km/h`,
      group: 'Composições',
      icon: '▭',
      hint: train.currentStationCode,
      keywords: train.status,
      run: () => {
        setSelectedCode(train.currentStationCode);
        setActiveTab('ats');
      },
    }));

    const commands: PaletteAction[] = [
      {
        id: 'action-audit',
        label: 'Abrir trilha de auditoria',
        group: 'Ações',
        icon: '☰',
        run: () => setIsAuditOpen(true),
      },
      {
        id: 'action-sound',
        label: alerts.preferences.sound ? 'Silenciar alertas sonoros' : 'Ativar alertas sonoros',
        group: 'Ações',
        icon: alerts.preferences.sound ? '🔇' : '🔔',
        run: alerts.toggleSound,
      },
      {
        id: 'action-print',
        label: 'Imprimir passagem de turno',
        group: 'Ações',
        icon: '⎙',
        run: () => {
          setActiveTab('handover');
          window.setTimeout(() => window.print(), 600);
        },
      },
    ];

    return [...sections, ...stationActions, ...trainActions, ...commands];
  }, [stations, trains, alerts.preferences.sound, alerts.toggleSound]);

  // O contador de ocorrências aparece no item de navegação correspondente.
  const navGroups = useMemo<ReadonlyArray<NavGroup<TabKey>>>(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.map((item) => {
          if (item.key === 'incidents') return { ...item, badge: openIncidents };
          if (item.key === 'alarms') return { ...item, badge: pendingAlarms };
          return item;
        }),
      })),
    [openIncidents, pendingAlarms],
  );

  return (
    <div className="rp-shell" data-collapsed={isNavCollapsed}>
      <Sidebar
        groups={navGroups}
        activeKey={activeTab}
        collapsed={isNavCollapsed}
        lineName={session.line.name}
        lineCode={session.line.code}
        onSelect={setActiveTab}
        onToggleCollapse={() => setIsNavCollapsed((value) => !value)}
        footer={
          <span className="rp-sidebar__meta">
            {session.name ?? session.operatorId}
            <br />
            Turno em curso
          </span>
        }
      />

      <div className="rp-content">
      <Header
        session={session}
        connectionStatus={connectionStatus}
        shiftStartedAt={shiftStartedAt}
        criticalAlarms={criticalAlarms}
        alerts={alerts}
        onOpenPalette={() => setIsPaletteOpen(true)}
        onUpdateAvatar={onUpdateAvatar}
        onOpenAuditLogs={() => setIsAuditOpen(true)}
        onReconnect={() => wsService.reconnect()}
        onLogout={handleLogout}
      />

      <main className="rp-main">
        {activeTab === 'overview' && (
          <OverviewView
            stations={stations}
            trains={trains}
            alarms={alarms}
            connectionStatus={connectionStatus}
            lineName={session.line.name}
            onNavigate={setActiveTab}
            onSelectStation={handleSelectStation}
          />
        )}

        {activeTab === 'ats' && (
          <div className="rp-stack rp-animate-in">
            <div className="rp-row rp-row--between">
              <h2 className="rp-section-title">Supervisão da malha tronco</h2>
              <div className="rp-segmented" role="group" aria-label="Forma de visualização da malha">
                <button
                  type="button"
                  className="rp-segmented__option"
                  aria-pressed={atsView === 'schematic'}
                  onClick={() => setAtsView('schematic')}
                >
                  Esquemático
                </button>
                <button
                  type="button"
                  className="rp-segmented__option"
                  aria-pressed={atsView === 'map'}
                  onClick={() => setAtsView('map')}
                >
                  Mapa da linha
                </button>
              </div>
            </div>

            {!selectedStation ? (
              <section className="rp-card">
                <EmptyState
                  title="Malha indisponível"
                  hint="A malha desta linha ainda não foi carregada. Verifique a conexão com o CCO."
                />
              </section>
            ) : atsView === 'schematic' ? (
              <TrackSchematic
                stations={stations}
                trains={trains}
                selectedStation={selectedStation}
                lineName={session.line.name}
                onSelectStation={handleSelectStation}
              />
            ) : (
              <section className="rp-card">
                <LineMap
                  stations={stations}
                  trains={trains}
                  selectedStation={selectedStation}
                  lineName={session.line.name}
                  onSelectStation={handleSelectStation}
                />
              </section>
            )}

            <div className="rp-row rp-row--between">
              <div className="rp-search">
                <span className="rp-search__icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  ref={searchInputRef}
                  className="rp-input"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar estação por nome ou código (atalho: /)"
                  aria-label="Buscar estação"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="rp-search__clear"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpar busca"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="rp-chip-row" role="group" aria-label="Filtrar estações por status">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    className="rp-chip"
                    aria-pressed={statusFilter === filter.key}
                    onClick={() => setStatusFilter(filter.key)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {selectedStation && (
              <div className="rp-ats">
                <StationsGrid
                  stations={filteredStations}
                  trains={trains}
                  totalStations={stations.length}
                  selectedStationCode={selectedStation.code}
                  onSelectStation={handleSelectStation}
                />

                <SelectedStationPanel
                  station={selectedStation}
                  trains={selectedStationTrains}
                  pendingCommand={pendingCommand}
                  onSendCommand={handleSendCommand}
                  onRequestConfirm={setConfirmRequest}
                  onInjectAlert={handleInjectAlert}
                />
              </div>
            )}

            <AlarmFeed alarms={alarms} onClear={() => setAlarms([])} onAcknowledge={handleAcknowledgeAlarm} />
          </div>
        )}

        {activeTab === 'incidents' && (
          <IncidentsView
            session={session}
            stations={stations}
            trains={trains}
            refreshToken={incidentRefresh}
            onNotify={addToast}
            onAuthError={onExpireSession}
          />
        )}

        {activeTab === 'alarms' && (
          <AlarmsView
            session={session}
            refreshToken={alarmRefresh}
            onNotify={addToast}
            onAuthError={onExpireSession}
            onAcknowledged={() => setAlarmRefresh((value) => value + 1)}
          />
        )}

        {activeTab === 'occupancy' && <OccupancyView stations={stations} />}
        {activeTab === 'cameras' && (
          <CamerasView session={session} stations={stations} onNotify={addToast} onAuthError={onExpireSession} />
        )}

        {activeTab === 'energy' && <EnergyView stations={stations} history={history} />}
        {activeTab === 'history' && (
          <HistoryView session={session} stations={stations} onAuthError={onExpireSession} />
        )}
        {activeTab === 'assets' && <AssetMaintenanceView stations={stations} />}
        {activeTab === 'analytics' && <AnalyticsReportsView stations={stations} trains={trains} alarms={alarms} />}
        {activeTab === 'timetable' && <TimetableDispatchView trains={trains} stations={stations} />}
        {activeTab === 'handover' && (
          <ShiftHandoverView session={session} shiftStartedAt={shiftStartedAt} onAuthError={onExpireSession} />
        )}
        {activeTab === 'comms' && (
          <CommunicationsView
            session={session}
            stations={stations}
            trains={trains}
            onNotify={addToast}
            onAuthError={onExpireSession}
          />
        )}
        {activeTab === 'procedures' && <ProceduresView session={session} onAuthError={onExpireSession} />}
        {activeTab === 'team' && (
          <TeamView
            session={session}
            onNotify={addToast}
            onRequestConfirm={setConfirmRequest}
            onAuthError={onExpireSession}
          />
        )}
        {activeTab === 'status' && (
          <SystemStatusView connectionStatus={connectionStatus} lineName={session.line.name} />
        )}
        {activeTab === 'settings' && <SettingsView session={session} alerts={alerts} onAuthError={onExpireSession} />}
        </main>
      </div>

      {isAuditOpen && (
        <AuditLogsView token={session.token} onClose={() => setIsAuditOpen(false)} onAuthError={onExpireSession} />
      )}

      {isPaletteOpen && <CommandPalette actions={paletteActions} onClose={() => setIsPaletteOpen(false)} />}

      {confirmRequest && <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};
