// Αυστηρά τεστ για το καθολικό λογιστικό + τη συμφωνία (ledger.ts).
// Τρέξε: npx tsx lib/accounting/ledger.test.ts
import {
  buildLedger, profitAndLoss, cashflowByYear, reconcile, reconSummary,
  type LedgerInput, type Expected, type Actual,
} from './ledger'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps

// ── buildLedger: σειρά + τρέχον υπόλοιπο ──────────────────────────────────────
{
  const input: LedgerInput[] = [
    { date: '2026-01-10', type: 'expense', category: 'repairs', description: 'πλυντήριο', amount: 200 },
    { date: '2026-01-05', type: 'income', category: 'rent', description: 'ενοίκιο', amount: 800 },
    { date: '2026-01-10', type: 'income', category: 'rent', description: 'ενοίκιο 2', amount: 100 },
  ]
  const led = buildLedger(input)
  ok('ledger μήκος', led.length === 3)
  ok('ledger ταξινόμηση κατά ημερομηνία', led[0].date === '2026-01-05')
  ok('ledger υπόλοιπο #1', led[0].balance === 800)
  // ίδια ημέρα: έσοδο (100) πριν το έξοδο (200)
  ok('ledger έσοδο πριν έξοδο', led[1].description === 'ενοίκιο 2')
  ok('ledger υπόλοιπο #2', led[1].balance === 900)
  ok('ledger υπόλοιπο #3 (έξοδο)', led[2].balance === 700)
  ok('ledger τύπος τελευταίου', led[2].type === 'expense')
}

// αρνητικά, μηδέν, immutability, NaN skip
{
  const input: LedgerInput[] = [
    { date: '2026-02-01', type: 'income', category: 'rent', description: 'a', amount: 500 },
    { date: '2026-02-02', type: 'expense', category: 'fees', description: 'b', amount: 700 },
    { date: '2026-02-03', type: 'income', category: 'rent', description: 'c', amount: NaN },
    { date: '2026-02-04', type: 'expense', category: 'x', description: 'd', amount: Infinity },
  ]
  const snapshot = JSON.stringify(input)
  const led = buildLedger(input)
  ok('ledger αρνητικό υπόλοιπο', led[1].balance === -200)
  ok('ledger NaN → 0 (έσοδο)', led[2].balance === -200)
  ok('ledger Infinity → 0 (έξοδο)', led[3].balance === -200)
  ok('ledger δεν μεταλλάσσει είσοδο', JSON.stringify(input) === snapshot)
  ok('ledger νέος πίνακας', led !== (input as unknown))
}

// άθροισμα λεπτών (floating point)
{
  const input: LedgerInput[] = [
    { date: '2026-03-01', type: 'income', category: 'r', description: 'a', amount: 0.1 },
    { date: '2026-03-02', type: 'income', category: 'r', description: 'b', amount: 0.2 },
  ]
  const led = buildLedger(input)
  ok('ledger cents 0.1+0.2=0.3', led[1].balance === 0.3)
}

// κενή είσοδος
ok('ledger κενό', buildLedger([]).length === 0)

// ── profitAndLoss ────────────────────────────────────────────────────────────
{
  const input: LedgerInput[] = [
    { date: '2026-01-05', type: 'income', category: 'rent', description: 'a', amount: 800 },
    { date: '2026-02-05', type: 'income', category: 'rent', description: 'b', amount: 800 },
    { date: '2026-01-20', type: 'expense', category: 'repairs', description: 'c', amount: 300 },
    { date: '2026-02-20', type: 'expense', category: 'utilities', description: 'd', amount: 150 },
  ]
  const pnl = profitAndLoss(input)
  ok('pnl έσοδα', pnl.income === 1600)
  ok('pnl έξοδα', pnl.expense === 450)
  ok('pnl καθαρό', pnl.net === 1150)
  ok('pnl κατηγορία rent', pnl.byCategory.rent.income === 1600)
  ok('pnl κατηγορία rent net', pnl.byCategory.rent.net === 1600)
  ok('pnl κατηγορία repairs', pnl.byCategory.repairs.expense === 300)
  ok('pnl κατηγορία repairs net', pnl.byCategory.repairs.net === -300)
  ok('pnl κατηγορία utilities', pnl.byCategory.utilities.net === -150)

  // εύρος: μόνο Ιανουάριος (inclusive όρια)
  const jan = profitAndLoss(input, { from: '2026-01-01', to: '2026-01-31' })
  ok('pnl εύρος Ιαν έσοδα', jan.income === 800)
  ok('pnl εύρος Ιαν έξοδα', jan.expense === 300)
  ok('pnl εύρος Ιαν net', jan.net === 500)
  ok('pnl εύρος Ιαν χωρίς Φεβ κατηγορία', jan.byCategory.utilities === undefined)

  // inclusive: το όριο ίσο με ημερομηνία περιλαμβάνεται
  const edge = profitAndLoss(input, { from: '2026-01-05', to: '2026-01-05' })
  ok('pnl inclusive from==date', edge.income === 800)
  const edge2 = profitAndLoss(input, { from: '2026-01-20', to: '2026-01-20' })
  ok('pnl inclusive to==date', edge2.expense === 300)

  // μόνο from
  const fromOnly = profitAndLoss(input, { from: '2026-02-01' })
  ok('pnl μόνο from', fromOnly.income === 800 && fromOnly.expense === 150)
  // μόνο to
  const toOnly = profitAndLoss(input, { to: '2026-01-31' })
  ok('pnl μόνο to', toOnly.income === 800 && toOnly.expense === 300)
}

// ═══ ΤΟ ΠΙΣΤΩΤΙΚΟ ΔΕΝ ΕΙΝΑΙ ΔΑΠΑΝΗ ══════════════════════════════════════════
//
// ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ. Ο έλεγχος εδώ ζητούσε ρητά `Math.abs`: μια επιστροφή
// ΔΕΗ γραμμένη ως δαπάνη −50 € μετρούσε ως δαπάνη +50 €. Το `buildLedger`
// όμως κρατά το πρόσημο. Για ενοίκιο 800 € και πιστωτικό −50 €:
//
//     καθολικό      →  850,00 €  (σωστό: το πιστωτικό επιστρέφει χρήματα)
//     αποτελέσματα  →  750,00 €  (λάθος: το πιστωτικό μετρήθηκε ως έξοδο)
//
// Εκατό ευρώ διαφορά ανάμεσα σε δύο οθόνες που δείχνουν την ΙΔΙΑ χρονιά. Το
// `cashflowByYear` κουβαλούσε το ίδιο λάθος στο μηνιαίο γράφημα.
{
  const pnl = profitAndLoss([
    { date: '2026-01-01', type: 'expense', category: 'x', description: 'a', amount: -50 },
  ])
  ok('το πιστωτικό ΜΕΙΩΝΕΙ τις δαπάνες', pnl.expense === -50 && pnl.net === 50)

  const mixed = profitAndLoss([
    { date: '2026-01-01', type: 'income', category: 'rent', description: 'ενοίκιο', amount: 800 },
    { date: '2026-01-10', type: 'expense', category: 'electricity', description: 'πιστωτικό', amount: -50 },
  ])
  ok('καθολικό και αποτελέσματα συμφωνούν',
     mixed.net === buildLedger([
       { date: '2026-01-01', type: 'income', category: 'rent', description: 'ενοίκιο', amount: 800 },
       { date: '2026-01-10', type: 'expense', category: 'electricity', description: 'πιστωτικό', amount: -50 },
     ]).slice(-1)[0].balance)
  ok('το πιστωτικό μειώνει και την κατηγορία του',
     mixed.byCategory.electricity.expense === -50)

  const cash = cashflowByYear([
    { date: '2026-01-10', type: 'expense', category: 'x', description: 'πιστωτικό', amount: -50 },
  ], 2026)
  ok('και στο μηνιαίο γράφημα', cash[0].expense === -50 && cash[0].net === 50)
}

// ── cashflowByYear ───────────────────────────────────────────────────────────
{
  const input: LedgerInput[] = [
    { date: '2026-01-05', type: 'income', category: 'rent', description: 'a', amount: 800 },
    { date: '2026-01-20', type: 'expense', category: 'r', description: 'b', amount: 100 },
    { date: '2026-07-05', type: 'income', category: 'rent', description: 'c', amount: 1200 },
    { date: '2025-07-05', type: 'income', category: 'rent', description: 'd', amount: 999 }, // άλλο έτος
    { date: '2027-01-01', type: 'income', category: 'rent', description: 'e', amount: 888 }, // άλλο έτος
  ]
  const cf = cashflowByYear(input, 2026)
  ok('cashflow 12 γραμμές', cf.length === 12)
  ok('cashflow μήνες 1..12', cf.every((r, i) => r.month === i + 1))
  ok('cashflow Ιαν έσοδα', cf[0].income === 800)
  ok('cashflow Ιαν έξοδα', cf[0].expense === 100)
  ok('cashflow Ιαν net', cf[0].net === 700)
  ok('cashflow Ιουλ έσοδα', cf[6].income === 1200)
  ok('cashflow κενός μήνας μηδέν', cf[2].income === 0 && cf[2].expense === 0 && cf[2].net === 0)
  ok('cashflow φιλτράρει άλλα έτη', cf.reduce((s, r) => s + r.income, 0) === 2000)
  const cf2025 = cashflowByYear(input, 2025)
  ok('cashflow 2025 Ιουλ', cf2025[6].income === 999)
}

// ── reconcile ────────────────────────────────────────────────────────────────
const today = '2026-07-11'

// ακριβής πληρωμή → paid (μέσω refId)
{
  const exp: Expected[] = [{ id: 'r1', date: '2026-06-01', amount: 800 }]
  const act: Actual[] = [{ refId: 'r1', date: '2026-06-03', amount: 800, paid: true }]
  const rows = reconcile(exp, act, today)
  ok('recon ακριβής paid', rows[0].status === 'paid')
  ok('recon ακριβής paidAmount', rows[0].paidAmount === 800)
  ok('recon ακριβής shortfall 0', rows[0].shortfall === 0)
}

// υπερπληρωμή → paid
{
  const exp: Expected[] = [{ id: 'r1', date: '2026-06-01', amount: 800 }]
  const act: Actual[] = [{ refId: 'r1', amount: 900, paid: true }]
  const rows = reconcile(exp, act, today)
  ok('recon υπερπληρωμή paid', rows[0].status === 'paid')
  ok('recon υπερπληρωμή shortfall 0', rows[0].shortfall === 0)
}

// μισή → partial + shortfall
{
  const exp: Expected[] = [{ id: 'r1', date: '2026-06-01', amount: 800 }]
  const act: Actual[] = [{ refId: 'r1', amount: 400, paid: true }]
  const rows = reconcile(exp, act, today)
  ok('recon μισή partial', rows[0].status === 'partial')
  ok('recon μισή paidAmount', rows[0].paidAmount === 400)
  ok('recon μισή shortfall', rows[0].shortfall === 400)
}

// ═══ ΔΥΟ ΜΙΣΘΩΤΕΣ, ΕΝΑ ΑΚΙΝΗΤΟ, ΙΔΙΟΣ ΜΗΝΑΣ ═══════════════════════════════
//
// ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ. Η δεύτερη φάση της συμφωνίας —αυτή που πιάνει τις
// πληρωμές ΧΩΡΙΣ refId, δηλαδή ό,τι φτάνει από την τραπεζική κατάσταση—
// έδινε στο ΠΡΩΤΟ αναμενόμενο μίσθωμα ΟΛΕΣ τις πληρωμές του μήνα του:
//
//     r1 → 1.600,00 €, «πληρωμένο»
//     r2 →     0,00 €, «εκπρόθεσμο», οφειλή 800,00 €
//
// Η οθόνη έλεγε ταυτόχρονα «εισπράχθηκαν 1.600 €, οφειλές 0 €» ΚΑΙ «ο Β
// χρωστά 800 € εκπρόθεσμα». Ο ιδιοκτήτης κυνηγούσε μισθωτή που είχε πληρώσει.
//
// Ο κανόνας που έλειπε: μια αναμενόμενη γραμμή σταματά να ρουφά πληρωμές
// μόλις καλυφθεί. Η επόμενη ανεξόφλητη παίρνει τη σειρά της.
{
  const exp: Expected[] = [
    { id: 'r1', date: '2026-06-01', amount: 800 },
    { id: 'r2', date: '2026-06-05', amount: 800 },
  ]
  const act: Actual[] = [
    { date: '2026-06-03', amount: 800, paid: true },
    { date: '2026-06-06', amount: 800, paid: true },
  ]
  const rows = reconcile(exp, act, today)
  ok('ο πρώτος μισθωτής παίρνει το δικό του', rows[0].paidAmount === 800 && rows[0].status === 'paid')
  ok('ο δεύτερος μισθωτής παίρνει το δικό του', rows[1].paidAmount === 800 && rows[1].status === 'paid')
  const sum = reconSummary(rows)
  ok('κανένας εκπρόθεσμος', sum.counts.overdue === 0 && sum.counts.paid === 2)
  ok('το σύνολο δεν διπλομετριέται', sum.collectedTotal === 1600 && sum.outstanding === 0)
}

// Η υπερπληρωμή ΜΕΝΕΙ στη γραμμή που την έλαβε — δεν σπάει σε δόσεις.
{
  const exp: Expected[] = [
    { id: 'r1', date: '2026-06-01', amount: 800 },
    { id: 'r2', date: '2026-06-05', amount: 800 },
  ]
  const act: Actual[] = [{ date: '2026-06-03', amount: 1000, paid: true }]
  const rows = reconcile(exp, act, today)
  ok('η υπερπληρωμή δεν μεταφέρεται', rows[0].paidAmount === 1000 && rows[1].paidAmount === 0)
}

// Μερική πληρωμή: η γραμμή ΔΕΝ έχει καλυφθεί, οπότε δέχεται και τη δεύτερη.
{
  const exp: Expected[] = [
    { id: 'r1', date: '2026-06-01', amount: 800 },
    { id: 'r2', date: '2026-06-05', amount: 800 },
  ]
  const act: Actual[] = [
    { date: '2026-06-03', amount: 300, paid: true },
    { date: '2026-06-04', amount: 500, paid: true },
    { date: '2026-06-06', amount: 800, paid: true },
  ]
  const rows = reconcile(exp, act, today)
  ok('δύο δόσεις κλείνουν το πρώτο', rows[0].paidAmount === 800 && rows[0].status === 'paid')
  ok('και το τρίτο έμβασμα πάει στο δεύτερο', rows[1].paidAmount === 800 && rows[1].status === 'paid')
}

// τίποτα + παρελθόν → overdue
{
  const exp: Expected[] = [{ id: 'r1', date: '2026-06-01', amount: 800 }]
  const rows = reconcile(exp, [], today)
  ok('recon τίποτα overdue', rows[0].status === 'overdue')
  ok('recon overdue shortfall πλήρες', rows[0].shortfall === 800)
  ok('recon overdue paidAmount 0', rows[0].paidAmount === 0)
}

// τίποτα + μέλλον → unpaid
{
  const exp: Expected[] = [{ id: 'r1', date: '2026-12-01', amount: 800 }]
  const rows = reconcile(exp, [], today)
  ok('recon μέλλον unpaid', rows[0].status === 'unpaid')
  ok('recon unpaid shortfall πλήρες', rows[0].shortfall === 800)
}

// σήμερα == ημερομηνία → unpaid (όχι overdue, γιατί δεν είναι < today)
{
  const exp: Expected[] = [{ id: 'r1', date: today, amount: 800 }]
  const rows = reconcile(exp, [], today)
  ok('recon σήμερα unpaid', rows[0].status === 'unpaid')
}

// month-fallback αντιστοίχιση (χωρίς refId)
{
  const exp: Expected[] = [{ id: 'r1', date: '2026-06-01', amount: 800 }]
  const act: Actual[] = [{ date: '2026-06-15', amount: 800, paid: true }]
  const rows = reconcile(exp, act, today)
  ok('recon month-fallback paid', rows[0].status === 'paid')
  ok('recon month-fallback paidAmount', rows[0].paidAmount === 800)
}

// month-fallback: διαφορετικός μήνας δεν ταιριάζει
{
  const exp: Expected[] = [{ id: 'r1', date: '2026-06-01', amount: 800 }]
  const act: Actual[] = [{ date: '2026-07-15', amount: 800, paid: true }]
  const rows = reconcile(exp, act, today)
  ok('recon λάθος μήνας δεν ταιριάζει', rows[0].paidAmount === 0)
  ok('recon λάθος μήνας overdue', rows[0].status === 'overdue')
}

// προτεραιότητα refId έναντι month
{
  const exp: Expected[] = [
    { id: 'r1', date: '2026-06-01', amount: 800 },
    { id: 'r2', date: '2026-06-02', amount: 800 },
  ]
  // η πληρωμή με refId=r2 πάει ΜΟΝΟ στο r2 παρόλο που ταιριάζει ο μήνας και για τα δύο
  const act: Actual[] = [{ refId: 'r2', date: '2026-06-10', amount: 800, paid: true }]
  const rows = reconcile(exp, act, today)
  ok('recon refId στο r2', rows[1].paidAmount === 800 && rows[1].status === 'paid')
  ok('recon r1 χωρίς την refId πληρωμή', rows[0].paidAmount === 0)
}

// μία πληρωμή δεν μετριέται διπλά σε δύο expected (ίδιος μήνας)
{
  const exp: Expected[] = [
    { id: 'r1', date: '2026-06-01', amount: 800 },
    { id: 'r2', date: '2026-06-15', amount: 800 },
  ]
  const act: Actual[] = [{ date: '2026-06-20', amount: 800, paid: true }]
  const rows = reconcile(exp, act, today)
  ok('recon greedy παλαιότερο παίρνει', rows[0].paidAmount === 800)
  ok('recon δεύτερο δεν διπλομετριέται', rows[1].paidAmount === 0)
  ok('recon δεύτερο overdue', rows[1].status === 'overdue')
}

// μη πληρωμένη πραγματική αγνοείται
{
  const exp: Expected[] = [{ id: 'r1', date: '2026-06-01', amount: 800 }]
  const act: Actual[] = [{ refId: 'r1', amount: 800, paid: false }]
  const rows = reconcile(exp, act, today)
  ok('recon paid=false αγνοείται', rows[0].paidAmount === 0 && rows[0].status === 'overdue')
}

// ανοχή 0.01
{
  const exp: Expected[] = [{ id: 'r1', date: '2026-06-01', amount: 800 }]
  const act: Actual[] = [{ refId: 'r1', amount: 799.995, paid: true }]
  const rows = reconcile(exp, act, today)
  ok('recon ανοχή 0.01 → paid', rows[0].status === 'paid')
  const act2: Actual[] = [{ refId: 'r1', amount: 799.98, paid: true }]
  const rows2 = reconcile(exp, act2, today)
  ok('recon εκτός ανοχής → partial', rows2[0].status === 'partial')
}

// σειρά επιστροφής: κατά ημερομηνία asc
{
  const exp: Expected[] = [
    { id: 'b', date: '2026-08-01', amount: 100 },
    { id: 'a', date: '2026-06-01', amount: 100 },
    { id: 'c', date: '2026-07-01', amount: 100 },
  ]
  const rows = reconcile(exp, [], today)
  ok('recon σειρά asc', rows.map(r => r.expected.id).join() === 'a,c,b')
}

// πολλαπλές πληρωμές αθροίζονται μέσω refId
{
  const exp: Expected[] = [{ id: 'r1', date: '2026-06-01', amount: 800 }]
  const act: Actual[] = [
    { refId: 'r1', amount: 300, paid: true },
    { refId: 'r1', amount: 500, paid: true },
  ]
  const rows = reconcile(exp, act, today)
  ok('recon πολλαπλές αθροίζονται', rows[0].paidAmount === 800 && rows[0].status === 'paid')
}

// ── reconSummary ─────────────────────────────────────────────────────────────
{
  const exp: Expected[] = [
    { id: 'r1', date: '2026-06-01', amount: 800 },
    { id: 'r2', date: '2026-07-01', amount: 800 },
    { id: 'r3', date: '2026-06-15', amount: 800 },
  ]
  const act: Actual[] = [
    { refId: 'r1', amount: 800, paid: true },
    { refId: 'r3', amount: 400, paid: true },
  ]
  const rows = reconcile(exp, act, today)
  const sum = reconSummary(rows)
  ok('summary expectedTotal', sum.expectedTotal === 2400)
  ok('summary collectedTotal', sum.collectedTotal === 1200)
  ok('summary outstanding', sum.outstanding === 1200)
  ok('summary counts paid', sum.counts.paid === 1)
  ok('summary counts partial', sum.counts.partial === 1)
  ok('summary counts overdue', sum.counts.overdue === 1) // r2 (07-01) < σήμερα (07-11)
  ok('summary counts unpaid', sum.counts.unpaid === 0)
}

// ── Ρεαλιστικό σενάριο 12 μηνών ενοικίου (ενοίκιο 800) ────────────────────────
{
  const rent = 800
  const expected: Expected[] = []
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0')
    expected.push({ id: `2026-${mm}`, date: `2026-${mm}-01`, amount: rent, label: `Ενοίκιο ${mm}` })
  }
  // Ιαν–Μάι: κανονικά πληρωμένα (5 paid). Ιουν: μερική 500. Ιουλ: πλήρης.
  // Αυγ–Δεκ: απλήρωτα (στο μέλλον, σήμερα 2026-07-11 → unpaid). Μία overdue: φτιάχνουμε
  // ένα παρελθοντικό απλήρωτο σβήνοντας μια πληρωμή — εδώ κάνουμε τον Μάρτιο overdue.
  const actual: Actual[] = [
    { refId: '2026-01', date: '2026-01-03', amount: 800, paid: true },
    { refId: '2026-02', date: '2026-02-03', amount: 800, paid: true },
    // Μάρτιος: καμία πληρωμή → overdue (01 < today)
    { refId: '2026-04', date: '2026-04-03', amount: 800, paid: true },
    { refId: '2026-05', date: '2026-05-03', amount: 800, paid: true },
    { refId: '2026-06', date: '2026-06-05', amount: 500, paid: true }, // μερική
    { refId: '2026-07', date: '2026-07-02', amount: 800, paid: true },
  ]
  const rows = reconcile(expected, actual, today)
  const sum = reconSummary(rows)
  ok('σενάριο 12 γραμμές', rows.length === 12)
  ok('σενάριο Ιαν paid', rows[0].status === 'paid')
  ok('σενάριο Μαρ overdue', rows[2].status === 'overdue')
  ok('σενάριο Ιουν partial', rows[5].status === 'partial')
  ok('σενάριο Ιουν shortfall 300', rows[5].shortfall === 300)
  ok('σενάριο Ιουλ paid', rows[6].status === 'paid')
  ok('σενάριο Αυγ unpaid (μέλλον)', rows[7].status === 'unpaid')
  ok('σενάριο expectedTotal', sum.expectedTotal === 12 * 800)
  // collected: 5 πλήρη (Ιαν,Φεβ,Απρ,Μαι,Ιουλ = 5*800=4000) + 500 μερικό = 4500
  ok('σενάριο collectedTotal', sum.collectedTotal === 4500)
  ok('σενάριο outstanding', sum.outstanding === 9600 - 4500)
  ok('σενάριο counts paid', sum.counts.paid === 5)
  ok('σενάριο counts partial', sum.counts.partial === 1)
  ok('σενάριο counts overdue', sum.counts.overdue === 1) // Μάρτιος
  ok('σενάριο counts unpaid', sum.counts.unpaid === 5) // Αυγ–Δεκ
  ok('σενάριο counts άθροισμα 12', sum.counts.paid + sum.counts.partial + sum.counts.overdue + sum.counts.unpaid === 12)
}

// ── report ───────────────────────────────────────────────────────────────────
// ── ΤΟ ΠΛΕΟΝΑΣΜΑ ΤΟΥ ΕΝΟΣ ΔΕΝ ΣΒΗΝΕΙ ΤΗΝ ΟΦΕΙΛΗ ΤΟΥ ΑΛΛΟΥ ─────────────────
// Δύο μισθωτές των 1.000 €. Ο ένας πληρώνει 1.500, ο άλλος τίποτα. Η διαφορά
// των συνόλων έλεγε «ανείσπρακτα 500 €» — και ο ιδιοκτήτης κυνηγούσε 500 αντί
// για 1.000, από τον λάθος άνθρωπο.
{
  const exp: Expected[] = [
    { id: 'a', date: '2026-06-01', amount: 1000 },
    { id: 'b', date: '2026-06-01', amount: 1000 },
  ]
  const act: Actual[] = [{ refId: 'a', date: '2026-06-03', amount: 1500, paid: true }]
  const sum = reconSummary(reconcile(exp, act, today))
  ok('τα ανείσπρακτα δεν συμψηφίζονται μεταξύ μισθωτών', sum.outstanding === 1000)
}

console.log(`\nledger.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
