// Αυστηρά τεστ για την πρόσκληση συμμετέχοντα (invite.ts).
// Τρέξε: npx tsx lib/calendar/invite.test.ts
import {
  buildInviteICS, inviteIcsDataUri, inviteMailto,
  inviteWhatsApp, inviteViber, inviteText, canInvite,
  type InviteInput,
} from './invite'
import { buildICS } from './externalLinks'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name) } }

// ── Δείγματα ──────────────────────────────────────────────────────────────────
const timed: InviteInput = {
  title: 'Ραντεβού με υδραυλικό', date: '2026-07-11', time: '09:30', durationMinutes: 90,
  location: 'Διαμέρισμα', organizerName: 'Ελένη', organizerEmail: 'eleni@example.com',
  attendeeName: 'Γιώργος', attendeeEmail: 'giorgos@example.com', attendeePhone: '+30 694 1234567',
}
const allDay: InviteInput = {
  title: 'Πληρωμή ΕΝΦΙΑ', date: '2026-09-01', details: 'Α δόση', location: 'ΑΑΔΕ',
}
const noContact: InviteInput = { title: 'Μόνο γεγονός', date: '2026-05-05', time: '10:00' }

// ── buildInviteICS: σκελετός ─────────────────────────────────────────────────
const ics = buildInviteICS(timed)
ok('ics begins VCALENDAR', ics.startsWith('BEGIN:VCALENDAR\r\n'))
ok('ics ends VCALENDAR', ics.endsWith('END:VCALENDAR'))
ok('ics has vevent', ics.includes('BEGIN:VEVENT') && ics.includes('END:VEVENT'))
ok('ics has METHOD:REQUEST', ics.includes('\r\nMETHOD:REQUEST\r\n'))
ok('ics method before vevent', ics.indexOf('METHOD:REQUEST') < ics.indexOf('BEGIN:VEVENT'))
ok('ics crlf line endings', ics.split('\r\n').length > 8)
ok('ics no bare LF', !/[^\r]\n/.test(ics))

// ── ORGANIZER ────────────────────────────────────────────────────────────────
ok('ics ORGANIZER with CN', ics.includes('ORGANIZER;CN=Ελένη:mailto:eleni@example.com'))
const icsNoOrg = buildInviteICS({ ...timed, organizerEmail: undefined, organizerName: 'Ελένη' })
ok('ics omits ORGANIZER when no email', !icsNoOrg.includes('ORGANIZER'))
const icsOrgNoName = buildInviteICS({ ...timed, organizerName: undefined })
ok('ics ORGANIZER without CN', icsOrgNoName.includes('ORGANIZER:mailto:eleni@example.com'))

// ── ATTENDEE ─────────────────────────────────────────────────────────────────
ok('ics ATTENDEE RSVP', ics.includes('ATTENDEE;CN=Γιώργος;RSVP=TRUE:mailto:giorgos@example.com'))
const icsNoAtt = buildInviteICS({ ...timed, attendeeEmail: undefined })
ok('ics omits ATTENDEE when no email', !icsNoAtt.includes('ATTENDEE'))
const icsAttNoName = buildInviteICS({ ...timed, attendeeName: undefined })
ok('ics ATTENDEE without CN', icsAttNoName.includes('ATTENDEE;RSVP=TRUE:mailto:giorgos@example.com'))

// ── DTSTART/DTEND: πανομοιότυπα με buildICS (timed) ──────────────────────────
const baseTimed = buildICS({ title: timed.title, date: timed.date, time: timed.time, durationMinutes: timed.durationMinutes, location: timed.location })
ok('ics timed DTSTART has T + time', ics.includes('DTSTART:20260711T093000'))
ok('ics timed DTEND +90min', ics.includes('DTEND:20260711T110000'))
ok('ics DTSTART matches buildICS', ics.includes('DTSTART:20260711T093000') && baseTimed.includes('DTSTART:20260711T093000'))
ok('ics DTEND matches buildICS', ics.includes('DTEND:20260711T110000') && baseTimed.includes('DTEND:20260711T110000'))
ok('ics SUMMARY present', ics.includes('SUMMARY:Ραντεβού με υδραυλικό'))

// ── All-day: μορφή VALUE=DATE όπως buildICS ──────────────────────────────────
const icsAll = buildInviteICS(allDay)
const baseAll = buildICS({ title: allDay.title, date: allDay.date, details: allDay.details, location: allDay.location })
ok('ics all-day DTSTART VALUE=DATE', icsAll.includes('DTSTART;VALUE=DATE:20260901'))
ok('ics all-day DTEND end-exclusive', icsAll.includes('DTEND;VALUE=DATE:20260902'))
ok('ics all-day matches buildICS DTSTART', baseAll.includes('DTSTART;VALUE=DATE:20260901'))
ok('ics all-day no T in dtstart', !icsAll.includes('DTSTART;VALUE=DATE:20260901T'))
ok('ics all-day still METHOD:REQUEST', icsAll.includes('METHOD:REQUEST'))

// ── Escaping ειδικών χαρακτήρων στο SUMMARY ──────────────────────────────────
const icsEsc = buildInviteICS({ title: 'A; B, C\nD', date: '2026-01-01' })
ok('ics escapes semicolon', icsEsc.includes('A\\;'))
ok('ics escapes comma', icsEsc.includes('B\\, C'))
ok('ics escapes newline', icsEsc.includes('\\nD'))

// ── Line folding στα 75 octets ───────────────────────────────────────────────
const longTitle = 'Πολύ μακρύ ελληνικό θέμα που ξεπερνά σίγουρα τα εβδομήντα πέντε οκτάδες bytes για δοκιμή αναδίπλωσης γραμμής'
const icsLong = buildInviteICS({ title: longTitle, date: '2026-03-03' })
ok('ics folds long line (continuation with leading space)', icsLong.includes('\r\n '))
const noCrlfLong = icsLong.split('\r\n')
ok('ics every physical line <= 75 octets', noCrlfLong.every(l => Buffer.byteLength(l, 'utf8') <= 75))

// ── inviteIcsDataUri ─────────────────────────────────────────────────────────
ok('data uri prefix', inviteIcsDataUri(timed).startsWith('data:text/calendar;charset=utf-8,'))

// ── inviteMailto ─────────────────────────────────────────────────────────────
ok('mailto empty when no email', inviteMailto(noContact) === '')
const mail = inviteMailto(timed)
ok('mailto starts scheme', mail.startsWith('mailto:giorgos@example.com?'))
ok('mailto has subject', mail.includes('subject='))
ok('mailto subject spaces as %20', mail.includes('%20') && !mail.includes('subject=Πρόσκληση+'))
ok('mailto no plus for spaces', !/subject=[^&]*\+/.test(mail))
ok('mailto decoded has title', decodeURIComponent(mail).includes('Ραντεβού με υδραυλικό'))
ok('mailto decoded subject label', decodeURIComponent(mail).includes('Πρόσκληση: Ραντεβού με υδραυλικό'))
ok('mailto body has data uri note', decodeURIComponent(mail).includes('data:text/calendar'))
ok('mailto body has location', decodeURIComponent(mail).includes('Διαμέρισμα'))

// ── inviteWhatsApp / inviteViber ─────────────────────────────────────────────
const wa = inviteWhatsApp(timed)
ok('whatsapp scheme + number', wa.startsWith('https://wa.me/306941234567?text='))
ok('whatsapp has digits', wa.includes('306941234567'))
ok('whatsapp encoded greek text', wa.includes(encodeURIComponent('Ραντεβού')))
ok('whatsapp no bare space', !/\btext=[^&]* /.test(wa))
const waNoPhone = inviteWhatsApp({ ...timed, attendeePhone: undefined })
ok('whatsapp no number when no phone', waNoPhone.startsWith('https://wa.me/?text='))

const vb = inviteViber(timed)
ok('viber scheme', vb.startsWith('viber://forward?text='))
ok('viber has digits', vb.includes('306941234567'))
ok('viber encoded greek text', vb.includes(encodeURIComponent('Ραντεβού')))
const vbNoPhone = inviteViber({ ...timed, attendeePhone: undefined })
ok('viber no number when no phone', vbNoPhone.startsWith('viber://forward?text=') && !vbNoPhone.includes('number='))

// ── canInvite ────────────────────────────────────────────────────────────────
ok('canInvite both', JSON.stringify(canInvite(timed)) === JSON.stringify({ email: true, phone: true }))
ok('canInvite email only', JSON.stringify(canInvite({ ...timed, attendeePhone: undefined })) === JSON.stringify({ email: true, phone: false }))
ok('canInvite phone only', JSON.stringify(canInvite({ ...timed, attendeeEmail: undefined })) === JSON.stringify({ email: false, phone: true }))
ok('canInvite neither', JSON.stringify(canInvite(noContact)) === JSON.stringify({ email: false, phone: false }))
ok('canInvite rejects bad email', canInvite({ ...timed, attendeeEmail: 'χωρίς-παπάκι' }).email === false)

// ── inviteText: μορφοποίηση ημέρας/ώρας/τοποθεσίας ───────────────────────────
ok('inviteText timed full', inviteText(timed) === '«Ραντεβού με υδραυλικό» — Σάββατο 11/07/2026 στις 09:30, Διαμέρισμα. Θα ήθελα να το κλείσουμε — επιβεβαιώνεις;')
ok('inviteText weekday Σάββατο', inviteText(timed).includes('Σάββατο 11/07/2026'))
ok('inviteText all-day omits ώρα', !inviteText(allDay).includes('στις'))
ok('inviteText all-day has weekday', inviteText(allDay).includes('Τρίτη 01/09/2026'))
ok('inviteText omits location when absent', !inviteText(noContact).includes(','))
ok('inviteText no-location has hour', inviteText(noContact).includes('στις 10:00'))

console.log(`invite.ts, ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('Απέτυχαν:\n - ' + fails.join('\n - ')); process.exit(1) }
else console.log('όλα πέρασαν')
