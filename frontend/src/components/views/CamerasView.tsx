// frontend/src/components/views/CamerasView.tsx
import React, { useMemo, useState } from 'react';
import type { OperatorSession, Station } from '../../types';
import { api, ApiError } from '../../services/api';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';

interface CamerasViewProps {
  session: OperatorSession;
  stations: Station[];
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
  onAuthError: (message: string) => void;
}

type CameraKind = 'PLAT' | 'ACS';

const CAMERA_LABELS: Record<CameraKind, string> = {
  PLAT: 'Plataforma',
  ACS: 'Acesso / mezanino',
};

interface Camera {
  id: string;
  stationCode: string;
  stationName: string;
  kind: CameraKind;
  online: boolean;
}

/** Hash determinístico (djb2) — cada câmera sempre cai no mesmo lado do sorteio. */
const hashString = (value: string): number => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return Math.abs(hash);
};

const BASE_OFFLINE_CHANCE = 0.06;
const DEGRADED_STATION_OFFLINE_CHANCE = 0.32;

export const CamerasView: React.FC<CamerasViewProps> = ({ session, stations, onNotify, onAuthError }) => {
  const [search, setSearch] = useState('');
  const [onlyOffline, setOnlyOffline] = useState(false);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [reportingId, setReportingId] = useState<string | null>(null);

  // Recalcula só quando o status de alguma estação muda de fato — evita "piscar" a cada leitura de telemetria.
  const statusFingerprint = stations.map((station) => `${station.code}:${station.status}`).join('|');

  const cameras = useMemo<Camera[]>(() => {
    const kinds: CameraKind[] = ['PLAT', 'ACS'];
    return stations.flatMap((station) =>
      kinds.map((kind) => {
        const id = `CAM-${station.code}-${kind}`;
        const chance = station.status === 'NORMAL' ? BASE_OFFLINE_CHANCE : DEGRADED_STATION_OFFLINE_CHANCE;
        const roll = (hashString(id) % 1000) / 1000;
        return {
          id,
          stationCode: station.code,
          stationName: station.name,
          kind,
          online: roll >= chance,
        };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFingerprint]);

  const filteredCameras = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cameras.filter((camera) => {
      const matchesQuery =
        query.length === 0 ||
        camera.stationCode.toLowerCase().includes(query) ||
        camera.stationName.toLowerCase().includes(query);
      const matchesOffline = !onlyOffline || !camera.online;
      return matchesQuery && matchesOffline;
    });
  }, [cameras, search, onlyOffline]);

  const camerasByStation = useMemo(() => {
    const map = new Map<string, Camera[]>();
    for (const camera of filteredCameras) {
      const list = map.get(camera.stationCode) ?? [];
      list.push(camera);
      map.set(camera.stationCode, list);
    }
    return map;
  }, [filteredCameras]);

  const totalCameras = cameras.length;
  const onlineCameras = cameras.filter((camera) => camera.online).length;
  const offlineCameras = totalCameras - onlineCameras;
  const coverage = totalCameras === 0 ? 100 : Math.round((onlineCameras / totalCameras) * 100);

  const handleReportFault = async (camera: Camera) => {
    setReportingId(camera.id);
    try {
      await api.createIncident(session.token, {
        title: `Falha de CFTV — câmera de ${CAMERA_LABELS[camera.kind].toLowerCase()} em ${camera.stationName}`,
        description: `Câmera ${camera.id} reportada como offline durante a supervisão de CFTV. Verificação de campo necessária.`,
        category: 'OUTROS',
        severity: 'MÉDIA',
        stationCode: camera.stationCode,
      });
      setReportedIds((previous) => new Set(previous).add(camera.id));
      onNotify(`Ocorrência aberta para a câmera ${camera.id}.`, 'success');
    } catch (err) {
      if (err instanceof ApiError && err.isAuthError) {
        onAuthError('Sua sessão expirou ao reportar a falha de câmera.');
        return;
      }
      onNotify(err instanceof Error ? err.message : 'Não foi possível abrir a ocorrência.', 'error');
    } finally {
      setReportingId(null);
    }
  };

  const kpis = [
    { label: 'Câmeras na malha', value: String(totalCameras), status: 'INFO', hint: '2 pontos por estação — plataforma e acesso' },
    { label: 'Online', value: String(onlineCameras), status: 'NORMAL', hint: 'Transmitindo normalmente' },
    { label: 'Offline', value: String(offlineCameras), status: offlineCameras > 0 ? 'ATENÇÃO' : 'NORMAL', hint: 'Aguardando verificação de campo' },
    { label: 'Cobertura', value: `${coverage}%`, status: coverage < 90 ? 'ATENÇÃO' : 'NORMAL', hint: 'Percentual de câmeras ativas' },
  ];

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Supervisão</span>
          <h2 className="rp-page-header__title">CFTV — supervisão de câmeras</h2>
          <p className="rp-page-header__subtitle">
            Status de cobertura por estação — reportar uma falha abre uma ocorrência formal para a manutenção
          </p>
        </div>
      </div>

      <div className="rp-grid rp-grid--kpi">
        {kpis.map((kpi) => (
          <article key={kpi.label} className="rp-metric" data-status={kpi.status}>
            <span className="rp-metric__label">{kpi.label}</span>
            <span className="rp-metric__value">{kpi.value}</span>
            <span className="rp-metric__hint">{kpi.hint}</span>
          </article>
        ))}
      </div>

      <section className="rp-card">
        <header className="rp-card__header">
          <div className="rp-search">
            <span className="rp-search__icon" aria-hidden="true">
              ⌕
            </span>
            <input
              className="rp-input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por estação…"
              aria-label="Buscar câmeras por estação"
            />
            {search && (
              <button type="button" className="rp-search__clear" onClick={() => setSearch('')} aria-label="Limpar busca">
                ✕
              </button>
            )}
          </div>

          <div className="rp-chip-row" role="group" aria-label="Filtrar câmeras">
            <button
              type="button"
              className="rp-chip"
              aria-pressed={!onlyOffline}
              onClick={() => setOnlyOffline(false)}
            >
              Todas
            </button>
            <button type="button" className="rp-chip" aria-pressed={onlyOffline} onClick={() => setOnlyOffline(true)}>
              Somente offline
            </button>
          </div>
        </header>

        {camerasByStation.size === 0 ? (
          <EmptyState icon="✅" title="Nenhuma câmera para os filtros atuais." />
        ) : (
          <div className="rp-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(18rem, 1fr))', gap: 'var(--sp-4)' }}>
            {Array.from(camerasByStation.entries()).map(([stationCode, stationCameras]) => (
              <article key={stationCode} className="rp-card rp-card--flush" style={{ padding: 'var(--sp-4)' }}>
                <div className="rp-row" style={{ marginBottom: 'var(--sp-3)' }}>
                  <span className="rp-badge rp-badge--code">{stationCode}</span>
                  <strong className="truncate">{stationCameras[0].stationName}</strong>
                </div>

                <div className="rp-stack rp-stack--tight">
                  {stationCameras.map((camera) => {
                    const isReported = reportedIds.has(camera.id);
                    return (
                      <div key={camera.id} className="rp-row rp-row--between">
                        <div>
                          <div className="mono" style={{ fontSize: 'var(--fs-xs)' }}>
                            {camera.id}
                          </div>
                          <span className="rp-hint">{CAMERA_LABELS[camera.kind]}</span>
                        </div>
                        <div className="rp-row" style={{ gap: 'var(--sp-2)' }}>
                          <StatusPill status={camera.online ? 'NORMAL' : 'CRÍTICO'} label={camera.online ? 'Online' : 'Offline'} />
                          {!camera.online &&
                            (isReported ? (
                              <span className="rp-hint">Reportado</span>
                            ) : (
                              <button
                                type="button"
                                className="rp-btn rp-btn--link"
                                disabled={reportingId === camera.id}
                                onClick={() => void handleReportFault(camera)}
                              >
                                {reportingId === camera.id ? 'Abrindo…' : 'Reportar falha'}
                              </button>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
