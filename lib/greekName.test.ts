import { vocative } from './greekName';

let pass = 0, fail = 0;
const ok = (cond: boolean, msg: string) => { if (cond) pass++; else { fail++; console.error('FAIL:', msg); } };
const eq = (a: string, b: string, msg: string) => ok(a === b, `${msg} (got "${a}", want "${b}")`);

// -ος → -ο
eq(vocative('Γιώργος'), 'Γιώργο', 'Γιώργος');
eq(vocative('Χρήστος'), 'Χρήστο', 'Χρήστος');
eq(vocative('Νίκος'), 'Νίκο', 'Νίκος');
eq(vocative('Πέτρος'), 'Πέτρο', 'Πέτρος');

// -ιος → -ιε
eq(vocative('Μάριος'), 'Μάριε', 'Μάριος');
eq(vocative('Γεώργιος'), 'Γεώργιε', 'Γεώργιος');
eq(vocative('Δημήτριος'), 'Δημήτριε', 'Δημήτριος');

// -ας → -α
eq(vocative('Ανδρέας'), 'Ανδρέα', 'Ανδρέας');
eq(vocative('Κώστας'), 'Κώστα', 'Κώστας');
eq(vocative('Λουκάς'), 'Λουκά', 'Λουκάς');

// -ης → -η
eq(vocative('Γιάννης'), 'Γιάννη', 'Γιάννης');
eq(vocative('Δημήτρης'), 'Δημήτρη', 'Δημήτρης');
eq(vocative('Παναγιώτης'), 'Παναγιώτη', 'Παναγιώτης');

// Θηλυκά, αμετάβλητα
eq(vocative('Μαρία'), 'Μαρία', 'Μαρία');
eq(vocative('Ελένη'), 'Ελένη', 'Ελένη');
eq(vocative('Άννα'), 'Άννα', 'Άννα');

// Πολλαπλά ονόματα → μόνο το πρώτο
eq(vocative('Γιώργος Παπαδόπουλος'), 'Γιώργο', 'πλήρες όνομα → πρώτο');

// Μη ελληνικά, ως έχουν
eq(vocative('George'), 'George', 'λατινικό');
eq(vocative(''), '', 'κενό');
eq(vocative(null), '', 'null');

console.log(`greekName.ts — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1); else console.log('όλα πέρασαν');
