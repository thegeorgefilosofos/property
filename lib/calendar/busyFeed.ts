// ─────────────────────────────────────────────────────────────────────────────
// Το ΕΞΕΡΧΟΜΕΝΟ μισό ενός 2-way channel manager για βραχυχρόνιες μισθώσεις.
// Οι μικροί οικοδεσπότες πετυχαίνουν cross-channel μπλοκάρισμα ΧΩΡΙΣ partner APIs
// εξάγοντας τις κρατήσεις τους ως «busy/blocked» iCal, που το Airbnb/Booking/Vrbo
// κάνουν import («Import calendar» / «Sync calendar» από URL). Έτσι μια κράτηση
// οπουδήποτε μπλοκάρει τις ημερομηνίες παντού. Ανιχνεύει και συγκρούσεις
// (double-bookings) ώστε να προειδοποιείται ο οικοδεσπότης.
//
// Καθαρή βιβλιοθήκη, χωρίς I/O — ντετερμινιστική (καμία χρήση Date.now/Math.random).
// Οι υπολογισμοί ημερομηνίας γίνονται σε UTC για να μην υπάρχουν σφάλματα ζώνης ώρας.
// ─────────────────────────────────────────────────────────────────────────────

export interface BusyStay {
  id: string
  check_in: string                 // 'YYYY-MM-DD'
  check_out?: string | null        // 'YYYY-MM-DD'
  channel?: string | null
  guest_name?: string | null
}

export interface StayConflict {
  a: BusyStay
  b: BusyStay
  nights: number                   // επικαλυπτόμενες νύχτες
}

const pad = (n: number) => String(n).padStart(2, '0')

// Έγκυρη «YYYY-MM-DD»;
function validDate(s?: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

// «YYYY-MM-DD» → «YYYYMMDD»
function compact(dateStr: string): string {
  return dateStr.replace(/-/g, '')
}

// Πρόσθεσε N ημέρες σε «YYYY-MM-DD» επιστρέφοντας «YYYY-MM-DD» (UTC-ασφαλές).
export function addDaysISO(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

// Ακέραιος αριθμός ημερών (UTC) — θετικός αν b > a.
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// Πραγματικό (end-exclusive) checkout για μπλοκάρισμα ξενοδοχειακού τύπου.
// Αν λείπει το check_out ή είναι <= check_in, χρησιμοποιούμε check_in + 1 ημέρα.
function effectiveCheckout(stay: BusyStay): string {
  if (validDate(stay.check_out) && daysBetween(stay.check_in, stay.check_out) >= 1) {
    return stay.check_out
  }
  return addDaysISO(stay.check_in, 1)
}

const CHANNELS: Record<string, string> = {
  airbnb: 'Airbnb', booking: 'Booking.com', vrbo: 'Vrbo', other: 'Κράτηση',
}
function channelLabel(channel?: string | null): string {
  return CHANNELS[(channel || '').toLowerCase()] || (channel || '').trim()
}

// ── RFC 5545 helpers ─────────────────────────────────────────────────────────

// Escape «, ; \» και νέες γραμμές σε τιμές κειμένου.
function escapeText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Μήκος σε octets (UTF-8) — τα ελληνικά είναι πολυ-byte.
function octetLen(ch: string): number {
  return Buffer.byteLength(ch, 'utf8')
}

// Line-folding στα 75 octets· οι γραμμές συνέχειας ξεκινούν με κενό (που μετράει).
function foldLine(line: string): string {
  const out: string[] = []
  let cur = ''
  let curBytes = 0
  for (const ch of line) {   // iterate ανά code point (χωρίς σπάσιμο surrogates)
    const b = octetLen(ch)
    if (curBytes + b > 75) {
      out.push(cur)
      cur = ' ' + ch
      curBytes = 1 + b
    } else {
      cur += ch
      curBytes += b
    }
  }
  out.push(cur)
  return out.join('\r\n')
}

// Χτίζει το busy VCALENDAR από τα stays του ακινήτου.
export function buildBusyICS(stays: BusyStay[], propertyTitle: string): string {
  const calName = `${(propertyTitle || '').trim()} — Κρατήσεις`
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Property OS//Busy Feed//EL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ]
  for (const s of stays || []) {
    if (!s || !validDate(s.check_in)) continue     // παράλειψη άκυρου check_in
    const dtstart = compact(s.check_in)
    const dtend = compact(effectiveCheckout(s))
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:stay-${s.id}@propertyos`)
    lines.push(`DTSTART;VALUE=DATE:${dtstart}`)
    lines.push(`DTEND;VALUE=DATE:${dtend}`)
    // Γενικός τίτλος — ΔΕΝ διαρρέει ταυτότητα επισκέπτη σε δημόσιες ροές.
    lines.push('SUMMARY:Μη διαθέσιμο')
    const ch = channelLabel(s.channel)
    if (ch) lines.push(`DESCRIPTION:${escapeText(`Κανάλι: ${ch}`)}`)
    lines.push('TRANSP:OPAQUE')
    lines.push('STATUS:CONFIRMED')
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n')
}

// ── Ανίχνευση συγκρούσεων (double-bookings) ──────────────────────────────────
// Δύο stays συγκρούονται αν τα [check_in, check_out) διαστήματα επικαλύπτονται
// (half-open· «touching» check_out == επόμενο check_in ΔΕΝ είναι σύγκρουση).
export function findStayConflicts(stays: BusyStay[]): StayConflict[] {
  const valid = (stays || []).filter((s): s is BusyStay => !!s && validDate(s.check_in))
  // Ντετερμινιστική σειρά: κατά νωρίτερο check_in, μετά κατά id.
  const sorted = [...valid].sort((x, y) => {
    if (x.check_in !== y.check_in) return x.check_in < y.check_in ? -1 : 1
    return x.id < y.id ? -1 : x.id > y.id ? 1 : 0
  })
  const conflicts: StayConflict[] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j]
      const aStart = a.check_in, aEnd = effectiveCheckout(a)
      const bStart = b.check_in, bEnd = effectiveCheckout(b)
      // επικάλυψη = min(end) - max(start), σε νύχτες
      const start = aStart > bStart ? aStart : bStart
      const end = aEnd < bEnd ? aEnd : bEnd
      const nights = daysBetween(start, end)
      if (nights > 0) conflicts.push({ a, b, nights })
    }
  }
  return conflicts
}

// ── Ασφαλές όνομα αρχείου ─────────────────────────────────────────────────────
const GR2LAT: Record<string, string> = {
  α: 'a', ά: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', έ: 'e', ζ: 'z', η: 'i', ή: 'i',
  θ: 'th', ι: 'i', ί: 'i', ϊ: 'i', ΐ: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x',
  ο: 'o', ό: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', ύ: 'y', ϋ: 'y',
  ΰ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o', ώ: 'o',
}
function transliterate(s: string): string {
  let out = ''
  for (const ch of s.toLowerCase()) out += GR2LAT[ch] ?? ch
  return out
}
export function busyFeedFilename(propertyTitle: string): string {
  const slug = transliterate(propertyTitle || '')
    .replace(/\s+/g, '-')                // κενά → -
    .replace(/[^a-z0-9-]/g, '')          // αφαίρεση μη ασφαλών χαρακτήρων
    .replace(/-+/g, '-')                 // σύμπτυξη πολλαπλών -
    .replace(/^-+|-+$/g, '')             // trim -
  return `krathseis-${slug || 'akinito'}.ics`
}
