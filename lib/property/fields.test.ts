// npx tsx lib/property/fields.test.ts
//
// Οι έλεγχοι είναι γραμμένοι γύρω από τους τρεις πραγματικούς χρήστες, γιατί το
// ερώτημα δεν είναι «δουλεύει η συνάρτηση» αλλά «βλέπει ο 25χρονος 78 πεδία;».
import {
  TENANT_FIELDS, CLIENT_FIELDS, INVENTORY_FIELDS, CONTACT_FIELDS, ACCOUNTING_FIELDS, ALL_FIELDS,
  fieldPlacement, fieldDecision, formFields, missingCritical, hiddenFieldCount,
  type FieldContext,
} from './fields';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++; else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error(`✗ ${name}`); } }

const ctx = (o: Partial<FieldContext> = {}): FieldContext => ({
  status: 'rent_long', business: false, doubleEntry: false, propertyCount: 1, ...o,
});

// ═══ ΤΟ ΜΗΤΡΩΟ ΕΙΝΑΙ ΥΓΙΕΣ ════════════════════════════════════════════════
{
  const ids = ALL_FIELDS.map(f => f.id);
  eq('κανένα διπλό id', ids.length, new Set(ids).size);
  ok('κάθε πεδίο έχει γραμμένο το γιατί', ALL_FIELDS.every(f => f.why.trim().length > 12));
  // ΤΟ `selfEvident` ΔΕΝ ΕΙΝΑΙ ΠΑΡΑΘΥΡΟ ΓΙΑ ΑΔΙΚΑΙΟΛΟΓΗΤΑ ΠΕΔΙΑ. Κρύβει τη
  // γραμμή από τη φόρμα, όχι την υποχρέωση να εξηγηθεί το πεδίο: αλλιώς θα
  // γινόταν ο εύκολος δρόμος για να μπει πεδίο χωρίς λόγο.
  ok('και τα αυτονόητα έχουν γραμμένο λόγο',
     ALL_FIELDS.filter(f => f.selfEvident).every(f => f.why.trim().length > 12));
  // Ένα κρίσιμο πεδίο λέει συμμόρφωση — προθεσμία, δήλωση, φόρο. Αυτό δεν είναι
  // ποτέ αυτονόητο από την ετικέτα, και η απόκρυψή του θα έκρυβε τη συνέπεια.
  ok('κανένα κρίσιμο πεδίο δεν είναι αυτονόητο',
     ALL_FIELDS.every(f => !(f.critical && f.selfEvident)));
  ok('κάθε πεδίο έχει ετικέτα', ALL_FIELDS.every(f => f.label.trim().length > 0));
  ok('το id δηλώνει τη φόρμα του', ALL_FIELDS.every(f => /^(tenant|client|inv|contact|acc)\./.test(f.id)));
  // Κανένα «γιατί» δεν επιτρέπεται να είναι ταυτολογία του label.
  ok('το γιατί δεν επαναλαμβάνει την ετικέτα', ALL_FIELDS.every(f => f.why.toLowerCase() !== f.label.toLowerCase()));
}

// ═══ Ο 25ΧΡΟΝΟΣ ΠΟΥ ΚΛΗΡΟΝΟΜΗΣΕ — ένα διαμέρισμα, κενό, φυσικό πρόσωπο ════
{
  const c = ctx({ status: 'vacant', propertyCount: 1 });
  const t = formFields(TENANT_FIELDS, c);
  eq('κενό ακίνητο: κανένα πεδίο ενοικιαστή', t.core.length + t.more.length, 0);
  const cl = formFields(CLIENT_FIELDS, c);
  eq('κενό ακίνητο: κανένα πεδίο επισκέπτη', cl.core.length + cl.more.length, 0);
  const inv = formFields(INVENTORY_FIELDS, c);
  eq('κενό ακίνητο: καμία απογραφή εξοπλισμού', inv.core.length + inv.more.length, 0);
  const acc = formFields(ACCOUNTING_FIELDS, c);
  ok('κενό ακίνητο: ούτε ΕΦΚΑ ούτε ισολογισμός', !acc.core.concat(acc.more).some(d => /efka|balance_sheet|journal/.test(d.id)));
  // Οι επαφές είναι ανεξάρτητες της κατάστασης: κάθε ακίνητο θέλει υδραυλικό.
  ok('οι επαφές παραμένουν', formFields(CONTACT_FIELDS, c).core.length > 0);
}

// ═══ Ο ΦΟΙΤΗΤΗΣ ΜΕ ΤΟ ΕΞΟΧΙΚΟ ΣΤΟ AIRBNB ═════════════════════════════════
{
  const c = ctx({ status: 'rent_short', furnished: true, propertyCount: 1 });
  const cl = formFields(CLIENT_FIELDS, c);
  const ids = cl.core.map(d => d.id);
  ok('βλέπει τα ακαθάριστα', ids.includes('client.gross_guest_paid'));
  ok('βλέπει την προμήθεια χωριστά', ids.includes('client.platform_fee'));
  ok('βλέπει το τέλος ανθεκτικότητας', ids.includes('client.climate_levy'));
  ok('βλέπει αν δηλώθηκε η διαμονή', ids.includes('client.declared_at'));
  // ΤΟ ΚΡΙΣΙΜΟ: κανένα από αυτά τα τέσσερα δεν επιτρέπεται να είναι σε «Περισσότερα».
  const hiddenAway = cl.more.map(d => d.id);
  ok('τα κρίσιμα δεν κρύβονται σε «Περισσότερα»',
    !['client.gross_guest_paid', 'client.platform_fee', 'client.climate_levy', 'client.declared_at'].some(i => hiddenAway.includes(i)));

  const t = formFields(TENANT_FIELDS, c);
  eq('βραχυχρόνια: κανένα πεδίο μακροχρόνιας μίσθωσης', t.core.length + t.more.length, 0);
}

// ═══ Ο ΠΕΝΗΝΤΑΡΗΣ — μακροχρόνια, γυμνό διαμέρισμα, με δάνειο ══════════════
{
  const c = ctx({ status: 'rent_long', furnished: false, hasLoan: true, propertyCount: 1 });
  const t = formFields(TENANT_FIELDS, c);
  const ids = t.core.concat(t.more).map(d => d.id);
  ok('βλέπει ΑΦΜ μισθωτή', ids.includes('tenant.afm'));
  ok('βλέπει IBAN είσπραξης', ids.includes('tenant.rent_iban'));
  ok('ΔΕΝ βλέπει υπηρεσίες σε γυμνό διαμέρισμα', !ids.includes('tenant.services'));
  const acc = formFields(ACCOUNTING_FIELDS, c);
  const accIds = acc.core.concat(acc.more).map(d => d.id);
  ok('βλέπει τους τόκους του δανείου', accIds.includes('acc.loan_interest'));
  ok('βλέπει τον όρο τραπεζικής είσπραξης', accIds.includes('acc.rents_via_bank'));
  ok('ΔΕΝ βλέπει ΕΦΚΑ', !accIds.includes('acc.efka'));
  ok('ΔΕΝ βλέπει ισολογισμό', !accIds.includes('acc.balance_sheet'));
  // Επιπλωμένο → οι υπηρεσίες εμφανίζονται, αλλά σε «Περισσότερα».
  const f = formFields(TENANT_FIELDS, { ...c, furnished: true });
  ok('επιπλωμένο: οι υπηρεσίες εμφανίζονται σε «Περισσότερα»', f.more.some(d => d.id === 'tenant.services'));
}

// ═══ ΝΟΜΙΚΗ ΜΟΡΦΗ ΚΑΙ ΒΙΒΛΙΑ ══════════════════════════════════════════════
{
  const indiv = ctx();
  const soleTrader = ctx({ business: true, doubleEntry: false });
  const company = ctx({ business: true, doubleEntry: true });

  eq('φυσικό πρόσωπο: κανένας ΕΦΚΑ', fieldPlacement('acc.efka', indiv), 'hidden');
  eq('ατομική: ΕΦΚΑ ναι', fieldPlacement('acc.efka', soleTrader), 'core');
  // Η ΚΑΡΔΙΑ ΤΟΥ ΘΕΜΑΤΟΣ: ο ισολογισμός κρέμεται από τα ΒΙΒΛΙΑ, όχι από τη μορφή.
  eq('ατομική με απλογραφικά: ΚΑΝΕΝΑΣ ισολογισμός', fieldPlacement('acc.balance_sheet', soleTrader), 'hidden');
  eq('διπλογραφικά: ισολογισμός ναι', fieldPlacement('acc.balance_sheet', company), 'core');
  eq('φυσικό πρόσωπο: ποτέ ισολογισμός', fieldPlacement('acc.balance_sheet', indiv), 'hidden');
  eq('φυσικό πρόσωπο: ποτέ προκαταβολή φόρου', fieldPlacement('acc.advance_tax', indiv), 'hidden');
}

// ═══ ΠΛΗΘΟΣ ΑΚΙΝΗΤΩΝ ══════════════════════════════════════════════════════
{
  eq('ένα ακίνητο: καμία ενοποίηση', fieldPlacement('acc.portfolio_consolidation', ctx({ propertyCount: 1 })), 'hidden');
  eq('δύο ακίνητα: ενοποίηση ναι', fieldPlacement('acc.portfolio_consolidation', ctx({ propertyCount: 2 })), 'core');
}

// ═══ ΑΠΟΓΡΑΦΗ: ΥΠΑΡΧΕΙ ΜΟΝΟ ΣΕ ΕΠΙΠΛΩΜΕΝΟ ΠΟΥ ΝΟΙΚΙΑΖΕΤΑΙ ════════════════
{
  const bare = ctx({ status: 'rent_long', furnished: false });
  eq('γυμνό διαμέρισμα: καμία απογραφή', formFields(INVENTORY_FIELDS, bare).core.length, 0);
  const own = ctx({ status: 'own_use', furnished: true });
  eq('ιδιοχρησία: καμία απογραφή, όσο επιπλωμένο κι αν είναι', hiddenFieldCount(INVENTORY_FIELDS, own), INVENTORY_FIELDS.length);

  const airbnb = ctx({ status: 'rent_short', furnished: true });
  const inv = formFields(INVENTORY_FIELDS, airbnb);
  const core = inv.core.map(d => d.id);
  ok('βλέπει τη φωτογραφία ως κύριο μονοπάτι', core.includes('inv.photo'));
  ok('βλέπει την κατάσταση, που κρίνει την εγγύηση', core.includes('inv.condition'));
  ok('βλέπει την απόδειξη', core.includes('inv.receipt'));
  // Ό,τι είναι σπάνιο πάει σε «Περισσότερα», δεν γεμίζει τη φόρμα.
  const more = inv.more.map(d => d.id);
  ok('σειριακός, ισχύς και κόστος αντικατάστασης σε «Περισσότερα»',
    ['inv.serial', 'inv.power_use', 'inv.replacement_cost'].every(i => more.includes(i)));
  ok('η φόρμα δείχνει λίγα, όχι όλα', inv.core.length <= 8);
  // Κανένα από τα διαγραμμένα δεν επιτρέπεται να επιστρέψει σιωπηλά στο μητρώο.
  const dead = ['inv.provenance', 'inv.original_price', 'inv.discount_pct', 'inv.store_vendor',
    'inv.receipt_number', 'inv.smart_device', 'inv.standby_watts', 'inv.tags'];
  eq('τα επινοημένα πεδία δεν υπάρχουν στο μητρώο',
    ALL_FIELDS.filter(f => dead.includes(f.id)).length, 0);
}

// ═══ ΕΠΑΦΕΣ: ΤΕΣΣΕΡΑ ΠΕΔΙΑ ΑΡΚΟΥΝ, ΤΑ ΥΠΟΛΟΙΠΑ ΕΙΝΑΙ «ΠΕΡΙΣΣΟΤΕΡΑ» ═══════
{
  const one = ctx({ propertyCount: 1 });
  const f = formFields(CONTACT_FIELDS, one);
  eq('με ένα ακίνητο: όνομα, ειδικότητα, τηλέφωνο, ΑΦΜ', f.core.map(d => d.id).join(','),
    'contact.name,contact.role,contact.phone,contact.afm');
  eq('η εμβέλεια δεν έχει νόημα με ένα ακίνητο', fieldPlacement('contact.scope', one), 'hidden');
  eq('με δύο ακίνητα εμφανίζεται', fieldPlacement('contact.scope', ctx({ propertyCount: 2 })), 'more');
  const dead = ['contact.license_number', 'contact.iban2', 'contact.schedule',
    'contact.last_contact', 'contact.rating', 'contact.status', 'contact.reminder_days'];
  eq('τα πεδία χωρίς ενέργεια δεν υπάρχουν στο μητρώο',
    ALL_FIELDS.filter(x => dead.includes(x.id)).length, 0);
}

// ═══ ΤΑ ΚΡΙΣΙΜΑ ΔΕΝ ΚΡΥΒΟΝΤΑΙ ΠΟΤΕ ════════════════════════════════════════
{
  // Ακόμη κι αν κάποιος βάλει rare σε κρίσιμο πεδίο, το placement μένει core.
  const criticals = ALL_FIELDS.filter(f => f.critical);
  ok('υπάρχουν κρίσιμα πεδία', criticals.length >= 8);
  const cases: FieldContext[] = [
    ctx({ status: 'rent_long' }), ctx({ status: 'rent_short' }),
    ctx({ status: 'rent_long', business: true, doubleEntry: true, propertyCount: 5 }),
  ];
  let bad = 0;
  for (const c of cases) {
    for (const f of criticals) {
      const p = fieldPlacement(f.id, c);
      if (p === 'more') bad++;   // 'hidden' επιτρέπεται (δεν αφορά), 'more' ΟΧΙ
    }
  }
  eq('κανένα κρίσιμο πεδίο σε «Περισσότερα»', bad, 0);
}

// ═══ ΑΝΤΟΧΗ ═══════════════════════════════════════════════════════════════
{
  // Άγνωστο id → φαίνεται. Το αντίστροφο θα έκρυβε σιωπηλά κάτι απαραίτητο.
  eq('άγνωστο πεδίο φαίνεται αντί να χαθεί', fieldPlacement('κάτι.ανύπαρκτο', ctx()), 'core');
  const d = fieldDecision('κάτι.ανύπαρκτο', ctx());
  eq('και δεν σκάει', d.id, 'κάτι.ανύπαρκτο');
  eq('χωρίς ψεύτικο γιατί', d.why, '');
}

// ═══ Η ΜΗΧΑΝΗ ΟΝΤΩΣ ΚΡΥΒΕΙ — όχι διακοσμητικοί κανόνες ════════════════════
{
  // Ο 25χρονος με κενό ακίνητο πρέπει να γλιτώνει τη ΣΥΝΤΡΙΠΤΙΚΗ πλειονότητα.
  const c = ctx({ status: 'vacant', propertyCount: 1 });
  const hidden = hiddenFieldCount(ALL_FIELDS, c);
  ok(`κενό ακίνητο: κρύβονται ${hidden} από ${ALL_FIELDS.length} πεδία`, hidden / ALL_FIELDS.length > 0.6);

  // Ο επαγγελματίας με διπλογραφικά και πέντε ακίνητα βλέπει τα περισσότερα.
  const pro = ctx({ status: 'rent_long', business: true, doubleEntry: true, propertyCount: 5, furnished: true, hasLoan: true });
  ok('επαγγελματίας: κρύβονται λιγότερα', hiddenFieldCount(ALL_FIELDS, pro) < hidden);
}

// ═══ ΤΙ ΛΕΙΠΕΙ ΑΠΟ ΤΗ ΣΥΜΜΟΡΦΩΣΗ ══════════════════════════════════════════
{
  const c = ctx({ status: 'rent_short', furnished: true });
  const nothing = missingCritical(CLIENT_FIELDS, c, new Set());
  ok('χωρίς τίποτα συμπληρωμένο, λείπουν τα κρίσιμα', nothing.length >= 4);
  ok('και λένε γιατί', nothing.every(d => d.why.length > 12));
  const all = new Set(CLIENT_FIELDS.map(f => f.id));
  eq('όλα συμπληρωμένα, δεν λείπει τίποτα', missingCritical(CLIENT_FIELDS, c, all).length, 0);
  // Σε μακροχρόνια, τα κρίσιμα της βραχυχρόνιας δεν «λείπουν» — δεν αφορούν.
  eq('τα κρίσιμα άλλης κατάστασης δεν μετρούν ως ελλείψεις',
    missingCritical(CLIENT_FIELDS, ctx({ status: 'rent_long' }), new Set()).length, 0);
}

// ═══ ΦΟΡΜΑ ΕΝΟΙΚΙΑΣΤΗ: 78 ΠΕΔΙΑ ΕΓΙΝΑΝ ΜΕΤΡΗΜΕΝΑ ΛΙΓΑ ════════════════════
// Η καρτέλα Ενοικιαστής υπάρχει ΜΟΝΟ σε rent_long (visibility.ts), οπότε οι δύο
// περιπτώσεις που ελέγχονται είναι οι μόνες πραγματικές: γυμνό και επιπλωμένο.
{
  const bare = ctx({ status: 'rent_long', furnished: false });
  const furn = ctx({ status: 'rent_long', furnished: true });
  const b = formFields(TENANT_FIELDS, bare);
  const f = formFields(TENANT_FIELDS, furn);

  // Η ΠΡΩΤΗ ΟΘΟΝΗ: τι βλέπει ΧΩΡΙΣ να πατήσει «Περισσότερα».
  ok(`γυμνό διαμέρισμα: ${b.core.length} πεδία στην πρώτη οθόνη`, b.core.length <= 14);
  ok(`επιπλωμένο: ${f.core.length} πεδία στην πρώτη οθόνη`, f.core.length <= 14);
  ok('συνολικά κάτω από 25 πεδία, από 78', b.core.length + b.more.length < 25);

  // Ό,τι χρειάζεται η δήλωση είναι ΠΑΝΤΑ μπροστά.
  const bareCore = b.core.map(d => d.id);
  for (const id of ['tenant.full_name', 'tenant.afm', 'tenant.lease_category', 'tenant.lease_start', 'tenant.rent', 'tenant.rent_iban']) {
    ok(`κρίσιμο στην πρώτη οθόνη: ${id}`, bareCore.includes(id));
  }
  // Και τα σπάνια είναι όντως πίσω από το κουμπί, όχι μπροστά.
  const bareMore = b.more.map(d => d.id);
  for (const id of ['tenant.email', 'tenant.profession', 'tenant.id_doc', 'tenant.iban', 'tenant.notes', 'tenant.parking']) {
    ok(`σε «Περισσότερα»: ${id}`, bareMore.includes(id));
  }

  // ΤΟ ΖΗΤΟΥΜΕΝΟ ΤΟΥ ΙΔΙΟΚΤΗΤΗ: «ανάλογα με το τι θα επιλέξεις βλέπεις και τα
  // αντίστοιχα πεδία». Η μόνη επιλογή που αλλάζει τη φόρμα είναι η επίπλωση.
  eq('γυμνό: καμία παρεχόμενη υπηρεσία', fieldPlacement('tenant.services', bare), 'hidden');
  eq('επιπλωμένο: οι υπηρεσίες εμφανίζονται, σε «Περισσότερα»', fieldPlacement('tenant.services', furn), 'more');
  eq('η επίπλωση αλλάζει ΑΚΡΙΒΩΣ ένα πεδίο',
    hiddenFieldCount(TENANT_FIELDS, bare) - hiddenFieldCount(TENANT_FIELDS, furn), 1);

  // Η στάθμευση ΔΕΝ κρέμεται από την επίπλωση: γυμνό διαμέρισμα νοικιάζει θέση.
  ok('η στάθμευση υπάρχει και σε γυμνό', fieldPlacement('tenant.parking', bare) !== 'hidden');

  // Κανένα πεδίο ενοικιαστή σε βραχυχρόνια ή σε κενό — ήδη ελεγμένο πιο πάνω,
  // εδώ ελέγχεται ότι ΚΑΝΕΝΑ από τα νέα δεν ξέφυγε χωρίς κανόνα `when`.
  for (const st of ['rent_short', 'vacant', 'own_use'] as const) {
    const g = formFields(TENANT_FIELDS, ctx({ status: st }));
    eq(`${st}: κανένα πεδίο ενοικιαστή`, g.core.length + g.more.length, 0);
  }
}

// ═══ ΤΙ ΛΕΙΠΕΙ ΑΠΟ ΤΗ ΜΙΣΘΩΣΗ ═════════════════════════════════════════════
{
  const c = ctx({ status: 'rent_long' });
  const empty = missingCritical(TENANT_FIELDS, c, new Set());
  eq('κενή φόρμα: λείπουν και τα πέντε κρίσιμα', empty.length, 5);
  ok('και το καθένα λέει γιατί', empty.every(d => d.why.length > 12));
  // Το IBAN είσπραξης είναι κρίσιμο ΕΠΕΙΔΗ κρίνει την τεκμαρτή έκπτωση 5%.
  ok('το IBAN είσπραξης εξηγεί την έκπτωση 5%',
    empty.some(d => d.id === 'tenant.rent_iban' && d.why.includes('5%')));
  const most = new Set(['tenant.lease_category', 'tenant.lease_start', 'tenant.rent', 'tenant.rent_iban']);
  eq('με μόνο το ΑΦΜ να λείπει, λείπει ένα', missingCritical(TENANT_FIELDS, c, most).length, 1);
  eq('και είναι το ΑΦΜ', missingCritical(TENANT_FIELDS, c, most)[0].id, 'tenant.afm');
}

console.log(fail === 0 ? `✓ fields: ${pass} έλεγχοι πέρασαν` : `✗ fields: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
