// npx tsx lib/core/prefill.test.ts
//
// Κάθε έλεγχος εδώ φυλάει ΔΕΔΟΜΕΝΑ ΤΟΥ ΧΡΗΣΤΗ από αυτόματη αντικατάσταση. Το
// σφάλμα που τον γέννησε: η σάρωση συμβολαίου έγραφε τυφλά στο ακίνητο, οπότε
// μια θολή φωτογραφία διέγραφε σωστά νούμερα χωρίς να το πει σε κανέναν.
import { fillOnlyEmpty, isBlank, firstFilled } from './prefill';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } }

// ═══ ΤΙ ΜΕΤΡΑ ΩΣ ΚΕΝΟ ══════════════════════════════════════════════════════
// Η διάκριση δεν είναι τυπική: ορίζει ποια τιμή του χρήστη προστατεύεται.
ok('null είναι κενό', isBlank(null));
ok('undefined είναι κενό', isBlank(undefined));
ok('κενό κείμενο είναι κενό', isBlank(''));
ok('μόνο κενά είναι κενό', isBlank('   '));
ok('το μηδέν είναι κενό — τιμή φόρμας, όχι απόφαση', isBlank(0));
ok('το NaN είναι κενό', isBlank(NaN));
ok('κείμενο με περιεχόμενο ΔΕΝ είναι κενό', !isBlank('78'));
ok('αριθμός ΔΕΝ είναι κενό', !isBlank(78));
// Το `false` είναι απάντηση, όχι απουσία απάντησης: «όχι, δεν έχει δάνειο».
ok('το false ΔΕΝ είναι κενό — είναι επιλογή του χρήστη', !isBlank(false));

// ═══ ΓΕΜΑΤΟ ΠΕΔΙΟ ΔΕΝ ΑΚΟΥΜΠΙΕΤΑΙ ═════════════════════════════════════════
{
  const proposed = { sqm: 87, atak: '999', purchase_price: 200000 };
  eq('όλα γεμάτα → καμία εγγραφή',
     fillOnlyEmpty(proposed, { sqm: 78, atak: '111', purchase_price: 180000 }), {});
  eq('μόνο το κενό συμπληρώνεται',
     fillOnlyEmpty(proposed, { sqm: 78, atak: null, purchase_price: 180000 }), { atak: '999' });
  eq('το μηδέν συμπληρώνεται', fillOnlyEmpty({ sqm: 87 }, { sqm: 0 }), { sqm: 87 });
  eq('το κενό κείμενο συμπληρώνεται', fillOnlyEmpty({ atak: '999' }, { atak: '   ' }), { atak: '999' });
  eq('το false ΔΕΝ αντικαθίσταται', fillOnlyEmpty({ has_loan: true }, { has_loan: false }), {});
  eq('χωρίς υπάρχουσα γραμμή γράφονται όλα', fillOnlyEmpty(proposed, null), proposed);
  eq('undefined γραμμή = νέα γραμμή', fillOnlyEmpty(proposed, undefined), proposed);
  eq('κλειδί που λείπει θεωρείται κενό',
     fillOnlyEmpty({ obj_value: 95000 }, { sqm: 78 }), { obj_value: 95000 });
}

// Τα ορίσματα δεν αλλοιώνονται: ο καλών μπορεί να τα ξαναχρησιμοποιήσει.
{
  const proposed = { sqm: 87 };
  const current = { sqm: 0 };
  fillOnlyEmpty(proposed, current);
  eq('το proposed μένει ακέραιο', proposed, { sqm: 87 });
  eq('το current μένει ακέραιο', current, { sqm: 0 });
}

// ═══ ΜΙΑ ΠΛΗΡΟΦΟΡΙΑ, ΣΕΙΡΑ ΠΡΟΤΕΡΑΙΟΤΗΤΑΣ ΓΡΑΜΜΕΝΗ ΜΙΑ ΦΟΡΑ ══════════════
eq('παίρνει το πρώτο γεμάτο', firstFilled(null, '', 'Γεωργίου'), 'Γεωργίου');
eq('καθαρίζει τα κενά γύρω', firstFilled('  Γεωργίου  '), 'Γεωργίου');
eq('προσπερνά τα μόνο-κενά', firstFilled('   ', 'Εταιρεία'), 'Εταιρεία');
eq('όλα κενά → κενό κείμενο', firstFilled(null, undefined, '  '), '');
eq('χωρίς υποψηφίους → κενό κείμενο', firstFilled(), '');

console.log(fail === 0 ? `✓ prefill: ${pass} έλεγχοι πέρασαν` : `✗ prefill: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
