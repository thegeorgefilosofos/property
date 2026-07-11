// Αυστηρά τεστ για τη λογική free/busy + συγκρούσεων (availability.ts).
// Τρέξε: npx tsx lib/calendar/availability.test.ts
import {
  toInterval, overlaps, findConflicts, busyIntervalsForDay, findFreeSlots, fmtInterval,
  type BusyEvent, type Interval,
} from './availability';

let passed = 0, failed = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name); } };
const eqIv = (a: Interval, b: Interval) => a.start === b.start && a.end === b.end;
const eqList = (a: Interval[], b: Interval[]) => a.length === b.length && a.every((x, i) => eqIv(x, b[i]));

// ── toInterval ────────────────────────────────────────────────────────────────
ok('toInterval timed default 60', (() => {
  const iv = toInterval({ date: '2026-07-11', time: '09:00' });
  return !!iv && iv.start === 540 && iv.end === 600;
})());
ok('toInterval timed with duration', (() => {
  const iv = toInterval({ date: '2026-07-11', time: '14:30', durationMinutes: 90 });
  return !!iv && iv.start === 870 && iv.end === 960;
})());
ok('toInterval midnight', (() => {
  const iv = toInterval({ date: '2026-07-11', time: '00:00', durationMinutes: 15 });
  return !!iv && iv.start === 0 && iv.end === 15;
})());
ok('toInterval all-day → null', toInterval({ date: '2026-07-11' }) === null);
ok('toInterval time null → null', toInterval({ date: '2026-07-11', time: null }) === null);
ok('toInterval cancelled → null', toInterval({ date: '2026-07-11', time: '09:00', status: 'cancelled' }) === null);
ok('toInterval invalid HH → null', toInterval({ date: '2026-07-11', time: '24:00' }) === null);
ok('toInterval invalid MM → null', toInterval({ date: '2026-07-11', time: '09:60' }) === null);
ok('toInterval garbage → null', toInterval({ date: '2026-07-11', time: 'nope' }) === null);
ok('toInterval empty string → null', toInterval({ date: '2026-07-11', time: '' }) === null);
ok('toInterval zero duration → default 60', (() => {
  const iv = toInterval({ date: '2026-07-11', time: '10:00', durationMinutes: 0 });
  return !!iv && iv.end === 660;
})());
ok('toInterval negative duration → default 60', (() => {
  const iv = toInterval({ date: '2026-07-11', time: '10:00', durationMinutes: -30 });
  return !!iv && iv.end === 660;
})());

// ── overlaps: half-open [start,end) ─────────────────────────────────────────────
ok('overlaps true', overlaps({ start: 540, end: 660 }, { start: 600, end: 720 }) === true);
ok('overlaps boundary touch = false', overlaps({ start: 540, end: 600 }, { start: 600, end: 660 }) === false);
ok('overlaps disjoint = false', overlaps({ start: 540, end: 600 }, { start: 700, end: 760 }) === false);
ok('overlaps contained = true', overlaps({ start: 540, end: 720 }, { start: 600, end: 660 }) === true);
ok('overlaps identical = true', overlaps({ start: 540, end: 600 }, { start: 540, end: 600 }) === true);

// ── findConflicts ───────────────────────────────────────────────────────────────
{
  const target: BusyEvent = { id: 'A', date: '2026-07-11', time: '10:00', durationMinutes: 60 };
  const events: BusyEvent[] = [
    { id: 'A', date: '2026-07-11', time: '10:00', durationMinutes: 60 },    // self → εξαιρείται
    { id: 'B', date: '2026-07-11', time: '10:30', durationMinutes: 60 },    // overlap → σύγκρουση
    { id: 'C', date: '2026-07-11', time: '11:00', durationMinutes: 60 },    // back-to-back (11:00) → όχι
    { id: 'D', date: '2026-07-11', time: '09:00', durationMinutes: 60 },    // τελειώνει 10:00 → όχι
    { id: 'E', date: '2026-07-12', time: '10:00', durationMinutes: 60 },    // άλλη μέρα → όχι
    { id: 'F', date: '2026-07-11' },                                        // ολοήμερο → εξαιρείται
    { id: 'G', date: '2026-07-11', time: '10:15', status: 'cancelled' },    // cancelled → εξαιρείται
  ];
  const c = findConflicts(target, events);
  ok('findConflicts finds only B', c.length === 1 && c[0].id === 'B');
  ok('findConflicts excludes self', !c.some(e => e.id === 'A'));
  ok('findConflicts excludes back-to-back', !c.some(e => e.id === 'C'));
  ok('findConflicts excludes touching-before', !c.some(e => e.id === 'D'));
  ok('findConflicts excludes other date', !c.some(e => e.id === 'E'));
  ok('findConflicts excludes all-day', !c.some(e => e.id === 'F'));
  ok('findConflicts excludes cancelled', !c.some(e => e.id === 'G'));
}
ok('findConflicts all-day target → none', findConflicts({ id: 'X', date: '2026-07-11' }, [
  { id: 'Y', date: '2026-07-11', time: '10:00' },
]).length === 0);
ok('findConflicts empty list', findConflicts({ id: 'X', date: '2026-07-11', time: '10:00' }, []).length === 0);
ok('findConflicts no-id target still matches others', (() => {
  const c = findConflicts({ date: '2026-07-11', time: '10:00' }, [
    { id: 'Z', date: '2026-07-11', time: '10:30' },
  ]);
  return c.length === 1 && c[0].id === 'Z';
})());

// ── busyIntervalsForDay: merge ──────────────────────────────────────────────────
ok('busy merges overlapping', eqList(
  busyIntervalsForDay([
    { date: 'd', time: '10:00', durationMinutes: 60 },   // 600–660
    { date: 'd', time: '10:30', durationMinutes: 60 },   // 630–690
  ], 'd'),
  [{ start: 600, end: 690 }],
));
ok('busy merges adjacent-touching', eqList(
  busyIntervalsForDay([
    { date: 'd', time: '09:00', durationMinutes: 60 },   // 540–600
    { date: 'd', time: '10:00', durationMinutes: 60 },   // 600–660
  ], 'd'),
  [{ start: 540, end: 660 }],
));
ok('busy keeps disjoint separate', eqList(
  busyIntervalsForDay([
    { date: 'd', time: '09:00', durationMinutes: 60 },   // 540–600
    { date: 'd', time: '11:00', durationMinutes: 60 },   // 660–720
  ], 'd'),
  [{ start: 540, end: 600 }, { start: 660, end: 720 }],
));
ok('busy sorts unordered input', eqList(
  busyIntervalsForDay([
    { date: 'd', time: '15:00', durationMinutes: 30 },   // 900–930
    { date: 'd', time: '08:00', durationMinutes: 30 },   // 480–510
  ], 'd'),
  [{ start: 480, end: 510 }, { start: 900, end: 930 }],
));
ok('busy ignores other dates & all-day & cancelled', eqList(
  busyIntervalsForDay([
    { date: 'd', time: '10:00', durationMinutes: 60 },
    { date: 'other', time: '10:00', durationMinutes: 60 },
    { date: 'd' },                                       // all-day
    { date: 'd', time: '10:00', status: 'cancelled' },
  ], 'd'),
  [{ start: 600, end: 660 }],
));
ok('busy contained interval fully absorbed', eqList(
  busyIntervalsForDay([
    { date: 'd', time: '09:00', durationMinutes: 180 },  // 540–720
    { date: 'd', time: '10:00', durationMinutes: 30 },   // 600–630 μέσα στο πρώτο
  ], 'd'),
  [{ start: 540, end: 720 }],
));
ok('busy empty day → []', busyIntervalsForDay([], 'd').length === 0);

// ── findFreeSlots ───────────────────────────────────────────────────────────────
// Empty day → όλο το παράθυρο σε βήματα. work 09:00–21:00 (540..1260), dur 120, step 30.
{
  const slots = findFreeSlots([], 'd', 120);
  // πρώτο slot 540–660, τελευταίο s όπου s+120<=1260 → s=1140 (19:00–21:00).
  // s ∈ {540,570,...,1140} = (1140-540)/30 + 1 = 21 slots.
  ok('freeSlots empty day count', slots.length === 21);
  ok('freeSlots empty first', eqIv(slots[0], { start: 540, end: 660 }));
  ok('freeSlots empty last', eqIv(slots[slots.length - 1], { start: 1140, end: 1260 }));
}
// Ένα meeting σπάει τη μέρα: 12:00–13:00 (720–780), dur 60, step 60, work 09:00–17:00.
{
  const slots = findFreeSlots(
    [{ date: 'd', time: '12:00', durationMinutes: 60 }],
    'd', 60, 540, 1020, 60,
  );
  // s ∈ {540,600,660,720,780,840,900,960}, meeting 720–780 μπλοκάρει s=660(660–720 ok? 720<=720 half-open ok),
  // s=660 → 660–720 δεν επικαλύπτει 720–780 (touch) → free
  // s=720 → 720–780 επικαλύπτει → out
  // Ελεύθερα: 540,600,660,780,840,900,960 = 7
  ok('freeSlots split count', slots.length === 7);
  ok('freeSlots split excludes meeting', !slots.some(s => s.start === 720));
  ok('freeSlots split includes just-before', slots.some(s => eqIv(s, { start: 660, end: 720 })));
  ok('freeSlots split includes just-after', slots.some(s => eqIv(s, { start: 780, end: 840 })));
}
// Back-to-back meetings block a contiguous span.
{
  const slots = findFreeSlots(
    [
      { date: 'd', time: '10:00', durationMinutes: 60 }, // 600–660
      { date: 'd', time: '11:00', durationMinutes: 60 }, // 660–720
    ],
    'd', 60, 540, 780, 60,
  );
  // work 540..780. s ∈ {540,600,660,720}. busy merged 600–720.
  // s=540 → 540–600 free; s=600 → block; s=660 → block; s=720 → 720–780 free.
  ok('freeSlots back-to-back count', slots.length === 2);
  ok('freeSlots back-to-back items', eqList(slots, [{ start: 540, end: 600 }, { start: 720, end: 780 }]));
}
// No space: full day busy.
{
  const slots = findFreeSlots(
    [{ date: 'd', time: '09:00', durationMinutes: 720 }], // 540–1260 όλο το παράθυρο
    'd', 60,
  );
  ok('freeSlots no space → []', slots.length === 0);
}
// Custom work window narrower than duration → [].
ok('freeSlots window < duration → []', findFreeSlots([], 'd', 120, 600, 660).length === 0);
// Duration exactly equal to window → one slot.
ok('freeSlots window == duration → 1', (() => {
  const slots = findFreeSlots([], 'd', 60, 600, 660, 30);
  return slots.length === 1 && eqIv(slots[0], { start: 600, end: 660 });
})());
// Custom work window: morning only.
{
  const slots = findFreeSlots([], 'd', 60, 480, 600, 60); // 08:00–10:00, step 60 → 480–540, 540–600
  ok('freeSlots custom window count', eqList(slots, [{ start: 480, end: 540 }, { start: 540, end: 600 }]));
}
// Invalid duration → [].
ok('freeSlots zero duration → []', findFreeSlots([], 'd', 0).length === 0);
ok('freeSlots negative duration → []', findFreeSlots([], 'd', -60).length === 0);
// All-day event does NOT block slot-finding.
{
  const slots = findFreeSlots([{ date: 'd' }], 'd', 120);
  ok('freeSlots all-day does not block', slots.length === 21);
}

// ── fmtInterval ─────────────────────────────────────────────────────────────────
ok('fmtInterval basic', fmtInterval({ start: 540, end: 660 }) === '09:00–11:00');
ok('fmtInterval minutes', fmtInterval({ start: 870, end: 960 }) === '14:30–16:00');
ok('fmtInterval midnight', fmtInterval({ start: 0, end: 15 }) === '00:00–00:15');

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\navailability.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
