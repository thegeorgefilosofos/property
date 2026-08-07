// ═══════════════════════════════════════════════════════════════════════════
// Η ΩΡΑ ΤΗΣ ΕΛΛΑΔΑΣ — ΜΙΑ πηγή αλήθειας για το «σήμερα»
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ, ΜΕΤΡΗΜΕΝΟ
// Ο κώδικας έπαιρνε το «σήμερα» με `new Date().toISOString().slice(0, 10)` σε 26
// σημεία. Το toISOString() γυρίζει ΠΑΝΤΑ UTC. Ο server (Vercel) τρέχει σε UTC, η
// Ελλάδα είναι UTC+2 τον χειμώνα και UTC+3 το καλοκαίρι:
//
//   01:30 ξημερώματα 6ης Αυγούστου στην Αθήνα
//     toISOString().slice(0,10)  →  «2026-08-05»   ← ΧΘΕΣ
//     πραγματική ημερομηνία      →   6 Αυγούστου
//
// Δηλαδή για ΔΥΟ ΩΣ ΤΡΕΙΣ ΩΡΕΣ ΚΑΘΕ ΝΥΧΤΑ η εφαρμογή νόμιζε ότι είναι χθες.
// Τι σήμαινε αυτό στην πράξη:
//
//   • Δαπάνη που καταχωρείς στη 1 π.μ. παίρνει χθεσινή ημερομηνία. Στο γύρισμα
//     του μήνα, η δαπάνη της 1ης Ιουλίου καταγράφεται ως 30ή Ιουνίου και μπαίνει
//     σε ΛΑΘΟΣ ΦΟΡΟΛΟΓΙΚΟ ΜΗΝΑ.
//   • Προθεσμία που λήγει «σήμερα» εμφανίζεται ως ληγμένη ή ως αυριανή.
//   • Η δήλωση μισθωτηρίου έχει προθεσμία με νομικές συνέπειες· υπολογιζόταν με
//     βάση λάθος «σήμερα».
//
// ΓΙΑΤΙ ΔΕΝ ΤΟ ΕΠΙΑΣΕ ΚΑΝΕΙΣ: όποιος δούλευε ή δοκίμαζε στις κανονικές ώρες δεν
// το έβλεπε ποτέ. Εμφανίζεται μόνο μεταξύ μεσάνυχτων και 02:00/03:00 — και τότε
// δεν κρασάρει τίποτα, απλώς η ημερομηνία είναι λάθος.
//
// Η ΛΥΣΗ ΕΔΩ
// Καμία εξάρτηση: το Intl με timeZone 'Europe/Athens' ξέρει ήδη τη θερινή ώρα
// και τις μεταβάσεις της, και ενημερώνεται μαζί με το runtime. Δεν κωδικοποιούμε
// πουθενά «+2» ή «+3» — μια σταθερά μετατόπισης θα ήταν λάθος τον μισό χρόνο.
//
// ΚΑΘΕ συνάρτηση δέχεται προαιρετικό `now`, ώστε να ελέγχεται ντετερμινιστικά.
// ═══════════════════════════════════════════════════════════════════════════

export const GREECE_TZ = 'Europe/Athens'

/** Τα μέρη της ελληνικής ώρας, ως αριθμοί. */
export interface AthensParts {
  year: number; month: number; day: number
  hour: number; minute: number; second: number
  /** 0 = Κυριακή … 6 = Σάββατο, όπως το Date#getDay. */
  weekday: number
}

// Ένας formatter, φτιαγμένος μία φορά: το Intl.DateTimeFormat είναι ακριβό να
// κατασκευάζεται και αυτές οι συναρτήσεις καλούνται σε βρόχους απόδοσης.
const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: GREECE_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false, weekday: 'short',
})

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/** Η ώρα της Ελλάδας τη δεδομένη στιγμή, σπασμένη σε αριθμούς. */
export function athensParts(now: Date = new Date()): AthensParts {
  const map: Record<string, string> = {}
  for (const p of partsFormatter.formatToParts(now)) map[p.type] = p.value
  return {
    year: Number(map.year), month: Number(map.month), day: Number(map.day),
    // Τα μεσάνυχτα δίνονται ως «24» από κάποια runtimes· τα φέρνουμε στο 0.
    hour: Number(map.hour) % 24,
    minute: Number(map.minute), second: Number(map.second),
    weekday: WEEKDAY_INDEX[map.weekday] ?? 0,
  }
}

const p2 = (n: number) => String(n).padStart(2, '0')

/**
 * Η σημερινή ημερομηνία στην Ελλάδα, σε «YYYY-MM-DD».
 *
 * ΑΥΤΗ πρέπει να καλείται παντού όπου πριν γραφόταν
 * `new Date().toISOString().slice(0, 10)`.
 */
export function athensToday(now: Date = new Date()): string {
  const { year, month, day } = athensParts(now)
  return `${year}-${p2(month)}-${p2(day)}`
}

/**
 * Η ΗΜΕΡΟΜΗΝΙΑ ΕΝΟΣ `Date` ΟΠΩΣ ΤΗ ΓΡΑΨΕ ΕΚΕΙΝΟΣ ΠΟΥ ΤΟ ΕΦΤΙΑΞΕ.
 *
 * ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΛΕΙΝΕΙ. Το `athensToday()` απαντά «τι μέρα είναι σήμερα». Δεν
 * απαντά όμως «σε ποια μέρα αντιστοιχεί αυτό το Date που έφτιαξα», και εκεί
 * έμεινε ένα δεύτερο, χειρότερο σφάλμα:
 *
 *     new Date(2026, 7, 1).toISOString().slice(0, 10)   →   «2026-07-31»
 *
 * Το `new Date(έτος, μήνας, μέρα)` φτιάχνει ΤΟΠΙΚΑ μεσάνυχτα. Στην Ελλάδα αυτό
 * είναι 21:00 ή 22:00 της ΠΡΟΗΓΟΥΜΕΝΗΣ μέρας σε UTC, και το `toISOString()`
 * γυρίζει UTC. Άρα η μετατροπή έβγαζε ΠΑΝΤΑ μία μέρα πίσω — όχι μόνο τη νύχτα,
 * όπως το προηγούμενο σφάλμα, αλλά ΚΑΘΕ ΩΡΑ, χειμώνα και καλοκαίρι.
 *
 * Τι σήμαινε: η «1η του επόμενου μήνα» γινόταν η τελευταία του τρέχοντος, και οι
 * δόσεις δανείου έμπαιναν στο ημερολόγιο μία μέρα νωρίτερα από την πραγματική.
 *
 * Διαβάζει τα ΤΟΠΙΚΑ πεδία, που είναι ακριβώς αυτά που έδωσε ο καλών.
 */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** Ο τρέχων μήνας στην Ελλάδα, σε «YYYY-MM» — για μηνιαίες συγκεντρώσεις. */
export function athensMonth(now: Date = new Date()): string {
  const { year, month } = athensParts(now)
  return `${year}-${p2(month)}`
}

/** Η ώρα στην Ελλάδα, σε «HH:MM» 24ωρο. */
export function athensTime(now: Date = new Date()): string {
  const { hour, minute } = athensParts(now)
  return `${p2(hour)}:${p2(minute)}`
}

/**
 * Η μετατόπιση της Ελλάδας από το UTC σε λεπτά τη δεδομένη στιγμή
 * (+120 χειμώνα, +180 θερινή). Δεν είναι σταθερά — υπολογίζεται.
 */
export function athensOffsetMinutes(now: Date = new Date()): number {
  const { year, month, day, hour, minute, second } = athensParts(now)
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  // Τα χιλιοστά αγνοούνται και στις δύο πλευρές, ώστε η διαφορά να είναι ακέραια.
  return Math.round((asUtc - Math.floor(now.getTime() / 1000) * 1000) / 60000)
}

/** Είναι σε ισχύ η θερινή ώρα στην Ελλάδα; */
export const isAthensDST = (now: Date = new Date()): boolean =>
  athensOffsetMinutes(now) === 180

/**
 * Πόσες μέρες απέχει μια ημερομηνία «YYYY-MM-DD» από το σήμερα στην Ελλάδα.
 * Θετικό = στο μέλλον. Μηδέν = σήμερα.
 *
 * Η σύγκριση γίνεται σε ΗΜΕΡΟΛΟΓΙΑΚΕΣ μέρες, όχι σε ώρες: μια προθεσμία που
 * λήγει σήμερα στις 23:59 πρέπει να δείχνει «σήμερα» και στις 09:00 και στις
 * 22:00, όχι «σε 0,6 μέρες».
 */
export function daysUntil(isoDate: string, now: Date = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return null
  const target = Date.UTC(
    Number(isoDate.slice(0, 4)), Number(isoDate.slice(5, 7)) - 1, Number(isoDate.slice(8, 10)))
  const t = athensToday(now)
  const today = Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10)))
  return Math.round((target - today) / 86_400_000)
}

export const isToday    = (iso: string, now?: Date) => daysUntil(iso, now) === 0
export const isPast     = (iso: string, now?: Date) => { const d = daysUntil(iso, now); return d != null && d < 0 }
export const isFuture   = (iso: string, now?: Date) => { const d = daysUntil(iso, now); return d != null && d > 0 }

/** Ημερομηνία N ημερών από σήμερα (ελληνικό ημερολόγιο), σε «YYYY-MM-DD». */
export function athensDatePlus(days: number, now: Date = new Date()): string {
  const t = athensToday(now)
  const d = new Date(Date.UTC(
    Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1, Number(t.slice(8, 10))))
  d.setUTCDate(d.getUTCDate() + Math.trunc(days))
  return d.toISOString().slice(0, 10)
}

const GREEK_WEEKDAYS = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο']

/** Το όνομα της σημερινής ημέρας στα ελληνικά. */
export const athensWeekdayName = (now: Date = new Date()): string =>
  GREEK_WEEKDAYS[athensParts(now).weekday]

/**
 * Είναι εργάσιμη μέρα στην Ελλάδα; (Δευτέρα–Παρασκευή)
 *
 * ΔΕΝ ξέρει αργίες — αυτές ζουν στο lib/calendar/greekHolidays.ts μαζί με το
 * κινητό Πάσχα, και δεν αντιγράφονται εδώ.
 */
export function isAthensWorkday(now: Date = new Date()): boolean {
  const d = athensParts(now).weekday
  return d >= 1 && d <= 5
}

/**
 * Πλήρης, αναγνώσιμη ελληνική ώρα — για να μπορεί ο βοηθός να απαντήσει
 * «τι μέρα είναι σήμερα;» χωρίς να μαντεύει.
 */
export function athensNowLabel(now: Date = new Date()): string {
  const { day, month, year } = athensParts(now)
  return `${athensWeekdayName(now)} ${day}/${p2(month)}/${year}, ${athensTime(now)}`
}

// ── ΤΟ ΕΤΟΣ ΚΑΙ Ο ΜΗΝΑΣ ΜΙΑΣ ΗΜΕΡΟΛΟΓΙΑΚΗΣ ΗΜΕΡΑΣ ─────────────────────────
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΚΛΕΙΝΟΥΝ, ΜΕΤΡΗΜΕΝΟ ΣΕ ΕΠΤΑ ΣΗΜΕΙΑ. Γραφόταν
// `new Date(iso).getFullYear()` — η ημερομηνία διαβάζεται σε UTC και ρωτιέται
// σε ΤΟΠΙΚΗ ώρα. Το «2026-01-01» είναι μεσάνυχτα UTC· σε ζώνη με ΑΡΝΗΤΙΚΗ
// απόκλιση γίνεται 31 Δεκεμβρίου του ΠΡΟΗΓΟΥΜΕΝΟΥ έτους. Οι δαπάνες της
// Πρωτοχρονιάς έφευγαν από τη χρονιά τους, τα έγγραφα αρχειοθετούνταν σε λάθος
// φάκελο, οι διαμονές εξαφανίζονταν από το γράφημα.
//
// Στην Ελλάδα (UTC+2/+3) δεν φαίνεται ΠΟΤΕ. Ο κώδικας όμως τρέχει στον
// περιηγητή του ΧΡΗΣΤΗ: ένας ιδιοκτήτης που ταξιδεύει βλέπει άλλα νούμερα.
//
// Μια στήλη `date` της PostgreSQL είναι ΗΜΕΡΟΛΟΓΙΑΚΗ ημέρα χωρίς ώρα και χωρίς
// ζώνη. Δεν χρειάζεται ρολόι για να διαβαστεί — μόνο ανάγνωση του κειμένου.
const YMD = /^(\d{4})-(\d{2})-(\d{2})/

/** Το έτος μιας «YYYY-MM-DD». `null` όταν λείπει ή δεν αναγνωρίζεται. */
export function isoYear(iso: string | null | undefined): number | null {
  const m = YMD.exec(iso || '')
  return m ? Number(m[1]) : null
}

/** Ο μήνας μιας «YYYY-MM-DD», 1–12. `null` όταν λείπει ή δεν αναγνωρίζεται. */
export function isoMonth(iso: string | null | undefined): number | null {
  const m = YMD.exec(iso || '')
  return m ? Number(m[2]) : null
}

/**
 * Μια «YYYY-MM-DD» ως ΤΟΠΙΚΗ μέρα, ώστε ένας τοπικός μορφοποιητής να μη γυρίσει
 * την ημερομηνία μία μέρα πίσω.
 *
 * ΤΟ ΙΔΙΟ ΣΦΑΛΜΑ ΜΕ ΤΑ `isoYear`/`isoMonth` ΑΠΟ ΠΑΝΩ, ΣΤΗΝ ΕΚΤΥΠΩΣΗ. Το σκέτο
 * `new Date('2026-01-01')` είναι μεσάνυχτα UTC, ενώ το `toLocaleDateString`
 * μορφοποιεί σε τοπική ώρα: σε ζώνη με αρνητική απόκλιση τυπώνεται «31
 * Δεκεμβρίου 2025». Ο κώδικας τρέχει στον περιηγητή ΤΟΥ ΧΡΗΣΤΗ.
 *
 * ΤΟ ΟΡΙΟ ΕΙΝΑΙ ΣΑΦΕΣ: ημερολογιακή ΗΜΕΡΑ περνά από εδώ· χρονική ΣΤΙΓΜΗ
 * (`created_at`, `paid_at`, τελευταία σύνδεση) ΟΧΙ — εκεί η τοπική ώρα είναι
 * ακριβώς το ζητούμενο, και μια συμβολοσειρά με ώρα περνά αυτούσια.
 */
export const localDay = (d: string | Date): Date =>
  typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())
    ? new Date(`${d.trim()}T00:00:00`)
    : new Date(d)
