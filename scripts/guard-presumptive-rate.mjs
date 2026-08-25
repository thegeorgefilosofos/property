#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Η ΤΕΚΜΑΡΤΗ ΕΚΠΤΩΣΗ ΓΡΑΦΕΤΑΙ ΜΙΑ ΦΟΡΑ, ΚΑΙ ΤΟ ΣΥΜΠΛΗΡΩΜΑ ΤΗΣ ΕΙΝΑΙ ΚΡΥΨΩΝΑΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΟΝ ΤΟΝ ΦΥΛΑΚΑ. Η έκπτωση 5% του άρθρου 39 §4 έχει
// μία πηγή: `PRESUMPTIVE_DEDUCTION_RATE` (lib/accounting/statement.ts) και το
// τύλιγμα `presumptiveDeductionRate()` που προσθέτει την προϋπόθεση τραπέζης.
// Ομως τρία σημεία δεν έγραφαν «0.05» — έγραφαν το ΣΥΜΠΛΗΡΩΜΑ, «0.95»:
//
//   lib/tax/shortTermTax.ts   `meta?.rentsPaidViaBank === false ? 1 : 0.95`
//   lib/billing/budgetPro.ts  `const TAXABLE_SHARE_OF_GROSS = 0.95`
//   app/LandingCalculator.tsx `const taxable = annual * 0.95`
//
// Καμία αναζήτηση για «0.05» δεν τα έβρισκε. Το `budgetPro.ts` μάλιστα είχε
// σχόλιο που παραδεχόταν την εξάρτηση: «ίδια παραδοχή με το shortTermTax.ts,
// ώστε οι δύο οθόνες να μη διαφωνούν». Μια παραδοχή γραμμένη δύο φορές δεν
// κρατά δύο οθόνες σε συμφωνία — τους δίνει δύο ευκαιρίες να διαφωνήσουν.
//
// ΓΙΑΤΙ ΜΕΤΡΑΕΙ. Ο νόμος αυτού ακριβώς του ποσοστού ΕΧΕΙ ΗΔΗ αλλάξει μία φορά:
// ο ν.5246/2025 πρόσθεσε την προϋπόθεση τραπεζικής είσπραξης από 1/1/2026. Την
// επόμενη φορά, η μία πηγή θα ενημερωθεί και τα αντίγραφα όχι — και ο χρήστης
// θα δει δύο φόρους για την ίδια χρονιά σε διπλανές οθόνες.
//
// ΤΙ ΕΠΙΒΑΛΛΕΙ. Κανένα κυριολεκτικό 0.95 / .95 / 95% ως φορολογικός συντελεστής
// έξω από τη μία πηγή. Οποιος το χρειάζεται, γράφει `1 - PRESUMPTIVE_DEDUCTION_RATE`
// ή `1 - presumptiveDeductionRate(viaBank)`.
//
// ΤΙ ΔΕΝ ΑΦΟΡΑ. (α) Το 0,95 ως συντελεστής τιμολόγησης, αγοράς ή ασφάλισης —
// άσχετος αριθμός που τυχαίνει να είναι ο ίδιος· η λίστα είναι ρητή. (β) Το
// «95%» μέσα σε ΕΛΛΗΝΙΚΗ ΠΡΟΤΑΣΗ («ο φόρος υπολογίζεται στο 95% του ενοικίου»).
// Εκεί δεν υπάρχει συντελεστής να αποκλίνει: υπάρχει περιγραφή και η ακρίβειά
// της είναι δουλειά των φυλάκων ορολογίας. Ενας φύλακας που ζητά από κείμενο να
// καλέσει συνάρτηση δεν προστατεύει τίποτα, μαζεύει μόνο εξαιρέσεις.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs'
import { findSources } from './lib/find-tests.mjs'

// Η μία πηγή δεν ελέγχει τον εαυτό της.
const SOURCE = 'lib/accounting/statement.ts'
// Αρχεία όπου το 0,95 ΔΕΝ είναι φορολογικός συντελεστής.
const UNRELATED = [
  'lib/pricing/dynamicPricing.ts',            // πολλαπλασιαστές ημέρας/ζήτησης
  'lib/market/greekMarket.ts',                // συντελεστής τύπου ακινήτου
  'app/dashboard/components/BillsInsurance.tsx', // συντελεστής παλαιότητας
  'app/dashboard/components/TabLoanCalculator.tsx', // stopOpacity σε SVG
]

const LITERAL = /(?<![\d.\w])0?\.95(?![\d])/

const findings = []
for (const f of findSources()) {
  if (f.includes('.test.')) continue
  if (f.endsWith(SOURCE) || UNRELATED.some(u => f.endsWith(u))) continue
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const t = line.trim()
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*')) return
    if (LITERAL.test(line)) findings.push(`${f}:${i + 1}  ${t.slice(0, 96)}`)
  })
}

if (findings.length) {
  console.error(`✗ ${findings.length} κυριολεκτικά «0,95» έξω από τη μία πηγή:\n`)
  for (const x of findings) console.error('  ' + x)
  console.error(`
  Η τεκμαρτή έκπτωση γράφεται μία φορά. Χρησιμοποίησε:
    1 - PRESUMPTIVE_DEDUCTION_RATE            (lib/accounting/statement.ts)
    1 - presumptiveDeductionRate(viaBank)     (lib/billing/consolidate.ts)
  Αν ο αριθμός ΔΕΝ είναι φορολογικός συντελεστής, πρόσθεσε το αρχείο στη λίστα UNRELATED.
`)
  process.exit(1)
}
console.log('✓ η τεκμαρτή έκπτωση γράφεται σε ένα σημείο')
