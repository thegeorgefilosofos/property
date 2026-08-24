'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PWA — καταχώρηση του service worker και ήπια πρόσκληση εγκατάστασης.
//
// ΔΥΟ ΚΑΝΟΝΕΣ ΕΥΓΕΝΕΙΑΣ:
//  1. Δεν ζητάμε εγκατάσταση σε κάποιον που μόλις μπήκε. Η πρόσκληση εμφανίζεται
//     μόνο αφού ο χρήστης έχει ήδη περάσει λίγη ώρα μέσα (δεύτερη επίσκεψη+),
//     και μόνο στην εφαρμογή — ποτέ στη landing.
//  2. Ένα «όχι» σημαίνει όχι. Το απορριφθέν banner δεν ξαναεμφανίζεται για 60
//     ημέρες. Κανένα dark pattern, καμία επανάληψη.
//
// Ο browser δίνει το `beforeinstallprompt` μόνο όταν πληρούνται τα δικά του
// κριτήρια (HTTPS, manifest, service worker). Στο iOS δεν υπάρχει καθόλου —
// εκεί η εγκατάσταση γίνεται από το «Κοινή χρήση → Πρόσθεση στην αρχική οθόνη»,
// και το λέμε με λόγια αντί να δείχνουμε κουμπί που δεν κάνει τίποτα.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { T } from '@/components/tokens';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'po_pwa_dismissed_at';
const VISITS_KEY = 'po_pwa_visits';
const DISMISS_DAYS = 60;
const MIN_VISITS = 2;

export default function PwaProvider() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  // Το layout είναι ΕΝΑ για όλο το site, οπότε χωρίς αυτόν τον έλεγχο το banner
  // εμφανιζόταν και στη landing και — χειρότερα — στις σελίδες ενοικιαστή/λογιστή
  // με token, ζητώντας από τρίτους να εγκαταστήσουν εφαρμογή που δεν τους αφορά.
  const inApp = !!pathname && pathname.startsWith('/dashboard');

  // Καταχώρηση του service worker. Μόνο σε production: στο dev ο SW κρύβει
  // αλλαγές πίσω από cache και τρελαίνει το hot reload.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* δεν είναι κρίσιμο */ });
  }, []);

  useEffect(() => {
    let visits = 0;
    try {
      visits = Number(localStorage.getItem(VISITS_KEY) || '0') + 1;
      localStorage.setItem(VISITS_KEY, String(visits));
    } catch { /* private mode */ }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      // ΚΑΜΙΑ απόφαση εδώ για τη διαδρομή: το event πυροδοτείται μία φορά ανά
      // έγγραφο, συνήθως όσο ο χρήστης είναι ακόμη στη landing. Αν κόβαμε εδώ,
      // το banner δεν θα εμφανιζόταν ΠΟΤΕ στη φυσιολογική ροή landing → login →
      // dashboard, που είναι client-side πλοήγηση μέσα στο ίδιο έγγραφο.
      if (window.matchMedia('(display-mode: standalone)').matches) return;
      if (visits < MIN_VISITS) return;
      try {
        const at = Number(localStorage.getItem(DISMISS_KEY) || '0');
        if (at && Date.now() - at < DISMISS_DAYS * 86400000) return;
      } catch { /* private mode */ }
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const remember = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
  };

  const install = async () => {
    if (!deferred) return;
    setShow(false);
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // Άκυρο στο native παράθυρο = «όχι». Χωρίς αυτό, το banner ξαναεμφανιζόταν
    // στην επόμενη φόρτωση — ακριβώς η επανάληψη που υποσχεθήκαμε να μην κάνουμε.
    if (outcome === 'dismissed') remember();
    setDeferred(null);
  };

  const dismiss = () => { setShow(false); remember(); };

  if (!show || !inApp) return null;

  return (
    <div role="dialog" aria-label="Εγκατάσταση εφαρμογής"
      style={{ position: 'fixed', left: 16, right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom))', zIndex: 900, maxWidth: 420, margin: '0 auto', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.modal, boxShadow: 'var(--shadow-xl)', padding: 16, display: 'flex', gap: 13, alignItems: 'flex-start', fontFamily: T.font.sans }}>
      <img src="/icons/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>Βάλ’ το στην αρχική οθόνη</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
          Ανοίγει σαν εφαρμογή, χωρίς μπάρα διεύθυνσης. Χρήσιμο όταν φωτογραφίζεις έναν λογαριασμό εν κινήσει.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={install} style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Εγκατάσταση</button>
          <button onClick={dismiss} style={{ height: T.h.md, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Όχι τώρα</button>
        </div>
      </div>
    </div>
  );
}
