// npx tsx lib/bills/monthlyHistory.test.ts
//
// Η παραγωγή του ιστορικού από τους ίδιους τους λογαριασμούς αντικαθιστά 204
// πεδία χειρόγραφης εισαγωγής. Αν βγάζει λάθος νούμερα, ο χρήστης δεν έχει πια
// τρόπο να τα διορθώσει με το χέρι — γι' αυτό ελέγχεται και ο κανόνας ότι ό,τι
// έχει ήδη γράψει υπερισχύει.
import { monthsFor, deriveMonthlyByCategory, monthlyTotals, averageMonthly, PERIOD_MONTHS, type BillLike } from './monthlyHistory'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const eq = (n: string, got: unknown, want: unknown) =>
  ok(`${n} (${JSON.stringify(got)} = ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want))

const bill = (o: Partial<BillLike> = {}): BillLike =>
  ({ category: 'electricity', amount: 80, due_date: '2026-08-20', recurring: true, period: 'monthly', ...o })

// ── ΠΟΙΟΥΣ ΜΗΝΕΣ ΒΑΡΑΙΝΕΙ ────────────────────────────────────────────────
eq('μηνιαίος πάγιος πιάνει όλο τον χρόνο', monthsFor(bill(), 2026), [0,1,2,3,4,5,6,7,8,9,10,11])
eq('διμηνιαίος, αγκυρωμένος στον Αύγουστο', monthsFor(bill({ period: 'bimonthly' }), 2026), [1,3,5,7,9,11])
eq('τριμηνιαίος', monthsFor(bill({ period: 'quarterly' }), 2026), [1,4,7,10])
eq('ετήσιος πιάνει μόνο τον μήνα του', monthsFor(bill({ period: 'annual' }), 2026), [7])
// Ο πάγιος απλώνεται ΚΑΙ πίσω: ένα συμβόλαιο ίντερνετ που λήγει τον Αύγουστο
// δεν ξεκίνησε τον Αύγουστο.
ok('ο μηνιαίος πάγιος υπάρχει και τον Ιανουάριο', monthsFor(bill(), 2026).includes(0))

eq('εφάπαξ μόνο στον μήνα λήξης', monthsFor(bill({ recurring: false }), 2026), [7])
// Ο φύλακας «κανένα νέο ημερολόγιο υποχρεώσεων» κοιτάζει γραμμές που βάζουν
// όνομα φόρου δίπλα σε ημερομηνία — σωστά, γιατί έτσι γεννιούνται δεύτερα,
// αποκλίνοντα φορολογικά ημερολόγια. Εδώ δεν ορίζεται προθεσμία: ελέγχεται ότι
// ένας εφάπαξ ετήσιος φόρος δεν απλώνεται σε δώδεκα μήνες σαν πάγιο.
eq('εφάπαξ ετήσιος φόρος μετράει σε έναν μήνα, όχι σε δώδεκα',
   monthsFor(bill({ recurring: false, category: 'enfia', due_date: '2026-05-31' }), 2026), [4])
eq('εφάπαξ χωρίς ημερομηνία δεν μετράει πουθενά', monthsFor(bill({ recurring: false, due_date: '' }), 2026), [])
eq('εφάπαξ άλλου έτους δεν μετράει', monthsFor(bill({ recurring: false, due_date: '2025-08-20' }), 2026), [])
eq('πάγιος χωρίς ημερομηνία τρέχει όλο τον χρόνο', monthsFor(bill({ due_date: null }), 2026), [0,1,2,3,4,5,6,7,8,9,10,11])
eq('άγνωστη περίοδος θεωρείται μηνιαία', monthsFor(bill({ period: 'κάτι άλλο' }), 2026).length, 12)
eq('χαλασμένη ημερομηνία δεν σπάει τίποτα', monthsFor(bill({ recurring: false, due_date: 'χθες' }), 2026), [])
ok('ο πίνακας περιόδων καλύπτει τις πέντε', Object.keys(PERIOD_MONTHS).length === 5)

// ── ΤΑ ΣΥΝΟΛΑ ────────────────────────────────────────────────────────────
{
  const bills = [
    bill({ category: 'electricity', amount: 80 }),                                   // 80 κάθε μήνα
    bill({ category: 'internet', amount: 35 }),                                      // 35 κάθε μήνα
    bill({ category: 'enfia', amount: 420, recurring: false, due_date: '2026-05-31' }),   // εφάπαξ
  ]
  const by = deriveMonthlyByCategory(bills, 2026)
  eq('το ρεύμα σε κάθε μήνα', by.electricity[0], 80)
  eq('ο εφάπαξ πέφτει σε έναν μόνο μήνα', by.enfia, [0,0,0,0,420,0,0,0,0,0,0,0])
  const t = monthlyTotals(by)
  eq('Ιανουάριος: μόνο τα πάγια', t[0], 115)
  eq('ο μήνας του εφάπαξ: πάγια συν αυτό', t[4], 535)
  eq('μέσος όρος μόνο των μηνών με κίνηση', averageMonthly(t), Math.round(((115 * 11 + 535) / 12) * 100) / 100)
}
{
  // Δύο λογαριασμοί ίδιας κατηγορίας αθροίζονται, δεν αντικαθιστά ο ένας τον άλλον.
  const by = deriveMonthlyByCategory([bill({ amount: 80 }), bill({ amount: 20 })], 2026)
  eq('δύο λογαριασμοί ρεύματος αθροίζονται', by.electricity[3], 100)
}
{
  // Ποσά με λεπτά δεν παράγουν σφάλμα κινητής υποδιαστολής.
  const by = deriveMonthlyByCategory([bill({ amount: 0.1 }), bill({ amount: 0.2 })], 2026)
  eq('0,10 συν 0,20 κάνει 0,30', by.electricity[0], 0.3)
}

// ── Ο,ΤΙ ΕΓΡΑΨΕ Ο ΧΡΗΣΤΗΣ ΥΠΕΡΙΣΧΥΕΙ ─────────────────────────────────────
{
  const stored = { electricity: ['', '', '', '145', '', '', '', '', '', '', '', ''] }
  const by = deriveMonthlyByCategory([bill({ amount: 80 })], 2026, stored)
  eq('ο μήνας που συμπλήρωσε ο χρήστης κρατάει τη δική του τιμή', by.electricity[3], 145)
  eq('οι υπόλοιποι μένουν υπολογισμένοι', by.electricity[2], 80)
}
{
  // Κατηγορία που υπάρχει ΜΟΝΟ στο αποθηκευμένο ιστορικό δεν χάνεται: ο χρήστης
  // μπορεί να έγραψε κάτι για το οποίο δεν κατέγραψε ποτέ λογαριασμό.
  const by = deriveMonthlyByCategory([], 2026, { water: ['12', '', '', '', '', '', '', '', '', '', '', ''] })
  eq('παλιά καταχώριση χωρίς λογαριασμό επιβιώνει', by.water?.[0], 12)
}
{
  const by = deriveMonthlyByCategory([bill({ amount: 80 })], 2026, { electricity: ['0', '', '', '', '', '', '', '', '', '', '', ''] })
  eq('μηδέν δεν θεωρείται δήλωση του χρήστη', by.electricity[0], 80)
}

// ── ΑΚΡΑ ─────────────────────────────────────────────────────────────────
eq('χωρίς λογαριασμούς, χωρίς σύνολα', monthlyTotals(deriveMonthlyByCategory([], 2026)), [0,0,0,0,0,0,0,0,0,0,0,0])
eq('μέσος όρος κενού είναι μηδέν', averageMonthly([0,0,0,0,0,0,0,0,0,0,0,0]), 0)
eq('ποσό μη αριθμός αγνοείται', monthlyTotals(deriveMonthlyByCategory([bill({ amount: NaN })], 2026))[0], 0)
eq('μηδενικό ποσό αγνοείται', monthlyTotals(deriveMonthlyByCategory([bill({ amount: 0 })], 2026))[0], 0)

console.log(fail === 0 ? `✓ monthlyHistory: ${pass} έλεγχοι πέρασαν` : `✗ monthlyHistory: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
