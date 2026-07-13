// ═══════════════════════════════════════════════════════════════════════════
// ΔΕΔΟΜΕΝΑ ΚΟΙΝΟΤΗΤΑΣ — ο πραγματικός «τάφρος»: ανώνυμα, συγκεντρωτικά στοιχεία
// από τα ΠΡΑΓΜΑΤΙΚΑ ακίνητα των χρηστών (network effect). Καθαρή, δοκιμάσιμη μηχανή.
//
// ΔΙΚΑΙΑ & ΣΩΣΤΑ (όχι υποθετικά):
//  • k-anonymity: καμία περιοχή δεν εμφανίζεται με λιγότερα από COMMUNITY_MIN_SAMPLE
//    ακίνητα — δεν διαρρέει ατομικό στοιχείο και δεν προβάλλεται θόρυβος μικρού δείγματος.
//  • median/τεταρτημόρια (όχι μέσος όρος) — ανθεκτικά σε ακραίες τιμές.
//  • κοπή εξωπραγματικών αποδόσεων (<1% ή >25%) — καθαρίζει λάθη καταχώρησης.
// ═══════════════════════════════════════════════════════════════════════════
const pos = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0)
const round1 = (n: number): number => Math.round(n * 10) / 10
const round2 = (n: number): number => Math.round(n * 100) / 100

export const COMMUNITY_MIN_SAMPLE = 5
const YIELD_MIN = 1, YIELD_MAX = 25

export interface CommunitySample {
  region: string          // κλειδί ομαδοποίησης (π.χ. ΤΚ ή περιοχή)
  value: number           // αξία ακινήτου
  monthlyRent: number     // μηνιαίο ενοίκιο (ή ισοδύναμο)
  sqm?: number | null
}
export interface CommunityRegionStat {
  region: string
  count: number
  medianGrossYield: number
  p25Yield: number
  p75Yield: number
  medianRentPerSqm: number | null
  medianPricePerSqm: number | null
}

/** Γραμμικά παρεμβαλλόμενο ποσοστημόριο (p∈[0,1]) σε αύξουσα σειρά. */
export function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length
  if (n === 0) return 0
  if (n === 1) return sortedAsc[0]
  const idx = Math.max(0, Math.min(1, p)) * (n - 1)
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo)
}

/** Συγκεντρωτικά ανά περιοχή, με k-anonymity & κοπή ακραίων. Ταξινομημένα αλφαβητικά. */
export function communityStats(samples: CommunitySample[], minSample = COMMUNITY_MIN_SAMPLE): CommunityRegionStat[] {
  const groups = new Map<string, { y: number[]; rps: number[]; pps: number[] }>()
  for (const s of samples) {
    const v = pos(s.value), r = pos(s.monthlyRent)
    if (v <= 0 || r <= 0 || !s.region) continue
    const gy = (r * 12 / v) * 100
    if (gy < YIELD_MIN || gy > YIELD_MAX) continue
    const g = groups.get(s.region) || { y: [], rps: [], pps: [] }
    g.y.push(gy)
    const sqm = s.sqm && s.sqm > 0 ? s.sqm : 0
    if (sqm > 0) { g.rps.push(r / sqm); g.pps.push(v / sqm) }
    groups.set(s.region, g)
  }
  const out: CommunityRegionStat[] = []
  for (const [region, g] of groups) {
    if (g.y.length < minSample) continue
    const ys = [...g.y].sort((a, b) => a - b)
    const rps = [...g.rps].sort((a, b) => a - b)
    const pps = [...g.pps].sort((a, b) => a - b)
    out.push({
      region, count: g.y.length,
      medianGrossYield: round1(percentile(ys, 0.5)),
      p25Yield: round1(percentile(ys, 0.25)),
      p75Yield: round1(percentile(ys, 0.75)),
      medianRentPerSqm: rps.length ? round2(percentile(rps, 0.5)) : null,
      medianPricePerSqm: pps.length ? Math.round(percentile(pps, 0.5)) : null,
    })
  }
  return out.sort((a, b) => a.region.localeCompare(b.region, 'el'))
}
