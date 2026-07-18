// ═══════════════════════════════════════════════════════════════════════════
// Referral — ΜΙΑ πηγή αλήθειας για το πρόγραμμα παραπομπών. Δύο ΞΕΧΩΡΙΣΤΑ
// προγράμματα ανά προφίλ, ώστε ο καθένας να βλέπει ό,τι τον αφορά:
//
// ΙΔΙΩΤΗΣ / ΔΩΡΕΑΝ («Πρόγραμμα Πρόσκλησης» — μόνο σε ιδιώτες):
//   • Ανά ενεργή σύσταση: +1 μήνας Ιδιώτης σε σένα, δώρο καλωσορίσματος στον νέο.
//   • Αν φέρεις κάποιον που γίνεται Επαγγελματίας: +2 μήνες Ιδιώτης.
//   • 5 νέοι ιδιώτες/δωρεάν μέσα στον μήνα: +1 επιπλέον μήνας Ιδιώτης.
//
// ΕΠΑΓΓΕΛΜΑΤΙΑΣ («Πρόγραμμα Συνεργατών» — μόνο σε επαγγελματίες):
//   • 5 ΣΥΝΔΡΟΜΗΤΕΣ (Ιδιώτης/Επαγγελματίας) μέσα στον μήνα: +2 μήνες Επαγγελματία.
//   • 10 δωρεάν χρήστες μέσα στον μήνα: +1 μήνας Επαγγελματία.
//   • ΙΔΙΟΤΗΤΑ ΣΥΝΕΡΓΑΤΗ (σερί): 5 συνδρομητές για 3 συνεχόμενους μήνες →
//       – 20% επαναλαμβανόμενη προμήθεια στις συνδρομές που φέρνει
//       – κάθε μήνας που πιάνει τον στόχο → ο επόμενος μήνας δωρεάν Επαγγελματίας
//       – σήμα Συνεργάτη + προτεραιότητα στην επικοινωνία & εξυπηρέτηση
//
// Ασφάλεια / οικονομικά: όλα ΑΞΙΑ ΠΡΟΪΟΝΤΟΣ (μηδενικό οριακό κόστος, όχι μετρητά)·
// τα «πληρωμένα» milestones μετρούν μόνο ΣΥΝΔΡΟΜΗΤΕΣ (αυτοχρηματοδοτούνται)· η
// ανταμοιβή κλειδώνει ΜΟΝΟ στην ΕΝΕΡΓΟΠΟΙΗΣΗ (ακίνητο + 1 σάρωση), επαληθευμένη
// server-side. Καθαρές, ντετερμινιστικές συναρτήσεις: καμία εξωτερική εξάρτηση.
// ═══════════════════════════════════════════════════════════════════════════

// ── Ενεργοποίηση ────────────────────────────────────────────────────────────
export const ACTIVATION_MIN_PROPERTIES = 1;
export const ACTIVATION_MIN_DOCUMENTS = 1;
export const REFEREE_TRIAL_MONTHS = 2;   // δώρο καλωσορίσματος στον νέο χρήστη

// ── Κωδικός & σύνδεσμος πρόσκλησης ──────────────────────────────────────────
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function referralCode(userId: string): string {
  // 32-bit hash → base36 χωρίς απώλεια ψηφίων (max 4.294.967.295 = 7 ψηφία base36).
  // ΔΕΝ κόβουμε ουρά (θα προκαλούσε συγκρούσεις — δύο χρήστες, ίδιος κωδικός).
  const base = fnv1a(userId).toString(36).toUpperCase().padStart(7, '0');
  return 'PO' + base;
}

export function referralLink(origin: string, userId: string): string {
  return `${origin.replace(/\/+$/, '')}/signup?ref=${referralCode(userId)}`;
}

// ── Anti-abuse: αυτο-παραπομπή / διπλότυπο (id, email, τηλέφωνο, συσκευή) ─────
export function normalizePhone(p: string | null | undefined): string {
  const digits = (p || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-10) : '';
}
const normEmail = (e: string | null | undefined) => (e || '').trim().toLowerCase();

export function isSelfOrDuplicate(s: {
  referrerId: string; refereeId: string;
  referrerEmail?: string | null; refereeEmail?: string | null;
  referrerPhone?: string | null; refereePhone?: string | null;
  sharedDevice?: boolean;
}): boolean {
  if (s.referrerId && s.refereeId && s.referrerId === s.refereeId) return true;
  if (normEmail(s.referrerEmail) && normEmail(s.referrerEmail) === normEmail(s.refereeEmail)) return true;
  const rp = normalizePhone(s.referrerPhone), ep = normalizePhone(s.refereePhone);
  if (rp && rp === ep) return true;
  if (s.sharedDevice === true) return true;
  return false;
}

/** Έγκυρη μόνο αν ο φίλος είναι ΑΛΛΟΣ, νέος χρήστης, χωρίς σημάδι διπλότυπου. */
export function isValidReferral(referrerId: string, refereeId: string, refereeIsNew: boolean): boolean {
  return !!referrerId && !!refereeId && referrerId !== refereeId && refereeIsNew;
}

/** Η σύσταση «κλειδώνει» μόνο εδώ: ο νέος πρόσθεσε ακίνητο & σάρωσε έγγραφο. */
export function isActivated(state: { propertiesAdded: number; documentsScanned: number }): boolean {
  return state.propertiesAdded >= ACTIVATION_MIN_PROPERTIES && state.documentsScanned >= ACTIVATION_MIN_DOCUMENTS;
}

// ═══════════════════════════════════════════════════════════════════════════
// ΠΡΟΓΡΑΜΜΑ ΙΔΙΩΤΗ — ανά ΠΛΑΝΟ ΣΥΣΤΗΝΟΝΤΑ και ΤΙ ΕΓΙΝΕ ο νέος
// ─────────────────────────────────────────────────────────────────────────
//  Συστήνων ΔΩΡΕΑΝ, νέος δωρεάν:     εσύ +1 ακίνητο για 1 μήνα · νέος +1 ακίνητο για 2 μήνες
//  Συστήνων ΙΔΙΩΤΗΣ, νέος δωρεάν:    εσύ +1 μήνας Ιδιώτης      · νέος +1 ακίνητο για 2 μήνες
//  Νέος μπαίνει στο ΙΔΙΩΤΗΣ:          νέος 2 μήνες Ιδιώτης δωρεάν
//  Νέος γίνεται ΕΠΑΓΓΕΛΜΑΤΙΑΣ:        εσύ +2 μήνες Ιδιώτης      · νέος 1 μήνας Επαγγελματία
//  Όγκος: 5 νέοι ιδιώτες μέσα στον μήνα → +1 επιπλέον μήνας Ιδιώτης
// ═══════════════════════════════════════════════════════════════════════════
export const FREE_REFERRER_SLOT_MONTHS = 1;   // δωρεάν συστήνων: +1 ακίνητο για 1 μήνα
export const OWNER_REFERRER_MONTHS = 1;       // Ιδιώτης συστήνων: +1 μήνας Ιδιώτης
export const INDIV_PRO_BONUS_MONTHS = 2;      // αν ο νέος γίνει Επαγγελματίας → +2 μήνες Ιδιώτης
export const INDIV_VOLUME_TARGET = 5;         // 5 νέοι ιδιώτες μέσα στον μήνα
export const INDIV_VOLUME_BONUS_MONTHS = 1;   // → +1 μήνας Ιδιώτης
// Δώρο νέου χρήστη, ανά επιλογή πλάνου
export const REFEREE_FREE_SLOT_MONTHS = 2;    // μένει δωρεάν: +1 ακίνητο για 2 μήνες
export const REFEREE_OWNER_MONTHS = 2;        // μπαίνει Ιδιώτης: 2 μήνες δωρεάν
export const REFEREE_AGENCY_MONTHS = 1;       // γίνεται Επαγγελματίας: 1 μήνας δωρεάν

export type Outcome = 'free' | 'owner' | 'agency';
export type SideReward = { months: number; isSlot: boolean; tier: 'owner' | 'agency' };

/** Τι κερδίζει ο ΣΥΣΤΗΝΩΝ (ανά δικό του πλάνο + τι έγινε ο νέος). */
export function individualReferrerReward(referrerPaying: boolean, outcome: Outcome): SideReward {
  if (outcome === 'agency') return { months: INDIV_PRO_BONUS_MONTHS, isSlot: false, tier: 'owner' };
  if (!referrerPaying)      return { months: FREE_REFERRER_SLOT_MONTHS, isSlot: true, tier: 'owner' };
  return { months: OWNER_REFERRER_MONTHS, isSlot: false, tier: 'owner' };
}

/** Τι κερδίζει ο ΝΕΟΣ χρήστης (ανά επιλογή πλάνου). */
export function refereeWelcome(outcome: Outcome): SideReward {
  if (outcome === 'agency') return { months: REFEREE_AGENCY_MONTHS, isSlot: false, tier: 'agency' };
  if (outcome === 'owner')  return { months: REFEREE_OWNER_MONTHS, isSlot: false, tier: 'owner' };
  return { months: REFEREE_FREE_SLOT_MONTHS, isSlot: true, tier: 'owner' };
}

// ═══════════════════════════════════════════════════════════════════════════
// ΠΡΟΓΡΑΜΜΑ ΕΠΑΓΓΕΛΜΑΤΙΑ
// ═══════════════════════════════════════════════════════════════════════════
export const PRO_PAID_TARGET = 5;             // 5 συνδρομητές/μήνα
export const PRO_PAID_BONUS_MONTHS = 2;       // → 2 μήνες Επαγγελματία
export const PRO_FREE_TARGET = 10;            // 10 δωρεάν χρήστες/μήνα
export const PRO_FREE_BONUS_MONTHS = 1;       // → 1 μήνας Επαγγελματία

// ═══════════════════════════════════════════════════════════════════════════
// ΙΔΙΟΤΗΤΑ ΣΥΝΕΡΓΑΤΗ (σερί επαγγελματία στους συνδρομητές)
// ═══════════════════════════════════════════════════════════════════════════
export const STREAK_TARGET_MONTHS = 3;        // συνεχόμενοι μήνες με PRO_PAID_TARGET συνδρομητές
export const PARTNER_COMMISSION_RATE = 0.20;  // % επί των συνδρομών που φέρνει
export const PARTNER_MONTHLY_FREE_MONTHS = 1; // κάθε επιτυχημένος μήνας → επόμενος δωρεάν

/** Γενική πρόοδος «X/target» για τις μπάρες. */
export function progress(count: number, target: number): { count: number; target: number; remaining: number; reached: boolean; pct: number } {
  const c = Math.max(0, Math.floor(count || 0));
  const t = Math.max(1, target);
  return { count: c, target: t, remaining: Math.max(0, t - c), reached: c >= t, pct: Math.min(100, (c / t) * 100) };
}

/** Τρέχον σερί: συνεχόμενοι ΤΕΛΕΥΤΑΙΟΙ μήνες με ≥ PRO_PAID_TARGET ΣΥΝΔΡΟΜΗΤΕΣ.
 *  paidMonthlyCounts: συνδρομητές-συστάσεις ανά μήνα, από παλιότερο → πιο πρόσφατο. */
export function currentStreak(paidMonthlyCounts: number[]): number {
  let n = 0;
  for (let i = paidMonthlyCounts.length - 1; i >= 0; i--) {
    if ((paidMonthlyCounts[i] || 0) >= PRO_PAID_TARGET) n++;
    else break;
  }
  return n;
}

export function isPartner(paidMonthlyCounts: number[]): boolean {
  return currentStreak(paidMonthlyCounts) >= STREAK_TARGET_MONTHS;
}

/** Πρόοδος προς την ιδιότητα Συνεργάτη (για την μπάρα «X/3 μήνες»). */
export function streakProgress(paidMonthlyCounts: number[]): { current: number; target: number; reached: boolean; pct: number } {
  const streak = currentStreak(paidMonthlyCounts);
  const current = Math.min(streak, STREAK_TARGET_MONTHS);
  return { current, target: STREAK_TARGET_MONTHS, reached: streak >= STREAK_TARGET_MONTHS, pct: Math.min(100, (current / STREAK_TARGET_MONTHS) * 100) };
}

/** Μηνιαία προμήθεια Συνεργάτη (20%) επί των συνδρομών που φέρνει. */
export function partnerCommission(referredMonthlyRevenue: number): number {
  return Math.max(0, referredMonthlyRevenue) * PARTNER_COMMISSION_RATE;
}

export function partnerCommissionFromSubs(monthlySubs: number[]): number {
  const total = monthlySubs.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  return partnerCommission(total);
}
