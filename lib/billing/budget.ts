// lib/billing/budget.ts
// Καθαρός υπολογιστικός πυρήνας προϋπολογισμού — πρόβλεψη τέλους μήνα, ετήσια
// εικόνα (YTD), και σύγκριση περιόδων. Χωρίς I/O, πλήρως ελεγχόμενος με tests.
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
