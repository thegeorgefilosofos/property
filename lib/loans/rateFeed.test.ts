// Η διασταύρωση των επιτοκίων, με τους αριθμούς της παραγωγής (bank_rates, 02/09/2026).
import { fromRate, diffBank, decide, changeKey, HOLD_ABOVE, type CurrentBank } from './rateFeed';

let pass = 0, fail = 0;
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n); } };

// ── Το «από» ενός επιτοκίου ─────────────────────────────────────────────────
ok('εύρος «2.40-4.70» δίνει το χαμηλότερο', fromRate('2.40-4.70') === 2.4);
ok('μονή τιμή «3.40»', fromRate('3.40') === 3.4);
ok('ελληνικό δεκαδικό «3,50»', fromRate('3,50') === 3.5);
ok('αριθμός περνά ως έχει', fromRate(2.4) === 2.4 && fromRate(3) === 3);
ok('κενό → null', fromRate(null) === null && fromRate('—') === null);

// ── Η γραμμή της Πειραιώς όπως ζει στη βάση ────────────────────────────────
const piraeus: CurrentBank = {
  bank_id: 'piraeus', fixed_3yr: '2.40-4.70', fixed_5yr: '2.40-4.70', fixed_10yr: '2.40-4.70',
  fixed_15yr: '2.40-4.70', fixed_20yr: '2.40-4.70', variable_spread_min: 1.4, variable_spread_max: 2.45, max_ltv: 90,
};

ok('ίδιες τιμές: καμία αλλαγή', diffBank(piraeus, { fixed_5yr: 2.4, variable_spread_min: 1.4, max_ltv: 90 }).length === 0);
ok('ισότητα στο εκατοστό: 2,404 δεν είναι αλλαγή', diffBank(piraeus, { fixed_5yr: 2.404 }).length === 0);

const small = diffBank(piraeus, { fixed_5yr: 2.6 });
ok('μικρή άνοδος 2,40→2,60 καταγράφεται με δέλτα +0,20', small.length === 1 && small[0].delta === 0.2 && small[0].old === 2.4);
ok('…και εφαρμόζεται', decide(small, new Set()).apply.length === 1);

const big = diffBank(piraeus, { fixed_5yr: 4.9 });
ok('άλμα 2,40→4,90 κρατιέται στο πρώτο πέρασμα', decide(big, new Set()).hold.length === 1 && decide(big, new Set()).apply.length === 0);
ok('…και εφαρμόζεται όταν το δεύτερο πέρασμα επιστρέψει ΤΗΝ ΙΔΙΑ τιμή', decide(big, new Set([changeKey(big[0])])).apply.length === 1);
ok('…αλλά ΟΧΙ όταν το δεύτερο πέρασμα λέει άλλη τιμή', decide(diffBank(piraeus, { fixed_5yr: 4.8 }), new Set([changeKey(big[0])])).hold.length === 1);

// ── Πρώτη τιμή σε κενό πεδίο δεν είναι «μεταβολή» ──────────────────────────
const empty: CurrentBank = { ...piraeus, bank_id: 'x', fixed_20yr: null, variable_spread_max: null };
const first = diffBank(empty, { fixed_20yr: 4.5, variable_spread_max: 2.9 });
ok('κενό πεδίο: δέλτα null, εφαρμόζεται', first.length === 2 && first.every(c => c.delta === null) && decide(first, new Set()).apply.length === 2);

// ── Το LTV έχει δικό του κατώφλι ───────────────────────────────────────────
ok('LTV 90→80 (10 μονάδες) εφαρμόζεται, 90→75 κρατιέται',
  decide(diffBank(piraeus, { max_ltv: 80 }), new Set()).apply.length === 1
  && decide(diffBank(piraeus, { max_ltv: 75 }), new Set()).hold.length === 1);
ok('το κατώφλι του LTV είναι 10 και των επιτοκίων 1', HOLD_ABOVE.max_ltv === 10 && HOLD_ABOVE.fixed_5yr === 1);

// ── Το κλειδί είναι σταθερό στο εκατοστό ───────────────────────────────────
ok('changeKey στρογγυλεύει στο εκατοστό', changeKey({ bank_id: 'a', field: 'fixed_5yr', next: 3.4 }) === 'a:fixed_5yr:3.40');

console.log(fail ? `✗ rateFeed: ${fail} απέτυχαν, ${pass} πέρασαν` : `✓ rateFeed: ${pass} έλεγχοι πέρασαν`);
if (fail) process.exit(1);
