// Μεγάλη σουίτα ελέγχου ΟΛΟΥ του πυρήνα ημερολογίου — αναλλοίωτες (invariants) σε
// εκατοντάδες συνδυασμούς + roundtrips μεταξύ βιβλιοθηκών. Τρέξε:
//   npx tsx lib/calendar/calendar.integration.test.ts
import { expandRecurring, nextOccurrence, type Recurrable } from './recurrence'
import { orthodoxEaster, greekHolidays, holidayName, isWeekend, isNonWorkingDay, upcomingHolidays } from './greekHolidays'
import { toInterval, overlaps, findConflicts, busyIntervalsForDay, findFreeSlots, type BusyEvent } from './availability'
import { buildICS, googleCalendarUrl, allCalendarLinks, addDaysCompact } from './externalLinks'
import { parseICS } from './icsImport'
import { parseQuickAdd } from './quickAdd'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (dt: Date) => `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
const addDays = (d: string, n: number) => { const [y, m, dd] = d.split('-').map(Number); return iso(new Date(Date.UTC(y, m - 1, dd + n))) }
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

// ─────────────────────────────────────────────────────────────────────────────
// 1. RECURRENCE INVARIANTS — πολλοί συνδυασμοί (base × interval × until/count/exdates)
// ─────────────────────────────────────────────────────────────────────────────
const INTERVALS = ['weekly', 'monthly', 'bimonthly', 'quarterly', 'biannual', 'annual']
const BASES = ['2026-01-01', '2026-01-31', '2026-02-15', '2026-03-30', '2026-06-10', '2026-12-31', '2028-02-29', '2027-11-15']
for (const base of BASES) {
  for (const interval of INTERVALS) {
    const ev: Recurrable = { id: 'x', event_date: base, recurring: true, recurring_interval: interval }
    const occ = expandRecurring([ev], base, addDays(base, 800))
    // αναλλοίωτες
    ok(`rec ${base}/${interval}: base first`, occ.length > 0 && occ[0].event_date === base)
    ok(`rec ${base}/${interval}: strictly increasing`, occ.every((o, i) => i === 0 || cmp(o.event_date, occ[i - 1].event_date) > 0))
    ok(`rec ${base}/${interval}: all >= base`, occ.every(o => o.event_date >= base))
    ok(`rec ${base}/${interval}: base not virtual`, !(occ[0] as any)._virtual)
    ok(`rec ${base}/${interval}: rest virtual`, occ.slice(1).every(o => (o as any)._virtual === true))
    ok(`rec ${base}/${interval}: seriesId set`, occ.slice(1).every(o => (o as any)._seriesId === 'x'))
    // nextOccurrence συμφωνεί με το πρώτο βήμα
    const nx = nextOccurrence(base, interval)
    ok(`rec ${base}/${interval}: nextOccurrence matches`, occ.length < 2 || occ[1].event_date === nx)
    // until: κόβει σωστά
    if (occ.length > 3) {
      const until = occ[2].event_date
      const capped = expandRecurring([{ ...ev, recurrence_until: until }], base, addDays(base, 800))
      ok(`rec ${base}/${interval}: until caps`, capped.every(o => o.event_date <= until) && capped[capped.length - 1].event_date === until)
      // count: N εμφανίσεις
      const counted = expandRecurring([{ ...ev, recurrence_count: 3 }], base, addDays(base, 800))
      ok(`rec ${base}/${interval}: count=3`, counted.length === 3)
      // exdate: εξαιρεί τη 2η, μετράει στο count
      const exed = expandRecurring([{ ...ev, recurrence_count: 3, recurrence_exdates: [occ[1].event_date] }], base, addDays(base, 800))
      ok(`rec ${base}/${interval}: exdate removed`, !exed.some(o => o.event_date === occ[1].event_date))
      ok(`rec ${base}/${interval}: exdate counts toward count`, exed.length === 2)
    }
  }
}
// Μη-επαναλαμβανόμενα: εντός/εκτός εύρους
for (const base of BASES) {
  const single: Recurrable = { id: 's', event_date: base, recurring: false }
  ok(`single in-range ${base}`, expandRecurring([single], base, base).length === 1)
  ok(`single out-of-range ${base}`, expandRecurring([single], addDays(base, 1), addDays(base, 30)).length === 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. HOLIDAYS INVARIANTS — 2000..2100
// ─────────────────────────────────────────────────────────────────────────────
for (let y = 2000; y <= 2100; y++) {
  const e = orthodoxEaster(y)
  ok(`easter ${y} month 4/5`, [3, 4].includes(e.getUTCMonth()) || e.getUTCMonth() === 4) // Απρ(3)/Μάι(4) 0-indexed → getUTCMonth 3 ή 4
  const map = greekHolidays(y)
  const dates = Object.keys(map)
  // 13 ονομαστικές αργίες, αλλά κάποια έτη συμπίπτουν κινητή+σταθερή (π.χ. 2016 Πάσχα = 1η Μαΐου),
  // οπότε τα ΜΟΝΑΔΙΚΑ κλειδιά μπορεί να είναι 12 ή 11.
  ok(`holidays ${y}: 11–13 entries`, dates.length >= 11 && dates.length <= 13)
  ok(`holidays ${y}: unique`, new Set(dates).size === dates.length)
  // Σταθερές
  ok(`holidays ${y}: Πρωτοχρονιά`, map[`${y}-01-01`] === 'Πρωτοχρονιά')
  ok(`holidays ${y}: Χριστούγεννα`, map[`${y}-12-25`] === 'Χριστούγεννα')
  ok(`holidays ${y}: 28 Οκτ`, !!map[`${y}-10-28`])
  // Κινητές σε σχέση με Πάσχα
  const eStr = iso(e)
  ok(`holidays ${y}: Καθαρά Δευτέρα = Πάσχα-48`, map[addDays(eStr, -48)] === 'Καθαρά Δευτέρα')
  ok(`holidays ${y}: Μεγ. Παρασκευή = Πάσχα-2`, map[addDays(eStr, -2)] === 'Μεγάλη Παρασκευή')
  ok(`holidays ${y}: Δευτέρα Πάσχα = Πάσχα+1`, map[addDays(eStr, 1)] === 'Δευτέρα του Πάσχα')
  ok(`holidays ${y}: Αγ. Πνεύματος = Πάσχα+50`, map[addDays(eStr, 50)] === 'Αγίου Πνεύματος')
  ok(`holidays ${y}: isHoliday agrees`, holidayName(`${y}-12-25`) === 'Χριστούγεννα')
  ok(`holidays ${y}: nonworking Xmas`, isNonWorkingDay(`${y}-12-25`) === true)
}
// Σαββατοκύριακα: γνωστές μέρες
ok('sat 2026-07-11', isWeekend('2026-07-11'))
ok('sun 2026-07-12', isWeekend('2026-07-12'))
ok('mon not weekend', !isWeekend('2026-07-13'))
ok('upcoming from mid-Dec crosses year', upcomingHolidays('2026-12-20', 3)[2].date === '2027-01-01')

// ─────────────────────────────────────────────────────────────────────────────
// 3. AVAILABILITY INVARIANTS — πολλά σετ ανά ημέρα
// ─────────────────────────────────────────────────────────────────────────────
const DAY = '2026-07-15'
for (let seed = 0; seed < 40; seed++) {
  // ντετερμινιστικό «τυχαίο» σετ ραντεβού
  const evs: BusyEvent[] = []
  for (let i = 0; i < (seed % 5) + 1; i++) {
    const startH = 8 + ((seed * 7 + i * 3) % 10)          // 8..17
    const dur = [30, 60, 90, 120][(seed + i) % 4]
    evs.push({ id: `e${i}`, date: DAY, time: `${pad(startH)}:00`, durationMinutes: dur })
  }
  const busy = busyIntervalsForDay(evs, DAY)
  ok(`avail ${seed}: busy sorted`, busy.every((b, i) => i === 0 || b.start >= busy[i - 1].end))
  ok(`avail ${seed}: busy merged (no overlap)`, busy.every((b, i) => i === 0 || b.start > busy[i - 1].end || b.start === busy[i - 1].end ? true : false))
  const free = findFreeSlots(evs, DAY, 60)
  // κανένα free slot δεν τέμνει busy, όλα εντός 09:00-21:00
  ok(`avail ${seed}: free within window`, free.every(f => f.start >= 540 && f.end <= 1260))
  ok(`avail ${seed}: free length 60`, free.every(f => f.end - f.start === 60))
  ok(`avail ${seed}: free avoids busy`, free.every(f => busy.every(b => !overlaps(f, b))))
  // conflicts: το πρώτο event συγκρούεται με τον εαυτό-του-όχι
  const conf = findConflicts({ ...evs[0], id: 'probe', date: DAY }, evs)
  ok(`avail ${seed}: self-conflict counts others only`, conf.every(c => c.id !== 'probe'))
}
// toInterval άκυρα
ok('toInterval all-day null', toInterval({ date: DAY }) === null)
ok('toInterval cancelled null', toInterval({ date: DAY, time: '10:00', status: 'cancelled' }) === null)
ok('toInterval bad time null', toInterval({ date: DAY, time: '99:99' }) === null)
ok('overlaps half-open', overlaps({ start: 540, end: 600 }, { start: 600, end: 660 }) === false)
ok('overlaps true', overlaps({ start: 540, end: 620 }, { start: 600, end: 660 }) === true)

// ─────────────────────────────────────────────────────────────────────────────
// 4. EXTERNAL LINKS INVARIANTS + 6. ICS ROUNDTRIP (buildICS → parseICS)
// ─────────────────────────────────────────────────────────────────────────────
const EV_DATES = ['2026-01-05', '2026-07-15', '2026-12-31', '2028-02-29']
const EV_TIMES = [null, '00:00', '09:30', '23:00']
for (const date of EV_DATES) {
  for (const time of EV_TIMES) {
    for (const dur of [30, 60, 120]) {
      const e = { title: 'Ραντεβού, τεστ; δοκιμή', date, time, durationMinutes: dur, details: 'σημ, με; ειδικά', location: 'Σπίτι' }
      const g = googleCalendarUrl(e)
      ok(`gcal host ${date}/${time}`, g.startsWith('https://calendar.google.com/calendar/render?'))
      ok(`gcal has dates ${date}/${time}`, g.includes('dates='))
      if (!time) ok(`gcal all-day end+1 ${date}`, g.includes(`${date.replace(/-/g, '')}%2F${addDaysCompact(date, 1)}`))
      const bundle = allCalendarLinks(e)
      ok(`bundle 7 keys ${date}/${time}`, ['google', 'outlook', 'office', 'yahoo', 'ics', 'whatsapp', 'viber'].every(k => !!(bundle as any)[k]))
      // ICS roundtrip
      const ics = buildICS(e)
      const parsed = parseICS(ics)
      ok(`ics roundtrip 1 event ${date}/${time}`, parsed.length === 1)
      if (parsed.length === 1) {
        const p = parsed[0]
        ok(`ics roundtrip date ${date}/${time}`, p.date === date)
        ok(`ics roundtrip time ${date}/${time}`, p.time === (time || null))
        ok(`ics roundtrip title escaped ok ${date}/${time}`, p.title.includes('Ραντεβού') && p.title.includes('δοκιμή'))
        if (time) ok(`ics roundtrip duration ${date}/${time}`, p.durationMinutes === dur)
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. QUICK-ADD INVARIANTS — weekdays × times
// ─────────────────────────────────────────────────────────────────────────────
const NOW = new Date(Date.UTC(2026, 6, 10)) // Παρασκευή 2026-07-10
const WEEKDAYS: [string, number][] = [['Δευτέρα', 1], ['Τρίτη', 2], ['Τετάρτη', 3], ['Πέμπτη', 4], ['Παρασκευή', 5], ['Σάββατο', 6], ['Κυριακή', 0]]
for (const [name, dow] of WEEKDAYS) {
  const r = parseQuickAdd(`Ραντεβού ${name}`, NOW)
  ok(`qa weekday ${name}: has date`, !!r.date)
  if (r.date) {
    const [y, m, d] = r.date.split('-').map(Number)
    ok(`qa weekday ${name}: correct dow`, new Date(Date.UTC(y, m - 1, d)).getUTCDay() === dow)
    ok(`qa weekday ${name}: strictly future`, r.date > '2026-07-10')
    ok(`qa weekday ${name}: title kept`, r.title.includes('Ραντεβού'))
  }
}
const TIMES: [string, string][] = [['10:30', '10:30'], ['9:5', '09:05'], ['10πμ', '10:00'], ['6μμ', '18:00'], ['08:00', '08:00'], ['23:15', '23:15']]
for (const [inp, exp] of TIMES) {
  const r = parseQuickAdd(`Κάτι ${inp}`, NOW)
  ok(`qa time ${inp} → ${exp}`, r.time === exp)
}
for (const rel of [['σήμερα', '2026-07-10'], ['αύριο', '2026-07-11'], ['μεθαύριο', '2026-07-12']] as [string, string][]) {
  ok(`qa rel ${rel[0]}`, parseQuickAdd(`Δουλειά ${rel[0]}`, NOW).date === rel[1])
}
ok('qa never empty title', parseQuickAdd('   ', NOW).title.length > 0)
ok('qa null safe', (() => { try { return parseQuickAdd(null as any, NOW).title.length > 0 } catch { return false } })())

// ─────────────────────────────────────────────────────────────────────────────
console.log(`calendar.integration, ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('Απέτυχαν:\n - ' + fails.join('\n - ')); process.exit(1) }
else console.log('όλα πέρασαν')
