'use client';

// Ενημέρωση cookies (GDPR/ePrivacy). Χρησιμοποιούμε ΜΟΝΟ απολύτως απαραίτητα
// cookies λειτουργίας (συνεδρία σύνδεσης, προτίμηση θέματος), για τα οποία ο
// νόμος δεν απαιτεί συγκατάθεση, απαιτεί όμως σαφή ενημέρωση. Η αναγνώριση του
// χρήστη καταγράφεται με έκδοση πολιτικής και χρονοσήμανση, ώστε να υπάρχει
// αποδεικτικό και να ζητείται εκ νέου όταν η πολιτική αλλάξει ουσιωδώς.
import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { T } from '@/components/Theme';

const KEY = 'pos-cookie-consent';
// Συγχρονίζεται με την ημερομηνία «Τελευταία ενημέρωση» της Πολιτικής απορρήτου.
const POLICY_VERSION = '2026-08';

// ═══════════════════════════════════════════════════════════════════════════
// ΓΙΑΤΙ `useSyncExternalStore` ΚΑΙ ΟΧΙ `useEffect` ΜΕ `setState`
// ─────────────────────────────────────────────────────────────────────────
// Ο localStorage είναι εξωτερική πηγή δεδομένων, όχι κατάσταση της React. Το
// μοτίβο «ξεκινάω με ψέμα και το διορθώνω σε effect» κάνει ΔΥΟ αποδόσεις σε
// κάθε φόρτωση —μία με το πλαίσιο κρυμμένο και μία με αυτό ορατό— και ο
// μεταγλωττιστής της React το σημειώνει ως σφάλμα ακριβώς γι' αυτό.
//
// Εδώ ο διακομιστής απαντά «μην το δείξεις» και ο περιηγητής απαντά με την
// αλήθεια, σε ΜΙΑ απόδοση και χωρίς ασυμφωνία ενυδάτωσης. Και επειδή το
// `subscribe` ακούει το γεγονός `storage`, αν ο χρήστης το αποδεχτεί σε άλλη
// καρτέλα, το πλαίσιο κλείνει και εδώ.
// ═══════════════════════════════════════════════════════════════════════════

/** Άκυρη ή παλιότερης έκδοσης εγγραφή σημαίνει ότι ζητάμε ξανά αναγνώριση. */
function needsNotice(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return true;
    const rec = JSON.parse(raw);
    return !rec || rec.v !== POLICY_VERSION;
  } catch { return true; }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener('storage', l);
  return () => { listeners.delete(l); window.removeEventListener('storage', l); };
}

export default function CookieConsent() {
  const show = useSyncExternalStore(subscribe, needsNotice, () => false);
  if (!show) return null;
  const acknowledge = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ v: POLICY_VERSION, ts: new Date().toISOString() })); } catch { /* ignore */ }
    notify();
  };

  return (
    // ΔΕΝ ΕΙΝΑΙ ΔΙΑΛΟΓΟΣ ΠΟΥ ΔΕΣΜΕΥΕΙ. Δηλωνόταν `role="dialog"` χωρίς να
    // μετακινεί την εστίαση μέσα του και χωρίς να εμποδίζει τίποτα πίσω του —
    // δηλαδή υποσχόταν συμπεριφορά που δεν είχε, και ο αναγνώστης οθόνης
    // ανακοίνωνε «διάλογος» για κάτι που ο χρήστης μπορεί απλώς να προσπεράσει.
    // Ενημερωτική περιοχή με όνομα: ούτε λιγότερο, ούτε ψέματα.
    <div role="region" aria-label="Ενημέρωση για cookies" className="po-noprint" style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 2000, maxWidth: 720, margin: '0 auto',
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.card, boxShadow: 'var(--shadow-lg)',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontFamily: T.font.sans }}>
      {/* ΓΙΑΤΙ ΤΟΣΟ ΣΥΝΤΟΜΟ: το κείμενο ήταν τέσσερις σειρές σε desktop και έξι σε
          κινητό, οπότε το πλαίσιο σκέπαζε το προϊόν ακριβώς στην πρώτη οθόνη —
          δηλαδή το πρώτο πράγμα που έβλεπε ένας υποψήφιος πελάτης ήταν νομικό
          κείμενο πάνω από αυτό που ήρθε να δει. Η ουσία χωράει σε μία γραμμή· οι
          λεπτομέρειες ανήκουν στην Πολιτική απορρήτου, όπου τις ψάχνει όποιος
          τις θέλει. Καμία πληροφορία δεν χάθηκε: η δήλωση «μόνο απαραίτητα, καμία
          παρακολούθηση» είναι ακριβώς το ουσιώδες περιεχόμενο της προηγούμενης. */}
      <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Μόνο <strong style={{ color: 'var(--text-primary)' }}>απαραίτητα cookies</strong>. Καμία παρακολούθηση, καμία διαφήμιση.{' '}
        <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Απόρρητο</Link>
      </div>
      <button onClick={acknowledge} style={{ flexShrink: 0, height: T.h.md, padding: '0 22px', borderRadius: T.radius.pill, border: 'none',
        background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        Το κατάλαβα
      </button>
    </div>
  );
}
