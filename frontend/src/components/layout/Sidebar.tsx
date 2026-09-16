// frontend/src/components/layout/Sidebar.tsx
import React from 'react';

export interface NavItem<T extends string> {
  key: T;
  label: string;
  icon: string;
  /** Contador exibido à direita do item (ex.: ocorrências em aberto). */
  badge?: number;
}

export interface NavGroup<T extends string> {
  label: string;
  items: ReadonlyArray<NavItem<T>>;
}

interface SidebarProps<T extends string> {
  groups: ReadonlyArray<NavGroup<T>>;
  activeKey: T;
  collapsed: boolean;
  /** Rodapé com a identificação do operador e do turno. */
  footer?: React.ReactNode;
  onSelect: (key: T) => void;
  onToggleCollapse: () => void;
}

/**
 * Navegação principal do console.
 *
 * Substitui a antiga barra de abas horizontal, que não comportava as nove seções.
 * Em telas estreitas o CSS converte a barra lateral em faixa horizontal rolável.
 */
export const Sidebar = <T extends string>({
  groups,
  activeKey,
  collapsed,
  footer,
  onSelect,
  onToggleCollapse,
}: SidebarProps<T>) => {
  const flatItems = groups.flatMap((group) => group.items);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const offset = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (offset === 0) return;

    event.preventDefault();
    const currentIndex = flatItems.findIndex((item) => item.key === activeKey);
    const next = flatItems[(currentIndex + offset + flatItems.length) % flatItems.length];
    onSelect(next.key);
  };

  return (
    <nav className="rp-sidebar" aria-label="Navegação principal" onKeyDown={handleKeyDown}>
      <div className="rp-sidebar__brand">
        <span className="rp-sidebar__mark" aria-hidden="true">
          L06
        </span>
        <span className="rp-sidebar__wordmark">
          <span className="rp-sidebar__name">RailPulse CCO</span>
          <span className="rp-sidebar__line">Linha 6-Laranja</span>
        </span>
      </div>

      {groups.map((group) => (
        <div key={group.label} className="rp-sidebar__group">
          <span className="rp-sidebar__group-label">{group.label}</span>
          {group.items.map((item) => {
            const isActive = item.key === activeKey;
            return (
              <button
                key={item.key}
                type="button"
                className="rp-nav-item"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelect(item.key)}
                title={item.label}
              >
                <span className="rp-nav-item__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="rp-nav-item__label">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="rp-nav-item__badge" aria-label={`${item.badge} em aberto`}>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      <div className="rp-sidebar__footer">
        {footer}
        <button
          type="button"
          className="rp-nav-item rp-sidebar__toggle"
          onClick={onToggleCollapse}
          aria-pressed={collapsed}
        >
          <span className="rp-nav-item__icon" aria-hidden="true">
            {collapsed ? '»' : '«'}
          </span>
          <span className="rp-nav-item__label">{collapsed ? 'Expandir' : 'Recolher'}</span>
        </button>
      </div>
    </nav>
  );
};
