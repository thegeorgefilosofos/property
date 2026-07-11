// Αυστηρά τεστ για το column-packing παράλληλων γεγονότων (overlap.ts).
// Τρέξε: npx tsx lib/calendar/overlap.test.ts
import { toMinutes, maxConcurrency, layoutDay, type LaidOutEvent } from './overlap'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// Βοηθός: γεγονός με ετικέτα + λεπτά.
type Ev = { id: string; s: number; e: number }
const ev = (id: string, s: number, e: number): Ev => ({ id, s, e })
const lay = (evs: Ev[]) => layoutDay(evs, (x) => x.s, (x) => x.e)
const byId = (r: LaidOutEvent<Ev>[], id: string) => r.find((x) => x.event.id === id)!

// ── toMinutes ──────────────────────────────────────────────────────────────────
ok('toMinutes 09:00 → 540', toMinutes('09:00') === 540)
ok('toMinutes 14:30 → 870', toMinutes('14:30') === 870)
ok('toMinutes 00:00 → 0', toMinutes('00:00') === 0)
ok('toMinutes 23:59 → 1439', toMinutes('23:59') === 1439)
ok('toMinutes με κενά γύρω', toMinutes('  09:00  ') === 540)
ok('toMinutes κενή → null', toMinutes('') === null)
ok('toMinutes null → null', toMinutes(null) === null)
ok('toMinutes undefined → null', toMinutes(undefined) === null)
ok('toMinutes σκουπίδια → null', toMinutes('nope') === null)
ok('toMinutes h>23 → null', toMinutes('24:00') === null)
ok('toMinutes m>59 → null', toMinutes('09:60') === null)
ok('toMinutes χωρίς λεπτά → null', toMinutes('9') === null)
ok('toMinutes μονοψήφια ώρα', toMinutes('9:05') === 545)

// ── maxConcurrency ───────────────────────────────────────────────────────────────
ok('conc κενό → 0', maxConcurrency([]) === 0)
ok('conc ένα → 1', maxConcurrency([{ startMin: 540, endMin: 600 }]) === 1)
ok('conc δύο επικαλυπτόμενα → 2', maxConcurrency([
  { startMin: 540, endMin: 660 }, { startMin: 600, endMin: 720 },
]) === 2)
ok('conc τρία στοιβαγμένα → 3', maxConcurrency([
  { startMin: 540, endMin: 720 }, { startMin: 550, endMin: 710 }, { startMin: 560, endMin: 700 },
]) === 3)
ok('conc εφαπτόμενα half-open → 1', maxConcurrency([
  { startMin: 540, endMin: 600 }, { startMin: 600, endMin: 660 },
]) === 1)
ok('conc εμφωλευμένα → 2', maxConcurrency([
  { startMin: 540, endMin: 720 }, { startMin: 600, endMin: 660 },
]) === 2)
ok('conc δύο disjoint → 1', maxConcurrency([
  { startMin: 540, endMin: 600 }, { startMin: 700, endMin: 760 },
]) === 1)
ok('conc zero-duration → 1 (min block)', maxConcurrency([
  { startMin: 540, endMin: 540 },
]) === 1)
ok('conc zero-duration δημιουργεί επικάλυψη', maxConcurrency([
  { startMin: 540, endMin: 540 }, { startMin: 550, endMin: 560 },
]) === 2)

// ── layoutDay: μονό γεγονός ──────────────────────────────────────────────────────
{
  const r = lay([ev('A', 540, 600)])
  ok('single: ένα αποτέλεσμα', r.length === 1)
  ok('single: lane 0', r[0].lane === 0)
  ok('single: lanes 1', r[0].lanes === 1)
  ok('single: startMin', r[0].startMin === 540)
  ok('single: endMin', r[0].endMin === 600)
  ok('single: κρατά το event', r[0].event.id === 'A')
}

// ── layoutDay: δύο επικαλυπτόμενα ────────────────────────────────────────────────
{
  const r = lay([ev('A', 540, 660), ev('B', 600, 720)])
  ok('two-ovl: lanes 2 και για τα δύο', byId(r, 'A').lanes === 2 && byId(r, 'B').lanes === 2)
  ok('two-ovl: A lane 0', byId(r, 'A').lane === 0)
  ok('two-ovl: B lane 1', byId(r, 'B').lane === 1)
}

// ── layoutDay: δύο back-to-back (half-open) → ΔΙΑΦΟΡΕΤΙΚΑ clusters ────────────────
{
  const r = lay([ev('A', 540, 600), ev('B', 600, 660)])
  ok('b2b: A lane 0 lanes 1', byId(r, 'A').lane === 0 && byId(r, 'A').lanes === 1)
  ok('b2b: B lane 0 lanes 1', byId(r, 'B').lane === 0 && byId(r, 'B').lanes === 1)
  ok('b2b: δύο αποτελέσματα', r.length === 2)
}

// ── layoutDay: τρία αμοιβαία επικαλυπτόμενα → lanes 3 ─────────────────────────────
{
  const r = lay([ev('A', 540, 720), ev('B', 550, 710), ev('C', 560, 700)])
  ok('three-ovl: όλα lanes 3', r.every((x) => x.lanes === 3))
  ok('three-ovl: A lane 0', byId(r, 'A').lane === 0)
  ok('three-ovl: B lane 1', byId(r, 'B').lane === 1)
  ok('three-ovl: C lane 2', byId(r, 'C').lane === 2)
  const usedLanes = new Set(r.map((x) => x.lane))
  ok('three-ovl: τρεις ξεχωριστές λωρίδες', usedLanes.size === 3)
}

// ── layoutDay: staircase A[9-10] B[9:30-10:30] C[10-11] ──────────────────────────
// A&B επικαλύπτονται, B&C επικαλύπτονται, A&C ΟΧΙ. Ένα cluster, lanes=2, C ξαναχρησιμοποιεί lane 0.
{
  const r = lay([ev('A', 540, 600), ev('B', 570, 630), ev('C', 600, 660)])
  ok('stair: όλα ΕΝΑ cluster (lanes 2)', r.every((x) => x.lanes === 2))
  ok('stair: A lane 0', byId(r, 'A').lane === 0)
  ok('stair: B lane 1', byId(r, 'B').lane === 1)
  ok('stair: C ξαναχρησιμοποιεί lane 0', byId(r, 'C').lane === 0)
  ok('stair: τρία αποτελέσματα', r.length === 3)
}

// ── layoutDay: μηδενικής διάρκειας → 30λεπτο block ───────────────────────────────
{
  const r = lay([ev('Z', 600, 600)])
  ok('zero-dur: endMin = start+30', byId(r, 'Z').endMin === 630)
  ok('zero-dur: startMin αμετάβλητο', byId(r, 'Z').startMin === 600)
  ok('zero-dur: lane 0 lanes 1', byId(r, 'Z').lane === 0 && byId(r, 'Z').lanes === 1)
}
{
  // end<start → επίσης 30λεπτο block.
  const r = lay([ev('Z', 600, 500)])
  ok('end<start: endMin = start+30', byId(r, 'Z').endMin === 630)
}
{
  // Zero-duration event δημιουργεί cluster με γειτονικό.
  const r = lay([ev('Z', 600, 600), ev('W', 610, 700)])
  ok('zero-dur: κάνει cluster με επικαλυπτόμενο', byId(r, 'Z').lanes === 2 && byId(r, 'W').lanes === 2)
  ok('zero-dur: διαφορετικές λωρίδες', byId(r, 'Z').lane !== byId(r, 'W').lane)
}

// ── layoutDay: κενή είσοδος ──────────────────────────────────────────────────────
ok('empty → []', lay([]).length === 0)

// ── layoutDay: δύο ξεχωριστά clusters σε μία μέρα ────────────────────────────────
{
  const r = lay([ev('A', 540, 660), ev('B', 600, 720), ev('C', 800, 860), ev('D', 820, 900)])
  ok('multi-cluster: A,B lanes 2', byId(r, 'A').lanes === 2 && byId(r, 'B').lanes === 2)
  ok('multi-cluster: C,D lanes 2', byId(r, 'C').lanes === 2 && byId(r, 'D').lanes === 2)
  ok('multi-cluster: C lane 0 (νέο cluster)', byId(r, 'C').lane === 0)
  ok('multi-cluster: τέσσερα αποτελέσματα', r.length === 4)
}

// ── Ντετερμινισμός: ίδια είσοδος → ίδιο αποτέλεσμα ───────────────────────────────
{
  const input = [ev('A', 540, 720), ev('B', 570, 630), ev('C', 600, 660), ev('D', 800, 860)]
  const a = JSON.stringify(lay(input))
  const b = JSON.stringify(lay(input))
  ok('ντετερμινισμός: δύο κλήσεις ταυτίζονται', a === b)
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\noverlap.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
