// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΑΡΗ ΑΠΟΔΟΣΗ ΑΚΙΝΗΤΟΥ — ΤΟ ΝΟΥΜΕΡΟ ΠΟΥ ΔΕΙΧΝΟΥΝ ΟΛΟΙ ΛΑΘΟΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΚΥΚΛΟΦΟΡΕΙ. «Απόδοση 6,5%»: ενοίκιο επί δώδεκα, διά την αξία. Αυτό είναι η
// ΜΕΙΚΤΗ απόδοση, δηλαδή τα χρήματα πριν περάσουν από τη ΔΟΥ, πριν πληρωθεί ο
// ΕΝΦΙΑ και πριν αλλάξει ο θερμοσίφωνας. Ο ιδιοκτήτης συγκρίνει αυτό το νούμερο
// με μια προθεσμιακή κατάθεση, όπου το 2% είναι 2% καθαρά και βγάζει λάθος
// συμπέρασμα σε απόφαση δεκαετίας.
//
// ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΤΟ ΜΙΚΡΑΙΝΟΥΝ, ΚΑΙ ΚΑΝΕΝΑ ΔΕΝ ΕΙΝΑΙ ΠΡΟΑΙΡΕΤΙΚΟ:
//   1. Ο ΦΟΡΟΣ, στο ΔΙΚΟ ΣΟΥ κλιμάκιο. Ο τρίτος όροφος δεν φορολογείται με 15%
//      επειδή βγάζει 8.400 €: φορολογείται με ό,τι συντελεστή αφήνουν τα άλλα
//      ακίνητα που ήδη δηλώνεις. Δύο ιδιοκτήτες με το ίδιο διαμέρισμα κρατούν
//      διαφορετικά ποσά και η διαφορά φτάνει τα τρία τέταρτα του φόρου.
//   2. Ο ΕΝΦΙΑ. Φόρος κατοχής, τον πληρώνεις και άδειο.
//   3. ΟΙ ΔΑΠΑΝΕΣ. Συντήρηση, ασφάλιση, κοινόχρηστα του ιδιοκτήτη.
//
// ΓΙΑΤΙ Ο ΦΟΡΟΣ ΥΠΟΛΟΓΙΖΕΤΑΙ ΩΣ ΔΙΑΦΟΡΑ ΚΑΙ ΟΧΙ ΑΥΤΟΤΕΛΩΣ. Η κλίμακα είναι
// προοδευτική στο ΣΥΝΟΛΟ του εισοδήματος από ακίνητα (βλ. CONSOLIDATION_NOTE).
// Ο φόρος που ΦΕΡΝΕΙ αυτό το ακίνητο είναι επομένως ο φόρος με αυτό μείον τον
// φόρο χωρίς αυτό — όχι ο φόρος του ποσού του σαν να ήταν μόνο του στον κόσμο.
// Ένα ακίνητο 8.400 € δίπλα σε άλλα 20.000 € κοστίζει 2.293 € φόρο, όχι 1.197 €.
//
// ΤΙΠΟΤΑ ΔΕΝ ΕΠΙΝΟΕΙΤΑΙ. Η κλίμακα, η τεκμαρτή έκπτωση και η προϋπόθεση της
// τραπεζικής είσπραξης έρχονται από το lib/billing/greekTax.ts και το
// lib/billing/consolidate.ts — τα ίδια που τρέχει ο πίνακας ελέγχου. Η αξία, το
// ενοίκιο, ο ΕΝΦΙΑ και οι δαπάνες τα δίνει ο χρήστης.
// ═══════════════════════════════════════════════════════════════════════════
import { rentalIncomeTax, marginalRate, rentalBracketsForYear } from '@/lib/billing/greekTax'
import { presumptiveDeductionRate } from '@/lib/billing/consolidate'

export interface YieldInput {
  /** Αξία του ακινήτου σήμερα, ή το τίμημα που θα δώσεις. */
  value: number
  /** Μηνιαίο μίσθωμα. */
  monthlyRent: number
  /** Πόσους μήνες της χρονιάς νοικιάζεται, 0 ώς 12. */
  monthsRented: number
  /** ΕΝΦΙΑ του ακινήτου, τον χρόνο. */
  enfia: number
  /** Λειτουργικές δαπάνες τον χρόνο: συντήρηση, ασφάλιση, κοινόχρηστα. */
  expenses: number
  /** Ακαθάριστα ενοίκια από ΑΛΛΑ ακίνητα. Ανεβάζουν το κλιμάκιο αυτού εδώ. */
  otherRentalIncome: number
  /** Έτος απόκτησης του εισοδήματος — ορίζει την κλίμακα. */
  year: number
  /** Είσπραξη μέσω τραπέζης: προϋπόθεση της τεκμαρτής έκπτωσης από 1/1/2026. */
  viaBank: boolean
}

export interface YieldResult {
  /** Ετήσιο μίσθωμα, όσους μήνες νοικιάζεται. */
  gross: number
  /** Η τεκμαρτή έκπτωση που αναλογεί σε αυτό το ακίνητο. */
  deduction: number
  /** Φορολογητέο αυτού του ακινήτου. */
  taxable: number
  /** Ο ΕΠΙΠΛΕΟΝ φόρος που φέρνει αυτό το ακίνητο, στο δικό σου κλιμάκιο. */
  tax: number
  enfia: number
  expenses: number
  /** Ό,τι μένει στην τσέπη μέσα στη χρονιά. Μπορεί να είναι αρνητικό. */
  net: number
  netMonthly: number
  /** Μεικτή απόδοση, 0 ώς 1. `null` όταν δεν έχει δοθεί αξία. */
  grossYield: number | null
  /** Καθαρή απόδοση, 0 ώς 1. `null` όταν δεν έχει δοθεί αξία. */
  netYield: number | null
  /** Πόσες ποσοστιαίες μονάδες χάνονται από τη μεικτή ώς την καθαρή. */
  yieldGap: number | null
  /** Ο συντελεστής στο επόμενο ευρώ ενοικίου. */
  marginal: number
  /** Χρόνια για να επιστρέψει η αξία με τα σημερινά καθαρά. `null` όταν δεν επιστρέφει. */
  paybackYears: number | null
}

const pos = (n: number): number => (isFinite(n) && n > 0 ? n : 0)

/**
 * Ο φόρος που ΦΕΡΝΕΙ ένα φορολογητέο ποσό πάνω σε ό,τι ήδη δηλώνεται.
 *
 * Χωριστή και εξαγόμενη επειδή είναι η καρδιά της ειλικρίνειας αυτής της
 * σελίδας και θέλει δικό της έλεγχο: με μηδέν άλλα ενοίκια ταυτίζεται με τον
 * σκέτο φόρο, με άλλα ενοίκια ανεβαίνει κλιμάκιο.
 */
export function marginalTaxOn(taxable: number, otherTaxable: number, year: number): number {
  const brackets = rentalBracketsForYear(year)
  return rentalIncomeTax(otherTaxable + pos(taxable), brackets) - rentalIncomeTax(pos(otherTaxable), brackets)
}

/** Η καθαρή απόδοση ενός ακινήτου, με όλα όσα το βαραίνουν. */
export function propertyYield(input: YieldInput): YieldResult {
  const months = Math.min(12, Math.max(0, Math.round(input.monthsRented)))
  const gross = pos(input.monthlyRent) * months
  const value = pos(input.value)
  const enfia = pos(input.enfia)
  const expenses = pos(input.expenses)
  const other = pos(input.otherRentalIncome)
  const brackets = rentalBracketsForYear(input.year)

  // Η ΕΚΠΤΩΣΗ ΕΙΝΑΙ ΓΡΑΜΜΙΚΗ, ΑΡΑ ΜΕΡΙΖΕΤΑΙ ΧΩΡΙΣ ΣΦΑΛΜΑ. Το 5% επί του
  // συνόλου ισούται με 5% επί κάθε μέρους· έτσι το φορολογητέο αυτού του
  // ακινήτου και το φορολογητέο των υπολοίπων αθροίζουν στο σωστό σύνολο.
  const rate = presumptiveDeductionRate(input.viaBank)
  const taxable = gross * (1 - rate)
  const otherTaxable = other * (1 - rate)

  const tax = marginalTaxOn(taxable, otherTaxable, input.year)
  const net = gross - tax - enfia - expenses

  const grossYield = value > 0 ? gross / value : null
  const netYield = value > 0 ? net / value : null

  return {
    gross,
    deduction: gross - taxable,
    taxable,
    tax,
    enfia,
    expenses,
    net,
    netMonthly: months > 0 ? net / months : 0,
    grossYield,
    netYield,
    yieldGap: grossYield !== null && netYield !== null ? grossYield - netYield : null,
    marginal: marginalRate(otherTaxable + taxable, brackets),
    // ΧΩΡΙΣ ΚΑΘΑΡΑ ΔΕΝ ΥΠΑΡΧΕΙ ΑΠΟΣΒΕΣΗ, ΚΑΙ ΔΕΝ ΓΡΑΦΕΤΑΙ ΑΡΙΘΜΟΣ. Η διαίρεση
    // με μηδέν δίνει Infinity και με αρνητικό δίνει αρνητικά χρόνια: και τα δύο
    // θα τυπώνονταν ως νούμερο και θα διαβάζονταν ως απάντηση.
    paybackYears: value > 0 && net > 0 ? value / net : null,
  }
}
