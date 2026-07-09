// ─────────────────────────────────────────────────────────────────────────────
// Καθολική αναγνώριση & δρομολόγηση εγγράφων (universal document routing)
//
// Ο χρήστης φωτογραφίζει ΟΤΙΔΗΠΟΤΕ: λογαριασμό, απόδειξη πληρωμής, μισθωτήριο,
// τίτλο ιδιοκτησίας/συμβόλαιο, ασφαλιστήριο, ΕΝΦΙΑ/φορολογικό, κρατικό έγγραφο.
// Το AI εξάγει πεδία· ΕΔΩ (καθαρή, δοκιμασμένη λογική) αποφασίζουμε:
//   1) τι είδος εγγράφου είναι  → classifyDocType()
//   2) αν λείπουν βασικά πεδία   → validateDoc()
//   3) πού γράφεται στη βάση     → planDocSave()  (ποιοι πίνακες/tabs ενημερώνονται)
//
// Η μονάδα ΔΕΝ αγγίζει Supabase: επιστρέφει «σχέδιο» (SavePlan) με payloads χωρίς
// ids· το component το εκτελεί προσθέτοντας property_id/user_id/bill_id. Έτσι όλη
// η επικίνδυνη λογική (κατηγοριοποίηση/δρομολόγηση) είναι 100% δοκιμάσιμη.
// ─────────────────────────────────────────────────────────────────────────────

import { EXPENSE_MAP } from './parse';

export type DocType =
  | 'bill'        // λογαριασμός κοινής ωφέλειας/υπηρεσίας → Λογαριασμοί + Δαπάνες + Ημερολόγιο
  | 'payment'     // απόδειξη/βεβαίωση πληρωμής            → Δαπάνες (πληρωμένο) + συμφωνία λογαριασμού
  | 'lease'       // μισθωτήριο                            → Ενοικιαστής (ενοίκιο, διάρκεια, εγγύηση)
  | 'deed'        // τίτλος ιδιοκτησίας / συμβόλαιο αγοράς  → Στοιχεία ακινήτου + Αρχείο
  | 'insurance'   // ασφαλιστήριο ακινήτου                 → Ασφάλεια ακινήτου + Ημερολόγιο (λήξη)
  | 'tax'         // ΕΝΦΙΑ / Ε9 / φορολογικό               → ΕΝΦΙΑ + Δαπάνες + Ημερολόγιο
  | 'government'  // κρατικό/δημόσιο έγγραφο (ΑΜΑ, πολεοδομία, βεβαιώσεις) → Αρχείο
  | 'other';      // οτιδήποτε άλλο                        → Αρχείο

export interface DocTypeMeta {
  id: DocType;
  label: string;       // ελληνική ονομασία
  hint: string;        // σύντομη περιγραφή για τον χρήστη
  targets: string[];   // ποια tabs/καρτέλες ενημερώνει (για την οθόνη επιβεβαίωσης)
}

export const DOC_TYPES: DocTypeMeta[] = [
  { id: 'bill',       label: 'Λογαριασμός',          hint: 'Ρεύμα, νερό, αέριο, internet, κοινόχρηστα, υπηρεσίες', targets: ['Λογαριασμοί', 'Δαπάνες', 'Ημερολόγιο'] },
  { id: 'payment',    label: 'Απόδειξη πληρωμής',     hint: 'Βεβαίωση/απόδειξη ότι πληρώθηκε κάτι',                 targets: ['Δαπάνες', 'Λογαριασμοί'] },
  { id: 'lease',      label: 'Μισθωτήριο',            hint: 'Συμφωνητικό ενοικίασης — ενοίκιο, διάρκεια, εγγύηση', targets: ['Ενοικιαστής', 'Αρχείο'] },
  { id: 'deed',       label: 'Τίτλος / Συμβόλαιο',    hint: 'Τίτλος ιδιοκτησίας ή συμβόλαιο αγοράς',                targets: ['Στοιχεία ακινήτου', 'Αρχείο'] },
  { id: 'insurance',  label: 'Ασφαλιστήριο',          hint: 'Ασφάλεια ακινήτου — ασφάλιστρο, κάλυψη, λήξη',        targets: ['Ασφάλεια', 'Ημερολόγιο', 'Αρχείο'] },
  { id: 'tax',        label: 'Φορολογικό / ΕΝΦΙΑ',     hint: 'ΕΝΦΙΑ, Ε9, δηλώσεις, φόροι ακινήτου',                 targets: ['Στοιχεία ακινήτου', 'Δαπάνες', 'Ημερολόγιο'] },
  { id: 'government', label: 'Κρατικό έγγραφο',        hint: 'ΑΜΑ, πολεοδομία, βεβαιώσεις, δημόσια έγγραφα',        targets: ['Αρχείο'] },
  { id: 'other',      label: 'Άλλο έγγραφο',          hint: 'Οτιδήποτε άλλο — αρχειοθετείται με ασφάλεια',         targets: ['Αρχείο'] },
];

export const DOC_TYPE_LABELS: Record<DocType, string> =
  DOC_TYPES.reduce((a, t) => { a[t.id] = t.label; return a; }, {} as Record<DocType, string>);

// Κατηγορία στο Αρχείο (property_documents) ανά τύπο — ώστε να μπαίνει σωστά.
export const DOC_ARCHIVE_CATEGORY: Record<DocType, string> = {
  bill:       'Άλλο Έγγραφο',
  payment:    'Άλλο Έγγραφο',
  lease:      'Μισθωτήριο / Συμβόλαιο',
  deed:       'Μισθωτήριο / Συμβόλαιο',
  insurance:  'Ασφαλιστήριο Συμβόλαιο',
  tax:        'ΕΝΦΙΑ / Φορολογικά',
  government: 'Άλλο Έγγραφο',
  other:      'Άλλο Έγγραφο',
};

// ── Ενιαίο σχήμα εξαγόμενων πεδίων (superset για όλους τους τύπους) ───────────
export interface ScannedDoc {
  doc_type:   DocType;
  title?:     string;    // σύντομος τίτλος (π.χ. «Μισθωτήριο — Παπαδόπουλος»)
  provider?:  string;    // πάροχος / αντισυμβαλλόμενος / φορέας / ασφαλιστική
  category?:  string;    // κατηγορία λογαριασμού (electricity…) όταν doc_type='bill'|'payment'
  amount?:    number;    // ποσό (λογαριασμός/πληρωμή/φόρος/ασφάλιστρο)
  due_date?:  string;    // λήξη πληρωμής (YYYY-MM-DD)
  issue_date?: string;   // ημερομηνία έκδοσης (YYYY-MM-DD)
  period?:    string;    // περίοδος

  // μισθωτήριο
  tenant_name?: string;
  monthly_rent?: number;
  lease_start?: string;
  lease_end?:   string;
  deposit?:     number;
  afm?:         string;

  // τίτλος / συμβόλαιο / ακίνητο
  purchase_price?: number;
  purchase_date?:  string;
  obj_value?:      number;  // αντικειμενική αξία
  atak?:           string;
  year_built?:     number;
  sqm?:            number;

  // ασφαλιστήριο
  policy_number?: string;
  premium?:       number;   // ασφάλιστρο (€)
  coverage?:      number;   // κάλυψη (€)
  expiry_date?:   string;   // λήξη ασφάλισης (YYYY-MM-DD)

  // φορολογικό
  tax_year?: number;

  // λογαριασμός — extras (συμβατά με ExtractedBill)
  kwh?: number; ert?: number; etmear?: number; dimotika?: number;
  cubic_meters?: number; meter_prev?: number; meter_current?: number;
  energy_charge?: number; network_charge?: number; millesimi?: number;
  vat_rate?: number; account_num?: string;

  notes?: string;
  confidence: number;
  // Επιπλέον πεδία που πρόσθεσε χειροκίνητα ο χρήστης (ελεύθερα).
  custom?: { label: string; value: string }[];
}

// ── 1) Κατηγοριοποίηση/επιδιόρθωση τύπου ─────────────────────────────────────
// Το AI προτείνει doc_type· εδώ το επικυρώνουμε/διορθώνουμε με ντετερμινιστικά
// κλειδιά (λέξεις-κλειδιά σε τίτλο/πάροχο/σημειώσεις). Αν το AI είναι σίγουρο και
// έγκυρο, το σεβόμαστε· αλλιώς μαντεύουμε από το περιεχόμενο. Ποτέ δεν σκάει.
const norm = (s?: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const TYPE_KEYWORDS: { type: DocType; keys: string[] }[] = [
  { type: 'lease',      keys: ['μισθωτηρ', 'μισθωση', 'συμφωνητικο μισθ', 'εκμισθωτ', 'μισθωτ', 'ενοικιαστ', 'lease', 'tenancy'] },
  { type: 'insurance',  keys: ['ασφαλιστηριο', 'ασφαλεια', 'ασφαλιστρ', 'ασφαλιση', 'καλυψη', 'insurance', 'policy', 'interamerican', 'ethniki asfalis', 'εθνικη ασφαλ', 'generali', 'allianz', 'ergo', 'υδρογειος'] },
  { type: 'tax',        keys: ['ενφια', 'e9', 'ε9', 'φορολογ', 'φορος ακινητ', 'δηλωση στοιχειων', 'ααδε', 'εκκαθαρ', 'τελος ακινητ', 'tax'] },
  { type: 'deed',       keys: ['τιτλος ιδιοκτησ', 'συμβολαιο αγορ', 'αγοραπωλησ', 'συμβολαιογραφ', 'μεταγραφη', 'κτηματολογ', 'deed', 'title', 'αντικειμενικη αξ'] },
  { type: 'government', keys: ['αμα', 'πολεοδομ', 'βεβαιωση', 'δημος', 'υπηρεσια δομησ', 'αυθαιρετ', 'ταυτοτητα κτιρι', 'μηχανικ', 'εγγραφο', 'πιστοποιητικ'] },
  { type: 'payment',    keys: ['αποδειξη πληρωμ', 'βεβαιωση πληρωμ', 'εξοφληθηκε', 'εξοφληση', 'πληρωθηκε', 'receipt', 'paid', 'payment confirmation', 'αποδεικτικο πληρωμ'] },
];

const VALID_TYPES = new Set<DocType>(DOC_TYPES.map(t => t.id));

export function classifyDocType(doc: Partial<ScannedDoc>): DocType {
  const hay = norm([doc.title, doc.provider, doc.notes, doc.period].filter(Boolean).join(' '));

  // Ισχυρές ενδείξεις από ειδικά πεδία (αν το AI γέμισε π.χ. monthly_rent → μισθωτήριο).
  if (doc.monthly_rent || doc.lease_start || doc.lease_end) return 'lease';
  if (doc.policy_number || doc.premium || doc.expiry_date) return 'insurance';
  if (doc.purchase_price || doc.obj_value || doc.atak) return 'deed';

  // Λέξεις-κλειδιά περιεχομένου (προτεραιότητα: ειδικά → γενικά).
  for (const { type, keys } of TYPE_KEYWORDS) {
    if (keys.some(k => hay.includes(k))) return type;
  }

  // Σεβασμός στην πρόταση του AI αν είναι έγκυρη ΚΑΙ συγκεκριμένη (όχι «other»,
  // που σημαίνει «δεν ξέρω» — τότε συνεχίζουμε στις ευρετικές παρακάτω).
  if (doc.doc_type && doc.doc_type !== 'other' && VALID_TYPES.has(doc.doc_type)) return doc.doc_type;

  // Αν μοιάζει με λογαριασμό (έχει κατηγορία παρόχου + ποσό), θεώρησέ το λογαριασμό.
  if (doc.category && doc.category !== 'other' && doc.amount) return 'bill';

  return 'other';
}

// ── 2) Επικύρωση: τι λείπει ανά τύπο ─────────────────────────────────────────
export const DOC_FIELD_LABELS: Record<string, string> = {
  provider: 'Πάροχος / Αντισυμβαλλόμενος', amount: 'Ποσό', due_date: 'Ημ. λήξης',
  tenant_name: 'Ονοματεπώνυμο ενοικιαστή', monthly_rent: 'Μηνιαίο ενοίκιο',
  lease_start: 'Έναρξη μίσθωσης', lease_end: 'Λήξη μίσθωσης', deposit: 'Εγγύηση',
  premium: 'Ασφάλιστρο', expiry_date: 'Λήξη ασφάλισης', policy_number: 'Αριθμός συμβολαίου',
  purchase_price: 'Τίμημα αγοράς', obj_value: 'Αντικειμενική αξία', title: 'Τίτλος',
  tax_year: 'Έτος', category: 'Κατηγορία',
};

const has = (v: unknown) => v != null && v !== '' && !(typeof v === 'number' && v === 0);

export function validateDoc(doc: ScannedDoc): { blocking: string[]; recommended: string[] } {
  const t = doc.doc_type;
  const blocking: string[] = [];
  const recommended: string[] = [];

  switch (t) {
    case 'bill':
    case 'payment':
      if (!has(doc.amount)) blocking.push('amount');
      if (!has(doc.provider)) recommended.push('provider');
      if (t === 'bill' && !has(doc.due_date)) recommended.push('due_date');
      break;
    case 'lease':
      if (!has(doc.tenant_name)) blocking.push('tenant_name');
      if (!has(doc.monthly_rent)) blocking.push('monthly_rent');
      if (!has(doc.lease_start)) recommended.push('lease_start');
      if (!has(doc.lease_end)) recommended.push('lease_end');
      if (!has(doc.deposit)) recommended.push('deposit');
      break;
    case 'insurance':
      if (!has(doc.provider)) blocking.push('provider');
      if (!has(doc.premium)) recommended.push('premium');
      if (!has(doc.expiry_date)) recommended.push('expiry_date');
      break;
    case 'deed':
      if (!has(doc.purchase_price) && !has(doc.obj_value)) recommended.push('purchase_price');
      break;
    case 'tax':
      if (!has(doc.amount)) recommended.push('amount');
      break;
    case 'government':
    case 'other':
      if (!has(doc.title) && !has(doc.provider)) recommended.push('title');
      break;
  }
  return { blocking, recommended };
}

// ── 3) Σχέδιο αποθήκευσης: πού γράφεται ──────────────────────────────────────
export interface SavePlan {
  targets: string[];                        // ετικέτες για την οθόνη «Αποθηκεύτηκε»
  bill?:     Record<string, unknown>;        // → bills (το component βάζει property_id/user_id)
  expense?:  Record<string, unknown>;        // → expenses (link bill_id αν υπάρχει)
  calendar?: Record<string, unknown>[];      // → calendar_events (link bill_id αν υπάρχει)
  tenant?:   Record<string, unknown>;        // → tenants (upsert ανά property)
  property?: Record<string, unknown>;        // → user_properties (ΜΟΝΟ ασφαλείς στήλες)
  settings?: Record<string, unknown>;        // → property_settings (π.χ. ασφάλεια — καρτέλα Ρυθμίσεις)
  archive?:  { category: string; note?: string; date?: string; supplier?: string }; // → property_documents (το αρχείο πρωτότυπο)
  reconcile?: boolean;                       // payment: προσπάθησε συμφωνία με εκκρεμή λογαριασμό
  commonMonthAmount?: number;                // κοινόχρηστα: ποσό μήνα για ιστορικό
  commonMillesimi?:   number;                // κοινόχρηστα: χιλιοστά
}

const iso = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '');

// Δομημένη σημείωση κατανάλωσης (ίδια λογική με BillsAIScan) για λογαριασμούς.
function consumptionNote(d: ScannedDoc): string {
  return [
    d.kwh ? `${d.kwh} kWh` : '',
    d.cubic_meters ? `${d.cubic_meters} m³` : '',
    (d.meter_prev != null && d.meter_current != null) ? `Ένδειξη ${d.meter_prev}→${d.meter_current}` : '',
    d.millesimi ? `${d.millesimi}‰` : '',
  ].filter(Boolean).join(' · ');
}

/**
 * Καθαρή δρομολόγηση: από ScannedDoc → SavePlan. Δεν αγγίζει βάση.
 * @param doc   τα (επεξεργασμένα από τον χρήστη) πεδία
 * @param today ISO ημερομηνία σήμερα (περνιέται για ντετερμινιστικά τεστ)
 */
export function planDocSave(doc: ScannedDoc, today: string): SavePlan {
  const t = doc.doc_type;
  const provider = (doc.provider || '').trim();
  const customNote = (doc.custom || []).filter(c => c.label && c.value)
    .map(c => `${c.label}: ${c.value}`).join(' · ');
  const baseNote = [doc.notes || '', customNote].filter(Boolean).join(' · ');
  // Ημερομηνία εγγράφου για το Αρχείο — η πιο σχετική ανά τύπο.
  const archiveDate = iso(doc.issue_date) || iso(doc.due_date) || iso(doc.purchase_date)
    || iso(doc.lease_start) || iso(doc.expiry_date) || '';
  // Κάθε σαρωμένο έγγραφο αρχειοθετείται πάντα (το πρωτότυπο) στο σωστό tab.
  // Πάροχος/αντισυμβαλλόμενος → ώστε το Αρχείο να ομαδοποιεί το σαρωμένο έγγραφο «ανά πάροχο».
  const archive = { category: DOC_ARCHIVE_CATEGORY[t], date: archiveDate || undefined, supplier: provider || undefined };

  if (t === 'bill' || t === 'payment') {
    const cat = doc.category && EXPENSE_MAP[doc.category] ? doc.category : 'other';
    const map = EXPENSE_MAP[cat];
    const paid = t === 'payment';
    const cons = consumptionNote(doc);
    const notes = [`AI σάρωση`, cons, baseNote, doc.account_num ? `Παροχή: ${doc.account_num}` : '']
      .filter(Boolean).join(' · ');
    const expDate = iso(doc.due_date) || iso(doc.issue_date) || today;

    const plan: SavePlan = {
      targets: paid ? ['Δαπάνες', 'Λογαριασμοί'] : ['Λογαριασμοί', 'Δαπάνες'],
      bill: {
        category: cat,
        name: `${provider || map.cat}${doc.period ? ` — ${doc.period}` : ''}`,
        amount: doc.amount || 0, paid, due_date: iso(doc.due_date) || null,
        kwh: doc.kwh || null, ert: doc.ert || null, etmear: doc.etmear || null,
        dimotika: doc.dimotika || null, vat_rate: String(doc.vat_rate || 6),
        notes, recurring: false,
      },
      expense: {
        description: `${map.cat} — ${provider}${doc.period ? ` (${doc.period})` : ''}`,
        amount: doc.amount || 0, category: map.cat, expense_group: map.group,
        date: expDate, paid_by: 'owner', paid,
        notes: `Από σάρωση${cons ? ` · ${cons}` : ''}${baseNote ? ` · ${baseNote}` : ''}`,
      },
      archive,
      reconcile: paid,
    };
    // Υπενθύμιση πληρωμής μόνο για απλήρωτους λογαριασμούς με ημ. λήξης.
    if (!paid && iso(doc.due_date)) {
      plan.calendar = [{
        title: `Πληρωμή: ${provider || map.cat}`, category: 'bills',
        event_date: iso(doc.due_date), amount: doc.amount || 0,
        priority: 'medium', status: 'pending', recurring: false,
        notes: `Από σάρωση${cons ? ` · ${cons}` : ''}`, source: 'scan',
      }];
      plan.targets.push('Ημερολόγιο');
    }
    if (cat === 'common') {
      if (doc.amount) plan.commonMonthAmount = doc.amount;
      if (doc.millesimi) plan.commonMillesimi = doc.millesimi;
      plan.targets.push('Κοινόχρηστα');
    }
    return plan;
  }

  if (t === 'lease') {
    return {
      targets: ['Ενοικιαστής', 'Αρχείο'],
      tenant: {
        full_name: (doc.tenant_name || '').trim(),
        monthly_rent: doc.monthly_rent || null,
        lease_start: iso(doc.lease_start) || null,
        lease_end: iso(doc.lease_end) || null,
        deposit_amount: doc.deposit || null,
        afm: (doc.afm || '').trim() || null,
        notes: baseNote || null,
      },
      archive,
    };
  }

  if (t === 'insurance') {
    // Η ασφάλεια αποθηκεύεται στο property_settings (καρτέλα Ρυθμίσεις — εκεί που
    // ο χρήστης βλέπει τα στοιχεία ασφάλισης). Δεν υπάρχει στήλη ποσού εκεί, γι'
    // αυτό το ασφάλιστρο καταγράφεται ως έξοδο (Ασφάλεια Κτιρίου).
    const coverageNote = doc.coverage ? `Κάλυψη: ${doc.coverage.toLocaleString('el-GR')} €` : '';
    const insNote = [coverageNote, baseNote].filter(Boolean).join(' · ');
    const plan: SavePlan = {
      targets: ['Ασφάλεια', 'Αρχείο'],
      settings: {
        insurance_company: provider || null,
        insurance_policy: (doc.policy_number || '').trim() || null,
        insurance_expiry: iso(doc.expiry_date) || null,
      },
      archive: { ...archive, note: insNote || undefined },
    };
    if (doc.premium) {
      const map = EXPENSE_MAP.insurance;
      plan.expense = {
        description: `${map.cat}${provider ? ` — ${provider}` : ''}${doc.policy_number ? ` (Αρ. ${doc.policy_number})` : ''}`,
        amount: doc.premium, category: map.cat, expense_group: map.group,
        date: iso(doc.issue_date) || today, paid_by: 'owner', paid: false,
        notes: [`Από σάρωση ασφαλιστηρίου`, insNote].filter(Boolean).join(' · '),
      };
      plan.targets.push('Δαπάνες');
    }
    // Υπενθύμιση ανανέωσης πριν τη λήξη.
    if (iso(doc.expiry_date)) {
      plan.calendar = [{
        title: `Λήξη ασφάλισης: ${provider || 'ακίνητο'}`, category: 'insurance',
        event_date: iso(doc.expiry_date), amount: doc.premium || null,
        priority: 'high', status: 'pending', recurring: false,
        notes: [`Ανανέωση ασφαλιστηρίου`, doc.policy_number ? `Αρ. ${doc.policy_number}` : '', baseNote].filter(Boolean).join(' · '),
        source: 'scan',
      }];
      plan.targets.push('Ημερολόγιο');
    }
    return plan;
  }

  if (t === 'deed') {
    // Ενημερώνουμε ΜΟΝΟ ασφαλείς στήλες του user_properties (αυτές που γράφει και ο
    // οδηγός προσθήκης). Τα υπόλοιπα (ΑΤΑΚ, αντικειμενική, ημ. αγοράς) κρατιούνται
    // στη σημείωση του αρχειοθετημένου εγγράφου ώστε να μη χαθούν και να τα δει/
    // επεξεργαστεί ο χρήστης — χωρίς ρίσκο σφάλματος σε ανύπαρκτη στήλη.
    const property: Record<string, unknown> = {};
    if (doc.purchase_price) property.purchase_price = doc.purchase_price;
    if (doc.year_built) property.year_built = doc.year_built;
    if (doc.sqm) property.sqm = doc.sqm;
    const extras = [
      provider ? `Συμβολαιογράφος/Πηγή: ${provider}` : '',
      doc.atak ? `ΑΤΑΚ: ${doc.atak}` : '',
      doc.obj_value ? `Αντικειμενική: ${doc.obj_value.toLocaleString('el-GR')} €` : '',
      iso(doc.purchase_date) ? `Ημ. αγοράς: ${iso(doc.purchase_date)}` : '',
      baseNote,
    ].filter(Boolean).join(' · ');
    const plan: SavePlan = { targets: ['Αρχείο'], archive: { ...archive, note: extras || undefined } };
    if (Object.keys(property).length) { plan.property = property; plan.targets.unshift('Στοιχεία ακινήτου'); }
    return plan;
  }

  if (t === 'tax') {
    // Δεν υπάρχει στήλη ΕΝΦΙΑ στο ακίνητο: το ποσό γίνεται έξοδο + υπενθύμιση.
    const plan: SavePlan = { targets: ['Αρχείο'], archive: { ...archive, note: baseNote || undefined } };
    if (doc.amount) {
      const map = EXPENSE_MAP.taxes;
      plan.expense = {
        description: `${map.cat}${doc.tax_year ? ` ${doc.tax_year}` : ''}${provider ? ` — ${provider}` : ''}`,
        amount: doc.amount, category: map.cat, expense_group: map.group,
        date: iso(doc.due_date) || iso(doc.issue_date) || today, paid_by: 'owner', paid: false,
        notes: [`Από σάρωση φορολογικού`, baseNote].filter(Boolean).join(' · '),
      };
      plan.targets.unshift('Δαπάνες');
      if (iso(doc.due_date)) {
        plan.calendar = [{
          title: `Πληρωμή ${map.cat}${doc.tax_year ? ` ${doc.tax_year}` : ''}`, category: 'tax',
          event_date: iso(doc.due_date), amount: doc.amount,
          priority: 'high', status: 'pending', recurring: false,
          notes: `Από σάρωση φορολογικού εγγράφου`, source: 'scan',
        }];
        plan.targets.push('Ημερολόγιο');
      }
    }
    return plan;
  }

  // government / other → μόνο αρχειοθέτηση (με ό,τι σημείωσε το AI/ο χρήστης).
  return { targets: ['Αρχείο'], archive: { ...archive, note: baseNote || undefined } };
}

// Σύντομη περίληψη για την οθόνη επιβεβαίωσης.
export function docSummaryLine(doc: ScannedDoc): string {
  const parts: string[] = [];
  if (doc.provider) parts.push(doc.provider);
  else if (doc.tenant_name) parts.push(doc.tenant_name);
  else if (doc.title) parts.push(doc.title);
  if (doc.amount) parts.push(`${doc.amount.toLocaleString('el-GR')} €`);
  else if (doc.monthly_rent) parts.push(`${doc.monthly_rent.toLocaleString('el-GR')} €/μήνα`);
  else if (doc.premium) parts.push(`${doc.premium.toLocaleString('el-GR')} €`);
  return parts.join(' — ') || DOC_TYPE_LABELS[doc.doc_type];
}
