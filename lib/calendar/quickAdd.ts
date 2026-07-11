// ─────────────────────────────────────────────────────────────────────────────
// Ανάλυση ελληνικού «γρήγορου» κειμένου (quick-add) σε δομημένα πεδία γεγονότος,
// όπως το «Quick Add» του Google Calendar. Καθαρή συνάρτηση: όλη η «τρέχουσα
// στιγμή» έρχεται από την παράμετρο `now` (καμία κλήση new Date()/Date.now()).
//
// Παραδείγματα:
//   "Service λέβητα Παρασκευή 10πμ"        → { title:'Service λέβητα', date:<επόμ. Παρ>, time:'10:00' }
//   "Πληρωμή ΔΕΗ αύριο"                    → { title:'Πληρωμή ΔΕΗ', date:<αύριο>, time:null }
//   "Ραντεβού μάστορα 25/3 στις 6"         → { title:'Ραντεβού μάστορα', date:<25/3>, time:'18:00' }
//   "Συνάντηση με λογιστή μεθαύριο 17:30"  → { title:'Συνάντηση με λογιστή', date:<μεθαύριο>, time:'17:30' }
//
// Όλη η αριθμητική ημερομηνίας γίνεται σε UTC ώστε να είναι ανεξάρτητη ζώνης ώρας
// (το `now` στα τεστ φτιάχνεται με Date.UTC).
// ─────────────────────────────────────────────────────────────────────────────

export interface QuickAddResult {
  title: string
  date: string | null // 'YYYY-MM-DD' ή null
  time: string | null // 'HH:MM' (24ωρο, με μηδενικά) ή null
}

const DAY_MS = 86400000

const pad = (n: number) => String(n).padStart(2, '0')

// Πεζά + αφαίρεση τόνων (NFD → αφαίρεση συνδυαστικών σημαδιών). Ταιριάζει και τα
// ελληνικά προσυντεθειμένα (ά→α, ή→η, ...).
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Αφαίρεση στίξης μόνο από αρχή/τέλος (κρατά εσωτερικές τελείες, π.χ. "π.μ").
function trimPunct(s: string): string {
  return s.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '')
}

// Ελληνικές ημέρες → JS getUTCDay (0=Κυριακή). Πλήρεις + σύντομες, χωρίς τόνους.
const WEEKDAYS: Record<string, number> = {
  κυριακη: 0, κυρ: 0,
  δευτερα: 1, δευ: 1,
  τριτη: 2, τρι: 2,
  τεταρτη: 3, τετ: 3,
  πεμπτη: 4, πεμ: 4,
  παρασκευη: 5, παρ: 5,
  σαββατο: 6, σαβ: 6,
}

// Ελληνικοί μήνες (γενική + ονομαστική), χωρίς τόνους → 1..12.
const MONTHS: Record<string, number> = {
  ιανουαριου: 1, ιανουαριος: 1,
  φεβρουαριου: 2, φεβρουαριος: 2,
  μαρτιου: 3, μαρτιος: 3,
  απριλιου: 4, απριλιος: 4,
  μαιου: 5, μαιος: 5,
  ιουνιου: 6, ιουνιος: 6,
  ιουλιου: 7, ιουλιος: 7,
  αυγουστου: 8, αυγουστος: 8,
  σεπτεμβριου: 9, σεπτεμβριος: 9,
  οκτωβριου: 10, οκτωβριος: 10,
  νοεμβριου: 11, νοεμβριος: 11,
  δεκεμβριου: 12, δεκεμβριος: 12,
}

// Λέξεις-σύνδεσμοι που κόβονται αν «κρέμονται» στην αρχή/τέλος του τίτλου.
const CONNECTIVES = new Set(['στις', 'την', 'το', 'στη', 'στο', 'με'])

function fmt(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

// Το date-part (UTC μεσάνυχτα) που αντιπροσωπεύει το «σήμερα».
function midnightMs(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
}

// Επόμενη εμφάνιση της ημέρας-εβδομάδας, αυστηρά μετά το σήμερα.
function nextWeekday(target: number, todayMs: number): number {
  const dow = new Date(todayMs).getUTCDay()
  let diff = (target - dow + 7) % 7
  if (diff === 0) diff = 7
  return todayMs + diff * DAY_MS
}

// Επόμενη ημερομηνία με δοσμένη ημέρα/μήνα (χωρίς έτος): φέτος αν είναι από
// σήμερα και μετά, αλλιώς του χρόνου.
function nextByMonthDay(day: number, month: number, todayMs: number): number {
  const y = new Date(todayMs).getUTCFullYear()
  let ms = Date.UTC(y, month - 1, day)
  if (ms < todayMs) ms = Date.UTC(y + 1, month - 1, day)
  return ms
}

// Έλεγχος ότι η κατασκευασμένη ημερομηνία δεν «ξεχείλισε» (π.χ. 31/2).
function validUTC(ms: number, day: number, month: number): boolean {
  const d = new Date(ms)
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

// Μετατροπή ώρας ΠΜ/ΜΜ σε 24ωρο. Επιστρέφει null αν άκυρη.
function ampmTime(h: number, mi: number, ap: string): string | null {
  if (h < 1 || h > 12 || mi < 0 || mi > 59) return null
  let H = h % 12 // 12 → 0
  if (ap === 'μμ') H += 12
  return `${pad(H)}:${pad(mi)}`
}

interface Tok {
  orig: string
  ntTrim: string // κανονικοποιημένο, χωρίς άκρη-στίξη
  ntNoDot: string // + χωρίς τελείες (για π.μ./μ.μ.)
}

export function parseQuickAdd(text: string, now: Date): QuickAddResult {
  const safeText = (text ?? '').toString()
  const rawTokens = safeText.split(/\s+/).filter((t) => t.length > 0)

  const tokens: Tok[] = rawTokens.map((orig) => {
    const nt = trimPunct(norm(orig))
    return { orig, ntTrim: nt, ntNoDot: nt.replace(/\./g, '') }
  })

  const consumed = new Array<boolean>(tokens.length).fill(false)
  const todayMs = midnightMs(now)

  // ── ΗΜΕΡΟΜΗΝΙΑ ────────────────────────────────────────────────────────────
  let date: string | null = null
  for (let i = 0; i < tokens.length; i++) {
    if (consumed[i]) continue
    const t = tokens[i]

    // Σχετικές λέξεις
    if (t.ntTrim === 'σημερα') { date = fmt(todayMs); consumed[i] = true; break }
    if (t.ntTrim === 'αυριο') { date = fmt(todayMs + DAY_MS); consumed[i] = true; break }
    if (t.ntTrim === 'μεθαυριο') { date = fmt(todayMs + 2 * DAY_MS); consumed[i] = true; break }

    // Αριθμητική: DD/MM, DD/MM/YYYY, DD-MM
    const m = t.ntTrim.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/)
    if (m) {
      const d = +m[1]
      const mo = +m[2]
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        let ms: number
        if (m[3] !== undefined) {
          let y = +m[3]
          if (y < 100) y += 2000
          ms = Date.UTC(y, mo - 1, d)
        } else {
          ms = nextByMonthDay(d, mo, todayMs)
        }
        if (validUTC(ms, d, mo)) { date = fmt(ms); consumed[i] = true; break }
      }
    }

    // DD ΜήναςGr (π.χ. "25 Μαρτίου")
    const dm = t.ntTrim.match(/^(\d{1,2})$/)
    if (dm && i + 1 < tokens.length && !consumed[i + 1]) {
      const mo = MONTHS[tokens[i + 1].ntTrim]
      if (mo !== undefined) {
        const d = +dm[1]
        const ms = nextByMonthDay(d, mo, todayMs)
        if (d >= 1 && d <= 31 && validUTC(ms, d, mo)) {
          date = fmt(ms); consumed[i] = true; consumed[i + 1] = true; break
        }
      }
    }

    // Ημέρα εβδομάδας
    if (WEEKDAYS[t.ntTrim] !== undefined) {
      date = fmt(nextWeekday(WEEKDAYS[t.ntTrim], todayMs)); consumed[i] = true; break
    }
  }

  // ── ΩΡΑ ───────────────────────────────────────────────────────────────────
  let time: string | null = null
  for (let i = 0; i < tokens.length; i++) {
    if (consumed[i]) continue
    const t = tokens[i]

    // HH:MM (24ωρο)
    const hm = t.ntTrim.match(/^(\d{1,2}):(\d{1,2})$/)
    if (hm) {
      const h = +hm[1]
      const mi = +hm[2]
      if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) { time = `${pad(h)}:${pad(mi)}`; consumed[i] = true; break }
      continue // άκυρη → null, μη κατανάλωση
    }

    // Μονό token ΠΜ/ΜΜ: 10πμ, 10:30πμ, 6μμ, 10π.μ.
    const ap1 = t.ntNoDot.match(/^(\d{1,2})(?::(\d{1,2}))?(πμ|μμ)$/)
    if (ap1) {
      const r = ampmTime(+ap1[1], ap1[2] !== undefined ? +ap1[2] : 0, ap1[3])
      if (r) { time = r; consumed[i] = true; break }
      continue
    }

    // Δύο tokens ΠΜ/ΜΜ: "10 πμ", "6 μ.μ."
    const numOnly = t.ntTrim.match(/^(\d{1,2})(?::(\d{1,2}))?$/)
    if (numOnly && i + 1 < tokens.length && !consumed[i + 1] &&
        (tokens[i + 1].ntNoDot === 'πμ' || tokens[i + 1].ntNoDot === 'μμ')) {
      const r = ampmTime(+numOnly[1], numOnly[2] !== undefined ? +numOnly[2] : 0, tokens[i + 1].ntNoDot)
      if (r) { time = r; consumed[i] = true; consumed[i + 1] = true; break }
    }

    // "10η ώρα"
    const nth = t.ntTrim.match(/^(\d{1,2})η$/)
    if (nth && i + 1 < tokens.length && !consumed[i + 1] && tokens[i + 1].ntTrim === 'ωρα') {
      const h = +nth[1]
      if (h >= 0 && h <= 23) { time = `${pad(h)}:00`; consumed[i] = true; consumed[i + 1] = true; break }
    }

    // "στις N" (γυμνός αριθμός). Ευρετική: N∈1..7 → απόγευμα (N+12), N≥8 → ως έχει
    // (πρωί/βράδυ). Έτσι "στις 6" → 18:00 αλλά "στις 9" → 09:00, "στις 18" → 18:00.
    if (t.ntTrim === 'στις' && i + 1 < tokens.length && !consumed[i + 1]) {
      const nm = tokens[i + 1].ntTrim.match(/^(\d{1,2})$/)
      if (nm) {
        let h = +nm[1]
        if (h >= 1 && h <= 7) h += 12
        if (h >= 0 && h <= 23) { time = `${pad(h)}:00`; consumed[i] = true; consumed[i + 1] = true; break }
      }
    }
  }

  // ── ΤΙΤΛΟΣ ────────────────────────────────────────────────────────────────
  const parts = tokens.filter((_, i) => !consumed[i]).map((t) => t.orig)
  while (parts.length && CONNECTIVES.has(norm(trimPunct(parts[0])))) parts.shift()
  while (parts.length && CONNECTIVES.has(norm(trimPunct(parts[parts.length - 1])))) parts.pop()

  let title = parts.join(' ').replace(/\s+/g, ' ').trim()
  if (!title) title = safeText.replace(/\s+/g, ' ').trim()
  if (!title) title = 'Γεγονός'

  return { title, date, time }
}
