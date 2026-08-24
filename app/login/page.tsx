'use client'
import { T } from '@/components/Theme'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/supabase/lazy';
import Link from 'next/link'
import AlreadySignedIn from '../AlreadySignedIn'
import AuthAside from '../AuthAside'
import GoogleG from '../GoogleG'
import { BackLink } from '../BackLink'
import { SAY, failed } from '@/lib/core/dbError';

// ═══════════════════════════════════════════════════════════════════════════
// Σύνδεση, στα χρώματα του app (design tokens, theme-aware light/dark).
// Δύο στήλες σε desktop· σε κινητό το marketing panel κρύβεται (auth-* classes).
// ═══════════════════════════════════════════════════════════════════════════

/** Η ανταλλαγή του διακριτικού απέτυχε και μας έστειλε εδώ. */
const failedConfirm = () => {
  try { return new URLSearchParams(window.location.search).get('confirm') === 'failed' }
  catch { return false }
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [show, setShow] = useState(false)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  const trans = (m: string) =>
    /invalid login/i.test(m) ? 'Λάθος email ή κωδικός.'
    : /email not confirmed/i.test(m) ? 'Επιβεβαίωσε πρώτα το email σου από τον σύνδεσμο που σου στείλαμε.'
    : /rate limit|too many/i.test(m) ? SAY.tooManyTries
    : m

  useEffect(() => {
    // Ο πελάτης φορτώνεται μετά το πρώτο σχεδίασμα, οπότε το effect ξετυλίγεται
    // μέσα σε ασύγχρονη συνάρτηση: το ίδιο το effect ΔΕΝ επιτρέπεται να
    // επιστρέψει υπόσχεση, γιατί η React διαβάζει την επιστροφή ως καθαρισμό.
    void (async () => {
    const supabase = await authClient()
    supabase.auth.getUser().then(({ data }) => {
      setSessionEmail(data.user?.email ?? null)
      // Ο ΣΥΝΔΕΣΜΟΣ ΕΠΙΒΕΒΑΙΩΣΗΣ ΠΟΥ ΔΕΝ ΔΟΥΛΕΨΕ ΛΕΓΕΤΑΙ ΜΕ ΛΕΞΕΙΣ. Η
      // ανταλλαγή του διακριτικού (app/auth/callback) καταλήγει εδώ όταν
      // αποτύχει· χωρίς αυτό, όποιος μόλις πάτησε «Επιβεβαίωση» στο email του
      // έβλεπε γυμνή φόρμα εισόδου και κανένα ίχνος του τι πήγε στραβά.
      //
      // ΜΟΝΟ ΣΕ ΑΣΥΝΔΕΤΟ: αν η συνεδρία υπάρχει, ο σύνδεσμος έκανε τη δουλειά
      // του και δεν υπάρχει τίποτα να διορθωθεί.
      if (!data.user && failedConfirm()) {
        setError('Ο σύνδεσμος επιβεβαίωσης δεν ισχύει πια. Συνδέσου με τον κωδικό σου, ή ζήτησε νέο σύνδεσμο από την εγγραφή.')
      }
    })
    })()
  }, [])

  async function signOut() {
    setSigningOut(true)
    const supabase = await authClient()
    await supabase.auth.signOut()
    setSessionEmail(null); setSigningOut(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = await authClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(failed('Η σύνδεση δεν έγινε', error)); setLoading(false) }
    else router.push('/dashboard')
  }

  // Η `signInWithOAuth` ΕΙΝΑΙ ΚΑΙ ΕΓΓΡΑΦΗ. Οποιος πατούσε εδώ χωρίς λογαριασμό
  // αποκτούσε έναν, χωρίς να δει ποτέ τους Ορους και χωρίς καμία απόδειξη
  // συγκατάθεσης στο προφίλ του: ακριβώς το κενό που το app/signup/page.tsx
  // περιγράφει ως διορθωμένο, ζωντανό μία διαδρομή παραδίπλα.
  //
  // Η επιστροφή πάει τώρα στο `/signup?oauth=login`, που ελέγχει αν υπάρχει ήδη
  // συγκατάθεση. Αν υπάρχει, προωθεί στον πίνακα χωρίς να το καταλάβει κανείς.
  // Αν δεν υπάρχει, σταματά και ρωτά. Δεν συμπληρώνεται ποτέ εδώ: μια απόδειξη
  // που γράφτηκε χωρίς να δοθεί είναι χειρότερη από απόδειξη που λείπει.
  async function signInWithGoogle() {
    const supabase = await authClient()
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/signup?oauth=login` } })
  }

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
    borderRadius: T.radius.btn, padding: '10px 16px', minHeight: T.h.lg,
    color: 'var(--text-primary)', fontSize: 14,
    fontFamily: 'inherit', transition: 'border-color .15s',
  }
  const label: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700,
    display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em',
    fontFamily: T.font.sans,
  }

  return (
    <div className="auth-split" style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', fontFamily: T.font.sans }}>

      <a href="#main" className="skip-link">Μετάβαση στη φόρμα</a>

      {/* LEFT, κοινό marketing panel (AuthAside) */}
      <AuthAside />

      {/* ── ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ ΕΙΝΑΙ <main>, ΚΑΙ ΛΕΓΕΤΑΙ ─────────────────────────
          Μετρημένο: `document.querySelectorAll('main').length === 0` και καμία
          περιοχή στο προσβάσιμο δέντρο. Ο χρήστης αναγνώστη οθόνης δεν είχε
          τρόπο να πηδήξει στο κύριο μέρος — έπρεπε να διασχίσει ολόκληρη τη
          στήλη παρουσίασης κάθε φορά. */}
      {/* RIGHT, form */}
      <main id="main" className="auth-main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {sessionEmail ? (
            <AlreadySignedIn email={sessionEmail} onSignOut={signOut} signingOut={signingOut} mode="login" />
          ) : (<>
          {/* ΣΕ ΚΙΝΗΤΟ ΔΕΝ ΥΠΗΡΧΕ ΚΑΝΕΝΑΣ ΔΡΟΜΟΣ ΠΙΣΩ. Το λογότυπο ζει στο
              αριστερό πάνελ, που κρύβεται κάτω από τις 900, και δεν ήταν καν
              σύνδεσμος. Όποιος άνοιγε τη Σύνδεση από την αρχική έμενε εκεί. */}
          <BackLink home />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 6px' }}>Καλώς όρισες ξανά</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.5 }}>
            Δεν έχεις λογαριασμό;{' '}
            <Link href="/signup" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Δημιούργησε λογαριασμό</Link>
          </p>

          <button type="button" onClick={signInWithGoogle} className="auth-hov" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            <GoogleG />Συνέχισε με Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>ή</span>
            <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="login-email" style={label}>Ηλεκτρονικό ταχυδρομείο</label>
              <input id="login-email" name="email" autoComplete="email" type="email" value={email} required onChange={e => setEmail(e.target.value)} placeholder="onoma@email.com" style={field}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label htmlFor="login-password" style={{ ...label, marginBottom: 0 }}>Κωδικός</label>
                <Link href="/reset-password" className="lp-link po-tap" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>Ξέχασες τον κωδικό;</Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input id="login-password" name="password" autoComplete="current-password" type={show ? 'text' : 'password'} value={password} required onChange={e => setPassword(e.target.value)} placeholder="Ο κωδικός σου" style={{ ...field, paddingRight: 48 }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'} aria-pressed={show}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {show
                    ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                    : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.9 17.9A10.7 10.7 0 0 1 12 19c-6.5 0-10-7-10-7a19 19 0 0 1 5.1-5.9M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a19 19 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--negative)' }}>
                {trans(error)}
              </div>
            )}

            <button type="submit" disabled={loading} className="auth-cta" style={{ width: '100%', padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: T.radius.pill, color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, letterSpacing: '-0.01em', marginTop: 4, fontFamily: 'inherit' }}>
              {loading ? 'Σύνδεση…' : 'Σύνδεση'}
            </button>
          </form>

          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 24, lineHeight: 1.6 }}>
            Συνεχίζοντας, αποδέχεσαι τους{' '}
            <Link href="/terms" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Όρους χρήσης</Link>{' '}και την{' '}
            <Link href="/privacy" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Πολιτική απορρήτου</Link>.
          </p>
          </>)}
        </div>
      </main>
    </div>
  )
}
