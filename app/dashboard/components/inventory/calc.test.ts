// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΚΡΙΣΕΙΣ ΤΗΣ ΑΠΟΓΡΑΦΗΣ: ΕΓΓΥΗΣΗ, ΠΡΟΣΟΧΗ, ΗΛΙΚΙΑ, ΚΑΤΑΝΑΛΩΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΤΩΡΑ. Ζούσαν μέσα σε ένα αρχείο 2.497 γραμμών γεμάτο εισαγωγές του
// περιηγητή, οπότε δεν δοκιμάζονταν χωρίς να φορτωθεί ολόκληρη η οθόνη. Τώρα
// είναι καθαρές συναρτήσεις σε δικό τους αρχείο.
//
// ΤΙ ΔΙΑΚΥΒΕΥΕΤΑΙ. Από αυτές τις τέσσερις κρίσεις εξαρτάται ΠΟΙΑ αντικείμενα
// εμφανίζονται στο «Χρειάζονται προσοχή» — δηλαδή τι θα δει ο ιδιοκτήτης και τι
// θα προσπεράσει. Μια εγγύηση που λήγει σήμερα και εμφανίζεται ως «λήγει αύριο»
// είναι ακριβώς μία μέρα αργά.
// ═══════════════════════════════════════════════════════════════════════════
import { athensToday } from '@/lib/core/time'
import { addMonths as addCalendarMonths } from '@/lib/loans/progress'
import {
  warrantyStatus, needsAction, daysUntil, addMonths, calcAgeDisplay,
  calcMonthlyKwh, calcMonthlyCost, hasEnergy, blankIfZero, fmtDate,
} from './calc'
import type { InventoryItem } from './model'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

/** Ένα αντικείμενο με ό,τι χρειάζονται οι κρίσεις και τίποτα άλλο. */
const item = (o: Partial<InventoryItem> = {}): InventoryItem => ({
  id: 'x', property_id: 'p', user_id: 'u', name: 'Πλυντήριο', category: 'Ηλεκτρικές Συσκευές',
  room: '', brand: '', model: '', serial_number: '', purchase_value: 500, current_value: 0,
  purchase_date: '', warranty_expiry: '', condition: 'Καλή', notes: '', photo_url: '', photos: [],
  energy_class: '', power_watts: 0, daily_hours_use: 0,
  energy_mode: null, kwh_per_100_cycles: 0, cycles_per_month: 0, annual_kwh: 0,
  replacement_cost: 0, created_at: '', updated_at: '',
  ...o,
})

/** Μια ημερομηνία N ημέρες από σήμερα, σε ώρα Αθήνας. */
const inDays = (n: number) => {
  const [y, m, d] = athensToday().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// ── Η ΕΓΓΥΗΣΗ ─────────────────────────────────────────────────────────────
// Τα τρία κατώφλια (σήμερα, 30, 90) κρίνουν τι μπαίνει στη λίστα προσοχής.
{
  ok('χωρίς ημερομηνία, «Χωρίς εγγύηση»', warrantyStatus('').label === 'Χωρίς εγγύηση')
  ok('περασμένη, «Έληξε»', warrantyStatus(inDays(-1)).label === 'Έληξε')
  // ΤΟ ΣΗΜΕΡΑ ΔΕΝ ΕΙΝΑΙ ΑΥΡΙΟ. Ο παλιός υπολογισμός σύγκρινε μεσάνυχτα UTC με
  // πραγματική ώρα: στην Ελλάδα, από τα μεσάνυχτα ως τις 03:00, μια εγγύηση
  // που λήγει σήμερα εμφανιζόταν ως «λήγει σε 1 ημέρα».
  ok('σήμερα, μηδέν μέρες', warrantyStatus(athensToday()).label === '0 μέρες')
  ok('σε 30 μέρες, μέσα στο πρώτο κατώφλι', warrantyStatus(inDays(30)).label === '30 μέρες')
  ok('σε 31 μέρες, δεύτερο κατώφλι', warrantyStatus(inDays(31)).label === '31 μέρες')
  ok('σε 91 μέρες, δείχνει ημερομηνία', warrantyStatus(inDays(91)).label.startsWith('έως '))

  ok('κενή ημερομηνία σημαίνει «ποτέ», δηλαδή άπειρο', daysUntil('') === Infinity)
  ok('σήμερα, μηδέν', daysUntil(athensToday()) === 0)
}

// ── ΤΙ ΧΡΕΙΑΖΕΤΑΙ ΠΡΟΣΟΧΗ ─────────────────────────────────────────────────
// Τέσσερις λόγοι και ο καθένας αρκεί.
{
  ok('καλή κατάσταση, χωρίς εγγύηση, ήσυχο', needsAction(item()) === false)
  ok('κακή κατάσταση', needsAction(item({ condition: 'Κακή' })) === true)
  ok('εκτός λειτουργίας', needsAction(item({ condition: 'Εκτός Λειτουργίας' })) === true)
  ok('εγγύηση που λήγει σε 90 μέρες', needsAction(item({ warranty_expiry: inDays(90) })) === true)
  ok('εγγύηση που λήγει σε 91, όχι ακόμη', needsAction(item({ warranty_expiry: inDays(91) })) === false)
  // Η ΛΗΓΜΕΝΗ ΕΓΓΥΗΣΗ ΔΕΝ ΕΙΝΑΙ ΕΝΕΡΓΕΙΑ. Δεν υπάρχει τίποτα να κάνει κανείς
  // γι' αυτήν· η λίστα προσοχής δείχνει ό,τι ΠΡΟΛΑΒΑΙΝΕΙ.
  ok('εγγύηση που έληξε χθες δεν είναι ενέργεια', needsAction(item({ warranty_expiry: inDays(-1) })) === false)
  // Πλήρως αποσβεσμένο: αγορά πριν από είκοσι χρόνια.
  ok('πλήρως αποσβεσμένο', needsAction(item({ purchase_date: '2005-01-01' })) === true)
}

// ── Η ΗΛΙΚΙΑ ──────────────────────────────────────────────────────────────
{
  ok('χωρίς ημερομηνία αγοράς, τίποτα', calcAgeDisplay('') === '')
  ok('σημερινή αγορά, μηδέν μήνες', calcAgeDisplay(athensToday()) === '0 μήνες')
  ok('πέρσι, γράφει χρόνια', /χρόν/.test(calcAgeDisplay(inDays(-400))))
}

// ── Η ΕΠΟΜΕΝΗ ΣΥΝΤΗΡΗΣΗ ───────────────────────────────────────────────────
// Ίδια πρόσθεση μηνών με όλη την εφαρμογή, με το κλείδωμα στην τελευταία ημέρα.
{
  ok('τρεις μήνες μετά', addMonths('2026-03-20', 3) === '2026-06-20')
  ok('31 Ιανουαρίου συν έναν μήνα δεν υπερχειλίζει', addMonths('2026-01-31', 1) === '2026-02-28')
  ok('κενή ημερομηνία ξεκινά από σήμερα', addMonths('', 1) === addCalendarMonths(athensToday(), 1))
}

// ── Η ΚΑΤΑΝΑΛΩΣΗ: ΜΗΔΕΝ ΓΙΑ ΤΗΝ ΟΘΟΝΗ, ΑΓΝΩΣΤΟ ΓΙΑ ΤΗΝ ΑΛΗΘΕΙΑ ────────────
// Η οθόνη χρειάζεται αριθμό για να μορφοποιήσει· η απόφαση «να δείξω ή όχι»
// παίρνεται από το `hasEnergy`, ΟΧΙ από το μηδέν. Αν τα δύο συγχέονταν, μια
// συσκευή χωρίς στοιχεία θα εμφανιζόταν ως συσκευή που δεν καταναλώνει.
{
  const washer = item({ energy_mode: 'cycles', kwh_per_100_cycles: 35, cycles_per_month: 20 })
  ok('πλυντήριο: 7 kWh τον μήνα', Math.abs(calcMonthlyKwh(washer) - 7) < 0.01)
  ok('…και 1,26 € στα 0,18 €/kWh', Math.abs(calcMonthlyCost(washer, 0.18) - 1.26) < 0.01)
  ok('…και ξέρουμε την κατανάλωσή του', hasEnergy(washer) === true)

  const unknown = item({ energy_mode: 'cycles', kwh_per_100_cycles: 35 })
  ok('χωρίς πλήθος κύκλων, δεν ξέρουμε', hasEnergy(unknown) === false)
  ok('…και η οθόνη παίρνει μηδέν για να μορφοποιήσει', calcMonthlyKwh(unknown) === 0)
  ok('χωρίς τιμή ρεύματος, κανένα κόστος', calcMonthlyCost(washer, 0) === 0)
}

// ── ΤΟ ΚΕΝΟ ΠΕΔΙΟ ─────────────────────────────────────────────────────────
{
  ok('το μηδέν γράφεται ως κενό', blankIfZero(0) === '')
  ok('το κενό μένει κενό', blankIfZero(null) === '' && blankIfZero(undefined) === '')
  ok('ο αριθμός γράφεται', blankIfZero(35) === '35')
  ok('κενή ημερομηνία δείχνει την ένδειξη απουσίας', fmtDate('').length > 0)
}

console.log(`inventory/calc.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
