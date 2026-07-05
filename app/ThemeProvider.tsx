'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Theme = 'midnight' | 'obsidian' | 'violet';
type Mode  = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  mode:  Mode;
  setTheme: (t: Theme) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'midnight', mode: 'dark',
  setTheme: () => {}, toggleMode: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('midnight');
  const [mode,  setMode]       = useState<Mode>('dark');

  useEffect(() => {
    const t = (localStorage.getItem('pos_theme') as Theme) || 'midnight';
    const m = (localStorage.getItem('pos_mode')  as Mode)  || 'dark';
    setThemeState(t);
    setMode(m);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-mode',  mode);
    localStorage.setItem('pos_theme', theme);
    localStorage.setItem('pos_mode',  mode);
  }, [theme, mode]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleMode = () => setMode(m => m === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, mode, setTheme, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

export function ThemeSwitcher() {
  const { theme, mode, setTheme, toggleMode } = useTheme();

  const themes: { key: 'midnight'|'obsidian'|'violet'; color: string; label: string }[] = [
    { key: 'midnight', color: '#1a73e8', label: 'Google Blue' },
    { key: 'obsidian', color: '#00C49A', label: 'Obsidian & Teal'   },
    { key: 'violet',   color: '#8B5CF6', label: 'Violet Premium'    },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div className="theme-switcher">
        {themes.map(t => (
          <div
            key={t.key}
            className={`theme-dot theme-dot-${t.key[0]} ${theme === t.key ? 'active' : ''}`}
            style={{ background: t.color }}
            onClick={() => setTheme(t.key)}
            title={t.label}
          />
        ))}
      </div>
      <button
        className="mode-btn"
        onClick={toggleMode}
        title={mode === 'dark' ? 'Φωτεινό θέμα' : 'Σκοτεινό θέμα'}
      >
        {mode === 'dark' ? '☀' : '☾'}
      </button>
    </div>
  );
}