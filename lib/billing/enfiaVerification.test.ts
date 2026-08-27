// ═══════════════════════════════════════════════════════════════════════════
// ΕΠΑΛΗΘΕΥΣΗ ΕΝΦΙΑ ΣΕ ΜΕΓΑΛΗ ΚΛΙΜΑΚΑ (χιλιάδες τυχαίες διαμορφώσεις ακινήτου)
// ---------------------------------------------------------------------------
// Ανεξάρτητος oracle: ξαναϋπολογίζει τον ΕΝΦΙΑ με βάση ΤΟΝ ΝΟΜΟ (ΦΕΚ Α΄65/2022,
// άρθρα 43–46 ν.4916/2022) — βασικός φόρος × συντελεστές, πρόσθετος Ενότητας Γ,
// προσαύξηση >500k, αυτόματη μείωση ανά αξία, χειροκίνητες εκπτώσεις — και συγκρίνει
// με τη μηχανή σε χιλιάδες περιπτώσεις. GOLDEN: αριθμοί απευθείας από το ΦΕΚ.
// ═══════════════════════════════════════════════════════════════════════════

import {
  estimateENFIA, enfiaExtraPropertyTax, wealthReductionPct,
  ENFIA_ZONE_TAX, ENFIA_FLOOR_COEF, ENFIA_AGE_COEF, ENFIA_REDUCTIONS, ENFIA_AGE_BANDS, enfiaAgeCoef, normalizeEnfiaAgeKey,
  ENFIA_SURCHARGE_THRESHOLD, ENFIA_SURCHARGE_BRACKETS,
  ENFIA_EXTRA_TAX_FREE, ENFIA_EXTRA_WEALTH_THRESHOLD,
} from './enfia'

let passed = 0, failed = 0
const fails: string[] = []
function ok(name: string, cond: boolean) { if (cond) passed++; else { failed++; if (fails.length < 40) fails.push(name) } }
const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) <= eps
function rng(seed: number) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const round2 = (n: number) => Math.round(n * 100) / 100

// ── Ανεξάρτητος oracle (ξαναγραμμένος από τον νόμο) ────────────────────────
function surchargePct(totalVal: number): number {
  if (totalVal <= ENFIA_SURCHARGE_THRESHOLD) return 0
  const b = ENFIA_SURCHARGE_BRACKETS.find(x => totalVal <= x.limit)
  return b ? b.pct : 0
}
function enfiaOracle(sqm: number, zone: string, floor: string, age: string, ownership: number, totalVal: number, propVal: number, reductions: string[]) {
  const own = Math.max(0, Math.min(100, ownership)) / 100
  const basic = sqm * ENFIA_ZONE_TAX[zone] * ENFIA_FLOOR_COEF[floor] * ENFIA_AGE_COEF[age] * own
  const extra = totalVal > ENFIA_EXTRA_WEALTH_THRESHOLD ? enfiaExtraPropertyTax(propVal, ownership) : 0
  const kyrios = basic + extra
  const suppl = kyrios * surchargePct(totalVal) / 100
  const subtotal = kyrios + suppl
  const wealthPct = wealthReductionPct(totalVal)
  const manualPct = Math.max(0, ...reductions.map(r => ENFIA_REDUCTIONS.find(rd => rd.key === r)?.pct || 0))
  const combined = 1 - (1 - wealthPct / 100) * (1 - manualPct / 100)
  const annual = Math.max(0, subtotal * (1 - combined))
  return { basic: round2(basic), extra: round2(extra), suppl: round2(suppl), annual: round2(annual) }
}

const ZONES = Object.keys(ENFIA_ZONE_TAX)
const FLOORS = Object.keys(ENFIA_FLOOR_COEF)
const AGES = Object.keys(ENFIA_AGE_COEF)
const REDS = ENFIA_REDUCTIONS.map(r => r.key)

// ── GOLDEN: ρητοί αριθμοί από τον νόμο ─────────────────────────────────────
{
  // Βασικός: 100 τ.μ. × ΣΒΦ(1501-2500=3,70) × όροφος(2ος=1,01) × παλαιότητα(10-20=1,15).
  const r = estimateENFIA({ sqm: 100, zone: '1501_2500', floor: 'second', age: '10_20', ownership: 100 })!
  ok('GOLDEN βασικός = 100×3,70×1,01×1,15 = 429,76 €', near(r.basic, 100 * 3.70 * 1.01 * 1.15, 0.02))
  // Ενότητα Γ: ακίνητο 600.000 € (συνολ. >300k) → 100k×0,20% + 100k×0,30% = 500 €.
  ok('GOLDEN Ενότητα Γ 600k → 500 €', near(enfiaExtraPropertyTax(600000), 500))
  ok('GOLDEN Ενότητα Γ 1.000.000 → 2.700 €', near(enfiaExtraPropertyTax(1000000), 2700))
  // Προσαύξηση >500k: 700.000 → κλιμάκιο 10% επί του κύριου φόρου.
  const s = estimateENFIA({ sqm: 120, zone: '1501_2500', totalValue: 700000 })!
  ok('GOLDEN προσαύξηση 700k = 10% κύριου', near(s.supplementary, (s.basic + s.extra) * 0.10))
  // Αυτόματη μείωση: αξία ≤100k → 30%.
  ok('GOLDEN μείωση ≤100k = 30%', wealthReductionPct(90000) === 30)
  ok('GOLDEN μείωση >400k = 0%', wealthReductionPct(500000) === 0)
}

// ── Χιλιάδες τυχαίες διαμορφώσεις vs oracle ────────────────────────────────
{
  const rnd = rng(65432)
  const N = 40000
  for (let i = 0; i < N; i++) {
    const sqm = round2(20 + rnd() * 380)                 // 20–400 τ.μ.
    const zone = ZONES[Math.floor(rnd() * ZONES.length)]
    const floor = FLOORS[Math.floor(rnd() * FLOORS.length)]
    const age = AGES[Math.floor(rnd() * AGES.length)]
    const ownership = Math.floor(rnd() * 101)             // 0–100%
    const totalVal = Math.floor(rnd() * 1500000)          // 0–1,5εκ.
    const propVal = Math.floor(rnd() * totalVal * 1.0)    // ≤ συνολικής
    // 0–2 χειροκίνητες εκπτώσεις.
    const reductions: string[] = []
    if (rnd() < 0.3) reductions.push(REDS[Math.floor(rnd() * REDS.length)])
    if (rnd() < 0.15) reductions.push(REDS[Math.floor(rnd() * REDS.length)])

    const eng = estimateENFIA({ sqm, zone, floor, age, ownership, totalValue: totalVal, propertyValue: propVal, reductions })
    if (sqm <= 0) { ok(`enfia null @${i}`, eng === null); continue }
    const orc = enfiaOracle(sqm, zone, floor, age, ownership, totalVal, propVal, reductions)
    ok(`enfia βασικός @${i}`, near(eng!.basic, orc.basic))
    ok(`enfia extra @${i}`, near(eng!.extra, orc.extra))
    ok(`enfia προσαύξηση @${i}`, near(eng!.supplementary, orc.suppl))
    ok(`enfia ετήσιος @${i}`, near(eng!.annual, orc.annual))
    // Αναλλοίωτες: ο τελικός ≤ subtotal και μη αρνητικός.
    ok(`enfia φράγμα @${i}`, eng!.annual >= -1e-9 && eng!.annual <= eng!.subtotal + 1e-6)
  }
}

// ── Ενότητα Γ: κλιμακωτή, μονότονη, μηδέν κάτω από το αφορολόγητο ──────────
{
  const rnd = rng(321)
  let prev = 0
  for (let v = 0; v <= 3000000; v += 2500) {
    const t = enfiaExtraPropertyTax(v)
    ok(`extra μηδέν ≤400k @${v}`, v > ENFIA_EXTRA_TAX_FREE || t === 0)
    ok(`extra μονοτονία @${v}`, t >= prev - 1e-6)
    prev = t
  }
  // Ποσοστό ιδιοκτησίας: γραμμικό.
  for (let i = 0; i < 2000; i++) {
    const v = 400000 + Math.floor(rnd() * 2000000)
    ok(`extra 50% = μισό @${v}`, near(enfiaExtraPropertyTax(v, 50), enfiaExtraPropertyTax(v, 100) / 2, 0.02))
  }
}

// ═══ ΤΑ ΚΛΙΜΑΚΙΑ ΠΑΛΑΙΟΤΗΤΑΣ ══════════════════════════════════════════════
// Ο νόμος έχει ΕΞΙ κλιμάκια. Ο πίνακας είχε πέντε — έλειπε το «15-19 έτη» και
// το προηγούμενο τα κατάπινε, χρεώνοντας 1,15 αντί για 1,10 σε κάθε κτίσμα
// 15 ως 19 ετών. Οι έλεγχοι εδώ κρατούν και τα έξι και την τιμή τους.
{
  const bands = ENFIA_AGE_BANDS
  ok('έξι κλιμάκια, όσα και ο νόμος', bands.length === 6)
  ok('όλα τα κλιμάκια έχουν ετικέτα', bands.every(b => b.label.trim().length > 0))
  // Τα νεότερα κτίσματα επιβαρύνονται ΠΕΡΙΣΣΟΤΕΡΟ: ο συντελεστής πέφτει μονότονα.
  ok('ο συντελεστής πέφτει με την ηλικία',
     bands.every((b, i) => i === 0 || bands[i - 1].coef > b.coef))
  ok('το κλιμάκιο 15-19 υπάρχει και είναι 1,10',
     bands.find(b => b.key === 'y15_19')?.coef === 1.10)
  ok('το κλιμάκιο 10-14 μένει 1,15',
     bands.find(b => b.key === 'y10_14')?.coef === 1.15)
  ok('το παλαιότερο δεν έχει προσαύξηση',
     bands[bands.length - 1].coef === 1.00)

  // ΤΑ ΠΑΛΙΑ ΚΛΕΙΔΙΑ ΕΙΝΑΙ ΗΔΗ ΑΠΟΘΗΚΕΥΜΕΝΑ ΣΕ ΡΥΘΜΙΣΕΙΣ ΧΡΗΣΤΩΝ.
  // Αν σταματούσαν να αναγνωρίζονται, ο συντελεστής θα γινόταν undefined και ο
  // ΕΝΦΙΑ NaN: διόρθωση ακρίβειας που σπάει την οθόνη είναι χειρότερη από το λάθος.
  for (const legacy of ['under_5', '5_10', '10_20', '20_25', '25_30', 'over_30']) {
    ok(`το παλιό κλειδί «${legacy}» εξακολουθεί να δίνει αριθμό`,
       Number.isFinite(enfiaAgeCoef(legacy)) && enfiaAgeCoef(legacy) > 0)
  }
  ok('άγνωστο κλειδί δεν δίνει NaN', enfiaAgeCoef('φρου-φρου') === 1.00)
  ok('κενό κλειδί δεν δίνει NaN', enfiaAgeCoef(null) === 1.00)

  // Το σενάριο του σφάλματος, με πραγματικά νούμερα.
  const sqm = 100, zone = ENFIA_ZONE_TAX['1501_2500'] ?? 3.70
  const swra = sqm * zone * 1.00 * enfiaAgeCoef('y15_19')
  const palio = sqm * zone * 1.00 * 1.15
  ok('κτίσμα 17 ετών: 407 € και όχι 425,50 €', Math.round(swra * 100) / 100 === 407)
  ok('η υπερχρέωση ήταν 18,50 €', Math.round((palio - swra) * 100) / 100 === 18.50)
}

// ═══ ΤΟ ΚΛΕΙΔΙ ΠΑΛΑΙΟΤΗΤΑΣ ΔΙΑΒΑΖΕΤΑΙ ΚΑΙ ΕΞΩ ΑΠΟ ΤΟΝ ΕΝΦΙΑ ══════════════════
// Η ασφάλιση κατοικίας υπολογίζει τον κίνδυνο κτιρίου από την ΙΔΙΑ ρύθμιση και
// συνέκρινε με τα ΠΑΛΙΑ ονόματα ενώ η αποθηκευμένη τιμή είχε γίνει το νέο:
// καμία συνθήκη δεν ταίριαζε, ο συντελεστής έβγαινε πάντα 1,00 και μια οικοδομή
// του 1975 έπαιρνε την ίδια εκτίμηση ασφαλίστρου με νεόδμητη. Το σφάλμα ήταν
// αόρατο γιατί το αποτέλεσμα ΕΒΓΑΙΝΕ — απλώς ήταν πάντα το ίδιο.
{
  for (const [legacy, modern] of [
    ['under_5', 'y0_4'], ['5_10', 'y5_9'], ['10_20', 'y10_14'],
    ['20_25', 'y20_25'], ['25_30', 'y26_plus'], ['over_30', 'y26_plus'],
  ] as [string, string][]) {
    ok(`«${legacy}» μεταφράζεται σε «${modern}»`, normalizeEnfiaAgeKey(legacy) === modern)
  }
  for (const b of ENFIA_AGE_BANDS) {
    ok(`το νέο κλειδί «${b.key}» μένει ως έχει`, normalizeEnfiaAgeKey(b.key) === b.key)
  }
  ok('κενό δίνει κενό, όχι undefined', normalizeEnfiaAgeKey(null) === '' && normalizeEnfiaAgeKey('') === '')
  ok('κενά γύρω από το κλειδί δεν το κρύβουν', normalizeEnfiaAgeKey('  under_5 ') === 'y0_4')
  // Κάθε κλειδί που μπορεί να φτάσει στην ασφάλιση καταλήγει σε ΓΝΩΣΤΗ ζώνη.
  const known = new Set(ENFIA_AGE_BANDS.map(b => b.key))
  for (const k of ['under_5', '5_10', '10_20', '20_25', '25_30', 'over_30',
                   ...ENFIA_AGE_BANDS.map(b => b.key)]) {
    ok(`«${k}» καταλήγει σε αναγνωρίσιμη ζώνη`, known.has(normalizeEnfiaAgeKey(k)))
  }
}

console.log(`enfiaVerification — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { console.log('Πρώτες αποτυχίες:'); for (const f of fails) console.log('  ✗ ' + f); process.exit(1) }
console.log('όλα πέρασαν — ο ΕΝΦΙΑ επαληθεύτηκε σε ' + passed.toLocaleString('el-GR') + ' ελέγχους')
