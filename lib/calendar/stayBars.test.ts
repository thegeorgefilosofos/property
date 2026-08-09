// Αυστηρά τεστ για τη γεωμετρία της μπάρας διαμονής (stayBars.ts).
// Τρέξε: npx tsx lib/calendar/stayBars.test.ts
import { toStaySpan, staysOnDay, segMeta, channelColor, type StaySpan } from './stayBars'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// ── toStaySpan ───────────────────────────────────────────────────────────────
const s1 = toStaySpan({ id: 'a', check_in: '2026-08-01', check_out: '2026-08-05', total: 400, channel: 'airbnb', guest_name: 'Maria' })!
ok('span guest', s1.guest === 'Maria')
ok('span start', s1.start === '2026-08-01')
ok('span end', s1.end === '2026-08-05')
ok('span total', s1.total === 400)
const s2 = toStaySpan({ id: 'b', check_in: '2026-08-10', check_out: null, channel: 'booking' })!
ok('χωρίς check_out → end=start', s2.end === '2026-08-10')
ok('χωρίς όνομα → κανάλι', s2.guest === 'Booking.com κράτηση')
ok('άκυρη check_in → null', toStaySpan({ id: 'c', check_in: 'bad' } as never) === null)
ok('end<start → κανονικοποίηση', toStaySpan({ id: 'd', check_in: '2026-08-10', check_out: '2026-08-01' })!.end === '2026-08-10')

// ── staysOnDay ───────────────────────────────────────────────────────────────
const stays: StaySpan[] = [
  { id: 'x', guest: 'X', start: '2026-08-01', end: '2026-08-05' },
  { id: 'y', guest: 'Y', start: '2026-08-04', end: '2026-08-04' },
  { id: 'z', guest: 'Z', start: '2026-08-10', end: '2026-08-12' },
]
ok('μέρα εντός εύρους', staysOnDay(stays, '2026-08-03').map(s => s.id).join() === 'x')
ok('άκρη άφιξης', staysOnDay(stays, '2026-08-01').map(s => s.id).join() === 'x')
ok('άκρη αναχώρησης', staysOnDay(stays, '2026-08-05').map(s => s.id).join() === 'x')
ok('επικάλυψη δύο', staysOnDay(stays, '2026-08-04').map(s => s.id).join() === 'x,y')
ok('εκτός εύρους κενό', staysOnDay(stays, '2026-08-08').length === 0)
ok('σταθερή σειρά (άφιξη)', staysOnDay(stays, '2026-08-04')[0].id === 'x')

// ── segMeta ──────────────────────────────────────────────────────────────────
const stay: StaySpan = { id: 'x', guest: 'X', start: '2026-08-03', end: '2026-08-07' }
// άφιξη (Δευτ, col 1): roundLeft (isStart), label
{ const m = segMeta(stay, '2026-08-03', 1); ok('start: roundLeft', m.roundLeft); ok('start: !roundRight', !m.roundRight); ok('start: label', m.showLabel); ok('start: isStart', m.isStart) }
// μεσαία (Τετ, col 3): χωρίς στρογγύλεψη, χωρίς label
{ const m = segMeta(stay, '2026-08-05', 3); ok('mid: !roundLeft', !m.roundLeft); ok('mid: !roundRight', !m.roundRight); ok('mid: !label', !m.showLabel) }
// αναχώρηση (col 5): roundRight
{ const m = segMeta(stay, '2026-08-07', 5); ok('end: roundRight', m.roundRight); ok('end: !roundLeft', !m.roundLeft); ok('end: isEnd', m.isEnd) }
// μεσαία μέρα ΑΛΛΑ αρχή γραμμής (Κυρ, col 0): roundLeft + label (νέα εβδομάδα)
{ const m = segMeta(stay, '2026-08-05', 0); ok('row-start: roundLeft', m.roundLeft); ok('row-start: label', m.showLabel); ok('row-start: !isStart', !m.isStart) }
// μεσαία μέρα ΑΛΛΑ τέλος γραμμής (Σαβ, col 6): roundRight, χωρίς label
{ const m = segMeta(stay, '2026-08-05', 6); ok('row-end: roundRight', m.roundRight); ok('row-end: !label', !m.showLabel) }

// ── channelColor ─────────────────────────────────────────────────────────────
ok('airbnb χρώμα', channelColor('airbnb').solid === '#FF5A5F')
ok('booking χρώμα', channelColor('booking').solid === '#0071C2')
ok('AIRBNB case', channelColor('AIRBNB').label === 'Airbnb')
ok('άγνωστο → accent', channelColor('foo').solid === 'var(--accent)')
ok('null → accent', channelColor(null).solid === 'var(--accent)')

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nstayBars.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
