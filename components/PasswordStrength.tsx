'use client'

// ═══════════════════════════════════════════════════════════════════════════
// PasswordStrength — μετρητής ισχύος + λίστα προϋποθέσεων κωδικού. Ένα κοινό,
// theme-aware component για κάθε φόρμα που ορίζει κωδικό (εγγραφή, επαναφορά,
// αλλαγή στις ρυθμίσεις). Στηρίζεται μόνο σε CSS variables, ώστε να δείχνει
// σωστά και στις auth σελίδες και μέσα στον πίνακα.
// ═══════════════════════════════════════════════════════════════════════════

import { checkPassword } from '@/lib/auth/password'

export default function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const pw = checkPassword(password)
  const barColor = pw.score <= 2 ? 'var(--negative)'
    : pw.score <= 4 ? 'var(--warning, #d0a000)'
    : 'var(--positive, var(--accent))'

  return (
    <div id={id} style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 3,
            background: i < pw.score ? barColor : 'var(--border-subtle)',
            transition: 'background .15s',
          }} />
        ))}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {pw.checks.map(c => (
          <li key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: c.ok ? 'var(--positive, var(--accent))' : 'var(--text-tertiary)' }}>
            <span aria-hidden="true" style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
              {c.ok
                ? <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                : <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)' }} />}
            </span>
            {c.label}
          </li>
        ))}
        {pw.common && (
          <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--negative)' }}>
            <span aria-hidden="true" style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </span>
            Πολύ κοινός κωδικός — διάλεξε κάτι πιο μοναδικό
          </li>
        )}
      </ul>
    </div>
  )
}
