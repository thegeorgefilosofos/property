// Τεστ για την εκτίμηση ΕΝΦΙΑ (lib/billing/enfia.ts) — τιμές ΦΕΚ Α΄65/2022.
import { estimateENFIA, estimateENFIAFromFacts, enfiaExtraPropertyTax, zoneKeyFromPricePerSqm, ENFIA_ZONE_TAX, enfiaInUse } from './enfia'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const near = (a: number, b: number, eps = 0.5) => Math.abs(a - b) <= eps

// ── Βασικός φόρος (ΣΒΦ ζώνη 1501-2500 = 3,70 · 2ος όροφος 1,01 · 10-20 ετών 1,15)
{
  const r = estimateENFIA({ sqm: 100, zone: '1501_2500', floor: 'second', age: '10_20', ownership: 100 })!
  ok('βασικός = τ.μ.×ΣΒΦ×συντελεστές', near(r.basic, 100 * 3.70 * 1.01 * 1.15))
  ok('χωρίς προσαύξηση (καμία αξία)', r.supplementary === 0)
  ok('χωρίς μείωση όταν άγνωστη αξία', r.reductionPct === 0 && near(r.annual, r.subtotal))
  ok('12 δόσεις', r.installment === Math.ceil(r.annual / 12))
}

// ── Αυτόματη μείωση ανά συνολική αξία (άρθρο 7 §2Α) ─────────────────────────
{
  const w = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 90000 })!   // ≤100k → 30%
  ok('αξία ≤100k → μείωση 30%', w.reductionPct === 30 && near(w.annual, w.subtotal * 0.7))
  const w2 = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 500000 })!  // >400k → 0%, =500k χωρίς προσαύξηση
  ok('αξία >400k → καμία αυτόματη μείωση', w2.reductionPct === 0)
  ok('αξία =500k → καμία προσαύξηση', w2.supplementary === 0)
}

// ── Προσαύξηση κύριου φόρου (>500k) ─────────────────────────────────────────
{
  const s = estimateENFIA({ sqm: 120, zone: '1501_2500', totalValue: 700000 })!
  ok('προσαύξηση = κύριος × 10% (κλιμάκιο ≤800k)', near(s.supplementary, s.basic * 0.10))
  ok('>400k → καμία αυτόματη μείωση', s.reductionPct === 0)
}

// ── Ενότητα Γ: πρόσθετος φόρος ανά ακίνητο >400.000€ (κλιμακωτά) ─────────────
{
  // Καθαρή συνάρτηση: αφορολόγητο 400k, μετά κλιμακωτά.
  ok('extra: αξία ≤400k → 0', enfiaExtraPropertyTax(400000) === 0)
  // 400-500k → 100.000×0,20% = 200· 500-600k → 100.000×0,30% = 300 → σύνολο 500.
  ok('extra: 600k → 500€', near(enfiaExtraPropertyTax(600000), 500))
  // Πλήρης κλίμακα ως 1.000.000: 200+300+400+500+600+700 = 2.700.
  ok('extra: 1.000.000 → 2.700€', near(enfiaExtraPropertyTax(1000000), 2700))
  ok('extra: 50% ιδιοκτησία → μισό', near(enfiaExtraPropertyTax(1000000, 50), 1350))

  // Ενσωμάτωση στη μηχανή: εφαρμόζεται μόνο αν συνολική περιουσία >300.000€.
  const g = estimateENFIA({ sqm: 100, zone: 'over_5000', totalValue: 600000, propertyValue: 600000 })!
  ok('estimate: extra 600k ακίνητο → 500€', near(g.extra, 500))
  // Πύλη συνολικής περιουσίας: ≤300k → κανένας πρόσθετος, όσο ακριβό κι αν είναι το ακίνητο.
  const gate = estimateENFIA({ sqm: 100, zone: 'over_5000', totalValue: 250000, propertyValue: 500000 })!
  ok('estimate: συνολική ≤300k → extra 0', gate.extra === 0)
  // Ακίνητο ≤400k → κανένας πρόσθετος, ακόμη κι αν η συνολική περιουσία είναι μεγάλη.
  const low = estimateENFIA({ sqm: 100, zone: 'over_5000', totalValue: 600000, propertyValue: 350000 })!
  ok('estimate: ακίνητο ≤400k → extra 0', low.extra === 0)
  // Ο πρόσθετος μπαίνει στον κύριο φόρο και μετά προσαυξάνεται (>500k).
  ok('estimate: προσαύξηση επί (βασικός+extra)', near(g.supplementary, (g.basic + g.extra) * 0.05))
}

// ── Χειροκίνητες εκπτώσεις (απομονωμένες με αξία >400k → wealthPct 0) ────────
{
  const plain = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 450000 })!
  const red = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 450000, reductions: ['low_income'] })!
  ok('χαμηλό εισόδημα −50%', near(red.annual, plain.annual * 0.5))
  const big = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 450000, reductions: ['insurance', 'large_family'] })!
  ok('κρατά τη μεγαλύτερη (100% → μηδέν)', big.reductionPct === 100 && big.annual === 0)
}

// ── Συνδυασμός αυτόματης + χειροκίνητης μείωσης (πολλαπλασιαστικά) ──────────
{
  const c = estimateENFIA({ sqm: 100, zone: '751_1500', totalValue: 90000, reductions: ['insurance'] })! // 30% & 20%
  ok('30% & 20% → 44% συνολικά', c.reductionPct === 44) // 1-(0.7×0.8)=0.44
}

// ── Ποσοστό ιδιοκτησίας ─────────────────────────────────────────────────────
{
  const full = estimateENFIA({ sqm: 100, zone: '751_1500', ownership: 100 })!
  const half = estimateENFIA({ sqm: 100, zone: '751_1500', ownership: 50 })!
  ok('50% ιδιοκτησία → μισός βασικός', near(half.basic, full.basic / 2))
}

// ── Ασφάλεια εισόδου ────────────────────────────────────────────────────────
{
  ok('χωρίς τ.μ. → null', estimateENFIA({ sqm: 0, zone: '751_1500' }) === null)
  ok('χωρίς ζώνη → null', estimateENFIA({ sqm: 100, zone: '' }) === null)
  ok('άγνωστη ζώνη → null', estimateENFIA({ sqm: 100, zone: 'foo' }) === null)
}

// ── Αντιστοίχιση τιμής ζώνης (9 κλιμάκια ΦΕΚ) ───────────────────────────────
{
  ok('300 €/τ.μ. → 0_750', zoneKeyFromPricePerSqm(300) === '0_750')
  ok('1800 €/τ.μ. → 1501_2500', zoneKeyFromPricePerSqm(1800) === '1501_2500')
  ok('5000 €/τ.μ. → 4501_5000', zoneKeyFromPricePerSqm(5000) === '4501_5000')
  ok('6000 €/τ.μ. → over_5000', zoneKeyFromPricePerSqm(6000) === 'over_5000')
  ok('0 → null', zoneKeyFromPricePerSqm(0) === null)
  ok('όλα τα keys υπάρχουν στον πίνακα', ['0_750', '1501_2500', 'over_5000'].every(k => k in ENFIA_ZONE_TAX))
}

// ── Αυτόματη εκτίμηση από στοιχεία ακινήτου ─────────────────────────────────
{
  // αξία 180.000, 90 τ.μ. → 2.000 €/τ.μ. → ζώνη 1501_2500
  const r = estimateENFIAFromFacts({ value: 180000, sqm: 90 })!
  ok('auto: παράγει αποτέλεσμα', r !== null && r.annual > 0)
  ok('auto: καμία προσαύξηση (≤500k)', r.supplementary === 0)
  ok('auto: αξία 180k → μείωση 20% (≤250k)', r.reductionPct === 20)
  ok('auto: χωρίς δεδομένα → null', estimateENFIAFromFacts({ value: 0, sqm: 90 }) === null)
  const big = estimateENFIAFromFacts({ value: 700000, sqm: 120 })!
  ok('auto: προσαύξηση όταν αξία >500k', big.supplementary > 0)
}

// ═══ ΠΟΙΟ ΝΟΥΜΕΡΟ ΙΣΧΥΕΙ — ΤΟ ΔΗΛΩΜΕΝΟ ΝΙΚΑ ΤΗΝ ΕΚΤΙΜΗΣΗ ══════════════════
// Το σφάλμα: οι Υπηρεσίες προτιμούσαν την εκτίμηση και έσβηναν το ποσό που είχε
// αντιγράψει ο ιδιοκτήτης από το εκκαθαριστικό· ο Προϋπολογισμός διάβαζε μόνο το
// χειροκίνητο και έδειχνε 0 όταν είχε χρησιμοποιηθεί ο υπολογιστής.
{
  const est = estimateENFIA({ sqm: 100, zone: '1501_2500', floor: 'second', age: '10_20', ownership: 100 })!
  ok('η εκτίμηση υπάρχει, για να έχει νόημα η σύγκριση', est.annual > 0)

  const declared = enfiaInUse('520', '', est.annual)
  ok('το δηλωμένο νικά την εκτίμηση', declared.annual === 520 && declared.source === 'declared')
  ok('το μηνιαίο βγαίνει από το δηλωμένο', near(declared.monthly, 520 / 12, 0.01))

  const onlyEst = enfiaInUse('', '', est.annual)
  ok('χωρίς δηλωμένο, ισχύει η εκτίμηση', onlyEst.annual === est.annual && onlyEst.source === 'estimate')

  ok('κενά και στα δύο → μηδέν, με πηγή «καμία»',
     enfiaInUse('', '', null).annual === 0 && enfiaInUse('', '', null).source === 'none')
  ok('χωρίς εκτίμηση αλλά με δηλωμένο → δηλωμένο',
     enfiaInUse('300', '', null).source === 'declared')

  // Το μηνιαίο πεδίο είναι εναλλακτική είσοδος, όχι δεύτερος άξονας.
  ok('μόνο μηνιαίο → ανάγεται σε ετήσιο', enfiaInUse('', '40', est.annual).annual === 480)
  ok('το ετήσιο υπερισχύει του μηνιαίου', enfiaInUse('600', '40', est.annual).annual === 600)

  // Τιμές που αφήνει πίσω της μια φόρμα δεν είναι δηλώσεις του χρήστη.
  ok('το μηδέν δεν μετρά ως δήλωση', enfiaInUse('0', '', est.annual).source === 'estimate')
  ok('το κενό κείμενο ούτε', enfiaInUse('   ', '', est.annual).source === 'estimate')
  ok('το αρνητικό ούτε', enfiaInUse('-5', '', est.annual).source === 'estimate')
  ok('τα σκουπίδια ούτε', enfiaInUse('άσχετο', '', est.annual).source === 'estimate')
  // Ελληνικό δεκαδικό κόμμα: «520,50» δεν είναι NaN.
  ok('δέχεται δεκαδικό κόμμα', enfiaInUse('520,50', '', est.annual).annual === 520.5)
  ok('εκτίμηση με μηδέν ετήσιο δεν επιλέγεται',
     enfiaInUse('', '', 0).source === 'none')
}

console.log(`enfia.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { process.exit(1) }
console.log('όλα πέρασαν')
