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

// Η αρχική τιμή διαβάζεται από το ΙΔΙΟ το DOM, που το έχει ήδη γράψει το script
// του app/layout.tsx πριν το πρώτο paint.
//
// ΓΙΑΤΙ ΟΧΙ useState('dark') ΚΑΙ ΑΝΑΓΝΩΣΗ ΣΕ useEffect, ΟΠΩΣ ΠΡΙΝ: το useEffect
// τρέχει ΜΕΤΑ το paint. Όποιος είχε διαλέξει φωτεινό έβλεπε τη σειρά
//   σωστό (από το script) → σκούρο (αρχική τιμή React) → φωτεινό (μετά το effect)
// δηλαδή ένα σκούρο αναβοσβήσιμο σε κάθε φόρτωση. Με lazy initializer η React
// ξεκινά ήδη συμφωνημένη με την οθόνη και δεν υπάρχει ενδιάμεση κατάσταση.
//
// Ο server δεν έχει DOM· εκεί επιστρέφει το προεπιλεγμένο σκούρο, που είναι και
// η βάση του :root στο globals.css, άρα το markup συμφωνεί με το πρώτο paint.
const readAttr = <V extends string>(attr: string, fallback: V, valid: readonly V[]): V => {
  if (typeof document === 'undefined') return fallback;
  const v = document.documentElement.getAttribute(attr) as V | null;
  return v && valid.includes(v) ? v : fallback;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    readAttr('data-theme', 'midnight', ['midnight', 'obsidian', 'violet'] as const));
  const [mode,  setMode]       = useState<Mode>(() =>
    readAttr('data-mode', 'dark', ['dark', 'light'] as const));

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

// ΣΗΜΕΙΩΣΗ: εδώ ζούσε και ένας ThemeSwitcher με τρεις χρωματικές παλέτες
// (midnight/obsidian/violet) κι ένα δεύτερο κουμπί εναλλαγής. Δεν τον απέδιδε
// καμία οθόνη — ήταν νεκρός κώδικας που όμως έδειχνε ότι υπάρχουν δύο τρόποι
// να αλλάξει το θέμα. Η εναλλαγή γίνεται από ΕΝΑ σημείο, τις Ρυθμίσεις, μέσω
// του ThemeToggle. Αν χρειαστεί ποτέ επιλογή παλέτας, το setTheme παραμένει
// διαθέσιμο από αυτό το context· δεν χρειάζεται δεύτερο χειριστήριο.