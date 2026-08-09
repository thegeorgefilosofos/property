'use client'
import Link from 'next/link'

// ═══════════════════════════════════════════════════════════════════════════
// AlreadySignedIn, ευγενική κατάσταση όταν ο επισκέπτης είναι ήδη συνδεδεμένος
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
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 8px' }}>
        Έχεις ήδη συνδεθεί
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, margin: '0 0 28px' }}>
        Ο λογαριασμός <strong style={{ color: 'var(--text-primary)' }}>{email}</strong> είναι ενεργός σε αυτή τη συσκευή. Μπορείς να συνεχίσεις στον πίνακά σου{mode === 'signup'
          ? ' ή, αν θέλεις, να αποσυνδεθείς για να δημιουργήσεις νέο λογαριασμό'
          : ' ή να αποσυνδεθείς για να συνδεθείς με άλλον λογαριασμό'}.
      </p>

      <Link href="/dashboard" className="auth-cta" style={{ display: 'block', textAlign: 'center', padding: '12px', background: 'var(--accent)', borderRadius: 100, color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, textDecoration: 'none', letterSpacing: '-0.01em' }}>
        Άνοιξε τον πίνακά σου
      </Link>

      <button onClick={onSignOut} disabled={signingOut} className="auth-hov" style={{ width: '100%', marginTop: 12, padding: '12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: signingOut ? 'not-allowed' : 'pointer', opacity: signingOut ? 0.6 : 1, fontFamily: 'inherit' }}>
        {signingOut
          ? 'Αποσύνδεση…'
          : mode === 'signup' ? 'Αποσύνδεση και δημιουργία νέου λογαριασμού' : 'Αποσύνδεση και αλλαγή λογαριασμού'}
      </button>
    </div>
  )
}
