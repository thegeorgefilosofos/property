// Τεστ για την επέκταση επαναλαμβανόμενων (recurrence.ts). Τρέξε: npx tsx lib/calendar/recurrence.test.ts
import { nextOccurrence, expandRecurring } from './recurrence'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name) } }

// ── nextOccurrence ──────────────────────────────────────────────────────────
ok('weekly +7', nextOccurrence('2026-07-01', 'weekly') === '2026-07-08')
ok('weekly crosses month', nextOccurrence('2026-07-29', 'weekly') === '2026-08-05')
ok('monthly +1', nextOccurrence('2026-01-15', 'monthly') === '2026-02-15')
ok('monthly clamps Jan31→Feb28', nextOccurrence('2026-01-31', 'monthly') === '2026-02-28')
ok('monthly leap Jan31→Feb29 (2028)', nextOccurrence('2028-01-31', 'monthly') === '2028-02-29')
ok('bimonthly +2', nextOccurrence('2026-01-10', 'bimonthly') === '2026-03-10')
ok('quarterly +3', nextOccurrence('2026-01-10', 'quarterly') === '2026-04-10')
ok('biannual +6', nextOccurrence('2026-01-10', 'biannual') === '2026-07-10')
ok('annual +12 crosses year', nextOccurrence('2026-05-20', 'annual') === '2027-05-20')
ok('monthly Dec→Jan next year', nextOccurrence('2026-12-15', 'monthly') === '2027-01-15')
ok('unknown interval → null', nextOccurrence('2026-01-01', 'nope') === null)

// ── expandRecurring ─────────────────────────────────────────────────────────
const monthly = [{ id: 'a', event_date: '2026-01-10', recurring: true, recurring_interval: 'monthly' }]
const occ = expandRecurring(monthly, '2026-01-01', '2026-06-30')
ok('monthly count Jan–Jun = 6', occ.length === 6)
ok('monthly dates', occ.map(o => o.event_date).join(',') === '2026-01-10,2026-02-10,2026-03-10,2026-04-10,2026-05-10,2026-06-10')
ok('base not virtual', (occ[0] as any)._virtual === undefined)
ok('later are virtual', (occ[1] as any)._virtual === true)
ok('virtual has synthetic id', occ[1].id === 'a__2026-02-10')
ok('virtual keeps seriesId', (occ[1] as any)._seriesId === 'a')

// range that starts AFTER base still yields occurrences in-range
const mid = expandRecurring(monthly, '2026-04-01', '2026-05-31')
ok('mid-range occurrences', mid.map(o => o.event_date).join(',') === '2026-04-10,2026-05-10')
ok('mid-range excludes base month', !mid.some(o => o.event_date === '2026-01-10'))

// non-recurring event: only itself if in range
const single = [{ id: 's', event_date: '2026-03-05', recurring: false, recurring_interval: null }]
ok('single in range', expandRecurring(single, '2026-03-01', '2026-03-31').length === 1)
ok('single out of range', expandRecurring(single, '2026-04-01', '2026-04-30').length === 0)

// weekly across a month range
const weekly = [{ id: 'w', event_date: '2026-07-01', recurring: true, recurring_interval: 'weekly' }]
const wk = expandRecurring(weekly, '2026-07-01', '2026-07-31')
ok('weekly July count', wk.map(o => o.event_date).join(',') === '2026-07-01,2026-07-08,2026-07-15,2026-07-22,2026-07-29')

// ── recurrence_until: λήξη σειράς ────────────────────────────────────────────
const untilCase = [{ id: 'u', event_date: '2026-01-10', recurring: true, recurring_interval: 'monthly', recurrence_until: '2026-03-10' }]
ok('until stops the series', expandRecurring(untilCase, '2026-01-01', '2026-12-31').map(o => o.event_date).join(',') === '2026-01-10,2026-02-10,2026-03-10')
const untilBefore = [{ id: 'u2', event_date: '2026-01-10', recurring: true, recurring_interval: 'monthly', recurrence_until: '2026-02-09' }]
ok('until before 2nd occ → only base', expandRecurring(untilBefore, '2026-01-01', '2026-12-31').map(o => o.event_date).join(',') === '2026-01-10')

// ── recurrence_count: πλήθος (base μετράει ως 1η) ───────────────────────────
const countCase = [{ id: 'c', event_date: '2026-01-10', recurring: true, recurring_interval: 'monthly', recurrence_count: 3 }]
ok('count=3 yields 3', expandRecurring(countCase, '2026-01-01', '2026-12-31').map(o => o.event_date).join(',') === '2026-01-10,2026-02-10,2026-03-10')
ok('count=1 yields only base', expandRecurring([{ id: 'c1', event_date: '2026-01-10', recurring: true, recurring_interval: 'monthly', recurrence_count: 1 }], '2026-01-01', '2026-12-31').length === 1)

// ── recurrence_exdates: εξαιρέσεις (μετρούν στο count, δεν εμφανίζονται) ─────
const exCase = [{ id: 'e', event_date: '2026-01-10', recurring: true, recurring_interval: 'monthly', recurrence_exdates: ['2026-02-10'] }]
ok('exdate skipped', expandRecurring(exCase, '2026-01-01', '2026-04-30').map(o => o.event_date).join(',') === '2026-01-10,2026-03-10,2026-04-10')
const exCount = [{ id: 'ec', event_date: '2026-01-10', recurring: true, recurring_interval: 'monthly', recurrence_count: 3, recurrence_exdates: ['2026-02-10'] }]
ok('exdate counts toward count (iCal)', expandRecurring(exCount, '2026-01-01', '2026-12-31').map(o => o.event_date).join(',') === '2026-01-10,2026-03-10')
ok('base exdate removes base too', expandRecurring([{ id: 'b', event_date: '2026-01-10', recurring: true, recurring_interval: 'monthly', recurrence_count: 2, recurrence_exdates: ['2026-01-10'] }], '2026-01-01', '2026-12-31').map(o => o.event_date).join(',') === '2026-02-10')

console.log(`recurrence.ts, ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('Απέτυχαν:\n - ' + fails.join('\n - ')); process.exit(1) }
else console.log('όλα πέρασαν')
