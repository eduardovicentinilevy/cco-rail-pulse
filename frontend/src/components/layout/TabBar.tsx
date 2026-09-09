// frontend/src/components/layout/TabBar.tsx
import React from 'react';

export interface TabDefinition<T extends string> {
  key: T;
  label: string;
  icon: string;
}

interface TabBarProps<T extends string> {
  tabs: ReadonlyArray<TabDefinition<T>>;
  activeTab: T;
  onChange: (tab: T) => void;
}

/**
 * Barra de abas com navegação por setas (padrão WAI-ARIA Tabs) e atalho numérico
 * indicado em cada aba — operadores de CCO trabalham majoritariamente por teclado.
 */
export const TabBar = <T extends string>({ tabs, activeTab, onChange }: TabBarProps<T>) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (offset === 0) return;

    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.key === activeTab);
    const nextIndex = (currentIndex + offset + tabs.length) % tabs.length;
    onChange(tabs[nextIndex].key);
  };

  return (
    <nav className="rp-tabs" role="tablist" aria-label="Seções do painel" onKeyDown={handleKeyDown}>
      {tabs.map((tab, index) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className="rp-tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
            <span className="rp-tab__key" aria-hidden="true">
              {index + 1}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
