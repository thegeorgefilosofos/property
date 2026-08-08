// npx tsx lib/contracts/overview.test.ts
//
// ΤΟ ΤΑΞΙΔΙ ΠΟΥ ΔΙΟΡΘΩΝΕΤΑΙ. Η οθόνη «Συμβόλαια» άνοιγε με έξι κλειστά chips και
// τη γραμμή «Διάλεξε κατηγορία για να δεις το συμβόλαιό σου»: τρία κλικ και μια
// άδεια οθόνη πριν ο ιδιοκτήτης δει οτιδήποτε δικό του.
import { contractOverview, contractKindOf, totalMonthly, CONTRACT_KINDS } from './overview'
import type { LedgerEntry } from '../expenses/ledger'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }
const eq = (n: string, got: unknown, want: unknown) =>
  ok(`${n}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want))

let seq = 0
const e = (date: string, amount: number, o: Partial<LedgerEntry> = {}): LedgerEntry => ({
  key: `k${seq++}`, billId: null, expenseId: `e${seq}`, date, due: null,
  title: o.title ?? 'ΔΕΗ', amount, paid: true,
  category: o.category ?? 'electricity', group: 'fixed', recurring: false,
  vendor: o.vendor ?? 'ΔΕΗ', ...o,
})
const day = (s: string) => new Date(`${s}T12:00:00`)
const months = (ms: string[], amt: number, o: Partial<LedgerEntry> = {}) =>
  ms.map(m => e(`${m}-12`, amt, o))

const CUR = ['2026-04', '2026-05', '2026-06', '2026-07']

// ═══ Η ΚΑΤΗΓΟΡΙΑ ΑΝΑΓΝΩΡΙΖΕΤΑΙ ═══════════════════════════════════════════
{
  eq('ρεύμα από την κατηγορία', contractKindOf('electricity'), 'electricity')
  eq('ρεύμα από ελληνικά', contractKindOf('Ρεύμα'), 'electricity')
  eq('νερό από τον πάροχο στον τίτλο', contractKindOf('other', 'ΕΥΔΑΠ Ιουλίου'), 'water')
  eq('τηλεφωνία', contractKindOf('internet'), 'internet')
  // Τρεις διαφορετικές δαπάνες, ΕΝΑ συμβόλαιο στο μυαλό του χρήστη.
  eq('streaming → συνδρομές', contractKindOf('streaming'), 'subscriptions')
  eq('cloud → συνδρομές', contractKindOf('cloud'), 'subscriptions')
  eq('Netflix από τον τίτλο', contractKindOf('other', 'Netflix'), 'subscriptions')
  eq('ό,τι δεν είναι συμβόλαιο μένει έξω', contractKindOf('plumber', 'Υδραυλικός'), null)
}

// ═══ ΚΑΘΕ ΚΑΤΗΓΟΡΙΑ ΕΧΕΙ ΚΑΡΤΑ, ΑΚΟΜΗ ΚΑΙ ΑΔΕΙΑ ═════════════════════════
// Κατηγορία που λείπει από την οθόνη δεν διδάσκει τίποτα· κενή κάρτα λέει
// ταυτόχρονα τι λείπει και πώς μπαίνει.
{
  const cards = contractOverview(months(CUR, 70), day('2026-08-20'))
  eq('επιστρέφονται όλες οι κατηγορίες', cards.length, CONTRACT_KINDS.length)
  eq('με σταθερή σειρά', cards[0].kind, 'electricity')
  ok('το ρεύμα είναι γνωστό', cards[0].known)
  ok('τα υπόλοιπα όχι', cards.slice(1).every(c => !c.known))
  ok('και τα άγνωστα δεν εφευρίσκουν ποσό', cards.slice(1).every(c => c.monthly === null))
}

// ═══ ΤΟ ΠΟΣΟ ΕΙΝΑΙ ΑΝΑ ΜΗΝΑ, ΟΧΙ ΑΝΑ ΛΟΓΑΡΙΑΣΜΟ ════════════════════════
// Ο διμηνιαίος λογαριασμός των 90 € είναι 45 € τον μήνα. Γραμμένος ως 90 θα
// διπλασίαζε το σύνολο της κεφαλίδας.
{
  const ydap = ['2026-01', '2026-03', '2026-05', '2026-07'].map(m =>
    e(`${m}-10`, 90, { title: 'ΕΥΔΑΠ', category: 'water', vendor: 'ΕΥΔΑΠ' }))
  const water = contractOverview(ydap, day('2026-08-20')).find(c => c.kind === 'water')!
  eq('ο διμηνιαίος ρυθμός αναγνωρίζεται', water.everyMonths, 2)
  eq('και το ποσό μοιράζεται στους μήνες', water.monthly, 45)
}

// ═══ ΔΥΟ ΠΑΡΟΧΟΙ ΣΤΗΝ ΙΔΙΑ ΚΑΤΗΓΟΡΙΑ ═══════════════════════════════════
// Ρεύμα σπιτιού και ρεύμα γκαράζ: δύο σειρές, μία κάρτα, άθροισμα και των δύο.
{
  const both = [
    ...months(CUR, 70),
    ...months(CUR, 18, { title: 'Ρεύμα γκαράζ', vendor: 'Protergia' }),
  ]
  const el = contractOverview(both, day('2026-08-20')).find(c => c.kind === 'electricity')!
  eq('το μηνιαίο αθροίζει και τους δύο', el.monthly, 88)
  eq('δείχνεται ο μεγαλύτερος πάροχος', el.provider, 'ΔΕΗ')
  eq('και μετρώνται όλες οι περίοδοι', el.occurrences, 8)
}

// ═══ ΤΟ ΣΥΝΟΛΟ ΤΗΣ ΚΕΦΑΛΙΔΑΣ ═══════════════════════════════════════════
{
  const mixed = [
    ...months(CUR, 70),
    ...months(CUR, 30, { title: 'Vodafone', category: 'internet', vendor: 'Vodafone' }),
  ]
  const cards = contractOverview(mixed, day('2026-08-20'))
  eq('αθροίζει μόνο ό,τι γνωρίζουμε', totalMonthly(cards), 100)
  ok('και δεν σκάει με άγνωστα', Number.isFinite(totalMonthly(contractOverview([], day('2026-08-20')))))
  eq('με μηδέν δεδομένα, μηδέν σύνολο', totalMonthly(contractOverview([], day('2026-08-20'))), 0)
}

// ═══ ΛΙΓΟ ΙΣΤΟΡΙΚΟ: ΚΑΜΙΑ ΕΙΚΑΣΙΑ ══════════════════════════════════════
// Δύο εμφανίσεις δεν είναι συνήθεια. Χωρίς αυτόν τον κανόνα, ένας εφάπαξ
// λογαριασμός θα εμφανιζόταν ως μηνιαίο πάγιο.
{
  const cards = contractOverview(months(['2026-06', '2026-07'], 70), day('2026-08-20'))
  ok('με δύο μήνες δεν βγαίνει κάρτα', !cards.find(c => c.kind === 'electricity')!.known)
}

// ═══ ΤΑ ΔΕΔΟΜΕΝΑ ΜΕΝΟΥΝ ΑΘΙΚΤΑ ═════════════════════════════════════════
{
  const src = months(CUR, 70)
  const before = JSON.stringify(src)
  contractOverview(src, day('2026-08-20'))
  eq('καμία μεταλλαγή εισόδου', JSON.stringify(src), before)
}

console.log(fail === 0 ? `✓ contracts: ${pass} έλεγχοι πέρασαν` : `✗ contracts: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
