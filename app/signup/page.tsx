'use client'
import { T } from '@/components/Theme'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import AlreadySignedIn from '../AlreadySignedIn'
import AuthAside from '../AuthAside'
import GoogleG from '../GoogleG'
import { BackLink } from '../BackLink'
import { checkPassword, PASSWORD_MIN_LABEL, PASSWORD_MIN_LENGTH } from '@/lib/auth/password'
import PasswordStrength from '@/components/PasswordStrength'
import { failed } from '@/lib/core/dbError';
import { PLANS, TRIAL_DAYS, type PlanId, type BillingCycle } from '@/lib/billing/plans';
// Καθαρή λογική, χωρίς React/Supabase: ασφαλής σε 'use client'.
import { planFromParam, cycleFromParam } from '@/lib/billing/entitlements';
import { fe } from '@/lib/core/format';
// Η μορφή του κωδικού πρόσκλησης ζει δίπλα στη γεννήτριά του, όχι εδώ.
import { isReferralCode } from '@/lib/referral/referral';
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

/**
 * ΠΟΥ ΠΡΟΣΓΕΙΩΝΕΤΑΙ Ο ΝΕΟΣ ΛΟΓΑΡΙΑΣΜΟΣ ΜΟΛΙΣ ΑΝΟΙΞΕΙ.
 *
 * Οποιος διάλεξε πακέτο πάει στο ταμείο, με το πακέτο και τον κύκλο του. Ολη
 * η εγγραφή ξεκίνησε από ένα πάτημα σε κάρτα τιμοκαταλόγου: το να καταλήγει
 * στον πίνακα, όπου η συνδρομή είναι κουμπί τρία κλικ μακριά μέσα στις
 * Ρυθμίσεις, ακυρώνει τον λόγο που ήρθε.
 *
 * Οποιος ΔΕΝ διάλεξε —μπήκε κατευθείαν στην εγγραφή— πάει στον πίνακα: δεν
 * υπάρχει τίποτα να αγοράσει, και η δοκιμή του τρέχει έτσι κι αλλιώς.
 */
const landing = (plan: PlanId | null, cycle: BillingCycle) =>
  plan ? `/tameio?plan=${plan}&cycle=${cycle}` : '/dashboard'

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
  // ΚΑΙ Ο ΚΥΚΛΟΣ ΤΑΞΙΔΕΥΕΙ ΜΑΖΙ ΤΟΥ. Το πακέτο έφτανε μόνο του, οπότε η
  // επιλογή «ετήσια, με δύο μήνες δωρεάν» —η ακριβώς μισή απόφαση, και η πιο
  // ακριβή— χανόταν στη μετάβαση: ο χρήστης κατέληγε στο ταμείο με μηνιαία
  // χρέωση, δηλαδή σε ΑΛΛΟ ποσό από εκείνο που πάτησε.
  const [chosenCycle, setChosenCycle] = useState<BillingCycle>('monthly')
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  /** Ηρθε από τη σύνδεση με Google και δεν έχει δεχτεί ποτέ τους Ορους. */
  const [needsConsent, setNeedsConsent] = useState<string | null>(null)
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
    : /weak|at least|6 char/i.test(m) ? `Ο κωδικός είναι πολύ αδύναμος. Χρησιμοποίησε ${PASSWORD_MIN_LABEL.toLowerCase()}.`
    : /rate limit|too many/i.test(m) ? 'Πολλές προσπάθειες. Δοκίμασε ξανά σε λίγο.'
    : /valid email/i.test(m) ? 'Το email δεν φαίνεται έγκυρο.'
    : m
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      const r = q.get('ref'); if (r) setRefCode(r)
      // Μόνο πακέτο επί πληρωμή: το «free» δεν επιλέγεται, είναι κατάσταση.
      // Ο κανόνας ζει στο planFromParam, όχι σε δύο αντίγραφα εδώ μέσα.
      setChosenPlan(planFromParam(q.get('plan')))
      setChosenCycle(cycleFromParam(q.get('cycle')))
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
      // ═══ ΔΥΟ ΔΙΑΔΡΟΜΕΣ ΕΠΙΣΤΡΟΦΗΣ, ΚΑΙ Η ΔΙΑΦΟΡΑ ΤΟΥΣ ΕΙΝΑΙ Η ΣΥΓΚΑΤΑΘΕΣΗ ═══
      //
      // «oauth=1» σημαίνει ότι ο χρήστης ΤΣΕΚΑΡΕ το κουτί σε αυτή τη σελίδα
      // πριν φύγει για την Google: η αποδοχή έγινε, μένει να καταγραφεί.
      //
      // «oauth=login» έρχεται από τη σελίδα σύνδεσης, όπου ΔΕΝ υπάρχει κουτί.
      // Και η `signInWithOAuth` είναι ΚΑΙ εγγραφή: ο πρωτοεμφανιζόμενος
      // αποκτούσε λογαριασμό χωρίς να δει ποτέ τους Ορους. Ηταν ακριβώς το
      // κενό που το σχόλιο παρακάτω περιγράφει ως διορθωμένο, ζωντανό μία
      // διαδρομή παραδίπλα.
      //
      // ΤΟ ΝΑ ΣΥΜΠΛΗΡΩΘΕΙ ΕΔΩ Η ΣΥΓΚΑΤΑΘΕΣΗ ΘΑ ΗΤΑΝ ΧΕΙΡΟΤΕΡΟ ΑΠΟ ΤΟ ΚΕΝΟ:
      // θα κατασκεύαζε απόδειξη για κάτι που δεν συνέβη. Οποιος έρχεται από τη
      // σύνδεση και ΔΕΝ έχει ήδη συγκατάθεση σταματά εδώ και ερωτάται. Οποιος
      // έχει, προχωρά χωρίς να το καταλάβει.
      const oauth = q.get('oauth')
      if (oauth === 'login') {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>
        if (meta.consent_terms_accepted_at) { window.location.replace('/dashboard'); return }
        setNeedsConsent(u.email ?? '')
        return
      }
      if (oauth === '1') {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>
        const patch: Record<string, unknown> = {}
        if (!meta.consent_terms_accepted_at) {
          patch.consent_terms_accepted_at = new Date().toISOString()
          patch.consent_policy_version = CONSENT_VERSION
        }
        const r = q.get('ref'); if (r && !meta.referred_by) patch.referred_by = r
        const p = planFromParam(q.get('plan'))
        const c = cycleFromParam(q.get('cycle'))
        if (p && !meta.chosen_plan) { patch.chosen_plan = p; patch.chosen_cycle = c }
        if (Object.keys(patch).length) { try { await supabase.auth.updateUser({ data: patch }) } catch {} }
        window.location.replace(landing(p, c))
        return
      }
      setSessionEmail(u.email ?? null)
    })
  }, [])

  /** Γράφει την απόδειξη συγκατάθεσης ΜΟΝΟ αφού δοθεί, και μετά ανοίγει τον πίνακα. */
  async function acceptOauthConsent() {
    // ΤΟ ΤΕΤΡΑΓΩΝΟ ΕΙΝΑΙ ΠΙΑ ΠΙΟ ΚΑΤΩ ΑΠΟ ΤΟ ΚΟΥΜΠΙ, ΑΡΑ ΔΕΙΧΝΕΤΑΙ. Χωρίς
    // αυτό, όποιος πατούσε «Συνέχισε με Google» χωρίς αποδοχή έβλεπε το κουμπί
    // να μην κάνει τίποτα: το μήνυμα υπήρχε, αλλά εκτός οθόνης.
    if (!consent) {
      setConsentTouched(true)
      const box = document.getElementById('su-consent')
      box?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      box?.focus()
      return
    }
    const supabase = createClient()
    try {
      await supabase.auth.updateUser({ data: {
        consent_terms_accepted_at: new Date().toISOString(),
        consent_policy_version: CONSENT_VERSION,
      } })
    } catch {}
    window.location.replace('/dashboard')
  }

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
    // ΤΟ ΤΕΤΡΑΓΩΝΟ ΕΙΝΑΙ ΠΙΑ ΠΙΟ ΚΑΤΩ ΑΠΟ ΤΟ ΚΟΥΜΠΙ, ΑΡΑ ΔΕΙΧΝΕΤΑΙ. Χωρίς
    // αυτό, όποιος πατούσε «Συνέχισε με Google» χωρίς αποδοχή έβλεπε το κουμπί
    // να μην κάνει τίποτα: το μήνυμα υπήρχε, αλλά εκτός οθόνης.
    if (!consent) {
      setConsentTouched(true)
      const box = document.getElementById('su-consent')
      box?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      box?.focus()
      return
    }
    setError('')
    const supabase = createClient()
    const back = new URLSearchParams({ oauth: '1' })
    if (refCode) back.set('ref', refCode)
    if (chosenPlan) { back.set('plan', chosenPlan); back.set('cycle', chosenCycle) }
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
        // Ο ΣΥΝΔΕΣΜΟΣ ΤΟΥ EMAIL ΠΕΡΝΑΕΙ ΑΠΟ ΤΗΝ ΑΝΤΑΛΛΑΓΗ ΤΟΥ ΔΙΑΚΡΙΤΙΚΟΥ.
        // Εδειχνε κατευθείαν στον πίνακα, ο οποίος ζητά συνεδρία — και συνεδρία
        // δεν υπάρχει ακόμη τη στιγμή που πατιέται ο σύνδεσμος. Ο
        // διαμεσολαβητής έστελνε τον νέο χρήστη στη φόρμα εισόδου, κρατώντας το
        // διακριτικό στη διεύθυνση: ο λογαριασμός άνοιγε, αλλά ο άνθρωπος
        // κατέληγε να κοιτά «Σύνδεση» αντί για την εφαρμογή του.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(landing(chosenPlan, chosenCycle))}`,
        data: {
          full_name: fullName.trim(),
          consent_terms_accepted_at: new Date().toISOString(),
          consent_policy_version: CONSENT_VERSION,
          ...(refCode ? { referred_by: refCode } : {}),
          ...(chosenPlan ? { chosen_plan: chosenPlan, chosen_cycle: chosenCycle } : {}),
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
          {needsConsent ? (
            /* Ηρθε από τη σύνδεση με Google, ο λογαριασμός δημιουργήθηκε, και οι
               Οροι δεν έχουν γίνει ποτέ δεκτοί. Δεν προχωρά χωρίς ρητή αποδοχή,
               και δεν γράφεται τίποτα στο προφίλ πριν από αυτήν. */
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 8px' }}>Ενα βήμα ακόμη</h1>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
                Ο λογαριασμός <strong style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{needsConsent}</strong> είναι καινούργιος. Πριν ανοίξει, χρειάζεται η αποδοχή σου.
              </p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
                <input id="su-consent-oauth" type="checkbox" checked={consent}
                  onChange={e => { setConsent(e.target.checked); if (e.target.checked) setConsentTouched(false) }}
                  aria-label="Αποδοχή των Όρων Χρήσης και της Πολιτικής απορρήτου"
                  style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }} />
                <label htmlFor="su-consent-oauth" style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, cursor: 'pointer' }}>
                  Αποδέχομαι τους{' '}
                  <Link href="/terms" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Όρους χρήσης</Link>{' '}και την{' '}
                  <Link href="/privacy" className="lp-link" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Πολιτική απορρήτου</Link>.
                </label>
              </div>
              {consentTouched && !consent && (
                <p role="alert" style={{ fontSize: 12, color: 'var(--negative-on-container)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Χρειάζεται να αποδεχθείς τους Όρους και την Πολιτική απορρήτου για να συνεχίσεις.
                </p>
              )}
              <button type="button" onClick={acceptOauthConsent} className="auth-hov"
                style={{ width: '100%', minHeight: 44, borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Συνέχεια
              </button>
              <button type="button" onClick={signOut} disabled={signingOut}
                style={{ width: '100%', minHeight: 44, marginTop: 10, borderRadius: 8, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {signingOut ? 'Ακύρωση…' : 'Ακύρωση'}
              </button>
            </div>
          ) : sessionEmail ? (
            <AlreadySignedIn email={sessionEmail} onSignOut={signOut} signingOut={signingOut} mode="signup" />
          ) : done ? (
            <div style={{ textAlign: 'center' }} role="status">
              <div style={{ width: 56, height: 56, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--accent)' }}>
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6 12 13 2 6" /></svg>
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 8px' }}>Άνοιξε το email σου</h1>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px' }}>
                Σου στείλαμε έναν σύνδεσμο επιβεβαίωσης στο <strong style={{ color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{email}</strong>. Πάτησέ τον για να μπεις στον λογαριασμό σου{chosenPlan ? ' και να ολοκληρώσεις τη συνδρομή σου' : ''}. Δες και τον φάκελο ανεπιθύμητων.
              </p>
              <button onClick={resend} disabled={resent} style={{ display: 'inline-block', padding: '12px 24px', background: resent ? 'var(--bg-elevated)' : 'var(--accent)', border: resent ? '1px solid var(--border-default)' : 'none', borderRadius: T.radius.pill, color: resent ? 'var(--text-secondary)' : 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: resent ? 'default' : 'pointer', fontFamily: 'inherit' }}>
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

              {/* ══ Η ΠΡΟΣΚΛΗΣΗ ΛΕΓΕΤΑΙ, ΚΑΙ ΛΕΓΕΤΑΙ ΜΟΝΟ ΟΣΟ ΕΙΝΑΙ ΑΛΗΘΕΙΑ ══
                  Το `?ref=` διαβαζόταν σε κατάσταση, ταξίδευε στη Google και
                  γραφόταν στο προφίλ, αλλά δεν αποδιδόταν πουθενά: ο
                  προσκεκλημένος δεν μάθαινε ποτέ ότι η πρόσκληση καταγράφηκε,
                  ενώ το `?plan=` δίπλα του έπαιρνε ολόκληρο πλαίσιο.

                  ΓΙΑΤΙ ΔΕΝ ΓΡΑΦΕΙ «ΚΕΡΔΙΣΕΣ ΕΝΑΝ ΜΗΝΑ». Το REFEREE_TRIAL_MONTHS
                  του lib/referral υπάρχει μόνο στη βιβλιοθήκη και στο τεστ της:
                  η `redeem_referral` καταγράφει τη σύσταση και τίποτε άλλο, και
                  η `sync_comp_from_referrals` πιστώνει μήνες ΜΟΝΟ στον
                  συστήνοντα. Δώρο στον νέο χρήστη δεν απονέμει κανένας κώδικας,
                  οπότε δεν υπόσχεται κανένα κείμενο.

                  ΓΙΑΤΙ ΟΥΔΕΤΕΡΟ ΚΑΙ ΟΧΙ ΜΠΛΕ: το accent πλαίσιο ανήκει στην
                  επιλογή που έκανε ο επισκέπτης. Δύο έντονα πλαίσια στη σειρά
                  θα διάβαζαν και τα δύο ως προσφορά.

                  ΚΑΙ ΓΙΑΤΙ ΠΕΡΝΑΕΙ ΑΠΟ isReferralCode: ο κωδικός έρχεται από τη
                  διεύθυνση, δηλαδή τον γράφει ο καθένας. Οτι δεν έχει τη μορφή
                  της γεννήτριας δεν τυπώνεται στην οθόνη· ταξιδεύει όπως πριν
                  και το κρίνει ο server. */}
              {isReferralCode(refCode) && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', marginBottom: chosenPlan ? 12 : 24, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', flexShrink: 0, marginTop: 7 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                    Ηρθες με πρόσκληση. Ο κωδικός <strong style={{ color: 'var(--text-primary)' }}>{refCode.trim()}</strong> καταγράφεται στον λογαριασμό σου με την εγγραφή και μετράει σε εκείνον που σε κάλεσε. Η δοκιμή των {TRIAL_DAYS} ημερών είναι η ίδια για κάθε νέο λογαριασμό, με πρόσκληση ή χωρίς.
                  </span>
                </div>
              )}

              {/* Η ΕΠΙΛΟΓΗ ΤΟΥ ΤΙΜΟΚΑΤΑΛΟΓΟΥ, ΕΠΙΒΕΒΑΙΩΜΕΝΗ. Ο επισκέπτης πάτησε
                  μια συγκεκριμένη κάρτα· το να μην την ξαναδεί πουθενά τον
                  αφήνει να αναρωτιέται αν καταγράφηκε.

                  ΓΙΑΤΙ ΔΕΝ ΓΡΑΦΕΙ «ΚΑΜΙΑ ΧΡΕΩΣΗ». Το έγραφε όσο δεν ζητούσαμε
                  κάρτα, και ήταν αληθές τότε. Σήμερα το επόμενο βήμα ΕΙΝΑΙ η
                  κάρτα, οπότε η ίδια φράση θα στεκόταν δίπλα της λέγοντας το
                  αντίθετο. Στη θέση της μπαίνει το μόνο που ισχύει και πριν και
                  μετά: πόσο, πότε, και ότι αλλάζει όποτε θέλει ο χρήστης.

                  ΚΑΙ ΤΟ ΠΟΣΟ ΓΡΑΦΕΤΑΙ ΟΛΟΚΛΗΡΟ, ΜΕ ΤΟΝ ΚΥΚΛΟ ΤΟΥ. Το επόμενο
                  βήμα μετά την επιβεβαίωση του email είναι το ταμείο, δηλαδή
                  μια κάρτα. Ο άνθρωπος που πάτησε «ετήσια, με δύο μήνες
                  δωρεάν» πρέπει να δει ΕΔΩ τα 99,00 € που θα δει και εκεί: μια
                  εγγραφή που δείχνει άλλο ποσό από την πληρωμή είναι ο πιο
                  σίγουρος τρόπος να εγκαταλειφθεί το ταμείο.

                  ΚΑΙ ΓΙΑΤΙ ΔΕΝ ΓΡΑΦΕΙ ΕΔΩ ΤΗΝ ΗΜΕΡΟΜΗΝΙΑ ΤΗΣ ΠΡΩΤΗΣ ΧΡΕΩΣΗΣ.
                  Η οθόνη είναι `'use client'`: δεν μπορεί να ρωτήσει αν η
                  χρέωση είναι ρυθμισμένη, γιατί η απάντηση ζει σε μεταβλητή
                  περιβάλλοντος του διακομιστή. Μια καρφωτή πρόταση «χρεώνεσαι
                  την 31η ημέρα» θα ήταν ψέμα σε κάθε εγκατάσταση χωρίς
                  ρυθμισμένο ταμείο — ακριβώς το είδος του ψέματος που
                  διορθώνει ολόκληρο αυτό το πέρασμα. Η ημερομηνία λέγεται εκεί
                  που την ξέρει ο διακομιστής: στα ψιλά γράμματα του
                  τιμοκαταλόγου, στους Ορους, και στο ίδιο το ταμείο.

                  ΚΑΙ ΓΙΑΤΙ ΕΦΥΓΕ Ο ΟΡΟΣ ΓΙΑ ΤΟ ΠΑΚΕΤΟ ΕΠΑΓΓΕΛΜΑΤΙΑ. Ελεγε ότι
                  «ισχύει εφόσον δηλώσεις τον αντίστοιχο τρόπο χρήσης», γιατί ο
                  τύπος προφίλ δηλωνόταν στο καλωσόρισμα και το ταμείο απαντούσε
                  403 σε όποιον δεν τον είχε ακόμη. Πλέον τον γράφει η ίδια η
                  αγορά, στον webhook: ο όρος δεν υπάρχει, άρα δεν λέγεται. */}
              {/* ── ΤΙ ΔΙΑΛΕΞΕ, ΣΕ ΔΥΟ ΓΡΑΜΜΕΣ ΑΝΤΙ ΓΙΑ ΠΑΡΑΓΡΑΦΟ ────────────────────
                  ΗΤΑΝ ΤΡΕΙΣ ΠΡΟΤΑΣΕΙΣ ΓΥΡΩ ΑΠΟ ΜΙΑ ΚΟΥΚΚΙΔΑ, ΚΑΙ ΤΟ ΠΟΣΟ
                  ΘΑΒΟΤΑΝ ΣΤΗ ΜΕΣΗ ΤΗΣ ΠΡΩΤΗΣ. «Διάλεξες το Ιδιοκτήτης+, με
                  μηνιαία χρέωση 9,90 €. Οι πρώτες 30 ημέρες…»: ο αναγνώστης
                  διάβαζε τέσσερις σειρές για να μάθει δύο πράγματα που ήδη
                  ήξερε — τι διάλεξε και πόσο κάνει.
                  Είναι απόδειξη επιλογής, όχι κείμενο: πακέτο αριστερά, ποσό
                  δεξιά, στην ίδια γραμμή βάσης, πέρα ώς πέρα. Το «Διάλεξες»
                  φεύγει· το ότι το διάλεξε ο ίδιος δεν χρειάζεται να ειπωθεί.
                  Και η δεύτερη γραμμή κρατά ΜΟΝΟ ό,τι δεν φαίνεται αλλού: πόσο
                  κρατά η δοκιμή, και ότι η επιλογή δεν είναι δεσμευτική.
                  Η ΗΜΕΡΟΜΗΝΙΑ ΤΗΣ ΠΡΩΤΗΣ ΧΡΕΩΣΗΣ ΕΞΑΚΟΛΟΥΘΕΙ ΝΑ ΜΗ ΓΡΑΦΕΤΑΙ
                  ΕΔΩ, για τον λόγο που εξηγείται παραπάνω: η οθόνη είναι
                  πελάτης και δεν ξέρει αν η χρέωση είναι ρυθμισμένη. */}
              {chosenPlan && (
                <div style={{ padding: '13px 16px', marginBottom: 24, borderRadius: 10, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.015em' }}>
                      {PLANS[chosenPlan].name}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 650, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {chosenCycle === 'annual'
                        ? <>{fe(PLANS[chosenPlan].priceAnnual)} <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>τον χρόνο</span></>
                        : <>{fe(PLANS[chosenPlan].priceMonthly)} <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>τον μήνα</span></>}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-tertiary)' }}>
                    Δοκιμή {TRIAL_DAYS} ημερών, και αλλάζεις πακέτο όποτε θέλεις.
                  </p>
                </div>
              )}

              <button type="button" onClick={signInWithGoogle} className="auth-hov"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                    <input id="su-password" name="new-password" autoComplete="new-password" type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={PASSWORD_MIN_LABEL} required minLength={PASSWORD_MIN_LENGTH} aria-describedby="su-pw-req" style={{ ...field, paddingRight: 48 }} onFocus={focus} onBlur={e => { blur(e); setPwTouched(true) }} />
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

                {/* ── Η ΑΠΟΔΟΧΗ, ΑΚΡΙΒΩΣ ΠΑΝΩ ΑΠΟ ΤΟ ΚΟΥΜΠΙ ΠΟΥ ΤΗ ΧΡΕΙΑΖΕΤΑΙ ──────
                    Καθόταν πάνω από τις δύο πόρτες, πρώτο πράγμα κάτω από τον
                    τίτλο. Εκεί όμως ο επισκέπτης δεν έχει ακόμη αποφασίσει να
                    εγγραφεί: του ζητούσαμε να δεσμευτεί σε όρους πριν καν δει
                    τι ζητάμε από αυτόν. Και το πρώτο που έβλεπε στη σελίδα
                    «Δημιουργία λογαριασμού» ήταν ένα άδειο τετράγωνο.
                    Μπαίνει εκεί που τη διαβάζει κανείς πράγματι: τελευταία
                    γραμμή πριν το κουμπί, με τα στοιχεία ήδη συμπληρωμένα.
                    Η πόρτα της Google την εξακολουθεί να ΑΠΑΙΤΕΙ — το
                    `signInWithGoogle` δεν προχωρά χωρίς αυτήν και φέρνει το
                    βλέμμα εδώ κάτω. */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
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
                  <p role="alert" style={{ fontSize: 12, color: 'var(--negative-on-container)', margin: 0, lineHeight: 1.5 }}>
                    Χρειάζεται να αποδεχθείς τους Όρους και την Πολιτική απορρήτου για να συνεχίσεις.
                  </p>
                )}

                <button type="submit" disabled={loading || !consent || !pw.ok || leaked} className="auth-cta" style={{ width: '100%', padding: '12px', background: 'var(--accent)', border: 'none', borderRadius: T.radius.pill, color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: (loading || !consent || !pw.ok || leaked) ? 'not-allowed' : 'pointer', opacity: (loading || !consent || !pw.ok || leaked) ? 0.6 : 1, letterSpacing: '-0.01em', marginTop: 4, fontFamily: 'inherit' }}>
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
