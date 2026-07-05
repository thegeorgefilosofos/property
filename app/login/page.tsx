'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

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
          <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, margin: '0 0 6px' }}>Δωρεάν ο πρώτος μήνας</p>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.7 }}>Το πρώτο ακίνητο χωρίς χρέωση τον πρώτο μήνα. Μετά από 2,99 € τον μήνα, χωρίς ετήσια δέσμευση, ακυρώνεις όποτε θέλεις.</p>
        </div>
      </div>

      {/* RIGHT — form */}
      <div className="auth-main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
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
              <label style={label}>Κωδικός</label>
              <input type="password" value={password} required onChange={e => setPassword(e.target.value)} placeholder="Ο κωδικός σου" style={field}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
            </div>

            {error && (
              <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--negative)' }}>
                {error === 'Invalid login credentials' ? 'Λάθος email ή κωδικός.' : error}
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
        </div>
      </div>
    </div>
  )
}
