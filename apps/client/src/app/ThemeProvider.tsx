import { createContext, useContext, useLayoutEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { migrateColorScheme, type ColorScheme } from '../features/settings/model/preferenceMigration';

const STORAGE_KEY = 'lune:appearance';

function readColor(): ColorScheme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const color = migrateColorScheme(saved);
    if (saved !== color) {
      try {
        window.localStorage.setItem(STORAGE_KEY, color);
      } catch {
        // The migrated choice still applies for this session.
      }
    }
    return color;
  } catch {
    return 'dark';
  }
}

interface ColorSchemeContextValue {
  color: ColorScheme;
  setColor: (color: ColorScheme) => void;
}

const ColorSchemeContext = createContext<ColorSchemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [color, setColor] = useState<ColorScheme>(readColor);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.color = color;
    delete root.dataset.theme;
    try {
      window.localStorage.setItem(STORAGE_KEY, color);
    } catch {
      // The choice remains available for this session when storage is blocked.
    }
  }, [color]);

  return <ColorSchemeContext.Provider value={{ color, setColor }}>{children}</ColorSchemeContext.Provider>;
}

export function useColorScheme() {
  const context = useContext(ColorSchemeContext);
  if (!context) throw new Error('useColorScheme must be used inside ThemeProvider');
  return context;
}
