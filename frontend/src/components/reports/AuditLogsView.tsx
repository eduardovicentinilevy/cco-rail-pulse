// frontend/src/components/reports/AuditLogsView.tsx
import React, { useEffect, useState } from 'react';
import type { AuditLogEntry } from '../../types';
import { Modal } from '../common/Modal';
import { EmptyState } from '../common/EmptyState';
import { StatusPill } from '../common/StatusPill';
import { api, ApiError } from '../../services/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { downloadTextFile, formatDateTime, toCsv } from '../../lib/format';

interface AuditLogsViewProps {
  token: string;
  onClose: () => void;
  onAuthError: (message: string) => void;
}

const PAGE_SIZE = 25;

/** Resultado de uma consulta, marcado com a chave da requisição que o originou. */
interface AuditResult {
  key: string;
  items: AuditLogEntry[];
  total: number;
}

/** Normaliza o status do registro para a paleta de cores do design system. */
const statusTone = (status: string): string => {
  const normalized = status.toUpperCase();
  if (/FAIL|UNAUTHORIZED|CRITICAL|DENIED/.test(normalized)) return 'CRITICAL';
  if (/SUCCESS|EXECUTED/.test(normalized)) return 'NORMAL';
  return 'WARNING';
};

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ token, onClose, onAuthError }) => {
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  const debouncedSearch = useDebouncedValue(search, 350);
  const requestKey = `${offset}|${debouncedSearch}`;

  // O estado de carregamento é derivado: nem o resultado nem o erro correspondem
  // à consulta corrente. Evita um setState síncrono dentro do efeito.
  const isLoading = result?.key !== requestKey && failure?.key !== requestKey;
  const logs = result?.key === requestKey ? result.items : [];
  const total = result?.key === requestKey ? result.total : 0;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const page = await api.auditLogs(token, { limit: PAGE_SIZE, offset, search: debouncedSearch });
        if (cancelled) return;
        setResult({ key: requestKey, items: page.items as AuditLogEntry[], total: page.total });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.isAuthError) {
          onAuthError('Sua sessão expirou ao consultar a trilha de auditoria.');
          return;
        }
        setFailure({
          key: requestKey,
          message: error instanceof Error ? error.message : 'Falha ao buscar a trilha de auditoria.',
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token, offset, debouncedSearch, requestKey, onAuthError]);

  // Uma nova busca sempre reinicia a paginação (ajuste no handler, não em efeito).
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setOffset(0);
  };

  const handleExport = () => {
    const csv = toCsv(
      ['ID', 'Horário', 'Operador', 'Ação', 'Alvo', 'Status'],
      logs.map((log) => [log.id, formatDateTime(log.timestamp), log.operatorId ?? '—', log.action, log.target, log.status]),
    );
    downloadTextFile(`railpulse-auditoria-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Modal
      title="Trilha de auditoria e compliance SOC"
      subtitle="Registro imutável de comandos críticos e eventos operacionais"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="rp-hint" style={{ marginRight: 'auto' }}>
            {total} registro(s) • página {page} de {totalPages}
          </span>
          <button
            type="button"
            className="rp-btn"
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
            disabled={offset === 0 || isLoading}
          >
            ← Anterior
          </button>
          <button
            type="button"
            className="rp-btn"
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total || isLoading}
          >
            Próxima →
          </button>
        </>
      }
    >
      <div className="rp-row rp-row--between">
        <div className="rp-search">
          <span className="rp-search__icon" aria-hidden="true">
            ⌕
          </span>
          <input
            className="rp-input"
            type="search"
            value={search}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="Filtrar por operador, ação, alvo ou status…"
            aria-label="Filtrar trilha de auditoria"
          />
          {search && (
            <button type="button" className="rp-search__clear" onClick={() => handleSearchChange('')} aria-label="Limpar filtro">
              ✕
            </button>
          )}
        </div>

        <button type="button" className="rp-btn" onClick={handleExport} disabled={logs.length === 0}>
          Exportar página (CSV)
        </button>
      </div>

      {isLoading && (
        <div className="rp-stack rp-stack--tight" aria-busy="true" aria-live="polite">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="rp-skeleton" style={{ height: '2.5rem' }} />
          ))}
        </div>
      )}

      {!isLoading && failure?.key === requestKey && (
        <EmptyState icon="⚠" title="Não foi possível carregar os registros." hint={failure.message} />
      )}

      {!isLoading && failure?.key !== requestKey && logs.length === 0 && (
        <EmptyState
          icon="🗒"
          title={search ? 'Nenhum registro corresponde ao filtro.' : 'Nenhum evento de auditoria registrado ainda.'}
        />
      )}

      {!isLoading && logs.length > 0 && (
        <div className="rp-table-wrap" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          <table className="rp-table">
            <caption className="sr-only">Eventos registrados na trilha de auditoria</caption>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Horário</th>
                <th scope="col">Operador</th>
                <th scope="col">Ação executada</th>
                <th scope="col">Alvo</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="rp-table__accent">LOG-{log.id}</td>
                  <td className="mono text-muted">{formatDateTime(log.timestamp)}</td>
                  <td className="mono">{log.operatorId ?? '—'}</td>
                  <td>
                    <strong>{log.action}</strong>
                  </td>
                  <td className="truncate">{log.target}</td>
                  <td>
                    <StatusPill status={statusTone(log.status)} label={log.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};
