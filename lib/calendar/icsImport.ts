// ─────────────────────────────────────────────────────────────────────────────
// Εισαγωγή .ics (iCalendar / RFC 5545) — καθαρή ανάλυση κειμένου σε γεγονότα.
// Χωρίς εξωτερικές εξαρτήσεις. Ποτέ δεν πετάει σφάλμα σε κακοσχηματισμένη είσοδο.
//
// Σημείωση για ζώνες ώρας: για απλότητα κρατάμε πάντα την «τοπική» ώρα του
// ρολογιού (wall-clock). Αν το DTSTART/DTEND τελειώνει σε 'Z' (UTC) ΔΕΝ κάνουμε
// μετατόπιση — κρατάμε το HH:MM όπως γράφτηκε. Το TZID param αγνοείται ομοίως.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportedEvent {
  title: string
  date: string
  time: string | null
  durationMinutes: number | null
  notes: string | null
  location: string | null
}

interface Prop {
  name: string
  params: Record<string, string>
  value: string
}

// Ξεδίπλωμα γραμμών (RFC 5545 §3.1): CRLF/LF ακολουθούμενο από κενό ή tab
// συνεχίζει την προηγούμενη γραμμή. Αφαιρούμε το ΈΝΑ αρχικό κενό/tab.
function unfold(text: string): string[] {
  const raw = text.split(/\r\n|\r|\n/)
  const out: string[] = []
  for (const line of raw) {
    if (out.length > 0 && (line.startsWith(' ') || line.startsWith('\t'))) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

// Αποδραστικοί χαρακτήρες κειμένου (RFC 5545 §3.3.11): \n \N → newline,
// \, → κόμμα, \; → semicolon, \\ → backslash. Ένα πέρασμα ώστε να μη
// διπλο-επεξεργαστούμε το ίδιο backslash.
function unescapeText(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1]
      if (n === 'n' || n === 'N') { out += '\n'; i++ }
      else if (n === ',') { out += ','; i++ }
      else if (n === ';') { out += ';'; i++ }
      else if (n === '\\') { out += '\\'; i++ }
      else { out += n; i++ }
    } else {
      out += c
    }
  }
  return out
}

// Εύρεση του πρώτου «:» εκτός εισαγωγικών — χωρίζει name+params από την τιμή.
function parseProp(line: string): Prop | null {
  let colon = -1
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuote = !inQuote
    else if (c === ':' && !inQuote) { colon = i; break }
  }
  if (colon === -1) return null
  const head = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const parts = head.split(';')
  const name = parts[0].trim().toUpperCase()
  if (!name) return null
  const params: Record<string, string> = {}
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=')
    if (eq === -1) continue
    const k = parts[i].slice(0, eq).trim().toUpperCase()
    let v = parts[i].slice(eq + 1).trim()
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, v.length - 1)
    params[k] = v.toUpperCase()
  }
  return { name, params, value }
}

interface DateVal {
  date: string          // YYYY-MM-DD
  time: string | null   // HH:MM ή null (ολοήμερο)
  y: number; mo: number; d: number; h: number; mi: number
  allDay: boolean
}

// Ανάλυση τιμής DTSTART/DTEND. Επιστρέφει null αν δεν αναγνωρίζεται.
function parseDateVal(prop: Prop): DateVal | null {
  const v = prop.value.trim()
  const isDateParam = prop.params['VALUE'] === 'DATE'
  // DATE-TIME: YYYYMMDDTHHMMSS(Z)?
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(v)
  if (dt && !isDateParam) {
    const [, y, mo, d, h, mi] = dt
    return {
      date: `${y}-${mo}-${d}`,
      time: `${h}:${mi}`,
      y: +y, mo: +mo, d: +d, h: +h, mi: +mi,
      allDay: false,
    }
  }
  // DATE: YYYYMMDD (ή ρητό VALUE=DATE)
  const da = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (da) {
    const [, y, mo, d] = da
    return {
      date: `${y}-${mo}-${d}`,
      time: null,
      y: +y, mo: +mo, d: +d, h: 0, mi: 0,
      allDay: true,
    }
  }
  return null
}

// Λεπτά μεταξύ δύο χρονισμένων στιγμών (χειρίζεται και το επόμενο ημερολ. ημέρα).
function minutesBetween(a: DateVal, b: DateVal): number {
  const start = Date.UTC(a.y, a.mo - 1, a.d, a.h, a.mi)
  const end = Date.UTC(b.y, b.mo - 1, b.d, b.h, b.mi)
  return Math.round((end - start) / 60000)
}

// Ανάλυση ενός VEVENT (χωρίς τις εσωτερικές γραμμές VALARM κ.λπ.) σε ImportedEvent.
function parseEvent(props: Prop[]): ImportedEvent | null {
  let dtStart: DateVal | null = null
  let dtEnd: DateVal | null = null
  let title = ''
  let notes: string | null = null
  let location: string | null = null

  for (const p of props) {
    switch (p.name) {
      case 'DTSTART': if (!dtStart) dtStart = parseDateVal(p); break
      case 'DTEND':   if (!dtEnd) dtEnd = parseDateVal(p); break
      case 'SUMMARY':     title = unescapeText(p.value); break
      case 'DESCRIPTION': { const t = unescapeText(p.value); notes = t.trim() ? t : null; break }
      case 'LOCATION':    { const t = unescapeText(p.value); location = t.trim() ? t : null; break }
    }
  }

  // Χωρίς έγκυρο DTSTART → παραλείπουμε το γεγονός.
  if (!dtStart) return null

  let durationMinutes: number | null = null
  if (!dtStart.allDay && dtEnd && !dtEnd.allDay) {
    const diff = minutesBetween(dtStart, dtEnd)
    durationMinutes = diff > 0 ? diff : null
  }

  return {
    title: title.trim() ? title : 'Γεγονός',
    date: dtStart.date,
    time: dtStart.time,
    durationMinutes,
    notes,
    location,
  }
}

// Δημόσια συνάρτηση: κείμενο .ics → λίστα γεγονότων, με τη σειρά που εμφανίζονται.
export function parseICS(text: string): ImportedEvent[] {
  if (!text) return []
  const lines = unfold(text)
  const events: ImportedEvent[] = []

  let inEvent = false
  let subDepth = 0            // βάθος εσωτερικών component (VALARM κ.λπ.)
  let current: Prop[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    const upper = trimmed.toUpperCase()

    if (!inEvent) {
      if (upper === 'BEGIN:VEVENT') { inEvent = true; subDepth = 0; current = [] }
      continue
    }

    // Είμαστε μέσα σε VEVENT.
    if (upper === 'END:VEVENT' && subDepth === 0) {
      const ev = parseEvent(current)
      if (ev) events.push(ev)
      inEvent = false
      current = []
      continue
    }
    if (upper.startsWith('BEGIN:')) { subDepth++; continue }
    if (upper.startsWith('END:')) { if (subDepth > 0) subDepth--; continue }
    if (subDepth > 0) continue   // αγνόησε γραμμές εσωτερικών component

    const prop = parseProp(line)
    if (prop) current.push(prop)
  }

  return events
}
