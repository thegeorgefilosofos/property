// ═══════════════════════════════════════════════════════════════════════════
// Μηχανή έξυπνων insights — ο «σύμβουλος» του Property OS.
// Διαβάζει τα δεδομένα ενός ακινήτου και βγάζει προτεραιοποιημένα, ανθρώπινα,
// ΕΝΕΡΓΗΣΙΜΑ μηνύματα στα ελληνικά — χωρίς συντομογραφίες, με εξήγηση όρων.
//
// Καθαρή & δοκιμασμένη (δες engine.test.ts). Καμία εξάρτηση από React/DB:
// δέχεται ένα input και επιστρέφει insights. Το `now` περνάει ρητά (ντετερμινισμός).
// ═══════════════════════════════════════════════════════════════════════════

import { vocative } from '../greekName';

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

const DAY = 86400000;
const eur = (n: number) => `${Math.round(n).toLocaleString('el-GR')} €`;
const daysUntil = (d: string | null | undefined, now: number): number | null =>
  d ? Math.ceil((new Date(d + (d.length <= 10 ? 'T00:00:00' : '')).getTime() - now) / DAY) : null;

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
    if (insD < 0) out.push({ id: 'insurance-expired', kind: 'urgent', title: 'Η ασφάλεια του ακινήτου έχει λήξει', detail: `Έληξε πριν ${Math.abs(insD)} ${Math.abs(insD) === 1 ? 'ημέρα' : 'ημέρες'}. Ένα ασφάλιστρο σε καλύπτει από πυρκαγιά, σεισμό και ζημιές. Ανανέωσέ το άμεσα.`, action: { label: 'Ασφάλεια', tab: 'finances' } });
    else if (insD <= 45) out.push({ id: 'insurance-soon', kind: 'attention', title: 'Λήγει σύντομα η ασφάλεια', detail: `Σε ${insD} ${insD === 1 ? 'ημέρα' : 'ημέρες'}. Ανανέωσέ την έγκαιρα για να μη μείνει το ακίνητο ακάλυπτο.`, action: { label: 'Ασφάλεια', tab: 'finances' } });
  }

  // ── 2. Λήξη μίσθωσης ───────────────────────────────────────────────────────
  const leaseD = daysUntil(tenant?.lease_end, now);
  if (leaseD !== null) {
    if (leaseD < 0) out.push({ id: 'lease-expired', kind: 'urgent', title: 'Έχει λήξει η σύμβαση ενοικίασης', detail: `Έληξε πριν ${Math.abs(leaseD)} ${Math.abs(leaseD) === 1 ? 'ημέρα' : 'ημέρες'}. Ανανέωσε ή σύναψε νέο μισθωτήριο για να είσαι καλυμμένος.`, action: { label: 'Ενοικιαστής', tab: 'tenant' } });
    else if (leaseD <= 60) out.push({ id: 'lease-soon', kind: 'attention', title: 'Πλησιάζει η λήξη της μίσθωσης', detail: `Σε ${leaseD} ${leaseD === 1 ? 'ημέρα' : 'ημέρες'}. Καλή στιγμή να συζητήσεις ανανέωση ή αναπροσαρμογή ενοικίου με τον ενοικιαστή.`, action: { label: 'Ενοικιαστής', tab: 'tenant' } });
  }

  // ── 3. Λογαριασμοί: ληξιπρόθεσμοι / εκκρεμείς ─────────────────────────────
  const unpaid = bills.filter(b => !b.paid);
  const overdue = unpaid.filter(b => { const x = daysUntil(b.due_date, now); return x !== null && x < 0; });
  const overdueTotal = overdue.reduce((s, b) => s + (b.amount || 0), 0);
  if (overdue.length) out.push({ id: 'bills-overdue', kind: 'urgent', title: `${overdue.length} ${overdue.length === 1 ? 'ληξιπρόθεσμος λογαριασμός' : 'ληξιπρόθεσμοι λογαριασμοί'}`, detail: 'Έχει περάσει η ημερομηνία πληρωμής. Εξόφλησέ τους για να αποφύγεις προσαυξήσεις ή διακοπή παροχής.', metric: overdueTotal > 0 ? eur(overdueTotal) : undefined, action: { label: 'Λογαριασμοί', tab: 'finances' } });
  else if (unpaid.length) out.push({ id: 'bills-unpaid', kind: 'attention', title: `${unpaid.length} ${unpaid.length === 1 ? 'εκκρεμής λογαριασμός' : 'εκκρεμείς λογαριασμοί'}`, detail: 'Αναμένουν πληρωμή. Τακτοποίησέ τους όσο υπάρχει χρόνος.', action: { label: 'Λογαριασμοί', tab: 'finances' } });

  // ── 4. Συντήρηση & Checklist εκπρόθεσμα ──────────────────────────────────
  const tasksOverdue = tasks.filter(t => { const x = daysUntil(t.due_date, now); return x !== null && x < 0; });
  const chkOverdue = checklist.filter(c => { const x = daysUntil(c.due_date, now); return x !== null && x < 0; });
  if (tasksOverdue.length) out.push({ id: 'tasks-overdue', kind: 'attention', title: `${tasksOverdue.length} ${tasksOverdue.length === 1 ? 'εργασία συντήρησης' : 'εργασίες συντήρησης'} σε καθυστέρηση`, detail: 'Η έγκαιρη συντήρηση κοστίζει πολύ λιγότερο από μια βλάβη. Δες τι εκκρεμεί.', action: { label: 'Ημερολόγιο', tab: 'calendar' } });
  if (chkOverdue.length) out.push({ id: 'chk-overdue', kind: 'attention', title: `${chkOverdue.length} εκπρόθεσμα στη λίστα υποχρεώσεων`, detail: 'Υπάρχουν στοιχεία που πέρασε η προθεσμία τους.', action: { label: 'Υποχρεώσεις', tab: 'checklist' } });

  // ── 5. Εγγυήσεις που λήγουν (ευκαιρία να προλάβεις δωρεάν επισκευή) ───────
  const warrantySoon = inventory.filter(i => { const x = daysUntil(i.warranty_expiry, now); return x !== null && x >= 0 && x <= 60; });
  if (warrantySoon.length) {
    const first = warrantySoon[0];
    const d = daysUntil(first.warranty_expiry, now);
    out.push({ id: 'warranty-soon', kind: 'opportunity', title: warrantySoon.length === 1 ? 'Λήγει η εγγύηση μιας συσκευής' : `Λήγουν ${warrantySoon.length} εγγυήσεις`, detail: `${first.name ? `«${first.name}»: ` : ''}μένουν ${d} ${d === 1 ? 'ημέρα' : 'ημέρες'} εγγύηση. Αν κάτι δεν πάει καλά, τώρα η επισκευή είναι δωρεάν.`, action: { label: 'Απογραφή', tab: 'inventory' } });
  }

  // ── 6. Κενό ακίνητο = χαμένο εισόδημα ─────────────────────────────────────
  const isVacant = (p.status_detail === 'vacant') && !tenant;
  if (isVacant && rent > 0 && !shortTerm) {
    out.push({ id: 'vacant', kind: 'opportunity', title: 'Το ακίνητο είναι κενό', detail: `Κάθε μήνας χωρίς ενοικιαστή είναι περίπου ${eur(rent)} χαμένο εισόδημα. Αν ψάχνεις, δες πρώτα τι ενοίκιο πιάνει η περιοχή σου.`, metric: `${eur(rent)}/μήνα`, action: { label: 'Αποδόσεις', tab: 'roi' } });
  } else if (isVacant && shortTerm) {
    // Βραχυχρόνια: το «κενό» ανάμεσα σε κρατήσεις είναι φυσιολογικό. Εστίασε σε πληρότητα/τιμολόγηση.
    out.push({ id: 'vacant-st', kind: 'opportunity', title: 'Ελεύθερες ημερομηνίες', detail: 'Σε βραχυχρόνια μίσθωση το κενό ανάμεσα σε κρατήσεις είναι φυσιολογικό. Πριν την υψηλή σεζόν, ρίξε μια ματιά στην τιμή ανά διανυκτέρευση, στις φωτογραφίες και στις αξιολογήσεις για να ανεβάσεις την πληρότητα.', action: { label: 'Αποδόσεις', tab: 'roi' } });
  }

  // ── 7. Έκπτωση φόρου: πλήρωνε ηλεκτρονικά ─────────────────────────────────
  if (expensesYTD > 0 && expenses.length >= 3) {
    const withMethod = expenses.filter(e => e.payment_method);
    const cashTotal = withMethod.filter(e => e.payment_method && CASH.has(e.payment_method)).reduce((s, e) => s + e.amount, 0);
    const cashShare = expensesYTD > 0 ? cashTotal / expensesYTD : 0;
    if (withMethod.length >= 3 && cashShare > 0.35) {
      out.push({ id: 'tax-electronic', kind: 'opportunity', title: 'Πλήρωνε ηλεκτρονικά και γλίτωσε φόρο', detail: `Το ${Math.round(cashShare * 100)}% των δαπανών σου είναι με μετρητά. Οι ηλεκτρονικές πληρωμές (κάρτα, e-banking) μετρούν για την έκπτωση φόρου και χτίζουν το «καλάθι» αποδείξεων που ζητά η εφορία.`, action: { label: 'Δαπάνες', tab: 'finances' } });
    }
  }

  // ── 8. Ρεύμα: μεγάλο κόστος → σκέψου αλλαγή παρόχου ───────────────────────
  const energyBills = bills.filter(b => (b.type || '').toLowerCase().includes('electric') || b.type === 'electricity' || b.type === 'ρεύμα');
  const energyTotal = energyBills.reduce((s, b) => s + (b.amount || 0), 0);
  if (energyTotal > 0 && expensesYTD > 0 && energyTotal / Math.max(expensesYTD, energyTotal) > 0.25) {
    out.push({ id: 'energy-review', kind: 'opportunity', title: 'Το ρεύμα «τρώει» μεγάλο μέρος των εξόδων', detail: 'Οι τιμές στα τιμολόγια ρεύματος αλλάζουν συχνά. Μια σύγκριση παρόχων μπορεί να σου γλιτώσει αρκετά τον χρόνο, ειδικά αν το ακίνητο μένει άδειο κάποιους μήνες.', metric: eur(energyTotal), action: { label: 'Λογαριασμοί', tab: 'finances' } });
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
    if (netYield >= YIELD_STRONG_PCT) out.push({ id: 'yield-strong', kind: 'positive', title: 'Δυνατή απόδοση', detail: `Με τα στοιχεία που έχεις καταχωρίσει, το ακίνητο αποδίδει καθαρά ${netYield.toFixed(1)}% τον χρόνο. Στις Αποδόσεις βλέπεις πώς συγκρίνεται με την περιοχή σου και με άλλες επενδύσεις, με αναγραφόμενες πηγές.`, metric: `${netYield.toFixed(1)}%`, action: { label: 'Αποδόσεις', tab: 'roi' } });
    else if (netYield < YIELD_LOW_PCT) out.push({ id: 'yield-low', kind: 'opportunity', title: 'Υπάρχει περιθώριο στην απόδοση', detail: `Η καθαρή απόδοση είναι ${netYield.toFixed(1)}%. Δες στις Αποδόσεις τι πιάνει η περιοχή σου και ποιες δαπάνες τη μειώνουν.`, metric: `${netYield.toFixed(1)}%`, action: { label: 'Αποδόσεις', tab: 'roi' } });
  }

  // ── 10. Έλλειψη στοιχείων → ανακριβή νούμερα ──────────────────────────────
  const missing: string[] = [];
  if (!p.value && !p.obj_value) missing.push('την αξία');
  if (!p.sqm) missing.push('το εμβαδόν');
  if (!p.postal_code) missing.push('τον ταχυδρομικό κώδικα');
  if (missing.length) {
    const list = missing.length === 1 ? missing[0] : missing.slice(0, -1).join(', ') + ' και ' + missing[missing.length - 1];
    out.push({ id: 'profile-incomplete', kind: 'attention', title: 'Λείπουν στοιχεία του ακινήτου', detail: `Συμπλήρωσε ${list} για να βγαίνουν σωστά οι αποδόσεις και οι συγκρίσεις. Παίρνει ένα λεπτό.`, action: { label: 'Επεξεργασία', tab: 'settings' } });
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
    out.push({ id: 'no-expenses', kind: 'opportunity', title: 'Ξεκίνα με μία φωτογραφία', detail: 'Βγάλε φωτογραφία έναν λογαριασμό ή μια απόδειξη πληρωμής που σχετίζεται με το ακίνητό σου και θα καταχωρηθεί αυτόματα, με τη βοήθεια του AI, στη σωστή θέση. Έτσι, εύκολα και γρήγορα, αρχίζει να χτίζεται η εικόνα των εξόδων σου.', action: { label: 'Σάρωση', tab: 'scan' } });
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
