// Φορολογικό ημερολόγιο ακινήτων (Ελλάδα) — ΠΡΑΓΜΑΤΙΚΕΣ, θεσμοθετημένες
// υποχρεώσεις που ορίζει το κράτος, ΟΧΙ εικασίες. Παράγει δατοποιημένα γεγονότα
// ανά φορολογικό έτος και ανά τύπο ακινήτου (ιδιοκατοίκηση / μακροχρόνια /
// βραχυχρόνια). Κάθε υποχρέωση φέρει:
//   • confidence: 'statutory' (σταθερή προθεσμία νόμου) | 'announced' (ανακοινώνεται
//     ετησίως — τυπική/εκτιμώμενη ημερομηνία, ο χρήστης επιβεβαιώνει στην πηγή)
//   • official_url + πηγή διπλού ελέγχου (myAADE + taxheaven)
// Οι προθεσμίες που πέφτουν σε αργία/Σαββατοκύριακο μετατίθενται στην επόμενη
// εργάσιμη (άρθρο περί διοικητικών προθεσμιών).
import { isNonWorkingDay } from '../calendar/greekHolidays'

export type PropertyTaxProfile = 'owner' | 'long_term' | 'short_term'

export interface TaxObligation {
  id: string
  date: string                          // YYYY-MM-DD (προσαρμοσμένη σε εργάσιμη)
  title: string
  notes: string
  category: 'tax'
  confidence: 'statutory' | 'announced'
  official_url: string
  profiles: PropertyTaxProfile[]
}

export const AADE_CALENDAR_URL = 'https://www.aade.gr/eforologiko-imerologio'
export const TAXHEAVEN_CALENDAR_URL = 'https://www.taxheaven.gr/calendar'
const CONFIRM = `Επιβεβαίωσε την ακριβή ημερομηνία στο myAADE (${AADE_CALENDAR_URL}) και στο ${TAXHEAVEN_CALENDAR_URL}.`

function iso(y: number, mIndex0: number, day: number): string {
  return `${y}-${String(mIndex0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function daysInMonth(y: number, mIndex0: number): number { return new Date(y, mIndex0 + 1, 0).getDate() }
function addDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const nd = new Date(Date.UTC(y, m - 1, d + 1))
  return `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, '0')}-${String(nd.getUTCDate()).padStart(2, '0')}`
}

// Μετάθεση προθεσμίας στην επόμενη εργάσιμη αν πέφτει σε αργία/ΣΚ.
export function nextWorkingDay(dateStr: string): string {
  let d = dateStr, guard = 0
  while (isNonWorkingDay(d) && guard++ < 14) d = addDay(d)
  return d
}
// Τελευταία εργάσιμη ημέρα του μήνα (για δόσεις που λήγουν «τέλος μήνα»).
export function lastWorkingDayOfMonth(y: number, mIndex0: number): string {
  let day = daysInMonth(y, mIndex0)
  let d = iso(y, mIndex0, day)
  let guard = 0
  while (isNonWorkingDay(d) && guard++ < 14) { day--; d = iso(y, mIndex0, day) }
  return d
}

// Οι υποχρεώσεις που ισχύουν για ΟΛΟΥΣ τους ιδιοκτήτες ακινήτων, ανά έτος.
function ownerObligations(year: number): TaxObligation[] {
  const out: TaxObligation[] = []

  // ── ΕΝΦΙΑ: ετήσιος φόρος κατοχής ακινήτων. Εκκαθαριστικό εκδίδεται συνήθως
  // Απρίλιο/Μάιο, πληρωμή σε μηνιαίες δόσεις (τελευταία εργάσιμη κάθε μήνα) έως
  // τον Φεβρουάριο του επόμενου έτους. Οι ακριβείς ημερομηνίες ανακοινώνονται.
  out.push({
    id: `enfia-issue-${year}`, date: nextWorkingDay(iso(year, 4, 1)), // ~αρχές Μαΐου
    title: 'ΕΝΦΙΑ, έκδοση εκκαθαριστικού (αναμένεται)',
    notes: `Ο ΕΝΦΙΑ (Ενιαίος Φόρος Ιδιοκτησίας Ακινήτων) εκκαθαρίζεται συνήθως Απρίλιο–Μάιο και πληρώνεται σε μηνιαίες δόσεις έως τον Φεβρουάριο. ${CONFIRM}`,
    category: 'tax', confidence: 'announced', official_url: AADE_CALENDAR_URL, profiles: ['owner', 'long_term', 'short_term'],
  })
  out.push({
    id: `enfia-first-${year}`, date: lastWorkingDayOfMonth(year, 4), // τέλος Μαΐου
    title: 'ΕΝΦΙΑ, 1η δόση',
    notes: `Καταληκτική 1ης δόσης ΕΝΦΙΑ (τυπικά τέλος Μαΐου). Ακολουθούν μηνιαίες δόσεις έως τον Φεβρουάριο. ${CONFIRM}`,
    category: 'tax', confidence: 'announced', official_url: AADE_CALENDAR_URL, profiles: ['owner', 'long_term', 'short_term'],
  })
  out.push({
    id: `enfia-last-${year}`, date: lastWorkingDayOfMonth(year + 1, 1), // τέλος Φεβρουαρίου επόμενου έτους
    title: 'ΕΝΦΙΑ, τελευταία δόση',
    notes: `Καταληκτική τελευταίας δόσης ΕΝΦΙΑ (τυπικά τελευταία εργάσιμη Φεβρουαρίου του επόμενου έτους). ${CONFIRM}`,
    category: 'tax', confidence: 'announced', official_url: AADE_CALENDAR_URL, profiles: ['owner', 'long_term', 'short_term'],
  })

  // ── Ε9: Δήλωση στοιχείων ακινήτων για μεταβολές (αγορά/πώληση/μεταβίβαση/
  // τακτοποίηση) του προηγούμενου έτους — καταληκτική 31 Μαρτίου.
  out.push({
    id: `e9-${year}`, date: nextWorkingDay(iso(year, 2, 31)),
    title: 'Ε9, δήλωση μεταβολών ακινήτων',
    notes: `Υποβολή Ε9 για μεταβολές ακινήτων του προηγούμενου έτους (αγορά, πώληση, μεταβίβαση, κληρονομιά). Καταληκτική τυπικά 31 Μαρτίου. Αν δεν είχες μεταβολή, δεν απαιτείται. ${CONFIRM}`,
    category: 'tax', confidence: 'statutory', official_url: AADE_CALENDAR_URL, profiles: ['owner', 'long_term', 'short_term'],
  })

  // ── Δήλωση Φορολογίας Εισοδήματος (Ε1) με έντυπο Ε2 για εισόδημα από ακίνητα —
  // καταληκτική τυπικά 30 Ιουνίου (δίνονται συχνά παρατάσεις).
  out.push({
    id: `income-decl-${year}`, date: nextWorkingDay(iso(year, 5, 30)),
    title: 'Δήλωση εισοδήματος (Ε1/Ε2 ακινήτων)',
    notes: `Καταληκτική υποβολής δήλωσης φορολογίας εισοδήματος (Ε1). Το εισόδημα από εκμίσθωση/ιδιοχρησιμοποίηση ακινήτων δηλώνεται στο έντυπο Ε2. Τυπική προθεσμία 30 Ιουνίου — συχνά δίνεται παράταση. ${CONFIRM}`,
    category: 'tax', confidence: 'statutory', official_url: AADE_CALENDAR_URL, profiles: ['owner', 'long_term', 'short_term'],
  })

  return out
}

// Επιπλέον υποχρεώσεις για ΒΡΑΧΥΧΡΟΝΙΑ μίσθωση (Airbnb/Booking).
function shortTermObligations(year: number): TaxObligation[] {
  const out: TaxObligation[] = []
  for (let m = 0; m < 12; m++) {
    // Δήλωση Βραχυχρόνιας Διαμονής στο «Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής»
    // της ΑΑΔΕ: υποβάλλεται έως την 20ή του επόμενου μήνα από την αναχώρηση.
    out.push({
      id: `str-registry-${year}-${m + 1}`, date: nextWorkingDay(iso(year, m, 20)),
      title: 'Δήλωση βραχυχρόνιας διαμονής (Μητρώο ΑΑΔΕ)',
      notes: `Υποβολή Δήλωσης Βραχυχρόνιας Διαμονής για τις αναχωρήσεις του προηγούμενου μήνα, έως την 20ή. ${CONFIRM}`,
      category: 'tax', confidence: 'statutory', official_url: AADE_CALENDAR_URL, profiles: ['short_term'],
    })
    // Τέλος ανθεκτικότητας στην κλιματική κρίση (πρώην φόρος διαμονής): μηνιαία
    // απόδοση από τον εκμεταλλευτή, έως το τέλος του επόμενου μήνα.
    out.push({
      id: `str-climate-fee-${year}-${m + 1}`, date: lastWorkingDayOfMonth(year, m),
      title: 'Τέλος ανθεκτικότητας κλιματικής κρίσης, απόδοση',
      notes: `Μηνιαία απόδοση του τέλους ανθεκτικότητας στην κλιματική κρίση (τέλος διαμονής) που εισπράχθηκε από τους επισκέπτες, έως το τέλος του επόμενου μήνα. ${CONFIRM}`,
      category: 'tax', confidence: 'statutory', official_url: AADE_CALENDAR_URL, profiles: ['short_term'],
    })
  }
  return out
}

// Δημόσιο API: όλες οι φορολογικές υποχρεώσεις ακινήτου για το έτος & τον τύπο.
export function greekPropertyTaxObligations(year: number, profile: PropertyTaxProfile): TaxObligation[] {
  const all = [...ownerObligations(year), ...(profile === 'short_term' ? shortTermObligations(year) : [])]
  return all
    .filter((o) => o.profiles.includes(profile))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// Χαρτογράφηση σε γραμμή calendar_events (idempotent source: `tax:{id}`).
export function taxObligationToEvent(o: TaxObligation, propertyId: string, userId: string) {
  return {
    property_id: propertyId, user_id: userId, title: o.title, category: 'contract' as const,
    event_date: o.date, amount: null, priority: 'high' as const, status: 'pending' as const,
    recurring: false, recurring_interval: null, notes: o.notes, source: `tax:${o.id}`,
  }
}
