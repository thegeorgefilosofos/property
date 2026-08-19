import { ATAK_DIGITS, atakDigits, isAtak } from './atak';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.error('✗', name)); };

ok('κρατά μόνο ψηφία', atakDigits('12345-678 901') === '12345678901');
ok('κόβει στο όριο', atakDigits('123456789012345').length === ATAK_DIGITS);
ok('κενό μένει κενό', atakDigits('') === '');
ok('null μένει κενό', atakDigits(null) === '');
ok('πλήρης ΑΤΑΚ περνά', isAtak('12345678901'));
ok('μισογραμμένος δεν περνά', !isAtak('1234'));
ok('γράμματα μόνα τους δεν περνούν', !isAtak('ΑΒΓΔΕΖΗΘΙΚΛ'));
// Ο καθαρισμός είναι ΙΔΙΟΔΥΝΑΜΟΣ: δεύτερο πέρασμα δεν αλλάζει τίποτα, αλλιώς
// η σάρωση και το πληκτρολόγιο θα κατέληγαν σε διαφορετική τιμή.
ok('ιδιοδύναμος', atakDigits(atakDigits('12 345 678 901 999')) === atakDigits('12 345 678 901 999'));

console.log(`atak: ✓ ${pass} · ✗ ${fail}`);
if (fail) process.exit(1);
