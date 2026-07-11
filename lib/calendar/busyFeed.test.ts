// Αυστηρά τεστ για το busy iCal feed + ανίχνευση συγκρούσεων (busyFeed.ts).
// Τρέξε: npx tsx lib/calendar/busyFeed.test.ts
import { buildBusyICS, addDaysISO, findStayConflicts, busyFeedFilename, type BusyStay } from './busyFeed'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// Βοηθός: αριθμός εμφανίσεων ενός substring.
const count = (hay: string, needle: string) => hay.split(needle).length - 1

// ── addDaysISO ───────────────────────────────────────────────────────────────
ok('addDaysISO +1', addDaysISO('2026-08-01', 1) === '2026-08-02')
ok('addDaysISO +0', addDaysISO('2026-08-01', 0) === '2026-08-01')
ok('addDaysISO όριο μήνα', addDaysISO('2026-08-31', 1) === '2026-09-01')
ok('addDaysISO όριο έτους', addDaysISO('2026-12-31', 1) === '2027-01-01')
ok('addDaysISO -1', addDaysISO('2026-03-01', -1) === '2026-02-28')
ok('addDaysISO δίσεκτο', addDaysISO('2028-02-28', 1) === '2028-02-29')
ok('addDaysISO +30', addDaysISO('2026-01-15', 30) === '2026-02-14')
ok('addDaysISO padding', addDaysISO('2026-01-05', 4) === '2026-01-09')

// ── buildBusyICS: βασική δομή ─────────────────────────────────────────────────
const stays: BusyStay[] = [
  { id: 's1', check_in: '2026-08-01', check_out: '2026-08-05', channel: 'airbnb', guest_name: 'Maria Rossi' },
  { id: 's2', check_in: '2026-08-10', channel: 'booking' },              // χωρίς checkout → +1
  { id: 's3', check_in: '', check_out: '2026-08-20' },                    // άκυρο → skip
  { id: 's4', check_in: '2026-09-01', check_out: '2026-08-20' },          // checkout < checkin → +1
  { id: 's5', check_in: '2026-09-10', check_out: '2026-09-10' },          // checkout == checkin → +1
]
const ics = buildBusyICS(stays, 'Βίλα Ελιά')

ok('περιέχει BEGIN:VCALENDAR', ics.includes('BEGIN:VCALENDAR'))
ok('περιέχει END:VCALENDAR', ics.includes('END:VCALENDAR'))
ok('VERSION:2.0', ics.includes('VERSION:2.0'))
ok('PRODID υπάρχει', /\r\nPRODID:/.test(ics))
ok('CALSCALE:GREGORIAN', ics.includes('CALSCALE:GREGORIAN'))
ok('METHOD:PUBLISH', ics.includes('METHOD:PUBLISH'))
ok('X-WR-CALNAME με τίτλο + Κρατήσεις', ics.includes('X-WR-CALNAME:Βίλα Ελιά — Κρατήσεις'))

// 4 έγκυρα stays (s1,s2,s4,s5) → 4 VEVENT
ok('4 VEVENT (ένα ανά έγκυρο stay)', count(ics, 'BEGIN:VEVENT') === 4)
ok('4 END:VEVENT', count(ics, 'END:VEVENT') === 4)
ok('s3 skip (άκυρο check_in)', !ics.includes('stay-s3@propertyos'))

// UID format
ok('UID s1', ics.includes('UID:stay-s1@propertyos'))
ok('UID s2', ics.includes('UID:stay-s2@propertyos'))

// ── DTSTART / DTEND (all-day, exclusive) ──────────────────────────────────────
ok('s1 DTSTART all-day', ics.includes('DTSTART;VALUE=DATE:20260801'))
ok('s1 DTEND exclusive = ημέρα checkout', ics.includes('DTEND;VALUE=DATE:20260805'))
ok('s2 χωρίς checkout → DTEND = check_in+1', ics.includes('DTSTART;VALUE=DATE:20260810') && ics.includes('DTEND;VALUE=DATE:20260811'))
ok('s4 checkout<checkin → +1', ics.includes('DTSTART;VALUE=DATE:20260901') && ics.includes('DTEND;VALUE=DATE:20260902'))
ok('s5 checkout==checkin → +1', ics.includes('DTSTART;VALUE=DATE:20260910') && ics.includes('DTEND;VALUE=DATE:20260911'))

// ── SUMMARY γενικό, καμία διαρροή ονόματος ─────────────────────────────────────
ok('SUMMARY γενικό «Μη διαθέσιμο»', ics.includes('SUMMARY:Μη διαθέσιμο'))
ok('4 SUMMARY (ένα ανά event)', count(ics, 'SUMMARY:Μη διαθέσιμο') === 4)
ok('δεν διαρρέει όνομα επισκέπτη', !ics.includes('Maria Rossi'))
ok('DESCRIPTION κανάλι (Airbnb)', ics.includes('DESCRIPTION:Κανάλι: Airbnb'))
ok('DESCRIPTION κανάλι (Booking.com)', ics.includes('DESCRIPTION:Κανάλι: Booking.com'))

// ── TRANSP / STATUS ──────────────────────────────────────────────────────────
ok('TRANSP:OPAQUE', ics.includes('TRANSP:OPAQUE'))
ok('STATUS:CONFIRMED', ics.includes('STATUS:CONFIRMED'))
ok('4 TRANSP', count(ics, 'TRANSP:OPAQUE') === 4)

// ── CRLF endings ─────────────────────────────────────────────────────────────
ok('CRLF line endings', ics.includes('\r\n'))
ok('καμία γυμνή \\n χωρίς \\r', !/[^\r]\n/.test(ics))
ok('ξεκινά με BEGIN:VCALENDAR\\r\\n', ics.startsWith('BEGIN:VCALENDAR\r\n'))

// ── Escaping ειδικών χαρακτήρων στο X-WR-CALNAME ───────────────────────────────
const icsEsc = buildBusyICS([], 'A,B;C\\D')
ok('escape κόμμα/;/\\ στο calname', icsEsc.includes('X-WR-CALNAME:A\\,B\\;C\\\\D — Κρατήσεις'))
ok('κενό stays → κανένα VEVENT', count(icsEsc, 'BEGIN:VEVENT') === 0)

// ── Line folding στα 75 octets ────────────────────────────────────────────────
const longTitle = 'X'.repeat(200)
const icsLong = buildBusyICS([], longTitle)
const longLines = icsLong.split('\r\n')
ok('folding: καμία γραμμή > 75 octets', longLines.every((l) => Buffer.byteLength(l, 'utf8') <= 75))
ok('folding: γραμμές συνέχειας ξεκινούν με κενό', icsLong.includes('\r\n '))

// ── findStayConflicts ────────────────────────────────────────────────────────
// Disjoint (καμία επικάλυψη)
const disjoint: BusyStay[] = [
  { id: 'a', check_in: '2026-08-01', check_out: '2026-08-05' },
  { id: 'b', check_in: '2026-08-10', check_out: '2026-08-12' },
]
ok('disjoint → 0 συγκρούσεις', findStayConflicts(disjoint).length === 0)

// Touching (checkout == επόμενο checkin) → ΟΧΙ σύγκρουση
const touching: BusyStay[] = [
  { id: 'a', check_in: '2026-08-01', check_out: '2026-08-05' },
  { id: 'b', check_in: '2026-08-05', check_out: '2026-08-08' },
]
ok('touching → 0 συγκρούσεις', findStayConflicts(touching).length === 0)

// Μερική επικάλυψη → σωστές νύχτες
const partial: BusyStay[] = [
  { id: 'a', check_in: '2026-08-01', check_out: '2026-08-05' },  // [01,05)
  { id: 'b', check_in: '2026-08-03', check_out: '2026-08-08' },  // [03,08) → overlap [03,05) = 2
]
const pc = findStayConflicts(partial)
ok('partial → 1 σύγκρουση', pc.length === 1)
ok('partial → 2 νύχτες', pc[0]?.nights === 2)
ok('partial → σωστό ζεύγος a,b', pc[0]?.a.id === 'a' && pc[0]?.b.id === 'b')

// Πλήρης εμφώλευση (nested)
const nested: BusyStay[] = [
  { id: 'a', check_in: '2026-08-01', check_out: '2026-08-10' },  // [01,10)
  { id: 'b', check_in: '2026-08-03', check_out: '2026-08-06' },  // [03,06) εντός → 3 νύχτες
]
const nc = findStayConflicts(nested)
ok('nested → 1 σύγκρουση', nc.length === 1)
ok('nested → 3 νύχτες (πλήρης εσωτερική)', nc[0]?.nights === 3)

// Ίδιο διάστημα ακριβώς
const same: BusyStay[] = [
  { id: 'a', check_in: '2026-08-01', check_out: '2026-08-04' },
  { id: 'b', check_in: '2026-08-01', check_out: '2026-08-04' },
]
const sc = findStayConflicts(same)
ok('same → 1 σύγκρουση', sc.length === 1)
ok('same → 3 νύχτες', sc[0]?.nights === 3)

// Χωρίς checkout (1 νύχτα) επικάλυψη
const oneNight: BusyStay[] = [
  { id: 'a', check_in: '2026-08-01' },                            // [01,02)
  { id: 'b', check_in: '2026-08-01', check_out: '2026-08-03' },   // [01,03) → overlap 1
]
const onc = findStayConflicts(oneNight)
ok('χωρίς checkout → 1 σύγκρουση', onc.length === 1)
ok('χωρίς checkout → 1 νύχτα επικάλυψη', onc[0]?.nights === 1)

// Three-way: όλα επικαλύπτονται → 3 ζεύγη (μη διατεταγμένα, μία φορά το καθένα)
const three: BusyStay[] = [
  { id: 'a', check_in: '2026-08-01', check_out: '2026-08-10' },
  { id: 'b', check_in: '2026-08-02', check_out: '2026-08-09' },
  { id: 'c', check_in: '2026-08-03', check_out: '2026-08-08' },
]
const tc = findStayConflicts(three)
ok('three-way → 3 ζεύγη', tc.length === 3)
ok('three-way → κάθε ζεύγος μία φορά', (() => {
  const keys = tc.map((c) => `${c.a.id}-${c.b.id}`).sort().join(',')
  return keys === 'a-b,a-c,b-c'
})())

// Ντετερμινιστική σειρά (κατά check_in, μετά id) — ανεξάρτητη από input order
const unordered: BusyStay[] = [
  { id: 'z', check_in: '2026-08-05', check_out: '2026-08-09' },
  { id: 'm', check_in: '2026-08-01', check_out: '2026-08-07' },
  { id: 'k', check_in: '2026-08-01', check_out: '2026-08-03' },
]
const uc = findStayConflicts(unordered)
ok('deterministic: πρώτο ζεύγος k,m (ίδιο check_in, id order)', uc[0]?.a.id === 'k' && uc[0]?.b.id === 'm')
ok('deterministic: επόμενα ζεύγη ξεκινούν από m (νωρίτερο check_in)', uc[1]?.a.id === 'm' && uc[1]?.b.id === 'z')
ok('deterministic: σταθερό αποτέλεσμα', findStayConflicts(unordered).map((c) => `${c.a.id}${c.b.id}`).join(',') === uc.map((c) => `${c.a.id}${c.b.id}`).join(','))

// Άκυρα check_in αγνοούνται στην ανίχνευση
ok('συγκρούσεις: άκυρο check_in αγνοείται', findStayConflicts([{ id: 'x', check_in: '' }, { id: 'a', check_in: '2026-08-01', check_out: '2026-08-05' }]).length === 0)
ok('συγκρούσεις: κενό input', findStayConflicts([]).length === 0)

// ── busyFeedFilename ─────────────────────────────────────────────────────────
ok('filename ελληνικά → transliterate', busyFeedFilename('Βίλα Ελιά') === 'krathseis-vila-elia.ics')
ok('filename κενά → -', busyFeedFilename('My Beach House') === 'krathseis-my-beach-house.ics')
ok('filename lowercase', busyFeedFilename('LOFT') === 'krathseis-loft.ics')
ok('filename αφαίρεση unsafe chars', busyFeedFilename('Apt #3 / A!') === 'krathseis-apt-3-a.ics')
ok('filename σύμπτυξη πολλαπλών -', busyFeedFilename('a   b') === 'krathseis-a-b.ics')
ok('filename κενός τίτλος → fallback', busyFeedFilename('') === 'krathseis-akinito.ics')
ok('filename μόνο σύμβολα → fallback', busyFeedFilename('!!!') === 'krathseis-akinito.ics')

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nbusyFeed.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
