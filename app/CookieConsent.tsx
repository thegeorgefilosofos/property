'use client';

// Cookie consent — μόνο απαραίτητα cookies. Απλή ενημέρωση (GDPR/ePrivacy),
// εμφανίζεται μία φορά και θυμάται την αποδοχή σε localStorage.
import { useEffect, useState } from 'react';
import Link from 'next/link';

const KEY = 'pos-cookie-consent';

export default function CookieConsent() {
  const [show, setShow] = useState(false);
  useEffect(() => { try { if (!localStorage.getItem(KEY)) setShow(true); } catch {} }, []);
  if (!show) return null;
  const accept = () => { try { localStorage.setItem(KEY, '1'); } catch {} setShow(false); };

  return (
    <div style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 2000, maxWidth: 720, margin: '0 auto',
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 14, boxShadow: 'var(--shadow-lg)',
      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontFamily: "'Google Sans',sans-serif" }}>
      <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        Χρησιμοποιούμε μόνο <strong style={{ color: 'var(--text-primary)' }}>απαραίτητα cookies</strong> για τη λειτουργία (σύνδεση, προτίμηση θέματος). Δείτε την{' '}
        <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Πολιτική Απορρήτου</Link>.
      </div>
      <button onClick={accept} style={{ flexShrink: 0, height: 38, padding: '0 22px', borderRadius: 100, border: 'none',
        background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        Εντάξει
      </button>
    </div>
  );
}
