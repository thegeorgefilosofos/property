// Τεστ για την καθολική δρομολόγηση εγγράφων (lib/billing/documents.ts).
// Τρέξε με: npx tsx lib/billing/documents.test.ts
import { navLabel } from '../nav/labels';
import {
  classifyDocType, validateDoc, planDocSave, docSummaryLine,
  DOC_TYPES, DOC_TYPE_LABELS, DOC_FIELD_LABELS, ARCHIVE_CATEGORIES,
  archiveCategoryFor, resolveBillCategory, normalizeScannedDoc,
  type ScannedDoc, type DocType,
} from './documents';
import { matchPaymentToBills } from './parse';

let passed = 0, failed = 0;
const fails: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) { passed++; } else { failed++; fails.push(name); }
}
function eq<T>(name: string, a: T, b: T) {
  check(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b));
}

const TODAY = '2026-07-06';
const doc = (o: Partial<ScannedDoc>): ScannedDoc =>
  ({ doc_type: 'other', confidence: 90, ...o });

// ── classifyDocType ──────────────────────────────────────────────────────────
eq('classify: bill by category+amount', classifyDocType(doc({ doc_type: 'other', category: 'electricity', amount: 42 })), 'bill');
eq('classify: lease by monthly_rent field', classifyDocType(doc({ doc_type: 'other', monthly_rent: 600 })), 'lease');
eq('classify: lease by keyword', classifyDocType(doc({ doc_type: 'other', title: 'Ιδιωτικό Συμφωνητικό Μίσθωσης Κατοικίας' })), 'lease');
eq('classify: insurance by keyword', classifyDocType(doc({ doc_type: 'bill', title: 'Ασφαλιστήριο Συμβόλαιο Interamerican' })), 'insurance');
eq('classify: insurance by policy_number', classifyDocType(doc({ doc_type: 'other', policy_number: 'POL-123' })), 'insurance');
eq('classify: tax by ΕΝΦΙΑ keyword', classifyDocType(doc({ doc_type: 'other', title: 'Εκκαθαριστικό ΕΝΦΙΑ 2026' })), 'tax');
eq('classify: deed by keyword', classifyDocType(doc({ doc_type: 'other', title: 'Συμβόλαιο Αγοραπωλησίας Ακινήτου' })), 'deed');
eq('classify: deed by atak', classifyDocType(doc({ doc_type: 'other', atak: '12345678901' })), 'deed');
eq('classify: government by keyword', classifyDocType(doc({ doc_type: 'other', title: 'Βεβαίωση Πολεοδομίας' })), 'government');
eq('classify: payment by keyword', classifyDocType(doc({ doc_type: 'other', title: 'Απόδειξη Πληρωμής', amount: 50 })), 'payment');
eq('classify: respect valid AI type when no keywords', classifyDocType(doc({ doc_type: 'bill' })), 'bill');
eq('classify: fallback other', classifyDocType(doc({ doc_type: 'other', title: 'κάτι ασαφές' })), 'other');
// Προτεραιότητα: το πεδίο του μισθωτηρίου υπερισχύει της γενικής εικασίας του μοντέλου
eq('classify: lease field wins over ai=bill', classifyDocType(doc({ doc_type: 'bill', monthly_rent: 500 })), 'lease');

// ── validateDoc ──────────────────────────────────────────────────────────────
eq('validate bill: amount blocking', validateDoc(doc({ doc_type: 'bill' })).blocking, ['amount']);
eq('validate bill: complete', validateDoc(doc({ doc_type: 'bill', amount: 40, provider: 'ΔΕΗ', due_date: '2026-08-01' })).blocking, []);
eq('validate lease: name+rent blocking', validateDoc(doc({ doc_type: 'lease' })).blocking, ['tenant_name', 'monthly_rent']);
eq('validate lease: complete blocking empty', validateDoc(doc({ doc_type: 'lease', tenant_name: 'Α', monthly_rent: 600 })).blocking, []);
eq('validate insurance: provider blocking', validateDoc(doc({ doc_type: 'insurance' })).blocking, ['provider']);
eq('validate deed: no blocking', validateDoc(doc({ doc_type: 'deed' })).blocking, []);
eq('validate government: no blocking', validateDoc(doc({ doc_type: 'government' })).blocking, []);
eq('validate payment: amount blocking', validateDoc(doc({ doc_type: 'payment' })).blocking, ['amount']);

// ── planDocSave: bill ────────────────────────────────────────────────────────
{
  const p = planDocSave(doc({ doc_type: 'bill', category: 'electricity', provider: 'ΔΕΗ', amount: 88.5, due_date: '2026-08-10', period: 'Ιούν 2026', kwh: 320 }), TODAY);
  check('bill: has bill payload', !!p.bill);
  eq('bill: bill.category', p.bill!.category, 'electricity');
  eq('bill: bill.paid false', p.bill!.paid, false);
  eq('bill: bill.amount', p.bill!.amount, 88.5);
  check('bill: has expense', !!p.expense);
  eq('bill: expense.category label', p.expense!.category, 'Ρεύμα');
  eq('bill: expense.group', p.expense!.expense_group, 'fixed');
  check('bill: has calendar (due_date present)', Array.isArray(p.calendar) && p.calendar.length === 1);
  eq('bill: calendar event_date', p.calendar![0].event_date, '2026-08-10');
  check('bill: targets include Ημερολόγιο', p.targets.includes('Ημερολόγιο'));
  check('bill: archived', !!p.archive);
  eq('bill: not reconcile', !!p.reconcile, false);
}
// bill without due_date → no calendar
{
  const p = planDocSave(doc({ doc_type: 'bill', category: 'water', provider: 'ΕΥΔΑΠ', amount: 30 }), TODAY);
  eq('bill no due: no calendar', p.calendar, undefined);
  check('bill no due: expense.date falls back to today', p.expense!.date === TODAY);
  check('bill no due: targets exclude Ημερολόγιο', !p.targets.includes('Ημερολόγιο'));
}
// common bill → κοινόχρηστα signals
{
  const p = planDocSave(doc({ doc_type: 'bill', category: 'common', provider: 'Διαχείριση', amount: 45, millesimi: 12 }), TODAY);
  eq('common: commonMonthAmount', p.commonMonthAmount, 45);
  eq('common: commonMillesimi', p.commonMillesimi, 12);
  check('common: targets include Κοινόχρηστα', p.targets.includes('Κοινόχρηστα'));
}
// unknown category coerced to 'other'
{
  const p = planDocSave(doc({ doc_type: 'bill', category: 'nonsense' as string, provider: 'X', amount: 10 }), TODAY);
  eq('bill unknown cat → other', p.bill!.category, 'other');
  eq('bill unknown cat → expense label Άλλο', p.expense!.category, 'Άλλο');
}

// ── planDocSave: payment (paid + reconcile) ──────────────────────────────────
{
  const p = planDocSave(doc({ doc_type: 'payment', category: 'electricity', provider: 'ΔΕΗ', amount: 88.5, issue_date: '2026-07-01' }), TODAY);
  eq('payment: bill.paid true', p.bill!.paid, true);
  eq('payment: expense.paid true', p.expense!.paid, true);
  eq('payment: reconcile true', p.reconcile, true);
  check('payment: no calendar reminder', p.calendar === undefined);
  eq('payment: expense.date uses issue_date', p.expense!.date, '2026-07-01');
}

// ── planDocSave: lease → tenant ──────────────────────────────────────────────
{
  const p = planDocSave(doc({ doc_type: 'lease', tenant_name: 'Γ. Παπαδόπουλος', monthly_rent: 650, lease_start: '2026-09-01', lease_end: '2029-08-31', deposit: 1300, afm: '123456789' }), TODAY);
  check('lease: has tenant', !!p.tenant);
  eq('lease: tenant.full_name', p.tenant!.full_name, 'Γ. Παπαδόπουλος');
  eq('lease: tenant.monthly_rent', p.tenant!.monthly_rent, 650);
  eq('lease: tenant.lease_end', p.tenant!.lease_end, '2029-08-31');
  eq('lease: tenant.deposit_amount', p.tenant!.deposit_amount, 1300);
  eq('lease: tenant.afm', p.tenant!.afm, '123456789');
  eq('lease: archived as Μισθωτήριο', p.archive!.category, 'Μισθωτήριο / Συμβόλαιο');
  check('lease: no bill/expense', !p.bill && !p.expense);
}

// ── planDocSave: insurance → settings + expense + calendar ────────────────────
{
  const p = planDocSave(doc({ doc_type: 'insurance', provider: 'Interamerican', premium: 240, expiry_date: '2027-03-15', policy_number: 'POL-9' }), TODAY);
  check('insurance: has settings', !!p.settings);
  eq('insurance: settings.company', p.settings!.insurance_company, 'Interamerican');
  eq('insurance: settings.policy', p.settings!.insurance_policy, 'POL-9');
  eq('insurance: settings.expiry', p.settings!.insurance_expiry, '2027-03-15');
  check('insurance: NO user_properties write', p.property === undefined);
  check('insurance: premium → expense', !!p.expense);
  eq('insurance: expense label', p.expense!.category, 'Ασφάλεια Κτιρίου');
  check('insurance: expiry → calendar', Array.isArray(p.calendar) && p.calendar.length === 1);
  eq('insurance: calendar high priority', p.calendar![0].priority, 'high');
  check('insurance: targets', p.targets.includes('Ασφάλεια') && p.targets.includes('Ημερολόγιο') && p.targets.includes('Δαπάνες'));
}
// insurance without premium/expiry → settings + archive only
{
  const p = planDocSave(doc({ doc_type: 'insurance', provider: 'ΕΘΝΙΚΗ' }), TODAY);
  check('insurance minimal: settings only', !!p.settings && !p.expense && !p.calendar);
}

// insurance coverage must NOT be lost (review fix)
{
  const p = planDocSave(doc({ doc_type: 'insurance', provider: 'ERGO', premium: 300, coverage: 150000, expiry_date: '2027-01-01' }), TODAY);
  check('insurance: coverage in expense notes', String(p.expense!.notes).includes('150.000'));
  check('insurance: coverage in archive note', !!p.archive!.note && p.archive!.note.includes('150.000'));
  eq('insurance: archive date = expiry', p.archive!.date, '2027-01-01');
}

// ── planDocSave: deed → στήλες ακινήτου, ΟΧΙ σημείωση ────────────────────────
// Ο ΑΤΑΚ είναι το μοναδικό κλειδί ταύτισης με το έντυπο Ε2. Όσο έμενε σε
// ελεύθερο κείμενο, η καρτέλα συμφωνίας τον ζητούσε ενώ η σάρωση τον είχε ήδη
// διαβάσει. Οι στήλες υπάρχουν — ρωτήθηκε η βάση, δεν υποτέθηκε.
{
  const p = planDocSave(doc({ doc_type: 'deed', provider: 'Συμβ. Παπαδοπούλου', purchase_price: 180000, year_built: 2004, sqm: 78, atak: '11122233344', obj_value: 95000, purchase_date: '2019-05-20' }), TODAY);
  check('deed: property has safe cols', !!p.property);
  eq('deed: property.purchase_price', p.property!.purchase_price, 180000);
  eq('deed: property.year_built', p.property!.year_built, 2004);
  eq('deed: property.sqm', p.property!.sqm, 78);
  eq('deed: ο ΑΤΑΚ γράφεται στη στήλη του', p.property!.atak, '11122233344');
  eq('deed: η αντικειμενική στη στήλη της', p.property!.obj_value, 95000);
  eq('deed: η ημερομηνία αγοράς στη στήλη της', p.property!.purchase_date, '2019-05-20');
  check('deed: ΔΕΝ επαναλαμβάνονται στη σημείωση', !(p.archive!.note || '').includes('ΑΤΑΚ') && !(p.archive!.note || '').includes('Αντικειμενική'));
  check('deed: ο συμβολαιογράφος (χωρίς στήλη) μένει στη σημείωση', (p.archive!.note || '').includes('Παπαδοπούλου'));
  eq('deed: archive date = purchase_date', p.archive!.date, '2019-05-20');
  check('deed: targets include Στοιχεία ακινήτου', p.targets.includes('Στοιχεία ακινήτου'));
}
// Ο ΑΤΑΚ με κενά γύρω του δεν γράφεται ημιτελής, ούτε δημιουργεί άδεια εγγραφή.
{
  const p = planDocSave(doc({ doc_type: 'deed', atak: '  11122233344  ' }), TODAY);
  eq('deed: ο ΑΤΑΚ καθαρίζεται', p.property!.atak, '11122233344');
}
{
  const p = planDocSave(doc({ doc_type: 'deed', atak: '   ' }), TODAY);
  check('deed: κενός ΑΤΑΚ δεν γράφει τίποτα', p.property === undefined);
}
// Ο κανόνας «συμπληρώνουμε κενά» ελέγχεται στο lib/core/prefill.test.ts.
// deed with no structured fields → archive only
{
  const p = planDocSave(doc({ doc_type: 'deed', title: 'Τίτλος' }), TODAY);
  check('deed empty: no property write', p.property === undefined);
  check('deed empty: targets = φάκελος μόνο', p.targets.length === 1 && p.targets[0] === navLabel('documents'));
}

// ── planDocSave: tax → expense + calendar, no property ───────────────────────
{
  const p = planDocSave(doc({ doc_type: 'tax', provider: 'ΑΑΔΕ', amount: 520, due_date: '2026-10-31', tax_year: 2026 }), TODAY);
  check('tax: NO property write', p.property === undefined);
  check('tax: has expense', !!p.expense);
  eq('tax: expense label ΕΝΦΙΑ', p.expense!.category, 'ΕΝΦΙΑ');
  check('tax: has calendar', Array.isArray(p.calendar) && p.calendar.length === 1);
  check('tax: targets Δαπάνες+Ημερολόγιο', p.targets.includes('Δαπάνες') && p.targets.includes('Ημερολόγιο'));
}

// ── planDocSave: government/other → archive only ─────────────────────────────
{
  const g = planDocSave(doc({ doc_type: 'government', title: 'ΑΜΑ' }), TODAY);
  eq('gov: targets φάκελος μόνο', g.targets, [navLabel('documents')]);
  check('gov: only archive', !g.bill && !g.expense && !g.tenant && !g.property && !g.settings && !!g.archive);
  const o = planDocSave(doc({ doc_type: 'other', title: 'κάτι' }), TODAY);
  eq('other: targets φάκελος μόνο', o.targets, [navLabel('documents')]);
}

// ── custom fields flow into notes ────────────────────────────────────────────
{
  const p = planDocSave(doc({ doc_type: 'bill', category: 'electricity', provider: 'ΔΕΗ', amount: 40, custom: [{ label: 'Ρολόι', value: 'νυχτερινό' }] }), TODAY);
  check('custom: note appears in expense', String(p.expense!.notes).includes('Ρολόι: νυχτερινό'));
}

// ── metadata sanity ──────────────────────────────────────────────────────────
check('DOC_TYPES has 8 entries', DOC_TYPES.length === 8);
check('every DocType has a label', DOC_TYPES.every(t => !!DOC_TYPE_LABELS[t.id]));
// ΤΑ ΠΟΣΑ ΤΗΣ ΣΥΝΟΨΗΣ ΓΡΑΦΟΝΤΑΙ ΟΠΩΣ ΠΑΝΤΟΥ ΑΛΛΟΥ: δύο δεκαδικά και αχώριστο
// κενό πριν από το ευρώ. Εδώ έβγαινε «88,5 €» και «600 €/μήνα» από απευθείας
// κλήση `toLocaleString`, δηλαδή τρίτη μορφή ευρώ δίπλα στις άλλες δύο της ίδιας
// οθόνης. Ο κοινός τύπος `fe` είναι ο μόνος που γράφει ποσό.
eq('η σύνοψη προτιμά πάροχο και ποσό', docSummaryLine(doc({ doc_type: 'bill', provider: 'ΔΕΗ', amount: 88.5 })), 'ΔΕΗ — 88,50 €');
eq('η σύνοψη μίσθωσης γράφει το μίσθωμα', docSummaryLine(doc({ doc_type: 'lease', tenant_name: 'Α', monthly_rent: 600 })), 'Α — 600,00 €/μήνα');

// Κάλυψη: κάθε τύπος εγγράφου κατατάσσεται στον εαυτό του όταν το σήμα είναι ισχυρό (κύκλος)
const strong: Record<DocType, Partial<ScannedDoc>> = {
  bill: { category: 'electricity', amount: 10 },
  payment: { title: 'Απόδειξη Πληρωμής', amount: 10 },
  lease: { monthly_rent: 500 },
  deed: { atak: '1' },
  insurance: { policy_number: 'x' },
  tax: { title: 'ΕΝΦΙΑ' },
  government: { title: 'Πολεοδομία' },
  other: { title: 'ασαφές' },
};
(Object.keys(strong) as DocType[]).forEach(t => {
  eq(`round-trip ${t}`, classifyDocType(doc({ doc_type: 'other', ...strong[t] })), t);
});

// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΠΕΝΤΕ ΠΕΔΙΑ ΣΤΟ ΠΑΡΑΣΤΑΤΙΚΟ + ΕΝΑ ΣΗΜΕΙΟ ΓΙΑ ΤΟΝ ΦΑΚΕΛΟ
// ═══════════════════════════════════════════════════════════════════════════

// ── Ένα σημείο αλήθειας για τον φάκελο του Αρχείου ─────────────────────────
eq('φάκελος: λογαριασμός ρεύματος', archiveCategoryFor(doc({ doc_type: 'bill', category: 'electricity' })), 'Λογαριασμός Ρεύματος');
eq('φάκελος: απόδειξη ρεύματος (ίδιο ράφι)', archiveCategoryFor(doc({ doc_type: 'payment', category: 'electricity' })), 'Λογαριασμός Ρεύματος');
eq('φάκελος: νερό από ΟΝΟΜΑ παρόχου χωρίς κατηγορία', archiveCategoryFor(doc({ doc_type: 'bill', provider: 'ΕΥΔΑΠ' })), 'Λογαριασμός Νερού');
eq('φάκελος: ρεύμα από ΟΝΟΜΑ παρόχου (ΔΕΗ)', archiveCategoryFor(doc({ doc_type: 'bill', provider: 'ΔΕΗ Α.Ε.' })), 'Λογαριασμός Ρεύματος');
eq('φάκελος: αέριο', archiveCategoryFor(doc({ doc_type: 'bill', category: 'gas' })), 'Λογαριασμός Φυσικού Αερίου');
eq('φάκελος: άγνωστος πάροχος → Άλλο Έγγραφο', archiveCategoryFor(doc({ doc_type: 'bill', provider: 'Κάτι Άγνωστο' })), 'Άλλο Έγγραφο');
eq('φάκελος: μισθωτήριο', archiveCategoryFor(doc({ doc_type: 'lease' })), 'Μισθωτήριο / Συμβόλαιο');
// Κάθε ράφι που δίνει η συνάρτηση ΠΡΕΠΕΙ να υπάρχει στην ταξινομία του Αρχείου.
(['bill', 'payment', 'lease', 'deed', 'insurance', 'tax', 'government', 'other'] as DocType[]).forEach(t => {
  check(`ταξινομία: το ράφι του ${t} υπάρχει`, (ARCHIVE_CATEGORIES as readonly string[]).includes(archiveCategoryFor(doc({ doc_type: t }))));
});
['electricity', 'water', 'gas', 'internet', 'common', 'insurance', 'taxes', 'municipal', 'security', 'elevator', 'pool', 'cleaner'].forEach(c => {
  check(`ταξινομία: το ράφι της κατηγορίας ${c} υπάρχει`, (ARCHIVE_CATEGORIES as readonly string[]).includes(archiveCategoryFor(doc({ doc_type: 'bill', category: c }))));
});
// Η διόρθωση ζει ΜΕΣΑ στο σχέδιο: planDocSave και archiveCategoryFor δεν αποκλίνουν.
{
  const d = doc({ doc_type: 'bill', category: 'water', provider: 'ΕΥΔΑΠ', amount: 42 });
  eq('planDocSave.archive.category === archiveCategoryFor', planDocSave(d, TODAY).archive!.category, archiveCategoryFor(d));
}

// ── resolveBillCategory ────────────────────────────────────────────────────
eq('κατηγορία: έγκυρη από OCR', resolveBillCategory({ category: 'gas' }), 'gas');
eq('κατηγορία: από πάροχο όταν λείπει', resolveBillCategory({ provider: 'COSMOTE' }), 'internet');
eq('κατηγορία: «other» + πάροχος ΔΕΗ → electricity', resolveBillCategory({ category: 'other', provider: 'ΔΕΗ' }), 'electricity');
eq('κατηγορία: τίποτα → other', resolveBillCategory({}), 'other');

// ── validateDoc: ΑΦΜ & περίοδος είναι recommended, ΟΧΙ blocking ─────────────
{
  const v = validateDoc(doc({ doc_type: 'bill', amount: 88.5, provider: 'ΔΕΗ', due_date: '2026-07-20' }));
  eq('θολό χαρτί: το ΑΦΜ δεν μπλοκάρει', v.blocking, []);
  check('ζητάμε ΑΦΜ', v.recommended.includes('provider_afm'));
  check('ζητάμε περίοδο', v.recommended.includes('period_from'));
  eq('τίποτα άκυρο', v.invalid, []);
}
{
  const v = validateDoc(doc({
    doc_type: 'bill', amount: 88.5, provider: 'ΔΕΗ', due_date: '2026-07-20',
    provider_afm: '090000045', period_from: '2026-06-01', period_to: '2026-06-30',
  }));
  eq('πλήρες: τίποτα σε recommended', v.recommended, []);
  eq('πλήρες: τίποτα σε invalid', v.invalid, []);
}
// Άκυρο checksum: το λέμε, δεν το περνάμε για σωστό — και ΔΕΝ μπλοκάρουμε.
{
  const v = validateDoc(doc({ doc_type: 'bill', amount: 10, provider_afm: '090000046' }));
  check('άκυρο ΑΦΜ → invalid', v.invalid.includes('provider_afm'));
  check('άκυρο ΑΦΜ δεν μπλοκάρει την αποθήκευση', !v.blocking.includes('provider_afm'));
}
{
  const v = validateDoc(doc({ doc_type: 'bill', amount: 10, period_from: '2026-07-01', period_to: '2026-06-01' }));
  check('ανάποδη περίοδος → invalid', v.invalid.includes('period_from'));
}
{
  const v = validateDoc(doc({ doc_type: 'lease', tenant_name: 'Α', monthly_rent: 600, afm: '111111111' }));
  check('άκυρο ΑΦΜ ενοικιαστή → invalid', v.invalid.includes('afm'));
}
check('κάθε νέο πεδίο έχει ελληνική ετικέτα', ['provider_afm', 'period_from', 'period_to', 'issue_date'].every(k => !!DOC_FIELD_LABELS[k]));

// ── normalizeScannedDoc: μεταφράζει, δεν μαντεύει ──────────────────────────
{
  const n = normalizeScannedDoc(doc({ doc_type: 'bill', period: 'Ιούνιος 2026', provider_afm: '090 000 045' }));
  eq('normalize: ΑΦΜ μόνο ψηφία', n.provider_afm, '090000045');
  eq('normalize: περίοδος από κείμενο (από)', n.period_from, '2026-06-01');
  eq('normalize: περίοδος από κείμενο (έως)', n.period_to, '2026-06-30');
  eq('normalize: το κείμενο διατηρείται για την οθόνη', n.period, 'Ιούνιος 2026');
}
{
  const n = normalizeScannedDoc(doc({ doc_type: 'bill', period: 'εκκαθαριστικός λογαριασμός' }));
  eq('normalize: χωρίς μήνα δεν επινοεί (από)', n.period_from, undefined);
  eq('normalize: χωρίς μήνα δεν επινοεί (έως)', n.period_to, undefined);
}
{
  const n = normalizeScannedDoc(doc({ doc_type: 'bill', period: 'Ιούνιος 2026', period_from: '2026-06-05', period_to: '2026-07-04' }));
  eq('normalize: δεν πατάει ό,τι έδωσε το AI', [n.period_from, n.period_to], ['2026-06-05', '2026-07-04']);
}

// ── planDocSave: το παραστατικό κρατά ΠΟΣΟ, ΑΦΜ, ΠΕΡΙΟΔΟ, ΕΚΔΟΣΗ ───────────
{
  const p = planDocSave(doc({
    doc_type: 'bill', category: 'electricity', provider: 'ΔΕΗ', amount: 88.5,
    due_date: '2026-07-20', issue_date: '2026-07-01', provider_afm: '090000045',
    period_from: '2026-06-01', period_to: '2026-06-30', period: 'Ιούνιος 2026',
  }), TODAY);
  eq('αρχείο: ποσό', p.archive!.amount, 88.5);
  eq('αρχείο: ΑΦΜ παρόχου', p.archive!.provider_afm, '090000045');
  eq('αρχείο: περίοδος από', p.archive!.period_from, '2026-06-01');
  eq('αρχείο: περίοδος έως', p.archive!.period_to, '2026-06-30');
  eq('αρχείο: ημ. έκδοσης', p.archive!.issue_date, '2026-07-01');
  eq('αρχείο: ράφι ρεύματος', p.archive!.category, 'Λογαριασμός Ρεύματος');
  eq('λογαριασμός: γράφεται και η περίοδος', p.bill!.period, 'Ιούνιος 2026');
}
// Άκυρο ΑΦΜ ΔΕΝ αποθηκεύεται ως σωστό.
{
  const p = planDocSave(doc({ doc_type: 'bill', category: 'water', provider: 'ΕΥΔΑΠ', amount: 42, provider_afm: '090000046' }), TODAY);
  eq('αρχείο: άκυρο ΑΦΜ δεν γράφεται', p.archive!.provider_afm, undefined);
}
// Χωρίς ποσό → undefined (NULL), ΠΟΤΕ 0: το μηδέν θα μολύνει κάθε άθροισμα.
{
  const p = planDocSave(doc({ doc_type: 'other', title: 'Βεβαίωση' }), TODAY);
  eq('αρχείο: χωρίς ποσό → undefined', p.archive!.amount, undefined);
}
{
  const p = planDocSave(doc({ doc_type: 'bill', category: 'gas', provider: 'ΔΕΠΑ', amount: 0 }), TODAY);
  eq('αρχείο: ποσό 0 → undefined', p.archive!.amount, undefined);
}
// Ασφαλιστήριο: το ασφάλιστρο ΕΙΝΑΙ το ποσό του παραστατικού.
{
  const p = planDocSave(doc({ doc_type: 'insurance', provider: 'Interamerican', premium: 240, expiry_date: '2027-01-01' }), TODAY);
  eq('αρχείο: ασφάλιστρο ως ποσό', p.archive!.amount, 240);
}
// Η περίοδος από ΚΕΙΜΕΝΟ φτάνει στο αρχείο όταν προηγηθεί normalizeScannedDoc.
{
  const p = planDocSave(normalizeScannedDoc(doc({ doc_type: 'bill', category: 'water', provider: 'ΕΥΔΑΠ', amount: 55, period: '01/04/2026 - 30/06/2026' })), TODAY);
  eq('αρχείο: περίοδος από ελεύθερο κείμενο', [p.archive!.period_from, p.archive!.period_to], ['2026-04-01', '2026-06-30']);
}
// Ό,τι γράφεται στο αρχείο μπορεί να ξαναδιαβαστεί ως υποψήφιος ταιριάσματος:
// το παραστατικό και ο λογαριασμός μιλούν την ίδια γλώσσα.
{
  const scanned = normalizeScannedDoc(doc({
    doc_type: 'payment', category: 'electricity', provider: 'ΔΕΗ', amount: 88.5,
    issue_date: '2026-07-30', provider_afm: '090000045', period: 'Ιούλιος 2026',
  }));
  const a = planDocSave(scanned, TODAY).archive!;
  const twoBills = [
    { id: 'jun', category: 'electricity', amount: 88.5, due_date: '2026-07-20', provider: 'ΔΕΗ', period: 'Ιούνιος 2026' },
    { id: 'jul', category: 'electricity', amount: 88.5, due_date: '2026-08-20', provider: 'ΔΕΗ', period: 'Ιούλιος 2026' },
  ];
  const r = matchPaymentToBills({
    amount: a.amount!, date: a.issue_date!, category: 'electricity',
    provider: a.supplier, provider_afm: a.provider_afm,
    period_from: a.period_from, period_to: a.period_to,
  }, twoBills);
  eq('end-to-end: η απόδειξη Ιουλίου εξοφλεί τον Ιούλιο', [r.verdict, r.best?.bill.id], ['confident', 'jul']);
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\ndocuments.ts — ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('✓ όλα πέρασαν');
