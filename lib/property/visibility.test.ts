// npx tsx lib/property/visibility.test.ts
import {
  tabDecision, visibleTabs, comparableGroups, canCompare,
  accountingSections, accountingScope, normType,
  type OwnerContext, type PropertyLike,
} from './visibility';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } }

const flat = (over: Partial<PropertyLike> = {}): PropertyLike => ({
  id: 'p1', prop_type: 'Διαμέρισμα', sqm: 78, year_built: 2004, postal_code: '11524',
  status_detail: 'rented', rental_mode: 'long_term', ...over,
});
const ctxOf = (props: PropertyLike[], legalForm: 'individual' | 'company' = 'individual'): OwnerContext =>
  ({ legalForm, properties: props });

const ALL = ['overview', 'finances', 'documents', 'calendar', 'checklist', 'contacts', 'settings',
  'referral', 'tenant', 'clients', 'pricing', 'roi', 'inventory', 'plan', 'loan',
  'accounting', 'portfolio', 'comparison'];

// ═══ ΜΑΚΡΟΧΡΟΝΙΑ ΜΙΣΘΩΣΗ ══════════════════════════════════════════════════
{
  const p = flat();
  const v = visibleTabs(ALL, ctxOf([p]), p);
  ok('βλέπει Ενοικιαστή', v.includes('tenant'));
  ok('ΔΕΝ βλέπει Πελάτες', !v.includes('clients'));
  ok('ΔΕΝ βλέπει Τιμολόγηση', !v.includes('pricing'));
  ok('βλέπει Αποδόσεις', v.includes('roi'));
  ok('βλέπει Εξοπλισμό', v.includes('inventory'));
  ok('ΔΕΝ βλέπει Σχέδιο', !v.includes('plan'));
}

// ═══ ΒΡΑΧΥΧΡΟΝΙΑ ══════════════════════════════════════════════════════════
{
  const p = flat({ status_detail: 'seasonal', rental_mode: 'short_term' });
  const v = visibleTabs(ALL, ctxOf([p]), p);
  ok('βλέπει Πελάτες', v.includes('clients'));
  ok('βλέπει Τιμολόγηση', v.includes('pricing'));
  ok('ΔΕΝ βλέπει Ενοικιαστή', !v.includes('tenant'));
}

// ═══ ΙΔΙΟΧΡΗΣΙΑ: Η ΠΙΟ ΣΗΜΑΝΤΙΚΗ ΠΕΡΙΠΤΩΣΗ ═══════════════════════════════
// Ο ιδιοκτήτης που μένει στο σπίτι του δεν πρόκειται ΠΟΤΕ να χρειαστεί
// τιμολόγηση ανά διανυκτέρευση. Το «0% απόδοση» εκεί δεν είναι πληροφορία,
// είναι κατηγορία.
{
  const p = flat({ status_detail: 'own_use', rental_mode: null });
  const v = visibleTabs(ALL, ctxOf([p]), p);
  ok('καμία μίσθωση', !v.includes('tenant') && !v.includes('clients') && !v.includes('pricing'));
  ok('ΚΑΜΙΑ απόδοση', !v.includes('roi'));
  ok('κανένας εξοπλισμός', !v.includes('inventory'));
  ok('κανένα σχέδιο', !v.includes('plan'));
  // Ό,τι αφορά ΚΑΘΕ ακίνητο μένει: το σπίτι σου έχει ρεύμα, ΕΝΦΙΑ και χαρτιά.
  ok('μένουν οι δαπάνες', v.includes('finances'));
  ok('μένει το αρχείο', v.includes('documents'));
  ok('μένει η λογιστική', v.includes('accounting'));
  ok('μένει το δάνειο', v.includes('loan'));
  // Ο λόγος γράφεται με λόγια, όχι με «δεν έχεις δικαίωμα».
  const d = tabDecision('pricing', ctxOf([p]), p);
  ok('εξηγεί γιατί', d.reason.includes('ιδιοχρησία'));
}

// ═══ ΟΙ ΤΕΣΣΕΡΙΣ ΚΑΤΑΣΤΑΣΕΙΣ ΠΟΥ ΘΕΛΟΥΝ ΣΧΕΔΙΟ ═══════════════════════════
// Μία καρτέλα, όχι τέσσερις: το περιεχόμενο αλλάζει, η θέση στο μενού μένει.
for (const [status, mode] of [['vacant', null], ['disputed', null], ['for_sale', null], ['renovation', null]] as const) {
  const p = flat({ status_detail: status, rental_mode: mode });
  const v = visibleTabs(ALL, ctxOf([p]), p);
  ok(`${status}: εμφανίζεται το Σχέδιο`, v.includes('plan'));
  ok(`${status}: καμία μίσθωση`, !v.includes('tenant') && !v.includes('clients'));
}
// ΑΠΟΔΟΣΕΙΣ ΜΟΝΟ ΟΠΟΥ ΥΠΑΡΧΕΙ ΕΣΟΔΟ.
//
// Χωρίς μίσθωμα, η «απόδοση» δεν είναι μέτρηση αλλά υπόθεση — και μια υπόθεση με
// ποσοστό δίπλα της διαβάζεται ως γεγονός. Η ερώτηση «τι να το κάνω;» για τα
// ακίνητα που δεν αποδίδουν απαντιέται στην καρτέλα Σχέδιο, με πραγματικούς
// άξονες αντί για ένα ποσοστό χωρίς έσοδο από πίσω.
{
  for (const st of ['vacant', 'for_sale', 'own_use', 'disputed', 'renovation'] as const) {
    const p = flat({ status_detail: st, rental_mode: null });
    ok(`${st}: ΚΑΜΙΑ απόδοση`, !visibleTabs(ALL, ctxOf([p]), p).includes('roi'));
  }
  // Και οι δύο καταστάσεις που όντως αποδίδουν, τη βλέπουν.
  const long = flat({ status_detail: 'rented', rental_mode: 'long_term' });
  ok('μακροχρόνια: βλέπει αποδόσεις', visibleTabs(ALL, ctxOf([long]), long).includes('roi'));
  const short = flat({ status_detail: 'seasonal', rental_mode: 'short_term' });
  ok('βραχυχρόνια/εποχική: βλέπει αποδόσεις', visibleTabs(ALL, ctxOf([short]), short).includes('roi'));
}
// Σε ανακαίνιση δεν υπάρχει απόδοση να μετρηθεί όσο γίνονται εργασίες.
{
  const p = flat({ status_detail: 'renovation', rental_mode: null });
  ok('ανακαίνιση: καμία απόδοση', !visibleTabs(ALL, ctxOf([p]), p).includes('roi'));
}

// ═══ ΑΡΙΘΜΟΣ ΑΚΙΝΗΤΩΝ ═════════════════════════════════════════════════════
{
  const one = [flat()];
  const v = visibleTabs(ALL, ctxOf(one), one[0]);
  ok('ένα ακίνητο: καμία σύγκριση', !v.includes('comparison'));
  ok('ένα ακίνητο: κανένα χαρτοφυλάκιο', !v.includes('portfolio'));
  eq('το λέει καθαρά', tabDecision('comparison', ctxOf(one), one[0]).reason,
    'Χρειάζονται τουλάχιστον δύο ακίνητα.');
}
{
  // ΔΥΟ ΑΝΟΜΟΙΑ: διαμέρισμα και κατάστημα δεν συγκρίνονται. Η σύγκριση θα
  // έβγαζε συμπέρασμα για δύο εντελώς διαφορετικές αγορές.
  const two = [flat({ id: 'a' }), flat({ id: 'b', prop_type: 'Κατάστημα' })];
  const v = visibleTabs(ALL, ctxOf(two), two[0]);
  ok('δύο ανόμοια: καμία σύγκριση', !v.includes('comparison'));
  ok('εξηγεί', tabDecision('comparison', ctxOf(two), two[0]).reason.includes('ίδιου τύπου'));
}
{
  const two = [flat({ id: 'a' }), flat({ id: 'b' })];
  ok('δύο όμοια: σύγκριση ναι', visibleTabs(ALL, ctxOf(two), two[0]).includes('comparison'));
}
{
  const three = [flat({ id: 'a' }), flat({ id: 'b' }), flat({ id: 'c' })];
  ok('τρία ακίνητα: χαρτοφυλάκιο ναι', visibleTabs(ALL, ctxOf(three), three[0]).includes('portfolio'));
}

// ═══ ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΣΥΓΚΡΙΣΗΣ ══════════════════════════════════════════════
// Δύο διαμερίσματα είναι συγκρίσιμα ως κατηγορία. Αν όμως το ένα είναι 45 τ.μ.
// του 1975 και το άλλο 130 τ.μ. του 2018, η σύγκριση βγάζει κάτι αληθές και
// εντελώς άχρηστο. Ο χρήστης έχει δικαίωμα να τη δει και να ξέρει τι κοιτάζει.
{
  const g = comparableGroups([flat({ id: 'a', sqm: 75 }), flat({ id: 'b', sqm: 82 })]);
  eq('μία ομάδα', g.length, 1);
  eq('όμοια: καμία προειδοποίηση', g[0].warning, null);
}
{
  const g = comparableGroups([flat({ id: 'a', sqm: 45 }), flat({ id: 'b', sqm: 130 })]);
  ok('μεγάλη διαφορά μεγέθους προειδοποιεί', g[0].warning !== null);
  ok('λέει τα νούμερα', g[0].warning!.includes('45') && g[0].warning!.includes('130'));
}
{
  const g = comparableGroups([flat({ id: 'a', year_built: 1975 }), flat({ id: 'b', year_built: 2018 })]);
  ok('μεγάλη διαφορά ηλικίας προειδοποιεί', g[0].warning!.includes('1975'));
}
{
  const g = comparableGroups([flat({ id: 'a', postal_code: '11524' }), flat({ id: 'b', postal_code: '54622' })]);
  ok('άλλη περιοχή προειδοποιεί', g[0].warning!.includes('περιοχ'));
}
// Ίδια περιοχή δεν προειδοποιεί: 11524 και 11526 είναι η ίδια αγορά.
{
  const g = comparableGroups([flat({ id: 'a', postal_code: '11524' }), flat({ id: 'b', postal_code: '11526' })]);
  eq('ίδια περιοχή, καθαρή σύγκριση', g[0].warning, null);
}
// Ακίνητα ΧΩΡΙΣ δηλωμένο τύπο δεν μπαίνουν σε ομάδα: το άγνωστο δεν είναι
// κατηγορία, και θα έβαζε μαζί ένα κατάστημα με μια αποθήκη.
{
  eq('χωρίς τύπο, καμία ομάδα', comparableGroups([flat({ id: 'a', prop_type: null }), flat({ id: 'b', prop_type: '' })]), []);
  ok('άρα ούτε σύγκριση', !canCompare([flat({ id: 'a', prop_type: null }), flat({ id: 'b', prop_type: null })]));
}
eq('τύπος με τόνους και κεφαλαία', normType('ΔΙΑΜΕΡΙΣΜΑ'), normType('Διαμέρισμα'));

// ═══ ΛΟΓΙΣΤΙΚΗ: ΔΥΟ ΑΝΕΞΑΡΤΗΤΟΙ ΑΞΟΝΕΣ ═══════════════════════════════════
// Ένας ιδιώτης με ένα διαμέρισμα προς ενοικίαση χρειάζεται το Ε2 και δεν έχει
// καμία σχέση με ΕΦΚΑ και προκαταβολή φόρου. Μέχρι σήμερα έβλεπε και τα δύο.
{
  const s = accountingSections(ctxOf([flat()], 'individual'));
  ok('ιδιώτης που εκμισθώνει: εισόδημα από ακίνητα', s.includes('rental_income'));
  ok('ιδιώτης: ΚΑΜΙΑ φορολογία επιχείρησης', !s.includes('business'));
  ok('ιδιώτης: καμία απόσβεση κτιρίου', !s.includes('depreciation'));
  ok('ΕΝΦΙΑ πάντα', s.includes('enfia'));
}
{
  const s = accountingSections(ctxOf([flat({ status_detail: 'own_use', rental_mode: null })], 'individual'));
  ok('ιδιοχρησία: κανένα εισόδημα από ακίνητα', !s.includes('rental_income'));
  ok('αλλά ΕΝΦΙΑ και δαπάνες μένουν', s.includes('enfia') && s.includes('expenses'));
}
{
  const s = accountingSections(ctxOf([flat()], 'company'));
  ok('εταιρεία: φορολογία επιχείρησης', s.includes('business'));
  ok('εταιρεία: αποσβέσεις', s.includes('depreciation'));
}
{
  const s = accountingSections(ctxOf([flat({ status_detail: 'seasonal', rental_mode: 'short_term' })]));
  ok('βραχυχρόνια: τα ειδικά της', s.includes('short_term_tax'));
}
{
  const s = accountingSections(ctxOf([flat({ status_detail: 'rented', rental_mode: 'long_term' })]));
  ok('μακροχρόνια: όχι τα ειδικά της βραχυχρόνιας', !s.includes('short_term_tax'));
}
eq('τίτλος για ιδιώτη με ενοίκιο', accountingScope(ctxOf([flat()])), 'Φορολογία εισοδήματος από ακίνητα');
eq('τίτλος για εταιρεία', accountingScope(ctxOf([flat()], 'company')), 'Φορολογία επιχείρησης και ακινήτων');
eq('τίτλος για ιδιοχρησία', accountingScope(ctxOf([flat({ status_detail: 'own_use', rental_mode: null })])),
  'Φόροι και τέλη ακινήτου');

// ═══ ΧΩΡΙΣ ΕΠΙΛΕΓΜΕΝΟ ΑΚΙΝΗΤΟ ═════════════════════════════════════════════
// Οι εξαρτώμενες καρτέλες ΔΕΝ φαίνονται: δεν υπάρχει κατάσταση να τις
// δικαιολογήσει, και το να τις δείχναμε προσωρινά θα τις έκανε να
// εξαφανίζονται μόλις ο χρήστης διαλέξει ακίνητο.
{
  const v = visibleTabs(ALL, ctxOf([flat()]), null);
  ok('καμία εξαρτώμενη καρτέλα', !v.includes('tenant') && !v.includes('roi') && !v.includes('plan'));
  ok('οι σταθερές μένουν', v.includes('finances') && v.includes('settings'));
}

// ═══ ΤΟ ΚΕΝΟ ΧΑΡΤΟΦΥΛΑΚΙΟ ═════════════════════════════════════════════════
{
  const v = visibleTabs(ALL, ctxOf([]), null);
  ok('χωρίς ακίνητα δεν σκάει τίποτα', v.length > 0);
  ok('καμία σύγκριση', !v.includes('comparison'));
}

console.log(fail === 0 ? `✓ visibility: ${pass} έλεγχοι πέρασαν` : `✗ visibility: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
