'use client'
import { T } from '@/components/Theme'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import AlreadySignedIn from '../AlreadySignedIn'
import AuthAside from '../AuthAside'
import GoogleG from '../GoogleG'
import { BackLink } from '../BackLink'
import { checkPassword } from '@/lib/auth/password'
import PasswordStrength from '@/components/PasswordStrength'
import { failed } from '@/lib/core/dbError';
import { PLANS, TRIAL_DAYS, normalizePlan, type PlanId } from '@/lib/billing/plans';
import { POLICY_VERSION as CONSENT_VERSION } from '@/lib/legal/identity'

// Η έκδοση των Όρων που δέχεται ο χρήστης. Ήταν καρφωτή εδώ ως «2026-07», ενώ
// οι δύο σελίδες που υπογράφει γράφουν «Αύγουστος 2026»: η απόδειξη
// συγκατάθεσης έδειχνε σε κείμενο άλλου μήνα. Μία πηγή, στο μητρώο που κρατά
// ήδη κάθε νομικό στοιχείο.

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
  // Το κουμπί της Google δεν έχει «υποβολή» για να δείξει το πρόβλημα. Χωρίς
  // αυτό, το πάτημα χωρίς αποδοχή δεν έκανε τίποτα και έμοιαζε με βλάβη.
  const [consentTouched, setConsentTouched] = useState(false)
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
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user
      if (!u) { setSessionEmail(null); return }
      // ΕΠΙΣΤΡΟΦΗ ΑΠΟ ΤΗΝ GOOGLE. Συμπληρώνουμε ΜΟΝΟ ό,τι λείπει: ο χρήστης
      // που ξανασυνδέεται δεν επιτρέπεται να δει τη σφραγίδα συγκατάθεσής του
      // να ξαναγράφεται με σημερινή ημερομηνία — η απόδειξη είναι η ΠΡΩΤΗ.
      const q = new URLSearchParams(window.location.search)
      if (q.get('oauth') === '1') {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>
        const patch: Record<string, unknown> = {}
        if (!meta.consent_terms_accepted_at) {
          patch.consent_terms_accepted_at = new Date().toISOString()
          patch.consent_policy_version = CONSENT_VERSION
        }
        const r = q.get('ref'); if (r && !meta.referred_by) patch.referred_by = r
        const p = q.get('plan')
        if (p && p !== 'free' && normalizePlan(p) === p && !meta.chosen_plan) patch.chosen_plan = p
        if (Object.keys(patch).length) { try { await supabase.auth.updateUser({ data: patch }) } catch {} }
        window.location.replace('/dashboard')
        return
      }
      setSessionEmail(u.email ?? null)
    })
  }, [])

  async function signOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    setSessionEmail(null); setSigningOut(false)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Η ΕΓΓΡΑΦΗ ΜΕΣΩ GOOGLE ΕΧΑΝΕ ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΠΟΥ Η ΕΓΓΡΑΦΗ ΜΕ EMAIL ΚΡΑΤΑ
  // ─────────────────────────────────────────────────────────────────────
  // Η φόρμα email γράφει στο προφίλ πότε έγιναν δεκτοί οι Όροι, ποια έκδοση,
  // ποιος έστειλε την πρόσκληση και ποιο πακέτο διάλεξε ο επισκέπτης. Η
  // `signInWithOAuth` δεν δέχεται `data`, οπότε η διαδρομή της Google δεν
  // έγραφε ΤΙΠΟΤΑ από τα τέσσερα:
  //
  //   • Καμία απόδειξη συγκατάθεσης. Η αρχή λογοδοσίας του GDPR ζητά να
  //     μπορούμε να δείξουμε ΠΟΤΕ και ΤΙ δέχθηκε ο χρήστης. Χειρότερα: το
  //     κουμπί δούλευε χωρίς καν να τσεκαριστεί το κουτί, άρα γινόταν
  //     λογαριασμός χωρίς αποδοχή των Όρων.
  //   • Καμία πρόσκληση. Ο συστήνων δεν έπαιρνε ποτέ τον μήνα του, και δεν
  //     το μάθαινε κανείς — ο νέος χρήστης υπήρχε, απλώς χωρίς πατέρα.
  //   • Κανένα πακέτο. Ο επισκέπτης που πάτησε «Ιδιοκτήτης» στον τιμοκατάλογο
  //     έφτανε σαν να μην είχε διαλέξει ποτέ.
  //
  // Η λύση δεν χρειάζεται αποθήκευση στον περιηγητή: ό,τι ξέρουμε ταξιδεύει
  // στη διεύθυνση επιστροφής, και γράφεται μόλις υπάρξει συνεδρία.
  // ═══════════════════════════════════════════════════════════════════════
  async function signInWithGoogle() {
    if (!consent) { setConsentTouched(true); return }
    setError('')
    const supabase = createClient()
    const back = new URLSearchParams({ oauth: '1' })
    if (refCode) back.set('ref', refCode)
    if (chosenPlan) back.set('plan', chosenPlan)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/signup?${back.toString()}` },
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
          consent_policy_version: CONSENT_VERSION,
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
              {/* ΣΕ ΚΙΝΗΤΟ ΔΕΝ ΥΠΗΡΧΕ ΚΑΝΕΝΑΣ ΔΡΟΜΟΣ ΠΙΣΩ. Το λογότυπο ζει στο
                  αριστερό πάνελ, που κρύβεται κάτω από τις 900, και δεν ήταν καν
                  σύνδεσμος. */}
              <BackLink home />
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 6px' }}>Δημιουργία λογαριασμού</h1>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
                Έχεις ήδη λογαριασμό;{' '}
                <Link href="/login" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Σύνδεση</Link>
              </p>

              {/* Η ΕΠΙΛΟΓΗ ΤΟΥ ΤΙΜΟΚΑΤΑΛΟΓΟΥ, ΕΠΙΒΕΒΑΙΩΜΕΝΗ. Ο επισκέπτης πάτησε
                  μια συγκεκριμένη κάρτα· το να μην την ξαναδεί πουθενά τον
                  αφήνει να αναρωτιέται αν καταγράφηκε.

                  ΓΙΑΤΙ ΔΕΝ ΓΡΑΦΕΙ «ΚΑΜΙΑ ΧΡΕΩΣΗ»: σήμερα δεν ζητείται κάρτα και
                  χρέωση δεν υπάρχει, οπότε θα ήταν αληθές — αλλά γίνεται ψέμα
                  την πρώτη μέρα που θα μπει η χρέωση, και τότε αυτή η γραμμή θα
                  στέκει δίπλα σε πεδίο κάρτας λέγοντας το αντίθετο. Ό,τι γράφεται
                  εδώ πρέπει να στέκει ΚΑΙ ΠΡΙΝ ΚΑΙ ΜΕΤΑ: η δοκιμή είναι δωρεάν
                  και το πακέτο αλλάζει όποτε θέλει ο χρήστης. */}
              {chosenPlan && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', marginBottom: 24, borderRadius: 10, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 7 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    Διάλεξες το <strong style={{ color: 'var(--text-primary)' }}>{PLANS[chosenPlan].name}</strong>. Το δοκιμάζεις {TRIAL_DAYS} ημέρες χωρίς χρέωση, και το αλλάζεις όποτε θέλεις.
                  </span>
                </div>
              )}

              {/* Η ΑΠΟΔΟΧΗ ΚΑΘΟΤΑΝ ΜΕΣΑ ΣΤΗ ΦΟΡΜΑ EMAIL, ΔΗΛΑΔΗ ΚΑΤΩ ΑΠΟ ΤΗΝ GOOGLE.
                  Όποιος πατούσε το πάνω κουμπί δεν την είχε δει ποτέ. Μία
                  αποδοχή, πάνω από τις δύο πόρτες, και ισχύει και για τις δύο.
                  Ο έλεγχος δεν τυλίγει τους συνδέσμους (χωρίς ένθετα
                  διαδραστικά): περιγράφεται με aria-label και οι σύνδεσμοι
                  είναι διπλανό κείμενο. */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
                <input id="su-consent" type="checkbox" checked={consent}
                  onChange={e => { setConsent(e.target.checked); if (e.target.checked) setConsentTouched(false) }}
                  required aria-label="Αποδοχή των Όρων Χρήσης και της Πολιτικής απορρήτου"
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }} />
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Αποδέχομαι τους{' '}
                  <Link href="/terms" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Όρους χρήσης</Link>{' '}και την{' '}
                  <Link href="/privacy" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Πολιτική απορρήτου</Link>.
                </span>
              </div>
              {consentTouched && !consent && (
                <p role="alert" style={{ fontSize: 12, color: 'var(--negative-on-container)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Χρειάζεται να αποδεχθείς τους Όρους και την Πολιτική απορρήτου για να συνεχίσεις.
                </p>
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

                <button type="submit" disabled={loading || !consent || !pw.ok || leaked} className="auth-cta" style={{ width: '100%', padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: 100, color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: (loading || !consent || !pw.ok || leaked) ? 'not-allowed' : 'pointer', opacity: (loading || !consent || !pw.ok || leaked) ? 0.6 : 1, letterSpacing: '-0.01em', marginTop: 4, fontFamily: 'inherit' }}>
                  {loading ? 'Δημιουργία…' : 'Ξεκίνα τη δοκιμή'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
