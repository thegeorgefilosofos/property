import { cents } from '@/lib/core/money'
// Καθολικό λογιστικό (general ledger) + συμφωνία (reconciliation) για διαχείριση
// ακινήτων. Καθαρές συναρτήσεις — χωρίς I/O, χωρίς DOM. Όλα τα ποσά σε EUR
// (αριθμοί). Όλες οι ημερομηνίες 'YYYY-MM-DD' και συγκρίνονται λεξικογραφικά.

export type EntryType = 'income' | 'expense'

export interface LedgerInput {
  date: string
  type: EntryType
  category: string
  description: string
  amount: number
  source?: string
  /**
   * ΤΟΠΟΣ ΠΑΡΟΧΗΣ, ΓΙΑ ΤΟ ΑΡΧΕΙΟ ΤΟΥ ΛΟΓΙΣΤΗ.
   *
   * Δεν τα αγγίζει η `buildLedger`: κάνει spread ολόκληρης της εγγραφής, οπότε
   * ό,τι μπει εδώ φτάνει αυτούσιο στο Excel. Προαιρετικά, γιατί τα έσοδα
   * (ενοίκια, κρατήσεις) δεν έχουν πάροχο και δεν πρέπει να αναγκαστούν να
   * επινοήσουν έναν.
   */
  supplier_country?: string | null
  supply?: string | null
  /** ΑΦΜ εκδότη, εννέα ψηφία. Ό,τι δεν είναι ΑΦΜ δεν φτάνει στο αρχείο. */
  supplier_afm?: string | null
}

export interface LedgerEntry extends LedgerInput {
  balance: number // τρέχον υπόλοιπο μετά από αυτή την εγγραφή
}

// Στρογγυλοποίηση σε λεπτά (cents) για την αποφυγή σφαλμάτων κινητής υποδιαστολής.


// Ασφαλές ποσό: μη-πεπερασμένα / NaN θεωρούνται 0.
const safeAmount = (n: number): number => (Number.isFinite(n) ? n : 0)

// ── 2. buildLedger ───────────────────────────────────────────────────────────
export function buildLedger(entries: LedgerInput[]): LedgerEntry[] {
  const indexed = entries.map((e, i) => ({ e, i }))
  indexed.sort((a, b) => {
    if (a.e.date !== b.e.date) return a.e.date < b.e.date ? -1 : 1
    // έσοδα πριν από έξοδα την ίδια ημέρα
    if (a.e.type !== b.e.type) return a.e.type === 'income' ? -1 : 1
    return a.i - b.i // σταθερή αρχική σειρά
  })
  let balance = 0
  return indexed.map(({ e }) => {
    const amt = safeAmount(e.amount)
    balance = cents(balance + (e.type === 'income' ? amt : -amt))
    return { ...e, balance }
  })
}

// ── 3. profitAndLoss ─────────────────────────────────────────────────────────
export interface PnL {
  income: number
  expense: number
  net: number
  byCategory: Record<string, { income: number; expense: number; net: number }>
}

export function profitAndLoss(
  entries: LedgerInput[],
  range?: { from?: string; to?: string },
): PnL {
  const from = range?.from
  const to = range?.to
  let income = 0
  let expense = 0
  const byCategory: Record<string, { income: number; expense: number; net: number }> = {}
  for (const e of entries) {
    if (from !== undefined && e.date < from) continue
    if (to !== undefined && e.date > to) continue
    // ΤΟ ΠΡΟΣΗΜΟ ΜΕΝΕΙ, ΟΠΩΣ ΚΑΙ ΣΤΟ ΚΑΘΟΛΙΚΟ.
    //
    // Εδώ γραφόταν `Math.abs`. Μια επιστροφή ΔΕΗ, καταχωρημένη ως δαπάνη
    // −50 €, μετρούσε ως δαπάνη +50 €: το καθολικό έβγαζε 850 € και τα
    // αποτελέσματα 750 € για τα ΙΔΙΑ δεδομένα. Εκατό ευρώ διαφορά ανάμεσα σε
    // δύο οθόνες της ίδιας χρονιάς, με το καθολικό να έχει δίκιο.
    //
    // Το πιστωτικό δεν είναι έξοδο· είναι έξοδο που γύρισε πίσω.
    const amt = safeAmount(e.amount)
    const cat = (byCategory[e.category] ??= { income: 0, expense: 0, net: 0 })
    if (e.type === 'income') {
      income += amt
      cat.income += amt
    } else {
      expense += amt
      cat.expense += amt
    }
    cat.net = cents(cat.income - cat.expense)
  }
  income = cents(income)
  expense = cents(expense)
  return { income, expense, net: cents(income - expense), byCategory }
}

// ── 4. cashflowByYear ────────────────────────────────────────────────────────
export interface MonthCash {
  month: number
  income: number
  expense: number
  net: number
}

export function cashflowByYear(entries: LedgerInput[], year: number): MonthCash[] {
  const months: MonthCash[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    expense: 0,
    net: 0,
  }))
  const prefix = String(year).padStart(4, '0') + '-'
  for (const e of entries) {
    if (!e.date.startsWith(prefix)) continue
    const m = Number(e.date.slice(5, 7))
    if (!(m >= 1 && m <= 12)) continue
    const amt = safeAmount(e.amount)   // ίδιος κανόνας με το profitAndLoss: το πρόσημο μένει
    const row = months[m - 1]
    if (e.type === 'income') row.income += amt
    else row.expense += amt
  }
  for (const row of months) {
    row.income = cents(row.income)
    row.expense = cents(row.expense)
    row.net = cents(row.income - row.expense)
  }
  return months
}

// ── 5. Reconciliation ────────────────────────────────────────────────────────
export type ReconStatus = 'paid' | 'partial' | 'unpaid' | 'overdue'

export interface Expected {
  id: string
  date: string
  amount: number
  label?: string
}

export interface Actual {
  refId?: string
  date?: string
  amount: number
  paid: boolean
}

export interface ReconRow {
  expected: Expected
  paidAmount: number
  status: ReconStatus
  shortfall: number
}

const monthKey = (date: string): string => date.slice(0, 7) // 'YYYY-MM'

export function reconcile(expected: Expected[], actual: Actual[], today: string): ReconRow[] {
  // Σειρά κατά ημερομηνία (σταθερή για ίδιες ημερομηνίες).
  const ordered = expected
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.date !== b.e.date ? (a.e.date < b.e.date ? -1 : 1) : a.i - b.i))
    .map(({ e }) => e)

  const paidByExpected = new Map<string, number>()
  for (const e of ordered) paidByExpected.set(e.id, 0)

  const consumed = new Array(actual.length).fill(false)

  // Φάση 1: αντιστοίχιση με refId (προτεραιότητα).
  actual.forEach((a, idx) => {
    if (!a.paid) return
    if (a.refId === undefined) return
    if (paidByExpected.has(a.refId)) {
      paidByExpected.set(a.refId, paidByExpected.get(a.refId)! + safeAmount(a.amount))
      consumed[idx] = true
    }
  })

  // Φάση 2: εφεδρική αντιστοίχιση κατά μήνα+έτος, greedy από την παλαιότερη
  // αναμενόμενη· κάθε πραγματική πληρωμή καταναλώνεται το πολύ μία φορά.
  // ═══ ΜΙΑ ΓΡΑΜΜΗ ΣΤΑΜΑΤΑ ΝΑ ΡΟΥΦΑ ΜΟΛΙΣ ΚΑΛΥΦΘΕΙ ═══════════════════════════
  //
  // ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΔΙΟΡΘΩΘΗΚΕ. Το σχόλιο υποσχόταν «κάθε πραγματική πληρωμή
  // καταναλώνεται το πολύ μία φορά» — και ίσχυε. Δεν ίσχυε το αντίστροφο: το
  // πρώτο αναμενόμενο μίσθωμα ρουφούσε ΟΛΕΣ τις ασύνδετες πληρωμές του μήνα
  // του, γιατί ο βρόχος δεν σταματούσε ποτέ. Με δύο μισθωτές στο ίδιο ακίνητο
  // και δύο εμβάσματα τον ίδιο μήνα:
  //
  //     r1 → 1.600,00 €, «πληρωμένο»
  //     r2 →     0,00 €, «εκπρόθεσμο»
  //
  // Ο ιδιοκτήτης κυνηγούσε μισθωτή που είχε πληρώσει, ενώ η ίδια οθόνη έγραφε
  // «οφειλές 0 €». Οι δύο προτάσεις δεν μπορούν να ισχύουν μαζί.
  //
  // ΓΙΑΤΙ ΟΧΙ «ΜΙΑ ΠΛΗΡΩΜΗ ΑΝΑ ΓΡΑΜΜΗ». Η μερική εξόφληση σε δύο δόσεις είναι
  // πραγματική και συχνή. Το κριτήριο δεν είναι το πλήθος αλλά η ΚΑΛΥΨΗ: όσο
  // λείπουν χρήματα, η γραμμή δέχεται· μόλις καλυφθεί, παραδίδει τη σειρά.
  // Η ανοχή του λεπτού είναι η ίδια με εκείνη του `status` παρακάτω, ώστε μια
  // γραμμή να μη θεωρείται «πληρωμένη» εκεί και «ανοιχτή» εδώ.
  const covered = (e: Expected): boolean =>
    paidByExpected.get(e.id)! >= e.amount - 0.01

  for (const e of ordered) {
    const ekey = monthKey(e.date)
    if (covered(e)) continue          // την έκλεισε ήδη μια πληρωμή με refId
    for (let idx = 0; idx < actual.length; idx++) {
      const a = actual[idx]
      if (consumed[idx]) continue
      if (!a.paid) continue
      if (a.refId !== undefined) continue // οι refId πληρωμές δεν πέφτουν στο fallback
      if (a.date === undefined) continue
      if (monthKey(a.date) !== ekey) continue
      paidByExpected.set(e.id, paidByExpected.get(e.id)! + safeAmount(a.amount))
      consumed[idx] = true
      if (covered(e)) break
    }
  }

  return ordered.map((e) => {
    const paidAmount = cents(paidByExpected.get(e.id)!)
    const shortfall = cents(Math.max(0, e.amount - paidAmount))
    let status: ReconStatus
    if (paidAmount >= e.amount - 0.01) status = 'paid'
    else if (paidAmount > 0) status = 'partial'
    else if (e.date < today) status = 'overdue'
    else status = 'unpaid'
    return { expected: e, paidAmount, status, shortfall }
  })
}

export function reconSummary(rows: ReconRow[]): {
  expectedTotal: number
  collectedTotal: number
  outstanding: number
  counts: Record<ReconStatus, number>
} {
  let expectedTotal = 0
  let collectedTotal = 0
  const counts: Record<ReconStatus, number> = { paid: 0, partial: 0, unpaid: 0, overdue: 0 }
  for (const r of rows) {
    expectedTotal += r.expected.amount
    collectedTotal += r.paidAmount
    counts[r.status]++
  }
  expectedTotal = cents(expectedTotal)
  collectedTotal = cents(collectedTotal)
  return {
    expectedTotal,
    collectedTotal,
    // ΤΟ ΠΛΕΟΝΑΣΜΑ ΤΟΥ ΕΝΟΣ ΕΣΒΗΝΕ ΤΗΝ ΟΦΕΙΛΗ ΤΟΥ ΑΛΛΟΥ. Η διαφορά των δύο
    // συνόλων συμψηφίζει: δύο μισθωτές των 1.000 €, ο ένας πληρώνει 1.500 και ο
    // άλλος τίποτα, και η οθόνη έγραφε «ανείσπρακτα 500 €» ενώ οφείλονται 1.000.
    // Είναι η ίδια αστοχία που διορθώθηκε εξήντα γραμμές πιο πάνω σε επίπεδο
    // γραμμής, και ξαναγεννήθηκε στο σύνολο. Το `shortfall` υπολογίζεται ήδη ανά
    // γραμμή και το πετούσαμε.
    outstanding: cents(rows.reduce((sum, r) => sum + r.shortfall, 0)),
    counts,
  }
}
