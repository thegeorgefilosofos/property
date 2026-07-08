// lib/inventory/depreciation.ts
// Καθαρή (pure) μηχανή απόσβεσης & προτάσεων αντικατάστασης για την Απογραφή.
// Χωρίς εξαρτήσεις από React/DOM/Supabase — ελέγχεται με: npx tsx lib/inventory/depreciation.test.ts
//
// Μοντέλο: γραμμική (straight-line) απόσβεση πάνω σε «ωφέλιμη ζωή» ανά κατηγορία.
// Όλες οι τιμές είναι ΕΚΤΙΜΗΣΕΙΣ — δεν αποτελούν λογιστική/φορολογική συμβουλή.

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365

// ── Ωφέλιμη ζωή ανά κατηγορία (χρόνια), βάσει ελληνικής αγοράς ─────────────
// Λευκές συσκευές ~8-10, ηλεκτρονικά ~5, έπιπλα ~10-12, θέρμανση/ψύξη ~12-15.
export const USEFUL_LIFE_YEARS: Record<string, number> = {
  'Έπιπλα': 12,
  'Ηλεκτρικές Συσκευές': 9,
  'Ηλεκτρονικά': 5,
  'Υδραυλικά': 15,
  'Θέρμανση & Ψύξη': 14,
  'Φωτιστικά': 8,
  'Διακόσμηση': 15,
  'Λοιπά': 8,
}
export const DEFAULT_USEFUL_LIFE = 8

export function usefulLifeYears(category?: string): number {
  if (!category) return DEFAULT_USEFUL_LIFE
  return USEFUL_LIFE_YEARS[category] ?? DEFAULT_USEFUL_LIFE
}

// ── Καταστάσεις που σηματοδοτούν πρόβλημα ────────────────────────────────
export const BAD_CONDITIONS = ['Κακή', 'Εκτός Λειτουργίας'] as const

// Ελάχιστο αντικείμενο εισόδου — δέχεται το InventoryItem αλλά ζητά μόνο ό,τι χρειάζεται.
export interface DepreciableItem {
  category?: string
  purchase_value?: number
  purchase_date?: string | null
  warranty_expiry?: string | null
  condition?: string
}

export interface Depreciation {
  hasData: boolean        // υπάρχει ημ/νία αγοράς ώστε να υπολογιστεί απόσβεση
  ageYears: number        // ηλικία σε χρόνια (0 αν άγνωστη)
  usefulLife: number      // ωφέλιμη ζωή κατηγορίας (χρόνια)
  bookValue: number       // τρέχουσα λογιστική/εκτιμώμενη αξία (€)
  depreciatedPct: number  // ποσοστό απόσβεσης 0-100
  yearsRemaining: number  // εκτιμ. χρόνια που απομένουν (0..life)
}

// Ηλικία σε χρόνια από ημερομηνία (null/κενό → null).
export function yearsSince(dateStr?: string | null, now: number = Date.now()): number | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, (now - t) / MS_PER_YEAR)
}

// Ημέρες μέχρι μια ημερομηνία (θετικό = μέλλον, αρνητικό = παρελθόν). null/κενό → null.
export function daysUntil(dateStr?: string | null, now: number = Date.now()): number | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return null
  return Math.ceil((t - now) / (1000 * 60 * 60 * 24))
}

// ── Κεντρικός υπολογισμός απόσβεσης (γραμμική) ────────────────────────────
export function depreciate(item: DepreciableItem, now: number = Date.now()): Depreciation {
  const life = usefulLifeYears(item.category)
  const value = item.purchase_value || 0
  const age = yearsSince(item.purchase_date, now)

  if (age === null) {
    // Χωρίς ημ/νία αγοράς: δεν αποσβένουμε — αξία = αξία αγοράς (ό,τι γνωρίζουμε).
    return { hasData: false, ageYears: 0, usefulLife: life, bookValue: value, depreciatedPct: 0, yearsRemaining: life }
  }

  const remainingFraction = Math.max(0, 1 - age / life)
  return {
    hasData: true,
    ageYears: age,
    usefulLife: life,
    bookValue: Math.round(value * remainingFraction),
    depreciatedPct: Math.min(100, Math.round((age / life) * 100)),
    yearsRemaining: Math.max(0, Math.round(life - age)),
  }
}

// ── Πρόταση αντικατάστασης ────────────────────────────────────────────────
export interface ReplacementSuggestion {
  suggested: boolean
  reasons: string[]        // λόγοι (ελληνικά, ήπιοι)
  severity: 'none' | 'soft' | 'due'
}

// suggested όταν: σχεδόν πλήρης απόσβεση (>=90%), Ή κακή κατάσταση,
// Ή εγγύηση έληξε πολύ καιρό (>2 χρόνια) σε αντικείμενο ήδη σημαντικά αποσβεσμένο.
export function replacementSuggestion(item: DepreciableItem, now: number = Date.now()): ReplacementSuggestion {
  const dep = depreciate(item, now)
  const reasons: string[] = []
  let due = false

  if (dep.hasData && dep.depreciatedPct >= 100) { reasons.push('Πλήρης απόσβεση'); due = true }
  else if (dep.hasData && dep.depreciatedPct >= 90) { reasons.push('Σχεδόν πλήρης απόσβεση'); due = true }

  if (item.condition === 'Εκτός Λειτουργίας') { reasons.push('Εκτός λειτουργίας'); due = true }
  else if (item.condition === 'Κακή') { reasons.push('Κακή κατάσταση'); due = true }

  const wDays = daysUntil(item.warranty_expiry, now)
  if (wDays !== null && wDays < -730 && dep.hasData && dep.depreciatedPct >= 60) {
    reasons.push('Εγγύηση έληξε εδώ και καιρό')
    due = true
  }

  if (due) return { suggested: true, reasons, severity: 'due' }

  // Ήπια ένδειξη: πλησιάζει το τέλος ωφέλιμης ζωής (>=75%) χωρίς άλλο πρόβλημα.
  if (dep.hasData && dep.depreciatedPct >= 75) {
    return { suggested: false, reasons: ['Πλησιάζει το τέλος ωφέλιμης ζωής'], severity: 'soft' }
  }
  return { suggested: false, reasons: [], severity: 'none' }
}

// ── Σύνοψη χαρτοφυλακίου (για professional aggregate + KPIs) ──────────────
export interface PortfolioSummary {
  count: number
  totalOriginal: number         // σύνολο αξίας αγοράς (€)
  totalBookValue: number        // σύνολο τρέχουσας εκτιμώμενης αξίας (€)
  totalDepreciation: number     // απώλεια αξίας = original - book (€)
  avgDepreciatedPct: number     // μέση απόσβεση (σταθμισμένη με αξία) 0-100
  needAttentionCount: number    // πόσα προτείνονται για αντικατάσταση (severity 'due')
  watchCount: number            // πόσα σε ήπια παρακολούθηση (severity 'soft')
  replacementBudget: number     // εκτιμ. προϋπολογισμός αντικατάστασης όσων χρήζουν (€)
}

export function portfolioSummary(
  items: (DepreciableItem & { replacement_cost?: number })[],
  now: number = Date.now(),
): PortfolioSummary {
  let totalOriginal = 0, totalBookValue = 0, needAttentionCount = 0, watchCount = 0, replacementBudget = 0
  for (const item of items) {
    const dep = depreciate(item, now)
    const original = item.purchase_value || 0
    totalOriginal += original
    totalBookValue += dep.bookValue
    const sug = replacementSuggestion(item, now)
    if (sug.severity === 'due') {
      needAttentionCount++
      // Προϋπολογισμός: κόστος αντικατάστασης αν δηλωμένο, αλλιώς αρχική αξία ως προσέγγιση.
      replacementBudget += item.replacement_cost || original || 0
    } else if (sug.severity === 'soft') {
      watchCount++
    }
  }
  const totalDepreciation = Math.max(0, totalOriginal - totalBookValue)
  const avgDepreciatedPct = totalOriginal > 0 ? Math.round((totalDepreciation / totalOriginal) * 100) : 0
  return {
    count: items.length,
    totalOriginal, totalBookValue, totalDepreciation, avgDepreciatedPct,
    needAttentionCount, watchCount, replacementBudget,
  }
}
