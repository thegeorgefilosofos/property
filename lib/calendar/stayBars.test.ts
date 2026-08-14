// Αυστηρά τεστ για τη γεωμετρία της μπάρας διαμονής (stayBars.ts).
// Τρέξε: npx tsx lib/calendar/stayBars.test.ts
import { toStaySpan, staysOnDay, weekSegments, stayNights, channelColor, type StaySpan } from './stayBars'

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

// ── weekSegments ─────────────────────────────────────────────────────────────
// Εβδομάδα Δευ 03/08 ώς Κυρ 09/08 2026.
const W = ['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09']

// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΓΕΝΝΗΣΕ ΑΥΤΗ ΤΗ ΓΡΑΦΗ: κράτηση τεσσάρων νυχτών εμφανιζόταν ως
// ένα χάπι με κομμένο όνομα, τρία κενά κελιά και μια γραμμούλα στο τέλος.
// Τώρα είναι ΜΙΑ λωρίδα με πλάτος πέντε στηλών.
{
  const st: StaySpan[] = [{ id: 'a', guest: 'Elena P.', start: '2026-08-03', end: '2026-08-07' }]
  const { segments, lanes } = weekSegments(st, W)
  ok('μία κράτηση → μία λωρίδα', segments.length === 1)
  ok('μία σειρά', lanes === 1)
  ok('ξεκινά στη στήλη 0', segments[0].startCol === 0)
  ok('πιάνει πέντε στήλες', segments[0].span === 5)
  ok('κλειστή αριστερά', !segments[0].openLeft)
  ok('κλειστή δεξιά', !segments[0].openRight)
  ok('τέσσερις νύχτες', segments[0].nights === 4)
}

// Κράτηση που έρχεται από την προηγούμενη εβδομάδα και φεύγει στην επόμενη.
{
  const st: StaySpan[] = [{ id: 'b', guest: 'B', start: '2026-07-30', end: '2026-08-15' }]
  const { segments } = weekSegments(st, W)
  ok('περνά ολόκληρη → 7 στήλες', segments[0].span === 7 && segments[0].startCol === 0)
  ok('ανοιχτή αριστερά', segments[0].openLeft)
  ok('ανοιχτή δεξιά', segments[0].openRight)
}

// Δύο κρατήσεις που επικαλύπτονται → δύο σειρές. Δύο που δεν επικαλύπτονται →
// μία σειρά, γιατί χωράνε δίπλα δίπλα.
{
  const overlap: StaySpan[] = [
    { id: 'a', guest: 'A', start: '2026-08-03', end: '2026-08-06' },
    { id: 'b', guest: 'B', start: '2026-08-05', end: '2026-08-09' },
  ]
  const r1 = weekSegments(overlap, W)
  ok('επικάλυψη → δύο σειρές', r1.lanes === 2)
  ok('η παλαιότερη άφιξη πάνω', r1.segments.find(s => s.stay.id === 'a')!.lane === 0)

  const apart: StaySpan[] = [
    { id: 'a', guest: 'A', start: '2026-08-03', end: '2026-08-04' },
    { id: 'b', guest: 'B', start: '2026-08-06', end: '2026-08-08' },
  ]
  const r2 = weekSegments(apart, W)
  ok('χωρίς επικάλυψη → μία σειρά', r2.lanes === 1)
  ok('και οι δύο στη σειρά 0', r2.segments.every(s => s.lane === 0))
}

// Κενές θέσεις (κελιά άλλου μήνα) δεν σπάνε τη λωρίδα.
{
  const padded = [null, null, '2026-08-01', '2026-08-02', null, null, null] as (string | null)[]
  const st: StaySpan[] = [{ id: 'c', guest: 'C', start: '2026-07-28', end: '2026-08-02' }]
  const { segments } = weekSegments(st, padded)
  ok('κενά κελιά: ξεκινά στην πρώτη πραγματική', segments[0].startCol === 2)
  ok('κενά κελιά: δύο στήλες', segments[0].span === 2)
  ok('κενά κελιά: ανοιχτή αριστερά', segments[0].openLeft)
}

// Καμία κράτηση, ή εβδομάδα εκτός εύρους → τίποτα.
ok('χωρίς κρατήσεις', weekSegments([], W).segments.length === 0)
ok('εκτός εύρους', weekSegments([{ id: 'z', guest: 'Z', start: '2026-09-01', end: '2026-09-03' }], W).segments.length === 0)
ok('όλα κενά κελιά', weekSegments([{ id: 'z', guest: 'Z', start: '2026-08-03', end: '2026-08-04' }], [null,null,null,null,null,null,null]).segments.length === 0)

// ── stayNights ───────────────────────────────────────────────────────────────
ok('ίδια ημέρα → 1 νύχτα', stayNights({ id: 'q', guest: 'Q', start: '2026-08-03', end: '2026-08-03' }) === 1)
ok('τέσσερις νύχτες', stayNights({ id: 'q', guest: 'Q', start: '2026-08-03', end: '2026-08-07' }) === 4)
ok('πάνω από αλλαγή θερινής ώρας', stayNights({ id: 'q', guest: 'Q', start: '2026-03-27', end: '2026-03-31' }) === 4)

// ── channelColor ─────────────────────────────────────────────────────────────
ok('airbnb χρώμα', channelColor('airbnb').solid === 'var(--ch-airbnb)')
ok('booking χρώμα', channelColor('booking').solid === 'var(--ch-booking)')
ok('AIRBNB case', channelColor('AIRBNB').label === 'Airbnb')
ok('άγνωστο → accent', channelColor('foo').solid === 'var(--accent)')
ok('null → accent', channelColor(null).solid === 'var(--accent)')

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nstayBars.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
