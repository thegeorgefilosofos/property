// lib/inventory/depreciation.ts
// Καθαρή (pure) μηχανή ΕΚΤΙΜΩΜΕΝΗΣ ΥΠΟΛΕΙΠΟΜΕΝΗΣ ΑΞΙΑΣ & προτάσεων αντικατάστασης.
// Χωρίς εξαρτήσεις από React/DOM/Supabase — ελέγχεται με: npx tsx lib/inventory/depreciation.test.ts
//
// ΔΕΝ ΕΙΝΑΙ ΦΟΡΟΛΟΓΙΚΗ ΑΠΟΣΒΕΣΗ. Ο επαγγελματίας που βάζει εξοπλισμό στα βιβλία
// έχει ΝΟΜΙΜΟΥΣ συντελεστές (ΚΦΕ ν.4172/2013, άρθρο 24) και δεν είναι αυτοί εδώ.
// Γι' αυτό η λέξη «απόσβεση» δεν εμφανίζεται πουθενά στην οθόνη: ένας χρήστης που
// τη διαβάζει σε προϊόν ακινήτων εύλογα νομίζει ότι είναι το νούμερο της δήλωσης.
//
// ΤΙ ΕΙΝΑΙ: γραμμική μείωση της αξίας πάνω σε μια τυπική διάρκεια ζωής ανά
// κατηγορία, για να απαντηθούν δύο πρακτικές ερωτήσεις — «πόσο αξίζει σήμερα ο
// εξοπλισμός που παραδίδω» και «τι θα χρειαστεί αντικατάσταση φέτος».

import { daysUntil } from '../core/time'

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365

// ── Τυπική διάρκεια ζωής ανά κατηγορία (χρόνια) ────────────────────────────
// ΕΚΤΙΜΗΣΕΙΣ ΠΡΟΪΟΝΤΟΣ, όχι δημοσιευμένος πίνακας και ΟΧΙ συντελεστές του ΚΦΕ:
// δεν υπάρχει επίσημη ελληνική πηγή για «πόσα χρόνια ζει ένα πλυντήριο». Χρησιμεύουν
// για να ταξινομηθεί τι γερνάει πρώτο, όχι για να μπει νούμερο σε δήλωση. Ο χρήστης
// που έχει την πραγματική αξία τη γράφει στο «Κόστος αντικατάστασης».
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

/**
 * Η σημείωση που ΠΡΕΠΕΙ να συνοδεύει κάθε νούμερο υπολειπόμενης αξίας στην οθόνη
 * και σε κάθε εξαγωγή. Ζει εδώ ώστε να λέγεται με τα ίδια λόγια σε PDF, CSV και UI.
 */
export const NOT_TAX_DEPRECIATION_NOTE =
  'Εκτίμηση υπολειπόμενης αξίας, όχι φορολογική απόσβεση: για τη δήλωση ισχύουν οι συντελεστές του ΚΦΕ (ν.4172/2013, άρθρο 24).'

export function usefulLifeYears(category?: string): number {
  if (!category) return DEFAULT_USEFUL_LIFE
  return USEFUL_LIFE_YEARS[category] ?? DEFAULT_USEFUL_LIFE
}

// ── Καταστάσεις που σηματοδοτούν πρόβλημα ────────────────────────────────

// Ελάχιστο αντικείμενο εισόδου — δέχεται το InventoryItem αλλά ζητά μόνο ό,τι χρειάζεται.
export interface DepreciableItem {
  category?: string
  purchase_value?: number
  purchase_date?: string | null
  warranty_expiry?: string | null
  condition?: string
}

export interface Depreciation {
  hasData: boolean        // υπάρχει ημ/νία αγοράς ώστε να υπολογιστεί μείωση αξίας
  ageYears: number        // ηλικία σε χρόνια (0 αν άγνωστη)
  usefulLife: number      // τυπική διάρκεια ζωής κατηγορίας (χρόνια)
  bookValue: number       // εκτιμώμενη υπολειπόμενη αξία (€)
  depreciatedPct: number  // εκτιμώμενη απομείωση 0-100 (ΟΧΙ φορολογική απόσβεση)
  remainingPct: number    // εκτιμώμενη υπολειπόμενη αξία 0-100 — αυτό δείχνει η οθόνη
  yearsRemaining: number  // εκτιμ. χρόνια που απομένουν (0..life)
}

// Ηλικία σε χρόνια από ημερομηνία (null/κενό → null).
export function yearsSince(dateStr?: string | null, now: number = Date.now()): number | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, (now - t) / MS_PER_YEAR)
}


// ── Κεντρικός υπολογισμός υπολειπόμενης αξίας (γραμμικός) ─────────────────
export function depreciate(item: DepreciableItem, now: number = Date.now()): Depreciation {
  const life = usefulLifeYears(item.category)
  const value = item.purchase_value || 0
  const age = yearsSince(item.purchase_date, now)

  if (age === null) {
    // Χωρίς ημ/νία αγοράς δεν μειώνουμε τίποτα — αξία = αξία αγοράς (ό,τι γνωρίζουμε).
    return { hasData: false, ageYears: 0, usefulLife: life, bookValue: value, depreciatedPct: 0, remainingPct: 100, yearsRemaining: life }
  }

  const remainingFraction = Math.max(0, 1 - age / life)
  const pct = age >= life ? 100 : Math.floor((age / life) * 100)
  return {
    hasData: true,
    ageYears: age,
    usefulLife: life,
    bookValue: Math.round(value * remainingFraction),
    // floor: το 100% («τέλος εκτιμώμενης ζωής») εμφανίζεται ΜΟΝΟ όταν age >= life.
    depreciatedPct: pct,
    remainingPct: 100 - pct,
    // ceil: δείχνει ≥1 χρόνο όσο απομένει έστω λίγος χρόνος· 0 μόνο στο τέλος ζωής.
    yearsRemaining: age >= life ? 0 : Math.max(1, Math.ceil(life - age)),
  }
}

// ── Πρόταση αντικατάστασης ────────────────────────────────────────────────
export interface ReplacementSuggestion {
  suggested: boolean
  reasons: string[]        // λόγοι (ελληνικά, ήπιοι)
  severity: 'none' | 'soft' | 'due'
}

// suggested όταν: τέλος εκτιμώμενης ζωής (>=90%), Ή κακή κατάσταση,
// Ή εγγύηση έληξε πολύ καιρό (>2 χρόνια) σε αντικείμενο που έχει ήδη γεράσει.
export function replacementSuggestion(item: DepreciableItem, now: number = Date.now()): ReplacementSuggestion {
  const dep = depreciate(item, now)
  const reasons: string[] = []
  let due = false

  if (dep.hasData && dep.depreciatedPct >= 100) { reasons.push('Έφτασε το τέλος της εκτιμώμενης ζωής του') ; due = true }
  else if (dep.hasData && dep.depreciatedPct >= 90) { reasons.push('Πλησιάζει το τέλος της εκτιμώμενης ζωής του'); due = true }

  if (item.condition === 'Εκτός Λειτουργίας') { reasons.push('Εκτός λειτουργίας'); due = true }
  else if (item.condition === 'Κακή') { reasons.push('Κακή κατάσταση'); due = true }

  // ΜΙΑ μηχανή για τις ημέρες. Η τοπική που ζούσε εδώ μετρούσε
  // `Math.ceil((t - now) / 86400000)`, δηλαδή σε ΩΡΕΣ: η ίδια εγγύηση έβγαζε
  // άλλον αριθμό ημερών το πρωί και άλλον το βράδυ, και διαφορετικό από αυτόν
  // που έδειχνε η οθόνη της Απογραφής δίπλα — η οποία χρησιμοποιεί ήδη την
  // κοινή, που συγκρίνει ΗΜΕΡΟΛΟΓΙΑΚΕΣ ημέρες Αθήνας.
  const wDays = item.warranty_expiry ? daysUntil(item.warranty_expiry, new Date(now)) : null
  if (wDays !== null && wDays < -730 && dep.hasData && dep.depreciatedPct >= 60) {
    reasons.push('Εγγύηση έληξε εδώ και καιρό')
    due = true
  }

  if (due) return { suggested: true, reasons, severity: 'due' }

  // Ήπια ένδειξη: πλησιάζει το τέλος της εκτιμώμενης ζωής (>=75%) χωρίς άλλο πρόβλημα.
  if (dep.hasData && dep.depreciatedPct >= 75) {
    return { suggested: false, reasons: ['Πλησιάζει το τέλος της εκτιμώμενης ζωής του'], severity: 'soft' }
  }
  return { suggested: false, reasons: [], severity: 'none' }
}

// ── Σύνοψη χαρτοφυλακίου (για professional aggregate + KPIs) ──────────────
export interface PortfolioSummary {
  count: number
  totalOriginal: number         // σύνολο αξίας αγοράς (€)
  totalBookValue: number        // σύνολο τρέχουσας εκτιμώμενης αξίας (€)
  totalDepreciation: number     // εκτιμώμενη απώλεια αξίας = original - book (€)
  avgDepreciatedPct: number     // μέση εκτιμώμενη απομείωση (σταθμισμένη με αξία) 0-100
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
