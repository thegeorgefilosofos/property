// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΚΟΣΤΟΣ ΡΕΥΜΑΤΟΣ, ΜΕ ΝΟΥΜΕΡΑ ΑΠΟ ΠΡΑΓΜΑΤΙΚΗ ΕΤΙΚΕΤΑ
// ─────────────────────────────────────────────────────────────────────────
// Τα σενάρια των κύκλων χρησιμοποιούν το πλυντήριο Amica DWA10C14ALiSR9, όπως
// το δηλώνει ο κατασκευαστής στο μητρώο EPREL: 35 kWh ανά 100 κύκλους. Δεν
// είναι επινοημένο παράδειγμα — είναι η ίδια συσκευή που θα διαβάζει η
// αυτόματη συμπλήρωση, οπότε ο υπολογισμός δοκιμάζεται στα δεδομένα που θα
// δεχτεί στην πράξη.
//
// ΤΟ ΠΙΟ ΣΗΜΑΝΤΙΚΟ ΠΟΥ ΚΛΕΙΔΩΝΕΤΑΙ ΕΔΩ: πότε ΔΕΝ βγαίνει νούμερο. Ένα κόστος
// ρεύματος που δεν βγήκε από τη συσκευή του χρήστη είναι χειρότερο από κανένα.
// ═══════════════════════════════════════════════════════════════════════════
import {
  annualKwh, monthlyKwh, monthlyEnergyCost, suggestedEnergyMode,
  ENERGY_MODE_LABEL, type EnergyInput,
} from './energy'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const eq = (a: number | null, b: number, tol = 0.02) => a != null && Math.abs(a - b) <= tol

// ── ΚΥΚΛΟΙ: ΤΟ ΠΛΥΝΤΗΡΙΟ ΤΗΣ ΕΤΙΚΕΤΑΣ ─────────────────────────────────────
// 35 kWh ανά 100 κύκλους ⇒ 0,35 kWh ο κύκλος.
// Με 20 πλυσίματα τον μήνα: 0,35 × 20 = 7 kWh τον μήνα, 84 τον χρόνο.
{
  const washer: EnergyInput = { energy_mode: 'cycles', kwh_per_100_cycles: 35, cycles_per_month: 20 }
  ok('ετήσια 84 kWh', eq(annualKwh(washer), 84))
  ok('μηνιαία 7 kWh', eq(monthlyKwh(washer), 7))
  // Τιμή ρεύματος 0,18 €/kWh ⇒ 7 × 0,18 = 1,26 € τον μήνα.
  ok('κόστος 1,26 € τον μήνα στα 0,18 €/kWh', eq(monthlyEnergyCost(washer, 0.18), 1.26))

  // ΤΟ ΛΑΘΟΣ ΠΟΥ ΔΙΟΡΘΩΝΕΤΑΙ, ΣΕ ΝΟΥΜΕΡΑ. Ο παλιός τρόπος ζητούσε Watt και
  // ώρες. Ένα πλυντήριο τραβά περίπου 2.000 W· αν ο χρήστης έγραφε «2 ώρες την
  // ημέρα» (μια εύλογη παρανόηση για κάτι που πλένει δύο ώρες), ο παλιός
  // υπολογισμός έβγαζε 120 kWh τον ΜΗΝΑ έναντι 7 των πραγματικών: δεκαεπτά
  // φορές πάνω.
  const oldWay: EnergyInput = { energy_mode: 'hours', power_watts: 2000, daily_hours_use: 2 }
  ok('ο ωριαίος τρόπος σε πλυντήριο δίνει δεκαεπταπλάσιο νούμερο',
     (monthlyKwh(oldWay) ?? 0) > (monthlyKwh(washer) ?? 0) * 15)
}

// ── ΕΤΗΣΙΑ: ΤΟ ΨΥΓΕΙΟ ─────────────────────────────────────────────────────
// Η ετικέτα ψυγείου δηλώνει απευθείας kWh τον χρόνο.
{
  const fridge: EnergyInput = { energy_mode: 'annual', annual_kwh: 180 }
  ok('ετήσια 180 kWh, όπως δηλώθηκαν', eq(annualKwh(fridge), 180))
  ok('μηνιαία 15 kWh', eq(monthlyKwh(fridge), 15))
  ok('κόστος 2,70 € τον μήνα', eq(monthlyEnergyCost(fridge, 0.18), 2.7))
  // Τα Watt και οι ώρες αγνοούνται εντελώς σε αυτόν τον τρόπο.
  ok('τα άσχετα πεδία δεν επηρεάζουν',
     eq(annualKwh({ ...fridge, power_watts: 900, daily_hours_use: 24 }), 180))
}

// ── ΩΡΕΣ: ΤΟ ΚΛΙΜΑΤΙΣΤΙΚΟ ─────────────────────────────────────────────────
// 900 W × 5 ώρες = 4,5 kWh την ημέρα · × 365 = 1.642,5 τον χρόνο.
{
  const ac: EnergyInput = { energy_mode: 'hours', power_watts: 900, daily_hours_use: 5 }
  ok('ετήσια 1.642,50 kWh', eq(annualKwh(ac), 1642.5))
  ok('μηνιαία 136,88 kWh', eq(monthlyKwh(ac), 136.88))
  // Πάνω από 24 ώρες την ημέρα δεν υπάρχουν.
  ok('οι ώρες κόβονται στις 24',
     eq(annualKwh({ ...ac, daily_hours_use: 40 }), (900 / 1000) * 24 * 365))
}

// ── ΠΟΤΕ ΔΕΝ ΒΓΑΙΝΕΙ ΝΟΥΜΕΡΟ, ΚΑΙ ΓΙΑΤΙ ΕΙΝΑΙ ΤΟ ΣΗΜΑΝΤΙΚΟΤΕΡΟ ───────────
// Ένα κόστος που δεν βγήκε από τη συσκευή ΤΟΥ χρήστη είναι διακόσμηση. Το
// `null` λέει «δεν το ξέρουμε»· το μηδέν θα έλεγε «δεν καταναλώνει».
{
  ok('χωρίς τρόπο, τίποτα', annualKwh({}) === null)
  ok('κύκλοι χωρίς kWh, τίποτα', annualKwh({ energy_mode: 'cycles', cycles_per_month: 20 }) === null)
  ok('κύκλοι χωρίς πλήθος, τίποτα', annualKwh({ energy_mode: 'cycles', kwh_per_100_cycles: 35 }) === null)
  ok('ετήσια χωρίς τιμή, τίποτα', annualKwh({ energy_mode: 'annual' }) === null)
  ok('ώρες χωρίς Watt, τίποτα', annualKwh({ energy_mode: 'hours', daily_hours_use: 5 }) === null)
  ok('ώρες χωρίς ώρες, τίποτα', annualKwh({ energy_mode: 'hours', power_watts: 900 }) === null)
  ok('μηδενικά διαβάζονται ως κενά', annualKwh({ energy_mode: 'cycles', kwh_per_100_cycles: 0, cycles_per_month: 20 }) === null)
  ok('αρνητικά διαβάζονται ως κενά', annualKwh({ energy_mode: 'annual', annual_kwh: -50 }) === null)
  ok('χωρίς τιμή ρεύματος δεν υπάρχει κόστος',
     monthlyEnergyCost({ energy_mode: 'annual', annual_kwh: 180 }, 0) === null)
  ok('χωρίς κατανάλωση δεν υπάρχει κόστος', monthlyEnergyCost({}, 0.18) === null)
}

// ── Η ΠΡΟΤΑΣΗ ΤΡΟΠΟΥ ΑΝΑ ΚΑΤΗΓΟΡΙΑ ────────────────────────────────────────
// Πρόταση, όχι απόφαση: αποθηκεύεται και αλλάζει από τον χρήστη.
{
  ok('ηλεκτρικές συσκευές ⇒ κύκλοι', suggestedEnergyMode('Ηλεκτρικές Συσκευές') === 'cycles')
  ok('θέρμανση και ψύξη ⇒ ώρες', suggestedEnergyMode('Θέρμανση & Ψύξη') === 'hours')
  ok('φωτιστικά ⇒ ώρες', suggestedEnergyMode('Φωτιστικά') === 'hours')
  // Τα έπιπλα δεν καταναλώνουν ρεύμα: η οθόνη δεν ρωτά καν.
  ok('έπιπλα ⇒ κανένας τρόπος', suggestedEnergyMode('Έπιπλα') === null)
  ok('χωρίς κατηγορία ⇒ κανένας τρόπος', suggestedEnergyMode(null) === null)
  ok('κάθε τρόπος έχει ετικέτα στα ελληνικά',
     (['cycles', 'annual', 'hours'] as const).every(m => ENERGY_MODE_LABEL[m].length > 10))
}

console.log(`property/energy.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
