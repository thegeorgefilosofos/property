'use client'
import { T } from '@/components/Theme'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import AlreadySignedIn from '../AlreadySignedIn'
import AuthAside from '../AuthAside'
import GoogleG from '../GoogleG'
import { checkPassword } from '@/lib/auth/password'
import PasswordStrength from '@/components/PasswordStrength'
import { failed } from '@/lib/core/dbError';
import { PLANS, TRIAL_DAYS, normalizePlan, type PlanId } from '@/lib/billing/plans';

// ═══════════════════════════════════════════════════════════════════════════
// Εγγραφή, στα χρώματα του app (design tokens, theme-aware). Κοινό marketing
// panel (AuthAside) με Σύνδεση/Επαναφορά. Google-first, με email ως δεύτερη οδό.
// Ο έλεγχος ισχύος κωδικού είναι κοινός (lib/auth/password) με επαναφορά/ρυθμίσεις.
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
  // ΤΟ ΠΑΚΕΤΟ ΠΟΥ ΔΙΑΛΕΞΕ Ο ΕΠΙΣΚΕΠΤΗΣ ΣΤΟΝ ΤΙΜΟΚΑΤΑΛΟΓΟ. Φτάνει ως `?plan=`
  // από την κάρτα που πάτησε. Χωρίς αυτό, η μόνη απόφαση που πήρε στην αρχική
  // σελίδα χανόταν στη μετάβαση, και η εγγραφή ξεκινούσε σαν να μην είχε
  // επιλέξει ποτέ τίποτα. Κρατιέται στο προφίλ, ώστε στη λήξη της δοκιμής να
  // ξέρουμε ΚΑΙ εμείς ΚΑΙ ο χρήστης ποιο πακέτο περιμένει.
  const [chosenPlan, setChosenPlan] = useState<PlanId | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)
  const [show, setShow] = useState(false)
  const [pwTouched, setPwTouched] = useState(false)
  const [resent, setResent] = useState(false)
  const [leakedPw, setLeakedPw] = useState<string | null>(null)
  // ΤΟ ΕΥΡΗΜΑ ΔΙΑΡΡΟΗΣ ΦΤΑΝΕΙ ΩΣ ΤΗΝ ΥΠΟΒΟΛΗ. Πριν, ζούσε μόνο μέσα στο
  // PasswordStrength: η οθόνη προειδοποιούσε και μετά δεχόταν τον κωδικό.
  // Κρατιέται ο ΙΔΙΟΣ ο κωδικός, όχι σημαία, ώστε η φραγή να παύει μόνη της
  // μόλις ο χρήστης αλλάξει έστω έναν χαρακτήρα.
  const leaked = leakedPw !== null && leakedPw === password
  const pw = checkPassword(password)
  const trans = (m: string) =>
    /already registered|already exists/i.test(m) ? 'Υπάρχει ήδη λογαριασμός με αυτό το email.'
    : /weak|at least|6 char/i.test(m) ? 'Ο κωδικός είναι πολύ αδύναμος. Χρησιμοποίησε τουλάχιστον 8 χαρακτήρες.'
    : /rate limit|too many/i.test(m) ? 'Πολλές προσπάθειες. Δοκίμασε ξανά σε λίγο.'
    : /valid email/i.test(m) ? 'Το email δεν φαίνεται έγκυρο.'
    : m
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      const r = q.get('ref'); if (r) setRefCode(r)
      // Μόνο πακέτο επί πληρωμή: το «free» δεν επιλέγεται, είναι κατάσταση.
      const p = q.get('plan')
      if (p && p !== 'free' && normalizePlan(p) === p) setChosenPlan(p as PlanId)
    } catch {}
  }, [])
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
    if (error) setError(failed('Η εγγραφή δεν ολοκληρώθηκε', error))
  }

  async function resend() {
    const supabase = createClient()
    await supabase.auth.resend({ type: 'signup', email })
    setResent(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (leaked) {
      setPwTouched(true)
      setError('Αυτός ο κωδικός βρίσκεται σε γνωστή διαρροή δεδομένων. Διάλεξε άλλον.')
      return
    }
    if (!pw.ok) {
      setPwTouched(true)
      setError(pw.common
        ? 'Ο κωδικός είναι πολύ κοινός. Διάλεξε κάτι πιο δύσκολο να μαντέψει κανείς.'
        : 'Ο κωδικός δεν πληροί όλες τις προϋποθέσεις ασφαλείας.')
      return
    }
    setError(''); setLoading(true)
    const supabase = createClient()
    // Αποδεικτικό συγκατάθεσης (GDPR, αρχή λογοδοσίας): καταγράφουμε στο προφίλ
    // του χρήστη ΠΟΤΕ αποδέχθηκε τους Όρους και την Πολιτική και ΠΟΙΑ έκδοσή τους,
    // ώστε η αποδοχή να είναι αποδείξιμη και να ζητηθεί εκ νέου αν αλλάξουν ουσιωδώς.
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: {
          full_name: fullName.trim(),
          consent_terms_accepted_at: new Date().toISOString(),
          consent_policy_version: '2026-07',
          ...(refCode ? { referred_by: refCode } : {}),
          ...(chosenPlan ? { chosen_plan: chosenPlan } : {}),
        },
      },
    })
    if (error) { setError(failed('Η εγγραφή δεν ολοκληρώθηκε', error)); setLoading(false) }
    else setDone(true)
  }

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
    borderRadius: 6, padding: '10px 16px', color: 'var(--text-primary)',
    fontSize: 14, fontFamily: 'inherit', transition: 'border-color .15s',
  }
  const label: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, display: 'block',
    marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans,
  }
  const focus = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--accent)' }
  const blur = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = 'var(--border-default)' }

  return (
    <div className="auth-split" style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', fontFamily: T.font.sans }}>

      {/* LEFT, κοινό marketing panel (AuthAside) */}
      <AuthAside
        headline="Ξεκίνα τώρα,"
        accent="σε λίγα δευτερόλεπτα."
        sub="Δημιούργησε λογαριασμό, φωτογράφισε ένα έγγραφο και δες το ακίνητό σου να οργανώνεται μόνο του."
      />

      {/* RIGHT, form */}
      <div className="auth-main" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          {sessionEmail ? (
            <AlreadySignedIn email={sessionEmail} onSignOut={signOut} signingOut={signingOut} mode="signup" />
          ) : done ? (
            <div style={{ textAlign: 'center' }} role="status">
              <div style={{ width: 56, height: 56, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--accent)' }}>
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6 12 13 2 6" /></svg>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 8px' }}>Άνοιξε το email σου</h1>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
                Σου στείλαμε έναν σύνδεσμο επιβεβαίωσης στο <strong style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{email}</strong>. Πάτησέ τον για να μπεις στον λογαριασμό σου. Δες και τον φάκελο ανεπιθύμητων.
              </p>
              <button onClick={resend} disabled={resent} style={{ display: 'inline-block', padding: '12px 24px', background: resent ? 'var(--bg-elevated)' : 'var(--accent)', border: resent ? '1px solid var(--border-default)' : 'none', borderRadius: 100, color: resent ? 'var(--text-secondary)' : 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: resent ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {resent ? 'Το ξαναστείλαμε ✓' : 'Ξαναστείλε το email'}
              </button>
            </div>
          ) : (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 6px' }}>Δημιουργία λογαριασμού</h1>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
                Έχεις ήδη λογαριασμό;{' '}
                <Link href="/login" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Σύνδεση</Link>
              </p>

              {/* Η ΕΠΙΛΟΓΗ ΤΟΥ ΤΙΜΟΚΑΤΑΛΟΓΟΥ, ΕΠΙΒΕΒΑΙΩΜΕΝΗ. Ο επισκέπτης πάτησε
                  μια συγκεκριμένη κάρτα· το να μην την ξαναδεί πουθενά τον
                  αφήνει να αναρωτιέται αν καταγράφηκε. Καμία χρέωση δεν ξεκινά
                  εδώ, και το λέει η ίδια η γραμμή. */}
              {chosenPlan && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', marginBottom: 24, borderRadius: 10, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 7 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    Διάλεξες το <strong style={{ color: 'var(--text-primary)' }}>{PLANS[chosenPlan].name}</strong>. Το δοκιμάζεις {TRIAL_DAYS} ημέρες χωρίς χρέωση, και το αλλάζεις όποτε θέλεις.
                  </span>
                </div>
              )}

              <button type="button" onClick={signInWithGoogle} className="auth-hov"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 100, color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <GoogleG />Συνέχισε με Google
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>ή</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label htmlFor="su-name" style={label}>Ονοματεπώνυμο <span style={{ color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(προαιρετικό)</span></label>
                  <input id="su-name" name="name" autoComplete="name" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Γιώργος Παπαδόπουλος" style={field} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label htmlFor="su-email" style={label}>Ηλεκτρονικό ταχυδρομείο</label>
                  <input id="su-email" name="email" autoComplete="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="onoma@email.com" required style={field} onFocus={focus} onBlur={blur} />
                </div>
                <div>
                  <label htmlFor="su-password" style={label}>Κωδικός</label>
                  <div style={{ position: 'relative' }}>
                    <input id="su-password" name="new-password" autoComplete="new-password" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Τουλάχιστον 8 χαρακτήρες" required minLength={8} aria-describedby="su-pw-req" style={{ ...field, paddingRight: 48 }} onFocus={focus} onBlur={e => { blur(e); setPwTouched(true) }} />
                    <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'} aria-pressed={show}
                      style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {show
                        ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                        : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.9 17.9A10.7 10.7 0 0 1 12 19c-6.5 0-10-7-10-7a19 19 0 0 1 5.1-5.9M9.9 4.2A10.9 10.9 0 0 1 12 4c6.5 0 10 7 10 7a19 19 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>}
                    </button>
                  </div>

                  {/* Μετρητής ισχύος + λίστα προϋποθέσεων (κοινό component) —
                      εμφανίζεται μόλις ο χρήστης αρχίσει να πληκτρολογεί. */}
                  {(password || pwTouched) && <PasswordStrength password={password} id="su-pw-req" onLeaked={setLeakedPw} />}
                </div>

                {error && (
                  <div role="alert" style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: 'var(--negative)' }}>
                    {trans(error)}
                  </div>
                )}

                {/* Ο έλεγχος δεν τυλίγει τους συνδέσμους (χωρίς ένθετα διαδραστικά)· το checkbox
                    περιγράφεται με aria-label και οι σύνδεσμοι είναι διπλανό κείμενο. */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 2 }}>
                  <input id="su-consent" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required aria-label="Αποδοχή των Όρων Χρήσης και της Πολιτικής απορρήτου" style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    Αποδέχομαι τους{' '}
                    <Link href="/terms" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Όρους χρήσης</Link>{' '}και την{' '}
                    <Link href="/privacy" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Πολιτική απορρήτου</Link>.
                  </span>
                </div>

                <button type="submit" disabled={loading || !consent || !pw.ok || leaked} className="auth-cta" style={{ width: '100%', padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: 100, color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: (loading || !consent || !pw.ok || leaked) ? 'not-allowed' : 'pointer', opacity: (loading || !consent || !pw.ok || leaked) ? 0.6 : 1, letterSpacing: '-0.01em', marginTop: 4, fontFamily: 'inherit' }}>
                  {loading ? 'Δημιουργία…' : 'Ξεκίνα δωρεάν'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
