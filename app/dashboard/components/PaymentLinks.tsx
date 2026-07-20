'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PaymentLinks, γρήγοροι σύνδεσμοι είσπραξης/πληρωμής. ΔΕΝ γίνεται καμία
// επεξεργασία πληρωμής μέσα στο app· τα κουμπιά απλώς ανοίγουν τον πάροχο
// (Viva, e-banking τράπεζας, IRIS) σε νέα καρτέλα. Έτοιμο να δεχθεί μελλοντικά
// πραγματική ενσωμάτωση χωρίς αλλαγή UI.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { T } from '@/components/Theme';

interface LinkItem { label: string; sub: string; url: string; }

const COLLECT: LinkItem[] = [
  { label: 'Viva.com', sub: 'Αίτημα πληρωμής / POS', url: 'https://www.viva.com/el-gr/' },
  { label: 'IRIS Πληρωμές', sub: 'Άμεση μεταφορά (DIAS)', url: 'https://www.dias.com.gr' },
  { label: 'Stripe', sub: 'Διεθνείς πληρωμές', url: 'https://dashboard.stripe.com/' },
];

const BANKS: LinkItem[] = [
  { label: 'Εθνική (i-bank)', sub: 'e-banking', url: 'https://ibank.nbg.gr/' },
  { label: 'Πειραιώς (winbank)', sub: 'e-banking', url: 'https://www.winbank.gr/' },
  { label: 'Alpha Bank', sub: 'e-banking', url: 'https://www.alpha.gr/el/idiotes' },
  { label: 'Eurobank', sub: 'e-banking', url: 'https://ebanking.eurobank.gr/' },
  { label: 'Optima bank', sub: 'e-banking', url: 'https://www.optimabank.gr' },
  { label: 'CrediaBank', sub: 'e-banking', url: 'https://www.crediabank.com' },
  { label: 'Revolut', sub: 'e-banking', url: 'https://www.revolut.com' },
];

function LinkGrid({ items }: { items: LinkItem[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8 }}>
      {items.map(it => (
        <a key={it.label} href={it.url} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 12px', textDecoration: 'none' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{it.sub}</div>
          </div>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M7 17 17 7M7 7h10v10"/></svg>
        </a>
      ))}
    </div>
  );
}

export default function PaymentLinks() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Είσπραξη και Πληρωμές</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>Σύνδεσμοι σε Viva, IRIS, Stripe και e-banking.</div>
          </div>
        </div>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6"/></svg>
      </div>

      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 12, lineHeight: 1.5 }}>
            Δημιούργησε αίτημα είσπραξης ενοικίου ή πλήρωσε δαπάνες μέσω του παρόχου σου. Οι πληρωμές γίνονται απευθείας στον λογαριασμό σου.
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: T.font.sans, margin: '4px 0 8px' }}>Είσπραξη</div>
          <LinkGrid items={COLLECT} />
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: T.font.sans, margin: '16px 0 8px' }}>e-Banking Τράπεζας</div>
          <LinkGrid items={BANKS} />
        </div>
      )}
    </div>
  );
}
