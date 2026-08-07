// npx tsx lib/rent/frequency.test.ts
//
// Η ΑΝΑΛΛΟΙΩΤΗ ΠΟΥ ΦΥΛΑΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ: όποια κι αν είναι η συχνότητα, το
// ΕΤΗΣΙΟ εισπραττόμενο μένει δώδεκα μισθώματα. Αν κάποτε αλλάξει το βήμα και
// ξεχαστεί ο πολλαπλασιαστής (ή το ανάποδο), το άθροισμα πέφτει στο μισό ή στο
// ένα τρίτο — και μαζί του το Ε2 και ο φόρος του ιδιοκτήτη.
import {
  instalmentPeriods, monthsPerInstalment, periodLabel,
  PAYMENT_FREQ_LABELS, isPaymentFreq, type PaymentFreq,
} from './frequency'
import { monthNom } from '../core/months'

let pass = 0, fail = 0
function ok(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error('✗ ' + name) } }
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++; else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`) }
}

// ═══ ΤΟ ΒΗΜΑ ═══════════════════════════════════════════════════════════════
eq('μηνιαία → 1 μήνας', monthsPerInstalment('monthly'), 1)
eq('διμηνιαία → 2 μήνες', monthsPerInstalment('bimonthly'), 2)
eq('τριμηνιαία → 3 μήνες', monthsPerInstalment('quarterly'), 3)
eq('κενή τιμή → μηνιαία', monthsPerInstalment(null), 1)
eq('άγνωστη τιμή → μηνιαία', monthsPerInstalment('weekly' as PaymentFreq), 1)

// ═══ ΤΟ ΠΛΗΘΟΣ ΔΟΣΕΩΝ ΑΝΑ ΕΤΟΣ ═════════════════════════════════════════════
const yearOf = (freq: PaymentFreq) => instalmentPeriods({
  startISO: '2026-01-01', lastYear: 2026, lastMonth: 12, freq, dueDay: 1,
})
eq('μηνιαία → 12 δόσεις', yearOf('monthly').length, 12)
eq('διμηνιαία → 6 δόσεις', yearOf('bimonthly').length, 6)
eq('τριμηνιαία → 4 δόσεις', yearOf('quarterly').length, 4)

// ═══ Η ΑΝΑΛΛΟΙΩΤΗ: ΔΩΔΕΚΑ ΜΙΣΘΩΜΑΤΑ, ΠΑΝΤΑ ════════════════════════════════
// Αυτός είναι ο έλεγχος για τον οποίο γράφτηκε το αρχείο.
{
  const MONTHLY_RENT = 750
  let bad = ''
  for (const f of ['monthly', 'bimonthly', 'quarterly'] as PaymentFreq[]) {
    const total = yearOf(f).reduce((s, p) => s + p.months * MONTHLY_RENT, 0)
    if (total !== MONTHLY_RENT * 12) bad = `${f}: ${total}`
  }
  eq('κάθε συχνότητα εισπράττει 12 μισθώματα τον χρόνο', bad, '')
}

// ═══ ΟΙ ΜΗΝΕΣ ΠΟΥ ΠΕΦΤΟΥΝ ΟΙ ΔΟΣΕΙΣ ════════════════════════════════════════
eq('τριμηνιαία: Ιαν, Απρ, Ιουλ, Οκτ', yearOf('quarterly').map(p => p.month), [1, 4, 7, 10])
eq('διμηνιαία: Ιαν, Μαρ, Μαι, Ιουλ, Σεπ, Νοε', yearOf('bimonthly').map(p => p.month), [1, 3, 5, 7, 9, 11])

// ═══ ΠΕΡΑΣΜΑ ΧΡΟΝΙΑΣ ═══════════════════════════════════════════════════════
// Έναρξη Νοέμβριο, τριμηνιαία: Νοε 2025 → Φεβ 2026 → Μαι 2026.
{
  const p = instalmentPeriods({ startISO: '2025-11-01', lastYear: 2026, lastMonth: 6, freq: 'quarterly', dueDay: 5 })
  eq('τριμηνιαία που περνά χρονιά', p.map(x => `${x.year}-${x.month}`), ['2025-11', '2026-2', '2026-5'])
  eq('η ημέρα λήξης μπαίνει σωστά', p[1].due_date, '2026-02-05')
}

// ═══ ΤΟ ΟΡΙΟ ═══════════════════════════════════════════════════════════════
// Μια τριμηνιαία δόση που ΑΡΧΙΖΕΙ στο όριο δημιουργείται· η επόμενη όχι.
{
  const p = instalmentPeriods({ startISO: '2026-01-01', lastYear: 2026, lastMonth: 4, freq: 'quarterly', dueDay: 1 })
  eq('η δόση που αρχίζει στο όριο μπαίνει', p.map(x => x.month), [1, 4])
}

// ═══ ΗΜΕΡΑ ΛΗΞΗΣ: ΦΡΑΓΜΑ ΣΤΟ 28 ═══════════════════════════════════════════
// Η 31η δεν υπάρχει στον Φεβρουάριο. Το φράγμα στο 28 σημαίνει ότι ΚΑΘΕ μήνας
// έχει την ημέρα — αλλιώς η δόση Φεβρουαρίου θα έπαιρνε ανύπαρκτη ημερομηνία.
{
  const p = instalmentPeriods({ startISO: '2026-02-01', lastYear: 2026, lastMonth: 2, freq: 'monthly', dueDay: 31 })
  eq('η 31η γίνεται 28η', p[0].due_date, '2026-02-28')
  const z = instalmentPeriods({ startISO: '2026-02-01', lastYear: 2026, lastMonth: 2, freq: 'monthly', dueDay: 0 })
  eq('το μηδέν γίνεται 1η', z[0].due_date, '2026-02-01')
}

// ═══ ΧΑΛΑΣΜΕΝΗ ΕΙΣΟΔΟΣ ═════════════════════════════════════════════════════
eq('κενή έναρξη → καμία δόση', instalmentPeriods({ startISO: '', lastYear: 2026, lastMonth: 12, freq: 'monthly', dueDay: 1 }).length, 0)
eq('άκυρη έναρξη → καμία δόση', instalmentPeriods({ startISO: 'αύριο', lastYear: 2026, lastMonth: 12, freq: 'monthly', dueDay: 1 }).length, 0)
eq('όριο πριν την έναρξη → καμία δόση', instalmentPeriods({ startISO: '2026-06-01', lastYear: 2026, lastMonth: 3, freq: 'monthly', dueDay: 1 }).length, 0)
ok('φρουρός: παλιά έναρξη δεν γεννά χιλιάδες γραμμές',
  instalmentPeriods({ startISO: '1900-01-01', lastYear: 2400, lastMonth: 12, freq: 'monthly', dueDay: 1 }).length <= 600)

// ═══ Η ΕΤΙΚΕΤΑ ═════════════════════════════════════════════════════════════
eq('μηνιαία ετικέτα', periodLabel(2026, 1, 1, monthNom), 'Ιανουάριος 2026')
eq('τριμηνιαία ετικέτα', periodLabel(2026, 1, 3, monthNom), 'Ιανουάριος – Μάρτιος 2026')
eq('διμηνιαία ετικέτα', periodLabel(2026, 5, 2, monthNom), 'Μάιος – Ιούνιος 2026')
eq('ετικέτα που περνά χρονιά', periodLabel(2025, 12, 3, monthNom), 'Δεκέμβριος 2025 – Φεβρουάριος 2026')
eq('μηδέν μήνες → σαν μηνιαία', periodLabel(2026, 7, 0, monthNom), 'Ιούλιος 2026')

// ═══ ΟΙ ΕΤΙΚΕΤΕΣ ΚΑΙ Ο ΦΥΛΑΚΑΣ ═════════════════════════════════════════════
eq('τρεις επιλογές, ούτε μία παραπάνω', Object.keys(PAYMENT_FREQ_LABELS).length, 3)
ok('ο φύλακας δέχεται τις τρεις', (['monthly', 'bimonthly', 'quarterly'] as string[]).every(isPaymentFreq))
ok('ο φύλακας απορρίπτει τα υπόλοιπα', !isPaymentFreq('bi-monthly') && !isPaymentFreq('') && !isPaymentFreq('toString'))

console.log(fail === 0 ? `✓ frequency: ${pass} έλεγχοι πέρασαν` : `✗ frequency: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
