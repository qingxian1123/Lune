import { createContext, useContext, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeId = 'moonlight' | 'daylight' | 'frosted';

const STORAGE_KEY = 'lune:appearance';

function isThemeId(value: unknown): value is ThemeId {
  return value === 'moonlight' || value === 'daylight' || value === 'frosted';
}

function readTheme(): ThemeId {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    // Keep the selection made before this appearance was named 悦动白昼.
    if (saved === 'apple-music') return 'daylight';
    return isThemeId(saved) ? saved : 'moonlight';
  } catch {
    return 'moonlight';
  }
}

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeId>(readTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Appearance remains available for this session when storage is blocked.
    }
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}
