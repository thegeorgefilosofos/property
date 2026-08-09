// Αυστηρά τεστ για τη λογική ειδοποιήσεων συσκευής (notify.ts).
// Τρέξε: npx tsx lib/calendar/notify.test.ts
import { minutesOfDay, localDateStr, dueReminders, notifyBody, type NotifiableEvent } from './notify'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// ── minutesOfDay ─────────────────────────────────────────────────────────────
ok('09:00 → 540', minutesOfDay('09:00') === 540)
ok('17:30 → 1050', minutesOfDay('17:30') === 1050)
ok('00:00 → 0', minutesOfDay('00:00') === 0)
ok('23:59 → 1439', minutesOfDay('23:59') === 1439)
ok('κενό → null', minutesOfDay('') === null)
ok('null → null', minutesOfDay(null) === null)
ok('undefined → null', minutesOfDay(undefined) === null)
ok('άκυρο 25:00 → null', minutesOfDay('25:00') === null)
ok('άκυρο 10:99 → null', minutesOfDay('10:99') === null)
ok('σκουπίδια → null', minutesOfDay('abc') === null)
ok('με κενά « 9:05 » → 545', minutesOfDay(' 9:05 ') === 545)

// ── localDateStr (τοπική, όχι UTC) ───────────────────────────────────────────
ok('localDateStr μηδενικά', localDateStr(new Date(2026, 0, 5, 23, 0)) === '2026-01-05')
ok('localDateStr διψήφια', localDateStr(new Date(2026, 10, 20, 1, 0)) === '2026-11-20')

// ── dueReminders ─────────────────────────────────────────────────────────────
const NOW = new Date(2026, 6, 11, 9, 0) // Σάβ 2026-07-11 09:00 τοπική
const evs: NotifiableEvent[] = [
  { id: 'a', title: 'Ραντεβού μάστορα', event_date: '2026-07-11', event_time: '09:05', status: 'pending' },
  { id: 'b', title: 'Μεθαύριο',        event_date: '2026-07-13', event_time: '09:05', status: 'pending' },
  { id: 'c', title: 'Πληρωμένο',        event_date: '2026-07-11', event_time: '09:05', status: 'paid' },
  { id: 'd', title: 'Πέρασε',           event_date: '2026-07-11', event_time: '08:00', status: 'pending' },
  { id: 'e', title: 'Αργότερα',         event_date: '2026-07-11', event_time: '11:00', status: 'pending' },
  { id: 'f', title: 'Ολοήμερο',         event_date: '2026-07-11', event_time: null,    status: 'pending' },
  { id: 'g', title: 'Ακριβώς τώρα',     event_date: '2026-07-11', event_time: '09:00', status: 'pending' },
]

const due = dueReminders(evs, NOW, 10)
const ids = new Set(due.map(e => e.id))
ok('εντός lead window (a)', ids.has('a'))
ok('ακριβώς τώρα (g)', ids.has('g'))
ok('άλλη μέρα εκτός (b)', !ids.has('b'))
ok('πληρωμένο εκτός (c)', !ids.has('c'))
ok('πέρασε εκτός (d)', !ids.has('d'))
ok('πολύ αργότερα εκτός (e)', !ids.has('e'))
ok('ολοήμερο εκτός (f)', !ids.has('f'))
ok('πλήθος = 2', due.length === 2)

// ήδη ειδοποιημένα δεν ξαναχτυπούν
const due2 = dueReminders(evs, NOW, 10, new Set(['a']))
ok('alreadyNotified εξαιρεί το a', !due2.some(e => e.id === 'a'))
ok('alreadyNotified κρατά το g', due2.some(e => e.id === 'g'))

// όριο lead window: 10' ακριβώς μέσα, 11' έξω
const e10: NotifiableEvent[] = [{ id: 'x', title: 'X', event_date: '2026-07-11', event_time: '09:10', status: 'pending' }]
ok('όριο +10 μέσα', dueReminders(e10, NOW, 10).length === 1)
const e11: NotifiableEvent[] = [{ id: 'y', title: 'Y', event_date: '2026-07-11', event_time: '09:11', status: 'pending' }]
ok('όριο +11 έξω', dueReminders(e11, NOW, 10).length === 0)

// κενή/χαλασμένη είσοδος δεν πετάει
ok('κενός πίνακας', dueReminders([], NOW).length === 0)
ok('null στοιχεία ανθεκτικά', dueReminders([null as never, evs[0]], NOW, 10).length === 1)

// ── notifyBody ───────────────────────────────────────────────────────────────
ok('body «τώρα»', notifyBody(evs[6], NOW) === '09:00 · τώρα')
ok('body «σε 5 λεπτά»', notifyBody(evs[0], NOW) === '09:05 · σε 5 λεπτά')
ok('body «σε 1 λεπτό»', notifyBody({ id: 'z', title: 'Z', event_date: '2026-07-11', event_time: '09:01' }, NOW) === '09:01 · σε 1 λεπτό')
ok('body ολοήμερο = τίτλος', notifyBody(evs[5], NOW) === 'Ολοήμερο')

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nnotify.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
