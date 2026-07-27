// ═══════════════════════════════════════════════════════════════════════════
// Προτεινόμενες ερωτήσεις — «ρώτα για ΤΑ ΔΙΚΑ ΣΟΥ νούμερα»
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ
// Ο βοηθός άνοιγε με γενικές ερωτήσεις τύπου «Πώς φορολογείται το ενοίκιο;».
// Αυτό είναι ερώτηση για μηχανή αναζήτησης. Ο χρήστης το σκέφτεται μία φορά,
// παίρνει μια απάντηση που θα έβρισκε και αλλού, και δεν ξαναγυρνά — γιατί
// τίποτα δεν του θύμισε ότι ο βοηθός βλέπει ΤΑ ΔΙΚΑ ΤΟΥ δεδομένα.
//
// Η ΑΛΛΑΓΗ
// Κάθε πρόταση αναφέρεται σε δικό του νούμερο ή σε δική του κατάσταση:
// «Πόσο μου μένει καθαρά από τα 700 € του Διαμερίσματος Κυψέλης;».
// Αν λείπουν τα δεδομένα, δεν επινοούμε νούμερα: γυρνάμε σε προτάσεις που
// ΟΔΗΓΟΥΝ στη συμπλήρωση («Τι χρειάζεσαι για να μου πεις τον φόρο μου;»).
//
// ΚΑΝΟΝΕΣ
//  • Ποτέ νούμερο που δεν υπάρχει. Καμία «τυπική τιμή αγοράς» σαν να είναι δική του.
//  • Πάντα δεύτερο πρόσωπο και κτητικό: «σου», «σου μένει», «τα δικά σου».
//  • Μέγιστο 4 προτάσεις: πάνω από αυτό γίνεται μενού, όχι πρόσκληση.
//  • Σειρά προτεραιότητας: επείγον → χρήμα → φόρος → βελτίωση.
//
// Καθαρή λογική, χωρίς React/Supabase, ώστε να ελέγχεται με tests.
// ═══════════════════════════════════════════════════════════════════════════

export interface OpenerContext {
  /** Όνομα του επιλεγμένου ακινήτου (π.χ. «Διαμέρισμα Κυψέλης»). */
  propertyName?: string;
  /** Μηνιαίο μίσθωμα σε ευρώ, όπως το ξέρει η εφαρμογή. */
  monthlyRent?: number | null;
  /** Αξία ακινήτου σε ευρώ. */
  propertyValue?: number | null;
  /** Δαπάνες του τρέχοντος έτους σε ευρώ. */
  expensesYtd?: number | null;
  /** Ανοιχτές εκκρεμότητες / ληξιπρόθεσμα. */
  openTasks?: number;
  /** Ληξιπρόθεσμο ενοίκιο σε ευρώ. */
  overdueRent?: number | null;
  /** Έχει καταχωρημένο δάνειο. */
  hasLoan?: boolean;
  /** Βραχυχρόνια μίσθωση. */
  isShortTerm?: boolean;
  /** Πλήθος ακινήτων του χρήστη. */
  propertyCount?: number;
}

const MAX = 4;

/** Ευρώ σε ελληνική μορφή, χωρίς άσκοπα δεκαδικά. */
export function eur(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  const s = Number.isInteger(rounded)
    ? rounded.toLocaleString('el-GR')
    : rounded.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s} €`;
}

/** Θετικός αριθμός με νόημα; (το 0 και το null δεν είναι δεδομένο) */
const has = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Οι προτάσεις εκκίνησης για τον συγκεκριμένο χρήστη και ακίνητο.
 *
 * Επιστρέφει το πολύ MAX ερωτήσεις, με σειρά προτεραιότητας. Κάθε ερώτηση που
 * περιέχει νούμερο, το παίρνει από τα δεδομένα — ποτέ από εκτίμηση.
 */
export function suggestedOpeners(ctx: OpenerContext = {}): string[] {
  const out: string[] = [];
  const name = (ctx.propertyName || '').trim();
  const forProp = name ? ` στο ${name}` : '';

  // 1. ΕΠΕΙΓΟΝ — ό,τι κοστίζει τώρα ή έχει προθεσμία.
  if (has(ctx.overdueRent)) {
    out.push(`Μου χρωστάει ${eur(ctx.overdueRent)} ενοίκιο — τι κάνω;`);
  }
  if ((ctx.openTasks ?? 0) > 0) {
    const n = ctx.openTasks as number;
    out.push(n === 1 ? 'Ποια είναι η εκκρεμότητά μου και πότε λήγει;' : `Έχω ${n} εκκρεμότητες — ποια είναι η πιο επείγουσα;`);
  }

  // 2. ΧΡΗΜΑ — το νούμερο που τον απασχολεί πραγματικά.
  if (has(ctx.monthlyRent)) {
    out.push(`Από τα ${eur(ctx.monthlyRent)} τον μήνα, πόσο μου μένει καθαρά;`);
  }
  if (has(ctx.expensesYtd)) {
    out.push(`Ξόδεψα ${eur(ctx.expensesYtd)} φέτος${forProp} — πού πήγαν;`);
  }

  // 3. ΦΟΡΟΣ & ΑΠΟΔΟΣΗ — ο λόγος που έψαξε λύση.
  if (has(ctx.monthlyRent)) {
    out.push('Πόσο φόρο θα πληρώσω φέτος για τα δικά μου ενοίκια;');
  }
  if (has(ctx.monthlyRent) && has(ctx.propertyValue)) {
    out.push(`Τι απόδοση βγάζει${forProp ? forProp.replace(' στο ', ' το ') : ' το ακίνητό μου'} με τα σημερινά νούμερα;`);
  }
  if (ctx.hasLoan) {
    out.push('Συμφέρει να ρίξω κεφάλαιο στο δάνειό μου ή να το κρατήσω;');
  }
  if (ctx.isShortTerm) {
    out.push('Πόσο να βάλω τη διανυκτέρευση τον επόμενο μήνα;');
  }
  if ((ctx.propertyCount ?? 0) > 1) {
    out.push('Ποιο από τα ακίνητά μου αποδίδει καλύτερα;');
  }

  // 4. ΧΩΡΙΣ ΔΕΔΟΜΕΝΑ — δεν επινοούμε νούμερα· δείχνουμε τι λείπει.
  // Αυτές μπαίνουν ΜΟΝΟ αν δεν βρέθηκε αρκετό πραγματικό υλικό, ώστε ο νέος
  // χρήστης να δει διαδρομή αντί για άδεια οθόνη.
  if (out.length < MAX) {
    const fallbacks: string[] = [];
    if (!has(ctx.monthlyRent)) fallbacks.push('Τι χρειάζεσαι από μένα για να μου πεις πόσο φόρο θα πληρώσω;');
    if (!has(ctx.expensesYtd)) fallbacks.push('Πώς καταχωρώ μια δαπάνη με μια φωτογραφία;');
    if (!has(ctx.propertyValue)) fallbacks.push('Τι στοιχεία λείπουν από το ακίνητό μου;');
    fallbacks.push('Τι μπορείς να κάνεις με τα δικά μου δεδομένα;');
    for (const f of fallbacks) { if (out.length >= MAX) break; out.push(f); }
  }

  return out.slice(0, MAX);
}

/**
 * Ο χαιρετισμός: λέει τι ΞΕΡΕΙ ο βοηθός, όχι τι είναι.
 * «Ρώτησέ με οτιδήποτε» δεν λέει τίποτα· «βλέπω τα νούμερα του Χ» λέει τα πάντα.
 */
export function greeting(assistantName: string, ctx: OpenerContext = {}, formal = false): string {
  const you = formal ? 'Ρωτήστε με' : 'Ρώτα με';
  const name = (ctx.propertyName || '').trim();
  const many = (ctx.propertyCount ?? 0) > 1;

  const scope = many
    ? `των ${ctx.propertyCount} ακινήτων σου`
    : name ? `του ${name}` : 'του ακινήτου σου';

  const knows: string[] = [];
  if (has(ctx.monthlyRent)) knows.push('τα ενοίκια');
  if (has(ctx.expensesYtd)) knows.push('τις δαπάνες');
  if (ctx.hasLoan) knows.push('το δάνειο');
  if ((ctx.openTasks ?? 0) > 0) knows.push('τις εκκρεμότητες');

  if (knows.length === 0) {
    return `Γεια σου! Είμαι ${assistantName}. Μόλις καταχωρήσεις τα πρώτα στοιχεία ${scope}, θα μπορώ να σου απαντώ με τα δικά σου νούμερα. ${you} τι χρειάζομαι.`;
  }

  const list = knows.length === 1 ? knows[0] : `${knows.slice(0, -1).join(', ')} και ${knows[knows.length - 1]}`;
  return `Γεια σου! Είμαι ${assistantName}. Βλέπω ${list} ${scope}. ${you} για τα δικά σου νούμερα — όχι γενικά.`;
}
