// npx tsx lib/market/shortTerm.test.ts
//
// ΓΙΑΤΙ ΓΡΑΦΤΗΚΕ. Το lib/market/shortTerm.ts απαντά στη μοναδική ερώτηση που
// κρίνει αν ένας ιδιοκτήτης θα βγάλει τον ενοικιαστή του και θα βάλει το
// ακίνητο σε Airbnb: «σε πόση πληρότητα βγάζω όσα βγάζω τώρα;». Ενενήντα επτά
// γραμμές, ΧΩΡΙΣ έναν έλεγχο.
import {
  shortTermEstimate, adrReference, breakEvenOccupancy, MAX_ST_GROSS_YIELD_WARN,
} from './shortTerm'

let pass = 0, fail = 0
function ok(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error('✗ ' + name) } }
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++; else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`) }
}
const near = (name: string, a: number, b: number, tol = 0.01) =>
  ok(`${name} (${a} ≈ ${b})`, Math.abs(a - b) <= tol)

const BASE = {
  adr: 80, platformFeePct: 15, cleaningPerStay: 40, avgNightsPerStay: 4,
  sqm: 60, isHouse: false, highSeasonShare: 0.6, propertyCount: 1, individual: true,
}

// ═══ ΝΥΧΤΕΣ ════════════════════════════════════════════════════════════════
eq('50% πληρότητα → 183 νύχτες', shortTermEstimate({ ...BASE, occupancyPct: 50 }).nights, 183)
eq('0% → μηδέν νύχτες', shortTermEstimate({ ...BASE, occupancyPct: 0 }).nights, 0)
eq('100% → 365', shortTermEstimate({ ...BASE, occupancyPct: 100 }).nights, 365)
eq('πάνω από 100 κουμπώνει στο 100', shortTermEstimate({ ...BASE, occupancyPct: 250 }).nights, 365)
eq('αρνητική πληρότητα κουμπώνει στο μηδέν', shortTermEstimate({ ...BASE, occupancyPct: -20 }).nights, 0)

// ═══ ΤΑ ΕΞΟΔΑ ΑΦΑΙΡΟΥΝΤΑΙ ΟΛΑ, ΚΑΙ ΜΙΑ ΦΟΡΑ ═══════════════════════════════
{
  const r = shortTermEstimate({ ...BASE, occupancyPct: 50 })
  near('μεικτά = νύχτες × τιμή', r.grossRevenue, 183 * 80)
  near('προμήθεια 15%', r.platformFees, 183 * 80 * 0.15)
  near('καθαρισμός = διαμονές × κόστος', r.cleaning, (183 / 4) * 40)
  eq('το καθαρό είναι μεικτά μείον ΟΛΑ τα έξοδα',
    Math.round((r.grossRevenue - r.platformFees - r.cleaning - r.climateLevy - r.municipalTax) * 100) / 100,
    r.netRevenue)
  ok('το ΤΑΚΚ δεν είναι μηδέν', r.climateLevy > 0)
  near('καθαρό ανά νύχτα', r.netPerNight, Math.round((r.netRevenue / 183) * 100) / 100)
}

// ═══ ΜΗΔΕΝ ΝΥΧΤΕΣ: ΚΑΜΙΑ ΔΙΑΙΡΕΣΗ ΜΕ ΤΟ ΜΗΔΕΝ ═════════════════════════════
{
  const z = shortTermEstimate({ ...BASE, occupancyPct: 0 })
  eq('μηδέν έσοδα', z.grossRevenue, 0)
  eq('μηδέν καθαρό ανά νύχτα, όχι NaN', z.netPerNight, 0)
  ok('κανένα NaN πουθενά', Object.values(z).every(v => Number.isFinite(v)))
}

// ═══ ΤΟ ΔΗΜΟΤΙΚΟ ΤΕΛΟΣ ΕΞΑΡΤΑΤΑΙ ΑΠΟ ΤΗΝ ΙΔΙΟΤΗΤΑ ════════════════════════
{
  const small = shortTermEstimate({ ...BASE, occupancyPct: 60, propertyCount: 1, individual: true })
  const pro = shortTermEstimate({ ...BASE, occupancyPct: 60, propertyCount: 5, individual: false })
  eq('φυσικό πρόσωπο με ένα ακίνητο: μηδέν τέλος παρεπιδημούντων', small.municipalTax, 0)
  ok('νομικό πρόσωπο με πέντε: πληρώνει', pro.municipalTax > 0)
  ok('και άρα βγάζει λιγότερα καθαρά', pro.netRevenue < small.netRevenue)
}

// ═══ ΜΕΣΗ ΤΙΜΗ ΑΝΑ ΝΥΧΤΑ ═══════════════════════════════════════════════════
eq('στα 55 τ.μ. δίνει ακριβώς το ADR αναφοράς', adrReference(100, 55, 'apartment'), 100)
ok('μεγαλύτερο ακίνητο, υψηλότερη τιμή', adrReference(100, 110, 'apartment') > 100)
ok('αλλά ΟΧΙ ανάλογη — υπογραμμική κλιμάκωση', adrReference(100, 110, 'apartment') < 200)
ok('βίλα ακριβότερη από στούντιο', adrReference(100, 55, 'villa') > adrReference(100, 55, 'studio'))
eq('μηδενικό ADR αναφοράς → μηδέν', adrReference(0, 60, 'apartment'), 0)
eq('άγνωστος τύπος → σαν διαμέρισμα', adrReference(100, 55, 'σπηλιά'), adrReference(100, 55, 'apartment'))
ok('χωρίς τετραγωνικά χρησιμοποιεί το μέγεθος αναφοράς', adrReference(100, null, 'apartment') === 100)
{
  // Το κούμπωμα προστατεύει από παράλογα μεγέθη.
  const tiny = adrReference(100, 1, 'apartment'), huge = adrReference(100, 5000, 'apartment')
  ok('πολύ μικρό δεν πέφτει κάτω από το μισό', tiny >= 50)
  ok('πολύ μεγάλο δεν ξεπερνά το 2,2πλάσιο', huge <= 220)
}

// ═══ ΝΕΚΡΟ ΣΗΜΕΙΟ ══════════════════════════════════════════════════════════
{
  // Ό,τι βγάζει η βραχυχρόνια στο νεκρό σημείο πρέπει να ισούται με τον στόχο.
  const target = 9000
  const be = breakEvenOccupancy(target, BASE)
  ok('το νεκρό σημείο είναι μέσα σε λογικά όρια', be > 0 && be < 100)
  const atBe = shortTermEstimate({ ...BASE, occupancyPct: be })
  ok('στο νεκρό σημείο τα καθαρά φτάνουν τον στόχο (±2%)',
    Math.abs(atBe.netRevenue - target) / target < 0.02)
}
{
  eq('μηδενικός στόχος → μηδέν πληρότητα', breakEvenOccupancy(0, BASE), 0)
  eq('μηδενική τιμή/νύχτα → ανέφικτο', breakEvenOccupancy(9000, { ...BASE, adr: 0 }), Infinity)
}
{
  // ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΤΟΝ ΕΛΕΓΧΟ: ένα ακίνητο με χαμηλή τιμή/νύχτα και
  // υψηλό μακροχρόνιο ενοίκιο ΔΕΝ ισοφαρίζει ποτέ — χρειάζεται 334% πληρότητα.
  // Η αναφορά όμως έγραφε `Math.min(100, be)`, δηλαδή «100%»: ο ιδιοκτήτης
  // διάβαζε ότι η βραχυχρόνια βγαίνει αν γεμίζει το ακίνητο κάθε βράδυ.
  const be = breakEvenOccupancy(24000, { ...BASE, adr: 40, cleaningPerStay: 30, platformFeePct: 18, sqm: 45 })
  ok('το ανέφικτο βγαίνει ΠΑΝΩ από 100, δεν κρύβεται', be > 100)
}

// ═══ ΤΟ ΚΑΤΩΦΛΙ ΠΡΟΕΙΔΟΠΟΙΗΣΗΣ ═════════════════════════════════════════════
ok('το κατώφλι είναι πάνω από τις ισχυρές τουριστικές αγορές', MAX_ST_GROSS_YIELD_WARN > 15)

// ═══ ΜΟΝΟΤΟΝΙΑ: ΠΕΡΙΣΣΟΤΕΡΗ ΠΛΗΡΟΤΗΤΑ, ΠΕΡΙΣΣΟΤΕΡΑ ΚΑΘΑΡΑ ════════════════
{
  let broke = ''
  let prev = -Infinity
  for (let o = 0; o <= 100; o += 5) {
    const n = shortTermEstimate({ ...BASE, occupancyPct: o }).netRevenue
    if (n < prev) broke = `στο ${o}%`
    prev = n
  }
  eq('τα καθαρά δεν πέφτουν ποτέ όσο ανεβαίνει η πληρότητα', broke, '')
}

console.log(fail === 0 ? `✓ shortTerm: ${pass} έλεγχοι πέρασαν` : `✗ shortTerm: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
