// ─────────────────────────────────────────────────────────────────────────────
// Πρόσκληση συμμετέχοντα (attendee invite) για γεγονός ημερολογίου — καθαρές,
// ελεγμένες συναρτήσεις, ΧΩΡΙΣ backend / mail server. Παράγει:
//   (α) αρχείο .ics με ORGANIZER + ATTENDEE και METHOD:REQUEST (διαβάζεται ως
//       πρόσκληση, όχι απλό γεγονός),
//   (β) σύνδεσμο mailto: με θέμα/σώμα και το .ics ως data-uri σημείωση,
//   (γ) κείμενο + σύνδεσμο κοινοποίησης για WhatsApp / Viber.
//
// Ό,τι αποστολή γίνεται μέσω συνδέσμων (mailto / wa.me / viber) — όπως όλη η
// υπόλοιπη εφαρμογή. Επαναχρησιμοποιούμε το buildICS του externalLinks για τη
// λογική ημερομηνίας/ώρας ώστε τα DTSTART/DTEND να είναι πανομοιότυπα.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildICS,
  whatsappShareUrl,
  viberShareUrl,
  type CalendarEventInput,
} from './externalLinks'
import { icsBody } from './ics'

export interface InviteInput {
  title: string
  date: string                 // 'YYYY-MM-DD'
  time?: string                // 'HH:MM' (24ωρο)· αν λείπει → ολοήμερο
  durationMinutes?: number
  details?: string
  location?: string
  organizerName?: string
  organizerEmail?: string
  attendeeName?: string
  attendeeEmail?: string
  attendeePhone?: string
}

// ── Βοηθητικά ────────────────────────────────────────────────────────────────
const trimOr = (v?: string) => (v || '').trim()

// Ελληνικά ονόματα ημερών (0 = Κυριακή, όπως getUTCDay).
const WEEKDAYS_EL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο']

// Όνομα ημέρας για «YYYY-MM-DD» (UTC — χωρίς εξάρτηση από argless Date/τοπική ζώνη).
function weekdayEl(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return WEEKDAYS_EL[dow] || ''
}

// «YYYY-MM-DD» → «DD/MM/YYYY»
function humanDate(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

// Ανθρώπινη διατύπωση: «Σάββατο 11/07/2026[ στις 09:30]».
function humanWhen(input: InviteInput): string {
  const base = `${weekdayEl(input.date)} ${humanDate(input.date)}`.trim()
  const time = trimOr(input.time)
  return time ? `${base} στις ${time}` : base
}

// Κράτα μόνο ψηφία (για wa.me / viber number).
function digits(phone?: string): string {
  return trimOr(phone).replace(/\D/g, '')
}

// Τιμή παραμέτρου iCalendar (CN=...): αν περιέχει ,;: ή " την περικλείουμε σε
// διπλά εισαγωγικά (RFC 5545 §3.1). Τυχόν διπλά εισαγωγικά μέσα αφαιρούνται.
function paramValue(v: string): string {
  const clean = v.replace(/"/g, '')
  return /[,;:]/.test(clean) ? `"${clean}"` : clean
}

// Η ΑΝΑΔΙΠΛΩΣΗ ΖΕΙ ΣΤΟ `ics.ts`, ΜΙΑ ΦΟΡΑ. Υπήρχε εδώ ολόκληρη και δεύτερη
// φορά ήθελε να γραφτεί για τη ροή συνδρομής. Τρία αντίγραφα του ίδιου κανόνα
// του προτύπου είναι τρεις ευκαιρίες να αποκλίνει το ένα σιωπηλά.

function toEvent(input: InviteInput): CalendarEventInput {
  return {
    title: input.title,
    date: input.date,
    time: input.time ?? null,
    durationMinutes: input.durationMinutes,
    details: input.details,
    location: input.location,
  }
}

// ── (α) .ics πρόσκληση ────────────────────────────────────────────────────────
function organizerLine(input: InviteInput): string {
  const email = trimOr(input.organizerEmail)
  if (!email) return ''
  const name = trimOr(input.organizerName)
  return name
    ? `ORGANIZER;CN=${paramValue(name)}:mailto:${email}`
    : `ORGANIZER:mailto:${email}`
}

function attendeeLine(input: InviteInput): string {
  const email = trimOr(input.attendeeEmail)
  if (!email) return ''
  const name = trimOr(input.attendeeName)
  return name
    ? `ATTENDEE;CN=${paramValue(name)};RSVP=TRUE:mailto:${email}`
    : `ATTENDEE;RSVP=TRUE:mailto:${email}`
}

// Επεκτείνει την έξοδο του buildICS με METHOD:REQUEST (στο VCALENDAR) και
// ORGANIZER/ATTENDEE (μέσα στο VEVENT) και αναδιπλώνει τις γραμμές στα 75 octets.
export function buildInviteICS(input: InviteInput): string {
  const base = buildICS(toEvent(input))
  const src = base.split('\r\n')
  const out: string[] = []
  for (const line of src) {
    if (line === 'BEGIN:VEVENT') {
      out.push('METHOD:REQUEST')      // ανήκει στο VCALENDAR, πριν το VEVENT
      out.push(line)
      continue
    }
    out.push(line)
    if (line.startsWith('UID:')) {
      const org = organizerLine(input)
      if (org) out.push(org)
      const att = attendeeLine(input)
      if (att) out.push(att)
    }
  }
  // Η κενή γραμμή που αφήνει το τελικό CRLF του `buildICS` δεν είναι γραμμή
  // περιεχομένου και δεν ξαναγράφεται.
  return icsBody(out.filter(Boolean))
}

// data: URI της πρόσκλησης (.ics) — για επισύναψη/σύνδεσμο.
export function inviteIcsDataUri(input: InviteInput): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildInviteICS(input))}`
}

// ── (β) mailto: σύνδεσμος ─────────────────────────────────────────────────────
// Κωδικοποίηση με encodeURIComponent → τα κενά γίνονται %20 (όχι «+»).
export function inviteMailto(input: InviteInput): string {
  const email = trimOr(input.attendeeEmail)
  if (!email) return ''
  const title = trimOr(input.title) || 'Γεγονός'
  const subject = `Πρόσκληση: ${title}`
  const location = trimOr(input.location)

  const parts: string[] = []
  const name = trimOr(input.attendeeName)
  parts.push(name ? `Γεια σου ${name},` : 'Γεια σου,')
  parts.push(`Θα ήθελα να σε προσκαλέσω: «${title}».`)
  let when = `Πότε: ${humanWhen(input)}`
  if (location) when += `\nΠού: ${location}`
  parts.push(when)
  parts.push('Η πρόσκληση ημερολογίου (.ics) είναι στον παρακάτω σύνδεσμο:')
  parts.push(inviteIcsDataUri(input))
  const body = parts.join('\n\n')

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// ── (ε) απλό κείμενο πρόσκλησης ───────────────────────────────────────────────
// «<title>»: <ημέρα> <ημερομηνία>[ στις <ώρα>][, <location>]. Θα ήθελα να το
// κλείσουμε· επιβεβαιώνεις;
export function inviteText(input: InviteInput): string {
  const title = trimOr(input.title) || 'Γεγονός'
  const location = trimOr(input.location)
  let s = `«${title}»: ${humanWhen(input)}`
  if (location) s += `, ${location}`
  s += '. Θα ήθελα να το κλείσουμε· επιβεβαιώνεις;'
  return s
}

// Κείμενο κοινοποίησης με προαιρετικό όνομα καλεσμένου μπροστά.
function shareText(input: InviteInput): string {
  const name = trimOr(input.attendeeName)
  const body = inviteText(input)
  return name ? `${name}, ${body}` : body
}

// ── (γ) WhatsApp / Viber ──────────────────────────────────────────────────────
// Επαναχρησιμοποιούμε τα externalLinks.whatsappShareUrl/viberShareUrl για την
// κωδικοποίηση του κειμένου· στοχεύουμε το τηλέφωνο του καλεσμένου όταν υπάρχει.
export function inviteWhatsApp(input: InviteInput): string {
  const base = whatsappShareUrl(shareText(input))
  const num = digits(input.attendeePhone)
  return num ? base.replace('https://wa.me/?', `https://wa.me/${num}?`) : base
}

export function inviteViber(input: InviteInput): string {
  const base = viberShareUrl(shareText(input))
  const num = digits(input.attendeePhone)
  return num ? `${base}&number=${num}` : base
}

// ── (στ) Δυνατότητα πρόσκλησης ανά κανάλι ─────────────────────────────────────
export function canInvite(input: InviteInput): { email: boolean; phone: boolean } {
  const email = trimOr(input.attendeeEmail)
  return {
    email: email.length > 0 && email.includes('@'),
    phone: digits(input.attendeePhone).length > 0,
  }
}
