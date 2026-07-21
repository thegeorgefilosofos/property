// Tests for the Greek/English name → gender inference. Run: npx tsx verify-gender.ts
import { guessGender } from './gender.ts';

let failed = 0;
const ok = (c: boolean, m: string) => { if (!c) { failed++; console.error('  ✗ ' + m); } else console.log('  ✓ ' + m); };
const is = (name: string, g: string) => ok(guessGender(name) === g, `${name} → ${g} (got ${guessGender(name)})`);

console.log('\nFemale Greek');
['Ελένη', 'Μαρία', 'Κατερίνα', 'Δέσποινα', 'Αργυρώ', 'Ζωή', 'Παρασκευή', 'Αναστασία', 'Κωνσταντίνα', 'Αθηνά', 'Χλόη', 'Ραλλού'].forEach(n => is(n, 'female'));

console.log('\nMale Greek');
['Γιάννης', 'Γιώργος', 'Κώστας', 'Δημήτρης', 'Νίκος', 'Ηλίας', 'Θωμάς', 'Λουκάς', 'Παναγιώτης', 'Ανδρέας', 'Στέλιος', 'Σωτήρης'].forEach(n => is(n, 'male'));

console.log('\nMorphology (vocative / genitive)');
is('Γιάννη', 'male');      // vocative of Γιάννης
is('Κώστα', 'male');       // vocative/genitive of Κώστας
is('Νίκο', 'male');        // vocative of Νίκος
is('Μαρίας', 'female');    // genitive of Μαρία
is('Ελένης', 'female');    // genitive of Ελένη

console.log('\nEnglish');
['John', 'George', 'Michael', 'Alexander'].forEach(n => is(n, 'male'));
['Mary', 'Anna', 'Sophia', 'Victoria'].forEach(n => is(n, 'female'));

console.log('\nFull names → use first token');
is('Ελένη Παπαδοπούλου', 'female');
is('Γιώργος Α. Νικολάου', 'male');

console.log('\nUnknown / ambiguous → neutral (safe)');
['Xxyz', 'Sky', '', 'A', '123'].forEach(n => ok(guessGender(n) === 'unknown', `${n || '(empty)'} → unknown`));

console.log('\nSuffix heuristic (names not in the list)');
is('Αριστοφάνης', 'male');   // -ης
is('Πολυτίμη', 'female');    // -η

console.log('');
if (failed) { console.error(`✗ ${failed} failed`); process.exit(1); }
console.log('✓ all gender checks pass');
