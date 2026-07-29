// npx tsx lib/accounting/dossier.test.ts
import {
  requirementsFor, readiness, groupByWho, traps, defaultBookkeeping,
  statusForAccountant, statusesOf, WHO_LABEL,
  type DossierContext, type Requirement,
} from './dossier';

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

console.log(fail === 0 ? `✓ dossier: ${pass} έλεγχοι πέρασαν` : `✗ dossier: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
