// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΜΕΤΑΦΡΑΣΗ ΑΝΑΜΕΣΑ ΣΤΟΝ ΠΙΝΑΚΑ `loans` ΚΑΙ ΤΙΣ ΟΘΟΝΕΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΤΟ ΓΕΝΝΗΣΕ
//
// Οκτώ αρχεία ζητούσαν `amount` και `rate` από τον πίνακα `loans`. Καμία από
// τις δύο στήλες δεν υπάρχει: το ποσό λέγεται `loan_amount`, και επιτόκιο ως
// ενιαίος αριθμός ΔΕΝ αποθηκεύεται καθόλου — υπάρχουν `rate_type`,
// `fixed_rate`, `euribor` και `spread`, και το πραγματικό επιτόκιο προκύπτει.
//
// Επειδή το PostgREST απορρίπτει ολόκληρο το ερώτημα σε άγνωστη στήλη, κάθε
// τέτοιο ερώτημα γύριζε null και οι οθόνες έδειχναν μηδέν δάνεια — χωρίς
// κανένα σφάλμα. Οι εκπιπτόμενοι τόκοι στη Λογιστική έβγαιναν 0 €.
//
// ΓΙΑΤΙ ΜΕΤΑΦΡΑΣΗ ΚΑΙ ΟΧΙ ΝΕΕΣ ΣΤΗΛΕΣ
//
// Θα ήταν εύκολο να προστεθούν `amount` και `rate` στη βάση. Θα ήταν όμως
// ΔΕΥΤΕΡΗ ΠΗΓΗ ΑΛΗΘΕΙΑΣ για κάτι που ήδη υπάρχει: δύο στήλες που μπορούν να
// διαφωνήσουν με τις `loan_amount`/`fixed_rate`, με κανέναν να μη λέει ποια
// ισχύει. Αντ' αυτού η μετάφραση γίνεται σε ΕΝΑ σημείο, εδώ, με τεστ.
//
// Το επιτόκιο ενός κυμαινόμενου δανείου ΔΕΝ είναι αποθηκευμένος αριθμός: είναι
// Euribor + spread, και ο Euribor αλλάζει. Η αποθήκευσή του θα πάγωνε μια τιμή
// που η επόμενη αναπροσαρμογή θα διέψευδε.
// ═══════════════════════════════════════════════════════════════════════════
import { annuityMonthly } from './recommend'

/** Οι στήλες όπως ΠΡΑΓΜΑΤΙΚΑ λέγονται στον πίνακα (baseline.sql + migrations). */
export interface LoanRow {
  id?: string
  property_id?: string
  user_id?: string
  bank?: string | null
  loan_amount?: number | null
  down_payment?: number | null
  rate_type?: string | null
  fixed_rate?: number | null
  euribor?: number | null
  spread?: number | null
  years?: number | null
  start_date?: string | null
  status?: string | null
  loan_type?: string | null
  property_value?: number | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

/**
 * Η λίστα στηλών για κάθε `select`. Ένα όνομα, ένα σημείο: αν αύριο αλλάξει
 * στήλη, δεν ψάχνει κανείς οκτώ αρχεία — και κανείς δεν ξαναγράφει από μνήμη
 * μια στήλη που δεν υπάρχει.
 */
export const LOAN_COLUMNS =
  'id,property_id,user_id,bank,loan_amount,down_payment,rate_type,fixed_rate,euribor,spread,years,start_date,status,loan_type,property_value,notes,created_at'

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0)

/**
 * ΤΟ ΠΡΑΓΜΑΤΙΚΟ ΕΠΙΤΟΚΙΟ.
 *
 * Σταθερό  → `fixed_rate`.
 * Κυμαινόμενο → `euribor + spread` (έτσι το ορίζει και η ίδια η φόρμα).
 * Μεικτό   → `fixed_rate` όσο διαρκεί η σταθερή περίοδος· δεν αποθηκεύεται
 *            πότε λήγει, οπότε χρησιμοποιείται το σταθερό και, αν λείπει,
 *            πέφτει στο κυμαινόμενο. Καμία εφεύρεση: μόνο ό,τι υπάρχει.
 */
export function effectiveRate(row: LoanRow): number {
  const variable = num(row.euribor) + num(row.spread)
  if (row.rate_type === 'variable') return variable
  const fixed = num(row.fixed_rate)
  return fixed > 0 ? fixed : variable
}

/** Το ποσό του δανείου. Η στήλη λέγεται `loan_amount`, ποτέ `amount`. */
export const loanAmount = (row: LoanRow): number => num(row.loan_amount)

/** Ενεργό δάνειο = μετράει σε δόση, σε δείκτη δανείου-προς-αξία και σε τόκους. */
export const isActiveLoan = (row: LoanRow): boolean => (row.status ?? 'active') === 'active'

// ═══════════════════════════════════════════════════════════════════════════
// Η ΜΗΝΙΑΙΑ ΔΟΣΗ: ΜΙΑ ΓΡΑΦΗ, ΓΙΑ ΟΛΕΣ ΤΙΣ ΟΘΟΝΕΣ
// ─────────────────────────────────────────────────────────────────────────
// Ο Προϋπολογισμός την υπολόγιζε μόνος του, σωστά, με φίλτρο ενεργών δανείων
// και `annuityMonthly(amount, rate, years)`. Η Σύγκριση δεν την υπολόγιζε
// ΚΑΘΟΛΟΥ: η στήλη «Καθαρό ανά μήνα» έλεγε ρητά στην εξήγησή της «δεν
// περιλαμβάνει δόσεις δανείου» και μετά φορούσε το στεφάνι «καλύτερο».
//
// Δύο ακίνητα με ίδιο ενοίκιο και ίδιες δαπάνες, το ένα με δάνειο 700 €/μήνα
// και το άλλο ξεπληρωμένο, έβγαιναν ισόπαλα. Η ειλικρίνεια της υποσημείωσης
// δεν διορθώνει τη σειρά της κατάταξης: ο ιδιοκτήτης διαβάζει το έντονο.
//
// Ο φίλτρο ενεργών ΔΕΝ είναι προαιρετικό: ξεπληρωμένο δάνειο (status ≠ active)
// δεν έχει δόση, και το να μπει θα χρέωνε το ακίνητο για κάτι που τελείωσε.
// ═══════════════════════════════════════════════════════════════════════════

/** Η μηνιαία δόση ενός δανείου. Μηδέν όταν δεν είναι ενεργό ή λείπει διάρκεια. */
export function loanInstalment(row: LoanRow): number {
  if (!isActiveLoan(row)) return 0
  return annuityMonthly(loanAmount(row), effectiveRate(row), num(row.years))
}

/** Το άθροισμα των μηνιαίων δόσεων μιας λίστας δανείων. */
export const loansInstalmentTotal = (rows: readonly LoanRow[] | null | undefined): number =>
  (rows || []).reduce((s, r) => s + loanInstalment(r), 0)

/** Το σχήμα που περιμένουν οι οθόνες, με το ποσό και το επιτόκιο υπολογισμένα. */
export interface LoanView extends LoanRow {
  amount: number
  rate: number
}

export function toLoanView(row: LoanRow): LoanView {
  return { ...row, amount: loanAmount(row), rate: effectiveRate(row) }
}

export const toLoanViews = (rows: LoanRow[] | null | undefined): LoanView[] =>
  (rows || []).map(toLoanView)

/**
 * Η αντίστροφη πορεία, για αποθήκευση: ό,τι έρχεται από τη φόρμα ως `amount`
 * γράφεται στο `loan_amount`, και το `rate` στη σωστή στήλη ανάλογα με τον
 * τύπο. Έτσι το insert σταματά να απορρίπτεται σιωπηλά.
 */
export function toLoanRow(v: Partial<LoanView>): LoanRow {
  const { amount, rate, ...rest } = v
  const row: LoanRow = { ...rest }
  if (amount != null) row.loan_amount = amount
  if (rate != null) {
    if (v.rate_type === 'variable') {
      // Κρατάμε το spread ως το μέρος που ορίζει η τράπεζα· ο Euribor είναι
      // αγοραίος και δεν τον «αποφασίζει» ο χρήστης.
      row.spread = Math.max(0, rate - num(v.euribor))
    } else {
      row.fixed_rate = rate
    }
  }
  return row
}
