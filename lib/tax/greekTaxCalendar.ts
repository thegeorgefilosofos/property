// Φορολογικό ημερολόγιο ακινήτων (Ελλάδα) — ΠΡΑΓΜΑΤΙΚΕΣ, θεσμοθετημένες
// υποχρεώσεις που ορίζει το κράτος, ΟΧΙ εικασίες. Παράγει δατοποιημένα γεγονότα
// ανά φορολογικό έτος και ανά τύπο ακινήτου (ιδιοκατοίκηση / μακροχρόνια /
// βραχυχρόνια). Κάθε υποχρέωση φέρει:
//   • confidence: 'statutory' (σταθερή προθεσμία νόμου) | 'announced' (ανακοινώνεται
//     ετησίως — τυπική/εκτιμώμενη ημερομηνία, ο χρήστης επιβεβαιώνει στην πηγή)
//   • official_url + πηγή διπλού ελέγχου (myAADE + taxheaven)
//   • who: ποιος κάνει την ενέργεια (τα ίδια τρία πρόσωπα με τον φάκελο του
//     λογιστή — lib/accounting/dossier.ts). Δεν ξαναγράφονται κανόνες εδώ: όπου
//     η υποχρέωση αντιστοιχεί σε παραστατικό του φακέλου, το `dossier` δείχνει
//     σε αυτό και το τεστ επαληθεύει ότι το `who` συμφωνεί.
// Οι προθεσμίες που πέφτουν σε αργία/Σαββατοκύριακο μετατίθενται στην επόμενη
// εργάσιμη (άρθρο περί διοικητικών προθεσμιών).
//
// ΜΙΑ ΠΗΓΗ, ΜΙΑ ΗΜΕΡΟΜΗΝΙΑ. Αυτό το αρχείο είναι ο ΜΟΝΟΣ τόπος όπου ζει θεσμική
// προθεσμία φορολογίας ακινήτων. Το `app/dashboard/components/obligations.ts`
// (Επισκόπηση) και το `TabCalendar.tsx` (Ημερολόγιο) διαβάζουν από εδώ, με το
// ίδιο κλειδί ταυτότητας γεγονότος (`taxEventSource`), ώστε η ίδια υποχρέωση να
// μην μπορεί να υπάρξει δύο φορές με δύο ημερομηνίες.
import { isNonWorkingDay } from '../calendar/greekHolidays'
import { readStatus, type StatusRow } from '../property/status'
import { WHO_LABEL, type Who } from '../accounting/dossier'

export type PropertyTaxProfile = 'owner' | 'long_term' | 'short_term'

/** Το ΕΙΔΟΣ της υποχρέωσης, ανεξάρτητο από έτος/μήνα. Το `id` είναι πάντα
 *  `${kind}-${έτος}` (ή `-${μήνας}` για τις μηνιαίες). Χρησιμεύει σε κάθε οθόνη
 *  που θέλει «μία γραμμή ανά υποχρέωση» και όχι δώδεκα ίδιες. */
export type TaxObligationKind =
  | 'enfia-issue' | 'enfia-first' | 'enfia-last'
  | 'e9' | 'income-decl'
  | 'str-registry' | 'str-climate-fee'

export interface TaxObligation {
  id: string
  kind: TaxObligationKind
  date: string                          // YYYY-MM-DD (προσαρμοσμένη σε εργάσιμη)
  title: string
  notes: string
  category: 'tax'
  confidence: 'statutory' | 'announced'
  official_url: string
  profiles: PropertyTaxProfile[]
  /** Ποιος κάνει την ενέργεια. Ίδιο λεξιλόγιο με τον φάκελο του λογιστή. */
  who: Who
  /** Το παραστατικό του φακέλου (lib/accounting/dossier.ts) από το οποίο
   *  κληρονομείται το `who`. Κενό όπου ο φάκελος δεν έχει αντίστοιχο. */
  dossier?: string
}

export const AADE_CALENDAR_URL = 'https://www.aade.gr/eforologiko-imerologio'
export const TAXHEAVEN_CALENDAR_URL = 'https://www.taxheaven.gr/calendar'
const CONFIRM = `Επιβεβαίωσε την ακριβή ημερομηνία στο myAADE (${AADE_CALENDAR_URL}) και στο ${TAXHEAVEN_CALENDAR_URL}.`

// ── Το κλειδί ταυτότητας του γεγονότος ──────────────────────────────────────
// ΚΑΘΕ σημείο της εφαρμογής που γράφει φορολογική προθεσμία στο `calendar_events`
// χρησιμοποιεί ΑΥΤΟ το σχήμα στη στήλη `source`. Δεύτερο πάτημα → ίδιο κλειδί →
// αντικατάσταση, όχι δεύτερη εγγραφή δύο μήνες μακριά.
export const TAX_SOURCE_PREFIX = 'tax:'
export const taxEventSource = (id: string): string => `${TAX_SOURCE_PREFIX}${id}`
export const isTaxEventSource = (source?: string | null): boolean =>
  !!source && source.startsWith(TAX_SOURCE_PREFIX)

export const TAX_KINDS: readonly TaxObligationKind[] = [
  'enfia-issue', 'enfia-first', 'enfia-last', 'e9', 'income-decl', 'str-registry', 'str-climate-fee',
]

/**
 * Το ΕΙΔΟΣ της υποχρέωσης από το κλειδί του γεγονότος.
 *
 * Το `id` είναι πάντα `${kind}-${έτος}` (ή `-${μήνας}` για τις μηνιαίες), άρα ένα
 * γεγονός ΟΠΟΙΟΥΔΗΠΟΤΕ έτους μπορεί να πει ποιος το κάνει και πόσο σίγουρη είναι η
 * ημερομηνία, χωρίς δεύτερο πίνακα και χωρίς να αποθηκευτεί τίποτα παραπάνω στη βάση.
 */
export function taxKindOfEventSource(source?: string | null): TaxObligationKind | null {
  if (!isTaxEventSource(source)) return null
  const kind = (source as string).slice(TAX_SOURCE_PREFIX.length).replace(/-\d{4}(-\d{1,2})?$/, '')
  return TAX_KINDS.includes(kind as TaxObligationKind) ? (kind as TaxObligationKind) : null
}

/** Μία αντιπροσωπευτική υποχρέωση ανά είδος. Τα πεδία που χρησιμοποιεί η οθόνη
 *  (`who`, `confidence`, `title`, `official_url`) δεν εξαρτώνται από το έτος. */
export function taxKindMeta(year: number): Record<TaxObligationKind, TaxObligation> {
  const m = {} as Record<TaxObligationKind, TaxObligation>
  for (const o of greekPropertyTaxObligations(year, 'short_term')) if (!m[o.kind]) m[o.kind] = o
  return m
}

/** Η κατηγορία του γεγονότος στο ημερολόγιο. Οι φορολογικές προθεσμίες ΔΕΝ
 *  είναι «συμβόλαια»: με δική τους κατηγορία το φίλτρο μπορεί να τις απομονώσει. */
export const TAX_EVENT_CATEGORY = 'tax' as const

/** Πόσο σίγουρη είναι η ημερομηνία, στη γλώσσα του χρήστη. Ίδιες λέξεις σε κάθε
 *  οθόνη — Επισκόπηση και Ημερολόγιο. */
export const CONFIDENCE_LABEL: Record<TaxObligation['confidence'], string> = {
  statutory: 'Ημερομηνία του νόμου',
  announced: 'Περσινή ημερομηνία, επιβεβαίωσέ την',
}

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
  // `who`: ο φάκελος έχει το «Εκκαθαριστικό ΕΝΦΙΑ» ως δικό του (dossier: enfia).
  out.push({
    kind: 'enfia-issue', id: `enfia-issue-${year}`, date: nextWorkingDay(iso(year, 2, 15)), // ~μέσα Μαρτίου (2026: 15/3)
    title: 'ΕΝΦΙΑ, έκδοση εκκαθαριστικού (αναμένεται)',
    notes: `Ο ΕΝΦΙΑ (Ενιαίος Φόρος Ιδιοκτησίας Ακινήτων) εκκαθαρίζεται πλέον νωρίτερα (τα τελευταία έτη ~μέσα Μαρτίου) και πληρώνεται εφάπαξ ή σε 12 μηνιαίες δόσεις έως τον Φεβρουάριο του επόμενου έτους. ${CONFIRM}`,
    category: 'tax', confidence: 'announced', official_url: AADE_CALENDAR_URL, profiles: ['owner', 'long_term', 'short_term'],
    who: 'owner', dossier: 'enfia',
  })
  out.push({
    kind: 'enfia-first', id: `enfia-first-${year}`, date: lastWorkingDayOfMonth(year, 2), // τέλος Μαρτίου
    title: 'ΕΝΦΙΑ, 1η δόση',
    notes: `Καταληκτική 1ης δόσης ΕΝΦΙΑ (τα τελευταία έτη τέλος Μαρτίου). Ακολουθούν έως 12 μηνιαίες δόσεις έως τον Φεβρουάριο του επόμενου έτους. ${CONFIRM}`,
    category: 'tax', confidence: 'announced', official_url: AADE_CALENDAR_URL, profiles: ['owner', 'long_term', 'short_term'],
    who: 'owner', dossier: 'enfia',
  })
  out.push({
    kind: 'enfia-last', id: `enfia-last-${year}`, date: lastWorkingDayOfMonth(year + 1, 1), // τέλος Φεβρουαρίου επόμενου έτους
    title: 'ΕΝΦΙΑ, τελευταία δόση',
    notes: `Καταληκτική τελευταίας δόσης ΕΝΦΙΑ (τυπικά τελευταία εργάσιμη Φεβρουαρίου του επόμενου έτους, 12η δόση). ${CONFIRM}`,
    category: 'tax', confidence: 'announced', official_url: AADE_CALENDAR_URL, profiles: ['owner', 'long_term', 'short_term'],
    who: 'owner', dossier: 'enfia',
  })

  // ── Ε9: Δήλωση στοιχείων ακινήτων για μεταβολές (αγορά/πώληση/μεταβίβαση/
  // τακτοποίηση). Η νόμιμη προθεσμία είναι 30 ημέρες από κάθε μεταβολή (άρθρο 6
  // §3 ν.4223/2013)· εδώ μπαίνει ετήσια υπενθύμιση ελέγχου πριν την έκδοση ΕΝΦΙΑ.
  // Τελευταία εργάσιμη Φεβρουαρίου, ΟΧΙ «28 Φεβρουαρίου + μετάθεση»: η μετάθεση
  // έσπρωχνε την υπενθύμιση στην 1η Μαρτίου όταν η 28η έπεφτε Κυριακή — δηλαδή
  // στον μήνα της έκδοσης που υποτίθεται ότι προλαβαίνει.
  out.push({
    kind: 'e9', id: `e9-${year}`, date: lastWorkingDayOfMonth(year, 1),
    title: 'Ε9, έλεγχος/δήλωση μεταβολών ακινήτων',
    notes: `Έλεγξε ότι έχεις δηλώσει στο Ε9 κάθε μεταβολή ακινήτου (αγορά, πώληση, μεταβίβαση, κληρονομιά). Η νόμιμη προθεσμία είναι 30 ημέρες από την ίδια τη μεταβολή — τακτοποίησε το πριν την έκδοση του ΕΝΦΙΑ. Αν δεν είχες μεταβολή, δεν απαιτείται. ${CONFIRM}`,
    category: 'tax', confidence: 'announced', official_url: AADE_CALENDAR_URL, profiles: ['owner', 'long_term', 'short_term'],
    who: 'accountant', dossier: 'e9',
  })

  // ── Δήλωση Φορολογίας Εισοδήματος (Ε1) με έντυπο Ε2 για εισόδημα από ακίνητα —
  // καταληκτική τα τελευταία έτη 15 Ιουλίου (με έκπτωση για εμπρόθεσμη υποβολή).
  // `who`: η ΥΠΟΒΟΛΗ της δήλωσης δεν είναι παραστατικό του φακέλου (ο φάκελος
  // παρακολουθεί το Ε2 που τη συνοδεύει, και το ετοιμάζει το app). Ακολουθεί το
  // ίδιο πρόσωπο με κάθε άλλη δήλωση του φακέλου: τον λογιστή. Χωρίς `dossier`,
  // γιατί δεν αντιστοιχεί σε γραμμή του καταλόγου παραστατικών.
  out.push({
    kind: 'income-decl', id: `income-decl-${year}`, date: nextWorkingDay(iso(year, 6, 15)),
    title: 'Δήλωση εισοδήματος (Ε1/Ε2 ακινήτων)',
    notes: `Καταληκτική υποβολής δήλωσης φορολογίας εισοδήματος (Ε1). Το εισόδημα από εκμίσθωση/ιδιοχρησιμοποίηση ακινήτων δηλώνεται στο έντυπο Ε2. Τα τελευταία έτη η προθεσμία είναι 15 Ιουλίου, με έκπτωση φόρου για εμπρόθεσμη υποβολή/εφάπαξ εξόφληση και δυνατότητα καταβολής σε έως 8 δόσεις. ${CONFIRM}`,
    category: 'tax', confidence: 'announced', official_url: AADE_CALENDAR_URL, profiles: ['owner', 'long_term', 'short_term'],
    who: 'accountant',
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
      kind: 'str-registry', id: `str-registry-${year}-${m + 1}`, date: nextWorkingDay(iso(year, m, 20)),
      title: 'Δήλωση βραχυχρόνιας διαμονής (Μητρώο ΑΑΔΕ)',
      notes: `Υποβολή Δήλωσης Βραχυχρόνιας Διαμονής για τις αναχωρήσεις του προηγούμενου μήνα, έως την 20ή. ${CONFIRM}`,
      category: 'tax', confidence: 'statutory', official_url: AADE_CALENDAR_URL, profiles: ['short_term'],
      who: 'owner', dossier: 'short_stays',
    })
    // Τέλος ανθεκτικότητας στην κλιματική κρίση (πρώην φόρος διαμονής): μηνιαία
    // απόδοση από τον εκμεταλλευτή, έως το τέλος του επόμενου μήνα.
    out.push({
      kind: 'str-climate-fee', id: `str-climate-fee-${year}-${m + 1}`, date: lastWorkingDayOfMonth(year, m),
      title: 'Τέλος ανθεκτικότητας κλιματικής κρίσης, απόδοση',
      notes: `Μηνιαία απόδοση του τέλους ανθεκτικότητας στην κλιματική κρίση (τέλος διαμονής) που εισπράχθηκε από τους επισκέπτες, έως το τέλος του επόμενου μήνα. ${CONFIRM}`,
      category: 'tax', confidence: 'statutory', official_url: AADE_CALENDAR_URL, profiles: ['short_term'],
      who: 'owner', dossier: 'climate_levy',
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

/**
 * Ο ΚΥΛΙΟΜΕΝΟΣ ΟΡΙΖΟΝΤΑΣ — ό,τι βλέπει ο χρήστης, όπου και να το δει.
 *
 * ΑΠΟ την 1η Ιανουαρίου του τρέχοντος έτους ΕΩΣ την έκδοση του επόμενου ΕΝΦΙΑ
 * (τέλος Μαρτίου του επόμενου έτους). Δύο πράγματα που αυτό διορθώνει:
 *  • Ο χρήστης του Δεκεμβρίου βλέπει την τελευταία δόση του ΕΝΦΙΑ, που πέφτει
 *    τον Φεβρουάριο του επόμενου έτους.
 *  • Ο χρήστης του Ιανουαρίου βλέπει την τελευταία δόση της ΠΕΡΣΙΝΗΣ
 *    εκκαθάρισης, που πέφτει μέσα σε αυτόν τον Φεβρουάριο. Πριν, εξαφανιζόταν:
 *    ανήκει στο περσινό φορολογικό έτος, και ο ορίζοντας ξεκινούσε από το φετινό.
 *
 * Ο κανόνας ζει ΕΔΩ και μόνο εδώ: Επισκόπηση, Ημερολόγιο και Εκκρεμότητες τον
 * καλούν, δεν τον αντιγράφουν. Αλλιώς οι οθόνες ξαναδιαφωνούν κάθε Ιανουάριο.
 */
export function taxObligationsHorizon(today: string, profile: PropertyTaxProfile): TaxObligation[] {
  const year = Number(today.slice(0, 4))
  if (!Number.isFinite(year)) return []
  const from = `${year}-01-01`, until = `${year + 1}-04-01`
  return [
    ...greekPropertyTaxObligations(year - 1, profile),
    ...greekPropertyTaxObligations(year, profile),
    ...greekPropertyTaxObligations(year + 1, profile),
  ].filter((o) => o.date >= from && o.date < until)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Το προφίλ φορολογικών υποχρεώσεων από την ΜΙΑ κατάσταση του ακινήτου
 * (lib/property/status.ts). Καμία δεύτερη ανάγνωση των στηλών της βάσης, καμία
 * δεύτερη ερμηνεία του `rental_mode`.
 */
export function taxProfileOf(row: StatusRow | null | undefined): PropertyTaxProfile {
  const s = readStatus(row)
  return s === 'rent_short' ? 'short_term' : s === 'rent_long' ? 'long_term' : 'owner'
}

/**
 * Χαρτογράφηση σε γραμμή `calendar_events`.
 *
 * ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΠΟΥ ΔΕΝ ΧΑΝΟΝΤΑΙ ΣΤΟ ΔΡΟΜΟ:
 *  • `category: 'tax'` — όχι 'contract'. Η υποχρέωση δηλώνει `category:'tax'`
 *    και το ημερολόγιο πρέπει να μπορεί να απομονώσει τις φορολογικές προθεσμίες
 *    με το φίλτρο κατηγορίας.
 *  • `priority` από το `confidence` — όχι όλα 'high'. Προθεσμία του νόμου
 *    (statutory) δεν μετακινείται· ανακοινωνόμενη (announced) μπορεί, άρα δεν
 *    ουρλιάζει με το ίδιο βάρος.
 *  • `who` μέσα στις σημειώσεις — ώστε να ταξιδεύει και στην εκτύπωση, στο .ics
 *    και στο Excel, όχι μόνο στην οθόνη.
 */
export function taxObligationToEvent(o: TaxObligation, propertyId: string, userId: string) {
  return {
    property_id: propertyId, user_id: userId, title: o.title,
    category: TAX_EVENT_CATEGORY,
    event_date: o.date, amount: null,
    priority: (o.confidence === 'statutory' ? 'high' : 'medium') as 'high' | 'medium',
    status: 'pending' as const,
    recurring: false, recurring_interval: null,
    notes: taxObligationNotes(o), source: taxEventSource(o.id),
  }
}

/** Οι σημειώσεις όπως αποθηκεύονται: το κείμενο της υποχρέωσης, ποιος την κάνει
 *  και πόσο σίγουρη είναι η ημερομηνία. Μία διατύπωση, παντού. */
export function taxObligationNotes(o: TaxObligation): string {
  return `${o.notes} Ποιος το κάνει: ${WHO_LABEL[o.who]}. ${CONFIDENCE_LABEL[o.confidence]}.`
}
