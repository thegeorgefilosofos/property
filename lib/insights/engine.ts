// ═══════════════════════════════════════════════════════════════════════════
// Μηχανή έξυπνων insights — ο «σύμβουλος» του PROPERWISE.
// Διαβάζει τα δεδομένα ενός ακινήτου και βγάζει προτεραιοποιημένα, ανθρώπινα,
// ΕΝΕΡΓΗΣΙΜΑ μηνύματα στα ελληνικά — χωρίς συντομογραφίες, με εξήγηση όρων.
//
// Καθαρή & δοκιμασμένη (δες engine.test.ts). Καμία εξάρτηση από React/DB:
// δέχεται ένα input και επιστρέφει insights. Το `now` περνάει ρητά (ντετερμινισμός).
// ═══════════════════════════════════════════════════════════════════════════

import { vocative } from '../greekName';
import { fp, fe } from '../core/format';
import { navLabel } from '../nav/labels';
import { athensParts, daysUntil as athensDaysUntil } from '../core/time';

export type InsightKind = 'urgent' | 'attention' | 'opportunity' | 'positive';

export interface Insight {
  id: string;
  kind: InsightKind;
  title: string;
  detail: string;
  /** Προαιρετική ενέργεια: μετάβαση σε καρτέλα. */
  action?: { label: string; tab: string };
  /** Προαιρετική μετρική για εμφάνιση δεξιά (π.χ. «1.240 €»). */
  metric?: string;
}

export interface InsightInput {
  now: number; // ms
  property: {
    name?: string | null;
    prop_type?: string | null;
    status_detail?: string | null;
    value?: number | null;
    obj_value?: number | null;
    sqm?: number | null;
    address?: string | null;
    postal_code?: string | null;
    insurance_expiry?: string | null;
    insurance_amount?: number | null;
    target_rent?: number | null;
  };
  tenant?: { monthly_rent?: number | null; lease_end?: string | null } | null;
  rent: number;             // μηνιαίο ενοίκιο (resolved)
  propValue: number;        // αξία (resolved)
  grossYield: number;       // μεικτή απόδοση %
  netYield: number;         // καθαρή απόδοση %
  expensesYTD: number;
  // `paid` δέχεται και `null`: η στήλη είναι nullable και το PostgREST το
  // επιστρέφει αυτούσιο. Ο τύπος που το απαγόρευε ανάγκαζε κάθε καλούντα σε
  // `as any` — δηλαδή έσβηνε τον έλεγχο ΟΛΟΥ του αντικειμένου για ένα πεδίο.
  expenses: { category?: string; amount: number; date?: string; paid?: boolean | null; expense_group?: string | null; payment_method?: string | null }[];
  bills: { type?: string; amount?: number | null; paid?: boolean | null; due_date?: string | null }[];
  tasks: { due_date?: string | null }[];
  checklist: { due_date?: string | null; status?: string; priority?: string }[];
  inventory: { warranty_expiry?: string | null; condition?: string | null; name?: string | null }[];
  loanPayment?: number;
}

// Ο ΜΟΡΦΟΠΟΙΗΤΗΣ ΕΥΡΩ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ. Αυτός εδώ στρογγυλοποιούσε στο ακέραιο
// («1.200 €» αντί για «1.200,00 €»), δηλαδή παραβίαζε τον κανόνα των δύο
// δεκαδικών σε κάθε πρόταση που παρήγαγε. Ο κανονικός ζει στο lib/core/format.ts
// και δεν εξαρτάται από React, ακριβώς ώστε να τον βλέπουν και οι βιβλιοθήκες.
const eur = fe;
// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΠΡΟΘΕΣΜΙΕΣ ΜΕΤΡΙΟΥΝΤΑΙ ΣΕ ΕΛΛΗΝΙΚΗ ΗΜΕΡΑ, ΟΧΙ ΣΤΗΝ ΩΡΑ ΤΟΥ ΜΗΧΑΝΗΜΑΤΟΣ.
// ─────────────────────────────────────────────────────────────────────────
// Εδώ ζούσε ανεξάρτητη υλοποίηση: `new Date(d + 'T00:00:00')` κατασκευάζει
// μεσάνυχτα στην ΤΟΠΙΚΗ ζώνη — του περιηγητή του χρήστη ή του διακομιστή — και
// συγκρινόταν με τα χιλιοστά του `now`. Δηλαδή η λίστα «τι χρειάζεται τώρα»
// μετρούσε άλλες ημέρες για ιδιοκτήτη που ανοίγει την εφαρμογή απο άλλη ζώνη,
// και άλλες στον διακομιστή (UTC) απο ό,τι στην Αθήνα.
//
// Δεν είναι λεπτομέρεια: ολόκληρη αυτή η οθόνη κρίνεται σε «ληξιπρόθεσμο ή
// όχι». Μια μέρα διαφορά αλλάζει το χρώμα, τη σειρά και το αν εμφανίζεται.
//
// Το `lib/core/time` κάνει ήδη τη σωστή μέτρηση, με το ίδιο ακριβώς όνομα.
// Και ο φύλακας greek-time δεν το έπιανε, γιατί το ρητό `T00:00:00` είναι
// νόμιμο ΟΤΑΝ διαβάζεις με τοπικούς getters — όχι όταν αφαιρείς χιλιοστά.
// ═══════════════════════════════════════════════════════════════════════════
const daysUntil = (d: string | null | undefined, now: number): number | null =>
  d ? athensDaysUntil(d, new Date(now)) : null;

// Μετρητά (δεν μετρούν για την έκπτωση φόρου / «χτίσιμο» αποδείξεων).
const CASH = new Set(['cash', 'cash_black']);

const KIND_ORDER: Record<InsightKind, number> = { urgent: 0, attention: 1, opportunity: 2, positive: 3 };

export function computeInsights(input: InsightInput): Insight[] {
  const { now, property: p, tenant, rent, propValue, grossYield, netYield, expensesYTD, expenses, bills, tasks, checklist, inventory, loanPayment = 0 } = input;
  const out: Insight[] = [];

  // Είναι το ακίνητο βραχυχρόνιας μίσθωσης (Airbnb/τουριστικό); Το «κενό» και τα
  // «insights» έχουν διαφορετικό νόημα από τη μακροχρόνια (ανά διανυκτέρωση/εποχή).
  const shortTerm = /villa|βίλα|rooms|δωμάτ|studio|εξοχ|airbnb|βραχυ/i.test(String(p.prop_type || '')) ||
    ['seasonal', 'short_term', 'shortterm', 'airbnb', 'βραχυχρόνια'].includes(String(p.status_detail || '').toLowerCase());

  // ── 1. Ασφάλεια ακινήτου ──────────────────────────────────────────────────
  const insD = daysUntil(p.insurance_expiry, now);
  if (insD !== null) {
    if (insD < 0) out.push({ id: 'insurance-expired', kind: 'urgent', title: 'Η ασφάλεια του ακινήτου έχει λήξει', detail: `Έληξε πριν ${Math.abs(insD)} ${Math.abs(insD) === 1 ? 'ημέρα' : 'ημέρες'}. Ανανέωσέ το: καλύπτει πυρκαγιά, σεισμό και ζημιές.`, action: { label: navLabel('finances'), tab: 'finances' } });
    else if (insD <= 45) out.push({ id: 'insurance-soon', kind: 'attention', title: 'Λήγει σύντομα η ασφάλεια', detail: `Σε ${insD} ${insD === 1 ? 'ημέρα' : 'ημέρες'}. Ανανέωσέ την έγκαιρα για να μη μείνει το ακίνητο ακάλυπτο.`, action: { label: navLabel('finances'), tab: 'finances' } });
  }

  // ── 2. Λήξη μίσθωσης ───────────────────────────────────────────────────────
  const leaseD = daysUntil(tenant?.lease_end, now);
  if (leaseD !== null) {
    if (leaseD < 0) out.push({ id: 'lease-expired', kind: 'urgent', title: 'Έχει λήξει η σύμβαση ενοικίασης', detail: `Έληξε πριν ${Math.abs(leaseD)} ${Math.abs(leaseD) === 1 ? 'ημέρα' : 'ημέρες'}. Ανανέωσε ή σύναψε νέο μισθωτήριο.`, action: { label: navLabel('tenant'), tab: 'tenant' } });
    else if (leaseD <= 60) out.push({ id: 'lease-soon', kind: 'attention', title: 'Πλησιάζει η λήξη της μίσθωσης', detail: `Σε ${leaseD} ${leaseD === 1 ? 'ημέρα' : 'ημέρες'}. Καλή στιγμή να συζητήσεις ανανέωση ή αναπροσαρμογή ενοικίου με τον ενοικιαστή.`, action: { label: navLabel('tenant'), tab: 'tenant' } });
  }

  // ── 3. Λογαριασμοί: ληξιπρόθεσμοι / εκκρεμείς ─────────────────────────────
  const unpaid = bills.filter(b => !b.paid);
  const overdue = unpaid.filter(b => { const x = daysUntil(b.due_date, now); return x !== null && x < 0; });
  const overdueTotal = overdue.reduce((s, b) => s + (b.amount || 0), 0);
  if (overdue.length) out.push({ id: 'bills-overdue', kind: 'urgent', title: `${overdue.length} ${overdue.length === 1 ? 'ληξιπρόθεσμος λογαριασμός' : 'ληξιπρόθεσμοι λογαριασμοί'}`, detail: 'Έχει περάσει η ημερομηνία πληρωμής. Εξόφλησέ τους για να αποφύγεις προσαυξήσεις ή διακοπή παροχής.', metric: overdueTotal > 0 ? eur(overdueTotal) : undefined, action: { label: navLabel('finances'), tab: 'finances' } });
  else if (unpaid.length) out.push({ id: 'bills-unpaid', kind: 'attention', title: `${unpaid.length} ${unpaid.length === 1 ? 'εκκρεμής λογαριασμός' : 'εκκρεμείς λογαριασμοί'}`, detail: 'Αναμένουν πληρωμή. Τακτοποίησέ τους όσο υπάρχει χρόνος.', action: { label: navLabel('finances'), tab: 'finances' } });

  // ── 4. Συντήρηση & Checklist εκπρόθεσμα ──────────────────────────────────
  const tasksOverdue = tasks.filter(t => { const x = daysUntil(t.due_date, now); return x !== null && x < 0; });
  const chkOverdue = checklist.filter(c => { const x = daysUntil(c.due_date, now); return x !== null && x < 0; });
  if (tasksOverdue.length) out.push({ id: 'tasks-overdue', kind: 'attention', title: `${tasksOverdue.length} ${tasksOverdue.length === 1 ? 'εργασία συντήρησης' : 'εργασίες συντήρησης'} σε καθυστέρηση`, detail: 'Η έγκαιρη συντήρηση κοστίζει πολύ λιγότερο από μια βλάβη. Δες τι εκκρεμεί.', action: { label: navLabel('calendar'), tab: 'calendar' } });
  if (chkOverdue.length) out.push({ id: 'chk-overdue', kind: 'attention', title: `${chkOverdue.length} εκπρόθεσμα στη λίστα υποχρεώσεων`, detail: 'Υπάρχουν στοιχεία που πέρασε η προθεσμία τους.', action: { label: navLabel('checklist'), tab: 'checklist' } });

  // ── 5. Εγγυήσεις που λήγουν (ευκαιρία να προλάβεις δωρεάν επισκευή) ───────
  const warrantySoon = inventory.filter(i => { const x = daysUntil(i.warranty_expiry, now); return x !== null && x >= 0 && x <= 60; });
  if (warrantySoon.length) {
    const first = warrantySoon[0];
    const d = daysUntil(first.warranty_expiry, now);
    out.push({ id: 'warranty-soon', kind: 'opportunity', title: warrantySoon.length === 1 ? 'Λήγει η εγγύηση μιας συσκευής' : `Λήγουν ${warrantySoon.length} εγγυήσεις`, detail: `${first.name ? `«${first.name}»: ` : ''}μένουν ${d} ${d === 1 ? 'ημέρα' : 'ημέρες'} εγγύηση. Αν κάτι δεν πάει καλά, τώρα η επισκευή είναι δωρεάν.`, action: { label: navLabel('inventory'), tab: 'inventory' } });
  }

  // ── 6. Κενό ακίνητο = χαμένο εισόδημα ─────────────────────────────────────
  const isVacant = (p.status_detail === 'vacant') && !tenant;
  if (isVacant && rent > 0 && !shortTerm) {
    // Ο ΠΡΟΟΡΙΣΜΟΣ ΗΤΑΝ ΕΓΓΥΗΜΕΝΑ ΝΕΚΡΟΣ. Έδειχνε στις «Αποδόσεις», που
    // φαίνονται ΜΟΝΟ σε εκμισθωμένο ακίνητο — ενώ αυτή η παρατήρηση εμφανίζεται
    // ΜΟΝΟ σε κενό. Οι δύο συνθήκες αποκλείονται μεταξύ τους, άρα το κουμπί δεν
    // οδήγησε ποτέ πουθενά. Η «Αξιοποίηση» είναι κυριολεκτικά η καρτέλα που
    // απαντά «τι να το κάνω;» και φαίνεται ακριβώς στο κενό ακίνητο.
    out.push({ id: 'vacant', kind: 'opportunity', title: 'Το ακίνητο είναι κενό', detail: `Κάθε μήνας χωρίς ενοικιαστή είναι περίπου ${eur(rent)} χαμένο εισόδημα. Αν ψάχνεις, δες πρώτα τι ενοίκιο πιάνει η περιοχή σου.`, metric: `${eur(rent)}/μήνα`, action: { label: navLabel('plan'), tab: 'plan' } });
  } else if (isVacant && shortTerm) {
    // Βραχυχρόνια: το «κενό» ανάμεσα σε κρατήσεις είναι φυσιολογικό. Εστίασε σε πληρότητα/τιμολόγηση.
    out.push({ id: 'vacant-st', kind: 'opportunity', title: 'Ελεύθερες ημερομηνίες', detail: 'Το κενό ανάμεσα σε κρατήσεις είναι φυσιολογικό. Πριν από την υψηλή σεζόν δες τιμή, φωτογραφίες και αξιολογήσεις.', action: { label: navLabel('roi'), tab: 'roi' } });
  }

  // ── 7. Έκπτωση φόρου: πλήρωνε ηλεκτρονικά ─────────────────────────────────
  if (expensesYTD > 0 && expenses.length >= 3) {
    const withMethod = expenses.filter(e => e.payment_method);
    const cashTotal = withMethod.filter(e => e.payment_method && CASH.has(e.payment_method)).reduce((s, e) => s + e.amount, 0);
    const cashShare = expensesYTD > 0 ? cashTotal / expensesYTD : 0;
    if (withMethod.length >= 3 && cashShare > 0.35) {
      out.push({ id: 'tax-electronic', kind: 'opportunity', title: 'Πλήρωνε ηλεκτρονικά και γλίτωσε φόρο', detail: `Το ${Math.round(cashShare * 100)}% των δαπανών σου είναι με μετρητά. Μόνο οι ηλεκτρονικές μετρούν για την έκπτωση φόρου.`, action: { label: navLabel('finances'), tab: 'finances' } });
    }
  }

  // ── 8. Ρεύμα: μεγάλο κόστος → σκέψου αλλαγή παρόχου ───────────────────────
  const energyBills = bills.filter(b => (b.type || '').toLowerCase().includes('electric') || b.type === 'electricity' || b.type === 'ρεύμα');
  const energyTotal = energyBills.reduce((s, b) => s + (b.amount || 0), 0);
  if (energyTotal > 0 && expensesYTD > 0 && energyTotal / Math.max(expensesYTD, energyTotal) > 0.25) {
    out.push({ id: 'energy-review', kind: 'opportunity', title: 'Το ρεύμα «τρώει» μεγάλο μέρος των εξόδων', detail: 'Οι τιμές ρεύματος αλλάζουν συχνά. Μια σύγκριση παρόχων γλιτώνει αρκετά, ειδικά στους άδειους μήνες.', metric: eur(energyTotal), action: { label: navLabel('finances'), tab: 'finances' } });
  }

  // ── 9. Πλαίσιο απόδοσης ───────────────────────────────────────────────────
  // ΚΑΜΙΑ ΣΥΓΚΡΙΣΗ ΜΕ ΤΗΝ ΑΓΟΡΑ ΕΔΩ. Έλεγε «πάνω από τον μέσο όρο της αγοράς» και
  // «μια τυπική απόδοση χρηματιστηρίου είναι γύρω στο 7%» — δύο ισχυρισμοί χωρίς
  // πηγή, τη στιγμή που η καρτέλα Αποδόσεις κάνει την ίδια σύγκριση με μετρημένα
  // στοιχεία και αναγραφόμενες πηγές (lib/market/greekMarket.ts: BENCHMARKS,
  // MARKET_SOURCES, BENCHMARKS_ASOF). Δύο απαντήσεις για το ίδιο ερώτημα, η μία
  // ατεκμηρίωτη, είναι χειρότερο από μία. Εδώ μένει το δικό σου νούμερο και η
  // ενέργεια που οδηγεί στη σύγκριση με τις πηγές.
  const YIELD_STRONG_PCT = 5;   // κατώφλι ΕΜΦΑΝΙΣΗΣ, όχι ισχυρισμός για την αγορά
  const YIELD_LOW_PCT = 3;
  if (netYield > 0 && propValue > 0) {
    if (netYield >= YIELD_STRONG_PCT) out.push({ id: 'yield-strong', kind: 'positive', title: 'Δυνατή απόδοση', detail: `Με όσα έχεις καταχωρήσει, το ακίνητο αποδίδει καθαρά ${fp(netYield)} τον χρόνο. Η σύγκριση με την περιοχή είναι στις Αποδόσεις.`, metric: `${fp(netYield)}`, action: { label: navLabel('roi'), tab: 'roi' } });
    else if (netYield < YIELD_LOW_PCT) out.push({ id: 'yield-low', kind: 'opportunity', title: 'Υπάρχει περιθώριο στην απόδοση', detail: `Η καθαρή απόδοση είναι ${fp(netYield)}. Δες στις Αποδόσεις τι πιάνει η περιοχή σου και ποιες δαπάνες τη μειώνουν.`, metric: `${fp(netYield)}`, action: { label: navLabel('roi'), tab: 'roi' } });
  }

  // ── 9β. ΤΟ ΔΑΝΕΙΟ, ΠΟΥ Ο ΣΥΜΒΟΥΛΟΣ ΔΕΝ ΕΒΛΕΠΕ ────────────────────────────
  //
  // Το `loanPayment` δηλωνόταν στο input, αποδομούνταν εδώ και ΔΕΝ διαβαζόταν
  // από καμία γραμμή· ο πίνακας μάλιστα του περνούσε σταθερά μηδέν. Δηλαδή ο
  // «σύμβουλος» μιλούσε για απόδοση και για δαπάνες σε έναν ιδιοκτήτη που
  // πληρώνει δόση, χωρίς να την έχει δει ποτέ.
  //
  // ΓΙΑΤΙ ΑΥΤΟ ΤΟ ΝΟΥΜΕΡΟ ΚΑΙ ΟΧΙ Η ΑΠΟΔΟΣΗ. Η καθαρή απόδοση δεν αφαιρεί τη
  // δόση επίτηδες: μετρά το ΑΚΙΝΗΤΟ, όχι τον τρόπο χρηματοδότησής του. Το
  // ταμείο όμως το γεμίζει ο ίδιος άνθρωπος. Ενοίκιο 600,00 € με δόση 520,00 €
  // και δαπάνες 150,00 € τον μήνα βγάζει καθαρή απόδοση που φαίνεται μια χαρά
  // και ταμείο μείον 70,00 € κάθε μήνα.
  //
  // ΜΟΝΟ ΜΕ ΠΡΑΓΜΑΤΙΚΑ ΣΤΟΙΧΕΙΑ. Χωρίς ενοίκιο ή χωρίς δόση δεν υπάρχει
  // σύγκριση και ένα «μείον» βγαλμένο από κενά πεδία θα ήταν τρομακτικό και
  // ψεύτικο. Οι δαπάνες μπαίνουν ως μηνιαίος μέσος όρος του τρέχοντος έτους,
  // και το λέει η ίδια η πρόταση.
  if (loanPayment > 0 && rent > 0) {
    // ΕΛΛΗΝΙΚΟΣ ΜΗΝΑΣ, ΟΧΙ ΜΗΝΑΣ ΤΟΥ ΠΕΡΙΗΓΗΤΗ. Το `getMonth()` απαντά σε ΤΟΠΙΚΗ
    // ώρα: ιδιοκτήτης που ανοίγει την εφαρμογή από την Αμερική την 1η Ιανουαρίου
    // θα έπαιρνε Δεκέμβριο, άρα διαιρέτη 12 αντί για 1 — και ο «μηνιαίος μέσος
    // όρος δαπανών» θα έβγαινε δωδέκατο του πραγματικού.
    const monthsSoFar = athensParts(new Date(now)).month;
    const monthlyExpenses = expensesYTD > 0 ? expensesYTD / monthsSoFar : 0;
    const cash = rent - loanPayment - monthlyExpenses;
    if (cash < 0) out.push({
      id: 'loan-cash-negative', kind: 'attention',
      title: 'Η δόση ξεπερνά όσα αφήνει το ακίνητο',
      detail: `Με ενοίκιο ${eur(rent)} και δόση ${eur(loanPayment)}, μετά τις δαπάνες μένουν ${eur(cash)} τον μήνα. Οι δαπάνες είναι ο φετινός μηνιαίος μέσος όρος.`,
      metric: `${eur(cash)}/μήνα`, action: { label: navLabel('loan'), tab: 'loan' },
    });
    else out.push({
      id: 'loan-cash-positive', kind: 'positive',
      title: 'Το ενοίκιο καλύπτει τη δόση',
      detail: `Μετά τη δόση ${eur(loanPayment)} και τις δαπάνες μένουν ${eur(cash)} τον μήνα, με βάση τον φετινό μέσο όρο.`,
      metric: `${eur(cash)}/μήνα`, action: { label: navLabel('loan'), tab: 'loan' },
    });
  }

  // ── 10. Έλλειψη στοιχείων → ανακριβή νούμερα ──────────────────────────────
  const missing: string[] = [];
  if (!p.value && !p.obj_value) missing.push('την αξία');
  if (!p.sqm) missing.push('το εμβαδόν');
  if (!p.postal_code) missing.push('τον ταχυδρομικό κώδικα');
  if (missing.length) {
    const list = missing.length === 1 ? missing[0] : missing.slice(0, -1).join(', ') + ' και ' + missing[missing.length - 1];
    // Ίδιος λόγος με το βήμα «Συμπλήρωσε αξία & ενοίκιο»: τα πεδία δεν ζουν στον
  // «Λογαριασμό» αλλά στην επεξεργασία στοιχείων του ακινήτου.
  out.push({ id: 'profile-incomplete', kind: 'attention', title: 'Λείπουν στοιχεία του ακινήτου', detail: `Συμπλήρωσε ${list} για να βγαίνουν σωστά οι αποδόσεις και οι συγκρίσεις. Παίρνει ένα λεπτό.`, action: { label: 'Άνοιγμα', tab: 'edit' } });
  }

  // ── 11. Καμία πρόσφατη κίνηση → υπενθύμιση σάρωσης ───────────────────────
  // Ημέρες από την πιο πρόσφατη καταχώρηση. Αν υπάρχουν δαπάνες αλλά καμία με
  // ημερομηνία, ΔΕΝ βγάζουμε Infinity (θα έγραφε «Πάνω από Infinity ημέρες»).
  const daysAgo = expenses
    .map(e => daysUntil(e.date, now))
    .filter((x): x is number => x !== null)
    .map(x => -x);
  const lastExpenseDays = daysAgo.length ? Math.min(...daysAgo) : null;
  if (expenses.length === 0) {
    out.push({ id: 'no-expenses', kind: 'opportunity', title: 'Ξεκίνα με μία φωτογραφία', detail: 'Βγάλε φωτογραφία έναν λογαριασμό ή μια απόδειξη και μπαίνει μόνη της στη σωστή κατηγορία.', action: { label: 'Σάρωση', tab: 'scan' } });
  } else if (lastExpenseDays !== null && lastExpenseDays > 45) {
    out.push({ id: 'stale', kind: 'attention', title: 'Έχεις καιρό να καταχωρήσεις κάτι', detail: `Πάνω από ${lastExpenseDays} ημέρες χωρίς νέα καταχώρηση. Μια γρήγορη φωτογραφία κρατά την εικόνα ενημερωμένη.`, action: { label: 'Σάρωση', tab: 'scan' } });
  }

  // Ταξινόμηση κατά προτεραιότητα, σταθερή για ίδιο input.
  out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return out;
}

/** Επιστρέφει έναν φιλικό χαιρετισμό ανάλογα με την ώρα. */
export function greeting(now: number, name?: string | null): string {
  // Ώρα Ελλάδας (Europe/Athens), ανεξάρτητα από τη ζώνη του browser.
  let h: number;
  try {
    h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hour12: false }).format(new Date(now))) % 24;
  } catch {
    h = new Date(now).getHours();
  }
  // Δύο χαιρετισμοί: Καλημέρα έως τις 12μμ, Καλησπέρα από τις 12μμ έως τα μεσάνυχτα.
  const part = h < 12 ? 'Καλημέρα' : 'Καλησπέρα';
  const who = name && name.trim() ? `, ${vocative(name)}` : '';
  return `${part}${who}`;
}
