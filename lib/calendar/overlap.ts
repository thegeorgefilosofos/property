// Υπολογισμός παράλληλων "λωρίδων" (columns) για χρονισμένα γεγονότα που
// επικαλύπτονται μέσα σε μία μέρα, ώστε μια προβολή ημέρας/εβδομάδας να τα
// σχεδιάζει δίπλα-δίπλα αντί στοιβαγμένα. Κλασικό column-packing interval graph
// (day view τύπου Google Calendar). Καθαρές συναρτήσεις — χωρίς DOM.

export interface LaidOutEvent<T> {
  event: T
  lane: number
  lanes: number
  startMin: number
  endMin: number
}

// Ελάχιστο block για layout όταν end<=start.
const MIN_BLOCK = 30

// Parse "HH:MM" σε λεπτά από τα μεσάνυχτα. null για κενό/άκυρο (h>23 ή m>59).
export function toMinutes(time: string | null | undefined): number | null {
  if (time == null || typeof time !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

// Μέγιστος αριθμός γεγονότων που επικαλύπτονται σε οποιαδήποτε στιγμή (half-open).
export function maxConcurrency(events: { startMin: number; endMin: number }[]): number {
  if (!events || events.length === 0) return 0
  // Sweep line: +1 στην αρχή, -1 στο τέλος. Στο ίδιο σημείο, τα τέλη (-1)
  // προηγούνται των αρχών (+1) ώστε [540,600) και [600,660) να μη μετρώνται μαζί.
  const pts: { at: number; delta: number }[] = []
  for (const e of events) {
    const s = e.startMin
    const en = e.endMin > e.startMin ? e.endMin : e.startMin + MIN_BLOCK
    pts.push({ at: s, delta: 1 })
    pts.push({ at: en, delta: -1 })
  }
  pts.sort((a, b) => (a.at - b.at) || (a.delta - b.delta))
  let cur = 0
  let max = 0
  for (const p of pts) {
    cur += p.delta
    if (cur > max) max = cur
  }
  return max
}

// Layout μιας μέρας: σπάει τα γεγονότα σε maximal clusters όπου το καθένα
// επικαλύπτεται με τουλάχιστον ένα προηγούμενο του cluster, και μέσα σε κάθε
// cluster αναθέτει την μικρότερη ελεύθερη λωρίδα. Όλα τα γεγονότα ενός cluster
// μοιράζονται το ίδιο `lanes` (max concurrency) ώστε οι στήλες να ευθυγραμμίζονται.
export function layoutDay<T>(
  events: T[],
  getStart: (e: T) => number,
  getEnd: (e: T) => number,
): LaidOutEvent<T>[] {
  if (!events || events.length === 0) return []

  // Κανονικοποίηση + σταθερός δείκτης για tiebreak.
  const norm = events.map((event, idx) => {
    const startMin = getStart(event)
    const rawEnd = getEnd(event)
    const endMin = rawEnd > startMin ? rawEnd : startMin + MIN_BLOCK
    return { event, startMin, endMin, idx }
  })

  // Sort: startMin asc, μετά endMin desc, μετά σταθερός δείκτης εισόδου.
  norm.sort((a, b) => (a.startMin - b.startMin) || (b.endMin - a.endMin) || (a.idx - b.idx))

  const out: LaidOutEvent<T>[] = []

  // Τρέχον cluster.
  let cluster: { event: T; startMin: number; endMin: number; lane: number }[] = []
  let clusterMaxEnd = -Infinity
  // active[lane] = endMin του γεγονότος που κρατά τη λωρίδα (ή null αν ελεύθερη).
  let active: (number | null)[] = []

  const flush = () => {
    if (cluster.length === 0) return
    const lanes = cluster.reduce((mx, c) => Math.max(mx, c.lane + 1), 0)
    for (const c of cluster) {
      out.push({ event: c.event, lane: c.lane, lanes, startMin: c.startMin, endMin: c.endMin })
    }
    cluster = []
    active = []
    clusterMaxEnd = -Infinity
  }

  for (const n of norm) {
    // Νέο cluster όταν το τρέχον ξεκινά στο ή μετά το μέγιστο τέλος του cluster.
    if (cluster.length > 0 && n.startMin >= clusterMaxEnd) {
      flush()
    }
    // Ελευθέρωσε λωρίδες γεγονότων που έχουν ήδη τελειώσει (half-open).
    for (let i = 0; i < active.length; i++) {
      if (active[i] != null && (active[i] as number) <= n.startMin) active[i] = null
    }
    // Μικρότερη ελεύθερη λωρίδα.
    let lane = active.findIndex((v) => v == null)
    if (lane === -1) {
      lane = active.length
      active.push(null)
    }
    active[lane] = n.endMin
    cluster.push({ event: n.event, startMin: n.startMin, endMin: n.endMin, lane })
    if (n.endMin > clusterMaxEnd) clusterMaxEnd = n.endMin
  }
  flush()

  return out
}
