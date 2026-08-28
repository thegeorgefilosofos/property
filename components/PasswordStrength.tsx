'use client'

// ═══════════════════════════════════════════════════════════════════════════
// PasswordStrength — μετρητής ισχύος + λίστα προϋποθέσεων κωδικού. Ένα κοινό,
// theme-aware component για κάθε φόρμα που ορίζει κωδικό (εγγραφή, επαναφορά,
// αλλαγή στις ρυθμίσεις). Στηρίζεται μόνο σε CSS variables, ώστε να δείχνει
// σωστά και στις auth σελίδες και μέσα στον πίνακα.
//
// Ο ΕΛΕΓΧΟΣ ΔΙΑΡΡΟΗΣ ΜΠΑΙΝΕΙ ΕΔΩ, ΟΧΙ ΣΕ ΤΡΕΙΣ ΟΘΟΝΕΣ. Εγγραφή, επαναφορά και
// αλλαγή κωδικού περνούν όλες από αυτό το component· αν ο έλεγχος γραφόταν στην
// καθεμία, θα ήταν τρεις υλοποιήσεις με τρεις ευκαιρίες να διαφωνήσουν — και η
// μία θα ξεχνιόταν. Η πολιτική ισχύος από κάτω δεν αντικαθίσταται: ο έλεγχος
// διαρροής πιάνει τον ΙΣΧΥΡΟ κωδικό που ο χρήστης έχει ήδη κάψει αλλού.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import { checkPassword } from '@/lib/auth/password'
import { checkLeakedPassword, leakMessage, type LeakCheck } from '@/lib/auth/leakedPassword'

/**
 * Η ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΗΤΑΝ ΜΟΝΟ ΣΥΜΒΟΥΛΕΥΤΙΚΗ, ΚΑΙ ΑΥΤΟ ΑΚΥΡΩΝΕ ΤΟΝ ΣΚΟΠΟ ΤΗΣ.
 *
 * Ο έλεγχος διαρροής έτρεχε σωστά και το μήνυμα εμφανιζόταν σωστά — και μετά ο
 * χρήστης πατούσε «Εγγραφή» και ο κωδικός γινόταν δεκτός. Καμία από τις τρεις
 * οθόνες δεν το ήξερε: το εύρημα ζούσε ΜΟΝΟ μέσα σε αυτό το component και οι
 * συνθήκες υποβολής κοιτούσαν αποκλειστικά την πολιτική ισχύος (`pw.ok`).
 *
 * Ο κίνδυνος που καλύπτει αυτός ο έλεγχος είναι το credential stuffing: ο
 * επιτιθέμενος δεν μαντεύει, δοκιμάζει ζεύγη email/κωδικού που ΗΔΗ ξέρει.
 * Απέναντι σε αυτό, μια προειδοποίηση που μπορείς να προσπεράσεις δεν κάνει
 * τίποτα. Το πρότυπο NIST SP 800-63B το λέει ρητά: κωδικός που βρίσκεται σε
 * γνωστό σύνολο διαρροών ΑΠΟΡΡΙΠΤΕΤΑΙ, δεν σχολιάζεται.
 *
 * ΓΙΑΤΙ ΕΠΙΣΤΡΕΦΕΤΑΙ Ο ΚΩΔΙΚΟΣ ΚΑΙ ΟΧΙ ΕΝΑ boolean. Ένα `true` θα έμενε αληθές
 * όσο ο χρήστης πληκτρολογεί τον ΕΠΟΜΕΝΟ κωδικό, μέχρι να απαντήσει ο νέος
 * έλεγχος — δηλαδή θα μπλόκαρε κωδικό για τον οποίο δεν ξέρουμε τίποτα. Με τον
 * ίδιο τον κωδικό, ο γονέας συγκρίνει (`leakedPw === password`) και η φραγή
 * παύει μόνη της με τον πρώτο χαρακτήρα. Ίδιο τέχνασμα με το `leak.for` εδώ.
 *
 * ΚΑΙ ΣΥΝΕΧΙΖΕΙ ΝΑ ΑΠΟΤΥΓΧΑΝΕΙ ΑΝΟΙΧΤΑ. Όταν πέσει το δίκτυο, δεν καλείται
 * ποτέ με κωδικό, ο γονέας μένει με `null` και η υποβολή προχωρά.
 */
export default function PasswordStrength({ password, id, onLeaked }: {
  password: string;
  id?: string;
  /**
   * Ο κωδικός που βρέθηκε σε διαρροή, ή `null`. Δες το σχόλιο από πάνω.
   *
   * ΠΡΕΠΕΙ ΝΑ ΕΙΝΑΙ ΣΤΑΘΕΡΗ ΑΝΑΦΟΡΑ — ο setter ενός `useState` κάνει ακριβώς
   * αυτή τη δουλειά. Είναι εξάρτηση του effect: ένα ανώνυμο βέλος γραμμένο μέσα
   * στο JSX αλλάζει ταυτότητα σε κάθε απόδοση και θα ξανάστηνε τον χρονιστή
   * ασταμάτητα, δηλαδή αίτημα δικτύου ανά απόδοση.
   */
  onLeaked?: (leakedPassword: string | null) => void;
}) {
  const pw = checkPassword(password)
  // ΤΟ ΑΠΟΤΕΛΕΣΜΑ ΚΟΥΒΑΛΑ ΤΟΝ ΚΩΔΙΚΟ ΠΟΥ ΑΦΟΡΑ και αυτό δεν είναι λεπτομέρεια:
  // αλλιώς η προειδοποίηση για τον προηγούμενο κωδικό μένει στην οθόνη όσο ο
  // χρήστης πληκτρολογεί τον επόμενο — του λέει ότι ο ΝΕΟΣ διέρρευσε, που είναι
  // ψέμα. Με τη σύγκριση `for === password` η προειδοποίηση σβήνει μόνη της με
  // την πρώτη αλλαγή, χωρίς δεύτερη κατάσταση και χωρίς μηδενισμό μέσα σε effect.
  const [leak, setLeak] = useState<{ for: string; result: LeakCheck | null } | null>(null)

  // ΓΙΑΤΙ ΚΑΘΥΣΤΕΡΗΣΗ ΚΑΙ ΑΚΥΡΩΣΗ. Χωρίς αυτές, κάθε πλήκτρο θα έστελνε αίτημα:
  // δεκαοκτώ κλήσεις για έναν κωδικό και οι απαντήσεις θα έφταναν ανακατεμένες
  // — η αργή απάντηση για το «Kalok» θα σκέπαζε τη γρήγορη για το «Kalokairi!».
  // Ο έλεγχος τρέχει ΜΟΝΟ όταν ο κωδικός πληροί ήδη την πολιτική ισχύος: πριν
  // από αυτό η οθόνη έχει ήδη κάτι πιο χρήσιμο να πει.
  useEffect(() => {
    if (!pw.ok) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      checkLeakedPassword(password, ctl.signal)
        .then(result => {
          if (ctl.signal.aborted) return
          setLeak({ for: password, result })
          // Η ειδοποίηση φεύγει από ΕΔΩ, μέσα στην ασύγχρονη απάντηση και όχι
          // από effect που παρακολουθεί το αποτέλεσμα: το δεύτερο θα ήταν
          // setState μέσα σε effect, ακριβώς το μοτίβο που ο linter μετρά ήδη
          // εξήντα δύο φορές σε αυτό το έργο και δεν επιτρέπεται να μεγαλώσει.
          onLeaked?.(result?.leaked ? password : null)
        })
    }, 450)
    return () => { clearTimeout(t); ctl.abort() }
  }, [password, pw.ok, onLeaked])

  const leaked = leak?.for === password ? leakMessage(leak.result) : null
  const barColor = pw.score <= 2 ? 'var(--negative)'
    : pw.score <= 4 ? 'var(--warning, #d0a000)'
    : 'var(--positive, var(--accent))'

  return (
    <div id={id} style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 3,
            background: i < pw.score ? barColor : 'var(--border-subtle)',
            transition: 'background .15s',
          }} />
        ))}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
        {pw.checks.map(c => (
          <li key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: c.ok ? 'var(--positive, var(--accent))' : 'var(--text-tertiary)' }}>
            <span aria-hidden="true" style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
              {c.ok
                ? <svg aria-hidden="true" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                : <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)' }} />}
            </span>
            {c.label}
          </li>
        ))}
        {pw.common && (
          <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--negative)' }}>
            <span aria-hidden="true" style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
              <svg aria-hidden="true" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </span>
            Πολύ κοινός κωδικός: διάλεξε κάτι πιο μοναδικό
          </li>
        )}
        {leaked && (
          <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--negative)' }}>
            <span aria-hidden="true" style={{ width: 14, display: 'inline-flex', justifyContent: 'center', paddingTop: 2 }}>
              <svg aria-hidden="true" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </span>
            {leaked}
          </li>
        )}
      </ul>
    </div>
  )
}
