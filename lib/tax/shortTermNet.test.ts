// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΤΗΛΗ ΤΩΝ ΑΦΑΙΡΕΣΕΩΝ ΠΡΕΠΕΙ ΝΑ ΒΓΑΖΕΙ ΤΟ ΣΥΝΟΛΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΦΥΛΑΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ, ΟΠΩΣ ΕΦΤΑΣΕ ΣΤΗΝ ΟΘΟΝΗ:
//
//   ΔΗΛΩΤΕΑ ΑΚΑΘΑΡΙΣΤΑ  5.600,00 €
//   ΤΕΛΟΣ ΑΝΘΕΚΤΙΚΟΤΗΤΑΣ  − 256,00 €
//   ΠΡΟΜΗΘΕΙΕΣ            − 600,00 €
//   ΕΚΤΙΜΩΜΕΝΟΣ ΦΟΡΟΣ     − 798,00 €
//   ΜΕΝΕΙ ΚΑΘΑΡΑ         4.010,00 €     ← η πρόσθεση δίνει 3.946,00 €
//
// Το πλακίδιο του τέλους έδειχνε το ΟΦΕΙΛΟΜΕΝΟ, ενώ αφαιρείται μόνο το
// ΑΚΑΛΥΠΤΟ· και το τέλος παρεπιδημούντων δεν είχε πλακίδιο καθόλου. Κανένας
// τύπος δεν πιάνει «η στήλη δεν βγάζει το σύνολο» — μόνο ένας έλεγχος που
// προσθέτει ό,τι ΦΑΙΝΕΤΑΙ και το συγκρίνει με ό,τι ΤΥΠΩΝΕΤΑΙ.
// ═══════════════════════════════════════════════════════════════════════════
import { shortTermYearSummary, shortTermNetLines, shortTermNet, type TaxStay } from './shortTermTax'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; fails.push(name) } }
const near = (name: string, got: number, want: number) =>
  ok(`${name} (got ${got.toFixed(2)}, want ${want.toFixed(2)})`, Math.abs(got - want) < 0.02)

const stay = (o: Partial<TaxStay>): TaxStay => ({
  check_in: '2026-07-01', check_out: '2026-07-05', nights: 4,
  total: 500, gross_guest_paid: 500, climate_levy: 40, platform_fee: 75,
  amount_basis: 'gross', declared_at: null, ...o,
} as TaxStay)

const scenarios: { name: string; stays: TaxStay[]; year: number; meta: Parameters<typeof shortTermYearSummary>[2] }[] = [
  { name: 'το τέλος καλύφθηκε ολόκληρο', year: 2026, meta: { sqm: 60, isHouse: false },
    stays: [stay({})] },
  { name: 'ο οικοδεσπότης δεν χρέωσε καθόλου τέλος', year: 2026, meta: { sqm: 60, isHouse: false },
    stays: [stay({ climate_levy: 0 })] },
  { name: 'ιστορική γραμμή χωρίς ανάλυση ποσού', year: 2026, meta: { sqm: 60, isHouse: false },
    stays: [stay({ gross_guest_paid: null, climate_levy: null, platform_fee: null, amount_basis: null })] },
  { name: 'χωρίς καμία προμήθεια', year: 2026, meta: { sqm: 60, isHouse: false },
    stays: [stay({ platform_fee: 0 })] },
  // ΤΟ ΣΕΝΑΡΙΟ ΠΟΥ ΞΕΧΩΡΙΖΕΙ ΤΟ ΟΦΕΙΛΟΜΕΝΟ ΑΠΟ ΤΟ ΑΚΑΛΥΠΤΟ. Χωρίς αυτό η σουίτα
  // ήταν ΚΕΝΗ ακριβώς εκεί που έπρεπε να δαγκώνει: όταν το τέλος καλύπτεται
  // ολόκληρο δεν υπάρχει γραμμή, και όταν δεν καλύπτεται καθόλου το ακάλυπτο
  // ΙΣΟΥΤΑΙ με το οφειλόμενο — οπότε η επαναφορά του σφάλματος δεν φαινόταν.
  { name: 'μερική κάλυψη του τέλους από τους επισκέπτες', year: 2026, meta: { sqm: 60, isHouse: false },
    stays: [stay({ check_in: '2026-07-01', check_out: '2026-07-09', nights: 8, total: 800, gross_guest_paid: 800, climate_levy: 20 })] },
  { name: 'επιχειρηματίας με τέσσερα ακίνητα, άρα τέλος παρεπιδημούντων', year: 2026,
    meta: { sqm: 60, isHouse: false, propertyCount: 4, individual: true },
    stays: [stay({})] },
  { name: 'διαμονή που περνά την Πρωτοχρονιά, έτος άφιξης', year: 2025, meta: { sqm: 60, isHouse: false },
    stays: [stay({ check_in: '2025-12-28', check_out: '2026-01-05', nights: 8, total: 800, gross_guest_paid: 800, climate_levy: 16, platform_fee: 120 })] },
  { name: 'διαμονή που περνά την Πρωτοχρονιά, επόμενο έτος', year: 2026, meta: { sqm: 60, isHouse: false },
    stays: [stay({ check_in: '2025-12-28', check_out: '2026-01-05', nights: 8, total: 800, gross_guest_paid: 800, climate_levy: 16, platform_fee: 120 })] },
]

for (const sc of scenarios) {
  const summary = shortTermYearSummary(sc.stays, sc.year, sc.meta)
  const lines = shortTermNetLines(summary)
  const printed = shortTermNet(lines)

  // 1. Ο,ΤΙ ΦΑΙΝΕΤΑΙ ΒΓΑΖΕΙ Ο,ΤΙ ΤΥΠΩΝΕΤΑΙ. Αυτό ακριβώς δεν ίσχυε.
  const added = lines.reduce((s, l) => s + (l.out ? -l.amount : l.amount), 0)
  near(`${sc.name}: η πρόσθεση των γραμμών δίνει το τυπωμένο σύνολο`, added, printed)

  // 2. ΚΑΙ ΣΥΜΦΩΝΕΙ ΜΕ ΤΗΝ ΑΥΘΕΝΤΙΑ ΤΗΣ ΦΟΡΟΛΟΓΙΚΗΣ ΣΥΝΟΨΗΣ.
  near(`${sc.name}: το σύνολο συμφωνεί με τη σύνοψη`, printed, summary.net - summary.platformFees)

  // 3. ΚΑΜΙΑ ΕΚΡΟΗ ΔΕΝ ΜΕΤΡΑΕΙ ΧΩΡΙΣ ΝΑ ΦΑΙΝΕΤΑΙ.
  const shown = new Set(lines.map(l => l.key))
  ok(`${sc.name}: το ακάλυπτο τέλος φαίνεται όταν υπάρχει`,
     summary.levyShortfall > 0 ? shown.has('levy') : !shown.has('levy'))
  ok(`${sc.name}: το τέλος παρεπιδημούντων φαίνεται όταν υπάρχει`,
     summary.municipalTax > 0 ? shown.has('municipal') : !shown.has('municipal'))
  ok(`${sc.name}: οι προμήθειες φαίνονται όταν υπάρχουν`,
     summary.platformFees > 0 ? shown.has('fees') : !shown.has('fees'))

  // 4. ΤΟ ΟΦΕΙΛΟΜΕΝΟ ΤΕΛΟΣ ΔΕΝ ΜΠΑΙΝΕΙ ΠΟΤΕ ΣΤΗ ΣΤΗΛΗ. Ηταν η ρίζα του σφάλματος.
  const levyLine = lines.find(l => l.key === 'levy')
  ok(`${sc.name}: στη στήλη μπαίνει το ακάλυπτο, όχι το οφειλόμενο`,
     !levyLine || Math.abs(levyLine.amount - summary.levyShortfall) < 0.005)
}

// ── Η ΣΟΥΙΤΑ ΔΕΝ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΓΙΝΕΙ ΚΕΝΗ ─────────────────────────────────
// Οι έλεγχοι πιο πάνω δαγκώνουν ΜΟΝΟ όταν υπάρχει σενάριο όπου το ακάλυπτο
// τέλος διαφέρει και από το μηδέν και από το οφειλόμενο. Αν κάποιος πειράξει τα
// δεδομένα και χαθεί αυτή η περίπτωση, η σουίτα θα περνούσε με το σφάλμα μέσα.
{
  const discriminating = scenarios.some(sc => {
    const y = shortTermYearSummary(sc.stays, sc.year, sc.meta)
    return y.levyShortfall > 0 && Math.abs(y.levyShortfall - y.levy) > 0.005
  })
  ok('υπάρχει σενάριο όπου το ακάλυπτο τέλος διαφέρει από το οφειλόμενο', discriminating)
}

console.log(`\nshortTermNet — ${passed} passed, ${failed} failed`)
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('✓ όλα πέρασαν')
