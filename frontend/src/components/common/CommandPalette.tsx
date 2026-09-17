// frontend/src/components/common/CommandPalette.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useModalBehavior } from '../../hooks/useModalBehavior';

export interface PaletteAction {
  id: string;
  label: string;
  /** Agrupamento exibido na lista (ex.: "Seções", "Estações"). */
  group: string;
  hint?: string;
  icon?: string;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  actions: PaletteAction[];
  onClose: () => void;
}

/** Pontuação simples por subsequência: casa "fgo" em "Freguesia do Ó". */
const score = (haystack: string, needle: string): number => {
  if (needle.length === 0) return 1;

  const text = haystack.toLowerCase();
  if (text.includes(needle)) return 100 - text.indexOf(needle);

  let index = 0;
  for (const char of needle) {
    index = text.indexOf(char, index);
    if (index === -1) return 0;
    index += 1;
  }
  return 1;
};

const MAX_RESULTS = 12;

/** Ordem fixa das seções na lista; grupos fora desta lista vão para o fim. */
const GROUP_ORDER = ['Seções', 'Ações', 'Estações', 'Composições'];

/**
 * Paleta de comandos (Ctrl/⌘ + K).
 *
 * Com nove seções, mais estações, composições e ocorrências, navegar só pela
 * barra lateral fica lento para quem opera por teclado.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({ actions, onClose }) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useModalBehavior<HTMLDivElement>(onClose);
  const listRef = useRef<HTMLUListElement>(null);

  /**
   * Resultados agrupados em ordem fixa de seção e, dentro de cada seção, por
   * pontuação. Cada grupo aparece uma única vez — intercalar grupos ao longo da
   * lista dificulta a leitura e duplicaria a chave de reconciliação do React.
   */
  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matches = actions
      .map((action) => ({ action, value: score(`${action.label} ${action.keywords ?? ''}`, needle) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => {
        const groupDelta = GROUP_ORDER.indexOf(a.action.group) - GROUP_ORDER.indexOf(b.action.group);
        return groupDelta !== 0 ? groupDelta : b.value - a.value;
      })
      .slice(0, MAX_RESULTS);

    const sections: Array<{ group: string; entries: Array<{ action: PaletteAction; index: number }> }> = [];

    matches.forEach(({ action }, index) => {
      const current = sections.at(-1);
      if (current?.group === action.group) current.entries.push({ action, index });
      else sections.push({ group: action.group, entries: [{ action, index }] });
    });

    return sections;
  }, [actions, query]);

  const results = useMemo(() => grouped.flatMap((section) => section.entries.map((entry) => entry.action)), [grouped]);

  // Uma nova busca sempre volta a seleção para o primeiro resultado.
  const clampedIndex = Math.min(activeIndex, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${clampedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [clampedIndex]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(1, results.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + Math.max(1, results.length)) % Math.max(1, results.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = results[clampedIndex];
      if (selected) {
        selected.run();
        onClose();
      }
    }
  };

  return (
    <div className="rp-overlay rp-overlay--top" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={containerRef} className="rp-palette" role="dialog" aria-modal="true" aria-label="Paleta de comandos">
        <div className="rp-palette__search">
          <span aria-hidden="true">⌕</span>
          <input
            className="rp-palette__input"
            type="text"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ir para seção, estação, composição…"
            aria-label="Buscar comando"
            aria-controls="rp-palette-results"
            autoFocus
          />
          <kbd className="rp-kbd">Esc</kbd>
        </div>

        {results.length === 0 ? (
          <p className="rp-empty" style={{ padding: 'var(--sp-6)' }}>
            Nenhum resultado para “{query}”.
          </p>
        ) : (
          <ul id="rp-palette-results" ref={listRef} className="rp-palette__list" role="listbox">
            {grouped.map(({ group, entries }) => (
              <React.Fragment key={group}>
                <li className="rp-palette__group">{group}</li>
                {entries.map(({ action, index }) => (
                  <li
                    key={action.id}
                    role="option"
                    aria-selected={index === clampedIndex}
                    data-index={index}
                    className="rp-palette__item"
                    // `mousemove`, e não `mouseenter`: com o cursor parado sobre a
                    // lista, re-renderizar dispararia `mouseenter` e roubaria a
                    // seleção de quem está navegando pelo teclado.
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => {
                      action.run();
                      onClose();
                    }}
                  >
                    <span className="rp-palette__icon" aria-hidden="true">
                      {action.icon ?? '›'}
                    </span>
                    <span className="rp-palette__label">{action.label}</span>
                    {action.hint && <span className="rp-palette__hint">{action.hint}</span>}
                  </li>
                ))}
              </React.Fragment>
            ))}
          </ul>
        )}

        <footer className="rp-palette__footer">
          <span>
            <kbd className="rp-kbd">↑</kbd>
            <kbd className="rp-kbd">↓</kbd> navegar
          </span>
          <span>
            <kbd className="rp-kbd">↵</kbd> abrir
          </span>
        </footer>
      </div>
    </div>
  );
};
