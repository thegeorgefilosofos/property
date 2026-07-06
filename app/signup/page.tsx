'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import AlreadySignedIn from '../AlreadySignedIn'
import AuthAside from '../AuthAside'

// ═══════════════════════════════════════════════════════════════════════════
// Εγγραφή — στα χρώματα του app (design tokens, theme-aware). Κοινό marketing
// panel (AuthAside) με Σύνδεση/Επαναφορά. Google-first, με email ως δεύτερη οδό.
// ═══════════════════════════════════════════════════════════════════════════

const GoogleG = () => (
  <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2 5.1-4.4 6.7v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.2z" />
    <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9h-7.3v5.7C8.1 41.1 15.4 46 24 46z" />
    <path fill="#FBBC05" d="M11.8 27.3c-.4-1.3-.7-2.7-.7-4.3s.3-3 .7-4.3v-5.7H4.5C3 16.1 2 19.9 2 24s1 7.9 2.5 11l7.3-5.7z" />
    <path fill="#EA4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14l7.3 5.7c1.7-5.2 6.5-9 12.2-9z" />
  </svg>
)

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [consent, setConsent] = useState(false)
  const [refCode, setRefCode] = useState('')
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [show, setShow] = useState(false)
  const [resent, setResent] = useState(false)
  const trans = (m: string) =>
    /already registered|already exists/i.test(m) ? 'Υπάρχει ήδη λογαριασμός με αυτό το email.'
    : /weak|at least|6 char/i.test(m) ? 'Ο κωδικός είναι πολύ αδύναμος (τουλάχιστον 8 χαρακτήρες).'
    : /rate limit|too many/i.test(m) ? 'Πολλές προσπάθειες. Δοκίμασε ξανά σε λίγο.'
    : /valid email/i.test(m) ? 'Το email δεν φαίνεται έγκυρο.'
    : m
  useEffect(() => { try { const r = new URLSearchParams(window.location.search).get('ref'); if (r) setRefCode(r); } catch {} }, [])
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

  async function signInWithGoogle() {
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) setError(error.message)
  }

  async function resend() {
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email })
    setResent(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName.trim(), ...(refCode ? { referred_by: refCode } : {}) },
      },
    })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
    borderRadius: 10, padding: '12px 14px', color: 'var(--text-primary)',
    fontSize: 15, fontFamily: 'inherit', transition: 'border-color .15s',
  }
  const label: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, display: 'block',
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Inter',sans-serif",
  }
  const focus = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--accent)' }
  const blur = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--border-default)' }

  return (
    <div className="auth-split" style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', fontFamily: "'Inter',sans-serif" }}>

      {/* LEFT — κοινό marketing panel (AuthAside) */}
      <AuthAside
        headline="Ξεκίνα σήμερα."
        accent="Δωρεάν, χωρίς κάρτα."
        sub="Δημιούργησε λογαριασμό σε λίγα δευτερόλεπτα. Το πρώτο σου ακίνητο μένει δωρεάν για πάντα, πληρώνεις μόνο αν προσθέσεις δεύτερο."
      />

      {/* RIGHT — form */}
      <div className="auth-main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {sessionEmail ? (
            <AlreadySignedIn email={sessionEmail} onSignOut={signOut} signingOut={signingOut} mode="signup" />
          ) : done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: 'var(--accent)' }}>
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" opacity="0" /><path d="M22 6 12 13 2 6" /><rect x="2" y="4" width="20" height="16" rx="2" /></svg>
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: '0 0 8px' }}>Άνοιξε το email σου</h2>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
                Σου στείλαμε έναν σύνδεσμο επιβεβαίωσης στο <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>. Πάτησέ τον για να μπεις στον λογαριασμό σου. Δες και τα ανεπιθύμητα.
              </p>
              <button onClick={resend} disabled={resent} style={{ display: 'inline-block', padding: '12px 26px', background: resent ? 'var(--bg-elevated)' : 'var(--accent)', border: resent ? '1px solid var(--border-default)' : 'none', borderRadius: 100, color: resent ? 'var(--text-secondary)' : 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: resent ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {resent ? 'Το ξαναστείλαμε ✓' : 'Ξαναστείλε το email'}
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: '0 0 6px' }}>Δημιουργία λογαριασμού</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
                Έχεις ήδη λογαριασμό;{' '}
                <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Σύνδεση</Link>
              </p>

              {/* Google-first */}
              <button type="button" onClick={signInWithGoogle}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <GoogleG />Συνέχισε με Google
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>ή</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label htmlFor="su-name" style={label}>Ονοματεπώνυμο <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(προαιρετικό)</span></label>
                  <input id="su-name" name="name" autoComplete="name" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Γιώργος Παπαδόπουλος" style={field} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label htmlFor="su-email" style={label}>Email</label>
                  <input id="su-email" name="email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="onoma@email.com" required style={field} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label htmlFor="su-password" style={label}>Κωδικός</label>
                  <div style={{ position: 'relative' }}>
                    <input id="su-password" name="new-password" autoComplete="new-password" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Τουλάχιστον 8 χαρακτήρες" required minLength={8} style={{ ...field, paddingRight: 46 }} onFocus={focus} onBlur={blur} />
                    <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
                      style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>Δεν χρειάζεται κάρτα για να ξεκινήσεις. Το πρώτο σου ακίνητο μένει δωρεάν για πάντα, πληρώνεις μόνο αν προσθέσεις δεύτερο.</p>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  )
}
