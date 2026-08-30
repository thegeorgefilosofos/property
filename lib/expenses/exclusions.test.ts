// npx tsx lib/expenses/exclusions.test.ts
import { parseExclusions, exclusionKeys, countsIn, setCounts, excludedCount, type ExclusionMap } from './exclusions';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); }
}

// ── ΤΟ ΔΙΑΒΑΣΜΑ ΔΕΝ ΡΙΧΝΕΙ ΤΗΝ ΟΘΟΝΗ ────────────────────────────────────────
// Το πεδίο είναι ελεύθερο κείμενο μέσα σε jsonb. Ο,τι κι αν βρεθεί εκεί, η
// λίστα των δαπανών πρέπει να αποδοθεί.
eq('κενό → κανένας κανόνας', parseExclusions(''), {});
eq('undefined → κανένας κανόνας', parseExclusions(undefined), {});
eq('σκουπίδια → κανένας κανόνας', parseExclusions('{ό,τι νά'), {});
eq('πίνακας → κανένας κανόνας', parseExclusions('["b1"]'), {});
eq('null μέσα → κανόνας χωρίς πεδία', parseExclusions('{"b1":null}'), { b1: {} });
eq('κανονικό', parseExclusions('{"b1":{"payer":"Ενοικιαστής"},"e2":{}}'),
  { b1: { payer: 'Ενοικιαστής' }, e2: {} });
eq('μερικό ποσό διατηρείται', parseExclusions('{"b1":{"amount":50}}'), { b1: { amount: 50 } });

// ── ΤΑ ΔΥΟ ΚΛΕΙΔΙΑ ΜΙΑΣ ΓΡΑΜΜΗΣ ─────────────────────────────────────────────
eq('λογαριασμός και δαπάνη', exclusionKeys({ billId: 'b1', expenseId: 'e1' }), ['b1', 'e1']);
eq('μόνο δαπάνη', exclusionKeys({ billId: null, expenseId: 'e1' }), ['e1']);
eq('τίποτα', exclusionKeys({}), []);

// ── ΠΟΙΑ ΓΡΑΜΜΗ ΜΕΤΡΑ ───────────────────────────────────────────────────────
// Το κρίσιμο: η παλιά εξαίρεση γράφτηκε με το id του ΛΟΓΑΡΙΑΣΜΟΥ. Μετά τη
// συγχώνευση η ίδια γραμμή κουβαλά και τα δύο· πρέπει να μείνει εκτός.
{
  const m = parseExclusions('{"b1":{}}');
  ok('παλιό κλειδί λογαριασμού κρατά τη γραμμή εκτός', !countsIn(m, { billId: 'b1', expenseId: 'e1' }));
  ok('άσχετη γραμμή μετρά', countsIn(m, { billId: 'b2', expenseId: 'e2' }));
  ok('γραμμή χωρίς αναγνωριστικά μετρά', countsIn(m, {}));
}
{
  const m = parseExclusions('{"e1":{}}');
  ok('κλειδί δαπάνης κρατά τη γραμμή εκτός', !countsIn(m, { billId: 'b1', expenseId: 'e1' }));
}

// ── Ο ΔΙΑΚΟΠΤΗΣ ─────────────────────────────────────────────────────────────
{
  const e = { billId: null, expenseId: 'e1' };
  const off = setCounts({}, e, false);
  eq('εξαίρεση δαπάνης γράφει το id της', off, { e1: {} });
  ok('και δεν μετρά πια', !countsIn(off, e));
  eq('επαναφορά καθαρίζει', setCounts(off, e, true), {});
}
{
  // Γραμμή με λογαριασμό: γράφεται το κλειδί που διαβάζει ήδη ο προϋπολογισμός.
  const e = { billId: 'b1', expenseId: 'e1' };
  eq('προτεραιότητα στον λογαριασμό', setCounts({}, e, false), { b1: {} });
}
{
  // ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΦΥΛΑΕΙ ΑΥΤΟΣ Ο ΕΛΕΓΧΟΣ: αν η επαναφορά έσβηνε μόνο το ένα
  // κλειδί, ο χρήστης θα γύριζε τον διακόπτη και η γραμμή θα έμενε εκτός.
  const e = { billId: 'b1', expenseId: 'e1' };
  const both: ExclusionMap = { b1: {}, e1: { payer: 'Ενοικιαστής' } };
  eq('η επαναφορά σβήνει και τα δύο κλειδιά', setCounts(both, e, true), {});
  ok('και μετά μετρά', countsIn(setCounts(both, e, true), e));
}
{
  // Ο κανόνας με τα επιπλέον πεδία ΔΕΝ πετιέται όταν ξαναπατηθεί η εξαίρεση.
  const e = { billId: 'b1', expenseId: null };
  const m: ExclusionMap = { b1: { payer: 'Ενοικιαστής', note: 'το μισό', amount: 50 } };
  eq('η δεύτερη εξαίρεση κρατά λόγο και ποσό', setCounts(m, e, false), m);
}
{
  // Γραμμή χωρίς αναγνωριστικά δεν αλλάζει τίποτα.
  const m: ExclusionMap = { b1: {} };
  eq('χωρίς id, ο χάρτης μένει ίδιος', setCounts(m, {}, false), m);
}

eq('το πλήθος των εκτός', excludedCount({ b1: {}, e2: {} }), 2);
eq('κανένα εκτός', excludedCount({}), 0);

// ── ΤΟ ΑΜΕΤΑΒΛΗΤΟ ───────────────────────────────────────────────────────────
{
  const m: ExclusionMap = { b1: {} };
  setCounts(m, { billId: 'b2', expenseId: null }, false);
  eq('ο αρχικός χάρτης δεν πειράζεται', m, { b1: {} });
}

console.log(`exclusions.ts — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
