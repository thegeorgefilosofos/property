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

// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΙ ΟΤΑΝ Η ΜΝΗΜΗ ΔΕΝ ΕΙΝΑΙ ΝΑΙ/ΟΧΙ
// ─────────────────────────────────────────────────────────────────────────
// Οκτώ οθόνες διάβαζαν τον localStorage με το ίδιο λάθος μοτίβο: κατάσταση με
// προεπιλογή, effect που τη διορθώνει, δύο αποδόσεις σε κάθε φόρτωση. Το ίδιο
// που έλυσε το `useRememberedFlag` για τα ναι/όχι, μόνο που εδώ η τιμή είναι
// σύνολο, πίνακας ή αριθμός.
//
// ΤΟ ΠΑΓΙΔΕΥΜΕΝΟ ΣΗΜΕΙΟ: το `getSnapshot` ΠΡΕΠΕΙ να επιστρέφει την ΙΔΙΑ αναφορά
// όσο δεν αλλάζει η αποθηκευμένη τιμή. Ενα `new Set(JSON.parse(raw))` σε κάθε
// κλήση δίνει καινούριο αντικείμενο κάθε φορά και η React μπαίνει σε ατέρμονο
// βρόχο αποδόσεων. Το μνημόνιο κρατά το ΩΜΟ κείμενο δίπλα στην τιμή: όσο το
// κείμενο είναι το ίδιο, γυρίζει η ίδια αναφορά.
// ═══════════════════════════════════════════════════════════════════════════

const memo = new Map<string, { raw: string | null; value: unknown }>();

function readRaw(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function snapshot<T>(key: string, parse: (raw: string | null) => T): T {
  const raw = readRaw(key);
  const hit = memo.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  const value = parse(raw);
  memo.set(key, { raw, value });
  return value;
}

/**
 * Μια τιμή που θυμάται ο περιηγητής και ΔΕΝ είναι ναι/όχι.
 *
 * @param key       κλειδί στον localStorage, με πρόθεμα του προϊόντος
 * @param parse     από ωμό κείμενο (ή `null`) στην τιμή. Καλείται μόνο όταν αλλάξει.
 * @param serialize από την τιμή στο ωμό κείμενο που γράφεται
 * @param server    τι απαντά ο διακομιστής, όπου δεν υπάρχει localStorage.
 *                  ΣΤΑΘΕΡΗ αναφορά, αλλιώς ξανα-αποδίδει σε κάθε πέρασμα.
 */
export function useRemembered<T>(
  key: string,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string,
  server: T,
): [T, (next: T) => void] {
  const read = useCallback(() => snapshot(key, parse), [key, parse]);
  const value = useSyncExternalStore(subscribe, read, () => server);
  const set = useCallback((next: T) => {
    try { localStorage.setItem(key, serialize(next)); } catch { /* ό,τι δεν θυμάται, δεν χαλάει */ }
    memo.delete(key);
    listeners.forEach(l => l());
  }, [key, serialize]);
  return [value, set];
}
