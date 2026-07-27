'use client';

// Ενημέρωση cookies (GDPR/ePrivacy). Χρησιμοποιούμε ΜΟΝΟ απολύτως απαραίτητα
// cookies λειτουργίας (συνεδρία σύνδεσης, προτίμηση θέματος), για τα οποία ο
// νόμος δεν απαιτεί συγκατάθεση, απαιτεί όμως σαφή ενημέρωση. Η αναγνώριση του
// χρήστη καταγράφεται με έκδοση πολιτικής και χρονοσήμανση, ώστε να υπάρχει
// αποδεικτικό και να ζητείται εκ νέου όταν η πολιτική αλλάξει ουσιωδώς.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { T } from '@/components/Theme';

const KEY = 'pos-cookie-consent';
// Συγχρονίζεται με την ημερομηνία «Τελευταία ενημέρωση» της Πολιτικής Απορρήτου.
const POLICY_VERSION = '2026-07';

export default function CookieConsent() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) { setShow(true); return; }
      // Παλαιότερη ή διαφορετική έκδοση πολιτικής → ζητάμε εκ νέου αναγνώριση.
      const rec = JSON.parse(raw);
      if (!rec || rec.v !== POLICY_VERSION) setShow(true);
    } catch { setShow(true); }
  }, []);
  if (!show) return null;
  const acknowledge = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ v: POLICY_VERSION, ts: new Date().toISOString() })); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div role="dialog" aria-label="Ενημέρωση για cookies" style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 2000, maxWidth: 720, margin: '0 auto',
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, boxShadow: 'var(--shadow-lg)',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontFamily: T.font.sans }}>
      <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        Χρησιμοποιούμε μόνο <strong style={{ color: 'var(--text-primary)' }}>απολύτως απαραίτητα cookies</strong> για τη λειτουργία της υπηρεσίας (σύνδεση, προτίμηση θέματος). Κανένα cookie διαφήμισης ή παρακολούθησης. Αναλυτικά στην{' '}
        <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Πολιτική Απορρήτου</Link>.
      </div>
      <button onClick={acknowledge} style={{ flexShrink: 0, height: 36, padding: '0 22px', borderRadius: 100, border: 'none',
        background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        Το κατάλαβα
      </button>
    </div>
  );
}
