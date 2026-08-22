// ─────────────────────────────────────────────────────────────────────────────
// Πρόσθεσε ένα γεγονός σε ΟΠΟΙΟΔΗΠΟΤΕ ημερολόγιο — καθαρές, ελεγμένες συναρτήσεις,
// χωρίς backend. Παράγει URLs για Google / Outlook.com / Office 365 / Yahoo και
// αρχείο .ics για Apple Calendar (και κάθε συμβατή εφαρμογή κινητού/laptop),
// καθώς και κείμενο κοινοποίησης για WhatsApp / Viber.
//
// Ώρα προαιρετική: αν λείπει, το γεγονός είναι ολοήμερο. Οι υπολογισμοί ημερομηνίας
// γίνονται με ακέραιους (όχι Date arithmetic) για να μην υπάρχουν σφάλματα ζώνης ώρας.
// ─────────────────────────────────────────────────────────────────────────────

import { escapeIcsText, icsBody } from './ics'

export interface CalendarEventInput {
  title: string
  date: string            // 'YYYY-MM-DD'
  time?: string | null    // 'HH:MM' (24ωρο)· αν λείπει → ολοήμερο
  durationMinutes?: number
  details?: string
  location?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
// URLSearchParams κωδικοποιεί το κενό ως «+», που είναι διφορούμενο σε μερικούς
// parsers ημερολογίων. Χρησιμοποιούμε «%20» παντού — καθαρό και συμβατό.
const qs = (p: URLSearchParams) => p.toString().replace(/\+/g, '%20')

// «YYYY-MM-DD» → «YYYYMMDD»
function compactDate(date: string): string {
  return date.replace(/-/g, '')
}

// Πρόσθεσε N ημέρες σε «YYYY-MM-DD» επιστρέφοντας «YYYYMMDD» (για ολοήμερο end-exclusive).
export function addDaysCompact(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`
}

// «HH:MM» → λεπτά από μεσάνυχτα (ή null αν άκυρο/κενό)
function minutesOfDay(time?: string | null): number | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const h = Number(m[1]), mm = Number(m[2])
  if (h > 23 || mm > 59) return null
  return h * 60 + mm
}

// Τοπική «floating» χρονική σφραγίδα «YYYYMMDDTHHMMSS» για αρχή/τέλος τιμαρισμένου γεγονότος.
function localStamp(date: string, minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440
  const dayShift = Math.floor(minutes / 1440)
  const ymd = dayShift ? addDaysCompact(date, dayShift) : compactDate(date)
  return `${ymd}T${pad(Math.floor(total / 60))}${pad(total % 60)}00`
}

interface Resolved {
  allDay: boolean
  startCompact: string      // YYYYMMDD ή YYYYMMDDTHHMMSS
  endCompact: string
  title: string
  details: string
  location: string
}

function resolve(e: CalendarEventInput): Resolved {
  const start = minutesOfDay(e.time)
  const title = (e.title || 'Γεγονός').trim()
  const details = (e.details || '').trim()
  const location = (e.location || '').trim()
  if (start === null) {
    // Ολοήμερο: end-exclusive επόμενη μέρα (πρότυπο Google/ICS).
    return { allDay: true, startCompact: compactDate(e.date), endCompact: addDaysCompact(e.date, 1), title, details, location }
  }
  const dur = Number.isFinite(e.durationMinutes) && (e.durationMinutes as number) > 0 ? (e.durationMinutes as number) : 60
  return { allDay: false, startCompact: localStamp(e.date, start), endCompact: localStamp(e.date, start + dur), title, details, location }
}

// ── Google Calendar ──────────────────────────────────────────────────────────
export function googleCalendarUrl(e: CalendarEventInput): string {
  const r = resolve(e)
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: r.title,
    dates: `${r.startCompact}/${r.endCompact}`,
  })
  if (r.details) p.set('details', r.details)
  if (r.location) p.set('location', r.location)
  return `https://calendar.google.com/calendar/render?${qs(p)}`
}

// ── Outlook.com (προσωπικό) & Office 365 (εταιρικό) ──────────────────────────
function outlookLike(base: string, e: CalendarEventInput): string {
  const start = minutesOfDay(e.time)
  const [y, m, d] = e.date.split('-').map(Number)
  const p = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: (e.title || 'Γεγονός').trim() })
  if (start === null) {
    p.set('allday', 'true')
    p.set('startdt', `${y}-${pad(m)}-${pad(d)}`)
    p.set('enddt', `${y}-${pad(m)}-${pad(d)}`)
  } else {
    const dur = Number.isFinite(e.durationMinutes) && (e.durationMinutes as number) > 0 ? (e.durationMinutes as number) : 60
    p.set('startdt', `${y}-${pad(m)}-${pad(d)}T${pad(Math.floor(start / 60))}:${pad(start % 60)}:00`)
    const end = start + dur
    const endYmd = end >= 1440 ? addDaysCompact(e.date, Math.floor(end / 1440)) : compactDate(e.date)
    const em = end % 1440
    p.set('enddt', `${endYmd.slice(0, 4)}-${endYmd.slice(4, 6)}-${endYmd.slice(6, 8)}T${pad(Math.floor(em / 60))}:${pad(em % 60)}:00`)
  }
  if (e.details) p.set('body', e.details.trim())
  if (e.location) p.set('location', e.location.trim())
  return `${base}?${qs(p)}`
}
export function outlookLiveUrl(e: CalendarEventInput): string { return outlookLike('https://outlook.live.com/calendar/0/deeplink/compose', e) }
export function office365Url(e: CalendarEventInput): string { return outlookLike('https://outlook.office.com/calendar/0/deeplink/compose', e) }

// ── Yahoo Calendar ───────────────────────────────────────────────────────────
export function yahooCalendarUrl(e: CalendarEventInput): string {
  const start = minutesOfDay(e.time)
  const p = new URLSearchParams({ v: '60', title: (e.title || 'Γεγονός').trim() })
  if (start === null) {
    p.set('st', compactDate(e.date))
    p.set('dur', 'allday')
  } else {
    const dur = Number.isFinite(e.durationMinutes) && (e.durationMinutes as number) > 0 ? (e.durationMinutes as number) : 60
    p.set('st', localStamp(e.date, start))
    // Yahoo θέλει διάρκεια ως HHMM (max 4 ψηφία)
    const h = Math.min(99, Math.floor(dur / 60)), mm = dur % 60
    p.set('dur', `${pad(h)}${pad(mm)}`)
  }
  if (e.details) p.set('desc', e.details.trim())
  if (e.location) p.set('in_loc', e.location.trim())
  return `https://calendar.yahoo.com/?${qs(p)}`
}

// ── Apple Calendar / universal .ics ──────────────────────────────────────────
// Η ΔΙΑΦΥΓΗ ΚΑΙ ΤΟ ΤΥΛΙΓΜΑ ΖΟΥΝ ΣΤΟ `ics.ts`, ΜΙΑ ΦΟΡΑ. Εδώ υπήρχε ιδιωτικό
// αντίγραφο της διαφυγής και ΚΑΝΕΝΑ τύλιγμα: ένας ελληνικός τίτλος 40
// χαρακτήρων είναι ήδη 80 οκτάδες, δηλαδή γραμμή εκτός προτύπου. Οι αναγνώστες
// που είναι αυστηροί την απορρίπτουν ολόκληρη.

// Απλό, ντετερμινιστικό uid (χωρίς Math.random ώστε να είναι ελέγξιμο).
function uid(e: CalendarEventInput): string {
  const base = `${e.date}-${e.time || 'allday'}-${e.title}`
  let h = 0
  for (let i = 0; i < base.length; i++) { h = (h * 31 + base.charCodeAt(i)) | 0 }
  return `${(h >>> 0).toString(36)}@propertyos`
}
export function buildICS(e: CalendarEventInput): string {
  const r = resolve(e)
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Property OS//Calendar//EL', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${uid(e)}`,
  ]
  if (r.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${r.startCompact}`, `DTEND;VALUE=DATE:${r.endCompact}`)
  } else {
    lines.push(`DTSTART:${r.startCompact}`, `DTEND:${r.endCompact}`)
  }
  lines.push(`SUMMARY:${escapeIcsText(r.title)}`)
  if (r.details) lines.push(`DESCRIPTION:${escapeIcsText(r.details)}`)
  if (r.location) lines.push(`LOCATION:${escapeIcsText(r.location)}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return icsBody(lines)
}
// data: URI για κατέβασμα .ics (Apple/κινητό/laptop)
export function icsDataUri(e: CalendarEventInput): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildICS(e))}`
}

// ── Κοινοποίηση σε WhatsApp / Viber ──────────────────────────────────────────
export function eventShareText(e: CalendarEventInput): string {
  const [y, m, d] = e.date.split('-')
  const when = e.time ? `${d}/${m}/${y} στις ${e.time}` : `${d}/${m}/${y}`
  const bits = [e.title.trim(), when]
  if (e.location) bits.push(e.location.trim())
  if (e.details) bits.push(e.details.trim())
  return bits.filter(Boolean).join(' — ')
}
export function whatsappShareUrl(text: string): string { return `https://wa.me/?text=${encodeURIComponent(text)}` }
export function viberShareUrl(text: string): string { return `viber://forward?text=${encodeURIComponent(text)}` }

// Ένα ενιαίο πακέτο όλων των συνδέσμων για ένα γεγονός — βολικό για το UI.
export function allCalendarLinks(e: CalendarEventInput) {
  const text = eventShareText(e)
  return {
    google:   googleCalendarUrl(e),
    outlook:  outlookLiveUrl(e),
    office:   office365Url(e),
    yahoo:    yahooCalendarUrl(e),
    ics:      icsDataUri(e),
    whatsapp: whatsappShareUrl(text),
    viber:    viberShareUrl(text),
  }
}
