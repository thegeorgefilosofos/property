'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else setDone(true)
  }

  const inp = {
    width: '100%', boxSizing: 'border-box' as const,
    background: '#0e0e20', border: '1px solid #1e1e38',
    borderRadius: 8, padding: '10px 14px',
    color: '#e8e8f4', fontSize: 14, outline: 'none',
    fontFamily: 'inherit',
  }

  return (
    <div className="auth-split" style={{
      minHeight: '100vh', background: '#080810',
      display: 'flex',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Left branding */}
      <div className="auth-aside" style={{
        width: '45%', background: '#0a0a18',
        borderRight: '1px solid #16162a',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '48px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: '#d4af42', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#080810', fontSize: 14, fontWeight: 800 }}>P</span>
          </div>
          <span style={{ color: '#e8e8f4', fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em' }}>Property OS</span>
        </div>

        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#d4af4218', border: '1px solid #d4af4230', borderRadius: 20, padding: '4px 12px', marginBottom: 24 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#d4af42' }}/>
            <span style={{ fontSize: 11, color: '#d4af42', fontWeight: 500, letterSpacing: '0.04em' }}>3 μήνες δωρεάν</span>
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: '#e8e8f4', letterSpacing: '-0.03em', lineHeight: 1.15, margin: '0 0 16px' }}>
            Ξεκίνα να<br/>
            <span style={{ color: '#d4af42' }}>κερδίζεις</span><br/>
            περισσότερα.
          </h1>
          <p style={{ fontSize: 14, color: '#6868a0', lineHeight: 1.6, margin: 0, maxWidth: 280 }}>
            Το πρώτο σου ακίνητο είναι δωρεάν για 3 μήνες. Μετά από €1.99/μήνα.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { i: '✓', l: 'Έως 15 ακίνητα — κάθε τύπος' },
            { i: '✓', l: 'ROI & φορολογικοί υπολογισμοί 2026' },
            { i: '✓', l: 'Δαπάνες, λογαριασμοί, ημερολόγιο' },
            { i: '✓', l: 'Διαχείριση ενοικιαστή & συμβολαίου' },
          ].map(f => (
            <div key={f.l} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#d4af42', fontSize: 12, fontWeight: 700 }}>{f.i}</span>
              <span style={{ fontSize: 13, color: '#9090b8' }}>{f.l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right form */}
      <div className="auth-main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, background: '#d4af4218', border: '1px solid #d4af4230', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 24 }}>✓</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#e8e8f4', letterSpacing: '-0.03em', margin: '0 0 8px' }}>Έλεγξε το email σου</h2>
              <p style={{ fontSize: 14, color: '#6868a0', lineHeight: 1.6, margin: '0 0 24px' }}>
                Στείλαμε επιβεβαίωση στο <strong style={{ color: '#9090b8' }}>{email}</strong>. Κλικ στον σύνδεσμο για να ενεργοποιήσεις τον λογαριασμό σου.
              </p>
              <Link href="/login" style={{ display: 'inline-block', padding: '10px 24px', background: '#d4af42', borderRadius: 8, color: '#080810', fontSize: 14, fontWeight: 600, textDecoration: 'none', letterSpacing: '-0.01em' }}>
                Πήγαινε στη Σύνδεση →
              </Link>
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#e8e8f4', letterSpacing: '-0.03em', margin: '0 0 6px' }}>Δημιουργία λογαριασμού</h2>
              <p style={{ fontSize: 13, color: '#6868a0', margin: '0 0 32px' }}>
                Έχεις ήδη λογαριασμό;{' '}
                <Link href="/login" style={{ color: '#d4af42', textDecoration: 'none', fontWeight: 500 }}>Σύνδεση</Link>
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, color: '#9090b8', fontWeight: 500, display: 'block', marginBottom: 6 }}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="name@company.com" required style={inp}
                    onFocus={e => e.target.style.borderColor='#d4af42'}
                    onBlur={e => e.target.style.borderColor='#1e1e38'}/>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: '#9090b8', fontWeight: 500, display: 'block', marginBottom: 6 }}>Κωδικός</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Τουλάχιστον 8 χαρακτήρες" required minLength={8} style={inp}
                    onFocus={e => e.target.style.borderColor='#d4af42'}
                    onBlur={e => e.target.style.borderColor='#1e1e38'}/>
                </div>

                {error && (
                  <div style={{ background: '#e0525218', border: '1px solid #e0525230', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#e05252' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '11px',
                  background: loading ? '#8a6328' : '#d4af42',
                  border: 'none', borderRadius: 8,
                  color: '#080810', fontSize: 14, fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  letterSpacing: '-0.01em', marginTop: 4,
                  fontFamily: 'inherit',
                }}>
                  {loading ? 'Δημιουργία...' : 'Δημιουργία λογαριασμού →'}
                </button>
              </form>

              <div style={{ marginTop: 24, padding: '16px', background: '#0e0e20', border: '1px solid #1e1e38', borderRadius: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#3db87a' }}/>
                  <span style={{ fontSize: 12, color: '#3db87a', fontWeight: 500 }}>3 μήνες δωρεάν για το 1ο ακίνητο</span>
                </div>
                <p style={{ fontSize: 11, color: '#38385a', margin: 0, lineHeight: 1.5 }}>
                  Δεν χρειάζεται κάρτα. Μετά τη δοκιμή €1.99/μήνα — ακύρωση οποιαδήποτε στιγμή.
                </p>
              </div>

              <p style={{ fontSize: 11, color: '#38385a', textAlign: 'center', lineHeight: 1.6, margin: '20px 0 0' }}>
                Με την εγγραφή αποδέχεσαι τους{' '}
                <span style={{ color: '#6868a0', cursor: 'pointer' }}>Όρους Χρήσης</span>
                {' '}και την{' '}
                <span style={{ color: '#6868a0', cursor: 'pointer' }}>Πολιτική Απορρήτου</span>.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}