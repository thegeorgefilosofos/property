// npx tsx lib/accounting/dossier.test.ts
import {
  requirementsFor, readiness, groupByWho, traps, defaultBookkeeping,
  statusForAccountant, statusesOf, WHO_LABEL,
  type DossierContext, type Requirement, type LegalForm,
} from './dossier';
import type { PropertyStatus } from '../property/status';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) { if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); } }

const ctx = (over: Partial<DossierContext> = {}): DossierContext => ({
  form: 'individual', books: 'none', statuses: ['rent_long'], ...over,
});
const ids = (rs: readonly Requirement[]): string[] => rs.map(r => r.id);

// ═══ Ο 25ΧΡΟΝΟΣ ΠΟΥ ΚΛΗΡΟΝΟΜΗΣΕ ══════════════════════════════════════════
// Δεν έχει πληρώσει ποτέ λογαριασμό. Η ερώτησή του δεν είναι «πόσο αποδίδει»,
// είναι «τι πρέπει να κάνω». Το ακίνητο είναι κενό και μόλις άλλαξε ιδιοκτησία.
{
  const r = requirementsFor(ctx({ statuses: ['vacant'], ownershipChanged: true }));
  ok('ΑΤΑΚ πρώτο πράγμα', ids(r).includes('atak'));
  ok('Ε9 γιατί άλλαξε η ιδιοκτησία', ids(r).includes('e9'));
  ok('Ε2 με ένδειξη κενού', ids(r).includes('e2_vacant'));
  ok('ΕΝΦΙΑ', ids(r).includes('enfia'));
  // ΤΙΠΟΤΑ για μισθώσεις: δεν νοικιάζει.
  ok('κανένα μισθωτήριο', !ids(r).some(x => x.includes('lease')));
  ok('κανένας ΑΜΑ', !ids(r).includes('ama'));
  // Καμία λέξη «ισολογισμός» για φυσικό πρόσωπο.
  ok('κανένας ισολογισμός', !ids(r).includes('balance_sheet'));
  // Η παγίδα του Ε9 λέγεται, γιατί κοστίζει για χρόνια.
  ok('η παγίδα του Ε9 λέγεται', traps(r).some(t => t.trap.includes('επόμενα χρόνια')));
}

// ═══ Ο ΦΟΙΤΗΤΗΣ ΜΕ ΤΟ ΕΞΟΧΙΚΟ ΣΤΟ AIRBNB ═════════════════════════════════
// Δεν ξέρει ότι χρειάζεται ΑΜΑ πριν την πρώτη κράτηση. Θα το μάθει από
// πρόστιμο, ή από εμάς.
{
  const r = requirementsFor(ctx({ statuses: ['rent_short'] }));
  const i = ids(r);
  ok('ΑΜΑ', i.includes('ama'));
  ok('δηλώσεις διαμονής', i.includes('short_stays'));
  ok('καταστάσεις πλατφορμών', i.includes('platform_statements'));
  ok('τέλος κλιματικής κρίσης', i.includes('climate_levy'));
  ok('Ε2 βραχυχρόνιας', i.includes('e2_short'));
  // ΤΙΠΟΤΑ για μακροχρόνια.
  ok('καμία δήλωση μίσθωσης', !i.includes('lease_declaration'));
  ok('κανένα ανείσπρακτο', !i.includes('unpaid_rent'));

  const t = traps(r);
  ok('ο ΑΜΑ πρέπει να φαίνεται στην καταχώρηση', t.some(x => x.trap.includes('Airbnb')));
  // Η συχνότερη ζημιά του αρχάριου: δηλώνει καθαρά αντί για ακαθάριστα.
  ok('ακαθάριστα, όχι καθαρά', t.some(x => x.trap.includes('ΑΚΑΘΑΡΙΣΤΑ')));
  // Το τέλος δεν είναι έσοδό του.
  ok('το τέλος δεν είναι έσοδο', t.some(x => x.trap.includes('Δεν είναι έσοδό σου')));
}

// ═══ Ο 50ΑΡΗΣ ΠΟΥ ΑΓΧΩΝΕΤΑΙ ══════════════════════════════════════════════
// Το άγχος του δεν είναι ο φόρος, είναι ότι θα του λείπει κάτι. Το μισό άγχος
// φεύγει μόλις δει ΠΟΣΑ από αυτά είναι δικά του.
{
  const r = requirementsFor(ctx({ statuses: ['rent_long'], hasLoan: true }));
  const g = groupByWho(r);
  ok('τρεις ομάδες υπευθύνων', g.length >= 2);
  ok('πρώτη η δική του', g[0].who === 'owner');
  eq('με ελληνική ετικέτα', g[0].label, WHO_LABEL.owner);
  ok('κάτι το ετοιμάζουμε εμείς', g.some(x => x.who === 'app' && x.items.length > 0));

  const rd = readiness(r, []);
  ok('λέει πόσα είναι δικά του', rd.message.includes('δικά σου') || rd.message.includes('δικό σου'));
  ok('ξεχωρίζει τα μπλοκαριστικά', rd.blocking.length > 0);
  eq('τίποτα έτοιμο ακόμη', rd.done, 0);
}

// Ο ΙΔΙΟΣ, ΟΤΑΝ ΤΑ ΕΧΕΙ ΟΛΑ. Το μήνυμα αλλάζει σε ανακούφιση.
{
  const r = requirementsFor(ctx({ statuses: ['rent_long'] }));
  const rd = readiness(r, ids(r));
  eq('όλα έτοιμα', rd.blocking.length, 0);
  eq('κανένα εκκρεμές', rd.pending.length, 0);
  ok('το λέει καθαρά', rd.message.includes('πλήρης'));
  eq('done ίσο με total', rd.done, rd.total);
}

// Όταν λείπουν μόνο πράγματα ΑΛΛΩΝ, ο χρήστης πρέπει να το ξέρει: δεν
// χρειάζεται να κάνει τίποτα και δεν πρέπει να αγχώνεται.
{
  const r = requirementsFor(ctx({ statuses: ['rent_long'] }));
  const mine = r.filter(x => x.who === 'owner').map(x => x.id);
  const rd = readiness(r, mine);
  eq('τίποτα δικό του δεν λείπει', rd.yours, 0);
  ok('το μήνυμα τον ηρεμεί', rd.message.includes('Δεν χρειάζεται κάτι από εσένα') || rd.message.includes('κανένα δεν σε αφορά'));
}

// ═══ ΙΔΙΟΧΡΗΣΙΑ ═══════════════════════════════════════════════════════════
{
  const r = requirementsFor(ctx({ statuses: ['own_use'] }));
  const i = ids(r);
  ok('στοιχεία κύριας κατοικίας', i.includes('e1_residence'));
  ok('κανένα Ε2 μισθωμάτων', !i.includes('e2'));
  ok('κανένα εισόδημα', !i.includes('rent_receipts'));
  ok('η παγίδα των τετραγωνικών λέγεται', traps(r).some(t => t.trap.includes('βοηθητικούς')));
}

// ═══ ΑΠΛΟΓΡΑΦΙΚΑ ΚΑΙ ΔΙΠΛΟΓΡΑΦΙΚΑ ════════════════════════════════════════
// Ο ισολογισμός υπάρχει ΜΟΝΟ στα διπλογραφικά. Ιδιώτης με ένα διαμέρισμα δεν
// πρέπει να δει ποτέ τη λέξη· μια ΙΚΕ πρέπει να τη δει με έμφαση.
eq('φυσικό πρόσωπο: χωρίς βιβλία', defaultBookkeeping('individual'), 'none');
eq('ατομική: απλογραφικά', defaultBookkeeping('sole_trader'), 'single_entry');
eq('ΟΕ/ΕΕ: απλογραφικά εξ ορισμού', defaultBookkeeping('partnership'), 'single_entry');
eq('ΑΕ/ΕΠΕ/ΙΚΕ: διπλογραφικά πάντα', defaultBookkeeping('company'), 'double_entry');

{
  const r = requirementsFor(ctx({ form: 'sole_trader', books: 'single_entry' }));
  const i = ids(r);
  ok('Ε3', i.includes('e3'));
  ok('βιβλίο εσόδων-εξόδων', i.includes('books_single'));
  ok('ΦΠΑ', i.includes('vat_returns'));
  ok('ΕΦΚΑ', i.includes('efka'));
  ok('ΚΑΝΕΝΑΣ ισολογισμός στα απλογραφικά', !i.includes('balance_sheet'));
  ok('κανένα προσάρτημα', !i.includes('notes'));
  ok('κανένα ΓΕΜΗ', !i.includes('gemi'));
}
{
  const r = requirementsFor(ctx({ form: 'company', books: 'double_entry' }));
  const i = ids(r);
  ok('ισολογισμός', i.includes('balance_sheet'));
  ok('κατάσταση αποτελεσμάτων', i.includes('income_statement'));
  ok('προσάρτημα', i.includes('notes'));
  ok('έντυπο Ν', i.includes('form_n'));
  ok('ΓΕΜΗ', i.includes('gemi'));
  ok('κανένα βιβλίο εσόδων-εξόδων', !i.includes('books_single'));
}
// ΟΕ/ΕΕ που πέρασε σε διπλογραφικά: η μορφή δεν αλλάζει, τα βιβλία ναι.
{
  const r = requirementsFor(ctx({ form: 'partnership', books: 'double_entry' }));
  ok('ισολογισμός επειδή διπλογραφικά, όχι επειδή ΑΕ', ids(r).includes('balance_sheet'));
}

// ═══ ΑΝΑΚΑΙΝΙΣΗ ═══════════════════════════════════════════════════════════
// Η παγίδα των μετρητών είναι η ακριβότερη: σωστό τιμολόγιο, καμία έκπτωση.
{
  const r = requirementsFor(ctx({ statuses: ['rent_long'], hasRenovation: true }));
  ok('τιμολόγια με ΑΦΜ', ids(r).includes('reno_invoices'));
  ok('η παγίδα των μετρητών λέγεται', traps(r).some(t => t.trap.includes('Μετρητά')));
}
// Το ίδιο ισχύει όταν το ακίνητο ΕΙΝΑΙ σε ανακαίνιση, χωρίς να δηλωθεί flag.
{
  const r = requirementsFor(ctx({ statuses: ['renovation'] }));
  ok('η κατάσταση αρκεί', ids(r).includes('reno_invoices'));
}

// ═══ ΝΟΜΙΚΗ ΕΚΚΡΕΜΟΤΗΤΑ ══════════════════════════════════════════════════
{
  const r = requirementsFor(ctx({ statuses: ['disputed'] }));
  ok('δικαστικά έγγραφα', ids(r).includes('legal_docs'));
  ok('η σειρά των ενεργειών λέγεται', traps(r).some(t => t.trap.includes('ημερομηνία κατάθεσης')));
}

// ═══ ΠΟΛΛΑ ΑΚΙΝΗΤΑ, ΔΙΑΦΟΡΕΤΙΚΕΣ ΚΑΤΑΣΤΑΣΕΙΣ ════════════════════════════
{
  const r = requirementsFor(ctx({ statuses: ['rent_long', 'rent_short', 'own_use'] }));
  const i = ids(r);
  ok('ενώνει και τα τρία', i.includes('lease_declaration') && i.includes('ama') && i.includes('e1_residence'));
  // ΚΑΜΙΑ ΕΠΑΝΑΛΗΨΗ: το ΑΤΑΚ ζητιέται μία φορά, όχι τρεις.
  eq('κανένα διπλό', i.length, new Set(i).size);
}
// Δύο ακίνητα στην ΙΔΙΑ κατάσταση δεν διπλασιάζουν τη λίστα.
{
  const one = requirementsFor(ctx({ statuses: ['rent_long'] }));
  const two = requirementsFor(ctx({ statuses: ['rent_long', 'rent_long'] }));
  eq('ίδια λίστα', ids(one), ids(two));
}

// ═══ Η ΣΕΙΡΑ ══════════════════════════════════════════════════════════════
// Πρώτα ό,τι μπλοκάρει και είναι δικό σου: εκεί πρέπει να πέσει το μάτι.
{
  const r = requirementsFor(ctx({ statuses: ['rent_short'] }));
  ok('πρώτο κάτι μπλοκαριστικό', r[0].blocking);
  ok('πρώτο κάτι δικό του', r[0].who === 'owner');
  const firstNonBlocking = r.findIndex(x => !x.blocking);
  const lastBlocking = r.map(x => x.blocking).lastIndexOf(true);
  ok('όλα τα μπλοκαριστικά πριν τα υπόλοιπα', firstNonBlocking === -1 || lastBlocking < firstNonBlocking);
}

// ═══ ΚΑΘΕ ΓΡΑΜΜΗ ΕΞΗΓΕΙ ΤΟΝ ΕΑΥΤΟ ΤΗΣ ════════════════════════════════════
// Λίστα με τίτλους χωρίς εξήγηση δεν μειώνει το άγχος, το μεταφέρει.
{
  const all = [
    ...requirementsFor(ctx({ statuses: ['rent_long', 'rent_short', 'own_use', 'vacant', 'disputed', 'for_sale'], hasRenovation: true, hasLoan: true, ownershipChanged: true })),
    ...requirementsFor(ctx({ form: 'company', books: 'double_entry' })),
  ];
  ok('κάθε γραμμή έχει «γιατί»', all.every(r => r.why.trim().length > 15));
  ok('κάθε γραμμή έχει υπεύθυνο', all.every(r => ['app', 'owner', 'accountant'].includes(r.who)));
  ok('κάθε τίτλος είναι στα ελληνικά', all.every(r => /[Α-Ωα-ω]/.test(r.title)));
  // Ό,τι χρειάζεται ο χρήστης και δεν το έχει, λέει ΠΟΥ βρίσκεται.
  const ownerItems = all.filter(r => r.who === 'owner');
  ok('τα δικά του λένε πού βρίσκονται', ownerItems.filter(r => r.source).length >= ownerItems.length / 2);
}

// ═══ ΓΛΩΣΣΑ ΓΙΑ ΤΟΝ ΛΟΓΙΣΤΗ ═══════════════════════════════════════════════
eq('εκμίσθωση', statusForAccountant('rent_long'), 'Εκμίσθωση');
eq('ιδιοχρησιμοποίηση', statusForAccountant('own_use'), 'Ιδιοχρησιμοποίηση');
eq('καταστάσεις από γραμμές βάσης', statusesOf([{ status_detail: 'seasonal' }, { status_detail: 'own_use' }]),
  ['rent_short', 'own_use']);

// ═══ ΑΝΤΟΧΗ ═══════════════════════════════════════════════════════════════
{
  const r = requirementsFor(ctx({ statuses: [] }));
  ok('χωρίς ακίνητα, μένουν τα κοινά', r.length > 0);
  const rd = readiness([], []);
  eq('κενή λίστα δεν σκάει', rd.total, 0);
  ok('και λέει κάτι', rd.message.length > 0);
}
{
  // Άγνωστα id στα «έχω» αγνοούνται αντί να χαλάνε τη μέτρηση.
  const r = requirementsFor(ctx());
  const rd = readiness(r, ['atak', 'κάτι-ανύπαρκτο']);
  eq('μετράει μόνο τα υπαρκτά', rd.done, 1);
}

// ═══ ΑΡΙΘΜΗΤΙΚΗ ΣΥΝΕΠΕΙΑ ΤΟΥ ΜΗΝΥΜΑΤΟΣ ═══════════════════════════════════
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Οι προηγούμενοι έλεγχοι επιβεβαίωναν μόνο ότι η φράση ΠΕΡΙΕΧΕΙ
// «δικά σου» — και γι' αυτό δεν έπιασαν ένα αληθινό σφάλμα: το μήνυμα έβγαζε
// «6 πράγματα λείπουν για να κλείσει η δήλωση, και τα 10 είναι δικά σου», επειδή
// το πρώτο νούμερο μέτραγε μόνο τα επείγοντα και το δεύτερο όλα τα δικά του.
//
// Ο χρήστης που βλέπει αριθμητική αντίφαση σε οθόνη φορολογίας σταματά να
// πιστεύει ΚΑΙ τα σωστά νούμερα. Άρα ο έλεγχος δεν κοιτά λέξεις: βγάζει τα
// νούμερα από το κείμενο και απαιτεί το δεύτερο να είναι υποσύνολο του πρώτου,
// σε ΚΑΘΕ συνδυασμό μορφής × καταστάσεων × «τι έχω ήδη».
{
  const forms: LegalForm[] = ['individual', 'sole_trader', 'partnership', 'company'];
  const combos: PropertyStatus[][] = [
    ['rent_long'], ['rent_short'], ['vacant'], ['own_use'], ['renovation'], ['for_sale'], ['disputed'],
    ['rent_long', 'rent_short'], ['vacant', 'disputed', 'renovation'],
  ];
  let checked = 0, bad = 0;
  for (const form of forms) {
    for (const statuses of combos) {
      const reqs = requirementsFor(ctx({ form, books: defaultBookkeeping(form), statuses, hasLoan: true, ownershipChanged: true }));
      // Δοκιμάζουμε κάθε στάδιο συμπλήρωσης: τίποτα, τα μισά, όλα.
      const stages = [[] as string[], reqs.filter((_, i) => i % 2 === 0).map(r => r.id), reqs.map(r => r.id)];
      for (const have of stages) {
        const rd = readiness(reqs, have);
        const nums = (rd.message.match(/\d+/g) || []).map(Number);
        checked++;
        // Όπου το μήνυμα δίνει δύο νούμερα, το δεύτερο είναι υποσύνολο του πρώτου.
        if (nums.length >= 2 && nums[1] > nums[0]) { bad++; continue; }
        // Και κανένα νούμερο δεν ξεπερνά το σύνολο των απαιτήσεων.
        if (nums.some(n => n > reqs.length)) bad++;
      }
    }
  }
  ok(`μήνυμα ετοιμότητας αριθμητικά συνεπές σε ${checked} συνδυασμούς`, bad === 0);
}
{
  // Το ακριβές σενάριο που έσπαγε: πολλά δικά του εκκρεμή, λίγα επείγοντα.
  const reqs: Parameters<typeof readiness>[0] = [
    { id: 'b1', title: 'α', why: 'α', who: 'accountant', blocking: true },
    { id: 'o1', title: 'β', why: 'β', who: 'owner', blocking: false },
    { id: 'o2', title: 'γ', why: 'γ', who: 'owner', blocking: false },
    { id: 'o3', title: 'δ', why: 'δ', who: 'owner', blocking: false },
  ];
  const rd = readiness(reqs, []);
  const nums = (rd.message.match(/\d+/g) || []).map(Number);
  ok('ένα επείγον, τρία δικά του: δεν λέει ότι τα επείγοντα είναι δικά του', !rd.message.includes('τα 3 είναι δικά σου'));
  ok('δεν ισχυρίζεται ότι δεν χρειάζεται τίποτα', !rd.message.includes('Δεν χρειάζεται κάτι από εσένα'));
  ok('αναφέρει τα εκκρεμή χωρίς προθεσμία', rd.message.includes('εκκρεμή') || rd.message.includes('εκκρεμές'));
  ok('κανένα νούμερο δεν ξεπερνά το σύνολο', nums.every(n => n <= reqs.length));
  eq('το yours παραμένει το σύνολο των δικών του, για την οθόνη', rd.yours, 3);
}

// ═══ ΤΟ ΠΡΟΣΥΜΠΛΗΡΩΜΕΝΟ Ε2 ════════════════════════════════════════════════
//
// Η θέση του προϊόντος: δεν είμαστε ο δεύτερος τρόπος να συμπληρώσεις τη δήλωση,
// είμαστε η ανεξάρτητη απόδειξη που ελέγχει την πρώτη. Αυτό δεν στέκει αν ο
// φάκελος δεν ζητά ΠΟΤΕ από τον ιδιοκτήτη το προσυμπληρωμένο του.
{
  for (const st of ['rent_long', 'rent_short'] as PropertyStatus[]) {
    const r = requirementsFor(ctx({ statuses: [st] }));
    const pre = r.find(x => x.id === 'e2_prefilled');
    ok(`${st}: ζητείται το προσυμπληρωμένο`, !!pre);
    eq(`${st}: το φέρνει ο ιδιοκτήτης`, pre?.who, 'owner');
    ok(`${st}: μπλοκάρει τη δήλωση`, pre?.blocking === true);
    ok(`${st}: λέει πού θα το βρει`, (pre?.source || '').includes('myAADE'));
    ok(`${st}: προειδοποιεί ότι το λάθος γίνεται δικό του`, (pre?.trap || '').length > 40);
  }
  // Σε ακίνητο που δεν αποδίδει δεν υπάρχει μίσθωμα να ελεγχθεί.
  for (const st of ['own_use', 'vacant'] as PropertyStatus[]) {
    const r = requirementsFor(ctx({ statuses: [st] }));
    ok(`${st}: δεν ζητείται προσυμπληρωμένο`, !r.some(x => x.id === 'e2_prefilled'));
  }
  // Με δύο καταστάσεις μίσθωσης μαζί, μία φορά — όχι δύο.
  const both = requirementsFor(ctx({ statuses: ['rent_long', 'rent_short'] }));
  eq('χωρίς διπλή εγγραφή', both.filter(x => x.id === 'e2_prefilled').length, 1);
  // Και η παγίδα της βραχυχρόνιας λέει το σωστό πράγμα.
  const short = requirementsFor(ctx({ statuses: ['rent_short'] })).find(x => x.id === 'e2_prefilled');
  ok('βραχυχρόνια: εξηγεί τα ακαθάριστα της πλατφόρμας', /ΑΚΑΘΑΡΙΣΤΑ/.test(short?.trap || ''));
}

console.log(fail === 0 ? `✓ dossier: ${pass} έλεγχοι πέρασαν` : `✗ dossier: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
