// ═══════════════════════════════════════════════════════════════════════════
// Referral — ΜΙΑ πηγή αλήθειας για το πρόγραμμα παραπομπών. Δύο ΞΕΧΩΡΙΣΤΑ
// προγράμματα ανά προφίλ, ώστε ο καθένας να βλέπει ό,τι τον αφορά:
//
// ΙΔΙΩΤΗΣ / ΔΩΡΕΑΝ («Πρόγραμμα Πρόσκλησης» — μόνο σε ιδιώτες):
//   • Ανά ενεργή σύσταση: +1 ακίνητο για έναν μήνα, στο πλάνο που ήδη έχεις.
//   • Αν φέρεις κάποιον που γίνεται Επαγγελματίας: +1 μήνας Ιδιώτης (όχι ακίνητο).
//   • 3 νέοι ιδιώτες/δωρεάν μέσα στον μήνα: +1 επιπλέον μήνας Ιδιώτης.
//   • Ο ΝΕΟΣ παίρνει έναν μήνα δωρεάν στο πλάνο που διαλέγει στην αρχή.
//
// ΕΠΑΓΓΕΛΜΑΤΙΑΣ («Πρόγραμμα Συνεργατών» — μόνο σε επαγγελματίες):
//   • 5 ΣΥΝΔΡΟΜΗΤΕΣ (Ιδιώτης/Επαγγελματίας) μέσα στον μήνα: +2 μήνες Επαγγελματία.
//   • 10 δωρεάν χρήστες μέσα στον μήνα: +1 μήνας Επαγγελματία.
//   • ΙΔΙΟΤΗΤΑ ΣΥΝΕΡΓΑΤΗ (σερί): 5 συνδρομητές για 3 συνεχόμενους μήνες →
//       – κάθε μήνας που πιάνει τον στόχο → ο επόμενος μήνας δωρεάν Επαγγελματίας
//       – σήμα Συνεργάτη + προτεραιότητα στην επικοινωνία & εξυπηρέτηση
//
// ΓΙΑΤΙ ΔΕΝ ΥΠΑΡΧΕΙ ΠΡΟΜΗΘΕΙΑ ΣΕ ΜΕΤΡΗΤΑ (αφαιρέθηκε «20% κάθε μήνα»)
// Η οθόνη υποσχόταν «20% προμήθεια σε κάθε συνδρομή που φέρνεις, κάθε μήνα» και
// πίσω από την υπόσχεση δεν υπήρχε ΤΙΠΟΤΑ: ο πίνακας `referral_rewards` δέχεται
// μόνο kind = 'months' | 'slot' — καμία εγγραφή προμήθειας, κανένα ledger, κανένα
// payout. Ταυτόχρονα η στρατηγική αποκλείει ρητά την επεξεργασία πληρωμών
// (docs/STRATEGY.md §5, «Τι ΔΕΝ θα κάνουμε»). Μια υπόσχεση χρημάτων που δεν
// μπορεί να πληρωθεί, σε προϊόν που πουλάει ακρίβεια, κοστίζει την εμπιστοσύνη —
// και απευθυνόταν στον λογιστή, δηλαδή στο κανάλι διανομής μας.
// Άρα: όλα ΑΞΙΑ ΠΡΟΪΟΝΤΟΣ (δωρεάν μήνες), που αυτοχρηματοδοτούνται επειδή τα
// «πληρωμένα» milestones μετρούν ΣΥΝΔΡΟΜΗΤΕΣ. Η ανταμοιβή κλειδώνει ΜΟΝΟ στην
// ΕΝΕΡΓΟΠΟΙΗΣΗ (ακίνητο + 1 σάρωση), επαληθευμένη server-side.
// Καθαρές, ντετερμινιστικές συναρτήσεις: καμία εξωτερική εξάρτηση.
// ═══════════════════════════════════════════════════════════════════════════

// ── Ενεργοποίηση ────────────────────────────────────────────────────────────
import { normalizePhone } from '../core/greek';

export const ACTIVATION_MIN_PROPERTIES = 1;
export const ACTIVATION_MIN_DOCUMENTS = 1;
export const REFEREE_TRIAL_MONTHS = 1;   // δώρο καλωσορίσματος στον νέο χρήστη

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
// Η κανονικοποίηση τηλεφώνου γίνεται ΜΙΑ φορά, στο lib/core/greek.ts.
export { normalizePhone };

const normEmail = (e: string | null | undefined) => (e || '').trim().toLowerCase();

/**
 * Τηλέφωνο σε μορφή που ΕΠΙΤΡΕΠΕΤΑΙ να συγκριθεί για διπλότυπο.
 *
 * ΓΙΑΤΙ ΧΩΡΙΣΤΑ ΑΠΟ ΤΗΝ ΚΑΝΟΝΙΚΟΠΟΙΗΣΗ: αυτός είναι κανόνας anti-abuse, όχι
 * ανάγνωσης. Δύο μισοσυμπληρωμένα τηλέφωνα («694», «694») δεν είναι απόδειξη ότι
 * πρόκειται για το ίδιο πρόσωπο — και θα έκοβαν άδικα μια πραγματική παραπομπή.
 * Κάτω από 9 ψηφία, δεν συγκρίνουμε.
 */
const comparablePhone = (p: string | null | undefined): string => {
  const n = normalizePhone(p);
  return n.length >= 9 ? n : '';
};

export function isSelfOrDuplicate(s: {
  referrerId: string; refereeId: string;
  referrerEmail?: string | null; refereeEmail?: string | null;
  referrerPhone?: string | null; refereePhone?: string | null;
  sharedDevice?: boolean;
}): boolean {
  if (s.referrerId && s.refereeId && s.referrerId === s.refereeId) return true;
  if (normEmail(s.referrerEmail) && normEmail(s.referrerEmail) === normEmail(s.refereeEmail)) return true;
  const rp = comparablePhone(s.referrerPhone), ep = comparablePhone(s.refereePhone);
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
//  ΤΙ ΑΛΛΑΞΕ ΚΑΙ ΓΙΑΤΙ. Ο συστήνων έπαιρνε ΑΛΛΟ δώρο ανάλογα με το αν πλήρωνε
//  ήδη: ακίνητο αν ήταν δωρεάν, μήνα αν ήταν συνδρομητής. Δύο κανόνες για την
//  ίδια πράξη, που κανείς δεν μπορούσε να εξηγήσει σε μία πρόταση. Τώρα είναι
//  ένας: ΕΝΑ ΑΚΙΝΗΤΟ ΠΑΡΑΠΑΝΩ ΓΙΑ ΕΝΑΝ ΜΗΝΑ, στο πλάνο που ήδη έχεις — και
//  δουλεύει το ίδιο για τον δωρεάν και για τον συνδρομητή.
//
//  Η ΜΟΝΗ ΕΞΑΙΡΕΣΗ ΕΧΕΙ ΛΟΓΟ: αν ο νέος γίνει Επαγγελματίας, το «ένα ακίνητο
//  παραπάνω» είναι μικρό δώρο για πολύ μεγαλύτερη σύσταση. Εκεί δίνεται μήνας.
//
//  Συστήνων (οποιοδήποτε πλάνο):     εσύ +1 ακίνητο για 1 μήνα
//  Νέος γίνεται ΕΠΑΓΓΕΛΜΑΤΙΑΣ:       εσύ +1 μήνας Ιδιώτης
//  Ο ΝΕΟΣ, ό,τι πλάνο κι αν διαλέξει: 1 μήνας δωρεάν σε αυτό
//  Όγκος: 3 νέοι ιδιώτες μέσα στον μήνα → +1 επιπλέον μήνας Ιδιώτης
// ═══════════════════════════════════════════════════════════════════════════
export const REFERRER_SLOT_MONTHS = 1;        // κάθε συστήνων: +1 ακίνητο για 1 μήνα
export const INDIV_PRO_BONUS_MONTHS = 1;      // αν ο νέος γίνει Επαγγελματίας → +1 μήνας Ιδιώτης
export const INDIV_VOLUME_TARGET = 3;         // 3 νέοι ιδιώτες μέσα στον μήνα
export const INDIV_VOLUME_BONUS_MONTHS = 1;   // → +1 μήνας Ιδιώτης
// Δώρο νέου χρήστη, ανά επιλογή πλάνου
export const REFEREE_FREE_SLOT_MONTHS = 1;    // μένει δωρεάν: +1 ακίνητο για 1 μήνα
export const REFEREE_OWNER_MONTHS = 1;        // μπαίνει Ιδιώτης: 1 μήνας δωρεάν
export const REFEREE_AGENCY_MONTHS = 1;       // γίνεται Επαγγελματίας: 1 μήνας δωρεάν

export type Outcome = 'free' | 'owner' | 'agency';
export type SideReward = { months: number; isSlot: boolean; tier: 'owner' | 'agency' };

/**
 * Τι κερδίζει ο ΣΥΣΤΗΝΩΝ.
 *
 * Το `referrerPaying` δεν διαβάζεται πια: ο κανόνας είναι ένας για όλους. Μένει
 * στην υπογραφή γιατί το ξέρουν οι καλούντες και δεν κοστίζει· αν φύγει, φεύγει
 * με ξεχωριστή αλλαγή σε όλα τα σημεία μαζί.
 */
export function individualReferrerReward(_referrerPaying: boolean, outcome: Outcome): SideReward {
  if (outcome === 'agency') return { months: INDIV_PRO_BONUS_MONTHS, isSlot: false, tier: 'owner' };
  return { months: REFERRER_SLOT_MONTHS, isSlot: true, tier: 'owner' };
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

/**
 * Δωρεάν μήνες Συνεργάτη από ένα ιστορικό μηνών: κάθε μήνας που πιάνει τον στόχο
 * χαρίζει τον επόμενο. Αυτή είναι η ΜΟΝΗ ανταμοιβή του Συνεργάτη και είναι αξία
 * προϊόντος — πληρώνεται από τις ίδιες τις συνδρομές που έφερε, όχι από ταμείο.
 *
 * Μετρά μόνο μήνες ΜΕΣΑ στο σερί: χωρίς την ιδιότητα Συνεργάτη δεν οφείλεται
 * δωρεάν μήνας, αλλιώς θα χαρίζαμε μήνες σε κάθε τυχαίο καλό μήνα.
 */
export function partnerFreeMonths(paidMonthlyCounts: number[]): number {
  if (!isPartner(paidMonthlyCounts)) return 0;
  return currentStreak(paidMonthlyCounts) * PARTNER_MONTHLY_FREE_MONTHS;
}
