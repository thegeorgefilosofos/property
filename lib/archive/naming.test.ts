// Τεστ για το τυποποιημένο όνομα αρχείου.
// Ο κεντρικός ισχυρισμός: ΚΑΘΕ όνομα έχει ακριβώς το ίδιο μήκος, ό,τι κι αν
// λείπει — γιατί πάνω σε αυτό στηρίζεται η ταξινόμηση στον φάκελο του λογιστή.
import {
  buildName, billName, paymentName, contractName, assignSequences,
  sanitizeSegment, fit, slotDate, slotAmount, slotYear,
  NAME_LENGTH, SLOT_WIDTH, PROVIDER_WIDTH, EMPTY_SLOT, KIND_TAG, SLOT_LABELS,
  type DocKind,
} from './naming'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const stem = (n: string) => n.replace(/\.[a-z0-9]+$/, '')

// ── Πεδία ───────────────────────────────────────────────────────────────────
ok('ημερομηνία σε 10 χαρακτήρες', slotDate('2026-06-10') === '2026-06-10')
ok('ημερομηνία με ώρα κόβεται σωστά', slotDate('2026-06-10T22:31:00Z') === '2026-06-10')
ok('κενή ημερομηνία γίνεται placeholder', slotDate(null) === EMPTY_SLOT)
ok('άκυρη ημερομηνία γίνεται placeholder', slotDate('όχι ημερομηνία') === EMPTY_SLOT)
ok('κάθε ημερομηνία έχει πλάτος 10', slotDate('2026-06-10').length === SLOT_WIDTH)

ok('ποσό με μηδενικά και κόμμα', slotAmount(88.5) === '0000088,50')
ok('ακέραιο ποσό παίρνει δεκαδικά', slotAmount(340) === '0000340,00')
ok('μηδέν', slotAmount(0) === '0000000,00')
ok('αρνητικό (υπόλοιπο)', slotAmount(-88.5) === '-000088,50')
ok('κενό ποσό', slotAmount(null) === EMPTY_SLOT)
ok('στρογγυλοποίηση στα δύο δεκαδικά', slotAmount(12.345) === '0000012,35')
ok('κάθε ποσό έχει πλάτος 10',
   [0, 1, 88.5, -3, 999999.99, 12.345].every(v => slotAmount(v).length === SLOT_WIDTH))
ok('υπερμεγέθες ποσό δεν σπάει το πλάτος', slotAmount(99_999_999).length === SLOT_WIDTH)
ok('NaN γίνεται placeholder', slotAmount(Number.NaN) === EMPTY_SLOT)

ok('έτος σε πεδίο', slotYear(2025).startsWith('2025'))
ok('έτος έχει πλάτος 10', slotYear(2025).length === SLOT_WIDTH)
ok('άκυρο έτος', slotYear('χ') === EMPTY_SLOT)

// ── Καθάρισμα ───────────────────────────────────────────────────────────────
ok('κεφαλαία', sanitizeSegment('δεη') === 'ΔΕΗ')
ok('κόβει κάθετες που σπάνε διαδρομές', !sanitizeSegment('Α/Β').includes('/'))
ok('κόβει την κάτω παύλα, που είναι διαχωριστικό', !sanitizeSegment('Α_Β').includes('_'))
ok('μαζεύει πολλαπλά κενά', sanitizeSegment('Α   Β') === 'Α Β')
ok('κενό γίνεται κενό', sanitizeSegment(null) === '')

ok('fit γεμίζει με τελείες', fit('ΑΒ', 5) === 'ΑΒ...')
ok('fit κόβει', fit('ΑΒΓΔΕΖ', 3) === 'ΑΒΓ')
ok('fit αφήνει ίσο ανέπαφο', fit('ΑΒΓ', 3) === 'ΑΒΓ')
ok('το γέμισμα ΔΕΝ είναι κενά (τα κόβουν τα filesystems)', !fit('ΑΒ', 6).includes(' '))

// ── Λογαριασμός ─────────────────────────────────────────────────────────────
{
  const n = billName({ provider: 'ΔΕΗ', issueDate: '2026-06-10', dueDate: '2026-06-30', amount: 88.5, seq: 42, ext: 'pdf' })
  ok('λογαριασμός: σωστό μήκος', stem(n).length === NAME_LENGTH)
  ok('λογαριασμός: μήνας μπροστά', n.startsWith('2026-06_'))
  ok('λογαριασμός: αύξων τετραψήφιος', n.slice(8, 12) === '0042')
  ok('λογαριασμός: ετικέτα τύπου', n.includes(`_${KIND_TAG.bill}_`))
  ok('λογαριασμός: πάροχος', n.includes('ΔΕΗ'))
  ok('λογαριασμός: και οι δύο ημερομηνίες', n.includes('2026-06-10') && n.includes('2026-06-30'))
  ok('λογαριασμός: ποσό', n.includes('0000088,50'))
  ok('λογαριασμός: κατάληξη', n.endsWith('.pdf'))
}

// ── Πληρωμή ─────────────────────────────────────────────────────────────────
{
  const n = paymentName({ provider: 'ΔΕΗ', paidDate: '2026-06-28', amount: 88.5, balance: 0, seq: 7, ext: 'pdf' })
  ok('πληρωμή: σωστό μήκος', stem(n).length === NAME_LENGTH)
  ok('πληρωμή: ετικέτα', n.includes(`_${KIND_TAG.payment}_`))
  ok('πληρωμή: ημερομηνία πληρωμής', n.includes('2026-06-28'))
  ok('πληρωμή: ποσό και υπόλοιπο', n.includes('0000088,50') && n.includes('0000000,00'))
}

// ── Συμβόλαιο ───────────────────────────────────────────────────────────────
{
  const n = contractName({ counterparty: 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΙΩΑΝΝΗΣ', startDate: '2025-01-01', endDate: '2028-01-01', amount: 650, seq: 1, ext: 'pdf' })
  ok('συμβόλαιο: σωστό μήκος', stem(n).length === NAME_LENGTH)
  ok('συμβόλαιο: ετικέτα', n.includes(`_${KIND_TAG.contract}_`))
  ok('συμβόλαιο: μίσθωμα', n.includes('0000650,00'))
}

// ── ΤΟ ΚΕΝΤΡΙΚΟ: ίδιο μήκος ΠΑΝΤΑ, σε κάθε τύπο και με ό,τι κι αν λείπει ────
{
  const samples = [
    billName({ provider: 'ΔΕΗ', issueDate: '2026-06-10', dueDate: '2026-06-30', amount: 88.5, seq: 1 }),
    billName({ provider: null, issueDate: null, dueDate: null, amount: null, seq: 1 }),
    billName({ provider: 'ΠΑΡΑ ΠΟΛΥ ΜΕΓΑΛΟ ΟΝΟΜΑ ΠΑΡΟΧΟΥ ΠΟΥ ΞΕΦΕΥΓΕΙ', issueDate: '2026-01-01', dueDate: null, amount: 1, seq: 9999 }),
    paymentName({ provider: 'ΕΥΔΑΠ', paidDate: '2026-03-03', amount: 42, balance: -10, seq: 3 }),
    paymentName({ provider: '', paidDate: null, amount: null, balance: null, seq: 1 }),
    contractName({ counterparty: 'Α', startDate: '2025-01-01', endDate: '2028-01-01', amount: 650, seq: 12 }),
    buildName({ kind: 'photo', provider: null, anchorDate: null, seq: 1, slots: [EMPTY_SLOT, EMPTY_SLOT, EMPTY_SLOT] }),
  ]
  ok('ΟΛΑ τα ονόματα έχουν ακριβώς το ίδιο μήκος',
     samples.every(s => stem(s).length === NAME_LENGTH))
  ok('…ακόμη κι όταν λείπουν τα πάντα',
     stem(samples[1]).length === stem(samples[0]).length)
  ok('…και όταν ο πάροχος ξεφεύγει σε μήκος',
     stem(samples[2]).length === NAME_LENGTH)
  ok('χαρτί χωρίς ημερομηνία μαζεύεται στην αρχή', samples[1].startsWith('0000-00_'))
  ok('κανένα όνομα δεν έχει χαρακτήρα που σπάει filesystem',
     samples.every(s => !/[\\/:*?"<>|]/.test(s)))
  ok('κανένα όνομα δεν τελειώνει σε κενό', samples.every(s => s === s.trimEnd()))
}

// ── Ταξινόμηση: αλφαβητικά == χρονολογικά ──────────────────────────────────
{
  const names = [
    billName({ provider: 'ΔΕΗ', issueDate: '2026-06-10', dueDate: null, amount: 1, seq: 2 }),
    billName({ provider: 'ΔΕΗ', issueDate: '2025-12-01', dueDate: null, amount: 1, seq: 1 }),
    billName({ provider: 'ΔΕΗ', issueDate: '2026-06-02', dueDate: null, amount: 1, seq: 1 }),
    billName({ provider: 'ΔΕΗ', issueDate: '2026-01-15', dueDate: null, amount: 1, seq: 1 }),
  ]
  const sorted = names.slice().sort()
  ok('η απλή αλφαβητική ταξινόμηση δίνει χρονολογική σειρά',
     sorted[0].startsWith('2025-12') && sorted[1].startsWith('2026-01') &&
     sorted[2].startsWith('2026-06_0001') && sorted[3].startsWith('2026-06_0002'))
}

// ── Αύξων ανά μήνα ──────────────────────────────────────────────────────────
{
  const items = [
    { id: 'c', anchorDate: '2026-06-20' },
    { id: 'a', anchorDate: '2026-06-01' },
    { id: 'b', anchorDate: '2026-06-01' },
    { id: 'd', anchorDate: '2026-07-05' },
    { id: 'e', anchorDate: null },
  ]
  const seq = assignSequences(items)
  ok('ο αύξων ξεκινά από 1 σε κάθε μήνα', seq.get('a') === 1 && seq.get('d') === 1)
  ok('ίδια ημερομηνία → σταθερή σειρά κατά id', seq.get('a') === 1 && seq.get('b') === 2)
  ok('νεότερο μέσα στον μήνα παίρνει μεγαλύτερο', seq.get('c') === 3)
  ok('τα αχρονολόγητα αριθμούνται κι αυτά', seq.get('e') === 1)

  // Η επαναληψιμότητα είναι ουσιώδης: αλλιώς το όνομα αλλάζει σε κάθε φόρτωση
  // και ο λογιστής βλέπει διπλά αντίγραφα του ίδιου χαρτιού.
  const again = assignSequences(items.slice().reverse())
  ok('ίδιο σύνολο → ίδιοι αριθμοί, ανεξάρτητα από τη σειρά εισόδου',
     [...seq.entries()].every(([k, v]) => again.get(k) === v))
}

// ── Ετικέτες πεδίων: κάθε τύπος εξηγεί τι σημαίνουν τα τρία πεδία ──────────
{
  const kinds: DocKind[] = ['bill', 'payment', 'contract', 'tax', 'warranty', 'photo', 'other']
  ok('κάθε τύπος έχει ετικέτα τριών γραμμάτων',
     kinds.every(k => KIND_TAG[k].length === 3))
  ok('κάθε τύπος εξηγεί και τα τρία του πεδία',
     kinds.every(k => SLOT_LABELS[k].length === 3 && SLOT_LABELS[k].every(Boolean)))
  ok('οι ετικέτες τύπων είναι μοναδικές',
     new Set(kinds.map(k => KIND_TAG[k])).size === kinds.length)
}

console.log(`archive/naming.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
