'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// ═══════════════════════════════════════════════════════════════════════════
// Εγγραφή — στα χρώματα του app (design tokens, theme-aware). Συλλέγει και το
// ονοματεπώνυμο (χρειάζεται για εξατομίκευση & μελλοντικά παραστατικά/Stripe).
// ═══════════════════════════════════════════════════════════════════════════

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [consent, setConsent] = useState(false)
  const [refCode, setRefCode] = useState('')
  useEffect(() => { try { const r = new URLSearchParams(window.location.search).get('ref'); if (r) setRefCode(r); } catch {} }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName.trim(), ...(refCode ? { referred_by: refCode } : {}) } },
    })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
    borderRadius: 10, padding: '12px 14px', color: 'var(--text-primary)',
    fontSize: 15, outline: 'none', fontFamily: 'inherit', transition: 'border-color .15s',
  }
  const label: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, display: 'block',
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Google Sans',sans-serif",
  }
  const focus = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--accent)' }
  const blur = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--border-default)' }

  return (
    <div className="auth-split" style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', fontFamily: "'Google Sans','Inter',sans-serif" }}>

      {/* LEFT — brand */}
      <div className="auth-aside" style={{ width: '45%', minWidth: 380, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontSize: 15, fontWeight: 800 }}>P</div>
          <span style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Property OS</span>
        </div>

        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 100, padding: '4px 12px', marginBottom: 22 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
            <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>Πρώτος μήνας δωρεάν</span>
          </div>
          <h1 style={{ fontSize: 'clamp(28px, 3vw, 38px)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 16px' }}>
            Ξεκίνα να<br /><span style={{ color: 'var(--accent)' }}>κερδίζεις</span> περισσότερα.
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0, maxWidth: 300 }}>
            Το πρώτο σου ακίνητο είναι δωρεάν τον πρώτο μήνα. Μετά, από €2,99 τον μήνα — χωρίς δέσμευση.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['Έως 15 ακίνητα — κάθε τύπος', 'Αποδόσεις & φορολογία 2026', 'Δαπάνες, λογαριασμοί, ημερολόγιο', 'Σύγκριση παρόχων ενέργειας', 'Διαχείριση ενοικιαστή & συμβολαίου'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 800 }}>✓</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT — form */}
      <div className="auth-main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 24, color: 'var(--positive)' }}>✓</div>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: '0 0 8px' }}>Έλεγξε το email σου</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
                Στείλαμε επιβεβαίωση στο <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>. Πάτησε τον σύνδεσμο για να ενεργοποιήσεις τον λογαριασμό σου.
              </p>
              <Link href="/login" style={{ display: 'inline-block', padding: '12px 26px', background: 'var(--accent)', borderRadius: 100, color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>Πήγαινε στη Σύνδεση →</Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: '0 0 6px' }}>Δημιουργία λογαριασμού</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 28px' }}>
                Έχεις ήδη λογαριασμό;{' '}
                <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Σύνδεση</Link>
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={label}>Ονοματεπώνυμο</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Γιώργος Παπαδόπουλος" required style={field} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={label}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="onoma@email.com" required style={field} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label style={label}>Κωδικός</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Τουλάχιστον 8 χαρακτήρες" required minLength={8} style={field} onFocus={focus} onBlur={blur} />
                </div>

                {error && (
                  <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--negative)' }}>
                    {error === 'User already registered' ? 'Υπάρχει ήδη λογαριασμός με αυτό το email.' : error}
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginTop: 2 }}>
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Αποδέχομαι τους{' '}
                    <Link href="/terms" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Όρους Χρήσης</Link>{' '}και την{' '}
                    <Link href="/privacy" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Πολιτική Απορρήτου</Link>.
                  </span>
                </label>

                <button type="submit" disabled={loading || !consent} style={{ width: '100%', padding: '13px', background: 'var(--accent)', border: 'none', borderRadius: 100, color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: (loading || !consent) ? 'not-allowed' : 'pointer', opacity: (loading || !consent) ? 0.6 : 1, letterSpacing: '-0.01em', marginTop: 4, fontFamily: 'inherit' }}>
                  {loading ? 'Δημιουργία…' : 'Ξεκίνα δωρεάν →'}
                </button>
              </form>

              <div style={{ marginTop: 20, padding: 16, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Χωρίς χρέωση σήμερα</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>Δεν χρειάζεται κάρτα για να ξεκινήσεις. Πληρώνεις μόνο μετά τον πρώτο δωρεάν μήνα, αν συνεχίσεις.</p>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  )
}
