// npx tsx lib/expenses/priceChange.test.ts
//
// ΤΟ ΖΗΤΟΥΜΕΝΟ ΗΤΑΝ «μία φορά τον μήνα να ελέγχουμε Netflix, Spotify, Disney+
// για αλλαγές τιμών». Η προφανής λύση —κατάλογος τιμών της αγοράς— είναι η ίδια
// που απέτυχε στα τιμολόγια ρεύματος: τιμές τρίτων που παλιώνουν σιωπηλά. Και
// απαντά σε λάθος ερώτηση: ο ιδιοκτήτης δεν ρωτά πόσο κάνει το Netflix, ρωτά
// γιατί χρεώθηκε τρία ευρώ παραπάνω.
//
// Η απάντηση είναι μέσα στα δικά του δεδομένα και είναι ΓΕΓΟΝΟΣ.
import { priceChanges } from './priceChange'
import type { LedgerEntry } from './ledger'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const eq = (n: string, got: unknown, want: unknown) =>
  ok(`${n}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want))

let seq = 0
const e = (date: string, amount: number, o: Partial<LedgerEntry> = {}): LedgerEntry => ({
  key: `k${seq++}`, billId: null, expenseId: `e${seq}`, date, due: null,
  title: o.title ?? 'Netflix', amount, paid: true,
  category: o.category ?? 'streaming', group: 'other', recurring: false,
  vendor: o.vendor ?? 'Netflix', ...o,
})
const day = (s: string) => new Date(`${s}T12:00:00`)
const run = (ms: string[], amts: number[], o: Partial<LedgerEntry> = {}) =>
  ms.map((m, i) => e(`${m}-05`, amts[i], o))

const M = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']

// ═══ Η ΑΥΞΗΣΗ ΣΥΝΔΡΟΜΗΣ ΕΙΝΑΙ ΓΕΓΟΝΟΣ ═══════════════════════════════════
{
  const [c] = priceChanges(run(M, [8.99, 8.99, 8.99, 8.99, 10.99]), day('2026-08-20'))
  ok('εντοπίζεται', !!c)
  eq('η καθιερωμένη τιμή', c.previous, 8.99)
  eq('η νέα', c.current, 10.99)
  eq('η διαφορά σε ευρώ', c.deltaEur, 2)
  eq('και σε ποσοστό', c.deltaPct, 22)
  ok('σταθερή τιμή, άρα λέμε «ακρίβυνε»', c.flatRate && /ακρίβυνε/.test(c.message))
  ok('με τα δύο ποσά μέσα', /8,99/.test(c.message) && /10,99/.test(c.message))
}

// ═══ Η ΤΕΛΕΥΤΑΙΑ ΔΕΝ ΜΠΑΙΝΕΙ ΣΤΟΝ ΔΙΑΜΕΣΟ ═══════════════════════════════
// Αν μπει, τραβά τον διάμεσο προς το μέρος της και μικραίνει τη διαφορά που
// ψάχνουμε: η μέτρηση κρύβει αυτό που μετρά.
{
  const [c] = priceChanges(run(M, [10, 10, 10, 10, 14]), day('2026-08-20'))
  eq('η προηγούμενη τιμή μένει καθαρή', c.previous, 10)
  eq('και η διαφορά πλήρης', c.deltaEur, 4)
}

// ═══ ΜΕΤΡΟΥΜΕΝΟΣ ΛΟΓΑΡΙΑΣΜΟΣ: ΑΛΛΗ ΔΙΑΤΥΠΩΣΗ ═══════════════════════════
// «Ακρίβυνε το ρεύμα» τον Ιανουάριο είναι λάθος με σιγουριά: μπορεί απλώς να
// έκανε κρύο. Λέμε μόνο ό,τι ξέρουμε.
{
  const [c] = priceChanges(
    run(M, [70, 70, 70, 70, 110], { title: 'ΔΕΗ', category: 'electricity', vendor: 'ΔΕΗ' }),
    day('2026-08-20'))
  ok('εντοπίζεται κι εδώ', !!c)
  ok('ΔΕΝ είναι σταθερής τιμής', !c.flatRate)
  ok('δεν λέει «ακρίβυνε»', !/ακρίβυνε/.test(c.message))
  ok('και παραδέχεται την αβεβαιότητα', /Μπορεί να είναι η κατανάλωση/.test(c.message))
}

// ═══ ΤΟ ΚΑΤΩΦΛΙ ΚΟΒΕΙ ΤΟΝ ΘΟΡΥΒΟ ════════════════════════════════════════
{
  eq('μία ευρώ διαφορά δεν είναι είδηση',
    priceChanges(run(M, [8.99, 8.99, 8.99, 8.99, 9.99]), day('2026-08-20')).length, 0)
  // 2 € πάνω σε 50 € είναι 4%: κάτω από το ποσοστιαίο κατώφλι.
  eq('μικρό ποσοστό σε μεγάλο ποσό δεν είναι είδηση',
    priceChanges(run(M, [50, 50, 50, 50, 52]), day('2026-08-20')).length, 0)
  ok('σταθερή τιμή δεν παράγει τίποτα',
    priceChanges(run(M, [8.99, 8.99, 8.99, 8.99, 8.99]), day('2026-08-20')).length === 0)
}

// ═══ Η ΜΕΙΩΣΗ ΛΕΓΕΤΑΙ ΚΙ ΑΥΤΗ ═══════════════════════════════════════════
// Καλή είδηση είναι κι αυτή είδηση — και επιβεβαιώνει ότι μια αλλαγή πλάνου
// έπιασε.
{
  const [c] = priceChanges(run(M, [15.99, 15.99, 15.99, 15.99, 9.99]), day('2026-08-20'))
  ok('εντοπίζεται η μείωση', !!c && c.deltaEur < 0)
  ok('και λέγεται σωστά', /φθηνότερο/.test(c.message))
  ok('με τυπογραφικό μείον, όχι παύλα πληκτρολογίου', /−/.test(c.message))
}

// ═══ ΛΙΓΟ ΙΣΤΟΡΙΚΟ: ΚΑΜΙΑ ΚΡΙΣΗ ═════════════════════════════════════════
// Με δύο προηγούμενες δεν υπάρχει «καθιερωμένη» τιμή· υπάρχουν δύο τιμές.
{
  eq('τρεις εμφανίσεις δεν αρκούν',
    priceChanges(run(['2026-06', '2026-07', '2026-08'], [8.99, 8.99, 12.99]), day('2026-08-20')).length, 0)
  eq('τέσσερις αρκούν',
    priceChanges(run(['2026-05', '2026-06', '2026-07', '2026-08'], [8.99, 8.99, 8.99, 12.99]), day('2026-08-20')).length, 1)
}

// ═══ ΣΕΙΡΑ: Η ΑΚΡΙΒΟΤΕΡΗ ΑΥΞΗΣΗ ΠΡΩΤΗ ═══════════════════════════════════
{
  const many = [
    ...run(M, [8.99, 8.99, 8.99, 8.99, 11.99]),
    ...run(M, [30, 30, 30, 30, 45], { title: 'Vodafone', category: 'internet', vendor: 'Vodafone' }),
  ]
  const cs = priceChanges(many, day('2026-08-20'))
  eq('δύο ευρήματα', cs.length, 2)
  eq('πρώτο το ακριβότερο σε ευρώ', cs[0].title, 'Vodafone')
}

// ═══ ΤΑ ΔΕΔΟΜΕΝΑ ΜΕΝΟΥΝ ΑΘΙΚΤΑ ══════════════════════════════════════════
{
  const src = run(M, [8.99, 8.99, 8.99, 8.99, 10.99])
  const before = JSON.stringify(src)
  priceChanges(src, day('2026-08-20'))
  eq('καμία μεταλλαγή εισόδου', JSON.stringify(src), before)
}

console.log(fail === 0 ? `✓ priceChange: ${pass} έλεγχοι πέρασαν` : `✗ priceChange: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
