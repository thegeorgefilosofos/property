// ═══════════════════════════════════════════════════════════════════════════
// Entitlements — ΜΙΑ πηγή αλήθειας για το «τι επιτρέπει η συνδρομή σου».
// ─────────────────────────────────────────────────────────────────────────
// Κανόνες:
//   • Ο τύπος προφίλ ορίζει ΠΟΙΑ πλάνα μπορείς να αγοράσεις:
//       Ιδιώτης       → Δωρεάν ή Ιδιοκτήτης
//       Επαγγελματίας → Επαγγελματίας
//   • Το «ενεργό» (effective) πλάνο ορίζει ΤΙ βλέπεις. Ισούται με το πλάνο που
//     πληρώνεις, ανυψωμένο προσωρινά από:
//       – ενεργούς δωρεάν μήνες (comp_plan / comp_until, π.χ. από referral)
//       – ιδιότητα Συνεργάτη (partner → Επαγγελματίας)
//   • Κάθε δυνατότητα/καρτέλα έχει ένα ελάχιστο πλάνο. Ό,τι δεν καλύπτει το
//     ενεργό πλάνο εμφανίζεται κλειδωμένο (με πρόσκληση αναβάθμισης).
//
// Το αρχείο είναι καθαρή λογική (χωρίς React/Supabase) ώστε να ελέγχεται με tests
// και να το μοιράζονται client (UI gating) και server (RLS/trigger έχει δικό του).
// ═══════════════════════════════════════════════════════════════════════════

import { PLANS, propertyAllowance, PLAN_ORDER, TRIAL_DAYS, normalizePlan, type PlanId } from './plans';

export type ProfileType = 'individual' | 'professional';

// ── Ποια πλάνα επιτρέπονται ανά τύπο προφίλ ────────────────────────────────
export const ALLOWED_PLANS: Record<ProfileType, PlanId[]> = {
  individual: ['free', 'solo', 'owner'],
  professional: ['agency'],
};

// ── Δυνατότητες υπό όρους συνδρομής (capabilities + κλειδωμένες καρτέλες) ───
export type Feature =
  | 'multi_property'   // προσθήκη 2ου+ ακινήτου
  | 'comparison'       // Σύγκριση ακινήτων
  | 'portfolio'        // Χαρτοφυλάκιο (επισκόπηση όλων)
  | 'clients'          // Πελατολόγιο / CRM
  | 'report_branding'  // επώνυμες αναφορές & έγγραφα
  | 'e2_export'        // εξαγωγή Ε2 για λογιστή
  | 'rent_collection'; // αιτήματα είσπραξης & υπενθυμίσεις οφειλών

// Ελάχιστο πλάνο ανά δυνατότητα.
export const FEATURE_MIN_PLAN: Record<Feature, PlanId> = {
  multi_property:  'owner',
  comparison:      'owner',
  e2_export:       'solo',
  rent_collection: 'solo',
  clients:         'agency',
  portfolio:       'agency',
  report_branding: 'agency',
};

// Ελάχιστο πλάνο ανά καρτέλα πλοήγησης. Ό,τι δεν αναφέρεται εδώ είναι «free».
export const TAB_MIN_PLAN: Record<string, PlanId> = {
  comparison: 'owner',
  portfolio:  'agency',
  clients:    'agency',
};

// Καρτέλες που ο Ιδιώτης δεν μπορεί να ξεκλειδώσει ΜΕ ΚΑΝΕΝΑ πλάνο: τα πλάνα του
// σταματούν στο «Ιδιοκτήτης» και αυτές θέλουν «Επαγγελματίας». Δεν εμφανίζονται
// καθόλου — ούτε κλειδωμένες — γιατί ένα λουκέτο που δεν ανοίγει ποτέ δεν είναι
// πρόσκληση αναβάθμισης, είναι αδιέξοδο.
//
// ΠΑΡΑΓΕΤΑΙ, ΔΕΝ ΓΡΑΦΕΤΑΙ ΞΑΝΑ. Ήταν χειρόγραφη λίστα δίπλα στο TAB_MIN_PLAN, δηλαδή
// δεύτερη πηγή για την ίδια πληροφορία: αν κάποιος κατέβαζε το `clients` σε πλάνο
// «Ιδιοκτήτης», η λίστα θα το κρατούσε κρυφό από τους ιδιώτες που πλέον το πληρώνουν.
export const PROFESSIONAL_ONLY_TABS: ReadonlySet<string> = new Set(
  Object.entries(TAB_MIN_PLAN)
    .filter(([, min]) => !ALLOWED_PLANS.individual.includes(min))
    .map(([tab]) => tab),
);

// Φιλικές ελληνικές ετικέτες για τα μηνύματα αναβάθμισης.
export const FEATURE_LABEL: Record<Feature, string> = {
  multi_property:  'Περισσότερα ακίνητα',
  comparison:      'Σύγκριση ακινήτων',
  portfolio:       'Χαρτοφυλάκιο',
  clients:         'Πελατολόγιο',
  report_branding: 'Επώνυμες αναφορές',
  e2_export:       'Εξαγωγή Ε2',
  rent_collection: 'Είσπραξη ενοικίου',
};

const rank = (p: PlanId): number => {
  const i = PLAN_ORDER.indexOf(p);
  return i < 0 ? 0 : i;
};

/** Είναι το `plan` τουλάχιστον στο επίπεδο `min`; (free < owner < agency) */
export function planAtLeast(plan: PlanId, min: PlanId): boolean {
  return rank(plan) >= rank(min);
}

export interface EntitlementInput {
  /** Βασικό πλάνο (billing_profiles.plan). */
  plan?: string | null;
  profileType?: ProfileType;
  /** Ιδιότητα Συνεργάτη (referral_partners). */
  partner?: boolean;
  /** Δωρεάν πρόσβαση: επίπεδο πλάνου που χαρίστηκε (π.χ. από referral). */
  compPlan?: string | null;
  /** Λήξη της δωρεάν πρόσβασης (ISO). */
  compUntil?: string | null;
  /** Ημερομηνία δημιουργίας λογαριασμού (ISO) — βάση για τη δωρεάν δοκιμή. */
  createdAt?: string | null;
  /** Επιπλέον ακίνητα που έχει αγοράσει (billing_profiles.extra_properties). */
  extraProperties?: number | null;
  /** Χρόνος αναφοράς σε ms (default Date.now()), για ελεγξιμότητα. */
  now?: number;
}

/** Ενεργός δωρεάν μήνας σε ισχύ αυτή τη στιγμή; */
export function activeComp(input: EntitlementInput): { plan: PlanId; until: string } | null {
  if (!input.compUntil || !input.compPlan) return null;
  const until = new Date(input.compUntil).getTime();
  const now = input.now ?? Date.now();
  if (!Number.isFinite(until) || until <= now) return null;
  return { plan: normalizePlan(input.compPlan), until: input.compUntil };
}

/** Κατάσταση δωρεάν δοκιμής.
 *
 * Κάθε νέος λογαριασμός παίρνει TRIAL_DAYS ημέρες στο πλάνο «Ιδιοκτήτης», ώστε
 * να δει την πραγματική αξία (Δήλωση Μίσθωσης, Ε2, ημερολόγιο λογιστή) πριν
 * αποφασίσει. Χωρίς αυτό, ο χρήστης με ένα ακίνητο δεν συναντά ποτέ τους λόγους
 * να πληρώσει. Η δοκιμή ΔΕΝ ισχύει αν έχει ήδη πληρωμένο πλάνο.
 */
export interface TrialState { active: boolean; daysLeft: number; endsAt: string | null }

/** Το επίπεδο που δίνει η δοκιμή. ΠΡΕΠΕΙ να ταυτίζεται με το `greatest(v_rank, 1)`
 *  του `public.user_plan_rank` και με τη διατύπωση των Όρων Χρήσης. */
export const TRIAL_PLAN: PlanId = 'owner';

export function trialState(input: EntitlementInput): TrialState {
  const off: TrialState = { active: false, daysLeft: 0, endsAt: null };
  if (!input.createdAt) return off;
  const start = new Date(input.createdAt).getTime();
  if (!Number.isFinite(start)) return off;
  const now = input.now ?? Date.now();
  const end = start + TRIAL_DAYS * 86400000;
  const endsAt = new Date(end).toISOString();
  if (end <= now) return { active: false, daysLeft: 0, endsAt };
  return { active: true, daysLeft: Math.ceil((end - now) / 86400000), endsAt };
}

/** Το ενεργό (effective) πλάνο: βασικό, ανυψωμένο από δωρεάν δοκιμή, δωρεάν
 *  μήνες ή ιδιότητα Συνεργάτη. */
export function effectivePlan(input: EntitlementInput): PlanId {
  let best = normalizePlan(input.plan);
  // Δωρεάν δοκιμή → ΠΑΝΤΑ «Ιδιοκτήτης», ανεξάρτητα από τον τύπο προφίλ.
  //
  // ΓΙΑΤΙ ΟΧΙ «Επαγγελματίας» ΓΙΑ ΤΟΥΣ ΕΠΑΓΓΕΛΜΑΤΙΕΣ: ο τύπος προφίλ δηλώνεται
  // ελεύθερα από τον χρήστη στο onboarding, χωρίς κανέναν έλεγχο. Αν η δοκιμή
  // ακολουθούσε το προφίλ, οποιοσδήποτε θα έπαιρνε 15 ακίνητα δηλώνοντας
  // «Επαγγελματίας». Κυριότερο: ο server (user_plan_rank) δίνει rank 1 σε κάθε
  // δοκιμή και οι Όροι Χρήσης λένε ρητά «στο επίπεδο Ιδιοκτήτης» — αν το UI
  // έδειχνε όριο 15 ενώ το trigger κόβει στα 3, ο χρήστης θα πατούσε
  // «Προσθήκη ακινήτου» και θα έτρωγε σφάλμα βάσης. Μία αλήθεια παντού.
  const trial = trialState(input);
  if (trial.active && rank(TRIAL_PLAN) > rank(best)) best = TRIAL_PLAN;
  const comp = activeComp(input);
  if (comp && rank(comp.plan) > rank(best)) best = comp.plan;
  if (input.partner && rank('agency') > rank(best)) best = 'agency';
  return best;
}

export function hasFeature(input: EntitlementInput, f: Feature): boolean {
  return planAtLeast(effectivePlan(input), FEATURE_MIN_PLAN[f]);
}

export function isTabAllowed(input: EntitlementInput, tabId: string): boolean {
  const min = TAB_MIN_PLAN[tabId];
  if (!min) return true;
  return planAtLeast(effectivePlan(input), min);
}

/** Το ελάχιστο πλάνο που ξεκλειδώνει μια καρτέλα (default 'free'). */
export function requiredPlanForTab(tabId: string): PlanId {
  return TAB_MIN_PLAN[tabId] ?? 'free';
}

export function requiredPlanForFeature(f: Feature): PlanId {
  return FEATURE_MIN_PLAN[f];
}

/**
 * Όριο ακινήτων: όσα περιλαμβάνει το ενεργό πλάνο ΣΥΝ όσα έχει αγοράσει.
 *
 * ΠΡΕΠΕΙ να συμφωνεί με το `enforce_property_limit` της βάσης. Αν αποκλίνουν, ο
 * χρήστης βλέπει «μπορείς να προσθέσεις» και τρώει σφάλμα βάσης στο πάτημα —
 * ή, χειρότερα, βλέπει «όριο» ενώ έχει πληρώσει για παραπάνω.
 */
export function propertyLimit(input: EntitlementInput): number {
  return propertyAllowance(effectivePlan(input), input.extraProperties ?? 0);
}

export function canAddProperty(input: EntitlementInput, currentCount: number): boolean {
  return currentCount < propertyLimit(input);
}

/** Επιτρέπεται αυτό το πλάνο για το συγκεκριμένο προφίλ; */
export function isPlanAllowedForProfile(profile: ProfileType, plan: PlanId): boolean {
  return ALLOWED_PLANS[profile].includes(plan);
}

/** Το κορυφαίο (πληρωμένο) πλάνο του προφίλ — στόχος αναβάθμισης & δωρεάν μηνών. */
export function paidPlanForProfile(profile: ProfileType): PlanId {
  const allowed = ALLOWED_PLANS[profile];
  return allowed[allowed.length - 1];
}

/**
 * Μπορεί ΠΟΤΕ αυτό το προφίλ να ξεκλειδώσει αυτή την καρτέλα;
 *
 * ΤΙ ΔΕΝ ΑΠΑΝΤΑ: αν η καρτέλα αφορά τον χρήστη. Αυτό το κρίνει το
 * lib/property/visibility.ts, από την κατάσταση του ακινήτου, το πλήθος των
 * ακινήτων και τη νομική μορφή — και είναι η ΜΟΝΑΔΙΚΗ πηγή γι' αυτό.
 *
 * Εδώ κρίνεται μόνο το εμπορικό σκέλος, και χρησιμεύει σε ένα πράγμα: να μη
 * δείχνουμε κλειδωμένη μια καρτέλα που ο χρήστης δεν μπορεί να αγοράσει με
 * κανένα πλάνο του προφίλ του. Οι υπόλοιπες κλειδωμένες ΦΑΙΝΟΝΤΑΙ — εκεί το
 * λουκέτο είναι αληθινή πρόσκληση.
 */
export function isTabPurchasable(profile: ProfileType, tabId: string): boolean {
  // Το κορυφαίο πλάνο που ΜΠΟΡΕΙ να αγοράσει το προφίλ, όχι το τρέχον: η ερώτηση
  // είναι «θα το φτάσει ποτέ;», όχι «το έχει τώρα;».
  return planAtLeast(paidPlanForProfile(profile), requiredPlanForTab(tabId));
}

/** @deprecated Ασαφές όνομα: «relevant» σημαίνει πλέον «αφορά τον χρήστη» και
 *  ζει στο lib/property/visibility.ts. Χρησιμοποίησε το `isTabPurchasable`. */
export const isTabRelevant = isTabPurchasable;
