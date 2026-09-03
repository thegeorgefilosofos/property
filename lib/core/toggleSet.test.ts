// npx tsx lib/core/toggleSet.test.ts
import { toggleIn } from './toggleSet';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`); } };

ok('βάζει ό,τι λείπει', [...toggleIn(new Set(['a']), 'b')].join() === 'a,b');
ok('βγάζει ό,τι υπάρχει', [...toggleIn(new Set(['a', 'b']), 'a')].join() === 'b');
ok('κενό σύνολο δέχεται', [...toggleIn(new Set<number>(), 7)].join() === '7');
ok('μονό στοιχείο αδειάζει', [...toggleIn(new Set([7]), 7)].length === 0);

// ═══ ΕΔΩ ΖΕΙ ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΔΕΝ ΣΚΑΕΙ ══════════════════════════════════════
// Αν κάποιο αντίγραφο ξεχάσει το `new Set(prev)` και μεταλλάξει το προηγούμενο
// σύνολο, η React συγκρίνει με ταυτότητα: βλέπει το ΙΔΙΟ αντικείμενο, θεωρεί
// ότι τίποτα δεν άλλαξε και δεν ξαναζωγραφίζει. Καμία εξαίρεση, κανένα κόκκινο,
// απλώς μια οθόνη που δεν ανταποκρίνεται στο πάτημα.
const before = new Set(['a']);
const after = toggleIn(before, 'b');
ok('το αρχικό σύνολο δεν αγγίζεται', [...before].join() === 'a');
ok('επιστρέφεται ΑΛΛΟ αντικείμενο', after !== (before as unknown as Set<string>));

console.log(fail === 0 ? `toggleSet: ✓ ${pass}` : `toggleSet: ✓ ${pass} · ✗ ${fail}`);
if (fail > 0) process.exit(1);
