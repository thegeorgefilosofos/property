// ═══════════════════════════════════════════════════════════════════════════
// ΕΠΑΛΗΘΕΥΣΗ ΦΟΡΟΛΟΓΙΚΗΣ ΜΗΧΑΝΗΣ ΣΕ ΜΕΓΑΛΗ ΚΛΙΜΑΚΑ (χιλιάδες περιπτώσεις)
// ---------------------------------------------------------------------------
// Στόχος: να μπορούμε να ΕΓΓΥΗΘΟΥΜΕ ότι ο φόρος που εμφανίζει η εφαρμογή είναι
// σωστός — όχι με 1-2 δοκιμές, αλλά με δεκάδες χιλιάδες, ώστε τα αποτελέσματα να
// είναι απόλυτα αξιόπιστα.
//
// Μεθοδολογία (όπως επαληθεύεται επαγγελματικό φορολογικό λογισμικό):
//   1) GOLDEN — πραγματικά δημοσιευμένα παραδείγματα/αριθμοί από επίσημες & έγκυρες
//      πηγές (ν.5246/2025). Π.χ. ενοίκιο 20.000 € → φόρος 3.800 €.
//   2) ΑΝΕΞΑΡΤΗΤΟΣ ORACLE — δεύτερη, διαφορετικά γραμμένη υλοποίηση του προοδευτικού
//      φόρου (σωρευτικός πίνακας φόρου στα ΟΡΙΑ των κλιμακίων, υπολογισμένος με το
//      χέρι από τον νόμο) → σύγκριση με τη μηχανή σε χιλιάδες τυχαία εισοδήματα.
//   3) ΑΝΑΛΛΟΙΩΤΕΣ (invariants) — ιδιότητες που ΠΡΕΠΕΙ να ισχύουν πάντα: μονοτονία,
//      συνέχεια στα όρια (χωρίς άλματα), φράγματα, οριακός συντελεστής.
//   4) ΠΛΗΡΗΣ ΑΛΥΣΙΔΑ — incomeStatement (τεκμαρτή 5%, τραπεζική είσπραξη, νομικό
//      πρόσωπο 22%, νέοι) και ενοποίηση χαρτοφυλακίου (φόρος στο άθροισμα, Ε1).
//
// Πηγές κλιμάκων 2026 (διασταυρωμένες, πολλαπλές):
//   • Ενοίκια (άρθρο 40): 15% (0–12k) / 25% (12–24k) / 35% (24–35k) / 45% (>35k).
//     nerally.gr, taxrevenue.gr, ΠΟΜΙΔΑ, capital.gr — παράδειγμα 20.000 → 3.800 €.
//   • Εισόδημα/επιχ. (άρθρο 15, ν.5246/2025): 9/20/26/34/39/44 στα 10/20/30/40/60k.
//     taxheaven.gr, forin.gr, Grant Thornton, ΝΟΜΙΚΗ ΒΙΒΛΙΟΘΗΚΗ.
//   • Νέοι: ≤25 → 0% έως 20k· 26–30 → 9% έως 20k (ν.5246/2025).
// ═══════════════════════════════════════════════════════════════════════════

import {
  rentalIncomeTax, marginalRate,
  RENTAL_TAX_BRACKETS_2026, BUSINESS_INCOME_BRACKETS_2026,
  YOUTH_UP_TO_25_BRACKETS_2026, YOUTH_26_30_BRACKETS_2026, NEW_PROFESSIONAL_BRACKETS_2026,
  art15BracketsForAge, type TaxBracket,
} from '../billing/greekTax'
import { incomeStatement, consolidateIndividual } from './statement'

let passed = 0, failed = 0
const fails: string[] = []
function ok(name: string, cond: boolean) { if (cond) passed++; else { failed++; if (fails.length < 40) fails.push(name) } }
const near = (a: number, b: number, eps = 0.011) => Math.abs(a - b) <= eps // ανοχή 1 λεπτού

// Ντετερμινιστική γεννήτρια (mulberry32) — αναπαραγώγιμες αποτυχίες, χωρίς Math.random.
function rng(seed: number) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const round2 = (n: number) => Math.round(n * 100) / 100

// ── ΑΝΕΞΑΡΤΗΤΟΣ ORACLE ─────────────────────────────────────────────────────
// Πίνακας σωρευτικού φόρου στα ΟΡΙΑ κάθε κλιμακίου, ΥΠΟΛΟΓΙΣΜΕΝΟΣ ΜΕ ΤΟ ΧΕΡΙ από
// τον νόμο (όχι από τον ίδιο αλγόριθμο με τη μηχανή). Μεταξύ ορίων: γραμμικά με τον
// οριακό συντελεστή. Αυτό πιάνει σφάλματα ορίου/συντελεστή/στρογγυλοποίησης.
interface OracleStep { upto: number; cumAtUpto: number; rate: number; from: number }
function buildOracle(steps: OracleStep[]) {
  return (x: number): number => {
    if (!(x > 0)) return 0
    for (const s of steps) {
      if (x <= s.upto) {
        const base = s.from === 0 ? 0 : steps.find(p => p.upto === s.from)!.cumAtUpto
        return base + (x - s.from) * s.rate
      }
    }
    const top = steps[steps.length - 1]
    return top.cumAtUpto + (x - top.upto) * top.rate
  }
}

// Ενοίκια: 1800@12k, 4800@24k, 8650@35k, μετά 45%.
const oracleRental = buildOracle([
  { from: 0, upto: 12000, cumAtUpto: 1800, rate: 0.15 },
  { from: 12000, upto: 24000, cumAtUpto: 4800, rate: 0.25 },
  { from: 24000, upto: 35000, cumAtUpto: 8650, rate: 0.35 },
  { from: 35000, upto: Infinity, cumAtUpto: 8650, rate: 0.45 },
])
// Εισόδημα/επιχ.: 900@10k, 2900@20k, 5500@30k, 8900@40k, 16700@60k, μετά 44%.
const oracleBusiness = buildOracle([
  { from: 0, upto: 10000, cumAtUpto: 900, rate: 0.09 },
  { from: 10000, upto: 20000, cumAtUpto: 2900, rate: 0.20 },
  { from: 20000, upto: 30000, cumAtUpto: 5500, rate: 0.26 },
  { from: 30000, upto: 40000, cumAtUpto: 8900, rate: 0.34 },
  { from: 40000, upto: 60000, cumAtUpto: 16700, rate: 0.39 },
  { from: 60000, upto: Infinity, cumAtUpto: 16700, rate: 0.44 },
])
// Νέοι ≤25: 0@20k, 2600@30k, 6000@40k, 13800@60k, μετά 44%.
const oracleYouth25 = buildOracle([
  { from: 0, upto: 10000, cumAtUpto: 0, rate: 0.00 },
  { from: 10000, upto: 20000, cumAtUpto: 0, rate: 0.00 },
  { from: 20000, upto: 30000, cumAtUpto: 2600, rate: 0.26 },
  { from: 30000, upto: 40000, cumAtUpto: 6000, rate: 0.34 },
  { from: 40000, upto: 60000, cumAtUpto: 13800, rate: 0.39 },
  { from: 60000, upto: Infinity, cumAtUpto: 13800, rate: 0.44 },
])
// Νέοι 26–30: 900@10k, 1800@20k, 4400@30k, 7800@40k, 15600@60k, μετά 44%.
const oracleYouth30 = buildOracle([
  { from: 0, upto: 10000, cumAtUpto: 900, rate: 0.09 },
  { from: 10000, upto: 20000, cumAtUpto: 1800, rate: 0.09 },
  { from: 20000, upto: 30000, cumAtUpto: 4400, rate: 0.26 },
  { from: 30000, upto: 40000, cumAtUpto: 7800, rate: 0.34 },
  { from: 40000, upto: 60000, cumAtUpto: 15600, rate: 0.39 },
  { from: 60000, upto: Infinity, cumAtUpto: 15600, rate: 0.44 },
])
// Νέος επαγγελματίας (1η τριετία, 1ο κλιμάκιο 4,5%): 450@10k, 2450@20k, 5050@30k, 8450@40k, 16250@60k.
const oracleNewPro = buildOracle([
  { from: 0, upto: 10000, cumAtUpto: 450, rate: 0.045 },
  { from: 10000, upto: 20000, cumAtUpto: 2450, rate: 0.20 },
  { from: 20000, upto: 30000, cumAtUpto: 5050, rate: 0.26 },
  { from: 30000, upto: 40000, cumAtUpto: 8450, rate: 0.34 },
  { from: 40000, upto: 60000, cumAtUpto: 16250, rate: 0.39 },
  { from: 60000, upto: Infinity, cumAtUpto: 16250, rate: 0.44 },
])

const SCALES: { name: string; brackets: TaxBracket[]; oracle: (x: number) => number; top: number }[] = [
  { name: 'ενοίκια', brackets: RENTAL_TAX_BRACKETS_2026, oracle: oracleRental, top: 0.45 },
  { name: 'εισόδημα', brackets: BUSINESS_INCOME_BRACKETS_2026, oracle: oracleBusiness, top: 0.44 },
  { name: 'νέοι≤25', brackets: YOUTH_UP_TO_25_BRACKETS_2026, oracle: oracleYouth25, top: 0.44 },
  { name: 'νέοι26-30', brackets: YOUTH_26_30_BRACKETS_2026, oracle: oracleYouth30, top: 0.44 },
  { name: 'νέος-επαγ.', brackets: NEW_PROFESSIONAL_BRACKETS_2026, oracle: oracleNewPro, top: 0.44 },
]

// ── 1) GOLDEN: πραγματικά δημοσιευμένα/νομικά νούμερα ──────────────────────
{
  // Δημοσιευμένο παράδειγμα (nerally.gr / taxrevenue.gr): 20.000 → 3.800 €.
  ok('GOLDEN ενοίκιο 20.000 → 3.800 € (δημοσιευμένο)', near(rentalIncomeTax(20000), 3800))
  // Σωρευτικά στα όρια (αριθμητική του νόμου):
  ok('GOLDEN ενοίκιο 12.000 → 1.800 €', near(rentalIncomeTax(12000), 1800))
  ok('GOLDEN ενοίκιο 24.000 → 4.800 €', near(rentalIncomeTax(24000), 4800))
  ok('GOLDEN ενοίκιο 35.000 → 8.650 €', near(rentalIncomeTax(35000), 8650))
  ok('GOLDEN ενοίκιο 50.000 → 15.400 €', near(rentalIncomeTax(50000), 8650 + 15000 * 0.45))
  // Εισόδημα/επιχ. στα όρια:
  ok('GOLDEN εισόδημα 10.000 → 900 €', near(rentalIncomeTax(10000, BUSINESS_INCOME_BRACKETS_2026), 900))
  ok('GOLDEN εισόδημα 20.000 → 2.900 €', near(rentalIncomeTax(20000, BUSINESS_INCOME_BRACKETS_2026), 2900))
  ok('GOLDEN εισόδημα 30.000 → 5.500 €', near(rentalIncomeTax(30000, BUSINESS_INCOME_BRACKETS_2026), 5500))
  ok('GOLDEN εισόδημα 40.000 → 8.900 €', near(rentalIncomeTax(40000, BUSINESS_INCOME_BRACKETS_2026), 8900))
  ok('GOLDEN εισόδημα 60.000 → 16.700 €', near(rentalIncomeTax(60000, BUSINESS_INCOME_BRACKETS_2026), 16700))
  // Νέοι ≤25: 0% έως 20k.
  ok('GOLDEN νέος≤25 20.000 → 0 €', near(rentalIncomeTax(20000, YOUTH_UP_TO_25_BRACKETS_2026), 0))
  ok('GOLDEN νέος≤25 25.000 → 1.300 €', near(rentalIncomeTax(25000, YOUTH_UP_TO_25_BRACKETS_2026), 1300))
  // Νέοι 26–30: 9% έως 20k → 1.800 €.
  ok('GOLDEN νέος26-30 20.000 → 1.800 €', near(rentalIncomeTax(20000, YOUTH_26_30_BRACKETS_2026), 1800))
}

// ── 2) ORACLE σε χιλιάδες τυχαία εισοδήματα (ανά κλίμακα) ───────────────────
{
  const rnd = rng(20260712)
  const N = 12000 // × 5 κλίμακες = 60.000 συγκρίσεις
  for (const s of SCALES) {
    for (let i = 0; i < N; i++) {
      const x = round2(rnd() * 120000) // 0–120.000 €, με λεπτά
      ok(`oracle ${s.name} @${x}`, near(rentalIncomeTax(x, s.brackets), s.oracle(x)))
    }
  }
}

// ── 2β) Εξαντλητική σάρωση ΑΚΕΡΑΙΩΝ γύρω από κάθε όριο (off-by-one) ─────────
{
  const edges = [0, 10000, 12000, 20000, 24000, 30000, 35000, 40000, 60000]
  for (const s of SCALES) {
    for (const e of edges) {
      for (let d = -3; d <= 3; d++) {
        const x = e + d
        if (x < 0) continue
        ok(`edge ${s.name} @${x}`, near(rentalIncomeTax(x, s.brackets), s.oracle(x)))
      }
    }
  }
}

// ── 3) ΑΝΑΛΛΟΙΩΤΕΣ (invariants) σε χιλιάδες τιμές ──────────────────────────
{
  const rnd = rng(77777)
  const N = 8000
  for (const s of SCALES) {
    let prev = 0
    for (let i = 1; i <= N; i++) {
      const x = round2((i / N) * 150000)
      const t = rentalIncomeTax(x, s.brackets)
      // Μονοτονία: ο φόρος δεν μειώνεται ποτέ όσο αυξάνεται το εισόδημα.
      ok(`μονοτονία ${s.name} @${x}`, t >= prev - 1e-6)
      // Φράγμα: 0 ≤ φόρος ≤ εισόδημα × ανώτατο συντελεστή.
      ok(`φράγμα ${s.name} @${x}`, t >= -1e-9 && t <= x * s.top + 1e-6)
      // Μέσος ≤ οριακός.
      const eff = x > 0 ? t / x : 0
      ok(`μέσος≤οριακός ${s.name} @${x}`, eff <= marginalRate(x, s.brackets) + 1e-9)
      prev = t
    }
    // Συνέχεια στα όρια: κανένα άλμα (η συνάρτηση είναι συνεχής, μόνο η κλίση αλλάζει).
    for (const e of [10000, 12000, 20000, 24000, 30000, 35000, 40000, 60000]) {
      const jump = Math.abs(rentalIncomeTax(e + 0.01, s.brackets) - rentalIncomeTax(e - 0.01, s.brackets))
      ok(`συνέχεια ${s.name} @${e}`, jump < 0.02)
    }
    // Μηδέν/αρνητικά.
    ok(`μηδέν ${s.name}`, rentalIncomeTax(0, s.brackets) === 0 && rentalIncomeTax(-5000, s.brackets) === 0)
  }
}

// ── 4) ΠΛΗΡΗΣ ΑΛΥΣΙΔΑ: incomeStatement (φυσικό πρόσωπο, μακροχρόνια) ────────
{
  const rnd = rng(13131)
  for (let i = 0; i < 6000; i++) {
    const gross = round2(rnd() * 80000)
    // Με τραπεζική είσπραξη: φορολογείται το 95%, ίδια στρογγυλοποίηση με τη μηχανή.
    const st = incomeStatement({ regime: 'individual_longterm', grossIncome: gross, rentsPaidViaBank: true })
    const presumptive = round2(round2(gross) * 0.05)
    const taxable = Math.max(0, round2(round2(gross) - presumptive))
    ok(`αλυσίδα longterm φορολογητέο @${gross}`, near(st.taxableIncome, taxable))
    ok(`αλυσίδα longterm φόρος @${gross}`, near(st.incomeTax, round2(oracleRental(taxable))))
    ok(`αλυσίδα longterm καθαρό @${gross}`, near(st.netProfit, round2(gross - st.incomeTax)))
    // Χωρίς τραπεζική είσπραξη: φορολογείται το 100%.
    const stCash = incomeStatement({ regime: 'individual_longterm', grossIncome: gross, rentsPaidViaBank: false })
    ok(`αλυσίδα μετρητά 100% @${gross}`, near(stCash.taxableIncome, round2(gross)) && near(stCash.incomeTax, round2(oracleRental(round2(gross)))))
    // Ο φόρος με μετρητά ≥ φόρος με τράπεζα (χάνεις την έκπτωση).
    ok(`μετρητά≥τράπεζα @${gross}`, stCash.incomeTax >= st.incomeTax - 1e-6)
  }
}

// ── 4β) Επιχείρηση: ατομική (κλίμακα άρθρου 15) & νομικό πρόσωπο (22%) ──────
{
  const rnd = rng(24680)
  for (let i = 0; i < 5000; i++) {
    const gross = round2(rnd() * 90000)
    const exp = round2(rnd() * gross * 0.4)
    // Ατομική, χωρίς τεκμαρτό ελάχιστο (το ελέγχουμε χωριστά).
    const base = Math.max(0, round2(gross - exp))
    const stSole = incomeStatement({ regime: 'business', businessForm: 'sole', grossIncome: gross, itemizedExpenses: exp })
    ok(`επιχ. ατομική φορολογητέο @${gross}`, near(stSole.taxableIncome, base))
    ok(`επιχ. ατομική φόρος (άρθρο 15) @${gross}`, near(stSole.incomeTax, round2(oracleBusiness(base))))
    // Νομικό πρόσωπο: σταθερό 22%.
    const stCo = incomeStatement({ regime: 'business', businessForm: 'company', grossIncome: gross, itemizedExpenses: exp })
    ok(`επιχ. νομικό 22% @${gross}`, near(stCo.incomeTax, round2(base * 0.22)))
  }
  // Νέοι επιχειρηματίες (ηλικία) — σωστή κλίμακα.
  const rnd2 = rng(999)
  for (let i = 0; i < 3000; i++) {
    const base = round2(rnd2() * 60000)
    const st25 = incomeStatement({ regime: 'business', businessForm: 'sole', grossIncome: base, taxpayerAge: 23 })
    ok(`νέος≤25 άρθρο15 @${base}`, near(st25.incomeTax, round2(oracleYouth25(base))))
    const st30 = incomeStatement({ regime: 'business', businessForm: 'sole', grossIncome: base, taxpayerAge: 28 })
    ok(`νέος26-30 άρθρο15 @${base}`, near(st30.incomeTax, round2(oracleYouth30(base))))
    const stNew = incomeStatement({ regime: 'business', businessForm: 'sole', grossIncome: base, firstThreeYears: true })
    ok(`νέος-επαγ. άρθρο15 @${base}`, near(stNew.incomeTax, round2(oracleNewPro(base))))
    // Η επιλογή κλίμακας ανά ηλικία είναι σωστή.
    ok(`επιλογή κλίμακας @${base}`, art15BracketsForAge(23) === YOUTH_UP_TO_25_BRACKETS_2026 && art15BracketsForAge(28) === YOUTH_26_30_BRACKETS_2026)
  }
}

// ── 5) ΕΝΟΠΟΙΗΣΗ ΧΑΡΤΟΦΥΛΑΚΙΟΥ: φόρος στο ΑΘΡΟΙΣΜΑ (Ε1), όχι ανά ακίνητο ────
{
  const rnd = rng(55555)
  for (let i = 0; i < 4000; i++) {
    const n = 2 + Math.floor(rnd() * 4) // 2–5 ακίνητα
    const items = Array.from({ length: n }, (_, k) => ({ id: `p${k}`, input: { regime: 'individual_longterm' as const, grossIncome: round2(rnd() * 20000), rentsPaidViaBank: true } }))
    const con = consolidateIndividual(items)
    // Ο συνολικός φόρος = φόρος στο ΣΥΝΟΛΙΚΟ φορολογητέο (προοδευτικά).
    ok(`ενοπ. φόρος=φόρος(Σφορολογητέου) #${i}`, near(con.incomeTax, round2(oracleRental(con.taxableIncome))))
    // Ο φόρος του άθροισματος ≥ άθροισμα φόρων ανά ακίνητο (προοδευτικότητα).
    const sumSeparate = items.reduce((s, it) => s + oracleRental(Math.max(0, round2(round2(it.input.grossIncome) - round2(round2(it.input.grossIncome) * 0.05)))), 0)
    ok(`ενοπ. προοδευτικότητα #${i}`, con.incomeTax >= round2(sumSeparate) - 0.05)
    // Τα μερίδια αθροίζουν στον συνολικό φόρο (με ανοχή στρογγυλοποίησης).
    const shareSum = con.perProperty.reduce((s, p) => s + p.taxShare, 0)
    ok(`ενοπ. μερίδια=σύνολο #${i}`, near(shareSum, con.incomeTax, 0.05))
  }
}

console.log(`taxVerification — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { console.log('Πρώτες αποτυχίες:'); for (const f of fails) console.log('  ✗ ' + f); process.exit(1) }
console.log('όλα πέρασαν — η φορολογική μηχανή επαληθεύτηκε σε ' + passed.toLocaleString('el-GR') + ' ελέγχους')
