// Τεστ για το ταίριασμα λογαριασμού με την πληρωμή του.
// Η βασική αρχή που ελέγχεται: ΠΟΤΕ λάθος ταίριασμα. Ένα ψευδώς «πληρωμένο»
// είναι χειρότερο από κανένα ταίριασμα, γιατί ο ιδιοκτήτης χάνει την προθεσμία
// εμπιστευόμενος την οθόνη.
import {
  matchPayments, evaluate, normalizeProvider, explainPair,
  AMOUNT_TOLERANCE, DAYS_AFTER_DUE,
  type Payable, type Payment,
} from './matching'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

const bill = (p: Partial<Payable> & { id: string }): Payable =>
  ({ provider: 'ΔΕΗ', amount: 88.5, issueDate: '2026-06-10', dueDate: '2026-06-30', ...p })
const pay = (p: Partial<Payment> & { id: string }): Payment =>
  ({ provider: 'ΔΕΗ', amount: 88.5, paidDate: '2026-06-28', ...p })

// ── Κανονικοποίηση παρόχου ─────────────────────────────────────────────────
ok('πεζά/κεφαλαία', normalizeProvider('δεη') === normalizeProvider('ΔΕΗ'))
ok('τελείες', normalizeProvider('Δ.Ε.Η.') === normalizeProvider('ΔΕΗ'))
ok('κενά', normalizeProvider(' ΔΕΗ ') === normalizeProvider('ΔΕΗ'))
ok('εταιρική κατάληξη', normalizeProvider('ΔΕΗ Α.Ε.') === normalizeProvider('ΔΕΗ'))
ok('διαφορετικοί πάροχοι μένουν διαφορετικοί', normalizeProvider('ΔΕΗ') !== normalizeProvider('ΕΥΔΑΠ'))
ok('κενό μένει κενό', normalizeProvider(null) === '')

// ── Το απλό, σωστό ταίριασμα ───────────────────────────────────────────────
{
  const r = matchPayments([bill({ id: 'b1' })], [pay({ id: 'p1' })])
  ok('ταιριάζει ο λογαριασμός με την απόδειξη', r.pairs.length === 1)
  ok('σωστό ζευγάρι', r.pairs[0].billId === 'b1' && r.pairs[0].paymentId === 'p1')
  ok('κανένας ασυνόδευτος', r.unmatchedBills.length === 0 && r.unmatchedPayments.length === 0)
  ok('εξήγηση: πληρώθηκε πριν τη λήξη', explainPair(r.pairs[0].reason) === 'Πληρώθηκε 2 μέρες πριν τη λήξη')
}

// ── ΔΕΝ ταιριάζει όταν δεν πρέπει ──────────────────────────────────────────
{
  const diffProvider = matchPayments([bill({ id: 'b1' })], [pay({ id: 'p1', provider: 'ΕΥΔΑΠ' })])
  ok('άλλος πάροχος δεν ταιριάζει', diffProvider.pairs.length === 0)

  const partial = matchPayments([bill({ id: 'b1' })], [pay({ id: 'p1', amount: 50 })])
  ok('ΜΕΡΙΚΗ πληρωμή ΔΕΝ ταιριάζει', partial.pairs.length === 0)

  const bigger = matchPayments([bill({ id: 'b1' })], [pay({ id: 'p1', amount: 88.6 })])
  ok('διαφορά 10 λεπτών δεν ταιριάζει', bigger.pairs.length === 0)

  const early = matchPayments([bill({ id: 'b1' })], [pay({ id: 'p1', paidDate: '2026-05-01' })])
  ok('πληρωμή πολύ πριν την έκδοση δεν ταιριάζει', early.pairs.length === 0)

  const late = matchPayments([bill({ id: 'b1' })], [pay({ id: 'p1', paidDate: '2026-12-31' })])
  ok('πληρωμή έξι μήνες μετά δεν ταιριάζει', late.pairs.length === 0)

  const noProvider = matchPayments([bill({ id: 'b1', provider: null })], [pay({ id: 'p1', provider: null })])
  ok('δύο κενοί πάροχοι ΔΕΝ θεωρούνται ίδιοι', noProvider.pairs.length === 0)

  const noAmount = matchPayments([bill({ id: 'b1', amount: null })], [pay({ id: 'p1', amount: null })])
  ok('δύο κενά ποσά ΔΕΝ θεωρούνται ίδια', noAmount.pairs.length === 0)

  const noDate = matchPayments([bill({ id: 'b1' })], [pay({ id: 'p1', paidDate: null })])
  ok('πληρωμή χωρίς ημερομηνία δεν ταιριάζει', noDate.pairs.length === 0)
}

// ── Ανοχή: μόνο για στρογγυλοποίηση ────────────────────────────────────────
{
  const cent = matchPayments([bill({ id: 'b1', amount: 88.5 })], [pay({ id: 'p1', amount: 88.51 })])
  ok('ένα λεπτό διαφορά ταιριάζει (στρογγυλοποίηση)', cent.pairs.length === 1)
  ok('η ανοχή είναι πράγματι μικρή', AMOUNT_TOLERANCE < 0.02)
}

// ── Χρονικά όρια ───────────────────────────────────────────────────────────
{
  const atLimit = matchPayments([bill({ id: 'b1' })],
    [pay({ id: 'p1', paidDate: '2026-09-28' })])   // 90 μέρες μετά τη λήξη
  ok('ακριβώς στο όριο των 90 ημερών ταιριάζει', atLimit.pairs.length === 1)

  const past = matchPayments([bill({ id: 'b1' })], [pay({ id: 'p1', paidDate: '2026-09-29' })])
  ok('μία μέρα πέρα από το όριο δεν ταιριάζει', past.pairs.length === 0)
  ok('το όριο είναι τρεις μήνες', DAYS_AFTER_DUE === 90)

  const slightlyEarly = matchPayments([bill({ id: 'b1' })], [pay({ id: 'p1', paidDate: '2026-06-08' })])
  ok('δύο μέρες πριν την έκδοση συγχωρείται (σάρωση διαβάζει λάθος ημερομηνίες)',
     slightlyEarly.pairs.length === 1)
}

// ── ΤΟ ΚΡΙΣΙΜΟ: ένα προς ένα ───────────────────────────────────────────────
// Δύο λογαριασμοί ΔΕΗ ίδιου ποσού σε γειτονικούς μήνες, μία απόδειξη.
{
  const bills = [
    bill({ id: 'iounios', issueDate: '2026-06-10', dueDate: '2026-06-30' }),
    bill({ id: 'ioulios', issueDate: '2026-07-10', dueDate: '2026-07-31' }),
  ]
  const r = matchPayments(bills, [pay({ id: 'p1', paidDate: '2026-06-28' })])
  ok('η απόδειξη δένεται σε ΕΝΑΝ μόνο λογαριασμό', r.pairs.length === 1)
  ok('…και μάλιστα στον χρονικά κοντινότερο', r.pairs[0].billId === 'iounios')
  ok('ο άλλος μένει σωστά ασυνόδευτος', r.unmatchedBills.join() === 'ioulios')
}
{
  // Δύο αποδείξεις, ένας λογαριασμός: δεν διπλοδένεται.
  const r = matchPayments([bill({ id: 'b1' })], [
    pay({ id: 'p1', paidDate: '2026-06-28' }),
    pay({ id: 'p2', paidDate: '2026-06-29' }),
  ])
  ok('ένας λογαριασμός δεν παίρνει δύο αποδείξεις', r.pairs.length === 1)
  ok('η περισσευούμενη απόδειξη επισημαίνεται', r.unmatchedPayments.length === 1)
}

// ── Σταθερότητα: ίδια είσοδος, ίδιο αποτέλεσμα, ανεξάρτητα από σειρά ───────
{
  const bills = [bill({ id: 'b1' }), bill({ id: 'b2', issueDate: '2026-07-10', dueDate: '2026-07-31' })]
  const pays = [pay({ id: 'p1' }), pay({ id: 'p2', paidDate: '2026-07-29' })]
  const a = matchPayments(bills, pays)
  const b = matchPayments(bills.slice().reverse(), pays.slice().reverse())
  ok('το αποτέλεσμα δεν εξαρτάται από τη σειρά εισόδου',
     JSON.stringify(a.pairs.map(p => [p.billId, p.paymentId]).sort()) ===
     JSON.stringify(b.pairs.map(p => [p.billId, p.paymentId]).sort()))
  ok('και τα δύο ζευγάρια βρέθηκαν σωστά', a.pairs.length === 2)
}

// ── Ασυνόδευτοι: αυτό που θέλει να δει ο ιδιοκτήτης ────────────────────────
{
  const r = matchPayments(
    [bill({ id: 'b1' }), bill({ id: 'b2', amount: 500, issueDate: '2026-06-01', dueDate: '2026-06-15' })],
    [pay({ id: 'p1' })],
  )
  ok('ο απλήρωτος λογαριασμός επισημαίνεται', r.unmatchedBills.join() === 'b2')
  ok('ο πληρωμένος δεν επισημαίνεται', !r.unmatchedBills.includes('b1'))
}

// ── Εξηγήσεις ──────────────────────────────────────────────────────────────
{
  const same = evaluate(bill({ id: 'b' }), pay({ id: 'p', paidDate: '2026-06-30' }))
  ok('πληρωμή την ημέρα λήξης', explainPair(same.reason) === 'Πληρώθηκε την ημέρα λήξης')
  const after = evaluate(bill({ id: 'b' }), pay({ id: 'p', paidDate: '2026-07-05' }))
  ok('καθυστερημένη πληρωμή το λέει', explainPair(after.reason) === 'Πληρώθηκε 5 μέρες μετά τη λήξη')
  ok('ενικός σε μία μέρα',
     explainPair(evaluate(bill({ id: 'b' }), pay({ id: 'p', paidDate: '2026-07-01' })).reason)
       === 'Πληρώθηκε 1 μέρα μετά τη λήξη')

  const why = evaluate(bill({ id: 'b' }), pay({ id: 'p', amount: 50 }))
  ok('η αποτυχία λέει ΠΟΙΟ κριτήριο έπεσε',
     why.reason.providerMatched && !why.reason.amountMatched)
}

// ── Κενές είσοδοι ──────────────────────────────────────────────────────────
{
  const r = matchPayments([], [])
  ok('κενή είσοδος δεν σκάει', r.pairs.length === 0)
  const onlyBills = matchPayments([bill({ id: 'b1' })], [])
  ok('χωρίς αποδείξεις, όλοι ασυνόδευτοι', onlyBills.unmatchedBills.length === 1)
}

console.log(`archive/matching.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
