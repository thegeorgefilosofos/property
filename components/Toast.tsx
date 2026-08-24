'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PROPERWISE — ο ΜΟΝΑΔΙΚΟΣ υποδοχέας toast.
// Το «γιατί» και το API ζουν στο components/toastBus.ts (χωρίς React), ώστε να
// μπορεί να καλεί `notify()` και κώδικας που δεν είναι component.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef } from 'react';
import { T, type Tone } from './tokens';
import { subscribeToasts, type ToastItem } from './toastBus';
import { CloseButton } from './Theme';

// Ξανα-εξάγονται εδώ ώστε ένα component να χρειάζεται μία μόνο εισαγωγή.
export { notify, notifyOk, notifyError, TOAST_MS } from './toastBus';
export type { ToastOptions } from './toastBus';

const DOT: Record<Tone, string> = {
  accent:   'var(--accent)',
  info:     'var(--info)',
  positive: 'var(--positive)',
  warning:  'var(--warning)',
  negative: 'var(--negative)',
  neutral:  'var(--text-tertiary)',
};

/**
 * Ο μοναδικός υποδοχέας. Μπαίνει ΜΙΑ φορά, ψηλά στο δέντρο.
 *
 * z-index 2000: πάνω από τα παράθυρα (1000) και από το συρτάρι κινητού (1500),
 * γιατί ένα toast που κρύβεται πίσω από modal είναι χειρότερο από καθόλου toast
 * — ο χρήστης νομίζει ότι η ενέργεια δεν έγινε και την επαναλαμβάνει.
 */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const push = (t: ToastItem) => {
      // Το πολύ τρία ταυτόχρονα: παραπάνω και η στοίβα σκεπάζει την οθόνη.
      setItems(prev => [...prev, t].slice(-3));
      if (t.duration && t.duration > 0) {
        timers.current.set(t.id, setTimeout(() => {
          setItems(prev => prev.filter(x => x.id !== t.id));
          timers.current.delete(t.id);
        }, t.duration));
      }
    };
    const unsubscribe = subscribeToasts(push);
    const running = timers.current;
    return () => {
      unsubscribe();
      running.forEach(clearTimeout);
      running.clear();
    };
  }, []);

  const dismiss = (id: number) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setItems(prev => prev.filter(x => x.id !== id));
  };

  // ΤΟ ΔΟΧΕΙΟ ΓΕΝΝΙΟΤΑΝ ΜΑΖΙ ΜΕ ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥ, ΑΡΑ ΔΕΝ ΑΚΟΥΓΟΤΑΝ ΠΟΤΕ.
  //
  // Το `if (!items.length) return null` καθόταν ΠΑΝΩ από το `aria-live`. Μια
  // ζωντανή περιοχή πρέπει να υπάρχει ΠΡΙΝ αλλάξει το περιεχόμενό της: όταν
  // εισάγεται η περιοχή και το κείμενο στο ίδιο καρέ, ο αναγνώστης οθόνης δεν
  // ανακοινώνει τίποτα. Και αυτό εδώ είναι το ΜΟΝΟ κανάλι ανακοίνωσης όλης της
  // εφαρμογής: κάθε «αποθηκεύτηκε», κάθε σφάλμα, κάθε «αντιγράφηκε» ήταν σιωπηλό.
  //
  // Δύο περιοχές, γιατί δεν είναι το ίδιο πράγμα: η επιβεβαίωση περιμένει τη
  // σειρά της (`polite`), το σφάλμα διακόπτει (`alert`). Και οι δύο υπάρχουν
  // πάντα, άδειες, από την πρώτη απόδοση.
  const errors = items.filter(t => t.tone === 'negative');

  return (
    <>
    {/* Η περιοχή του σφάλματος διακόπτει· η ήσυχη περιμένει. Και οι δύο
        υπάρχουν πάντα, άδειες, ώστε να έχουν τι να ανακοινώσουν όταν γεμίσουν. */}
    <div role="alert" aria-atomic="false" className="sr-only">
      {errors.map(t => <span key={t.id}>{t.text}</span>)}
    </div>
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed', left: '50%', bottom: 'var(--float-bottom)', transform: 'translateX(-50%)',
        zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 8, pointerEvents: 'none', maxWidth: 'min(92vw, 460px)',
      }}
    >
      {items.map(t => (
        <div
          key={t.id}
          style={{
            pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: T.radius.inner + 2, padding: '12px 18px',
            boxShadow: 'var(--elev-2)',
            fontFamily: T.font.sans, fontSize: 13, lineHeight: 1.45,
            color: 'var(--text-primary)', animation: 'po-toast-in 180ms ease-out',
          }}
        >
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: DOT[t.tone ?? 'neutral'], flexShrink: 0 }} />
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => { t.action!.onClick(); dismiss(t.id); }}
              style={{
                marginLeft: 4, background: 'none', border: 'none', padding: '2px 4px',
                color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 13,
                fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              }}
            >{t.action.label}</button>
          )}
          {(!t.duration || t.duration <= 0) && (
            <CloseButton onClose={() => dismiss(t.id)} style={{ marginLeft: 4, marginTop: -6, marginBottom: -6 }} />
          )}
        </div>
      ))}
    </div>
    </>
  );
}
