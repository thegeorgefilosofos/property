// Αυστηρά τεστ για την εισαγωγή .ics (icsImport.ts).
// Τρέξε: npx tsx lib/calendar/icsImport.test.ts
import { parseICS, type ImportedEvent } from './icsImport'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name) } }

// Βοηθός: τύλιξε γραμμές σε VCALENDAR με CRLF, όπως ένα αληθινό .ics.
const ics = (...lines: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n')
const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']

// ── Ολοήμερο: ρητό VALUE=DATE ─────────────────────────────────────────────────
{
  const r = parseICS(ics(...vevent('SUMMARY:Αργία', 'DTSTART;VALUE=DATE:20260711')))
  ok('allday count', r.length === 1)
  ok('allday date', r[0].date === '2026-07-11')
  ok('allday time null', r[0].time === null)
  ok('allday duration null', r[0].durationMinutes === null)
  ok('allday title', r[0].title === 'Αργία')
}

// ── Ολοήμερο: γυμνό YYYYMMDD (8 ψηφία) ─────────────────────────────────────────
{
  const r = parseICS(ics(...vevent('SUMMARY:Bare', 'DTSTART:20260101')))
  ok('bare allday date', r[0].date === '2026-01-01')
  ok('bare allday time null', r[0].time === null)
}

// ── Χρονισμένο με DTEND → διάρκεια ─────────────────────────────────────────────
{
  const r = parseICS(ics(...vevent(
    'SUMMARY:Συνάντηση',
    'DTSTART:20260711T090000',
    'DTEND:20260711T101500',
  )))
  ok('timed date', r[0].date === '2026-07-11')
  ok('timed time', r[0].time === '09:00')
  ok('timed duration 75', r[0].durationMinutes === 75)
}

// ── Χρονισμένο με 'Z' (UTC) → κρατάμε το wall-clock, χωρίς μετατόπιση ──────────
{
  const r = parseICS(ics(...vevent(
    'SUMMARY:UTC',
    'DTSTART:20260711T140000Z',
    'DTEND:20260711T150000Z',
  )))
  ok('utc time unshifted', r[0].time === '14:00')
  ok('utc duration 60', r[0].durationMinutes === 60)
}

// ── Ολονύκτιο (DTEND επόμενη ημέρα) 23:00 → 01:00 = 120 ────────────────────────
{
  const r = parseICS(ics(...vevent(
    'SUMMARY:Νυχτερινό',
    'DTSTART:20260711T230000',
    'DTEND:20260712T010000',
  )))
  ok('overnight time', r[0].time === '23:00')
  ok('overnight duration 120', r[0].durationMinutes === 120)
}

// ── Ξεδίπλωμα γραμμών: μεγάλο DESCRIPTION σε δύο γραμμές με αρχικό κενό ─────────
{
  const r = parseICS(ics(...vevent(
    'SUMMARY:Fold',
    'DTSTART:20260711T090000',
    'DESCRIPTION:Πρώτο μέρος και ',      // η επόμενη γραμμή αρχίζει με κενό → συνέχεια
    ' δεύτερο μέρος',
  )))
  ok('folded joined', r[0].notes === 'Πρώτο μέρος και δεύτερο μέρος')
}

// ── Ξεδίπλωμα με tab ───────────────────────────────────────────────────────────
{
  const r = parseICS(ics(...vevent(
    'SUMMARY:FoldTab',
    'DTSTART:20260711T090000',
    'DESCRIPTION:AAA',
    '\tBBB',
  )))
  ok('folded tab joined', r[0].notes === 'AAABBB')
}

// ── Αποδραστικοί χαρακτήρες: \, \; \n \\ ──────────────────────────────────────
{
  const r = parseICS(ics(...vevent(
    'SUMMARY:Α\\, Β\\; Γ',
    'DTSTART:20260711T090000',
    'DESCRIPTION:γραμμή1\\nγραμμή2',
    'LOCATION:Οδός\\\\42',
  )))
  ok('escape comma+semicolon', r[0].title === 'Α, Β; Γ')
  ok('escape newline', r[0].notes === 'γραμμή1\nγραμμή2')
  ok('escape backslash', r[0].location === 'Οδός\\42')
}

// ── LOCATION/DESCRIPTION κενά → null ──────────────────────────────────────────
{
  const r = parseICS(ics(...vevent(
    'SUMMARY:Κενά',
    'DTSTART:20260711T090000',
    'DESCRIPTION:',
    'LOCATION:',
  )))
  ok('empty notes null', r[0].notes === null)
  ok('empty location null', r[0].location === null)
}

// ── Πολλαπλά VEVENT → πολλαπλά αποτελέσματα, με σειρά ─────────────────────────
{
  const r = parseICS(ics(
    ...vevent('SUMMARY:Πρώτο', 'DTSTART:20260711T090000'),
    ...vevent('SUMMARY:Δεύτερο', 'DTSTART:20260712T100000'),
    ...vevent('SUMMARY:Τρίτο', 'DTSTART:20260713'),
  ))
  ok('multi count', r.length === 3)
  ok('multi order', r[0].title === 'Πρώτο' && r[1].title === 'Δεύτερο' && r[2].title === 'Τρίτο')
  ok('multi third allday', r[2].time === null && r[2].date === '2026-07-13')
}

// ── VEVENT με VALARM → το γεγονός αναλύεται κανονικά ─────────────────────────
{
  const r = parseICS(ics(...vevent(
    'SUMMARY:Με ξυπνητήρι',
    'DTSTART:20260711T090000',
    'DTEND:20260711T093000',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT15M',
    'DESCRIPTION:ΜΗΝ με πάρεις για SUMMARY',   // εσωτερικό VALARM → πρέπει να αγνοηθεί
    'END:VALARM',
  )))
  ok('valarm event parsed', r.length === 1)
  ok('valarm title intact', r[0].title === 'Με ξυπνητήρι')
  ok('valarm inner ignored', r[0].notes === null)
  ok('valarm duration 30', r[0].durationMinutes === 30)
}

// ── Λείπει SUMMARY → fallback 'Γεγονός' ───────────────────────────────────────
{
  const r = parseICS(ics(...vevent('DTSTART:20260711T090000')))
  ok('missing summary fallback', r[0].title === 'Γεγονός')
  const r2 = parseICS(ics(...vevent('SUMMARY:', 'DTSTART:20260711T090000')))
  ok('empty summary fallback', r2[0].title === 'Γεγονός')
}

// ── Κενό string → [] και καθόλου VEVENT → [] ─────────────────────────────────
{
  ok('empty string []', parseICS('').length === 0)
  ok('no vevent []', parseICS(ics('X-NOTHING:here')).length === 0)
}

// ── VEVENT χωρίς DTSTART → παραλείπεται ───────────────────────────────────────
{
  const r = parseICS(ics(
    ...vevent('SUMMARY:Χωρίς αρχή'),
    ...vevent('SUMMARY:Έγκυρο', 'DTSTART:20260711T090000'),
  ))
  ok('no-dtstart skipped', r.length === 1)
  ok('no-dtstart valid kept', r[0].title === 'Έγκυρο')
}

// ── Μη έγκυρο DTSTART (κακοσχηματισμένο) → παραλείπεται, δεν πετάει ────────────
{
  const r = parseICS(ics(...vevent('SUMMARY:Σκουπίδι', 'DTSTART:not-a-date')))
  ok('garbage dtstart skipped', r.length === 0)
}

// ── DTEND ολοήμερο ή χωρίς → διάρκεια null ─────────────────────────────────────
{
  const r = parseICS(ics(...vevent('SUMMARY:Μόνο αρχή', 'DTSTART:20260711T090000')))
  ok('no dtend duration null', r[0].durationMinutes === null)
  const r2 = parseICS(ics(...vevent('SUMMARY:Ολοήμερο με λήξη', 'DTSTART;VALUE=DATE:20260711', 'DTEND;VALUE=DATE:20260713')))
  ok('allday dtend duration null', r2[0].durationMinutes === null)
}

// ── Params με TZID αγνοούνται (κρατάμε wall-clock) ────────────────────────────
{
  const r = parseICS(ics(...vevent('SUMMARY:TZ', 'DTSTART;TZID=Europe/Athens:20260711T120000')))
  ok('tzid ignored time', r[0].time === '12:00')
  ok('tzid ignored date', r[0].date === '2026-07-11')
}

// ── Ξεδίπλωμα με LF (όχι CRLF) πρέπει επίσης να δουλεύει ──────────────────────
{
  const text = 'BEGIN:VEVENT\nSUMMARY:LF\nDTSTART:20260711T090000\nEND:VEVENT'
  const r = parseICS(text)
  ok('lf newlines parsed', r.length === 1 && r[0].title === 'LF')
}

// ── έλεγχος τύπου: όλα τα πεδία υπάρχουν ──────────────────────────────────────
{
  const r = parseICS(ics(...vevent('SUMMARY:Σχήμα', 'DTSTART:20260711T090000', 'DTEND:20260711T100000')))
  const e: ImportedEvent = r[0]
  ok('shape complete', typeof e.title === 'string' && typeof e.date === 'string'
    && (e.time === null || typeof e.time === 'string')
    && (e.durationMinutes === null || typeof e.durationMinutes === 'number')
    && (e.notes === null || typeof e.notes === 'string')
    && (e.location === null || typeof e.location === 'string'))
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nicsImport.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
