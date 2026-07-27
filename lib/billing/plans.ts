// ═══════════════════════════════════════════════════════════════════════════
// Πλάνα συνδρομής — ΜΙΑ πηγή αλήθειας (τιμές, όρια, δυνατότητες).
// Χρησιμοποιείται από: landing pricing, Ρυθμίσεις/Χρέωση, όριο ακινήτων,
// Stripe checkout. Καμία χρέωση δεν γίνεται εδώ· απλώς ορίζει τι επιτρέπει κάθε πλάνο.
// ═══════════════════════════════════════════════════════════════════════════

export type PlanId = 'free' | 'owner' | 'agency';

export interface Plan {
  id: PlanId;
  name: string;
  /** Τιμή σε ευρώ. */
  priceMonthly: number;
  priceAnnual: number;
  /** Μέγιστα ακίνητα (Infinity = απεριόριστα). */
  maxProperties: number;
  tagline: string;
  features: string[];
  /** Ημέρες δωρεάν δοκιμής του πλάνου (0 = χωρίς δοκιμή). */
  trialDays: number;
  /** Προαιρετικά Stripe price IDs (μπαίνουν όταν στηθεί ο λογαριασμός Stripe). */
  stripePriceMonthly?: string;
  stripePriceAnnual?: string;
}

/** Ημέρες δωρεάν δοκιμής για κάθε νέο λογαριασμό (στο πλάνο «Ιδιοκτήτης»). */
export const TRIAL_DAYS = 30;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free', name: 'Δωρεάν', priceMonthly: 0, priceAnnual: 0, maxProperties: 1, trialDays: 0,
    tagline: 'Δες αν σου ταιριάζει, με ένα ακίνητο',
    features: ['1 ακίνητο, κάθε τύπου', 'Έσοδα, δαπάνες και υπενθυμίσεις', 'Σάρωση εγγράφων με φωτογραφία', 'Χωρίς χρονικό όριο'],
  },
  owner: {
    id: 'owner', name: 'Ιδιοκτήτης', priceMonthly: 9.9, priceAnnual: 99, maxProperties: 3, trialDays: TRIAL_DAYS,
    tagline: 'Για τον ιδιοκτήτη που νοικιάζει και θέλει να είναι εντάξει με την εφορία',
    features: ['Έως 3 ακίνητα', 'Δήλωση Μίσθωσης: έλεγχος πληρότητας πριν την υποβολή στο myAADE', 'Φορολογικές εξαγωγές Ε2 έτοιμες για τον λογιστή', 'Λογιστικό ημερολόγιο (SoftOne, Epsilon, QuickBooks, Xero)', 'Διαχείριση ενοικιαστών, εισπράξεων και οφειλών', `${TRIAL_DAYS} ημέρες δωρεάν δοκιμή`],
  },
  agency: {
    id: 'agency', name: 'Επαγγελματίας', priceMonthly: 24.9, priceAnnual: 249, maxProperties: 15, trialDays: TRIAL_DAYS,
    tagline: 'Για διαχειριστές ακινήτων και μεσιτικά γραφεία με ομάδα',
    features: ['Έως 15 ακίνητα', 'Ομαδική διαχείριση: πολλοί χρήστες, ρόλοι και δικαιώματα', 'Αναφορές και έγγραφα με τη δική σου επωνυμία', 'Πελατολόγιο και υποψήφιοι πελάτες (CRM)', 'Κατανομή σε συνιδιοκτήτες και διαχειριστική αμοιβή', 'Υποστήριξη κατά προτεραιότητα'],
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'owner', 'agency'];

/** Ασφαλής ανάγνωση πλάνου από τυχόν αποθηκευμένο id (fallback: free). */
export function normalizePlan(id: string | null | undefined): PlanId {
  return id === 'owner' || id === 'agency' ? id : 'free';
}

export function planLimit(id: string | null | undefined): number {
  return PLANS[normalizePlan(id)].maxProperties;
}

/** Μπορεί ο χρήστης να προσθέσει ακόμη ένα ακίνητο με το τρέχον πλάνο του; */
export function canAddProperty(planId: string | null | undefined, currentCount: number): boolean {
  return currentCount < planLimit(planId);
}

/** Το μικρότερο πλάνο που χωράει τόσα ακίνητα (για πρόταση αναβάθμισης). */
export function planForCount(count: number): PlanId {
  for (const id of PLAN_ORDER) if (count <= PLANS[id].maxProperties) return id;
  return 'agency';
}

/** Μηνιαίο ισοδύναμο ετήσιας τιμής (για εμφάνιση «X/μήνα με ετήσια»). */
export function annualPerMonth(id: PlanId): number {
  return Math.round((PLANS[id].priceAnnual / 12) * 100) / 100;
}
