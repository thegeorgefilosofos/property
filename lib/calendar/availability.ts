// ─────────────────────────────────────────────────────────────────────────────
// Free/busy + ανίχνευση συγκρούσεων για ημερολόγιο.
// Χρησιμοποιείται για προειδοποίηση «έχεις ήδη κάτι τότε» και για πρόταση
// ελεύθερων παραθύρων («3 ελεύθερα δίωρα την Τρίτη»).
//
// Καθαρές συναρτήσεις, ακέραια αριθμητική λεπτών από τα μεσάνυχτα. Ποτέ δεν
// πετάνε εξαίρεση· μη έγκυρες είσοδοι απλώς παραλείπονται.
//
// Μοντέλο: τα γεγονότα έχουν ημερομηνία «YYYY-MM-DD», προαιρετική ώρα «HH:MM»
// (24ωρο) και προαιρετικό durationMinutes (default 60 όταν έχει ώρα). Ολοήμερα
// (χωρίς ώρα) ΔΕΝ μπλοκάρουν την εύρεση slot μόνα τους — αντιμετωπίζονται ως
// μαλακός δείκτης (allDayNotes) και δεν συγκρούονται σκληρά με χρονισμένα.
// ─────────────────────────────────────────────────────────────────────────────

export interface BusyEvent {
  id?: string
  title?: string
  date: string
  time?: string | null
  durationMinutes?: number | null
  status?: string
}

export interface Interval {
  start: number // λεπτά από τα μεσάνυχτα (συμπεριληπτικά)
  end: number   // λεπτά από τα μεσάνυχτα (αποκλειστικά — half-open [start,end))
}

const pad = (n: number) => String(n).padStart(2, '0')

// Ελεύθερο διάστημα (λεπτά) ενός γεγονότος, ή null αν ολοήμερο/άκυρο/ακυρωμένο.
export function toInterval(e: BusyEvent): Interval | null {
  if (!e || typeof e !== 'object') return null
  if (e.status === 'cancelled') return null
  const t = e.time
  if (t == null || typeof t !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  const start = hh * 60 + mm
  const dur = typeof e.durationMinutes === 'number' && e.durationMinutes > 0 ? e.durationMinutes : 60
  return { start, end: start + dur }
}

// Half-open overlap: [start,end). Έτσι [540,600) και [600,660) ΔΕΝ επικαλύπτονται.
export function overlaps(a: Interval, b: Interval): boolean {
  if (!a || !b) return false
  return a.start < b.end && b.start < a.end
}

// Συγκρούσεις: ίδια ημερομηνία, χρονισμένα, με επικάλυψη· εξαιρεί το ίδιο id και
// τα ακυρωμένα. Επιστρέφει τα γεγονότα που συγκρούονται.
export function findConflicts(target: BusyEvent, events: BusyEvent[]): BusyEvent[] {
  const ti = toInterval(target)
  if (!ti || !target || !Array.isArray(events)) return []
  const out: BusyEvent[] = []
  for (const e of events) {
    if (!e || e.date !== target.date) continue
    if (e.status === 'cancelled') continue
    // Εξαίρεση του ίδιου γεγονότος (μόνο όταν και τα δύο έχουν id).
    if (target.id != null && e.id != null && e.id === target.id) continue
    const iv = toInterval(e)
    if (!iv) continue // ολοήμερα εξαιρούνται
    if (overlaps(ti, iv)) out.push(e)
  }
  return out
}

// Όλα τα (merged, ταξινομημένα) διαστήματα απασχόλησης χρονισμένων μη-ακυρωμένων
// γεγονότων της ημέρας. Συγχωνεύει επικαλυπτόμενα ΚΑΙ εφαπτόμενα διαστήματα.
export function busyIntervalsForDay(events: BusyEvent[], date: string): Interval[] {
  if (!Array.isArray(events)) return []
  const ivs: Interval[] = []
  for (const e of events) {
    if (!e || e.date !== date) continue
    const iv = toInterval(e)
    if (iv) ivs.push(iv)
  }
  ivs.sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Interval[] = []
  for (const iv of ivs) {
    const last = merged[merged.length - 1]
    // Συγχώνευση όταν επικαλύπτονται ή αγγίζονται (last.end >= iv.start).
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end
    } else {
      merged.push({ start: iv.start, end: iv.end })
    }
  }
  return merged
}

// Εύρεση ελεύθερων παραθύρων διάρκειας durationMinutes μέσα στο ωράριο εργασίας.
// Ολισθαίνει παράθυρο από workStart έως workEnd σε βήματα stepMin· ένα slot
// [s, s+dur) είναι ελεύθερο αν χωράει στο [workStart,workEnd] και δεν επικαλύπτει
// κανένα busy διάστημα.
export function findFreeSlots(
  events: BusyEvent[],
  date: string,
  durationMinutes: number,
  workStartMin = 540,   // 09:00
  workEndMin = 1260,    // 21:00
  stepMin = 30,
): Interval[] {
  const dur = typeof durationMinutes === 'number' && durationMinutes > 0 ? durationMinutes : 0
  if (!dur) return []
  if (typeof workStartMin !== 'number' || typeof workEndMin !== 'number') return []
  if (typeof stepMin !== 'number' || stepMin <= 0) return []
  if (workEndMin - workStartMin < dur) return []
  const busy = busyIntervalsForDay(events, date)
  const slots: Interval[] = []
  for (let s = workStartMin; s + dur <= workEndMin; s += stepMin) {
    const slot: Interval = { start: s, end: s + dur }
    let free = true
    for (const b of busy) {
      if (overlaps(slot, b)) { free = false; break }
    }
    if (free) slots.push(slot)
  }
  return slots
}

// Μορφοποίηση διαστήματος → «HH:MM–HH:MM».
export function fmtInterval(iv: Interval): string {
  if (!iv) return ''
  const fmt = (min: number) => `${pad(Math.floor(min / 60))}:${pad(((min % 60) + 60) % 60)}`
  return `${fmt(iv.start)}–${fmt(iv.end)}`
}
