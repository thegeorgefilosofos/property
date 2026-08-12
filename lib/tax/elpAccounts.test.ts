import { ELP_64, CATEGORY_ELP, elpAccountFor, usedElpAccounts } from './elpAccounts';
import { CATEGORIES } from '../expenses/taxonomy';

let fails = 0;
const ok = (c: boolean, m: string) => { if (c) console.log(`  ✓ ${m}`); else { console.log(`  ✗ ${m}`); fails++; } };
const eq = (m: string, got: unknown, want: unknown) =>
  ok(got === want, `${m}${got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);

console.log('Ο λογαριασμός 64 των ΕΛΠ');
eq('δεκατρείς υπολογαριασμοί, όσοι του Παραρτήματος Γ', ELP_64.length, 13);
ok(ELP_64.every(a => /^64\.\d{2}$/.test(a.code)), 'κάθε κωδικός είναι 64.xx');
ok(ELP_64.every((a, i) => i === 0 || a.code > ELP_64[i - 1].code), 'στη σειρά του νόμου, χωρίς κενά στη σειρά');
eq('64.02 είναι η ενέργεια', ELP_64[1].name, 'Ενέργεια');
eq('64.09 οι επισκευές', elpAccountFor('plumber')?.name, 'Επισκευές και συντηρήσεις');

console.log('\nΗ αντιστοίχιση των κατηγοριών');
// ΚΑΘΕ ΚΛΕΙΔΙ ΠΡΕΠΕΙ ΝΑ ΕΙΝΑΙ ΥΠΑΡΚΤΗ ΚΑΤΗΓΟΡΙΑ. Ένα ορφανό κλειδί δεν σκάει:
// απλώς δεν ταιριάζει ποτέ, και η στήλη μένει κενή χωρίς να το μάθει κανείς.
const slugs = new Set(CATEGORIES.map(c => c.slug));
eq('κανένα ορφανό κλειδί', Object.keys(CATEGORY_ELP).filter(k => !slugs.has(k)).join(', '), '');
ok(Object.values(CATEGORY_ELP).every(c => ELP_64.some(a => a.code === c)), 'κανένας κωδικός εκτός του 64');
eq('ρεύμα και αέριο στον ίδιο λογαριασμό', CATEGORY_ELP.electricity, CATEGORY_ELP.gas);
eq('το νερό στην ύδρευση', elpAccountFor('water')?.code, '64.03');
eq('τα δημοτικά τέλη στους φόρους και τέλη', elpAccountFor('municipal')?.code, '64.11');

// ΟΣΑ ΔΕΝ ΑΝΗΚΟΥΝ ΣΤΟΝ 64, ΛΕΙΠΟΥΝ ΕΠΙΤΗΔΕΣ. Τα πάγια δεν είναι λειτουργικό
// έξοδο (αποσβένονται) και ο ΕΝΦΙΑ δεν είναι έξοδο εκμετάλλευσης.
console.log('\nΌσα λείπουν, λείπουν με λόγο');
for (const slug of ['renovation', 'appliance', 'furniture', 'enfia', 'other']) {
  eq(`το «${slug}» δεν μπαίνει στον 64`, elpAccountFor(slug), null);
}
eq('άγνωστο, κανένα συμπέρασμα', elpAccountFor('ξψζ'), null);
eq('κενό, κανένα συμπέρασμα', elpAccountFor(null), null);

console.log('\nΌσοι χρησιμοποιούνται');
const used = usedElpAccounts();
ok(used.length > 0 && used.length < ELP_64.length, 'υποσύνολο, όχι ολόκληρος ο λογαριασμός');
ok(used.every((a, i) => i === 0 || a.code > used[i - 1].code), 'κρατούν τη σειρά του νόμου');
ok(!used.some(a => a.code === '64.13'), 'οι συνδεδεμένες οντότητες δεν αφορούν ιδιοκτήτη ακινήτου');

console.log(`\nelpAccounts: ${fails === 0 ? '✓ όλα' : `✗ ${fails}`}`);
if (fails) process.exit(1);
