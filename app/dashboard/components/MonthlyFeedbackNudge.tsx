'use client';

// Ήπια μηνιαία παρότρυνση για feedback: εμφανίζεται μόνο τις πρώτες μέρες του
// μήνα, μία φορά τον μήνα και κλείνει εύκολα. Το CTA ανοίγει το feedback του
// βοηθού (event 'pos:open-feedback'). Χωρίς πίεση, χωρίς backend — η κατάσταση
// «είδα/έκλεισα» μένει τοπικά ανά μήνα.

import { useSyncExternalStore } from 'react';
import { T, CloseButton } from '@/components/Theme';

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const KEY = 'pos_feedback_nudge';

// Ο localStorage είναι εξωτερική πηγή, όχι κατάσταση της React. Το μοτίβο
// «ξεκινάω κρυμμένος και εμφανίζομαι σε effect» κάνει δύο αποδόσεις σε κάθε
// φόρτωση και ο μεταγλωττιστής της React το σημειώνει ως σφάλμα. Ο διακομιστής
// απαντά «μην το δείξεις», ο περιηγητής απαντά με την αλήθεια, μία απόδοση.
function shouldNudge(): boolean {
  try {
    const now = new Date();
    return now.getDate() <= 5 && localStorage.getItem(KEY) !== monthKey(now);
  } catch { return false; }
}

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export default function MonthlyFeedbackNudge() {
  const show = useSyncExternalStore(subscribe, shouldNudge, () => false);

  if (!show) return null;

  const close = () => { try { localStorage.setItem(KEY, monthKey()); } catch { /* noop */ } listeners.forEach(l => l()); };
  const give = () => { window.dispatchEvent(new Event('pos:open-feedback')); close(); };

  return (
    <div
      role="dialog"
      aria-label="Μηνιαία γνώμη"
      style={{
        position: 'fixed', left: 20, bottom: 'var(--float-bottom)', zIndex: 'var(--float-z)',
        width: 'min(380px, calc(100vw - 40px))',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        borderRadius: T.radius.card, boxShadow: 'var(--shadow-xl)', padding: '15px 18px 15px',
        fontFamily: T.font.sans, animation: 'posNudgeIn .28s ease both',
      }}
    >
      <style>{`@keyframes posNudgeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>

      {/* ══ ΤΟ ΚΛΕΙΣΙΜΟ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗ ΡΟΗ ΤΟΥ ΚΕΙΜΕΝΟΥ ══════════════════════
          Καθόταν ως δεύτερο κελί ενός flex δίπλα στο κείμενο, δηλαδή έκοβε 44
          εικονοστοιχεία από ΚΑΘΕ γραμμή της παραγράφου — και από τις τρεις,
          όχι μόνο από την πρώτη που το ακουμπά. Μετρημένο στην οθόνη: η
          παράγραφος έσπαγε στο «για το / PROPERWISE» και άφηνε λευκό μισής
          λέξης σε κάθε δεξιά άκρη, ενώ κάτω δεξιά από το κουμπί υπήρχε άδειος
          χώρος που κανείς δεν χρησιμοποιούσε.

          Απόλυτη θέση στην πάνω δεξιά γωνία: το κείμενο τρέχει πέρα πέρα, το
          κουμπί κάθεται πάνω από το κενό της πρώτης γραμμής και η κάρτα
          διαβάζεται ως ένα κείμενο, όχι ως δύο στήλες. */}
      <div style={{ position: 'absolute', top: 10, right: 10 }}>
        <CloseButton onClose={close} style={{ border: '1px solid var(--border-default)' }} />
      </div>

      {/* Η επικεφαλίδα κρατά δεξιά περιθώριο όσο το κουμπί· μόνο αυτή, γιατί
          μόνο αυτή περνά από κάτω του. */}
      <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)', paddingRight: 40 }}>Η γνώμη σου</div>
      <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-.015em', color: 'var(--text-primary)', marginTop: 5, paddingRight: 40, textWrap: 'balance' as const }}>Μια κουβέντα, μία φορά τον μήνα</div>
      <p style={{ fontSize: 'var(--fs-base)', color: 'var(--text-secondary)', lineHeight: 1.55, margin: '7px 0 0' }}>
        Πες μας τη γνώμη σου για το PROPERWISE και μπες στην κλήρωση για <b style={{ color: 'var(--text-primary)', fontWeight: 650 }}>έναν χρόνο δωρεάν Επαγγελματία</b>. Ένα λεπτό φτάνει.
      </p>

      {/* ══ ΜΙΑ ΠΡΑΞΗ ΜΠΡΟΣΤΑ, ΜΙΑ ΠΙΣΩ, ΚΑΙ ΟΙ ΟΡΟΙ ΔΕΝ ΕΙΝΑΙ ΠΡΑΞΗ ══════════
          Τρία στοιχεία σε μία σειρά έμοιαζαν τριών ειδών επιλογή. Οι «Οροι»
          είναι ανάγνωση, όχι απόφαση: πέφτουν σε δική τους γραμμή, κάτω από
          μια λεπτή γραμμή, όπου ζουν οι νομικές λεπτομέρειες σε κάθε σοβαρή
          εφαρμογή πληρωμών. Πάνω μένουν δύο πράξεις με σαφή ιεραρχία. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <button onClick={give} style={{ flex: 1, height: T.h.lg, background: 'var(--accent)', color: 'var(--on-tone)', border: 0, borderRadius: T.radius.pill, padding: '0 16px', fontSize: 'var(--fs-base)', fontWeight: 650, cursor: 'pointer', fontFamily: T.font.sans }}>Πες τη γνώμη σου</button>
        <button onClick={close} style={{ height: T.h.lg, padding: '0 14px', background: 'none', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, color: 'var(--text-secondary)', fontSize: 'var(--fs-base)', cursor: 'pointer', fontFamily: T.font.sans }}>Άλλη φορά</button>
      </div>
      <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
        <a href="/terms#klirosi" target="_blank" rel="noreferrer" style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)', textDecoration: 'none', borderBottom: '1px solid var(--border-default)' }}>Όροι κλήρωσης</a>
      </div>
    </div>
  );
}
