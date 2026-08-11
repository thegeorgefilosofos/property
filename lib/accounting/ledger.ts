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
}

export interface LedgerEntry extends LedgerInput {
  balance: number // τρέχον υπόλοιπο μετά από αυτή την εγγραφή
}

// Στρογγυλοποίηση σε λεπτά (cents) για την αποφυγή σφαλμάτων κινητής υποδιαστολής.
const cents = (n: number): number => Math.round(n * 100) / 100

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
    const amt = Math.abs(safeAmount(e.amount))
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
    const amt = Math.abs(safeAmount(e.amount))
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
  for (const e of ordered) {
    const ekey = monthKey(e.date)
    actual.forEach((a, idx) => {
      if (consumed[idx]) return
      if (!a.paid) return
      if (a.refId !== undefined) return // οι refId πληρωμές δεν πέφτουν στο fallback
      if (a.date === undefined) return
      if (monthKey(a.date) !== ekey) return
      paidByExpected.set(e.id, paidByExpected.get(e.id)! + safeAmount(a.amount))
      consumed[idx] = true
    })
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
    outstanding: cents(Math.max(0, expectedTotal - collectedTotal)),
    counts,
  }
}
