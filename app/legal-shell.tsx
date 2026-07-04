import Link from 'next/link';

// Κοινό «κέλυφος» για νομικές σελίδες (Πολιτική Απορρήτου, Όροι) — theme-aware.
export interface LegalSection { h: string; p: string[] }

export function LegalShell({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', minHeight: '100vh', fontFamily: "'Google Sans','Inter',sans-serif" }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 clamp(20px,5vw,40px)', height: 60, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>P</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Property OS</span>
          </Link>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: 'clamp(32px,6vw,64px) clamp(20px,5vw,40px)' }}>
        <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 8px' }}>{title}</h1>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 24px' }}>Τελευταία ενημέρωση: {updated}</p>
        <p style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 8px' }}>{intro}</p>

        {sections.map((s, i) => (
          <section key={i} style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', margin: '0 0 10px' }}>{i + 1}. {s.h}</h2>
            {s.p.map((para, j) => (
              <p key={j} style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 10px' }}>{para}</p>
            ))}
          </section>
        ))}

        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Πολιτική Απορρήτου</Link>
          <Link href="/terms" style={{ color: 'var(--accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>Όροι Χρήσης</Link>
          <Link href="/" style={{ color: 'var(--text-tertiary)', textDecoration: 'none', fontSize: 13 }}>← Αρχική</Link>
        </div>
      </main>
    </div>
  );
}
