// npx tsx lib/property/status.test.ts
import {
  readStatus, writeStatus, isLet, isShortTerm, tabFitsStatus, statusLabel,
  STATUSES, BY_KEY, STATUS_DEPENDENT_TABS, type PropertyStatus,
} from './status';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); }
}

// ── ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΛΥΝΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ ─────────────────────────────────────
// Δύο στήλες περιέγραφαν το ίδιο πράγμα και μπορούσαν να διαφωνήσουν. Κάθε
// οθόνη έλυνε τη διαφωνία με δικό της κανόνα.
eq('ρητή βραχυχρόνια', readStatus({ status_detail: 'rented', rental_mode: 'short_term' }), 'rent_short');
eq('ρητή μακροχρόνια', readStatus({ status_detail: 'rented', rental_mode: 'long_term' }), 'rent_long');
// Ο τρόπος εκμετάλλευσης ΝΙΚΑ: είναι ρητή δήλωση, δεν μπαίνει κατά λάθος.
eq('ο τρόπος νικά το παλιό status', readStatus({ status_detail: 'seasonal', rental_mode: 'long_term' }), 'rent_long');

// ── ΠΑΛΙΑ ΔΕΔΟΜΕΝΑ, ΧΩΡΙΣ ΜΕΤΑΠΤΩΣΗ ───────────────────────────────────────
eq('παλιό «seasonal» χωρίς τρόπο', readStatus({ status_detail: 'seasonal' }), 'rent_short');
eq('παλιό «rented» χωρίς τρόπο', readStatus({ status_detail: 'rented' }), 'rent_long');
eq('κενό status', readStatus({ status_detail: '' }), 'vacant');
eq('null γραμμή', readStatus(null), 'vacant');
eq('undefined', readStatus(undefined), 'vacant');
eq('άγνωστη τιμή δεν σπάει τίποτα', readStatus({ status_detail: 'κάτι παλιό' }), 'vacant');
eq('κενά γύρω από την τιμή', readStatus({ status_detail: '  rented  ' }), 'rent_long');

// Οι υπόλοιπες καταστάσεις περνούν αυτούσιες.
for (const k of ['vacant', 'own_use', 'renovation', 'for_sale', 'disputed'] as const) {
  eq(`περνά αυτούσιο: ${k}`, readStatus({ status_detail: k }), k);
}

// ── ΓΡΑΨΙΜΟ: ΠΑΝΤΑ ΚΑΙ ΟΙ ΔΥΟ ΣΤΗΛΕΣ ──────────────────────────────────────
// Εκεί γεννιόταν η ασυνέπεια: η οθόνη ενημέρωνε το status και άφηνε τον τρόπο
// σε ό,τι είχε μείνει από παλιά.
eq('μακροχρόνια', writeStatus('rent_long'), { status_detail: 'rented', rental_mode: 'long_term' });
eq('βραχυχρόνια', writeStatus('rent_short'), { status_detail: 'seasonal', rental_mode: 'short_term' });
eq('το κενό ΣΒΗΝΕΙ τον τρόπο', writeStatus('vacant'), { status_detail: 'vacant', rental_mode: null });
eq('η ανακαίνιση σβήνει τον τρόπο', writeStatus('renovation'), { status_detail: 'renovation', rental_mode: null });

// Γράψιμο και ξαναδιάβασμα δίνει ΤΟ ΙΔΙΟ. Χωρίς αυτό, μια αλλαγή κατάστασης θα
// μπορούσε να προσγειωθεί σε άλλη κατάσταση από αυτή που πάτησε ο χρήστης.
for (const s of STATUSES) {
  eq(`κύκλος γράψε-διάβασε: ${s.key}`, readStatus(writeStatus(s.key)), s.key);
}

// ── ΠΟΙΕΣ ΚΑΡΤΕΛΕΣ ΕΜΦΑΝΙΖΟΝΤΑΙ ───────────────────────────────────────────
// Ο ιδιοκτήτης με Airbnb δεν έχει «ενοικιαστή», έχει επισκέπτες. Ο ιδιοκτήτης
// με τριετές μισθωτήριο δεν τιμολογεί ανά διανυκτέρευση.
{
  const long = { status_detail: 'rented', rental_mode: 'long_term' };
  eq('μακροχρόνια: Ενοικιαστής ναι', tabFitsStatus('tenant', long), true);
  eq('μακροχρόνια: Πελάτης όχι', tabFitsStatus('clients', long), false);
  eq('μακροχρόνια: Τιμολόγηση όχι', tabFitsStatus('pricing', long), false);
}
{
  const short = { status_detail: 'seasonal', rental_mode: 'short_term' };
  eq('βραχυχρόνια: Πελάτης ναι', tabFitsStatus('clients', short), true);
  eq('βραχυχρόνια: Τιμολόγηση ναι', tabFitsStatus('pricing', short), true);
  eq('βραχυχρόνια: Ενοικιαστής όχι', tabFitsStatus('tenant', short), false);
}
for (const k of ['vacant', 'own_use', 'renovation', 'for_sale', 'disputed'] as const) {
  const row = { status_detail: k };
  ok(`${k}: καμία καρτέλα μίσθωσης`,
    !tabFitsStatus('tenant', row) && !tabFitsStatus('clients', row) && !tabFitsStatus('pricing', row));
}

// Οι καρτέλες που ΔΕΝ εξαρτώνται από κατάσταση επιτρέπονται πάντα. Χωρίς αυτό,
// μια νέα καρτέλα θα εξαφανιζόταν σιωπηλά επειδή δεν αναφέρεται πουθενά.
for (const k of STATUSES.map(s => s.key)) {
  const row = writeStatus(k);
  ok(`${k}: οι ανεξάρτητες καρτέλες μένουν`,
    ['overview', 'finances', 'calendar', 'documents', 'settings', 'accounting'].every(t => tabFitsStatus(t, row)));
}

// ── ΒΟΗΘΗΤΙΚΑ ──────────────────────────────────────────────────────────────
eq('εκμισθώνεται: μακροχρόνια', isLet({ rental_mode: 'long_term' }), true);
eq('εκμισθώνεται: βραχυχρόνια', isLet({ status_detail: 'seasonal' }), true);
eq('δεν εκμισθώνεται: κενό', isLet({ status_detail: 'vacant' }), false);
eq('δεν εκμισθώνεται: ιδιοχρησία', isLet({ status_detail: 'own_use' }), false);
eq('βραχυχρόνια, ναι', isShortTerm({ rental_mode: 'short_term' }), true);
eq('βραχυχρόνια, όχι', isShortTerm({ rental_mode: 'long_term' }), false);
eq('ετικέτα', statusLabel({ status_detail: 'seasonal' }), 'Βραχυχρόνια μίσθωση');

// ── ΑΚΕΡΑΙΟΤΗΤΑ ΤΟΥ ΚΑΤΑΛΟΓΟΥ ─────────────────────────────────────────────
ok('κανένα διπλό κλειδί', new Set(STATUSES.map(s => s.key)).size === STATUSES.length);
ok('κανένα διπλό όνομα', new Set(STATUSES.map(s => s.label)).size === STATUSES.length);
ok('κάθε κατάσταση έχει εξήγηση', STATUSES.every(s => s.hint.trim().length > 10));
// Καμία καρτέλα δεν ανήκει σε δύο καταστάσεις: αλλιώς η ίδια οθόνη θα
// εμφανιζόταν σε δύο διαφορετικά συμφραζόμενα με άλλο νόημα.
{
  const seen = new Set<string>();
  let dupe = '';
  for (const s of STATUSES) for (const t of s.tabs) { if (seen.has(t)) dupe = t; seen.add(t); }
  eq('καμία καρτέλα σε δύο καταστάσεις', dupe, '');
}
eq('οι εξαρτώμενες καρτέλες είναι ακριβώς τρεις',
  [...STATUS_DEPENDENT_TABS].sort(), ['clients', 'pricing', 'tenant']);
ok('οι δύο μισθώσεις είναι πρώτες στο μενού',
  STATUSES[0].key === 'rent_long' && STATUSES[1].key === 'rent_short');
ok('κάθε κλειδί βρίσκεται στο ευρετήριο',
  (['rent_long', 'rent_short', 'vacant', 'own_use', 'renovation', 'for_sale', 'disputed'] as PropertyStatus[])
    .every(k => BY_KEY[k] !== undefined));

console.log(fail === 0 ? `✓ status: ${pass} έλεγχοι πέρασαν` : `✗ status: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
