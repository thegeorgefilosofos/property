'use client';
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΠΡΟΤΙΜΗΣΗ ΠΟΥ ΘΥΜΑΤΑΙ Ο ΠΕΡΙΗΓΗΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ `useSyncExternalStore` ΚΑΙ ΟΧΙ `useEffect` ΜΕ `setState`. Ο localStorage
// είναι εξωτερική πηγή δεδομένων, όχι κατάσταση της React. Το μοτίβο «ξεκινάω
// με ψέμα και το διορθώνω σε effect» κάνει ΔΥΟ αποδόσεις σε κάθε φόρτωση και ο
// μεταγλωττιστής της React το σημειώνει ως σφάλμα ακριβώς γι' αυτό.
//
// Ο διακομιστής απαντά πάντα «όχι» και ο περιηγητής απαντά με την αλήθεια, σε
// ΜΙΑ απόδοση και χωρίς ασυμφωνία ενυδάτωσης. Και επειδή ο ίδιος άνθρωπος
// μπορεί να έχει δύο καρτέλες ανοιχτές, η αλλαγή στη μία φτάνει στην άλλη.
//
// ΚΑΙ ΓΙΑΤΙ ΚΟΙΝΟ. Το ίδιο ιδίωμα υπάρχει ήδη γραμμένο μέσα στο CookieConsent,
// που όμως δεν κρατά ναι/όχι αλλά εγγραφή με έκδοση πολιτικής: δεν συγχωνεύεται
// χωρίς να γίνει το ένα από τα δύο πιο περίπλοκο απ' όσο χρειάζεται. Ο,τι
// κρατά σκέτο ναι/όχι έρχεται από εδώ και δεν ξαναγράφεται ανά οθόνη.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useSyncExternalStore } from 'react';

const ON = '1';
const listeners = new Set<() => void>();

function subscribe(l: () => void): () => void {
  listeners.add(l);
  if (typeof window !== 'undefined') window.addEventListener('storage', l);
  return () => {
    listeners.delete(l);
    if (typeof window !== 'undefined') window.removeEventListener('storage', l);
  };
}

/** Ο,τι δεν διαβάζεται είναι «όχι»: ιδιωτικό παράθυρο, σβησμένα δεδομένα, άρνηση. */
const read = (key: string): boolean => {
  try { return localStorage.getItem(key) === ON; } catch { return false; }
};

/**
 * Μια προτίμηση ναι/όχι που επιζεί της ανανέωσης.
 *
 * @param key Το κλειδί στον localStorage. Με πρόθεμα του προϊόντος, ώστε δύο
 *            οθόνες να μη διεκδικήσουν ποτέ το ίδιο όνομα.
 */
export function useRememberedFlag(key: string): [boolean, (next: boolean) => void] {
  const on = useSyncExternalStore(subscribe, () => read(key), () => false);
  const set = useCallback((next: boolean) => {
    try { localStorage.setItem(key, next ? ON : '0'); } catch { /* ό,τι δεν θυμάται, δεν χαλάει */ }
    listeners.forEach(l => l());
  }, [key]);
  return [on, set];
}
