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

export default function PasswordStrength({ password, id }: { password: string; id?: string }) {
  const pw = checkPassword(password)
  // ΤΟ ΑΠΟΤΕΛΕΣΜΑ ΚΟΥΒΑΛΑ ΤΟΝ ΚΩΔΙΚΟ ΠΟΥ ΑΦΟΡΑ, και αυτό δεν είναι λεπτομέρεια:
  // αλλιώς η προειδοποίηση για τον προηγούμενο κωδικό μένει στην οθόνη όσο ο
  // χρήστης πληκτρολογεί τον επόμενο — του λέει ότι ο ΝΕΟΣ διέρρευσε, που είναι
  // ψέμα. Με τη σύγκριση `for === password` η προειδοποίηση σβήνει μόνη της με
  // την πρώτη αλλαγή, χωρίς δεύτερη κατάσταση και χωρίς μηδενισμό μέσα σε effect.
  const [leak, setLeak] = useState<{ for: string; result: LeakCheck | null } | null>(null)

  // ΓΙΑΤΙ ΚΑΘΥΣΤΕΡΗΣΗ ΚΑΙ ΑΚΥΡΩΣΗ. Χωρίς αυτές, κάθε πλήκτρο θα έστελνε αίτημα:
  // δεκαοκτώ κλήσεις για έναν κωδικό, και οι απαντήσεις θα έφταναν ανακατεμένες
  // — η αργή απάντηση για το «Kalok» θα σκέπαζε τη γρήγορη για το «Kalokairi!».
  // Ο έλεγχος τρέχει ΜΟΝΟ όταν ο κωδικός πληροί ήδη την πολιτική ισχύος: πριν
  // από αυτό η οθόνη έχει ήδη κάτι πιο χρήσιμο να πει.
  useEffect(() => {
    if (!pw.ok) return
    const ctl = new AbortController()
    const t = setTimeout(() => {
      checkLeakedPassword(password, ctl.signal)
        .then(result => { if (!ctl.signal.aborted) setLeak({ for: password, result }) })
    }, 450)
    return () => { clearTimeout(t); ctl.abort() }
  }, [password, pw.ok])

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
                ? <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                : <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)' }} />}
            </span>
            {c.label}
          </li>
        ))}
        {pw.common && (
          <li style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--negative)' }}>
            <span aria-hidden="true" style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </span>
            Πολύ κοινός κωδικός — διάλεξε κάτι πιο μοναδικό
          </li>
        )}
        {leaked && (
          <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--negative)' }}>
            <span aria-hidden="true" style={{ width: 14, display: 'inline-flex', justifyContent: 'center', paddingTop: 2 }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </span>
            {leaked}
          </li>
        )}
      </ul>
    </div>
  )
}
