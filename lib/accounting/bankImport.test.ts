// Τεστ για την εισαγωγή τραπεζικής κίνησης + αντιστοίχιση (lib/accounting/bankImport.ts).
import { parseBankCsv, parseAmount, parseDate, matchTransactions, type ExpectedRent } from './bankImport'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps

// ── parseAmount: ελληνικά & διεθνή ──────────────────────────────────────────
ok('1.234,56 → 1234.56', near(parseAmount('1.234,56')!, 1234.56))
ok('-45,00 → -45', near(parseAmount('-45,00')!, -45))
ok('1,234.56 → 1234.56 (διεθνές)', near(parseAmount('1,234.56')!, 1234.56))
ok('€ 800 → 800', near(parseAmount('€ 800')!, 800))
ok('(120,00) → -120 (παρενθέσεις)', near(parseAmount('(120,00)')!, -120))
ok('κενό → null', parseAmount('') === null)
ok('κείμενο → null', parseAmount('abc') === null)

// ── parseDate ───────────────────────────────────────────────────────────────
ok('15/03/2026 → ISO', parseDate('15/03/2026') === '2026-03-15')
ok('2026-03-15 → ISO', parseDate('2026-03-15') === '2026-03-15')
ok('5-3-26 → ISO (2ψήφιο έτος)', parseDate('5-3-26') === '2026-03-05')
ok('άκυρη → κενό', parseDate('foo') === '')

// ── parseBankCsv: διαχωριστικό ; + ποσό ─────────────────────────────────────
{
  const csv = 'Ημερομηνία;Περιγραφή;Ποσό\n05/03/2026;Ενοίκιο Μαρτίου;800,00\n07/03/2026;ΔΕΗ λογαριασμός;-120,50'
  const txns = parseBankCsv(csv)
  ok('2 κινήσεις', txns.length === 2)
  ok('πίστωση 800', near(txns[0].amount, 800))
  ok('χρέωση -120,50', near(txns[1].amount, -120.5))
  ok('ISO ημερομηνία', txns[0].date === '2026-03-05')
  ok('περιγραφή', txns[0].description === 'Ενοίκιο Μαρτίου')
}

// ── parseBankCsv: στήλες χρέωση/πίστωση χωριστά, διαχωριστικό tab ────────────
{
  const csv = 'Date\tDescription\tΧρέωση\tΠίστωση\n01/04/2026\tRent\t\t750,00\n03/04/2026\tInsurance\t60,00\t'
  const txns = parseBankCsv(csv)
  ok('credit → θετικό 750', near(txns[0].amount, 750))
  ok('debit → αρνητικό -60', near(txns[1].amount, -60))
}

// ── parseBankCsv: κόμμα ως διαχωριστικό ΚΑΙ δεκαδικό σε εισαγωγικά ───────────
{
  const csv = 'Ημερομηνία,Περιγραφή,Ποσό\n10/05/2026,"Ενοίκιο, Μάιος","1.000,00"'
  const txns = parseBankCsv(csv)
  ok('quoted πεδία + ποσό', txns.length === 1 && near(txns[0].amount, 1000))
  ok('κόμμα μέσα σε εισαγωγικά διατηρείται', txns[0].description === 'Ενοίκιο, Μάιος')
}

// ── Αντιστοίχιση ενοικίων ───────────────────────────────────────────────────
{
  const csv = 'Ημερομηνία;Περιγραφή;Ποσό\n03/03/2026;Κατάθεση ενοικίου;800,00\n20/03/2026;Super market;-45,00\n02/04/2026;Ενοίκιο;800,00'
  const txns = parseBankCsv(csv)
  const expected: ExpectedRent[] = [
    { id: 'mar', label: 'Μάρτιος', amount: 800, dueDate: '2026-03-01' },
    { id: 'apr', label: 'Απρίλιος', amount: 800, dueDate: '2026-04-01' },
  ]
  const res = matchTransactions(txns, expected)
  ok('2 ενοίκια ταιριάζουν', res.rentMatches.length === 2)
  ok('Μάρτιος high confidence (≤5 μέρες)', res.rentMatches.find(m => m.rentId === 'mar')?.confidence === 'high')
  ok('η χρέωση super market → πρόταση εξόδου', res.expenseSuggestions.some(e => near(e.amount, 45)))
  ok('κάθε κίνηση μία φορά', res.rentMatches.length + res.expenseSuggestions.length + res.unmatched.length === txns.length)
}

// ── Δεν αντιστοιχεί λάθος ποσό ───────────────────────────────────────────────
{
  const txns = parseBankCsv('Ημερομηνία;Περιγραφή;Ποσό\n03/03/2026;Κάτι;500,00')
  const res = matchTransactions(txns, [{ id: 'x', label: 'X', amount: 800, dueDate: '2026-03-01' }])
  ok('ποσό εκτός ανοχής δεν ταιριάζει', res.rentMatches.length === 0)
  ok('η αταίριαστη πίστωση μένει unmatched', res.unmatched.length === 1)
}

// ── Ίδιο ποσό εκτός χρονικού παραθύρου δεν ταιριάζει ────────────────────────
{
  const txns = parseBankCsv('Ημερομηνία;Περιγραφή;Ποσό\n01/06/2026;Ενοίκιο;800,00')
  const res = matchTransactions(txns, [{ id: 'jan', label: 'Ιαν', amount: 800, dueDate: '2026-01-01' }], 20)
  ok('εκτός 20 ημερών δεν ταιριάζει', res.rentMatches.length === 0)
}

console.log(`bankImport.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { process.exit(1) }
console.log('όλα πέρασαν')
