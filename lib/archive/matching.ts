// ═══════════════════════════════════════════════════════════════════════════
// ΤΑΙΡΙΑΣΜΑ ΛΟΓΑΡΙΑΣΜΟΥ ΜΕ ΤΗΝ ΠΛΗΡΩΜΗ ΤΟΥ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ
// Ο λογαριασμός της ΔΕΗ και η απόδειξη που τον πλήρωσε είναι δύο ξεχωριστά
// χαρτιά, ανεβασμένα σε διαφορετικές στιγμές, που δεν γνωρίζονται μεταξύ τους.
// Όταν κάποιος —ο λογιστής, η εφορία, ο συνιδιοκτήτης— ρωτήσει «πληρώθηκε ο
// Ιούνιος;», ο ιδιοκτήτης ψάχνει σε δύο μεριές και συγκρίνει ποσά με το μάτι.
//
// Η ΑΡΧΗ: ΤΑΙΡΙΑΖΟΥΜΕ ΜΟΝΟ ΟΤΑΝ ΕΙΜΑΣΤΕ ΣΙΓΟΥΡΟΙ
// Ένα λάθος ταίριασμα είναι χειρότερο από κανένα: δείχνει «πληρωμένο» κάτι που
// δεν πληρώθηκε, και ο ιδιοκτήτης χάνει την προθεσμία εμπιστευόμενος την οθόνη.
// Γι' αυτό εδώ δεν υπάρχει «περίπου»: ή τα τρία κριτήρια ισχύουν, ή δεν
// ταιριάζουμε τίποτα και το λέμε.
//
// ΤΑ ΤΡΙΑ ΚΡΙΤΗΡΙΑ
//   1. ΙΔΙΟΣ ΠΑΡΟΧΟΣ. Κανονικοποιημένος — «ΔΕΗ», «δεη», «Δ.Ε.Η.» είναι ο ίδιος.
//   2. ΙΔΙΟ ΠΟΣΟ, στο λεπτό. Ανοχή 1 λεπτό ΜΟΝΟ για σφάλμα στρογγυλοποίησης,
//      όχι για «περίπου το ίδιο»: μια μερική πληρωμή ΔΕΝ είναι η πληρωμή του
//      λογαριασμού και δεν πρέπει να εμφανίζεται ως τέτοια.
//   3. ΛΟΓΙΚΗ ΣΕΙΡΑ ΣΤΟΝ ΧΡΟΝΟ. Η πληρωμή δεν γίνεται πριν εκδοθεί ο
//      λογαριασμός, ούτε χρόνια μετά.
//
// ΓΙΑΤΙ ΕΝΑ ΠΡΟΣ ΕΝΑ
// Δύο λογαριασμοί ΔΕΗ του ίδιου ποσού σε γειτονικούς μήνες είναι συνηθισμένοι.
// Χωρίς αποκλειστική αντιστοίχιση, η ίδια απόδειξη θα κολλούσε και στους δύο και
// ο ιδιοκτήτης θα νόμιζε ότι πλήρωσε δύο φορές. Κάθε απόδειξη δένεται σε ΕΝΑΝ
// λογαριασμό, και κερδίζει το κοντινότερο ζευγάρι στον χρόνο.
//
// Καθαρή λογική: καμία εξάρτηση από React ή Supabase.
// ═══════════════════════════════════════════════════════════════════════════

/** Ανοχή ΜΟΝΟ για στρογγυλοποίηση — όχι για μερική πληρωμή. */
export const AMOUNT_TOLERANCE = 0.011

/** Πληρωμή πριν την έκδοση δεν στέκει, αλλά η ημερομηνία έκδοσης συχνά λείπει ή
 *  διαβάζεται λάθος από τη σάρωση, οπότε δίνουμε μικρό περιθώριο. */
export const DAYS_BEFORE_ISSUE = 3
/** Πάνω από τρεις μήνες μετά τη λήξη, το πιθανότερο είναι άλλος λογαριασμός. */
export const DAYS_AFTER_DUE = 90

export interface Payable {
  id: string
  provider: string | null
  amount: number | null
  /** Ημερομηνία έκδοσης· αν λείπει, χρησιμοποιείται η λήξη. */
  issueDate: string | null
  dueDate: string | null
}

export interface Payment {
  id: string
  provider: string | null
  amount: number | null
  paidDate: string | null
}

/**
 * Κανονικοποίηση ονόματος παρόχου. «Δ.Ε.Η.», «δεη », «ΔΕΗ Α.Ε.» → «ΔΕΗ».
 *
 * Αφαιρούνται τελείες, κενά και οι εταιρικές καταλήξεις, γιατί ο ίδιος πάροχος
 * γράφεται αλλιώς στο τιμολόγιο και αλλιώς στην απόδειξη της τράπεζας — και αν
 * δεν τα ενοποιήσουμε, δεν ταιριάζει ποτέ τίποτα.
 */
export function normalizeProvider(raw: string | null | undefined): string {
  return (raw ?? '')
    .toUpperCase()
    .replace(/[.\s\-_]/g, '')
    .replace(/(ΑΕ|ΑΕΒΕ|ΕΠΕ|ΙΚΕ|ΟΕ|ΕΕ|SA|AE|LTD|PLC)$/g, '')
}

const dayMs = 86_400_000
const parse = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso.length <= 10 ? `${iso}T00:00:00Z` : iso)
  return Number.isNaN(t) ? null : t
}

/** Διαφορά σε μέρες, b − a. */
const daysBetween = (a: number, b: number) => Math.round((b - a) / dayMs)

export interface MatchReason {
  providerMatched: boolean
  amountMatched: boolean
  timingMatched: boolean
  /** Μέρες από τη λήξη ως την πληρωμή· αρνητικό = πληρώθηκε νωρίς. */
  daysFromDue: number | null
}

/** Ταιριάζουν αυτά τα δύο; Επιστρέφει και το γιατί, για να εξηγείται στην οθόνη. */
export function evaluate(bill: Payable, pay: Payment): { ok: boolean; reason: MatchReason } {
  const providerMatched =
    !!bill.provider && !!pay.provider &&
    normalizeProvider(bill.provider) === normalizeProvider(pay.provider) &&
    normalizeProvider(bill.provider) !== ''

  const amountMatched =
    bill.amount != null && pay.amount != null &&
    Math.abs(bill.amount - pay.amount) <= AMOUNT_TOLERANCE

  const paid = parse(pay.paidDate)
  const issue = parse(bill.issueDate) ?? parse(bill.dueDate)
  const due = parse(bill.dueDate) ?? parse(bill.issueDate)

  let timingMatched = false
  let daysFromDue: number | null = null
  if (paid != null && issue != null && due != null) {
    const afterIssue = daysBetween(issue, paid) >= -DAYS_BEFORE_ISSUE
    daysFromDue = daysBetween(due, paid)
    timingMatched = afterIssue && daysFromDue <= DAYS_AFTER_DUE
  }

  return {
    ok: providerMatched && amountMatched && timingMatched,
    reason: { providerMatched, amountMatched, timingMatched, daysFromDue },
  }
}

export interface Pair {
  billId: string
  paymentId: string
  reason: MatchReason
}

export interface MatchResult {
  pairs: Pair[]
  /** Λογαριασμοί χωρίς απόδειξη — αυτό που θέλει να δει ο ιδιοκτήτης. */
  unmatchedBills: string[]
  /** Αποδείξεις που δεν βρήκαν λογαριασμό — συχνά σημάδι ότι λείπει χαρτί. */
  unmatchedPayments: string[]
}

/**
 * Αποκλειστικό ταίριασμα ένα-προς-ένα.
 *
 * Όλα τα υποψήφια ζευγάρια βαθμολογούνται με την απόσταση της πληρωμής από τη
 * λήξη και δένονται από το κοντινότερο προς το μακρύτερο. Έτσι, όταν δύο
 * λογαριασμοί ίδιου ποσού διεκδικούν την ίδια απόδειξη, την παίρνει αυτός που
 * ταιριάζει χρονικά — και ο άλλος μένει σωστά ασυνόδευτος αντί να δείχνει
 * ψευδώς πληρωμένος.
 *
 * Στην ισοπαλία αποφασίζουν τα id, ώστε το αποτέλεσμα να είναι ίδιο σε κάθε
 * φόρτωση· αλλιώς η οθόνη θα άλλαζε από μόνη της χωρίς να αλλάξει τίποτα.
 */
export function matchPayments(bills: readonly Payable[], payments: readonly Payment[]): MatchResult {
  const candidates: (Pair & { distance: number })[] = []

  for (const b of bills) {
    for (const p of payments) {
      const { ok, reason } = evaluate(b, p)
      if (!ok) continue
      candidates.push({
        billId: b.id, paymentId: p.id, reason,
        distance: Math.abs(reason.daysFromDue ?? 0),
      })
    }
  }

  candidates.sort((x, y) =>
    x.distance - y.distance ||
    x.billId.localeCompare(y.billId) ||
    x.paymentId.localeCompare(y.paymentId))

  const usedBills = new Set<string>()
  const usedPayments = new Set<string>()
  const pairs: Pair[] = []
  for (const c of candidates) {
    if (usedBills.has(c.billId) || usedPayments.has(c.paymentId)) continue
    usedBills.add(c.billId); usedPayments.add(c.paymentId)
    pairs.push({ billId: c.billId, paymentId: c.paymentId, reason: c.reason })
  }

  return {
    pairs,
    unmatchedBills: bills.filter(b => !usedBills.has(b.id)).map(b => b.id),
    unmatchedPayments: payments.filter(p => !usedPayments.has(p.id)).map(p => p.id),
  }
}

/** Σύντομη ελληνική εξήγηση, για badge δίπλα στο ζευγάρι. */
export function explainPair(reason: MatchReason): string {
  const d = reason.daysFromDue
  if (d == null) return 'Πληρωμένο'
  if (d < 0) return `Πληρώθηκε ${Math.abs(d)} ${Math.abs(d) === 1 ? 'μέρα' : 'μέρες'} πριν τη λήξη`
  if (d === 0) return 'Πληρώθηκε την ημέρα λήξης'
  return `Πληρώθηκε ${d} ${d === 1 ? 'μέρα' : 'μέρες'} μετά τη λήξη`
}
