// ═══════════════════════════════════════════════════════════════════════════
// Πλάνα συνδρομής — ΜΙΑ πηγή αλήθειας (τιμές, όρια, δυνατότητες).
// Χρησιμοποιείται από: landing pricing, Ρυθμίσεις/Χρέωση, όριο ακινήτων,
// Stripe checkout. Καμία χρέωση δεν γίνεται εδώ· απλώς ορίζει τι επιτρέπει κάθε πλάνο.
// ═══════════════════════════════════════════════════════════════════════════

export type PlanId = 'free' | 'solo' | 'owner' | 'agency' | 'office';

export interface Plan {
  id: PlanId;
  name: string;
  /** Τιμή σε ευρώ. */
  priceMonthly: number;
  priceAnnual: number;
  /** Ακίνητα που ΠΕΡΙΛΑΜΒΑΝΕΙ η τιμή (Infinity = απεριόριστα). */
  maxProperties: number;
  tagline: string;
  features: string[];
  /** Ημέρες δωρεάν δοκιμής του πλάνου (0 = χωρίς δοκιμή). */
  trialDays: number;
  /** Τιμή ανά επιπλέον ακίνητο τον μήνα. 0 = δεν προσφέρεται σε αυτό το πλάνο. */
  extraPropertyPrice: number;
  /** Προαιρετικά Stripe price IDs (μπαίνουν όταν στηθεί ο λογαριασμός Stripe). */
  stripePriceMonthly?: string;
  stripePriceAnnual?: string;
  stripePriceExtraProperty?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ΕΠΙΠΛΕΟΝ ΑΚΙΝΗΤΑ — γιατί υπάρχουν και γιατί σε αυτή την τιμή
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΟΥΝ: το άλμα από 3 σε 4 ακίνητα κόστιζε 9,90 € → 24,90 €,
// δηλαδή +152% για ΕΝΑ ακίνητο. Ο χρήστης με 4 ακίνητα δεν αναβαθμίζει· φεύγει,
// γιατί διεθνώς RentRedi/Stessa/TenantCloud δίνουν απεριόριστα στα ~12 $.
// Με το επιπλέον ακίνητο, το ίδιο βήμα κοστίζει +2 € και ο γκρεμός εξαφανίζεται.
//
// ΓΙΑΤΙ 2 €: ο μόνος άμεσος ανταγωνιστής στην Ελλάδα (Breek) χρεώνει 4,97 € + ΦΠΑ
// ανά ακίνητο για 3+. Στα 2 € είμαστε στο ένα τρίτο. Διεθνώς, η χρέωση ανά μονάδα
// είναι 1,00-2,00 $ (AppFolio ~1,40 $). Το οριακό κόστος εξυπηρέτησης ενός ακόμη
// ακινήτου είναι πρακτικά μηδέν — τα όρια του AI είναι ανά ΧΡΗΣΤΗ, όχι ανά ακίνητο.
//
// ΓΙΑΤΙ ΣΤΡΟΓΓΥΛΟ 2 ΚΑΙ ΟΧΙ 1,90: ο χρήστης πρέπει να μπορεί να το υπολογίσει
// στο κεφάλι του («τρία ακίνητα παραπάνω, έξι ευρώ»). Ένα 1,90 σε προσθήκη —
// σε αντίθεση με την τιμή του πλάνου — διαβάζεται ως τέχνασμα, όχι ως τιμή.
//
// Ο ΚΑΝΟΝΑΣ ΠΟΥ ΔΕΝ ΠΡΕΠΕΙ ΝΑ ΣΠΑΣΕΙ: το μετρημένο ακίνητο είναι ΒΑΛΒΙΔΑ, όχι
// διόδια. Αν ο χρήστης αρχίσει να καθυστερεί την προσθήκη ακινήτου για να μην
// ανέβει ο λογαριασμός, χάνει αξία η εφαρμογή και φεύγει — τεκμηριωμένος τρόπος
// αποτυχίας της χρέωσης ανά μονάδα. Γι' αυτό τα συμπεριλαμβανόμενα πρέπει να
// καλύπτουν τη μεγάλη μάζα, και ο μετρητής να πιάνει μόνο την ουρά.
// ═══════════════════════════════════════════════════════════════════════════
export const EXTRA_PROPERTY_PRICE = 2;

/** Ημέρες δωρεάν δοκιμής για κάθε νέο λογαριασμό (στο πλάνο «Ιδιοκτήτης»). */
export const TRIAL_DAYS = 30;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free', name: 'Δωρεάν', priceMonthly: 0, priceAnnual: 0, maxProperties: 1, trialDays: 0, extraPropertyPrice: 0,
    tagline: 'Δες αν σου ταιριάζει',
    features: ['1 ακίνητο', 'Έσοδα, δαπάνες, υπενθυμίσεις', 'Σάρωση εγγράφων με φωτογραφία', 'Χωρίς χρονικό όριο'],
  },
  // ═══════════════════════════════════════════════════════════════════════
  // ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΤΟ «ΕΝΑ ΑΚΙΝΗΤΟ»
  // ─────────────────────────────────────────────────────────────────────
  // Ο ΜΕΓΑΛΥΤΕΡΟΣ ΧΡΗΣΤΗΣ ΤΗΣ ΕΦΑΡΜΟΓΗΣ ΕΙΧΕ ΤΗ ΧΕΙΡΟΤΕΡΗ ΕΠΙΛΟΓΗ. Ο Έλληνας
  // με ΕΝΑ διαμέρισμα —η συντριπτική πλειοψηφία— μετά τη δοκιμή είχε δύο
  // δρόμους: δωρεάν χωρίς Ε2, χωρίς Δήλωση μίσθωσης, χωρίς εισπράξεις· ή
  // 9,90 € για τρία ακίνητα, εκ των οποίων θα χρησιμοποιούσε το ένα. Πλήρωνε
  // δηλαδή τριπλάσια χωρητικότητα για να πάρει τα φορολογικά που τον αφορούν.
  //
  // Στα 3,90 € παίρνει ΟΛΑ όσα χρειάζεται ένα ακίνητο. Είναι λιγότερο από έναν
  // καφέ τον μήνα, και συγκρίνεται με το κόστος ενός λογιστικού λάθους σε μία
  // δήλωση — όχι με τα 9,90 του επόμενου πλάνου.
  //
  // ΓΙΑΤΙ 3,90 ΚΑΙ ΟΧΙ 4: εδώ ο χρήστης ΔΕΝ κάνει πράξεις στο κεφάλι του, όπως
  // στα επιπλέον ακίνητα· κοιτάζει μία τιμή και αποφασίζει αν είναι μικρή. Το
  // 3,90 διαβάζεται «κάτω από τέσσερα». Η ίδια λογική με το 9,90.
  //
  // ΤΟ ΔΩΡΕΑΝ ΜΕΝΕΙ. Είναι ο τρόπος να δει κάποιος αν του ταιριάζει χωρίς κάρτα,
  // και δεν ανταγωνίζεται το 3,90: δίνει καταγραφή, όχι φορολογικά.
  // ═══════════════════════════════════════════════════════════════════════
  solo: {
    id: 'solo', name: 'Ένα ακίνητο', priceMonthly: 3.9, priceAnnual: 39, maxProperties: 1, trialDays: TRIAL_DAYS, extraPropertyPrice: 0,
    tagline: 'Ένα σπίτι, εντάξει με την εφορία',
    features: ['1 ακίνητο, με όλα τα φορολογικά', 'Ε2 έτοιμο για τον λογιστή', 'Έλεγχος Δήλωσης Μίσθωσης πριν το myAADE', 'Ενοικιαστής, εισπράξεις, οφειλές', `${TRIAL_DAYS} ημέρες δωρεάν δοκιμή`],
  },
  owner: {
    id: 'owner', name: 'Ιδιοκτήτης', priceMonthly: 9.9, priceAnnual: 99, maxProperties: 3, trialDays: TRIAL_DAYS, extraPropertyPrice: EXTRA_PROPERTY_PRICE,
    tagline: 'Λίγα ακίνητα, όλα σε τάξη',
    features: ['Έως 3 ακίνητα · +2 € το καθένα παραπάνω', 'Σύγκριση ακινήτων μεταξύ τους', 'Λογιστικό ημερολόγιο (SoftOne, Epsilon, Xero)', `${TRIAL_DAYS} ημέρες δωρεάν δοκιμή`],
  },
  agency: {
    id: 'agency', name: 'Επαγγελματίας', priceMonthly: 24.9, priceAnnual: 249, maxProperties: 15, trialDays: TRIAL_DAYS, extraPropertyPrice: EXTRA_PROPERTY_PRICE,
    tagline: 'Διαχειριστές και μεσιτικά με ομάδα',
    features: ['Έως 15 ακίνητα · +2 € το καθένα παραπάνω', 'Ομάδα: χρήστες, ρόλοι, δικαιώματα', 'Αναφορές με τη δική σου επωνυμία', 'Πελατολόγιο (CRM)', 'Συνιδιοκτήτες και διαχειριστική αμοιβή'],
  },
  office: {
    id: 'office', name: 'Γραφείο', priceMonthly: 79.9, priceAnnual: 799, maxProperties: Infinity, trialDays: TRIAL_DAYS, extraPropertyPrice: 0,
    tagline: 'Χαρτοφυλάκιο, όχι ακίνητα',
    features: ['Απεριόριστα ακίνητα, χωρίς μετρητή', 'Ομάδα χωρίς όριο χρηστών', 'Προτεραιότητα σε νέες δυνατότητες', 'Άμεση επικοινωνία'],
  },
};

// Η ΣΕΙΡΑ ΕΙΝΑΙ Η ΚΑΤΑΤΑΞΗ, ΚΑΙ Η ΚΑΤΑΤΑΞΗ ΖΕΙ ΚΑΙ ΣΤΗ ΒΑΣΗ.
// Το `rank()` του entitlements.ts είναι το `indexOf` αυτού του πίνακα, και ΠΡΕΠΕΙ
// να ταυτίζεται με την `public.user_plan_rank`. Παρεμβολή πλάνου εδώ χωρίς
// αντίστοιχο migration μετακινεί κάθε επόμενο επίπεδο κατά ένα — σιωπηλά, με
// αποτέλεσμα ο συνδρομητής «Ιδιοκτήτης» να διαβάζεται ως «Ένα ακίνητο».
// Το `solo` μπήκε μαζί με το 20260805090000_solo_plan.sql.
export const PLAN_ORDER: PlanId[] = ['free', 'solo', 'owner', 'agency', 'office'];

/** Ασφαλής ανάγνωση πλάνου από τυχόν αποθηκευμένο id (fallback: free). */
export function normalizePlan(id: string | null | undefined): PlanId {
  return id === 'solo' || id === 'owner' || id === 'agency' || id === 'office' ? id : 'free';
}

export function planLimit(id: string | null | undefined): number {
  return PLANS[normalizePlan(id)].maxProperties;
}

// ΤΟ `canAddProperty` ΕΦΥΓΕ ΑΠΟ ΕΔΩ.
// Υπήρχε σε δύο αρχεία με το ίδιο όνομα και ΔΙΑΦΟΡΕΤΙΚΗ απάντηση: αυτό εδώ
// κοιτούσε μόνο το πλάνο, ενώ το lib/billing/entitlements.ts μετράει και τα
// ΑΓΟΡΑΣΜΕΝΑ επιπλέον ακίνητα. Δηλαδή σε χρήστη που είχε πληρώσει για παραπάνω,
// αυτό εδώ έλεγε «όχι». Καμία οθόνη δεν το καλούσε — μόνο το ίδιο του το test.
// Η μία απάντηση δίνεται από το `canAddProperty` του entitlements.ts, που
// συμφωνεί με τον έλεγχο `enforce_property_limit` της βάσης.

/** Το μικρότερο πλάνο που χωράει τόσα ακίνητα ΧΩΡΙΣ αγορά επιπλέον. */
export function planForCount(count: number): PlanId {
  for (const id of PLAN_ORDER) if (count <= PLANS[id].maxProperties) return id;
  return 'office';
}

/** Μηνιαίο ισοδύναμο ετήσιας τιμής (για εμφάνιση «X/μήνα με ετήσια»). */
export function annualPerMonth(id: PlanId): number {
  return Math.round((PLANS[id].priceAnnual / 12) * 100) / 100;
}

// ── Επιπλέον ακίνητα: όριο και κόστος ──────────────────────────────────────

/** Πόσα ακίνητα επιτρέπει συνολικά το πλάνο ΜΑΖΙ με όσα έχει αγοράσει ο χρήστης. */
export function propertyAllowance(planId: string | null | undefined, extraProperties = 0): number {
  const plan = PLANS[normalizePlan(planId)];
  if (!Number.isFinite(plan.maxProperties)) return Infinity;
  // Άγνωστη/αρνητική τιμή δεν επιτρέπεται να ΜΕΓΑΛΩΣΕΙ το όριο κατά λάθος.
  const extras = plan.extraPropertyPrice > 0 ? Math.max(0, Math.floor(extraProperties) || 0) : 0;
  return plan.maxProperties + extras;
}

/** Το συνολικό μηνιαίο κόστος: τιμή πλάνου + επιπλέον ακίνητα. */
export function monthlyPrice(planId: string | null | undefined, extraProperties = 0): number {
  const plan = PLANS[normalizePlan(planId)];
  const extras = plan.extraPropertyPrice > 0 ? Math.max(0, Math.floor(extraProperties) || 0) : 0;
  return Math.round((plan.priceMonthly + extras * plan.extraPropertyPrice) * 100) / 100;
}

/** Πόσα επιπλέον χρειάζεται αυτό το πλάνο για να χωρέσει τόσα ακίνητα. */
export function extrasNeeded(planId: PlanId, count: number): number {
  const plan = PLANS[planId];
  if (!Number.isFinite(plan.maxProperties)) return 0;
  const missing = count - plan.maxProperties;
  return missing <= 0 ? 0 : (plan.extraPropertyPrice > 0 ? missing : Number.POSITIVE_INFINITY);
}

/** Το φθηνότερο εφικτό συνδυασμό πλάνου + επιπλέον για τόσα ακίνητα. */
export function cheapestFor(count: number): { plan: PlanId; extras: number; monthly: number } {
  let best: { plan: PlanId; extras: number; monthly: number } | null = null;
  for (const id of PLAN_ORDER) {
    if (id === 'free' && count > PLANS.free.maxProperties) continue;
    const extras = extrasNeeded(id, count);
    if (!Number.isFinite(extras)) continue;   // το πλάνο δεν φτάνει ούτε με επιπλέον
    const monthly = monthlyPrice(id, extras);
    if (!best || monthly < best.monthly) best = { plan: id, extras, monthly };
  }
  return best ?? { plan: 'office', extras: 0, monthly: PLANS.office.priceMonthly };
}

/**
 * Ο ΣΥΜΒΟΥΛΟΣ ΠΛΑΝΟΥ — το πιο σημαντικό κομμάτι αυτού του αρχείου.
 *
 * ΓΙΑΤΙ ΥΠΑΡΧΕΙ: όταν ένας χρήστης φτάσει τα 11 ακίνητα, ο Ιδιοκτήτης με 8 επιπλέον
 * του κοστίζει 25,90 € ενώ ο Επαγγελματίας 24,90 €. Χωρίς αυτή τη συνάρτηση θα
 * συνέχιζε να πληρώνει παραπάνω, και θα το ανακάλυπτε μόνος του — αν το ανακάλυπτε.
 *
 * Το να του το πούμε ΕΜΕΙΣ κοστίζει 1 € τον μήνα και αγοράζει κάτι που δεν αγοράζεται
 * με διαφήμιση: έναν χρήστη που ξέρει ότι η εφαρμογή τον προστάτεψε από τον εαυτό της.
 * Στην ελληνική αγορά, όπου η δυσπιστία απέναντι στις συνδρομές είναι ο πρώτος φραγμός,
 * αυτό αξίζει πολλαπλάσια από το ποσό.
 *
 * Επιστρέφει null όταν ο χρήστης είναι ήδη στο φθηνότερο — που είναι και η
 * συνηθισμένη περίπτωση, οπότε δεν ενοχλεί κανέναν χωρίς λόγο.
 */
export function planAdvice(
  currentPlan: string | null | undefined,
  count: number,
  extraProperties = 0,
): { plan: PlanId; extras: number; monthly: number; saves: number } | null {
  const now = normalizePlan(currentPlan);
  // Το δωρεάν δεν «συμβουλεύεται» — ο χρήστης εκεί δεν πληρώνει τίποτα.
  if (now === 'free') return null;
  const currentMonthly = monthlyPrice(now, extraProperties);
  const best = cheapestFor(Math.max(count, 1));
  if (best.plan === now) return null;
  const saves = Math.round((currentMonthly - best.monthly) * 100) / 100;
  // Μόνο πραγματική οικονομία. Χωρίς αυτό, θα προτείναμε αλλαγή για μηδενικό όφελος.
  if (saves <= 0) return null;
  return { ...best, saves };
}

/** Πώς γράφεται το όριο ακινήτων στην οθόνη (το Infinity δεν διαβάζεται). */
export function propertyLimitLabel(planId: string | null | undefined): string {
  const plan = PLANS[normalizePlan(planId)];
  if (!Number.isFinite(plan.maxProperties)) return 'Απεριόριστα ακίνητα';
  const n = plan.maxProperties;
  const base = n === 1 ? '1 ακίνητο' : `${n} ακίνητα`;
  return plan.extraPropertyPrice > 0
    ? `${base}, και όσα θέλεις παραπάνω με ${plan.extraPropertyPrice} € το καθένα`
    : base;
}
