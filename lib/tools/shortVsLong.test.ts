// ═══════════════════════════════════════════════════════════════════════════
// ΒΡΑΧΥΧΡΟΝΙΑ Ή ΜΑΚΡΟΧΡΟΝΙΑ — ΣΕΝΑΡΙΑ ΥΠΟΛΟΓΙΣΜΕΝΑ ΣΤΟ ΧΕΡΙ
// ─────────────────────────────────────────────────────────────────────────
// Η σελίδα είναι δημόσια και χωρίς εγγραφή: ένα λάθος νούμερο εκεί δεν είναι
// σφάλμα οθόνης, είναι ο λόγος που ο επισκέπτης δεν θα εγγραφεί ποτέ. Και εδώ
// το διακύβευμα είναι μεγαλύτερο από τους άλλους δύο υπολογιστές, γιατί το
// αποτέλεσμα δεν είναι πληροφορία αλλά ΑΠΟΦΑΣΗ: κάποιος θα βγάλει ή θα βάλει
// ενοικιαστή με βάση αυτό.
//
// Τα ενδιάμεσα γράφονται δίπλα σε κάθε σενάριο. Τεστ που παίρνει το «σωστό»
// από την ίδια συνάρτηση που ελέγχει δεν ελέγχει τίποτα.
// ═══════════════════════════════════════════════════════════════════════════
import {
  compareShortVsLong, longTermSide, shortTermSide, breakEvenOccupancy,
  spreadNights, NIGHTS_PER_YEAR, type ShortVsLongInput,
} from './shortVsLong'
import { climateLevyRates, rentalIncomeTax } from '@/lib/billing/greekTax'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }
const eq = (a: number, b: number, tol = 0.02) => Math.abs(a - b) <= tol

const BASE: ShortVsLongInput = {
  monthlyRent: 700, nightlyPrice: 80, occupancyPct: 60,
  sqm: 75, isHouse: false, platformFeePct: 15,
  costPerNight: 12, fixedPerMonth: 90,
}

// ═══ 1. Η ΜΑΚΡΟΧΡΟΝΙΑ ΠΛΕΥΡΑ ══════════════════════════════════════════════
// 700 × 12 = 8.400 · φορολογητέο 7.980 · φόρος 7.980 × 15% = 1.197
// καθαρά 8.400 − 1.197 = 7.203
{
  const l = longTermSide(700)
  ok('Α. ακαθάριστο 8.400 €', eq(l.gross, 8400))
  ok('Α. τεκμαρτή έκπτωση 420 €', eq(l.deduction, 420))
  ok('Α. φόρος 1.197 €', eq(l.tax, 1197))
  ok('Α. καθαρά 7.203 €', eq(l.net, 7203))
  ok('Α. μηδενικό ενοίκιο δίνει μηδενικά, όχι NaN', longTermSide(0).net === 0)
}

// ═══ 2. Η ΒΡΑΧΥΧΡΟΝΙΑ ΠΛΕΥΡΑ, ΒΗΜΑ ΒΗΜΑ ═══════════════════════════════════
// Πληρότητα 60% ⇒ 219 νύχτες (365 × 0,60), ισομερώς 18,25 τον μήνα.
// Τέλος: 7 μήνες υψηλής (Απρ–Οκτ) και 5 χαμηλής.
{
  const s = shortTermSide(BASE)
  const r = climateLevyRates(BASE.sqm, BASE.isHouse)
  const nights = 0.6 * NIGHTS_PER_YEAR
  const levyByHand = (nights / 12) * (7 * r.high + 5 * r.low)

  ok('Β. 219 νύχτες', s.nights === 219)
  ok('Β. οι επισκέπτες πληρώνουν 17.520 €', eq(s.guestTotal, 219 * 80))
  ok('Β. το τέλος βγαίνει από επτά υψηλούς και πέντε χαμηλούς μήνες', eq(s.levy, levyByHand, 0.01))
  ok('Β. δηλωτέο ακαθάριστο = πληρωμές − τέλος', eq(s.gross, 219 * 80 - levyByHand, 0.02))
  ok('Β. η προμήθεια υπολογίζεται στο σύνολο της κράτησης', eq(s.platformFee, 219 * 80 * 0.15))
  ok('Β. λειτουργικά = 219 × 12 + 12 × 90', eq(s.running, 219 * 12 + 1080))
  ok('Β. φόρος πάνω στο 95% του δηλωτέου', eq(s.tax, rentalIncomeTax(s.gross * 0.95), 0.02))
  ok('Β. καθαρά = ακαθάριστο − φόρος − τέλος δήμου − προμήθεια − λειτουργικά',
     eq(s.net, s.gross - s.tax - s.municipalTax - s.platformFee - s.running))
}

// ═══ 3. ΤΟ ΛΑΘΟΣ ΠΟΥ ΥΠΑΡΧΕΙ Ο ΥΠΟΛΟΓΙΣΤΗΣ ΓΙΑ ΝΑ ΔΕΙΞΕΙ ══════════════════
// «80 € × 365 = 29.200» είναι το νούμερο που βγάζει ο κόσμος στο μυαλό του.
// Τα πραγματικά καθαρά είναι κλάσμα αυτού, ακόμη και με πλήρη πληρότητα.
{
  const full = shortTermSide(BASE, 100)
  ok('Γ. η αφελής πράξη δίνει 29.200 €', 365 * 80 === 29200)
  ok('Γ. τα πραγματικά καθαρά είναι πολύ μικρότερα', full.net < 29200 * 0.7)
  ok('Γ. …και θετικά σε αυτό το σενάριο', full.net > 0)
}

// ═══ 4. Η ΠΛΗΡΟΤΗΤΑ ΙΣΟΡΡΟΠΙΑΣ ════════════════════════════════════════════
{
  const c = compareShortVsLong(BASE)
  ok('Δ. υπάρχει κατώφλι', c.breakEvenPct !== null)
  const be = c.breakEvenPct!
  ok('Δ. το κατώφλι είναι μέσα στο 0 ώς 100', be > 0 && be <= 100)
  // Ο ορισμός του κατωφλίου, ελεγμένος και από τις δύο μεριές.
  ok('Δ. ακριβώς στο κατώφλι τα καθαρά ταυτίζονται', eq(shortTermSide(BASE, be).net, c.long.net, 1))
  ok('Δ. μια μονάδα κάτω, η βραχυχρόνια χάνει', shortTermSide(BASE, be - 1).net < c.long.net)
  ok('Δ. μια μονάδα πάνω, η βραχυχρόνια κερδίζει', shortTermSide(BASE, be + 1).net > c.long.net)

  // Απαγορευτικό ενοίκιο: ούτε με 100% πληρότητα δεν φτάνει. Το `null` είναι
  // απάντηση, όχι σφάλμα — και η οθόνη οφείλει να το λέει με λέξεις.
  const impossible = { ...BASE, monthlyRent: 9000 }
  ok('Δ. ασύγκριτα υψηλό ενοίκιο δίνει null, όχι 100', breakEvenOccupancy(impossible, longTermSide(9000).net) === null)

  // ΤΟ ΑΔΕΙΟ ΑΚΙΝΗΤΟ ΣΤΗ ΒΡΑΧΥΧΡΟΝΙΑ ΚΟΣΤΙΖΕΙ, ΚΑΙ ΤΟ ΤΕΣΤ ΤΟ ΕΠΙΑΣΕ.
  // Είχα γράψει ότι χωρίς μακροχρόνιο εισόδημα το κατώφλι είναι μηδέν. Δεν
  // είναι: τα πάγια (ρεύμα, νερό, ίντερνετ) τρέχουν και με μηδέν κρατήσεις,
  // οπότε στο μηδέν τα καθαρά είναι ΑΡΝΗΤΙΚΑ και χρειάζεται πληρότητα απλώς
  // για να τα καλύψει. Ακριβώς αυτό δεν σκέφτεται ο ιδιοκτήτης όταν αφήνει το
  // ακίνητο «ανοιχτό μήπως τύχει κράτηση».
  const noRent = { ...BASE, monthlyRent: 0 }
  ok('Δ. με μηδέν κρατήσεις τα πάγια τρέχουν, άρα τα καθαρά είναι αρνητικά',
     shortTermSide(noRent, 0).net === -12 * BASE.fixedPerMonth)
  ok('Δ. …οπότε χρειάζεται πληρότητα ακόμη και για να βγει στο μηδέν',
     (breakEvenOccupancy(noRent, 0) ?? 0) > 0)
  ok('Δ. χωρίς κανένα κόστος, το κατώφλι είναι πράγματι μηδέν',
     breakEvenOccupancy({ ...noRent, costPerNight: 0, fixedPerMonth: 0, platformFeePct: 0 }, 0) === 0)
}

// ═══ 5. ΑΜΕΤΑΒΛΗΤΑ: ΟΙ ΣΧΕΣΕΙΣ ΠΟΥ ΠΡΕΠΕΙ ΝΑ ΙΣΧΥΟΥΝ ΠΑΝΤΑ ════════════════
{
  let monotonic = true, feeHurts = true, levyHurts = true
  for (let occ = 0; occ <= 100; occ += 7) {
    const a = shortTermSide(BASE, occ), b = shortTermSide(BASE, Math.min(100, occ + 7))
    if (b.net < a.net - 0.01) monotonic = false
    if (shortTermSide({ ...BASE, platformFeePct: 25 }, occ).net > a.net + 0.01) feeHurts = false
    // Μονοκατοικία άνω των 80 τ.μ. πληρώνει μεγαλύτερο τέλος, άρα λιγότερα καθαρά.
    if (occ > 0 && shortTermSide({ ...BASE, sqm: 120, isHouse: true }, occ).net >= a.net) levyHurts = false
  }
  ok('Ε. περισσότερη πληρότητα ⇒ ποτέ λιγότερα καθαρά', monotonic)
  ok('Ε. μεγαλύτερη προμήθεια ⇒ ποτέ περισσότερα καθαρά', feeHurts)
  ok('Ε. μεγάλη μονοκατοικία πληρώνει μεγαλύτερο τέλος', levyHurts)

  ok('Ε. οι νύχτες μοιράζονται ισομερώς στους δώδεκα μήνες',
     spreadNights(120).length === 12 && spreadNights(120).every(n => eq(n, 10)))
  ok('Ε. το άθροισμα της κατανομής είναι οι ίδιες οι νύχτες',
     eq(spreadNights(219).reduce((a, b) => a + b, 0), 219))
}

// ═══ 6. ΑΚΡΑΙΕΣ ΕΙΣΟΔΟΙ: Η ΟΘΟΝΗ ΔΕΝ ΠΡΕΠΕΙ ΝΑ ΔΕΙΞΕΙ NaN ΟΥΤΕ ΑΡΝΗΤΙΚΑ ═══
{
  const zero = compareShortVsLong({ ...BASE, monthlyRent: 0, nightlyPrice: 0, occupancyPct: 0 })
  ok('ΣΤ. όλα μηδέν δίνει μηδενικά, όχι NaN',
     Number.isFinite(zero.short.net) && Number.isFinite(zero.long.net) && zero.long.net === 0)

  // Τιμή μικρότερη από το τέλος: το ακαθάριστο δεν επιτρέπεται να βγει αρνητικό.
  const tiny = shortTermSide({ ...BASE, nightlyPrice: 1 }, 100)
  ok('ΣΤ. τιμή κάτω από το τέλος δεν δίνει αρνητικό ακαθάριστο', tiny.gross >= 0)
  ok('ΣΤ. …ούτε τέλος μεγαλύτερο από όσα εισπράχθηκαν', tiny.levy <= tiny.guestTotal + 0.01)

  const over = shortTermSide(BASE, 500)
  ok('ΣΤ. πληρότητα πάνω από 100 κόβεται στο 100', over.nights === NIGHTS_PER_YEAR)
  const neg = shortTermSide({ ...BASE, costPerNight: -50 }, 50)
  ok('ΣΤ. αρνητικό κόστος διαβάζεται ως μηδέν', neg.running === 12 * 90)
}

// ═══ 7. ΤΟ ΤΕΛΟΣ ΠΑΡΕΠΙΔΗΜΟΥΝΤΩΝ ══════════════════════════════════════════
// Ο υπολογιστής δηλώνει ρητά ότι θεωρεί φυσικό πρόσωπο με έως δύο ακίνητα.
// Αν αυτό αλλάξει σιωπηλά, το τεστ πέφτει και το κείμενο της οθόνης διορθώνεται.
{
  ok('Ζ. για φυσικό πρόσωπο με έως δύο ακίνητα το τέλος είναι 0 €',
     shortTermSide(BASE).municipalTax === 0)
}

console.log(`tools/shortVsLong.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
