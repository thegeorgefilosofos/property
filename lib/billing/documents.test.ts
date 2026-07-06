// Τεστ για την καθολική δρομολόγηση εγγράφων (lib/billing/documents.ts).
// Τρέξε με: npx tsx lib/billing/documents.test.ts
import {
  classifyDocType, validateDoc, planDocSave, docSummaryLine,
  DOC_TYPES, DOC_TYPE_LABELS, type ScannedDoc, type DocType,
} from './documents';

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
// Priority: lease field beats a generic bill AI guess
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

// ── planDocSave: deed → safe property cols + archive note ─────────────────────
{
  const p = planDocSave(doc({ doc_type: 'deed', provider: 'Συμβ. Παπαδοπούλου', purchase_price: 180000, year_built: 2004, sqm: 78, atak: '11122233344', obj_value: 95000, purchase_date: '2019-05-20' }), TODAY);
  check('deed: property has safe cols', !!p.property);
  eq('deed: property.purchase_price', p.property!.purchase_price, 180000);
  eq('deed: property.year_built', p.property!.year_built, 2004);
  eq('deed: property.sqm', p.property!.sqm, 78);
  check('deed: NO atak/obj_value column write', !('atak' in (p.property || {})) && !('obj_value' in (p.property || {})) && !('purchase_date' in (p.property || {})));
  check('deed: extras go to archive note', !!p.archive!.note && p.archive!.note.includes('ΑΤΑΚ') && p.archive!.note.includes('Αντικειμενική'));
  eq('deed: archive date = purchase_date', p.archive!.date, '2019-05-20');
  check('deed: targets include Στοιχεία ακινήτου', p.targets.includes('Στοιχεία ακινήτου'));
}
// deed with no structured fields → archive only
{
  const p = planDocSave(doc({ doc_type: 'deed', title: 'Τίτλος' }), TODAY);
  check('deed empty: no property write', p.property === undefined);
  check('deed empty: targets = Αρχείο only', p.targets.length === 1 && p.targets[0] === 'Αρχείο');
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
  eq('gov: targets Αρχείο only', g.targets, ['Αρχείο']);
  check('gov: only archive', !g.bill && !g.expense && !g.tenant && !g.property && !g.settings && !!g.archive);
  const o = planDocSave(doc({ doc_type: 'other', title: 'κάτι' }), TODAY);
  eq('other: targets Αρχείο only', o.targets, ['Αρχείο']);
}

// ── custom fields flow into notes ────────────────────────────────────────────
{
  const p = planDocSave(doc({ doc_type: 'bill', category: 'electricity', provider: 'ΔΕΗ', amount: 40, custom: [{ label: 'Ρολόι', value: 'νυχτερινό' }] }), TODAY);
  check('custom: note appears in expense', String(p.expense!.notes).includes('Ρολόι: νυχτερινό'));
}

// ── metadata sanity ──────────────────────────────────────────────────────────
check('DOC_TYPES has 8 entries', DOC_TYPES.length === 8);
check('every DocType has a label', DOC_TYPES.every(t => !!DOC_TYPE_LABELS[t.id]));
eq('summary line prefers provider+amount', docSummaryLine(doc({ doc_type: 'bill', provider: 'ΔΕΗ', amount: 88.5 })), 'ΔΕΗ — 88,5 €');
eq('summary line lease rent', docSummaryLine(doc({ doc_type: 'lease', tenant_name: 'Α', monthly_rent: 600 })), 'Α — 600 €/μήνα');

// Coverage: every DocType classifies to itself under a strong signal (round-trip)
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

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\ndocuments.ts — ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('✓ όλα πέρασαν');
