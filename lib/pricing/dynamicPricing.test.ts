// Δοκιμές δυναμικής τιμολόγησης. Τρέξε: npx tsx lib/pricing/dynamicPricing.test.ts
import {
  orthodoxEaster, holidayFor, realizedAdr, suggestBase, recommendPrices, priceForDate,
  summarize, suggestGuardrails, bookedDatesFromStays, SEASON_LABELS, indicativeMonthly,
} from './dynamicPricing';

let passed = 0, failed = 0; const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; fails.push(name); } };
const near = (a: number, b: number, eps = 0.001) => Math.abs(a - b) < eps;

// ── Ορθόδοξο Πάσχα (γνωστές ημερομηνίες) ────────────────────────────────────
ok('easter 2024 = 2024-05-05', orthodoxEaster(2024) === '2024-05-05');
ok('easter 2025 = 2025-04-20', orthodoxEaster(2025) === '2025-04-20');
ok('easter 2026 = 2026-04-12', orthodoxEaster(2026) === '2026-04-12');

// ── Αργίες ──────────────────────────────────────────────────────────────────
ok('15 Αυγ αργία', holidayFor('2026-08-15') === 'Δεκαπενταύγουστος');
ok('25 Δεκ αργία', holidayFor('2026-12-25') === 'Χριστούγεννα');
ok('Πρωτοχρονιά', holidayFor('2026-01-01') === 'Πρωτοχρονιά');
ok('Εορτές (27 Δεκ)', holidayFor('2026-12-27') === 'Εορτές');
ok('Πάσχα (Μ. Παρασκευή 2026)', holidayFor('2026-04-10') === 'Πάσχα');
ok('Πάσχα (Δευτέρα 2026)', holidayFor('2026-04-13') === 'Πάσχα');
ok('τυχαία μέρα χωρίς αργία', holidayFor('2026-03-10') === null);

// ── ADR / base από ιστορικό ─────────────────────────────────────────────────
const stays = [
  { check_in: '2025-07-01', check_out: '2025-07-05', total: 400 },  // 4 νύχτες, 100/νύχτα
  { check_in: '2025-08-10', check_out: '2025-08-12', nightly_rate: 150 }, // 2 νύχτες, 150
];
ok('realizedAdr = (400+300)/6', near(realizedAdr(stays), 700 / 6));
ok('suggestBase στρογγυλό', suggestBase(stays) === Math.round(700 / 6));
ok('suggestBase κενό → 0', suggestBase([]) === 0);

// ── priceForDate: παράγοντες & guardrails ───────────────────────────────────
const aug = priceForDate('2026-08-15', { base: 100 }); // Δεκαπενταύγουστος + Σάββατο
ok('Αύγουστος peak season', aug.season === 'peak');
ok('15 Αυγ isHoliday', aug.isHoliday && aug.holidayName === 'Δεκαπενταύγουστος');
ok('τιμή αιχμής > βάση', aug.price > 100);
ok('έχει ανάλυση παραγόντων', aug.factors.length >= 2);

const jan = priceForDate('2026-01-20', { base: 100 }); // χειμώνας, Τρίτη
ok('Ιανουάριος low season', jan.season === 'low');
ok('χειμώνας < βάση', jan.price < 100);

// guardrails: ανώτατο όριο κόβει την αιχμή
const capped = priceForDate('2026-08-15', { base: 100, max: 110 });
ok('max guardrail εφαρμόζεται', capped.price <= 110);
const floored = priceForDate('2026-01-20', { base: 100, min: 95 });
ok('min guardrail εφαρμόζεται', floored.price >= 95);

// ── weekend premium ─────────────────────────────────────────────────────────
const sat = priceForDate('2026-06-13', { base: 100 }); // Σάββατο
const tue = priceForDate('2026-06-16', { base: 100 }); // Τρίτη
ok('Σάββατο > Τρίτη ίδιο μήνα', sat.price > tue.price);
ok('Σάββατο isWeekend', sat.isWeekend);

// ── lead time (last-minute έκπτωση σε κενή κοντινή ημέρα) ────────────────────
const near1 = priceForDate('2026-06-16', { base: 100, today: '2026-06-15' }); // αύριο, κενό
const far1 = priceForDate('2026-06-16', { base: 100, today: '2026-05-01' });  // μακριά
ok('last-minute κενή < κανονική', near1.price < far1.price);

// ── occupancy: κλεισμένες γύρω → premium ────────────────────────────────────
const booked = new Set<string>(['2026-06-14', '2026-06-15', '2026-06-17', '2026-06-18', '2026-06-19']);
const hot = priceForDate('2026-06-16', { base: 100, bookedDates: booked });
const cold = priceForDate('2026-06-16', { base: 100 });
ok('υψηλή πληρότητα → ανεβάζει', hot.price >= cold.price);

// ── recommendPrices / summarize ─────────────────────────────────────────────
const rows = recommendPrices('2026-07-01', 31, { base: 100 });
ok('31 ημέρες', rows.length === 31);
ok('όλες οι τιμές θετικές', rows.every(r => r.price > 0));
const sum = summarize(rows);
ok('summary avg εντός min/max', sum.avg >= sum.min && sum.avg <= sum.max);
ok('Ιούλιος έχει peak μέρες', sum.peakCount > 0);

// booked date εξαιρείται από avg
const rows2 = recommendPrices('2026-07-01', 5, { base: 100, bookedDates: new Set(['2026-07-02']) });
ok('booked μετράει στο bookedCount', summarize(rows2).bookedCount === 1);

// ── guardrails helper ───────────────────────────────────────────────────────
const g = suggestGuardrails(100);
ok('guardrails min<base<max', g.min < 100 && g.max > 100);

// ── bookedDatesFromStays ────────────────────────────────────────────────────
const bd = bookedDatesFromStays([{ check_in: '2026-07-01', check_out: '2026-07-04' }]);
ok('booked set = 3 νύχτες (checkout exclusive)', bd.size === 3 && bd.has('2026-07-01') && bd.has('2026-07-03') && !bd.has('2026-07-04'));

// ── indicativeMonthly ───────────────────────────────────────────────────────
const im = indicativeMonthly(100);
ok('12 μήνες', im.length === 12);
ok('Αύγουστος (7) αιχμή & > Ιανουάριος (0)', im[7].season === 'peak' && im[7].weekday > im[0].weekday);
ok('Σαββατοκύριακο > καθημερινή', im.every(r => r.weekend >= r.weekday));

// ── labels ──────────────────────────────────────────────────────────────────
ok('season labels', SEASON_LABELS.peak === 'Αιχμή' && SEASON_LABELS.low === 'Χαμηλή');

console.log(`\ndynamicPricing — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
