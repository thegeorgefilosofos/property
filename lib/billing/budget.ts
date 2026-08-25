// lib/billing/budget.ts
// Καθαρός υπολογιστικός πυρήνας προϋπολογισμού — πρόβλεψη τέλους μήνα, ετήσια
// εικόνα (YTD) και σύγκριση περιόδων. Χωρίς I/O, πλήρως ελεγχόμενος με tests.
// Η UI (BillsBudget.tsx) τροφοδοτεί πραγματικά ποσά και εμφανίζει τα αποτελέσματα.

export type CatStatus = 'ok' | 'warn' | 'over' | 'projected_over'

// Πρόβλεψη δαπάνης τέλους μήνα. Τα «σταθερά» (λογαριασμοί/πάγια που χρεώνονται
// ολόκληρο τον μήνα) μετρώνται ως έχουν· μόνο το «μεταβλητό» (δαπάνες που
// συσσωρεύονται) προβάλλεται γραμμικά για τις υπόλοιπες ημέρες. Ποτέ κάτω από
// ό,τι έχει ήδη ξοδευτεί.
export function forecastMonthEnd(
  fixedToDate: number,
  variableToDate: number,
  dayOfMonth: number,
  daysInMonth: number,
): number {
  const fixed = Math.max(0, fixedToDate)
  const variable = Math.max(0, variableToDate)
  if (dayOfMonth <= 0 || daysInMonth <= 0) return Math.round(fixed + variable)
  const varProjected = (variable / dayOfMonth) * daysInMonth
  return Math.round(fixed + Math.max(variable, varProjected))
}

// Κατάσταση κατηγορίας: υπέρβαση ήδη / προβλεπόμενη υπέρβαση / κοντά στο όριο / εντάξει.
export function categoryStatus(budget: number, actual: number, forecast: number): CatStatus {
  if (actual > budget && actual > 0) return 'over'
  if (budget > 0 && forecast > budget) return 'projected_over'
  if (budget > 0 && actual / budget > 0.8) return 'warn'
  return 'ok'
}

export interface AnnualSummary {
  annualBudget: number       // μηνιαίος στόχος × 12
  ytdBudget: number          // μηνιαίος στόχος × μήνες που πέρασαν
  ytdActual: number          // πραγματικά έξοδα από την αρχή του έτους
  variance: number           // ytdActual − ytdBudget (θετικό = υπέρβαση)
  projectedYearEnd: number   // προβολή έτους από τον τρέχοντα ρυθμό
  onTrack: boolean           // προβολή ≤ ετήσιος στόχος
}

// Ετήσια εικόνα από τον μηνιαίο στόχο και τα πραγματικά YTD.
export function annualSummary(monthlyBudget: number, ytdActual: number, monthsElapsed: number): AnnualSummary {
  const mb = Math.max(0, monthlyBudget)
  const months = Math.max(0, monthsElapsed)
  const annualBudget = Math.round(mb * 12)
  const ytdBudget = Math.round(mb * months)
  const ytd = Math.round(Math.max(0, ytdActual))
  const projectedYearEnd = months > 0 ? Math.round((ytd / months) * 12) : 0
  return {
    annualBudget,
    ytdBudget,
    ytdActual: ytd,
    variance: ytd - ytdBudget,
    projectedYearEnd,
    onTrack: projectedYearEnd <= annualBudget,
  }
}

export interface TrendResult {
  avgPrior: number
  delta: number              // τρέχον − μέσος όρος προηγούμενων
  deltaPct: number
  direction: 'up' | 'down' | 'flat'
}

// Σύγκριση τρέχουσας περιόδου με τον μέσο όρο προηγούμενων (αγνοεί μηδενικές/κενές).
export function periodTrend(current: number, prior: number[]): TrendResult {
  const valid = prior.filter(v => v > 0)
  const avgPrior = valid.length ? valid.reduce((s, v) => s + v, 0) / valid.length : 0
  const delta = Math.round(current - avgPrior)
  const deltaPct = avgPrior > 0 ? Math.round(((current - avgPrior) / avgPrior) * 100) : 0
  const direction: TrendResult['direction'] = Math.abs(deltaPct) < 3 ? 'flat' : delta > 0 ? 'up' : 'down'
  return { avgPrior: Math.round(avgPrior), delta, deltaPct, direction }
}

// Βοηθητικό: άθροισμα ανά μήνα (YYYY-MM) από εγγραφές με ποσό και ημερομηνία.
export function sumByMonth(rows: { ym: string; amount: number }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows) out[r.ym] = (out[r.ym] ?? 0) + (r.amount || 0)
  return out
}

// ── Εντοπισμός επαναλαμβανόμενων χρεώσεων / συνδρομών ─────────────────────────
// Καθαρή ανάλυση ιστορικού κινήσεων: ομαδοποιεί ανά «ταυτότητα εμπόρου» (λέξεις-
// κλειδιά της περιγραφής, αγνοώντας αριθμούς/μήνες/γενικές λέξεις) και εντοπίζει
// όσες επαναλαμβάνονται σε ≥2 διαφορετικούς μήνες. Βρίσκει τη συχνότητα (μηνιαία,
// διμηνιαία, τριμηνιαία, ετήσια), το τυπικό ποσό, το ετήσιο κόστος και την επόμενη
// αναμενόμενη χρέωση — ώστε ο χρήστης να δει «κρυφές» συνδρομές και το βάρος τους.

export type RecurringCadence = 'monthly' | 'bimonthly' | 'quarterly' | 'yearly' | 'irregular'

export interface RecurringCharge {
  key: string
  label: string              // αναγνωρίσιμο όνομα (από την περιγραφή, χωρίς αριθμούς)
  category: string           // κατηγορία (αν δόθηκε στην είσοδο)
  cadence: RecurringCadence
  avgAmount: number          // τυπικό ποσό χρέωσης
  monthlyEquivalent: number  // κανονικοποιημένο ανά μήνα
  annualCost: number         // ετήσιο κόστος
  occurrences: number        // πλήθος χρεώσεων
  months: number             // διαφορετικοί μήνες με χρέωση
  lastDate: string           // τελευταία χρέωση (ISO)
  nextExpected: string       // επόμενη αναμενόμενη χρέωση (ISO)
  confidence: Confidence
}

type Confidence = 'high' | 'medium' | 'low'

// Γενικές/θορυβώδεις λέξεις & συντμήσεις μηνών που ΔΕΝ ταυτοποιούν έμπορο.
const RECUR_STOP = new Set([
  'ΛΟΓΑΡΙΑΣΜΟΣ', 'ΛΟΓΑΡΙΑΣΜΟΥ', 'ΠΛΗΡΩΜΗ', 'ΠΛΗΡΩΜΕΣ', 'ΚΑΡΤΑΣ', 'ΚΑΡΤΑ', 'ΧΡΕΩΣΗ', 'ΕΞΟΦΛΗΣΗ',
  'ΜΕΣΩ', 'ΕΝΤΟΛΗ', 'ΠΑΓΙΑ', 'ΣΥΝΔΡΟΜΗ', 'ΣΥΝΔΡΟΜΗΣ', 'ΜΗΝΙΑΙΑ', 'ΤΡΑΠΕΖΑ', 'ΔΟΣΗ', 'WEB', 'BANKING', 'EBANKING',
  'POS', 'ONLINE', 'PAYMENT', 'SUBSCRIPTION', 'MONTHLY', 'BILL', 'PURCHASE', 'ΑΓΟΡΑ', 'MEMBERSHIP', 'RENEWAL',
  // Συντμήσεις μηνών
  'ΙΑΝ', 'ΦΕΒ', 'ΜΑΡ', 'ΑΠΡ', 'ΜΑΙ', 'ΙΟΥΝ', 'ΙΟΥΛ', 'ΑΥΓ', 'ΣΕΠ', 'ΟΚΤ', 'ΝΟΕ', 'ΔΕΚ',
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  // Πλήρη ονόματα μηνών (ονομαστική + γενική· χωρίς τόνους/διαλυτικά αφού αφαιρούνται πρώτα)
  'ΙΑΝΟΥΑΡΙΟΣ', 'ΙΑΝΟΥΑΡΙΟΥ', 'ΦΕΒΡΟΥΑΡΙΟΣ', 'ΦΕΒΡΟΥΑΡΙΟΥ', 'ΜΑΡΤΙΟΣ', 'ΜΑΡΤΙΟΥ',
  'ΑΠΡΙΛΙΟΣ', 'ΑΠΡΙΛΙΟΥ', 'ΜΑΙΟΣ', 'ΜΑΙΟΥ', 'ΙΟΥΝΙΟΣ', 'ΙΟΥΝΙΟΥ', 'ΙΟΥΛΙΟΣ', 'ΙΟΥΛΙΟΥ',
  'ΑΥΓΟΥΣΤΟΣ', 'ΑΥΓΟΥΣΤΟΥ', 'ΣΕΠΤΕΜΒΡΙΟΣ', 'ΣΕΠΤΕΜΒΡΙΟΥ', 'ΟΚΤΩΒΡΙΟΣ', 'ΟΚΤΩΒΡΙΟΥ',
  'ΝΟΕΜΒΡΙΟΣ', 'ΝΟΕΜΒΡΙΟΥ', 'ΔΕΚΕΜΒΡΙΟΣ', 'ΔΕΚΕΜΒΡΙΟΥ',
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
])

// Ταυτότητα εμπόρου: αφαίρεση τόνων, κεφαλαία, κράτημα των 2 πιο διακριτικών λέξεων
// (≥3 γράμματα, εκτός stopwords), ταξινομημένων ώστε η σειρά να μη μετράει.
const recurSig = (desc: string): string => {
  const up = (desc || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  const toks = up.replace(/[^A-ZΑ-Ω]+/g, ' ').split(' ').filter(w => w.length >= 3 && !RECUR_STOP.has(w))
  return Array.from(new Set(toks)).sort((a, b) => b.length - a.length).slice(0, 2).sort().join(' ')
}

// Καθαρό όνομα εμφάνισης: περιγραφή χωρίς μεγάλες ομάδες ψηφίων/αναφορές.
const recurLabel = (desc: string): string => {
  const t = (desc || '').replace(/\s+/g, ' ').trim()
  const cleaned = t.replace(/\b[\d/*.-]{4,}\b/g, '').replace(/\s{2,}/g, ' ').trim()
  return (cleaned || t).slice(0, 34)
}

const monthIndex = (iso: string): number => {
  const [y, m] = iso.split('-').map(Number)
  return (y || 0) * 12 + ((m || 1) - 1)
}
const addMonthsISO = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number)
  // Σφιχτό στην τελευταία ημέρα του μήνα-στόχου — ώστε μια χρέωση της 31ης να μη «πηδάει» μήνα.
  const len = new Date(y || 1970, (m || 1) - 1 + n + 1, 0).getDate()
  const dt = new Date(y || 1970, (m || 1) - 1 + n, Math.min(d || 1, len))
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
const median = (xs: number[]): number => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function detectRecurring(
  txns: { date: string; amount: number; description: string; category?: string }[],
  opts?: { minMonths?: number },
): RecurringCharge[] {
  const minMonths = Math.max(2, opts?.minMonths ?? 2)
  // Ομαδοποίηση ανά ταυτότητα εμπόρου (αγνοούμε κενές υπογραφές/μηδενικά ποσά).
  const groups = new Map<string, { date: string; amount: number; description: string; category?: string }[]>()
  for (const t of txns) {
    const amt = Math.abs(Number(t.amount) || 0)
    if (!t.date || amt < 0.01 || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) continue
    const sig = recurSig(t.description)
    if (sig.length < 3) continue
    ;(groups.get(sig) ?? groups.set(sig, []).get(sig)!).push({ ...t, amount: amt })
  }

  const out: RecurringCharge[] = []
  for (const [sig, items] of groups) {
    const byMonth = new Map<number, number>()   // μήνας → συνολικό ποσό μήνα
    for (const it of items) {
      const mi = monthIndex(it.date)
      byMonth.set(mi, (byMonth.get(mi) ?? 0) + it.amount)
    }
    const months = byMonth.size
    if (months < minMonths) continue

    const idxs = Array.from(byMonth.keys()).sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < idxs.length; i++) gaps.push(idxs[i] - idxs[i - 1])
    const g = median(gaps) || 1
    const spread = gaps.length ? Math.max(...gaps) - Math.min(...gaps) : 0

    let cadence: RecurringCadence, per: number
    if (g <= 1.3) { cadence = 'monthly'; per = 1 }
    else if (g <= 2.3) { cadence = 'bimonthly'; per = 2 }
    else if (g <= 4.5) { cadence = 'quarterly'; per = 3 }
    else if (g >= 10 && g <= 14) { cadence = 'yearly'; per = 12 }
    else { cadence = 'irregular'; per = g }

    // Κράτα μόνο ό,τι μοιάζει πραγματικά επαναλαμβανόμενο (τακτική συχνότητα ή ≥3 μήνες).
    if (cadence === 'irregular' && months < 3) continue

    const perMonthAmts = Array.from(byMonth.values())
    const avgAmount = Math.round((perMonthAmts.reduce((s, v) => s + v, 0) / months) * 100) / 100
    const monthlyEquivalent = Math.round((avgAmount / per) * 100) / 100
    const annualCost = Math.round(monthlyEquivalent * 12)
    const lastDate = items.reduce((mx, it) => (it.date > mx ? it.date : mx), items[0].date)
    const nextExpected = addMonthsISO(lastDate, Math.round(per))
    const confidence: Confidence =
      months >= 3 && spread <= 1 ? 'high' : months >= 3 || cadence !== 'irregular' ? 'medium' : 'low'
    // Ετικέτα/κατηγορία από την πιο πρόσφατη εγγραφή της ομάδας.
    const latest = items.reduce((mx, it) => (it.date > mx.date ? it : mx), items[0])

    out.push({
      key: sig.toLowerCase().replace(/\s+/g, '_'),
      label: recurLabel(latest.description),
      category: latest.category ?? 'other',
      cadence, avgAmount, monthlyEquivalent, annualCost,
      occurrences: items.length, months, lastDate, nextExpected, confidence,
    })
  }
  return out.sort((a, b) => b.annualCost - a.annualCost)
}
