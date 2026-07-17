// ═══════════════════════════════════════════════════════════════════════════
// Referral — ΜΙΑ πηγή αλήθειας για το πρόγραμμα παραπομπών «ιδιοκτήτες φέρνουν
// ιδιοκτήτες». Μοντέλο αξίας-για-αξία (τύπου Dropbox), ΟΧΙ μετρητά: σχεδόν
// μηδενικό οριακό κόστος, μη ζημιογόνο, χτίζει property culture.
//
// Υβριδικός κανόνας ανταμοιβής (εγκεκριμένος):
//   • Δωρεάν χρήστης που προσκαλεί  → +1 μόνιμη θέση ακινήτου (κόστος 0€),
//     με ανώτατο όριο κερδισμένων θέσεων (πέρα από αυτό: αναβάθμιση).
//   • Πληρωμένος χρήστης που προσκαλεί → +1 μήνας του πλάνου του δωρεάν.
//   • Ο φίλος που έρχεται → 2 μήνες δυνατοτήτων «Ιδιοκτήτη» δωρεάν.
//
// Ασφαλιστικές δικλείδες (μη ζημιογόνο, μη gameable):
//   • Η ανταμοιβή δίνεται ΜΟΝΟ στην ΕΝΕΡΓΟΠΟΙΗΣΗ (ο φίλος πρόσθεσε ακίνητο και
//     σάρωσε 1 έγγραφο), όχι στην απλή εγγραφή.
//   • Μηνιαίο πλαφόν ανταμοιβών ανά χρήστη.
//   • Μπλοκ αυτο-παραπομπής και μη-νέων λογαριασμών.
//
// Καθαρές, ντετερμινιστικές συναρτήσεις: καμία εξωτερική εξάρτηση, καμία
// αποθήκευση, τίποτα τυχαίο. Η ανίχνευση ενεργοποίησης και η εγγραφή στη βάση
// γίνονται στο app· εδώ ζει μόνο η λογική/οι κανόνες.
// ═══════════════════════════════════════════════════════════════════════════

import { normalizePlan, planLimit, type PlanId } from '../billing/plans';

// ── Παράμετροι προγράμματος (Φάση 1· αναπροσαρμόζονται με δεδομένα) ──────────
export const REFEREE_TRIAL_MONTHS = 2;         // δώρο στον νέο χρήστη
export const PAID_REWARD_MONTHS = 1;           // δώρο ανά παραπομπή σε πληρωμένο
export const MAX_EARNED_SLOTS = 3;             // πλαφόν κερδισμένων θέσεων (δωρεάν)
export const MONTHLY_REWARD_CAP = 5;           // ανταμοιβές/μήνα ανά χρήστη (anti-abuse)
export const ACTIVATION_MIN_PROPERTIES = 1;    // ενεργοποίηση: ≥1 ακίνητο
export const ACTIVATION_MIN_DOCUMENTS = 1;     // ενεργοποίηση: ≥1 σάρωση

export type ReferralStatus = 'pending' | 'activated' | 'rewarded' | 'blocked';

export type ReferrerReward =
  | { kind: 'slot'; slots: number }
  | { kind: 'free_month'; months: number }
  | { kind: 'none'; reason: 'cap_reached' | 'slots_maxed' };

// ── Κωδικός & σύνδεσμος πρόσκλησης ──────────────────────────────────────────
// Ντετερμινιστικός κωδικός από το userId (FNV-1a → base36). Σταθερός, χωρίς
// αποθήκευση· τα userId είναι μη-απαριθμήσιμα UUID, άρα δεν μαντεύεται.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function referralCode(userId: string): string {
  const base = fnv1a(userId).toString(36).toUpperCase();
  return ('PO' + base.padStart(6, '0')).slice(0, 8);
}

export function referralLink(origin: string, userId: string): string {
  const clean = origin.replace(/\/+$/, '');
  return `${clean}/signup?ref=${referralCode(userId)}`;
}

// ── Εγκυρότητα παραπομπής ───────────────────────────────────────────────────
/** Έγκυρη μόνο αν ο φίλος είναι ΑΛΛΟΣ, νέος χρήστης, με κωδικό που δείχνει σε άλλον. */
export function isValidReferral(referrerId: string, refereeId: string, refereeIsNew: boolean): boolean {
  return !!referrerId && !!refereeId && referrerId !== refereeId && refereeIsNew;
}

/** Πλαφόν ανταμοιβών του τρέχοντος μήνα δεν έχει εξαντληθεί. */
export function withinMonthlyCap(rewardsThisMonth: number): boolean {
  return rewardsThisMonth < MONTHLY_REWARD_CAP;
}

// ── Ενεργοποίηση: η ανταμοιβή «κλειδώνει» μόνο εδώ ──────────────────────────
export function isActivated(state: { propertiesAdded: number; documentsScanned: number }): boolean {
  return state.propertiesAdded >= ACTIVATION_MIN_PROPERTIES && state.documentsScanned >= ACTIVATION_MIN_DOCUMENTS;
}

// ── Υπολογισμός ανταμοιβής του προσκαλούντος (υβριδικός κανόνας) ────────────
export function referrerRewardFor(planId: string | null | undefined, earnedSlotsSoFar: number, rewardsThisMonth: number): ReferrerReward {
  if (!withinMonthlyCap(rewardsThisMonth)) return { kind: 'none', reason: 'cap_reached' };
  const plan: PlanId = normalizePlan(planId);
  if (plan === 'free') {
    if (earnedSlotsSoFar >= MAX_EARNED_SLOTS) return { kind: 'none', reason: 'slots_maxed' };
    return { kind: 'slot', slots: 1 };
  }
  return { kind: 'free_month', months: PAID_REWARD_MONTHS };
}

/** Το δώρο του νέου χρήστη: δοκιμή δυνατοτήτων «Ιδιοκτήτη». */
export function refereeReward(): { kind: 'free_month'; months: number } {
  return { kind: 'free_month', months: REFEREE_TRIAL_MONTHS };
}

// ── Πραγματικό όριο ακινήτων: βάση πλάνου + κερδισμένες θέσεις ───────────────
export function effectiveMaxProperties(planId: string | null | undefined, earnedSlots: number): number {
  const base = planLimit(planId);
  if (!isFinite(base)) return Infinity;
  const slots = Math.max(0, Math.min(earnedSlots, MAX_EARNED_SLOTS));
  return base + slots;
}

/** Μπορεί να προσθέσει ακόμη ένα ακίνητο, λαμβάνοντας υπόψη κερδισμένες θέσεις. */
export function canAddWithReferrals(planId: string | null | undefined, earnedSlots: number, currentCount: number): boolean {
  return currentCount < effectiveMaxProperties(planId, earnedSlots);
}
