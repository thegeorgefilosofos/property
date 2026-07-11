// Τεστ για τις ελληνικές αργίες (greekHolidays.ts). Τρέξε: npx tsx lib/calendar/greekHolidays.test.ts
import { orthodoxEaster, greekHolidays, holidayName, isHoliday, isWeekend, isNonWorkingDay, upcomingHolidays } from './greekHolidays'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name) } }
const isoU = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`

// ── Ορθόδοξο Πάσχα: γνωστές γρηγοριανές ημερομηνίες ─────────────────────────
ok('easter 2024 = 05-05', isoU(orthodoxEaster(2024)) === '2024-05-05')
ok('easter 2025 = 04-20', isoU(orthodoxEaster(2025)) === '2025-04-20')
ok('easter 2026 = 04-12', isoU(orthodoxEaster(2026)) === '2026-04-12')
ok('easter 2027 = 05-02', isoU(orthodoxEaster(2027)) === '2027-05-02')

// ── Σταθερές αργίες ─────────────────────────────────────────────────────────
ok('Πρωτοχρονιά', holidayName('2026-01-01') === 'Πρωτοχρονιά')
ok('Θεοφάνεια', holidayName('2026-01-06') === 'Θεοφάνεια')
ok('25 Μαρτίου', holidayName('2026-03-25')?.includes('25ης Μαρτίου') === true)
ok('Πρωτομαγιά', holidayName('2026-05-01') === 'Εργατική Πρωτομαγιά')
ok('Δεκαπενταύγουστος', holidayName('2026-08-15') === 'Κοίμηση της Θεοτόκου')
ok('28 Οκτωβρίου', holidayName('2026-10-28')?.includes('Όχι') === true)
ok('Χριστούγεννα', holidayName('2026-12-25') === 'Χριστούγεννα')
ok('Σύναξη Θεοτόκου', holidayName('2026-12-26') === 'Σύναξη της Θεοτόκου')

// ── Κινητές εορτές 2026 (Πάσχα 12/04) ──────────────────────────────────────
ok('Καθαρά Δευτέρα 2026 = 23/02', holidayName('2026-02-23') === 'Καθαρά Δευτέρα')
ok('Μεγάλη Παρασκευή 2026 = 10/04', holidayName('2026-04-10') === 'Μεγάλη Παρασκευή')
ok('Δευτέρα Πάσχα 2026 = 13/04', holidayName('2026-04-13') === 'Δευτέρα του Πάσχα')
ok('Αγίου Πνεύματος 2026 = 01/06', holidayName('2026-06-01') === 'Αγίου Πνεύματος')

// ── isHoliday / regular day ─────────────────────────────────────────────────
ok('isHoliday true', isHoliday('2026-12-25') === true)
ok('isHoliday false', isHoliday('2026-07-15') === false)
ok('holidayName null on normal day', holidayName('2026-07-15') === null)
ok('holidayName null on garbage', holidayName('not-a-date') === null)

// ── Σαββατοκύριακο ──────────────────────────────────────────────────────────
ok('2026-07-11 is Saturday', isWeekend('2026-07-11') === true)
ok('2026-07-12 is Sunday', isWeekend('2026-07-12') === true)
ok('2026-07-13 is Monday (weekday)', isWeekend('2026-07-13') === false)
ok('nonWorking: weekend', isNonWorkingDay('2026-07-11') === true)
ok('nonWorking: holiday weekday', isNonWorkingDay('2026-03-25') === true)
ok('nonWorking: plain weekday false', isNonWorkingDay('2026-07-15') === false)

// ── upcomingHolidays ────────────────────────────────────────────────────────
const up = upcomingHolidays('2026-12-20', 3)
ok('upcoming count', up.length === 3)
ok('upcoming sorted + from date', up[0].date === '2026-12-25' && up[1].date === '2026-12-26')
ok('upcoming crosses year', up[2].date === '2027-01-01')

console.log(`greekHolidays.ts, ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('Απέτυχαν:\n - ' + fails.join('\n - ')); process.exit(1) }
else console.log('όλα πέρασαν')
