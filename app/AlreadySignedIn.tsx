'use client'
import Link from 'next/link'

// ═══════════════════════════════════════════════════════════════════════════
// AlreadySignedIn — ευγενική κατάσταση όταν ο επισκέπτης είναι ήδη συνδεδεμένος
// και ανοίγει τη σελίδα Σύνδεσης/Εγγραφής. Αντί για απότομη ανακατεύθυνση, του
// δίνουμε επιλογή: μετάβαση στον πίνακα ή αποσύνδεση για άλλον/νέο λογαριασμό.
// ═══════════════════════════════════════════════════════════════════════════

export default function AlreadySignedIn({
  email, onSignOut, signingOut, mode,
}: {
  email: string; onSignOut: () => void; signingOut: boolean; mode: 'login' | 'signup'
}) {
  return (
    <div>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: 100, padding: '4px 12px', marginBottom: 18 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)' }} />
        <span style={{ fontSize: 11, color: 'var(--positive)', fontWeight: 700 }}>Ήδη συνδεδεμένος</span>
      </div>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: '0 0 8px' }}>
        Είσαι ήδη συνδεδεμένος
      </h2>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 28px' }}>
        Ο λογαριασμός <strong style={{ color: 'var(--text-primary)' }}>{email}</strong> είναι ήδη ενεργός σε αυτή τη συσκευή. Μπορείς να συνεχίσεις στον πίνακα ελέγχου{mode === 'signup'
          ? ' ή, αν θέλεις, να αποσυνδεθείς για να δημιουργήσεις νέο λογαριασμό'
          : ' ή να αποσυνδεθείς για να συνδεθείς με άλλον λογαριασμό'}.
      </p>

      <Link href="/dashboard" style={{ display: 'block', textAlign: 'center', padding: '13px', background: 'var(--accent)', borderRadius: 100, color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, textDecoration: 'none', letterSpacing: '-0.01em' }}>
        Μετάβαση στον πίνακα →
      </Link>

      <button onClick={onSignOut} disabled={signingOut} style={{ width: '100%', marginTop: 12, padding: '13px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: signingOut ? 'not-allowed' : 'pointer', opacity: signingOut ? 0.6 : 1, fontFamily: 'inherit' }}>
        {signingOut
          ? 'Αποσύνδεση…'
          : mode === 'signup' ? 'Αποσύνδεση & δημιουργία νέου λογαριασμού' : 'Αποσύνδεση & αλλαγή λογαριασμού'}
      </button>
    </div>
  )
}
