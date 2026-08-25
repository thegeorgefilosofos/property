// Τεστ για την εκτίμηση ΕΝΦΙΑ (lib/billing/enfia.ts) — τιμές ΦΕΚ Α΄65/2022.
import { enfiaLastYearAnnual,
  estimateENFIA, estimateENFIAFromFacts, enfiaExtraPropertyTax, zoneKeyFromPricePerSqm,
  ENFIA_ZONE_TAX, enfiaInUse, enfiaAgeCoef, enfiaFloorCoef,
  enfiaAgeKeyFromYears, enfiaAgeKeyFromYearBuilt, enfiaFloorKeyFromValue,
  enfiaTypeBlock, ENFIA_TYPE_BLOCK_NOTE,
} from './enfia'

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
  ok('30% και 20% → 44% συνολικά', c.reductionPct === 44) // 1-(0.7×0.8)=0.44
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

// ═══ ΟΙΚΟΠΕΔΟ ΚΑΙ ΒΟΗΘΗΤΙΚΟΣ ΧΩΡΟΣ ΔΕΝ ΕΙΝΑΙ ΚΑΤΟΙΚΙΑ ══════════════════════
// Το σφάλμα: η αυτόματη εκτίμηση εφάρμοζε τον πίνακα των ΚΤΙΣΜΑΤΩΝ σε ό,τι είχε
// αξία και τετραγωνικά. Αποθήκη 20 τ.μ. αξίας 30.000 € έβγαζε 39,20 € τον χρόνο,
// οικόπεδο 400 τ.μ. αξίας 120.000 € έβγαζε 600,00 € — και τα δύο περνούσαν στους
// φόρους ακινήτου και στην πρόβλεψη. Ο νόμος έχει άλλον πίνακα για τα γήπεδα και
// δικό του συντελεστή για τους βοηθητικούς χώρους· δεν υπάρχουν εδώ, άρα δεν
// βγαίνει νούμερο.
{
  ok('κλειδί οδηγού: land', enfiaTypeBlock('land') === 'land')
  ok('ελληνική ετικέτα: Οικόπεδο', enfiaTypeBlock('Οικόπεδο') === 'land')
  ok('κλειδιά βοηθητικών', enfiaTypeBlock('storage') === 'auxiliary' && enfiaTypeBlock('parking') === 'auxiliary')
  ok('ετικέτα «Αποθήκη Κτιρίου»', enfiaTypeBlock('Αποθήκη Κτιρίου') === 'auxiliary')
  ok('ετικέτα «Θέση Στάθμευσης»', enfiaTypeBlock('Θέση Στάθμευσης') === 'auxiliary')
  ok('κατοικία δεν μπλοκάρει', enfiaTypeBlock('Κατοικία') === null && enfiaTypeBlock('apartment') === null)
  ok('γραφείο/κατάστημα δεν μπλοκάρουν', enfiaTypeBlock('office') === null && enfiaTypeBlock('shop') === null)
  ok('άγνωστος τύπος δεν μπλοκάρει', enfiaTypeBlock(null) === null && enfiaTypeBlock('') === null)

  // Τα ίδια στοιχεία, μόνο ο τύπος αλλάζει: με κτίσμα βγαίνει ποσό, χωρίς όχι.
  ok('αποθήκη 20 τ.μ. → καμία εκτίμηση',
    estimateENFIAFromFacts({ value: 30000, sqm: 20, propType: 'storage' }) === null)
  ok('τα ίδια στοιχεία ως διαμέρισμα έβγαζαν 39,20 €',
    estimateENFIAFromFacts({ value: 30000, sqm: 20, propType: 'apartment' })?.annual === 39.20)
  ok('οικόπεδο 400 τ.μ. → καμία εκτίμηση',
    estimateENFIAFromFacts({ value: 120000, sqm: 400, propType: 'Οικόπεδο' }) === null)
  ok('τα ίδια στοιχεία ως κατοικία έβγαζαν 600,00 €',
    estimateENFIAFromFacts({ value: 120000, sqm: 400, propType: 'Κατοικία' })?.annual === 600.00)

  // Κάθε λόγος έχει κείμενο και το κείμενο λέει ότι δεν βγαίνει εκτίμηση.
  ok('κείμενο για κάθε λόγο',
    ENFIA_TYPE_BLOCK_NOTE.land.includes('Δεν βγαίνει') && ENFIA_TYPE_BLOCK_NOTE.auxiliary.includes('Δεν βγαίνει'))
}

// ═══ ΕΤΟΣ ΚΑΤΑΣΚΕΥΗΣ ΚΑΙ ΟΡΟΦΟΣ — ΔΙΑΒΑΖΟΝΤΑΙ, ΔΕΝ ΜΑΝΤΕΥΟΝΤΑΙ ═════════════
// Το σφάλμα: η αυτόματη εκτίμηση δεχόταν μόνο αξία και τ.μ. και έπεφτε στις
// προεπιλογές «2ος όροφος» (1,01) και «10-20 ετών» (1,15) — 16,15% πάνω από την
// ουδέτερη βάση, ΠΑΝΤΑ προς την ίδια κατεύθυνση. Τα δύο πεδία ήταν ήδη στη βάση.

// ── Κλιμάκιο παλαιότητας από έτη ────────────────────────────────────────────
{
  ok('0 έτη → y0_4', enfiaAgeKeyFromYears(0) === 'y0_4')
  ok('17 έτη → y15_19', enfiaAgeKeyFromYears(17) === 'y15_19')
  ok('80 έτη → y26_plus', enfiaAgeKeyFromYears(80) === 'y26_plus')
  // Τα σύνορα των κλιμακίων, όπου κρίνεται η διαφορά ενός ολόκληρου συντελεστή.
  ok('σύνορο 4/5', enfiaAgeKeyFromYears(4) === 'y0_4' && enfiaAgeKeyFromYears(5) === 'y5_9')
  ok('σύνορο 9/10', enfiaAgeKeyFromYears(9) === 'y5_9' && enfiaAgeKeyFromYears(10) === 'y10_14')
  ok('σύνορο 14/15', enfiaAgeKeyFromYears(14) === 'y10_14' && enfiaAgeKeyFromYears(15) === 'y15_19')
  ok('σύνορο 19/20', enfiaAgeKeyFromYears(19) === 'y15_19' && enfiaAgeKeyFromYears(20) === 'y20_25')
  ok('σύνορο 25/26', enfiaAgeKeyFromYears(25) === 'y20_25' && enfiaAgeKeyFromYears(26) === 'y26_plus')
}

// ── Κλιμάκιο παλαιότητας από έτος κατασκευής ────────────────────────────────
{
  ok('2009 στο 2026 → 17 ετών → y15_19', enfiaAgeKeyFromYearBuilt(2009, 2026) === 'y15_19')
  ok('2026 στο 2026 → νεόδμητο y0_4', enfiaAgeKeyFromYearBuilt(2026, 2026) === 'y0_4')
  ok('1998 στο 2026 → y26_plus', enfiaAgeKeyFromYearBuilt(1998, 2026) === 'y26_plus')
  ok('δέχεται κείμενο «2009»', enfiaAgeKeyFromYearBuilt('2009', 2026) === 'y15_19')
  ok('χωρίς έτος → null', enfiaAgeKeyFromYearBuilt(null, 2026) === null)
  ok('κενό κείμενο → null', enfiaAgeKeyFromYearBuilt('', 2026) === null)
  ok('παράλογο έτος → null', enfiaAgeKeyFromYearBuilt(1200, 2026) === null)
  // Το «2062» αντί «2006» δεν γίνεται νεόδμητο: θα φόρτωνε τον υψηλότερο συντελεστή (1,25).
  ok('μελλοντικό έτος → null, όχι 1,25', enfiaAgeKeyFromYearBuilt(2062, 2026) === null)
  ok('χωρίς έτος υπολογισμού πέφτει στο τρέχον', enfiaAgeKeyFromYearBuilt(1900) === 'y26_plus')
}

// ── Κλειδί ορόφου από ό,τι κρατά η καρτέλα ──────────────────────────────────
{
  ok('«Υπόγειο» → basement', enfiaFloorKeyFromValue('Υπόγειο') === 'basement')
  ok('«Ημιυπόγειο» → basement', enfiaFloorKeyFromValue('Ημιυπόγειο') === 'basement')
  ok('«Ισόγειο» → ground', enfiaFloorKeyFromValue('Ισόγειο') === 'ground')
  ok('«Υπερυψωμένο ισόγειο» → ground', enfiaFloorKeyFromValue('Υπερυψωμένο ισόγειο') === 'ground')
  ok('«Ημιώροφος» → ground', enfiaFloorKeyFromValue('Ημιώροφος') === 'ground')
  ok('«1ος» → first', enfiaFloorKeyFromValue('1ος') === 'first')
  ok('«2ος» → second', enfiaFloorKeyFromValue('2ος') === 'second')
  ok('«3ος» → third', enfiaFloorKeyFromValue('3ος') === 'third')
  ok('«7ος και άνω» → fifth_plus', enfiaFloorKeyFromValue('7ος και άνω') === 'fifth_plus')
  ok('σκέτος αριθμός 2 → second', enfiaFloorKeyFromValue(2) === 'second')
  ok('σκέτο 0 → ground', enfiaFloorKeyFromValue(0) === 'ground')
  ok('ήδη κανονικό κλειδί μένει ίδιο', enfiaFloorKeyFromValue('fifth_plus') === 'fifth_plus')
  // Ο νόμος βάζει 4ο ΚΑΙ 5ο στο 1,02· από τον 6ο και πάνω 1,03.
  ok('4ος → 1,02', enfiaFloorCoef(enfiaFloorKeyFromValue('4ος')) === 1.02)
  ok('5ος → 1,02, όχι 1,03', enfiaFloorCoef(enfiaFloorKeyFromValue('5ος')) === 1.02)
  ok('6ος → 1,03', enfiaFloorCoef(enfiaFloorKeyFromValue('6ος')) === 1.03)
  ok('«Δώμα / Ρετιρέ» ασαφές → null', enfiaFloorKeyFromValue('Δώμα / Ρετιρέ') === null)
  ok('κενό ή απόν → null', enfiaFloorKeyFromValue('') === null && enfiaFloorKeyFromValue(null) === null)
  ok('άγνωστο κείμενο → null', enfiaFloorKeyFromValue('κάτι άλλο') === null)
  // Κλειδί αντικειμένου δεν είναι όροφος: αλλιώς ο συντελεστής γινόταν συνάρτηση και ο φόρος NaN.
  ok('«constructor» δεν είναι όροφος', enfiaFloorKeyFromValue('constructor') === null)
  ok('«toString» → συντελεστής 1,00', enfiaFloorCoef('toString') === 1.00)
}

// ── Ουδέτεροι συντελεστές όταν λείπουν τα στοιχεία ──────────────────────────
{
  ok('χωρίς όροφο → 1,00', enfiaFloorCoef(undefined) === 1.00 && enfiaFloorCoef(null) === 1.00)
  ok('χωρίς παλαιότητα → 1,00', enfiaAgeCoef(undefined) === 1.00 && enfiaAgeCoef(null) === 1.00)
  const bare = estimateENFIA({ sqm: 100, zone: '1501_2500' })!
  ok('εκτίμηση χωρίς όροφο/παλαιότητα = τ.μ.×ΣΒΦ σκέτο', near(bare.basic, 100 * 3.70, 0.01))
}

// ── Η εκτίμηση από στοιχεία ακινήτου διαβάζει πλέον έτος και όροφο ──────────
{
  // 90 τ.μ., αξία 180.000 € → 2.000 €/τ.μ. → ζώνη 1501_2500 (ΣΒΦ 3,70), μείωση 20%.
  const bare = estimateENFIAFromFacts({ value: 180000, sqm: 90 })!
  ok('χωρίς στοιχεία: κανένας συντελεστής', near(bare.basic, 90 * 3.70, 0.01))
  ok('χωρίς στοιχεία: ετήσιο 266,40 €', bare.annual === 266.40)

  const real = estimateENFIAFromFacts({ value: 180000, sqm: 90, yearBuilt: 2009, floor: '2ος', taxYear: 2026 })!
  ok('με στοιχεία: 17 ετών (1,10) × 2ος όροφος (1,01)', near(real.basic, 90 * 3.70 * 1.01 * 1.10, 0.01))

  // Ακίνητο του οποίου οι ΠΡΑΓΜΑΤΙΚΟΙ συντελεστές είναι 1,00 και 1,00.
  const neutral = estimateENFIAFromFacts({ value: 180000, sqm: 90, yearBuilt: 1990, floor: 'Ισόγειο', taxYear: 2026 })!
  ok('ουδέτερο ακίνητο = εκτίμηση χωρίς στοιχεία', near(neutral.annual, bare.annual, 0.01))
  ok('ΧΩΡΙΣ ΣΤΟΙΧΕΙΑ ΔΕΝ ΕΙΝΑΙ ΜΕΓΑΛΥΤΕΡΗ ΑΠΟ ΤΟ ΟΥΔΕΤΕΡΟ', bare.annual <= neutral.annual)

  // Η παλιά προεπιλογή, ρητά: 2ος όροφος + 10-20 ετών, πάντα πάνω από την ουδέτερη.
  const oldDefault = estimateENFIA({
    sqm: 90, zone: '1501_2500', floor: 'second', age: '10_20',
    totalValue: 180000, propertyValue: 180000,
  })!
  ok('η παλιά προεπιλογή ήταν 309,42 € αντί 266,40 €', oldDefault.annual === 309.42)
  ok('μεροληψία +16,15% προς τα πάνω', near(oldDefault.annual / bare.annual, 1.1615, 0.0005))

  // Τα στοιχεία δεν σπρώχνουν μόνο προς τα πάνω: το υπόγειο κατεβάζει (0,98).
  const bsm = estimateENFIAFromFacts({ value: 180000, sqm: 90, yearBuilt: 1990, floor: 'Υπόγειο', taxYear: 2026 })!
  ok('υπόγειο → χαμηλότερο από το ουδέτερο', bsm.annual < neutral.annual)
  // Και το νεόδμητο ανεβάζει (1,25) — ο πραγματικός συντελεστής, όχι μαντεψιά.
  const brandNew = estimateENFIAFromFacts({ value: 180000, sqm: 90, yearBuilt: 2024, floor: 'Ισόγειο', taxYear: 2026 })!
  ok('νεόδμητο → υψηλότερο από το ουδέτερο', brandNew.annual > neutral.annual)

  // Άχρηστα στοιχεία δεν φουσκώνουν την εκτίμηση — γυρίζουν στο ουδέτερο.
  const junk = estimateENFIAFromFacts({ value: 180000, sqm: 90, yearBuilt: 0, floor: 'Δώμα / Ρετιρέ', taxYear: 2026 })!
  ok('άκυρα στοιχεία → ουδέτερη εκτίμηση', near(junk.annual, bare.annual, 0.01))
  ok('άκυρα στοιχεία δεν ανεβάζουν', junk.annual <= neutral.annual)
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

// ΑΔΥΝΑΤΗ ΠΑΛΑΙΟΤΗΤΑ → ΟΥΔΕΤΕΡΟ, ΟΧΙ ΑΚΡΙΒΟΤΕΡΟ.
// Το -3 περνούσε το `y <= 4` και έπαιρνε το κλιμάκιο «Έως 4 έτη», δηλαδή τον
// ΥΨΗΛΟΤΕΡΟ συντελεστή (1,25): ακίνητο με μελλοντικό έτος κατασκευής χρεωνόταν
// σαν ολοκαίνουργιο. Η αρχή είναι μία — άγνωστο ή αδύνατο σημαίνει 1,00.
ok('αρνητικά έτη → ουδέτερο, όχι νεόδμητο', enfiaAgeKeyFromYears(-3) === null)
ok('μηδέν έτη → νεόδμητο (κανονική περίπτωση)', enfiaAgeKeyFromYears(0) === 'y0_4')

// ═══ ΤΟ ΠΕΡΣΙΝΟ ΠΟΣΟ ═══════════════════════════════════════════════════════
// Ο ΕΝΦΙΑ ενός ακινήτου δεν αλλάζει από χρονιά σε χρονιά παρά μόνο αν αλλάξει
// το ακίνητο ή ο νόμος. Άρα το περσινό εκκαθαριστικό είναι ασύγκριτα
// ακριβέστερο από κάθε μοντελοποίηση και προηγείται της εκτίμησης.
{
  ok('περσινό ετήσιο, όπως δόθηκε', enfiaLastYearAnnual({ annual: '480' }) === 480)
  ok('περσινό από δόσεις', enfiaLastYearAnnual({ instalment: '40', instalments: '12' }) === 480)
  ok('το ετήσιο νικά τις δόσεις', enfiaLastYearAnnual({ annual: '500', instalment: '40', instalments: '12' }) === 500)
  ok('δόση χωρίς πλήθος δεν αρκεί', enfiaLastYearAnnual({ instalment: '40' }) === 0)
  ok('πλήθος χωρίς δόση δεν αρκεί', enfiaLastYearAnnual({ instalments: '12' }) === 0)
  ok('δεκαδικό κόμμα στη δόση', enfiaLastYearAnnual({ instalment: '40,50', instalments: '10' }) === 405)
  ok('κενό δίνει μηδέν', enfiaLastYearAnnual({}) === 0)

  const est = estimateENFIA({ sqm: 100, zone: '1501_2500', floor: 'second', age: 'y10_14' })!
  ok('το περσινό νικά την εκτίμηση', enfiaInUse('', '', est.annual, 480).source === 'lastYear')
  ok('το περσινό δίνει το ποσό του', enfiaInUse('', '', est.annual, 480).annual === 480)
  ok('το φετινό νικά το περσινό', enfiaInUse('520', '', est.annual, 480).source === 'declared')
  ok('χωρίς περσινό, ισχύει η εκτίμηση', enfiaInUse('', '', est.annual, 0).source === 'estimate')
  ok('περσινό μηδέν δεν μετρά', enfiaInUse('', '', est.annual, 0).annual === est.annual)
  ok('μόνο περσινό, χωρίς εκτίμηση', enfiaInUse('', '', null, 480).source === 'lastYear')
  ok('μηνιαία αναγωγή περσινού', enfiaInUse('', '', null, 480).monthly === 40)
}

// ── ΤΟ ΜΕΡΙΔΙΟ ΤΟΥ ΣΥΝΙΔΙΟΚΤΗΤΗ ΠΕΡΝΑ ΑΠΟ ΤΑ ΚΛΙΜΑΚΙΑ ────────────────────
// Ο καλών διαιρούσε το ετήσιο ποσό στο τέλος. Η διαίρεση είναι γραμμική· ο
// ΕΝΦΙΑ δεν είναι: πρόσθετος φόρος στις 400.000 €, προσαύξηση στις 500.000 €,
// κλιμακωτή μείωση καθώς ανεβαίνει η περιουσία. Ο συνιδιοκτήτης χρεωνόταν
// κλάσμα φόρων που δεν οφείλει καθόλου.
{
  const whole = estimateENFIAFromFacts({ value: 900000, sqm: 200, propType: 'apartment' })!
  const third = estimateENFIAFromFacts({ value: 900000, sqm: 200, propType: 'apartment', ownershipPct: 33.3333 })!
  ok('ολόκληρο: υπάρχει πρόσθετος φόρος και προσαύξηση', whole.extra > 0 && whole.supplementary > 0)
  ok('στο ένα τρίτο δεν οφείλεται πρόσθετος φόρος', third.extra === 0)
  ok('ούτε προσαύξηση', third.supplementary === 0)
  ok('και το ποσό ΔΕΝ είναι το ένα τρίτο του ολόκληρου',
    Math.abs(third.annual - whole.annual / 3) > 900)
  ok('είναι πολύ χαμηλότερο', third.annual < whole.annual / 2)
  // ΧΩΡΙΣ ΠΟΣΟΣΤΟ ΤΙΠΟΤΑ ΔΕΝ ΑΛΛΑΖΕΙ: 100% είναι η προεπιλογή.
  ok('χωρίς ποσοστό, ίδιο με 100%',
    estimateENFIAFromFacts({ value: 180000, sqm: 90, ownershipPct: 100 })!.annual
    === estimateENFIAFromFacts({ value: 180000, sqm: 90 })!.annual)
  // ΟΥΤΕ ΚΑΤΩ ΑΠΟ ΤΑ ΚΑΤΩΦΛΙΑ ΕΙΝΑΙ ΓΡΑΜΜΙΚΟ, ΚΑΙ ΕΙΝΑΙ ΣΩΣΤΟ. Ο κύριος
  // φόρος όντως μισός (333,00 → 166,50), αλλά η αυτόματη μείωση ανά συνολική
  // περιουσία ανεβαίνει από 20% σε 30% όταν η περιουσία πέφτει στο μισό. Ο
  // συνιδιοκτήτης πληρώνει ΛΙΓΟΤΕΡΑ από το μισό και αυτό λέει ο νόμος.
  const small = estimateENFIAFromFacts({ value: 180000, sqm: 90 })!
  const half = estimateENFIAFromFacts({ value: 180000, sqm: 90, ownershipPct: 50 })!
  ok('ο κύριος φόρος είναι ακριβώς ο μισός', Math.abs(half.basic - small.basic / 2) < 0.02)
  ok('η μείωση περιουσίας μεγαλώνει', half.reductionPct > small.reductionPct)
  ok('άρα το ετήσιο είναι λιγότερο από το μισό', half.annual < small.annual / 2)
}

console.log(`enfia.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) { process.exit(1) }
console.log('όλα πέρασαν')
