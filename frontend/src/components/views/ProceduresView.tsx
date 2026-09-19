// frontend/src/components/views/ProceduresView.tsx
import React, { useCallback, useMemo, useState } from 'react';
import type { OperatorSession, Procedure, ProcedureCategory, ProcedureCategoryOption } from '../../types';
import { api } from '../../services/api';
import { EmptyState } from '../common/EmptyState';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useResource } from '../../hooks/useResource';
import { useAuthErrorHandler } from '../../hooks/useAuthErrorHandler';

interface ProceduresViewProps {
  session: OperatorSession;
  onAuthError: (message: string) => void;
}

export const ProceduresView: React.FC<ProceduresViewProps> = ({ session, onAuthError }) => {
  const [categoryFilter, setCategoryFilter] = useState<ProcedureCategory | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  const load = useCallback(async () => {
    const [meta, page] = await Promise.all([
      api.proceduresMeta(session.token),
      api.procedures(session.token, {
        category: categoryFilter === 'ALL' ? undefined : categoryFilter,
        search: debouncedSearch,
      }),
    ]);
    return {
      categories: meta.categories as ProcedureCategoryOption[],
      procedures: page.items as Procedure[],
    };
  }, [session.token, categoryFilter, debouncedSearch]);

  const handleError = useAuthErrorHandler(onAuthError, 'consultar os procedimentos operacionais');
  const { data, error, isLoading } = useResource(`${categoryFilter}|${debouncedSearch}`, load, handleError);

  const categories = data?.categories ?? [];
  const procedures = data?.procedures ?? [];

  const categoryLabel = useMemo(
    () => new Map((data?.categories ?? []).map((option) => [option.value, option.label])),
    [data],
  );

  return (
    <div className="rp-stack rp-animate-in">
      <div className="rp-page-header">
        <div>
          <span className="rp-eyebrow">Referência operacional</span>
          <h2 className="rp-page-header__title">Procedimentos operacionais</h2>
          <p className="rp-page-header__subtitle">
            Consulta rápida de contingências — emergência, energia, sinalização e meteorologia
          </p>
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título ou resumo do procedimento…"
              aria-label="Buscar procedimentos"
            />
            {search && (
              <button
                type="button"
                className="rp-search__clear"
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
              >
                ✕
              </button>
            )}
          </div>

          <div className="rp-chip-row" role="group" aria-label="Filtrar por categoria">
            <button
              type="button"
              className="rp-chip"
              aria-pressed={categoryFilter === 'ALL'}
              onClick={() => setCategoryFilter('ALL')}
            >
              Todas
            </button>
            {categories.map((option) => (
              <button
                key={option.value}
                type="button"
                className="rp-chip"
                aria-pressed={categoryFilter === option.value}
                onClick={() => setCategoryFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        {isLoading ? (
          <div className="rp-stack rp-stack--tight" aria-busy="true">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="rp-skeleton" style={{ height: '3.5rem' }} />
            ))}
          </div>
        ) : error ? (
          <EmptyState icon="⚠" title="Não foi possível carregar os procedimentos." hint={error} />
        ) : procedures.length === 0 ? (
          <EmptyState icon="▤" title="Nenhum procedimento para os filtros atuais." />
        ) : (
          <ul className="rp-stack rp-stack--tight" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {procedures.map((procedure) => {
              const isExpanded = expandedId === procedure.id;
              return (
                <li key={procedure.id} className="rp-card rp-card--flush" style={{ padding: 'var(--sp-4) var(--sp-5)' }}>
                  <button
                    type="button"
                    className="rp-row rp-row--between"
                    style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedId(isExpanded ? null : procedure.id)}
                  >
                    <div style={{ textAlign: 'left' }}>
                      <div className="rp-row" style={{ marginBottom: 'var(--sp-1)' }}>
                        <span className="rp-badge rp-badge--code">
                          {categoryLabel.get(procedure.category) ?? procedure.category}
                        </span>
                        <strong>{procedure.title}</strong>
                      </div>
                      <span className="rp-hint">{procedure.summary}</span>
                    </div>
                    <span aria-hidden="true">{isExpanded ? '▲' : '▼'}</span>
                  </button>

                  {isExpanded && (
                    <ol className="rp-stack rp-stack--tight" style={{ marginTop: 'var(--sp-4)', paddingLeft: '1.25rem' }}>
                      {procedure.steps.map((step, index) => (
                        <li key={index} style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--uni-text-muted)' }}>
                          {step}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
