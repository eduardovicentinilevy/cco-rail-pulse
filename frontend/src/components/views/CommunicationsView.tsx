// frontend/src/components/views/CommunicationsView.tsx
import React, { useCallback, useEffect, useState } from 'react';
import type { ChannelOption, Communication, CommunicationChannel, OperatorSession, Station, Train } from '../../types';
import { COMMUNICATION_DIRECTIONS } from '../../types';
import { api, ApiError } from '../../services/api';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useResource } from '../../hooks/useResource';
import { useAuthErrorHandler } from '../../hooks/useAuthErrorHandler';
import { downloadTextFile, formatDateTime, toCsv } from '../../lib/format';

interface CommunicationsViewProps {
  session: OperatorSession;
  stations: Station[];
  trains: Train[];
  onNotify: (message: string, type: 'success' | 'error' | 'info') => void;
  onAuthError: (message: string) => void;
}

const PAGE_SIZE = 20;

export const CommunicationsView: React.FC<CommunicationsViewProps> = ({
  session,
  stations,
  trains,
  onNotify,
  onAuthError,
}) => {
  const [offset, setOffset] = useState(0);
  const [channelFilter, setChannelFilter] = useState<CommunicationChannel | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [channels, setChannels] = useState<ChannelOption[]>([]);

  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => {
    let cancelled = false;
    api
      .communicationsMeta(session.token)
      .then((meta) => {
        if (!cancelled) setChannels(meta.channels as ChannelOption[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.token]);

  const load = useCallback(async () => {
    const page = await api.communications(session.token, {
      limit: PAGE_SIZE,
      offset,
      channel: channelFilter === 'ALL' ? undefined : channelFilter,
      search: debouncedSearch,
    });
    return { communications: page.items as Communication[], total: page.total };
  }, [session.token, offset, channelFilter, debouncedSearch]);

  const handleError = useAuthErrorHandler(onAuthError, 'consultar as comunicações');
  const { data, error, isLoading, reload } = useResource(
    `${offset}|${channelFilter}|${debouncedSearch}`,
    load,
    handleError,
  );

  const communications = data?.communications ?? [];
  const total = data?.total ?? 0;

  const channelLabel = useCallback(
    (value: string) => channels.find((option) => option.value === value)?.label ?? value,
    [channels],
  );

  const applyFilter = <T,>(setter: (value: T) => void, value: T) => {
    setter(value);
    setOffset(0);
  };

  const handleExport = () => {
    const csv = toCsv(
      ['ID', 'Canal', 'Sentido', 'Estação', 'Composição', 'Operador', 'Mensagem', 'Horário'],
      communications.map((item) => [
        item.id,
        channelLabel(item.channel),
        item.direction,
        item.stationCode ?? '—',
        item.trainId ?? '—',
        item.operatorId,
        item.message,
        formatDateTime(item.createdAt),
      ]),
    );
    downloadTextFile(`railpulse-comunicacoes-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Despacho</span>
          <h2 className="rp-page-header__title">Registro de comunicações</h2>
          <p className="rp-page-header__subtitle">
            Diário de bordo do CCO — contatos por rádio, telefone e presenciais com equipes de campo
          </p>
        </div>
        <div className="rp-row">
          <button type="button" className="rp-btn" onClick={handleExport} disabled={communications.length === 0}>
            Exportar CSV
          </button>
          <button type="button" className="rp-btn rp-btn--primary" onClick={() => setIsCreateOpen(true)}>
            + Registrar comunicação
          </button>
        </div>
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
              onChange={(event) => applyFilter(setSearch, event.target.value)}
              placeholder="Buscar por mensagem, estação ou composição…"
              aria-label="Buscar comunicações"
            />
            {search && (
              <button
                type="button"
                className="rp-search__clear"
                onClick={() => applyFilter(setSearch, '')}
                aria-label="Limpar busca"
              >
                ✕
              </button>
            )}
          </div>

          <div className="rp-chip-row" role="group" aria-label="Filtrar por canal">
            <span className="rp-chip-row__label">Canal</span>
            <button
              type="button"
              className="rp-chip"
              aria-pressed={channelFilter === 'ALL'}
              onClick={() => applyFilter(setChannelFilter, 'ALL')}
            >
              Todos
            </button>
            {channels.map((option) => (
              <button
                key={option.value}
                type="button"
                className="rp-chip"
                aria-pressed={channelFilter === option.value}
                onClick={() => applyFilter(setChannelFilter, option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        {isLoading ? (
          <div className="rp-stack rp-stack--tight" aria-busy="true">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="rp-skeleton" style={{ height: '2.75rem' }} />
            ))}
          </div>
        ) : error ? (
          <EmptyState icon="⚠" title="Não foi possível carregar as comunicações." hint={error} />
        ) : communications.length === 0 ? (
          <EmptyState
            icon="☏"
            title="Nenhuma comunicação para os filtros atuais."
            hint="Registre um contato por rádio, telefone ou presencial para iniciar o diário de bordo."
          />
        ) : (
          <div className="rp-table-wrap">
            <table className="rp-table">
              <caption className="sr-only">Comunicações registradas no Centro de Controle</caption>
              <thead>
                <tr>
                  <th scope="col">Horário</th>
                  <th scope="col">Canal</th>
                  <th scope="col">Sentido</th>
                  <th scope="col">Local</th>
                  <th scope="col">Operador</th>
                  <th scope="col">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {communications.map((item) => (
                  <tr key={item.id}>
                    <td className="mono text-muted">{formatDateTime(item.createdAt)}</td>
                    <td>{channelLabel(item.channel)}</td>
                    <td>
                      <span className="rp-badge rp-badge--code">
                        {item.direction === 'ENVIADA' ? '↑ Enviada' : '↓ Recebida'}
                      </span>
                    </td>
                    <td className="mono">
                      {item.stationCode ?? '—'}
                      {item.trainId ? ` · ${item.trainId}` : ''}
                    </td>
                    <td className="truncate">{item.operatorId}</td>
                    <td className="truncate">{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="rp-row rp-row--between" style={{ marginTop: 'var(--sp-4)' }}>
          <span className="rp-hint">
            {total} comunicação(ões) • página {page} de {totalPages}
          </span>
          <div className="rp-row">
            <button
              type="button"
              className="rp-btn"
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              disabled={offset === 0}
            >
              ← Anterior
            </button>
            <button
              type="button"
              className="rp-btn"
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
            >
              Próxima →
            </button>
          </div>
        </footer>
      </section>

      {isCreateOpen && (
        <CreateCommunicationModal
          session={session}
          stations={stations}
          trains={trains}
          channels={channels}
          onClose={() => setIsCreateOpen(false)}
          onCreated={() => {
            onNotify('Comunicação registrada.', 'success');
            setIsCreateOpen(false);
            reload();
          }}
          onAuthError={onAuthError}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

interface CreateCommunicationModalProps {
  session: OperatorSession;
  stations: Station[];
  trains: Train[];
  channels: ChannelOption[];
  onClose: () => void;
  onCreated: () => void;
  onAuthError: (message: string) => void;
}

const CreateCommunicationModal: React.FC<CreateCommunicationModalProps> = ({
  session,
  stations,
  trains,
  channels,
  onClose,
  onCreated,
  onAuthError,
}) => {
  const [channel, setChannel] = useState<string>('RADIO_TREM');
  const [direction, setDirection] = useState<string>('ENVIADA');
  const [stationCode, setStationCode] = useState('');
  const [trainId, setTrainId] = useState('');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      await api.createCommunication(session.token, {
        channel,
        direction,
        stationCode: stationCode || null,
        trainId: trainId || null,
        message,
      });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.isAuthError) {
        onAuthError('Sua sessão expirou ao registrar a comunicação.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Não foi possível registrar a comunicação.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title="Registrar comunicação"
      subtitle="Fica no diário de bordo do CCO, em nome do operador autenticado"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="rp-btn" onClick={onClose} disabled={isSaving}>
            Cancelar
          </button>
          <button type="submit" form="rp-communication-form" className="rp-btn rp-btn--primary" disabled={isSaving}>
            {isSaving && <span className="rp-spinner" aria-hidden="true" />}
            {isSaving ? 'Registrando…' : 'Registrar'}
          </button>
        </>
      }
    >
      <form id="rp-communication-form" className="rp-stack" onSubmit={handleSubmit} noValidate>
        <div className="rp-grid rp-grid--kpi">
          <div className="rp-field">
            <label className="rp-label" htmlFor="comm-channel">
              Canal
            </label>
            <select
              id="comm-channel"
              className="rp-input"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
            >
              {channels.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="comm-direction">
              Sentido
            </label>
            <select
              id="comm-direction"
              className="rp-input"
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
            >
              {COMMUNICATION_DIRECTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === 'ENVIADA' ? 'Enviada pelo CCO' : 'Recebida no CCO'}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="comm-station">
              Estação (opcional)
            </label>
            <select
              id="comm-station"
              className="rp-input"
              value={stationCode}
              onChange={(event) => setStationCode(event.target.value)}
            >
              <option value="">Não se aplica</option>
              {stations.map((station) => (
                <option key={station.code} value={station.code}>
                  {station.code} — {station.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rp-field">
            <label className="rp-label" htmlFor="comm-train">
              Composição (opcional)
            </label>
            <select
              id="comm-train"
              className="rp-input"
              value={trainId}
              onChange={(event) => setTrainId(event.target.value)}
            >
              <option value="">Não se aplica</option>
              {trains.map((train) => (
                <option key={train.trainId} value={train.trainId}>
                  {train.trainId} ({train.currentStationCode})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rp-field">
          <label className="rp-label" htmlFor="comm-message">
            Mensagem
          </label>
          <textarea
            id="comm-message"
            className="rp-input"
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ex: Confirmado com o maquinista do T-04 a restrição de velocidade no trecho FGO-SMA."
            maxLength={500}
            required
          />
          <span className="rp-hint">{message.trim().length}/500 caracteres (mínimo 5)</span>
        </div>

        {error && (
          <p className="rp-login__error" role="alert">
            <span aria-hidden="true">⚠</span>
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
};
