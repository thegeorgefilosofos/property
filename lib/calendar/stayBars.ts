// Γεωμετρία «μπάρας διαμονής» για βραχυχρόνιες κρατήσεις στην προβολή Μήνα:
// κάθε κράτηση απλώνεται συνεχόμενα από την άφιξη ως την αναχώρηση. Επειδή τα
// κελιά του μήνα είναι ίσου πλάτους και εφαπτόμενα, ζωγραφίζουμε ένα τμήμα ανά
// ημέρα με σωστή στρογγύλεψη στα άκρα — φαίνεται σαν μία ενιαία μπάρα.
// Καθαρές συναρτήσεις (χωρίς DOM) ώστε να δοκιμάζονται ντετερμινιστικά.
import { guestLabel, channelLabel } from './bookingEvents'
import { nightsBetween } from '@/lib/core/greek'

export interface StaySpan {
  id: string
  guest: string
  start: string          // YYYY-MM-DD (check-in)
  end: string            // YYYY-MM-DD (check-out ή = start, όταν λείπει)
  /** Καταχωρημένη αναχώρηση. false ⇒ το `end` είναι ΓΕΜΙΣΜΑ, όχι δεδομένο. */
  endKnown: boolean
  channel?: string | null
  total?: number | null
}

// Από γραμμή client_stays (με clients.full_name join) σε StaySpan.
export function toStaySpan(row: {
  id: string; check_in: string; check_out?: string | null; total?: number | null
  channel?: string | null; guest_name?: string | null
}): StaySpan | null {
  if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(row.check_in)) return null
  // ΤΟ ΓΕΜΙΣΜΑ ΔΗΛΩΝΕΤΑΙ. Οταν λείπει η αναχώρηση, το `end` γίνεται ίσο με την
  // άφιξη ΓΙΑ ΝΑ ΖΩΓΡΑΦΙΣΤΕΙ ΚΑΤΙ — δεν σημαίνει «αυθημερόν». Χωρίς αυτή τη
  // σημαία, τα δύο σενάρια είναι δυσδιάκριτα κατάντη και η μπάρα κατέληγε να
  // γράφει «1 νύχτα» για διαμονή που κανείς δεν ξέρει πόσο κράτησε.
  const hasOut = !!row.check_out && /^\d{4}-\d{2}-\d{2}$/.test(row.check_out)
  const end = hasOut ? (row.check_out as string) : row.check_in
  return {
    id: row.id,
    guest: guestLabel({ id: row.id, check_in: row.check_in, channel: row.channel, guest_name: row.guest_name }),
    start: row.check_in,
    end: end < row.check_in ? row.check_in : end,
    endKnown: hasOut && end >= row.check_in,
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

// ═══════════════════════════════════════════════════════════════════════════
// Η ΚΡΑΤΗΣΗ ΕΙΝΑΙ ΕΝΑ ΣΤΟΙΧΕΙΟ, ΟΧΙ ΕΠΤΑ ΚΟΜΜΑΤΙΑ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΙΣΧΥΕ ΚΑΙ ΓΙΑΤΙ ΦΑΙΝΟΤΑΝ ΣΠΑΣΜΕΝΟ. Η προηγούμενη γραφή ζωγράφιζε ένα
// τμήμα ΑΝΑ ΚΕΛΙ και έλπιζε ότι τα εφτά τμήματα θα διαβάζονταν ως μία μπάρα.
// Δεν διαβάζονταν, για λόγο μηχανικό: το τμήμα ζούσε μέσα σε `Tooltip`, που
// αποδίδεται ως `display:inline-flex`, άρα το τμήμα γινόταν ΣΤΟΙΧΕΙΟ ΕΥΕΛΙΚΤΟΥ
// ΔΟΧΕΙΟΥ και έπαιρνε το πλάτος του ΠΕΡΙΕΧΟΜΕΝΟΥ του:
//
//   ημέρα άφιξης      έχει ετικέτα  →  πλάτος όσο το όνομα, κομμένο στο κελί
//   ενδιάμεσες ημέρες καμία ετικέτα →  πλάτος ΜΗΔΕΝ, δηλαδή αόρατες
//   ημέρα αναχώρησης  μόνο padding  →  πλάτος 6 εικονοστοιχείων, μια γραμμούλα
//
// Ακριβώς αυτό δείχνει η οθόνη: ένα χάπι με κομμένο όνομα, τρία κενά κελιά και
// μια κόκκινη γραμμούλα στο τέλος. Δεν ήταν αισθητικό λάθος· ήταν λάθος
// μοντέλου. Μια κράτηση τεσσάρων νυχτών ΕΙΝΑΙ ένα πράγμα και πρέπει να είναι
// ένα στοιχείο, με το όνομα γραμμένο ΜΙΑ φορά μέσα σε ολόκληρο το πλάτος του.
//
// ΤΙ ΚΑΝΕΙ Η ΝΕΑ ΓΕΩΜΕΤΡΙΑ. Για κάθε εβδομάδα του μήνα υπολογίζει, για κάθε
// κράτηση που την αγγίζει, ΜΙΑ λωρίδα: από ποια στήλη ξεκινά, πόσες στήλες
// πιάνει, σε ποια σειρά (lane) κάθεται ώστε να μη συγκρούεται με άλλη και αν
// συνεχίζεται πριν ή μετά την εβδομάδα. Η οθόνη τη ζωγραφίζει ως ΕΝΑ απόλυτα
// τοποθετημένο στοιχείο πάνω από τα κελιά.
//
// ΓΙΑΤΙ ΑΝΑ ΕΒΔΟΜΑΔΑ ΚΑΙ ΟΧΙ ΑΝΑ ΜΗΝΑ: το πλέγμα σπάει σε γραμμή κάθε επτά
// ημέρες. Μια μπάρα που περνά από Κυριακή σε Δευτέρα δεν είναι συνεχής στην
// οθόνη — είναι δύο λωρίδες και το λέει με ίσιο άκρο αντί για στρογγυλό.
// ═══════════════════════════════════════════════════════════════════════════

export interface WeekSegment {
  stay: StaySpan
  /** Στήλη έναρξης μέσα στην εβδομάδα, 0 ώς 6. */
  startCol: number
  /** Πόσες στήλες πιάνει, 1 ώς 7. */
  span: number
  /** Σε ποια σειρά κάθεται, ώστε δύο κρατήσεις να μη γράφονται η μία πάνω στην άλλη. */
  lane: number
  /** Ξεκίνησε πριν από αυτή την εβδομάδα (ίσιο άκρο αριστερά). */
  openLeft: boolean
  /** Συνεχίζεται μετά από αυτή την εβδομάδα (ίσιο άκρο δεξιά). */
  openRight: boolean
  /** Νύχτες ΟΛΗΣ της κράτησης, όχι του τμήματος: η ετικέτα λέει την κράτηση. */
  /** Νύχτες, ή `null` όταν δεν έχει καταχωρηθεί αναχώρηση (δες `stayNights`). */
  nights: number | null
}

const dayNum = (iso: string): number =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000

/**
 * Νύχτες της διαμονής, ή `null` όταν δεν έχει καταχωρηθεί αναχώρηση.
 *
 * ΗΤΑΝ ΔΕΥΤΕΡΟΣ ΟΡΙΣΜΟΣ ΜΕ ΤΟ ΙΔΙΟ ΟΝΟΜΑ. Υπάρχει ήδη `stayNights` στο
 * lib/clients/clients.ts (= `nightsBetween`, η δηλωμένη πηγή του
 * guard-single-source) και εκείνος επιστρέφει 0 όπου αυτός επέστρεφε 1.
 * Δύο συναρτήσεις με ένα όνομα και διαφορετική απάντηση είναι το ακριβώς
 * χειρότερο: ο αναγνώστης δεν έχει λόγο να υποψιαστεί ποια καλεί.
 *
 * ΚΑΙ ΤΟ `Math.max(1, …)` ΔΕΝ ΗΤΑΝ ΣΤΡΟΓΓΥΛΕΨΗ, ΗΤΑΝ ΚΑΛΥΨΗ. Το `end`
 * ισούται με το `start` σε ΔΥΟ περιπτώσεις: αυθημερόν αναχώρηση και
 * αναχώρηση που δεν καταχωρήθηκε ποτέ. Η δεύτερη είναι η συνηθισμένη και το
 * ταβάνι την τύπωνε ως «1 νύχτα» — νούμερο που κανείς δεν μέτρησε.
 *
 * Το ΠΛΑΤΟΣ της μπάρας δεν εξαρτάται από εδώ: το `span` έχει το δικό του
 * `Math.max(1, …)`, γιατί μια μπάρα οφείλει να πιάνει τουλάχιστον ένα κελί.
 * Αυτό εδώ είναι μόνο η ΕΤΙΚΕΤΑ και η ετικέτα λέει την αλήθεια.
 */
export function stayNights(stay: StaySpan): number | null {
  return stay.endKnown ? nightsBetween(stay.start, stay.end) : null
}

/**
 * Οι λωρίδες μιας εβδομάδας.
 *
 * `weekDates` είναι επτά θέσεις· `null` όπου το κελί ανήκει σε άλλον μήνα. Οι
 * κενές θέσεις ΔΕΝ σπάνε τη λωρίδα: μια κράτηση που ξεκινά στις 31 του
 * προηγούμενου μήνα και τελειώνει στις 2 απλώς αρχίζει από την πρώτη
 * πραγματική στήλη, με ίσιο άκρο που λέει «έρχεται από πριν».
 */
export function weekSegments(stays: StaySpan[], weekDates: (string | null)[]): {
  segments: WeekSegment[]; lanes: number
} {
  const real = weekDates.map((d, i) => ({ d, i })).filter((x): x is { d: string; i: number } => !!x.d)
  if (!real.length || !stays?.length) return { segments: [], lanes: 0 }
  const first = real[0].d, last = real[real.length - 1].d

  const touching = stays
    .filter(s => s && s.start <= last && s.end >= first)
    // Σταθερή σειρά: πρώτα η παλαιότερη άφιξη, μετά η μεγαλύτερη διάρκεια, μετά
    // το αναγνωριστικό. Χωρίς αυτό, οι σειρές θα χοροπηδούσαν σε κάθε απόδοση.
    .sort((a, b) =>
      a.start === b.start
        ? (a.end === b.end ? a.id.localeCompare(b.id) : b.end.localeCompare(a.end))
        : a.start.localeCompare(b.start))

  // Ποιες στήλες ΕΙΝΑΙ ΗΔΗ πιασμένες σε κάθε σειρά.
  const taken: boolean[][] = []
  const segments: WeekSegment[] = []

  for (const stay of touching) {
    const from = real.find(x => x.d >= stay.start) ?? real[0]
    const toArr = real.filter(x => x.d <= stay.end)
    const to = toArr.length ? toArr[toArr.length - 1] : real[0]
    const startCol = from.i
    const span = Math.max(1, to.i - startCol + 1)

    let lane = 0
    for (;;) {
      if (!taken[lane]) taken[lane] = new Array(7).fill(false)
      let free = true
      for (let c = startCol; c < startCol + span; c++) if (taken[lane][c]) { free = false; break }
      if (free) break
      lane++
    }
    for (let c = startCol; c < startCol + span; c++) taken[lane][c] = true

    segments.push({
      stay, startCol, span, lane,
      openLeft: stay.start < first,
      openRight: stay.end > last,
      nights: stayNights(stay),
    })
  }

  return { segments, lanes: taken.length }
}

// Ετικέτα μπάρας: όνομα + (προαιρετικά) κανάλι όταν χωράει.

// Χρωματική διάκριση ανά κανάλι. Η ΑΠΟΧΡΩΣΗ είναι πληροφορία (από πού ήρθε η
// κράτηση)· η ΕΝΤΑΣΗ ανήκει στο θέμα. Γι' αυτό εδώ δεν γράφονται τιμές αλλά
// μεταβλητές: το app/globals.css τις ορίζει δύο φορές, βαθιές για το φωτεινό
// και παστέλ για το σκούρο, ώστε το κοινό μελάνι `--on-tone` να διαβάζεται και
// στις δύο περιπτώσεις. Με καρφωτά τα επίσημα χρώματα των πλατφορμών, το όνομα
// του επισκέπτη μετρούσε 3,05:1 — αδιάβαστο.
export const CHANNEL_COLORS: Record<string, { solid: string; label: string }> = {
  airbnb:  { solid: 'var(--ch-airbnb)',  label: 'Airbnb' },
  booking: { solid: 'var(--ch-booking)', label: 'Booking.com' },
  vrbo:    { solid: 'var(--ch-vrbo)',    label: 'Vrbo' },
}
export function channelColor(channel?: string | null): { solid: string; label: string } {
  return CHANNEL_COLORS[(channel || '').toLowerCase()] || { solid: 'var(--accent)', label: 'Κράτηση' }
}

export { channelLabel }
