// ═══════════════════════════════════════════════════════════════════════════
// Πλάνα συνδρομής — ΜΙΑ πηγή αλήθειας (τιμές, όρια, δυνατότητες).
// Χρησιμοποιείται από: landing pricing, Ρυθμίσεις/Χρέωση, όριο ακινήτων,
// Stripe checkout. Καμία χρέωση δεν γίνεται εδώ· απλώς ορίζει τι επιτρέπει κάθε πλάνο.
// ═══════════════════════════════════════════════════════════════════════════

export type PlanId = 'free' | 'owner' | 'agency' | 'office';

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
    tagline: 'Δες αν σου ταιριάζει, με ένα ακίνητο',
    features: ['1 ακίνητο, κάθε τύπου', 'Έσοδα, δαπάνες και υπενθυμίσεις', 'Σάρωση εγγράφων με φωτογραφία', 'Χωρίς χρονικό όριο'],
  },
  owner: {
    id: 'owner', name: 'Ιδιοκτήτης', priceMonthly: 9.9, priceAnnual: 99, maxProperties: 3, trialDays: TRIAL_DAYS, extraPropertyPrice: EXTRA_PROPERTY_PRICE,
    tagline: 'Για τον ιδιοκτήτη που νοικιάζει και θέλει να είναι εντάξει με την εφορία',
    features: ['3 ακίνητα, και όσα θέλεις παραπάνω με 2 € το καθένα', 'Δήλωση Μίσθωσης: έλεγχος πληρότητας πριν την υποβολή στο myAADE', 'Φορολογικές εξαγωγές Ε2 έτοιμες για τον λογιστή', 'Λογιστικό ημερολόγιο (SoftOne, Epsilon, QuickBooks, Xero)', 'Διαχείριση ενοικιαστών, εισπράξεων και οφειλών', `${TRIAL_DAYS} ημέρες δωρεάν δοκιμή`],
  },
  agency: {
    id: 'agency', name: 'Επαγγελματίας', priceMonthly: 24.9, priceAnnual: 249, maxProperties: 15, trialDays: TRIAL_DAYS, extraPropertyPrice: EXTRA_PROPERTY_PRICE,
    tagline: 'Για διαχειριστές ακινήτων και μεσιτικά γραφεία με ομάδα',
    features: ['15 ακίνητα, και όσα θέλεις παραπάνω με 2 € το καθένα', 'Ομαδική διαχείριση: πολλοί χρήστες, ρόλοι και δικαιώματα', 'Αναφορές και έγγραφα με τη δική σου επωνυμία', 'Πελατολόγιο και υποψήφιοι πελάτες (CRM)', 'Κατανομή σε συνιδιοκτήτες και διαχειριστική αμοιβή', 'Υποστήριξη κατά προτεραιότητα'],
  },
  office: {
    id: 'office', name: 'Γραφείο', priceMonthly: 79.9, priceAnnual: 799, maxProperties: Infinity, trialDays: TRIAL_DAYS, extraPropertyPrice: 0,
    tagline: 'Για γραφεία που διαχειρίζονται χαρτοφυλάκιο, όχι ακίνητα',
    features: ['Απεριόριστα ακίνητα, χωρίς μετρητή', 'Ό,τι έχει ο Επαγγελματίας', 'Ομάδα χωρίς όριο χρηστών', 'Προτεραιότητα σε νέες δυνατότητες', 'Άμεση επικοινωνία για ό,τι χρειαστείς'],
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'owner', 'agency', 'office'];

/** Ασφαλής ανάγνωση πλάνου από τυχόν αποθηκευμένο id (fallback: free). */
export function normalizePlan(id: string | null | undefined): PlanId {
  return id === 'owner' || id === 'agency' || id === 'office' ? id : 'free';
}

export function planLimit(id: string | null | undefined): number {
  return PLANS[normalizePlan(id)].maxProperties;
}

/** Μπορεί ο χρήστης να προσθέσει ακόμη ένα ακίνητο με το τρέχον πλάνο του; */
export function canAddProperty(planId: string | null | undefined, currentCount: number): boolean {
  return currentCount < planLimit(planId);
}

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
