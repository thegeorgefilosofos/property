// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΛΙΣΤΑ «ΤΙ ΠΡΕΠΕΙ ΝΑ ΚΑΝΩ», ΟΧΙ ΤΕΣΣΕΡΙΣ.
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ
// Η Επισκόπηση σέρβιρε τέσσερις ανεξάρτητες μηχανές συμβουλής, τη μία κάτω από
// την άλλη:
//
//   InsightsBoard      (computeInsights)      «Λήγει σύντομα η ασφάλεια»
//   ObligationsPanel   (computeObligations)   «Λήξη ασφάλισης, Interamerican»
//   OnboardingChecklist                       «Συμπλήρωσε αξία & ενοίκιο»
//   SmartSuggestions                          προτάσεις συντήρησης/φόρων
//
// Η λήξη της μίσθωσης εμφανιζόταν ΤΕΣΣΕΡΙΣ φορές στην ίδια οθόνη: ως insight, ως
// υποχρέωση, ως πλακίδιο «Λήξη σύμβασης» στα KPI, και ως προθεσμία στο βήμα
// ρύθμισης. Η ασφάλεια δύο. Τα ελλιπή στοιχεία δύο. Ο χρήστης δεν διαβάζει
// τέσσερις λίστες — διαβάζει την πρώτη και θεωρεί τις υπόλοιπες θόρυβο.
//
// Η ΛΥΣΗ: ΘΕΜΑ, ΟΧΙ ΠΗΓΗ
// Κάθε στοιχείο δηλώνει ΘΕΜΑ (`insurance`, `lease`, `bills`…). Δύο στοιχεία με
// το ίδιο θέμα είναι το ίδιο πράγμα ειπωμένο δύο φορές, όσο διαφορετικά κι αν
// είναι γραμμένα. Μένει ένα: αυτό με την πραγματική ημερομηνία (οι υποχρεώσεις
// ξέρουν πότε), δανειζόμενο ό,τι του λείπει από το άλλο (τα insights ξέρουν πού
// να σε πάει). Ό,τι δεν συναντιέται, περνά ανέπαφο.
//
// ΚΑΜΙΑ ΧΡΩΜΑΤΙΚΗ ΕΤΥΜΗΓΟΡΙΑ. Η προτεραιότητα είναι Η ΣΕΙΡΑ: ληξιπρόθεσμο πρώτα,
// μετά η πιο κοντινή προθεσμία, μετά η βαρύτητα. Ίδιος κανόνας με το
// `orderSteps` της ρύθμισης ακινήτου, ώστε δύο λίστες να μη διαφωνούν για το τι
// είναι επείγον.
// ═══════════════════════════════════════════════════════════════════════════

export type AgendaOrigin = 'obligation' | 'insight' | 'setup';

export interface AgendaItem {
  /** Το ΘΕΜΑ. Δύο στοιχεία με το ίδιο θέμα συγχωνεύονται. */
  key: string;
  title: string;
  note: string;
  /** ISO «YYYY-MM-DD», ή null όταν δεν υπάρχει προθεσμία. */
  due: string | null;
  /** Αρνητικό = ληξιπρόθεσμο. */
  daysLeft: number | null;
  action: { label: string; tab: string } | null;
  origin: AgendaOrigin;
  /** Κρίνει μόνο όσα ΔΕΝ έχουν κοντινή προθεσμία. */
  weight: number;
  /** Ποιος το κάνει — μόνο οι υποχρεώσεις το ξέρουν. */
  who?: string;
}

/** Ό,τι παράγει το `computeInsights`, στο ελάχιστο που χρειάζεται εδώ. */
export interface InsightLike {
  id: string;
  kind: string;
  title: string;
  detail: string;
  metric?: string;
  action?: { label: string; tab: string };
}

/** Ό,τι παράγει το `computeObligations`, στο ελάχιστο που χρειάζεται εδώ. */
export interface ObligationLike {
  id: string;
  title: string;
  note: string;
  date: string;
  daysUntil: number;
  priority: string;
  who?: string;
}

/** Βήμα ρύθμισης ακινήτου (OnboardingChecklist). */
export interface SetupLike {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  due?: string | null;
  weight?: number;
  nav: string;
}

// ── ΧΑΡΤΟΓΡΑΦΗΣΗ ΣΕ ΘΕΜΑΤΑ ───────────────────────────────────────────────
// Εδώ κρίνεται τι είναι διπλότυπο. Γράφεται ρητά, με ονόματα που υπάρχουν
// πραγματικά στις δύο μηχανές — όχι με ευρετικό ταίριασμα τίτλων, που θα έσπαγε
// στην πρώτη επαναδιατύπωση κειμένου.

const OBLIGATION_SUBJECT: Record<string, string> = {
  insurance: 'insurance',
  lease_end: 'lease',
  lease_decl: 'lease-declaration',
};

const INSIGHT_SUBJECT: Record<string, string> = {
  'insurance-expired': 'insurance',
  'insurance-soon': 'insurance',
  'lease-expired': 'lease',
  'lease-soon': 'lease',
  'bills-overdue': 'bills',
  'bills-unpaid': 'bills',
  'tasks-overdue': 'maintenance-tasks',
  'chk-overdue': 'checklist',
  // Τα δύο παρακάτω ΕΙΝΑΙ βήματα ρύθμισης, διατυπωμένα ως insight.
  'profile-incomplete': 'setup:details',
  'no-expenses': 'setup:expense',
};

export function obligationSubject(id: string): string {
  if (OBLIGATION_SUBJECT[id]) return OBLIGATION_SUBJECT[id];
  if (id.startsWith('maint_')) return `maintenance:${id}`;
  return `tax:${id}`;
}

export function insightSubject(id: string): string {
  return INSIGHT_SUBJECT[id] || `insight:${id}`;
}

// ── ΒΑΡΥΤΗΤΑ ΟΤΑΝ ΔΕΝ ΥΠΑΡΧΕΙ ΠΡΟΘΕΣΜΙΑ ──────────────────────────────────
// Το `kind` των insights είναι ήδη ιεραρχία· εδώ γίνεται αριθμός για να μπορεί
// να συγκριθεί με τη βαρύτητα των βημάτων ρύθμισης στην ίδια λίστα.
const KIND_WEIGHT: Record<string, number> = {
  urgent: 9, attention: 7, opportunity: 4, positive: 1,
};
// Το «critical» έλειπε και έπεφτε στο `?? 5` — δηλαδή ΚΑΤΩ από το «medium» (6).
// Μια κρίσιμη υποχρέωση χωρίς κοντινή προθεσμία καθόταν πιο χαμηλά από μια
// μεσαία, ακριβώς επειδή ήταν κρίσιμη.
const PRIORITY_WEIGHT: Record<string, number> = { critical: 12, high: 9, medium: 6, low: 3 };

function toDaysLeft(iso: string | null | undefined, today: string): number | null {
  if (!iso) return null;
  const a = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86400000);
}

// ── ΣΥΓΧΩΝΕΥΣΗ ───────────────────────────────────────────────────────────
// Νικά η υποχρέωση, γιατί κρατά την ΠΡΑΓΜΑΤΙΚΗ ημερομηνία και το ποιος το κάνει.
// Το insight όμως ξέρει ΠΟΥ να σε πάει, οπότε η ενέργειά του επιβιώνει. Έτσι η
// συγχωνευμένη γραμμή είναι καλύτερη και από τις δύο, όχι η μία από τις δύο.
const ORIGIN_RANK: Record<AgendaOrigin, number> = { obligation: 3, insight: 2, setup: 1 };

function merge(a: AgendaItem, b: AgendaItem): AgendaItem {
  const [win, lose] = ORIGIN_RANK[a.origin] >= ORIGIN_RANK[b.origin] ? [a, b] : [b, a];
  return {
    ...win,
    due: win.due ?? lose.due,
    daysLeft: win.due != null ? win.daysLeft : lose.daysLeft,
    action: win.action ?? lose.action,
    weight: Math.max(win.weight, lose.weight),
    who: win.who ?? lose.who,
  };
}

/**
 * Οι τρεις πηγές γίνονται μία λίστα, χωρίς διπλότυπα, σε σειρά πίεσης.
 *
 * @param today ISO «YYYY-MM-DD» σε ΕΛΛΗΝΙΚΗ ώρα (athensToday()).
 * @param limit Πόσα να επιστραφούν. Η αρχική οθόνη δείχνει λίγα· η πλήρης λίστα
 *   ζει στις «Εκκρεμότητες». `0` = όλα.
 */
/**
 * Πόσο μακριά βλέπει η λίστα, σε ημέρες.
 *
 * ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΟΡΙΟ: μια προθεσμία στα 222 ημέρες δεν είναι «τι χρειάζεται
 * τώρα» — είναι ημερολόγιο. Η αρχική οθόνη γέμιζε με δόσεις ΕΝΦΙΑ του επόμενου
 * καλοκαιριού και έσπρωχνε κάτω το εκπρόθεσμο, δηλαδή το μόνο που ζητούσε
 * ενέργεια σήμερα. Ό,τι είναι μακρύτερα ζει στο Ημερολόγιο και στις
 * Εκκρεμότητες, όπου το ψάχνει κανείς επίτηδες.
 *
 * ΤΟ ΕΚΠΡΟΘΕΣΜΟ ΔΕΝ ΚΟΒΕΤΑΙ ΠΟΤΕ, όσο παλιό κι αν είναι: αρνητικές ημέρες
 * περνούν πάντα. Ένα όριο που κρύβει καθυστερήσεις είναι επικίνδυνο.
 */
export const DEFAULT_HORIZON_DAYS = 100;

/**
 * Η ΣΗΜΕΙΩΣΗ ΤΗΣ ΑΡΧΙΚΗΣ ΕΙΝΑΙ ΜΙΑ ΠΡΟΤΑΣΗ, ΟΧΙ ΟΛΟΚΛΗΡΟ ΤΟ ΔΕΛΤΙΟ.
 *
 * Οι υποχρεώσεις φτιάχνουν το κείμενό τους με συνένωση: τίτλος, κόστος, ισχύς,
 * νομική βάση, ποιος το κάνει, και δύο ωμά URL για επαλήθευση. Στην καρτέλα
 * Εκκρεμότητες αυτό είναι σωστό — εκεί ψάχνεις λεπτομέρεια. Στην πρώτη οθόνη
 * γινόταν πέντε γραμμές με https:// μέσα στη μέση, δηλαδή τοίχος που κανείς δεν
 * διαβάζει και που έθαβε τις υπόλοιπες εκκρεμότητες.
 *
 * Κρατιέται η ΠΡΩΤΗ πρόταση, χωρίς διευθύνσεις. Η πλήρης εξήγηση δεν χάνεται:
 * ζει ακέραιη στην καρτέλα, που είναι ένα κλικ μακριά.
 */
export function shortNote(text: string | null | undefined, maxChars = 150): string {
  const clean = (text || '')
    .replace(/https?:\/\/\S+/g, '')          // διευθύνσεις: δεν διαβάζονται σε πρόταση
    .replace(/\(\s*\)/g, '')                  // παρενθέσεις που έμειναν άδειες
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (!clean) return '';
  // Πρώτη πρόταση: τελεία ακολουθούμενη από κενό και κεφαλαίο, ώστε να μη
  // σπάει σε συντομογραφίες («τ.μ.») ούτε σε δεκαδικά («15,5»).
  const m = /^(.+?[.;!?])(\s+[Α-ΩA-Z«"]|$)/.exec(clean);
  const first = (m ? m[1] : clean).trim();
  if (first.length <= maxChars) return first;
  const cut = first.slice(0, maxChars);
  const sp = cut.lastIndexOf(' ');
  return (sp > 40 ? cut.slice(0, sp) : cut).trim() + '…';
}

export function buildAgenda(input: {
  insights?: InsightLike[];
  obligations?: ObligationLike[];
  setup?: SetupLike[];
  today: string;
  limit?: number;
  /** Ημέρες μπροστά που εμφανίζονται. Προεπιλογή 100· ρυθμίζεται από τον χρήστη. */
  horizonDays?: number;
}): AgendaItem[] {
  const { today } = input;
  const horizon = Number.isFinite(input.horizonDays) && (input.horizonDays as number) > 0
    ? (input.horizonDays as number)
    : DEFAULT_HORIZON_DAYS;
  const bySubject = new Map<string, AgendaItem>();

  const add = (item: AgendaItem) => {
    const prev = bySubject.get(item.key);
    bySubject.set(item.key, prev ? merge(prev, item) : item);
  };

  for (const o of input.obligations || []) {
    const days = Number.isFinite(o.daysUntil) ? o.daysUntil : toDaysLeft(o.date, today);
    // Πέρα από τον ορίζοντα: δεν είναι «τώρα». Το εκπρόθεσμο (αρνητικό) μένει.
    if (days != null && days > horizon) continue;
    add({
      key: obligationSubject(o.id),
      title: o.title, note: shortNote(o.note),
      due: o.date ? o.date.slice(0, 10) : null,
      daysLeft: days,
      action: null, origin: 'obligation',
      weight: PRIORITY_WEIGHT[o.priority] ?? 5,
      who: o.who,
    });
  }

  for (const i of input.insights || []) {
    // Τα «positive» δεν είναι δουλειά — είναι κομπλιμέντο. Δεν έχουν θέση σε
    // λίστα με τίτλο «τι χρειάζεται τώρα»: σπρώχνουν κάτω ό,τι χρειάζεται.
    if (i.kind === 'positive') continue;
    add({
      key: insightSubject(i.id),
      title: i.title, note: shortNote(i.detail),
      due: null, daysLeft: null,
      action: i.action || null, origin: 'insight',
      weight: KIND_WEIGHT[i.kind] ?? 5,
    });
  }

  for (const s of input.setup || []) {
    if (s.done) continue;                    // ό,τι έγινε δεν είναι εκκρεμότητα
    add({
      key: `setup:${s.key}`,
      title: s.label, note: s.hint,
      due: s.due ? s.due.slice(0, 10) : null,
      daysLeft: toDaysLeft(s.due, today),
      action: { label: 'Άνοιγμα', tab: s.nav }, origin: 'setup',
      weight: s.weight ?? 5,
    });
  }

  // ── ΣΕΙΡΑ ΠΙΕΣΗΣ ───────────────────────────────────────────────────────
  // Ίδιος κανόνας με το orderSteps: προθεσμία ΜΟΝΟ όταν είναι κοντά (≤30 ημ.)
  // παίρνει προβάδισμα. Μια προθεσμία του Δεκεμβρίου δεν προσπερνά μια
  // ληξιπρόθεσμη ασφάλεια επειδή τυχαίνει να έχει ημερομηνία.
  const HORIZON = 30;
  const urgent = (x: AgendaItem) => x.daysLeft != null && x.daysLeft <= HORIZON;
  const sorted = [...bySubject.values()].sort((a, b) => {
    const ua = urgent(a), ub = urgent(b);
    if (ua !== ub) return ua ? -1 : 1;
    if (ua && ub) return (a.daysLeft as number) - (b.daysLeft as number) || a.key.localeCompare(b.key);
    if (a.weight !== b.weight) return b.weight - a.weight;
    // ΕΞΩ ΑΠΟ ΤΟΝ ΟΡΙΖΟΝΤΑ, Η ΗΜΕΡΟΜΗΝΙΑ ΔΕΝ ΕΙΝΑΙ ΕΠΕΙΓΟΝ.
    // Σε ισοβαρή, ό,τι ΔΕΝ έχει προθεσμία πάει πρώτο: ένα ληξιπρόθεσμο τιμολόγιο
    // ή μια ελλιπής καταχώρηση ισχύει ΤΩΡΑ και θα ισχύει και αύριο, ενώ μια
    // προθεσμία του Δεκεμβρίου μπορεί να περιμένει — και θα ανέβει μόνη της όταν
    // μπει στις 30 ημέρες. Ανάμεσα σε δύο με προθεσμία, η κοντινότερη πρώτη.
    const da = a.daysLeft, db = b.daysLeft;
    if ((da == null) !== (db == null)) return da == null ? -1 : 1;
    if (da != null && db != null && da !== db) return da - db;
    return a.key.localeCompare(b.key);
  });

  const limit = input.limit ?? 0;
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

/** Πόσα από τη λίστα είναι ήδη ληξιπρόθεσμα — ο αριθμός δίπλα στην κεφαλίδα. */
export function overdueCount(items: AgendaItem[]): number {
  return items.filter(i => i.daysLeft != null && i.daysLeft < 0).length;
}

/** Η προθεσμία σε λέξεις. Ποτέ «σε -3 ημέρες». */
export function dueLabel(daysLeft: number | null): string | null {
  if (daysLeft == null) return null;
  if (daysLeft < 0) { const n = Math.abs(daysLeft); return `${n} ${n === 1 ? 'ημέρα' : 'ημέρες'} πίσω`; }
  if (daysLeft === 0) return 'σήμερα';
  if (daysLeft === 1) return 'αύριο';
  return `σε ${daysLeft} ημέρες`;
}

// ── Η ΠΡΟΘΕΣΜΙΑ ΩΣ ΣΤΗΛΗ, ΟΧΙ ΩΣ ΦΡΑΣΗ ────────────────────────────────────
// Το `dueLabel` δίνει μία φράση («22 ημέρες πίσω»), που είναι σωστή αλλά
// αστοίχιστη: σε λίστα δέκα γραμμών κάθε φράση έχει άλλο μήκος και ο αριθμός
// κάθεται κάθε φορά αλλού. Το μάτι δεν μπορεί να συγκρίνει κάθετα, και το
// «22 πίσω» δεν ξεχωρίζει με τίποτα από το «σε 204».
//
// Εδώ ο αριθμός βγαίνει χωριστά από τη μονάδα, ώστε η οθόνη να τον στοιχίσει σε
// δική του στήλη με ισοπλατή ψηφία — όπως κάθε οικονομική κατάσταση.
export interface DueParts {
  /** Ο αριθμός, ή null όταν δεν υπάρχει προθεσμία ή είναι σήμερα/αύριο. */
  value: number | null;
  /** Η μονάδα κάτω από τον αριθμό («ημέρες πίσω», «ημέρες»). */
  unit: string;
  /** Λέξη αντί για αριθμό, όταν ο αριθμός δεν προσθέτει τίποτα. */
  word: string | null;
  overdue: boolean;
}

export function dueParts(daysLeft: number | null): DueParts {
  if (daysLeft == null) return { value: null, unit: '', word: null, overdue: false };
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft);
    return { value: n, unit: n === 1 ? 'ημέρα πίσω' : 'ημέρες πίσω', word: null, overdue: true };
  }
  // «σήμερα» και «αύριο» διαβάζονται αμέσως· το «0» και το «1» θέλουν μετάφραση.
  if (daysLeft === 0) return { value: null, unit: '', word: 'σήμερα', overdue: false };
  if (daysLeft === 1) return { value: null, unit: '', word: 'αύριο', overdue: false };
  return { value: daysLeft, unit: daysLeft === 1 ? 'ημέρα' : 'ημέρες', word: null, overdue: false };
}
