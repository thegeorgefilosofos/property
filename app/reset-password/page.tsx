'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import AuthAside from '../AuthAside'

// ═══════════════════════════════════════════════════════════════════════════
// Επαναφορά κωδικού, δύο καταστάσεις:
//  • request: ο χρήστης δίνει email → στέλνουμε σύνδεσμο επαναφοράς.
//  • update:  ο χρήστης ήρθε από τον σύνδεσμο (PASSWORD_RECOVERY) → ορίζει νέο κωδικό.
// Ίδιο «δωμάτιο» με Σύνδεση/Εγγραφή (κοινό AuthAside).
// ═══════════════════════════════════════════════════════════════════════════

type Mode = 'request' | 'sent' | 'update' | 'done'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('request')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    // Αν ο χρήστης ήρθε από τον σύνδεσμο email, το Supabase εκπέμπει PASSWORD_RECOVERY.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('update')
    })
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) setMode('update')
    return () => sub.subscription.unsubscribe()
  }, [])

  const trans = (m: string) =>
    /rate limit|too many/i.test(m) ? 'Πολλές προσπάθειες. Δοκίμασε ξανά σε λίγο.'
    : /at least|weak|6 char/i.test(m) ? 'Ο κωδικός είναι πολύ αδύναμος (τουλάχιστον 8 χαρακτήρες).'
    : m

  async function sendReset(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true)
    const supabase = createClient()
    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    setLoading(false)
    if (error) setError(trans(error.message)); else setMode('sent')
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (password.length < 8) { setError('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.'); return }
    if (password !== confirm) { setError('Οι κωδικοί δεν ταιριάζουν.'); return }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) setError(trans(error.message)); else setMode('done')
  }

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
    borderRadius: 10, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', transition: 'border-color .15s',
  }
  const label: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'Inter',sans-serif",
  }
  const btn: React.CSSProperties = {
    width: '100%', padding: '13px', background: 'var(--accent)', border: 'none', borderRadius: 100,
    color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1, letterSpacing: '-0.01em', marginTop: 4, fontFamily: 'inherit',
  }
  const eye = (
    <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'}
      style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {show
        ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
        : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.9 17.9A10.7 10.7 0 0 1 12 19c-6.5 0-10-7-10-7a19 19 0 0 1 5.1-5.9M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a19 19 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>}
    </button>
  )

  const errBox = error && (
    <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--negative)' }}>{error}</div>
  )

  const successIcon = (
    <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="var(--positive)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    </div>
  )

  return (
    <div className="auth-split" style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', fontFamily: "'Inter',sans-serif" }}>

      {/* LEFT, κοινό marketing panel (AuthAside) */}
      <AuthAside
        headline="Επαναφορά πρόσβασης."
        accent="Σε ένα λεπτό."
        sub="Δώσε το email σου και θα σου στείλουμε έναν ασφαλή σύνδεσμο για να ορίσεις νέο κωδικό. Τα δεδομένα σου παραμένουν στη θέση τους."
      />

      {/* RIGHT, form */}
      <div className="auth-main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {mode === 'request' && (
            <>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 8px' }}>Επαναφορά κωδικού</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 28px', lineHeight: 1.6 }}>Δώσε το email σου και θα σου στείλουμε έναν σύνδεσμο για να ορίσεις νέο κωδικό.</p>
              <form onSubmit={sendReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label htmlFor="rp-email" style={label}>Email</label>
                  <input id="rp-email" name="email" autoComplete="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="onoma@email.com" style={field}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                </div>
                {errBox}
                <button type="submit" disabled={loading} style={btn}>{loading ? 'Αποστολή…' : 'Στείλε σύνδεσμο →'}</button>
              </form>
              <p style={{ fontSize: 13, marginTop: 22 }}>
                <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>← Επιστροφή στη σύνδεση</Link>
              </p>
            </>
          )}

          {mode === 'sent' && (
            <>
              {successIcon}
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 8px' }}>Έλεγξε το email σου</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>Αν υπάρχει λογαριασμός με αυτό το email, θα λάβεις σύνδεσμο επαναφοράς. Δες και τον φάκελο ανεπιθύμητων.</p>
              <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontSize: 14 }}>← Επιστροφή στη σύνδεση</Link>
            </>
          )}

          {mode === 'update' && (
            <>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 8px' }}>Όρισε νέο κωδικό</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 28px', lineHeight: 1.6 }}>Διάλεξε έναν ισχυρό κωδικό, τουλάχιστον 8 χαρακτήρες.</p>
              <form onSubmit={updatePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label htmlFor="rp-password" style={label}>Νέος κωδικός</label>
                  <div style={{ position: 'relative' }}>
                    <input id="rp-password" name="new-password" autoComplete="new-password" type={show ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} placeholder="Τουλάχιστον 8 χαρακτήρες" style={{ ...field, paddingRight: 46 }}
                      onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                    {eye}
                  </div>
                </div>
                <div>
                  <label htmlFor="rp-confirm" style={label}>Επιβεβαίωση</label>
                  <input id="rp-confirm" name="new-password" autoComplete="new-password" type={show ? 'text' : 'password'} required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Ξαναγράψε τον κωδικό" style={field}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                </div>
                {errBox}
                <button type="submit" disabled={loading} style={btn}>{loading ? 'Αποθήκευση…' : 'Αποθήκευση κωδικού →'}</button>
              </form>
            </>
          )}

          {mode === 'done' && (
            <>
              {successIcon}
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 8px' }}>Ο κωδικός άλλαξε</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>Μπορείς τώρα να συνδεθείς με τον νέο σου κωδικό.</p>
              <button onClick={() => router.push('/dashboard')} style={btn}>Μετάβαση στον πίνακα →</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
