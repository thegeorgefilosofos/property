'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import AlreadySignedIn from '../AlreadySignedIn'

// ═══════════════════════════════════════════════════════════════════════════
// Σύνδεση — στα χρώματα του app (design tokens, theme-aware light/dark).
// Δύο στήλες σε desktop· σε κινητό το marketing panel κρύβεται (auth-* classes).
// ═══════════════════════════════════════════════════════════════════════════

const PILLARS = [
  { label: 'Πλήρης οικονομική εικόνα', text: 'Έσοδα, δαπάνες και απόδοση κάθε ακινήτου σε πραγματικό χρόνο, μεικτή και καθαρή, αφού αφαιρεθούν φόροι και λειτουργικά έξοδα.' },
  { label: 'Σύγκριση παρόχων ενέργειας', text: 'Έντεκα πάροχοι ρεύματος και αερίου. Βρίσκεις αυτόματα το φθηνότερο τιμολόγιο για την κατανάλωσή σου.' },
  { label: 'Φορολογία 2026', text: 'Υπολογισμός φόρου εισοδήματος με την ισχύουσα κλίμακα και εξαγωγή έτοιμη για τον λογιστή σου.' },
  { label: 'Χαρτοφυλάκιο έως 15 ακίνητα', text: 'Κατοικία, επαγγελματικός χώρος, αποθήκη ή οικόπεδο. Κάθε τύπος ακινήτου, σε ενιαία διαχείριση.' },
  { label: 'Διαχείριση μίσθωσης', text: 'Προφίλ ενοικιαστή, συμβόλαιο, ιστορικό πληρωμών και υπενθυμίσεις λήξης σε ένα σημείο.' },
]

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
    : /rate limit|too many/i.test(m) ? 'Πολλές προσπάθειες. Δοκίμασε ξανά σε λίγο.'
    : m

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setSessionEmail(data.user?.email ?? null))
  }, [])

  async function signOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    setSessionEmail(null); setSigningOut(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.push('/dashboard')
  }

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
    borderRadius: 10, padding: '12px 14px',
    color: 'var(--text-primary)', fontSize: 15, outline: 'none',
    fontFamily: 'inherit', transition: 'border-color .15s',
  }
  const label: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600,
    display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em',
    fontFamily: "'Google Sans',sans-serif",
  }

  return (
    <div className="auth-split" style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', fontFamily: "'Google Sans','Inter',sans-serif" }}>

      {/* LEFT — brand / marketing */}
      <div className="auth-aside" style={{ width: '46%', minWidth: 400, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', padding: '44px 52px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 56 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontSize: 16, fontWeight: 800 }}>P</div>
          <span style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Property OS</span>
          <span style={{ fontSize: 10, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 6, padding: '2px 8px', letterSpacing: '0.06em', fontWeight: 700 }}>BETA</span>
        </div>

        <div style={{ marginBottom: 44 }}>
          <h1 style={{ fontSize: 'clamp(28px, 3vw, 36px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 18px', color: 'var(--text-primary)' }}>
            Το ακίνητό σου.<br /><span style={{ color: 'var(--accent)' }}>Υπό απόλυτο έλεγχο.</span>
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, maxWidth: 380 }}>
            Η πλατφόρμα που δίνει στους Έλληνες ιδιοκτήτες πλήρη εικόνα του ακινήτου τους. Αποδόσεις, δαπάνες, ενέργεια, φορολογία και ενοικιαστές, όλα οργανωμένα σε ένα σημείο.
          </p>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {PILLARS.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '3px 1fr', gap: 16 }}>
              <div style={{ background: 'var(--accent)', borderRadius: 2, opacity: 0.55 }} />
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px', letterSpacing: '0.02em' }}>{p.label}</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>{p.text}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 36, paddingTop: 24, borderTop: '1px solid var(--border-subtle)' }}>
          <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, margin: '0 0 6px' }}>Το πρώτο ακίνητο, δωρεάν για πάντα</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.7 }}>Ξεκίνα δωρεάν με ένα ακίνητο, για πάντα. Από το δεύτερο και πάνω, 2,99 € τον μήνα ή 29,90 € τον χρόνο, χωρίς δέσμευση.</p>
        </div>
      </div>

      {/* RIGHT — form */}
      <div className="auth-main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {sessionEmail ? (
            <AlreadySignedIn email={sessionEmail} onSignOut={signOut} signingOut={signingOut} mode="login" />
          ) : (<>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 12px', fontFamily: "'Google Sans',sans-serif" }}>Σύνδεση</p>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: '0 0 8px' }}>Καλωσόρισες πίσω</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 32px', lineHeight: 1.5 }}>
            Δεν έχεις λογαριασμό;{' '}
            <Link href="/signup" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Εγγραφή δωρεάν</Link>
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={label}>Email</label>
              <input type="email" value={email} required onChange={e => setEmail(e.target.value)} placeholder="onoma@email.com" style={field}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={{ ...label, marginBottom: 0 }}>Κωδικός</label>
                <Link href="/reset-password" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>Ξέχασες τον κωδικό;</Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input type={show ? 'text' : 'password'} value={password} required onChange={e => setPassword(e.target.value)} placeholder="Ο κωδικός σου" style={{ ...field, paddingRight: 42 }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                  onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4, display: 'flex' }}>
                  {show
                    ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                    : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.9 17.9A10.7 10.7 0 0 1 12 19c-6.5 0-10-7-10-7a19 19 0 0 1 5.1-5.9M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a19 19 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--negative)' }}>
                {trans(error)}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ width: '100%', padding: '13px', background: 'var(--accent)', border: 'none', borderRadius: 100, color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1, letterSpacing: '-0.01em', marginTop: 4, fontFamily: 'inherit' }}>
              {loading ? 'Σύνδεση…' : 'Σύνδεση →'}
            </button>
          </form>

          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 24, lineHeight: 1.6 }}>
            Συνεχίζοντας αποδέχεσαι τους{' '}
            <Link href="/terms" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Όρους Χρήσης</Link>{' '}και την{' '}
            <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Πολιτική Απορρήτου</Link>.
          </p>
          </>)}
        </div>
      </div>
    </div>
  )
}
