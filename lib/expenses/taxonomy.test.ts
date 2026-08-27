// npx tsx lib/expenses/taxonomy.test.ts
import {
  resolveCategory, categoryLabel, categoryFamily, isDeductible,
  categoriesOf, budgetBucket, CATEGORIES, norm,
} from './taxonomy';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); }
}

// ── ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΛΥΝΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ ─────────────────────────────────────
// Οι Λογαριασμοί έγραφαν 'electricity', οι Δαπάνες 'Ρεύμα' και ο
// Προϋπολογισμός έψαχνε μόνο αγγλικά. Κάθε χειροκίνητη δαπάνη προσγειωνόταν
// στις «Λοιπές». Και τα δύο πρέπει να δείχνουν στο ίδιο πράγμα.
eq('αγγλικό slug', resolveCategory('electricity'), 'electricity');
eq('ελληνική ετικέτα', resolveCategory('Ρεύμα'), 'electricity');
eq('πεζά χωρίς τόνο', resolveCategory('ρευμα'), 'electricity');
eq('κεφαλαία', resolveCategory('ΡΕΥΜΑ'), 'electricity');
eq('όνομα παρόχου', resolveCategory('ΔΕΗ'), 'electricity');
ok('και τα τέσσερα λεξιλόγια συμφωνούν',
  new Set(['electricity', 'Ρεύμα', 'ρευμα', 'ΔΕΗ'].map(resolveCategory)).size === 1);

// ── ΤΑ ΤΕΣΣΕΡΑ ΠΑΛΙΑ ΛΕΞΙΚΑ, ΓΡΑΜΜΗ ΓΡΑΜΜΗ ─────────────────────────────────
// Λογαριασμοί (αγγλικά slugs)
for (const [raw, want] of [
  ['common', 'common'], ['internet', 'internet'], ['water', 'water'], ['gas', 'gas'],
  ['insurance', 'insurance'], ['security', 'security'], ['streaming', 'subscription'],
  ['enfia', 'enfia'], ['dimotika', 'municipal'], ['cleaning', 'cleaning'],
  ['garden', 'garden'], ['pool', 'pool'], ['elevator', 'elevator'],
  ['ac_service', 'ac_service'], ['renovation', 'renovation'], ['pest', 'pest'], ['other', 'other'],
] as const) eq(`λογαριασμοί: ${raw}`, resolveCategory(raw), want);

// Δαπάνες (ελληνικές ετικέτες)
for (const [raw, want] of [
  ['Κοινόχρηστα', 'common'], ['Νερό', 'water'], ['Φυσικό αέριο', 'gas'],
  ['Internet', 'internet'], ['Ασφάλεια Κτιρίου', 'insurance'], ['ΕΝΦΙΑ', 'enfia'],
  ['Δημοτικά Τέλη', 'municipal'], ['Σύστημα Συναγερμού', 'security'],
  ['Υδραυλικός', 'plumber'], ['Ηλεκτρολόγος', 'electrician'], ['Κηπουρός', 'garden'],
  ['Συντήρηση Ασανσέρ', 'elevator'], ['Καθαρισμός Πισίνας', 'pool'],
  ['Γενική Συντήρηση', 'repair'], ['Συμβολαιογράφος', 'notary'],
] as const) eq(`δαπάνες: ${raw}`, resolveCategory(raw), want);

// Προϋπολογισμός
for (const [raw, want] of [['heating', 'heating'], ['maintenance', 'repair'], ['services', null]] as const) {
  eq(`προϋπολογισμός: ${raw}`, resolveCategory(raw), want);
}

// ── ΤΟ «ΦΥΣΙΚΟ ΑΕΡΙΟ» ΔΕΝ ΕΙΝΑΙ «ΑΕΡΙΟ» ΣΚΕΤΟ ──────────────────────────────
// Το μακρύτερο συνώνυμο πρέπει να νικά, αλλιώς μια μερική λέξη κλέβει το ταίριασμα.
eq('φυσικό αέριο', resolveCategory('Φυσικό αέριο'), 'gas');
eq('μέσα σε πρόταση', resolveCategory('Λογαριασμός φυσικού αερίου Ιουνίου'), 'gas');

// ── ΤΑΙΡΙΑΣΜΑ ΜΕΣΑ ΣΕ ΕΛΕΥΘΕΡΟ ΚΕΙΜΕΝΟ ─────────────────────────────────────
// Ο χρήστης γράφει «Λογαριασμός ΔΕΗ Ιουνίου», όχι «electricity».
eq('πρόταση με πάροχο', resolveCategory('Λογαριασμός ΔΕΗ Ιουνίου'), 'electricity');
eq('πρόταση με επάγγελμα', resolveCategory('Πλήρωσα τον υδραυλικό'), 'plumber');
eq('πρόταση με ΕΥΔΑΠ', resolveCategory('ΕΥΔΑΠ δίμηνο'), 'water');

// ── ΔΕΝ ΜΑΝΤΕΥΟΥΜΕ ──────────────────────────────────────────────────────────
// Άγνωστο σημαίνει άγνωστο. Η σιωπηλή πτώση στο «άλλο» είναι ακριβώς ο τρόπος
// που ο Προϋπολογισμός κατέληξε να δείχνει τα πάντα ως «Λοιπές δαπάνες».
eq('άγνωστο → null', resolveCategory('κάτι εντελώς άσχετο ξψζ'), null);
eq('κενό → null', resolveCategory(''), null);
eq('null → null', resolveCategory(null), null);
eq('undefined → null', resolveCategory(undefined), null);

// ── ΕΤΙΚΕΤΕΣ ΓΙΑ ΑΝΘΡΩΠΟΥΣ ─────────────────────────────────────────────────
eq('ετικέτα από slug', categoryLabel('electricity'), 'Ρεύμα');
eq('ετικέτα από πάροχο', categoryLabel('ΔΕΗ'), 'Ρεύμα');
eq('άγνωστο κρατά ό,τι έγραψε ο χρήστης', categoryLabel('Δώρο στον θυρωρό'), 'Δώρο στον θυρωρό');
eq('κενό → Άλλο', categoryLabel(''), 'Άλλο');
ok('καμία ετικέτα δεν είναι λογιστικός όρος',
  CATEGORIES.every(c => !/δαπάν(ες|η) |λογιστικ|παραστατικ|χρέωσ/i.test(c.label)));

// ── ΟΙΚΟΓΕΝΕΙΕΣ ────────────────────────────────────────────────────────────
eq('ρεύμα → πάγια', categoryFamily('electricity'), 'home');
eq('υδραυλικός → συντήρηση', categoryFamily('Υδραυλικός'), 'upkeep');
eq('ΕΝΦΙΑ → επίσημα', categoryFamily('ΕΝΦΙΑ'), 'official');
eq('ανακαίνιση → εξοπλισμός', categoryFamily('renovation'), 'setup');
eq('άγνωστο → άλλα', categoryFamily('ξψζ'), 'other');
ok('κάθε κατηγορία ανήκει σε οικογένεια',
  CATEGORIES.every(c => ['home', 'upkeep', 'official', 'setup', 'other'].includes(c.family)));
ok('καμία οικογένεια δεν είναι άδεια',
  (['home', 'upkeep', 'official', 'setup', 'other'] as const).every(f => categoriesOf(f).length > 0));

// ── ΕΚΠΤΩΣΙΜΟΤΗΤΑ: ΤΟ ΛΑΘΟΣ ΓΕΡΝΕΙ ΠΡΟΣ ΤΑ ΚΑΤΩ ───────────────────────────
// Να πούμε «εκπίπτει» για κάτι που δεν εκπίπτει, κοστίζει στον χρήστη πρόστιμο.
// Να μην το πούμε, κοστίζει μια ερώτηση στον λογιστή του.
eq('ρεύμα εκπίπτει', isDeductible('electricity'), true);
eq('ασφάλεια εκπίπτει', isDeductible('Ασφάλεια'), true);
eq('ΕΝΦΙΑ δεν εκπίπτει', isDeductible('ΕΝΦΙΑ'), false);
eq('ανακαίνιση δεν εκπίπτει', isDeductible('renovation'), false);
eq('άγνωστο δεν εκπίπτει', isDeductible('κάτι άγνωστο'), false);

// ── ΑΝΑΖΗΤΗΣΗ: ΕΝΑ ΠΕΔΙΟ ΑΝΤΙ ΓΙΑ ΔΥΟ ──────────────────────────────────────

// ── ΑΚΕΡΑΙΟΤΗΤΑ ΤΗΣ ΛΙΣΤΑΣ ─────────────────────────────────────────────────
ok('κανένα διπλό slug', new Set(CATEGORIES.map(c => c.slug)).size === CATEGORIES.length);
ok('κανένα διπλό label', new Set(CATEGORIES.map(c => c.label)).size === CATEGORIES.length);
{
  const seen = new Map<string, string>();
  let clash = '';
  for (const c of CATEGORIES) {
    for (const a of [c.label, ...c.aliases].map(norm)) {
      const prev = seen.get(a);
      if (prev && prev !== c.slug) clash = `${a}: ${prev} vs ${c.slug}`;
      seen.set(a, c.slug);
    }
  }
  eq('κανένα συνώνυμο δεν δείχνει σε δύο κατηγορίες', clash, '');
}
ok('κάθε κατηγορία έχει τουλάχιστον ένα συνώνυμο', CATEGORIES.every(c => c.aliases.length > 0));
ok('λογικό πλήθος για ένα κεφάλι', CATEGORIES.length >= 20 && CATEGORIES.length <= 32);

// ── ΚΟΥΒΑΔΕΣ ΠΡΟΫΠΟΛΟΓΙΣΜΟΥ ────────────────────────────────────────────────
// Το σφάλμα: ο Προϋπολογισμός ήξερε μόνο αγγλικά κλειδιά, οπότε κάθε ελληνική
// καταχώρηση έπεφτε στις «Λοιπές δαπάνες». Η συντήρηση έδειχνε πάντα μηδέν.
eq('ελληνικό ρεύμα βρίσκει κουβά', budgetBucket('Ρεύμα'), 'electricity');
eq('πάροχος βρίσκει κουβά', budgetBucket('ΔΕΗ'), 'electricity');
eq('υδραυλικός πάει συντήρηση', budgetBucket('Υδραυλικός'), 'maintenance');
eq('ηλεκτρολόγος πάει συντήρηση', budgetBucket('Ηλεκτρολόγος'), 'maintenance');
eq('ασανσέρ πάει συντήρηση', budgetBucket('Συντήρηση Ασανσέρ'), 'maintenance');
eq('ΕΝΦΙΑ πάει υπηρεσίες', budgetBucket('ΕΝΦΙΑ'), 'services');
eq('δημοτικά πάνε υπηρεσίες', budgetBucket('dimotika'), 'services');
eq('δικηγόρος πάει υπηρεσίες', budgetBucket('Συμβολαιογράφος'), 'services');
eq('αέριο πάει θέρμανση', budgetBucket('Φυσικό αέριο'), 'heating');
eq('πετρέλαιο πάει θέρμανση', budgetBucket('πετρελαιο θερμανσης'), 'heating');
eq('συναγερμός δίπλα στην ασφάλεια', budgetBucket('Συναγερμός'), 'insurance');
// Οι συνδρομές έχουν δικό τους κουβά: δεκαπέντε μικρές χρεώσεις που πληθαίνουν
// μόνες τους δεν κρίνονται με τον στόχο του ασφαλίστρου κατοικίας.
eq('συνδρομές σε δικό τους κουβά', budgetBucket('streaming'), 'subscriptions');
eq('κοινόχρηστα', budgetBucket('Κοινόχρηστα'), 'common');
eq('άγνωστο πάει λοιπές', budgetBucket('ξψζ άγνωστο'), 'other');
// Η ανακαίνιση δεν είναι συντήρηση: μία φορά 8.000 ευρώ δεν σημαίνει ότι ο
// χρήστης ξέφυγε 400% από τον μηνιαίο στόχο συντήρησης.
eq('ανακαίνιση δεν είναι συντήρηση', budgetBucket('Ανακαίνιση'), 'other');
eq('έπιπλα δεν είναι συντήρηση', budgetBucket('Έπιπλα'), 'other');
ok('κάθε κατηγορία προσγειώνεται σε έγκυρο κουβά',
  CATEGORIES.every(c => ['electricity', 'water', 'internet', 'heating', 'insurance',
    'subscriptions', 'services', 'common', 'maintenance', 'other'].includes(budgetBucket(c.slug))));
ok('καμία κατηγορία πάγιου δεν χάνεται στις λοιπές',
  ['electricity', 'water', 'gas', 'heating', 'internet', 'common', 'insurance']
    .every(s => budgetBucket(s) !== 'other'));

console.log(fail === 0 ? `✓ taxonomy: ${pass} έλεγχοι πέρασαν` : `✗ taxonomy: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
