// Tests για τη μηχανή insights — τρέξε: npx tsx lib/insights/engine.test.ts
import { computeInsights, greeting, type InsightInput } from './engine';

let passed = 0, failed = 0;
const ok = (cond: boolean, msg: string) => { if (cond) passed++; else { failed++; console.error('✗', msg); } };
const NOW = new Date('2026-07-06T10:00:00').getTime();
const inDays = (n: number) => new Date(NOW + n * 86400000).toISOString().slice(0, 10);

const base = (over: Partial<InsightInput> = {}): InsightInput => ({
  now: NOW,
  property: { name: 'Test', status_detail: 'rented', value: 200000, sqm: 80, postal_code: '11111' },
  tenant: { monthly_rent: 700, lease_end: inDays(400) },
  rent: 700, propValue: 200000, grossYield: 4.2, netYield: 3.5, expensesYTD: 3000,
  expenses: [
    { category: 'Ρεύμα', amount: 100, date: inDays(-5), paid: true, payment_method: 'debit_cb' },
    { category: 'Νερό', amount: 50, date: inDays(-10), paid: true, payment_method: 'bank_transfer' },
    { category: 'Κοινόχρηστα', amount: 60, date: inDays(-15), paid: true, payment_method: 'debit_no_cb' },
  ],
  bills: [], tasks: [], checklist: [], inventory: [], loanPayment: 0,
  ...over,
});
const has = (input: InsightInput, id: string) => computeInsights(input).some(i => i.id === id);
const get = (input: InsightInput, id: string) => computeInsights(input).find(i => i.id === id);

// 1. Ασφάλεια ληγμένη → urgent
ok(get(base({ property: { ...base().property, insurance_expiry: inDays(-3) } }), 'insurance-expired')?.kind === 'urgent', 'insurance expired = urgent');
// 2. Ασφάλεια λήγει σε 30 → attention
ok(get(base({ property: { ...base().property, insurance_expiry: inDays(30) } }), 'insurance-soon')?.kind === 'attention', 'insurance soon = attention');
// 3. Ασφάλεια σε 200 μέρες → τίποτα
ok(!has(base({ property: { ...base().property, insurance_expiry: inDays(200) } }), 'insurance-soon'), 'insurance far = none');

// 4. Λήξη μίσθωσης σε 30 → attention
ok(get(base({ tenant: { monthly_rent: 700, lease_end: inDays(30) } }), 'lease-soon')?.kind === 'attention', 'lease soon = attention');
// 5. Μίσθωση ληγμένη → urgent
ok(get(base({ tenant: { monthly_rent: 700, lease_end: inDays(-1) } }), 'lease-expired')?.kind === 'urgent', 'lease expired = urgent');

// 6. Ληξιπρόθεσμος λογαριασμός → urgent + metric
{ const i = get(base({ bills: [{ type: 'electricity', amount: 120, paid: false, due_date: inDays(-2) }] }), 'bills-overdue');
  ok(i?.kind === 'urgent' && !!i?.metric?.includes('120'), 'overdue bill = urgent with metric'); }
// 7. Εκκρεμής (όχι ληξιπρόθεσμος) → attention
ok(get(base({ bills: [{ type: 'water', amount: 40, paid: false, due_date: inDays(10) }] }), 'bills-unpaid')?.kind === 'attention', 'unpaid future bill = attention');

// 8. Κενό ακίνητο → opportunity
{ const i = get(base({ property: { ...base().property, status_detail: 'vacant' }, tenant: null }), 'vacant');
  ok(i?.kind === 'opportunity' && !!i?.metric?.includes('700') && !!i?.metric?.includes('μήνα'), 'vacant = opportunity with rent metric'); }

// 9. Πολλά μετρητά → tax-electronic opportunity
{ const cashExp = Array.from({ length: 4 }, () => ({ category: 'Χ', amount: 300, date: inDays(-5), paid: true, payment_method: 'cash' }));
  ok(has(base({ expenses: cashExp, expensesYTD: 1200 }), 'tax-electronic'), 'high cash share = tax tip'); }
// 10. Όλα ηλεκτρονικά → όχι tax tip
ok(!has(base(), 'tax-electronic'), 'electronic payments = no tax tip');

// 11. Ρεύμα > 25% → energy opportunity
ok(has(base({ bills: [{ type: 'electricity', amount: 2000, paid: true, due_date: inDays(5) }], expensesYTD: 3000 }), 'energy-review'), 'high energy = review');

// 12. Δυνατή απόδοση → positive
ok(get(base({ netYield: 6 }), 'yield-strong')?.kind === 'positive', 'high yield = positive');
// 13. Χαμηλή απόδοση → opportunity
ok(get(base({ netYield: 2 }), 'yield-low')?.kind === 'opportunity', 'low yield = opportunity');

// 14. Έλλειψη στοιχείων → attention
ok(has(base({ property: { name: 'X', status_detail: 'rented' } }), 'profile-incomplete'), 'missing data = attention');
ok(!has(base(), 'profile-incomplete'), 'complete data = none');

// 15. Καμία δαπάνη → opportunity σάρωσης
ok(get(base({ expenses: [], expensesYTD: 0 }), 'no-expenses')?.kind === 'opportunity', 'no expenses = scan opportunity');
// 16. Παλιά δαπάνη → stale
ok(has(base({ expenses: [{ category: 'Χ', amount: 100, date: inDays(-60), paid: true, payment_method: 'debit_cb' }] }), 'stale'), 'stale expenses = attention');

// 17. Εγγύηση λήγει σε 30 → opportunity
ok(get(base({ inventory: [{ name: 'Πλυντήριο', warranty_expiry: inDays(30), condition: 'Καλή' }] }), 'warranty-soon')?.kind === 'opportunity', 'warranty soon = opportunity');

// 18. Ταξινόμηση: urgent πρώτο
{ const list = computeInsights(base({ property: { ...base().property, insurance_expiry: inDays(-3) }, netYield: 6 }));
  ok(list[0].kind === 'urgent', 'urgent sorts first'); }

// 19. Χαιρετισμός
ok(greeting(new Date('2026-07-06T09:00:00').getTime(), 'Γιώργος Παπαδόπουλος') === 'Καλημέρα, Γιώργος', 'greeting morning + first name');
ok(greeting(new Date('2026-07-06T20:00:00').getTime()) === 'Καλό βράδυ', 'greeting evening no name');

// 20. Ντετερμινισμός: ίδιο input → ίδιο output
{ const a = JSON.stringify(computeInsights(base())); const b = JSON.stringify(computeInsights(base()));
  ok(a === b, 'deterministic output'); }

// 21. Δαπάνες χωρίς ημερομηνία → ΔΕΝ βγαίνει «Infinity» στο stale insight
{ const input = base({ expenses: [{ category: 'Ρεύμα', amount: 100, date: undefined, paid: true }] });
  const stale = get(input, 'stale');
  ok(!stale || !/Infinity/.test(stale.detail), 'no Infinity in stale detail when dates missing');
  const all = computeInsights(input);
  ok(all.every(i => !/Infinity|NaN/.test(i.detail) && !/Infinity|NaN/.test(i.title)), 'no Infinity/NaN anywhere'); }

console.log(`\ninsights/engine.ts — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('όλα πέρασαν');
