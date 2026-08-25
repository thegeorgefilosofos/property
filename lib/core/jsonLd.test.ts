// ═══════════════════════════════════════════════════════════════════════════
// Η ΔΙΑΦΥΓΗ ΤΩΝ ΔΟΜΗΜΕΝΩΝ ΔΕΔΟΜΕΝΩΝ
// ─────────────────────────────────────────────────────────────────────────
// Το `JsonLd` του app/PublicChrome.tsx γράφει JSON μέσα σε <script>. Σήμερα
// όλες οι τιμές είναι σταθερές γραμμένες από εμάς και δεν περιέχουν «<», άρα η
// διαφυγή δεν ενεργοποιείται ΠΟΤΕ στην παραγωγή: αν δεν δοκιμαστεί χωριστά,
// είναι κώδικας χωρίς καμία απόδειξη ότι δουλεύει. Εδώ δοκιμάζεται ο ίδιος
// μετασχηματισμός με τιμή που κλείνει την ετικέτα.
// ═══════════════════════════════════════════════════════════════════════════
import { jsonLdScript as esc } from './jsonLd';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fails++; }
};

console.log('Διαφυγή δομημένων δεδομένων');

const hostile = { name: 'Ακίνητο </script><script>alert(1)</script>' };
const out = esc(hostile);
ok(!out.includes('</script'), 'καμία ετικέτα δεν κλείνει μέσα στο JSON');
ok(!out.includes('<'), 'κανένα «<» δεν επιβιώνει');
ok(out.includes('\\u003c'), 'το «<» έγινε \\u003c');
ok(JSON.parse(out).name === hostile.name, 'και το JSON παραμένει έγκυρο, με την τιμή ανέπαφη');

const plain = { '@context': 'https://schema.org', name: 'PROPERWISE' };
ok(esc(plain) === JSON.stringify(plain), 'κείμενο χωρίς «<» μένει byte προς byte ίδιο');

console.log(fails ? `\n✗ ${fails} απέτυχαν` : '\n✓ όλα πέρασαν');
if (fails) process.exit(1);
