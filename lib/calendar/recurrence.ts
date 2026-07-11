// ─────────────────────────────────────────────────────────────────────────────
// Επέκταση επαναλαμβανόμενων γεγονότων σε μεμονωμένες εμφανίσεις μέσα σε ένα εύρος.
// Καθαρές συναρτήσεις με ακέραια αριθμητική ημερομηνίας (χωρίς σφάλματα ζώνης ώρας).
// Η βάση (base) κρατά το πραγματικό id/ημερομηνία· οι εικονικές εμφανίσεις παίρνουν
// _virtual + _seriesId ώστε το UI να ξέρει ότι ανήκουν σε σειρά.
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const isoU = (dt: Date) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`

const STEP_MONTHS: Record<string, number> = { monthly: 1, bimonthly: 2, quarterly: 3, biannual: 6, annual: 12 }

// Επόμενη εμφάνιση μιας «YYYY-MM-DD» για το δοσμένο interval, ή null αν άγνωστο.
export function nextOccurrence(date: string, interval: string): string | null {
  const [y, m, d] = date.split('-').map(Number)
  if (interval === 'weekly') return isoU(new Date(Date.UTC(y, m - 1, d + 7)))
  const step = STEP_MONTHS[interval]
  if (!step) return null
  const total = (m - 1) + step
  const ny = y + Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate() // τελευταία μέρα του μήνα-στόχου
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, lastDay))}`
}

export interface Recurrable {
  id: string; event_date: string; recurring?: boolean; recurring_interval?: string | null
  recurrence_until?: string | null           // «YYYY-MM-DD» λήξη σειράς
  recurrence_count?: number | null           // μέγιστο πλήθος εμφανίσεων (base = 1η)
  recurrence_exdates?: string[] | null        // ημερομηνίες εξαίρεσης «YYYY-MM-DD»
}

// Επιστρέφει όλες τις εμφανίσεις (base + εικονικές) που πέφτουν στο [rangeStart, rangeEnd]
// (συμπεριληπτικά, «YYYY-MM-DD»). Τηρεί recurrence_until (λήξη), recurrence_count (πλήθος,
// συμπεριλαμβανομένης της base) και recurrence_exdates (εξαιρέσεις — μετρούν στο count κατά
// iCal αλλά ΔΕΝ εμφανίζονται). Οι εικονικές έχουν event_date = ημερομηνία εμφάνισης,
// συνθετικό id «<id>__<date>», _virtual=true, _seriesId=<αρχικό id>.
export function expandRecurring<T extends Recurrable>(
  events: T[], rangeStart: string, rangeEnd: string, cap = 400
): (T & { _virtual?: boolean; _seriesId?: string })[] {
  const out: (T & { _virtual?: boolean; _seriesId?: string })[] = []
  for (const e of events) {
    const until = e.recurrence_until || null
    const count = (typeof e.recurrence_count === 'number' && e.recurrence_count > 0) ? e.recurrence_count : null
    const ex = new Set(e.recurrence_exdates || [])
    let idx = 0
    // Θεωρεί μια εμφάνιση: ενημερώνει τον μετρητή, την εμφανίζει αν είναι εντός εύρους
    // και δεν εξαιρείται. Επιστρέφει false αν η σειρά έχει εξαντληθεί (until/count).
    const consider = (date: string, isBase: boolean): boolean => {
      if (until && date > until) return false
      if (count != null && idx >= count) return false
      if (date >= rangeStart && date <= rangeEnd && !ex.has(date)) {
        out.push(isBase ? e : { ...e, event_date: date, id: `${e.id}__${date}`, _virtual: true, _seriesId: e.id })
      }
      idx++
      return true
    }
    if (!consider(e.event_date, true)) continue
    if (!e.recurring || !e.recurring_interval) continue
    let cur = e.event_date
    for (let n = 0; n < cap; n++) {
      const nx = nextOccurrence(cur, e.recurring_interval)
      if (!nx) break
      cur = nx
      if (until && cur > until) break
      if (count != null && idx >= count) break
      if (cur > rangeEnd) break
      consider(cur, false)
    }
  }
  return out
}
