// Αυστηρά τεστ για τους συνδέσμους εξωτερικών ημερολογίων (externalLinks.ts).
// Τρέξε: npx tsx lib/calendar/externalLinks.test.ts
import {
  googleCalendarUrl, outlookLiveUrl, office365Url, yahooCalendarUrl,
  buildICS, icsDataUri, eventShareText, whatsappShareUrl, viberShareUrl,
  addDaysCompact, allCalendarLinks,
} from './externalLinks'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name) } }

const allDay = { title: 'Πληρωμή ΕΝΦΙΑ', date: '2026-09-01', details: 'Α δόση', location: 'ΑΑΔΕ' }
const timed  = { title: 'Ραντεβού με υδραυλικό', date: '2026-07-11', time: '09:30', durationMinutes: 90, location: 'Διαμέρισμα' }

// ── addDaysCompact: ακέραια αριθμητική, χωρίς σφάλμα ζώνης ώρας ──────────────
ok('addDays +1 same month', addDaysCompact('2026-09-01', 1) === '20260902')
ok('addDays crosses month', addDaysCompact('2026-01-31', 1) === '20260201')
ok('addDays crosses year', addDaysCompact('2026-12-31', 1) === '20270101')
ok('addDays leap day', addDaysCompact('2028-02-28', 1) === '20280229')

// ── Google: ολοήμερο = end-exclusive επόμενη μέρα ───────────────────────────
const g = googleCalendarUrl(allDay)
ok('google host', g.startsWith('https://calendar.google.com/calendar/render?'))
ok('google action', g.includes('action=TEMPLATE'))
ok('google all-day dates end-exclusive', g.includes('dates=20260901%2F20260902'))
ok('google encodes title', decodeURIComponent(g).includes('text=Πληρωμή ΕΝΦΙΑ'))
ok('google details', decodeURIComponent(g).includes('details=Α δόση'))

// ── Google: τιμαρισμένο = start/end με διάρκεια ─────────────────────────────
const gt = googleCalendarUrl(timed)
ok('google timed start', gt.includes('20260711T093000'))
ok('google timed end +90min', gt.includes('20260711T110000'))

// ── Outlook.com ─────────────────────────────────────────────────────────────
const o = outlookLiveUrl(timed)
ok('outlook host', o.startsWith('https://outlook.live.com/calendar/0/deeplink/compose?'))
ok('outlook addevent', o.includes('rru=addevent'))
ok('outlook start iso', o.includes('startdt=2026-07-11T09%3A30%3A00'))
ok('outlook end iso', o.includes('enddt=2026-07-11T11%3A00%3A00'))
const oa = outlookLiveUrl(allDay)
ok('outlook allday flag', oa.includes('allday=true'))

// ── Office 365 ──────────────────────────────────────────────────────────────
ok('office host', office365Url(timed).startsWith('https://outlook.office.com/calendar/0/deeplink/compose?'))

// ── Yahoo ───────────────────────────────────────────────────────────────────
const y = yahooCalendarUrl(timed)
ok('yahoo host', y.startsWith('https://calendar.yahoo.com/?'))
ok('yahoo start stamp', y.includes('st=20260711T093000'))
ok('yahoo duration HHMM', y.includes('dur=0130'))
ok('yahoo allday', yahooCalendarUrl(allDay).includes('dur=allday'))

// ── ICS ─────────────────────────────────────────────────────────────────────
const ics = buildICS(timed)
ok('ics begins', ics.startsWith('BEGIN:VCALENDAR\r\n'))
ok('ics ends', ics.endsWith('END:VCALENDAR'))
ok('ics has vevent', ics.includes('BEGIN:VEVENT') && ics.includes('END:VEVENT'))
ok('ics timed dtstart', ics.includes('DTSTART:20260711T093000'))
ok('ics timed dtend', ics.includes('DTEND:20260711T110000'))
ok('ics summary', ics.includes('SUMMARY:Ραντεβού με υδραυλικό'))
ok('ics crlf line endings', ics.split('\r\n').length > 6)
const icsAllDay = buildICS(allDay)
ok('ics all-day uses VALUE=DATE', icsAllDay.includes('DTSTART;VALUE=DATE:20260901'))
ok('ics all-day end-exclusive', icsAllDay.includes('DTEND;VALUE=DATE:20260902'))
// escaping: κόμμα/άνω-τελεία
const icsEsc = buildICS({ title: 'A; B, C', date: '2026-01-01' })
ok('ics escapes semicolon+comma', icsEsc.includes('SUMMARY:A\\; B\\, C'))
ok('ics data uri', icsDataUri(allDay).startsWith('data:text/calendar;charset=utf-8,'))

// ── Share text + deep links ─────────────────────────────────────────────────
ok('share text all-day', eventShareText(allDay) === 'Πληρωμή ΕΝΦΙΑ — 01/09/2026 — ΑΑΔΕ — Α δόση')
ok('share text timed has hour', eventShareText(timed).includes('στις 09:30'))
ok('whatsapp url', whatsappShareUrl('γεια').startsWith('https://wa.me/?text='))
ok('viber url', viberShareUrl('γεια').startsWith('viber://forward?text='))
ok('whatsapp encodes', whatsappShareUrl('a b').includes('a%20b'))

// ── allCalendarLinks bundle ─────────────────────────────────────────────────
const bundle = allCalendarLinks(timed)
ok('bundle keys', ['google','outlook','office','yahoo','ics','whatsapp','viber'].every(k => (bundle as any)[k]))

// invalid time → treated as all-day (δεν σκάει)
ok('invalid time falls back to all-day', googleCalendarUrl({ title: 'X', date: '2026-05-05', time: '99:99' }).includes('dates=20260505%2F20260506'))

console.log(`externalLinks.ts, ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('Απέτυχαν:\n - ' + fails.join('\n - ')); process.exit(1) }
else console.log('όλα πέρασαν')
