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

import { PLANS, PLAN_ORDER, normalizePlan, type PlanId } from './plans';

export type ProfileType = 'individual' | 'professional';

// ── Ποια πλάνα επιτρέπονται ανά τύπο προφίλ ────────────────────────────────
export const ALLOWED_PLANS: Record<ProfileType, PlanId[]> = {
  individual: ['free', 'owner'],
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
  e2_export:       'owner',
  rent_collection: 'owner',
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

// Καρτέλες που, όταν είναι κλειδωμένες για το τρέχον προφίλ, δεν έχει νόημα να
// εμφανίζονται καθόλου (ο Ιδιώτης δεν μπορεί ποτέ να φτάσει στο Επαγγελματία).
// Εμφανίζονται (κλειδωμένες) ΜΟΝΟ στους επαγγελματίες.
export const PROFESSIONAL_ONLY_TABS = new Set(['portfolio', 'clients']);

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

/** Το ενεργό (effective) πλάνο: βασικό, ανυψωμένο από δωρεάν μήνες ή ιδιότητα Συνεργάτη. */
export function effectivePlan(input: EntitlementInput): PlanId {
  let best = normalizePlan(input.plan);
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

/** Όριο ακινήτων με βάση το ενεργό πλάνο. */
export function propertyLimit(input: EntitlementInput): number {
  return PLANS[effectivePlan(input)].maxProperties;
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

/** Πρέπει η καρτέλα να εμφανίζεται στην μπάρα για αυτό το προφίλ; (ανεξάρτητα από lock) */
export function isTabRelevant(profile: ProfileType, tabId: string): boolean {
  if (PROFESSIONAL_ONLY_TABS.has(tabId)) return profile === 'professional';
  return true;
}
