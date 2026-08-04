import Link from 'next/link';
import { T } from '@/components/tokens';

// Κοινό «κέλυφος» για νομικές σελίδες (Πολιτική Απορρήτου, Όροι), theme-aware.
// Κάθε ενότητα: παράγραφοι (p), προαιρετική λίστα (list) και προαιρετική σημείωση (note).
export interface LegalSection { h: string; p?: string[]; list?: string[]; note?: string }

export function LegalShell({ title, updated, intro, sections, disclaimer }: {
  title: string; updated: string; intro: string; sections: LegalSection[]; disclaimer?: string;
}) {
  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: T.font.sans }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 clamp(20px,5vw,40px)', height: 60, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', color: 'var(--on-tone)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>P</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Property OS</span>
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: 'clamp(32px,6vw,64px) clamp(20px,5vw,40px)' }}>
        <h1 style={{ fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, letterSpacing: '-0.025em', margin: '0 0 8px' }}>{title}</h1>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 24px' }}>Τελευταία ενημέρωση: {updated}</p>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 8px' }}>{intro}</p>

        {/* Πίνακας περιεχομένων */}
        <nav aria-label="Περιεχόμενα" style={{ marginTop: 28, padding: '16px 20px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Περιεχόμενα</div>
          <ol style={{ margin: 0, paddingLeft: 18, columns: 2, columnGap: 28 }}>
            {sections.map((s, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.9, breakInside: 'avoid' }}>
                <a href={`#s${i + 1}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{s.h}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s, i) => (
          <section key={i} id={`s${i + 1}`} style={{ marginTop: 30, scrollMarginTop: 76 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 10px', color: 'var(--text-primary)' }}>{i + 1}. {s.h}</h2>
            {(s.p || []).map((para, j) => (
              <p key={j} style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75, margin: '0 0 10px' }}>{para}</p>
            ))}
            {s.list && (
              <ul style={{ margin: '2px 0 10px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {s.list.map((li, j) => (
                  <li key={j} style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{li}</li>
                ))}
              </ul>
            )}
            {s.note && (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.65, margin: '6px 0 0', padding: '10px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10 }}>{s.note}</p>
            )}
          </section>
        ))}

        {disclaimer && (
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.7, marginTop: 36, padding: '14px 16px', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: 10 }}>{disclaimer}</p>
        )}

        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/trust" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Ποιοι είμαστε</Link>
          <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Πολιτική Απορρήτου</Link>
          <Link href="/terms" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Όροι Χρήσης</Link>
          <Link href="/" style={{ color: 'var(--text-tertiary)', textDecoration: 'none', fontSize: 13 }}>← Αρχική</Link>
        </div>
      </main>
    </div>
  );
}
