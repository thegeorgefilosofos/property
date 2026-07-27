'use client';

// Ήπια μηνιαία παρότρυνση για feedback: εμφανίζεται μόνο τις πρώτες μέρες του
// μήνα, μία φορά τον μήνα, και κλείνει εύκολα. Το CTA ανοίγει το feedback του
// βοηθού (event 'pos:open-feedback'). Χωρίς πίεση, χωρίς backend — η κατάσταση
// «είδα/έκλεισα» μένει τοπικά ανά μήνα.

import { useEffect, useState } from 'react';
import { T } from '@/components/Theme';

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const KEY = 'pos_feedback_nudge';

export default function MonthlyFeedbackNudge() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const now = new Date();
      const seen = localStorage.getItem(KEY) === monthKey(now);
      if (now.getDate() <= 5 && !seen) setShow(true);
    } catch { /* localStorage μη διαθέσιμο */ }
  }, []);

  if (!show) return null;

  const close = () => { try { localStorage.setItem(KEY, monthKey()); } catch { /* noop */ } setShow(false); };
  const give = () => { window.dispatchEvent(new Event('pos:open-feedback')); close(); };

  return (
    <div
      role="dialog"
      aria-label="Μηνιαία γνώμη"
      style={{
        position: 'fixed', left: 20, bottom: 20, zIndex: 60, width: 'min(340px, calc(100vw - 40px))',
        background: 'var(--bg-elevated, #fff)', border: '1px solid var(--border-default, #e7eaee)',
        borderRadius: 16, boxShadow: '0 12px 32px rgba(16,24,40,.14)', padding: '16px 16px 14px',
        fontFamily: T.font.sans, animation: 'posNudgeIn .28s ease both',
      }}
    >
      <style>{`@keyframes posNudgeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent, #1a73e8)' }}>Η γνώμη σου</div>
          <div style={{ fontSize: 14.5, fontWeight: 650, letterSpacing: '-.01em', color: 'var(--text-primary, #1f2327)', marginTop: 5 }}>Μια κουβέντα, μία φορά τον μήνα</div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary, #5b6169)', lineHeight: 1.5, margin: '6px 0 0' }}>
            Πες μας τη γνώμη σου για το Property OS και μπες στην κλήρωση για <b style={{ color: 'var(--text-primary, #1f2327)' }}>έναν χρόνο δωρεάν Επαγγελματία</b>. Ένα λεπτό φτάνει.
          </p>
        </div>
        <button onClick={close} aria-label="Κλείσιμο" style={{ flex: 'none', width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border-default, #e7eaee)', background: 'transparent', color: 'var(--text-tertiary, #98a0a8)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <button onClick={give} style={{ background: 'var(--accent, #1a73e8)', color: '#fff', border: 0, borderRadius: 100, padding: '8px 16px', fontSize: 12.5, fontWeight: 650, cursor: 'pointer', fontFamily: T.font.sans }}>Πες τη γνώμη σου</button>
        <button onClick={close} style={{ background: 'none', border: 0, color: 'var(--text-tertiary, #98a0a8)', fontSize: 12, cursor: 'pointer', fontFamily: T.font.sans }}>Άλλη φορά</button>
        <a href="/terms/klirosi" target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary, #98a0a8)', textDecoration: 'underline' }}>Όροι</a>
      </div>
    </div>
  );
}
