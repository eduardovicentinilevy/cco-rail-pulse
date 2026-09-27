// frontend/src/hooks/useTheme.ts
import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../config/env';

export type Theme = 'light' | 'dark';

const readStoredTheme = (): Theme | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.theme);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
};

const prefersDark = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;

export interface ThemeControls {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

/**
 * Preferência de tema (claro/escuro) do operador.
 *
 * Sem escolha salva, segue a preferência do sistema operacional no primeiro
 * acesso; a partir da primeira troca manual, a escolha do operador prevalece.
 */
export const useTheme = (): ThemeControls => {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? (prefersDark() ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      // Navegação privativa pode recusar a escrita; o tema vale só nesta sessão.
    }
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(() => setThemeState((current) => (current === 'light' ? 'dark' : 'light')), []);

  return { theme, toggleTheme, setTheme };
};
