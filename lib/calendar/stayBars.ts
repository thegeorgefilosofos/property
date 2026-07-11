// Γεωμετρία «μπάρας διαμονής» για βραχυχρόνιες κρατήσεις στην προβολή Μήνα:
// κάθε κράτηση απλώνεται συνεχόμενα από την άφιξη ως την αναχώρηση. Επειδή τα
// κελιά του μήνα είναι ίσου πλάτους και εφαπτόμενα, ζωγραφίζουμε ένα τμήμα ανά
// ημέρα με σωστή στρογγύλεψη στα άκρα — φαίνεται σαν μία ενιαία μπάρα.
// Καθαρές συναρτήσεις (χωρίς DOM) ώστε να δοκιμάζονται ντετερμινιστικά.
import { guestLabel, channelLabel } from './bookingEvents'

export interface StaySpan {
  id: string
  guest: string
  start: string          // YYYY-MM-DD (check-in)
  end: string            // YYYY-MM-DD (check-out ή = start)
  channel?: string | null
  total?: number | null
}

// Από γραμμή client_stays (με clients.full_name join) σε StaySpan.
export function toStaySpan(row: {
  id: string; check_in: string; check_out?: string | null; total?: number | null
  channel?: string | null; guest_name?: string | null
}): StaySpan | null {
  if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(row.check_in)) return null
  const end = row.check_out && /^\d{4}-\d{2}-\d{2}$/.test(row.check_out) ? row.check_out : row.check_in
  return {
    id: row.id,
    guest: guestLabel({ id: row.id, check_in: row.check_in, channel: row.channel, guest_name: row.guest_name }),
    start: row.check_in,
    end: end < row.check_in ? row.check_in : end,
    channel: row.channel ?? null,
    total: row.total ?? null,
  }
}

// Κρατήσεις που «αγγίζουν» μια ημέρα (άφιξη ≤ ημέρα ≤ αναχώρηση). Σταθερή σειρά
// (κατά άφιξη) ώστε η στοίβαξη πολλαπλών μπαρών να μένει σταθερή μεταξύ κελιών.
export function staysOnDay(stays: StaySpan[], dateStr: string): StaySpan[] {
  return (stays || [])
    .filter((s) => s && s.start <= dateStr && dateStr <= s.end)
    .sort((a, b) => (a.start === b.start ? a.id.localeCompare(b.id) : a.start.localeCompare(b.start)))
}

// Χαρακτηριστικά τμήματος για ένα κελί: στρογγύλεψη στα άκρα της κράτησης ή στα
// άκρα της γραμμής (Κυρ=0 αριστερά, Σαβ=6 δεξιά)· ετικέτα μόνο στην αρχή ή όταν
// συνεχίζεται σε νέα εβδομάδα (col 0), για να μη διαβάζεται δύο φορές το όνομα.
export function segMeta(stay: StaySpan, dateStr: string, col: number): {
  isStart: boolean; isEnd: boolean; roundLeft: boolean; roundRight: boolean; showLabel: boolean
} {
  const isStart = dateStr === stay.start
  const isEnd = dateStr === stay.end
  return {
    isStart, isEnd,
    roundLeft: isStart || col === 0,
    roundRight: isEnd || col === 6,
    showLabel: isStart || col === 0,
  }
}

// Ετικέτα μπάρας: όνομα + (προαιρετικά) κανάλι όταν χωράει.
export function barLabel(stay: StaySpan): string {
  return stay.guest
}

export { channelLabel }
