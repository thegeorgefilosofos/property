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
  /** Προαιρετικά Stripe price IDs (μπαίνουν όταν στηθεί ο λογαριασμός Stripe). */
  stripePriceMonthly?: string;
  stripePriceAnnual?: string;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free', name: 'Δωρεάν', priceMonthly: 0, priceAnnual: 0, maxProperties: 1,
    tagline: 'Για τον ιδιοκτήτη με το πρώτο του ακίνητο',
    features: ['1 ακίνητο, κάθε τύπου', 'Σάρωση με φωτογραφία και βοηθός με φωνή', 'Αποδόσεις, δαπάνες, ενέργεια και φορολογία 2026', 'Έξυπνες ειδοποιήσεις και υπενθυμίσεις'],
  },
  owner: {
    id: 'owner', name: 'Ιδιοκτήτης', priceMonthly: 5.9, priceAnnual: 49, maxProperties: 6,
    tagline: 'Για ιδιοκτήτες με χαρτοφυλάκιο, ενοικιαστές και Airbnb',
    features: ['Έως 6 ακίνητα, όλων των τύπων', 'Συγκρίσεις παρόχων και αποδόσεων μεταξύ των ακινήτων σου', 'Διαχείριση ενοικιαστών και εισπράξεων', 'Φορολογικές εξαγωγές (Ε2) έτοιμες για τον λογιστή', 'Προτεραιότητα στη σάρωση και στον βοηθό'],
  },
  agency: {
    id: 'agency', name: 'Επαγγελματίας', priceMonthly: 19, priceAnnual: 149, maxProperties: Infinity,
    tagline: 'Για μεσιτικά γραφεία και διαχειριστές ακινήτων με ομάδα',
    features: ['Απεριόριστα ακίνητα', 'Ομαδική διαχείριση: πολλοί χρήστες, ρόλοι και δικαιώματα', 'Αναφορές και έγγραφα με τη δική σου επωνυμία', 'Πελατολόγιο και υποψήφιοι πελάτες (CRM)', 'Υποστήριξη κατά προτεραιότητα'],
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
