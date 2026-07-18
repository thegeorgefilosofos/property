// ═══════════════════════════════════════════════════════════════════════════
// Referral — ΜΙΑ πηγή αλήθειας για το πρόγραμμα παραπομπών «ιδιοκτήτες φέρνουν
// ιδιοκτήτες». Μοντέλο αξίας-για-αξία (τύπου Dropbox), ΟΧΙ μετρητά: σχεδόν
// μηδενικό οριακό κόστος, μη ζημιογόνο, χτίζει property culture.
//
// Υβριδικός κανόνας ανταμοιβής, ανά ΠΡΟΦΙΛ προσκαλούντος και ΤΙ έφερε:
//   • Δωρεάν χρήστης → φίλο (δωρεάν/ιδιώτη):  +1 θέση ακινήτου για 1 μήνα
//                    → φίλο επαγγελματία:      1 μήνας «Ιδιοκτήτη» δωρεάν
//   • Ιδιοκτήτης (paid) → φίλο:                1 μήνας δωρεάν
//                       → φίλο επαγγελματία:    2 μήνες (μπόνους υψηλής αξίας)
//   • Επαγγελματίας → φίλο:                     1 μήνας δωρεάν
//                    → φίλο επαγγελματία:        2 μήνες
//     Οι επαγγελματίες έχουν πολύ υψηλότερο μηνιαίο πλαφόν, ώστε το πρόγραμμα
//     να είναι ιδιαίτερα δελεαστικό (φέρνουν πολλούς πελάτες-ιδιοκτήτες).
//   • Ο φίλος που έρχεται → πάντα 2 μήνες δυνατοτήτων «Ιδιοκτήτη» δωρεάν.
//
// Η θέση του δωρεάν χρήστη είναι ΠΡΟΣΩΡΙΝΗ (λήγει), όχι μόνιμη· έτσι το κίνητρο
// μένει ζωντανό και δεν «τρώει» το πληρωμένο tier.
//
// Ασφαλιστικές δικλείδες (μη ζημιογόνο, μη gameable):
//   • Ανταμοιβή ΜΟΝΟ στην ΕΝΕΡΓΟΠΟΙΗΣΗ (ακίνητο + 1 σάρωση), όχι στην εγγραφή.
//   • Μηνιαίο πλαφόν ανά προφίλ. Μπλοκ αυτο-παραπομπής με id, email, ΤΗΛΕΦΩΝΟ
//     και κοινή συσκευή.
//
// Καθαρές, ντετερμινιστικές συναρτήσεις: καμία εξωτερική εξάρτηση/αποθήκευση,
// τίποτα τυχαίο. Η ανίχνευση ενεργοποίησης και η εγγραφή στη βάση γίνονται στο
// app· εδώ ζει μόνο η λογική/οι κανόνες.
// ═══════════════════════════════════════════════════════════════════════════

import { normalizePlan, planLimit, type PlanId } from '../billing/plans';

// ── Παράμετροι προγράμματος (Φάση 1· αναπροσαρμόζονται με δεδομένα) ──────────
export const REFEREE_TRIAL_MONTHS = 2;   // δώρο στον νέο χρήστη
export const SLOT_REWARD_MONTHS = 1;     // διάρκεια της κερδισμένης θέσης (δωρεάν)
export const PAID_REWARD_MONTHS = 1;         // βασικό δώρο μήνα (πληρωμένος)
export const PAID_REFEREE_BONUS_MONTHS = 1;  // μπόνους όταν ο φίλος γίνεται συνδρομητής (Ιδιοκτήτης/Επαγγελματίας)
export const MAX_ACTIVE_SLOTS = 3;       // πλαφόν ΕΝΕΡΓΩΝ κερδισμένων θέσεων
export const MONTHLY_CAP_DEFAULT = 5;    // ανταμοιβές/μήνα (δωρεάν/ιδιοκτήτης)
export const MONTHLY_CAP_AGENCY = 20;    // ανταμοιβές/μήνα (επαγγελματίας)
export const ACTIVATION_MIN_PROPERTIES = 1;
export const ACTIVATION_MIN_DOCUMENTS = 1;

export type ReferralStatus = 'pending' | 'activated' | 'rewarded' | 'blocked';

export type ReferrerReward =
  | { kind: 'slot'; slots: number; months: number }
  | { kind: 'free_month'; months: number }
  | { kind: 'none'; reason: 'cap_reached' | 'slots_maxed' };

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

// ── Πλαφόν μήνα ανά προφίλ ──────────────────────────────────────────────────
export function monthlyCapFor(planId: string | null | undefined): number {
  return normalizePlan(planId) === 'agency' ? MONTHLY_CAP_AGENCY : MONTHLY_CAP_DEFAULT;
}
export function withinMonthlyCap(planId: string | null | undefined, rewardsThisMonth: number): boolean {
  return rewardsThisMonth < monthlyCapFor(planId);
}

// ── Ενεργοποίηση: η ανταμοιβή «κλειδώνει» μόνο εδώ ──────────────────────────
export function isActivated(state: { propertiesAdded: number; documentsScanned: number }): boolean {
  return state.propertiesAdded >= ACTIVATION_MIN_PROPERTIES && state.documentsScanned >= ACTIVATION_MIN_DOCUMENTS;
}

// ── Ανταμοιβή προσκαλούντος: πίνακας (προφίλ προσκαλούντος × τι έφερε) ───────
export function referrerRewardFor(
  referrerPlan: string | null | undefined,
  refereePlan: string | null | undefined,
  activeSlots: number,
  rewardsThisMonth: number,
): ReferrerReward {
  if (!withinMonthlyCap(referrerPlan, rewardsThisMonth)) return { kind: 'none', reason: 'cap_reached' };
  const rp: PlanId = normalizePlan(referrerPlan);
  const rp2: PlanId = normalizePlan(refereePlan);
  const paidReferee = rp2 === 'owner' || rp2 === 'agency';   // ο φίλος έγινε συνδρομητής

  if (rp === 'free') {
    // Έφερε πληρωμένο χρήστη → μήνας Ιδιοκτήτη· αλλιώς προσωρινή θέση ακινήτου.
    if (paidReferee) return { kind: 'free_month', months: PAID_REWARD_MONTHS };
    if (activeSlots >= MAX_ACTIVE_SLOTS) return { kind: 'none', reason: 'slots_maxed' };
    return { kind: 'slot', slots: 1, months: SLOT_REWARD_MONTHS };
  }
  // Πληρωμένοι (owner/agency): 1 μήνας ανά φίλο, 2 αν ο φίλος έγινε συνδρομητής.
  return { kind: 'free_month', months: PAID_REWARD_MONTHS + (paidReferee ? PAID_REFEREE_BONUS_MONTHS : 0) };
}

/** Το δώρο του νέου χρήστη: δοκιμή δυνατοτήτων «Ιδιοκτήτη». */
export function refereeReward(): { kind: 'free_month'; months: number } {
  return { kind: 'free_month', months: REFEREE_TRIAL_MONTHS };
}

// ── Ενεργές θέσεις (με λήξη) & πραγματικό όριο ακινήτων ─────────────────────
/** Πόσες κερδισμένες θέσεις είναι ακόμη ενεργές (μη ληγμένες) τη δεδομένη στιγμή. */
export function countActiveSlots(grants: { expiresAt: string | null }[], nowIso: string): number {
  const now = Date.parse(nowIso);
  let n = 0;
  for (const g of grants) {
    if (g.expiresAt === null) { n++; continue; }        // μόνιμη (legacy)
    if (Date.parse(g.expiresAt) > now) n++;
  }
  return n;
}

/** Μέρες μέχρι τη λήξη μιας κερδισμένης θέσης (0 αν έληξε). Τροφοδοτεί το
 *  κουτάκι αντίστροφης μέτρησης «Λήγει σε X ημέρες» που εθίζει σε νέα πρόσκληση. */
export function daysUntilExpiry(expiresAt: string, nowIso: string): number {
  const ms = Date.parse(expiresAt) - Date.parse(nowIso);
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export function effectiveMaxProperties(planId: string | null | undefined, activeSlots: number): number {
  const base = planLimit(planId);
  if (!isFinite(base)) return Infinity;
  return base + Math.max(0, Math.min(activeSlots, MAX_ACTIVE_SLOTS));
}

/** Μπορεί να προσθέσει ακόμη ένα ακίνητο, λαμβάνοντας υπόψη ΕΝΕΡΓΕΣ θέσεις. */
export function canAddWithReferrals(planId: string | null | undefined, activeSlots: number, currentCount: number): boolean {
  return currentCount < effectiveMaxProperties(planId, activeSlots);
}

// ═══════════════════════════════════════════════════════════════════════════
// ΕΠΙΠΕΔΟ 1 — «Οι 5 του μήνα» (μηνιαίο milestone με μπόνους)
// ─────────────────────────────────────────────────────────────────────────
// Αντιγράφει τη μηχανική Revolut/Wise: μπάρα προόδου «X/5» που εθίζει, και
// ένα ουσιαστικό μπόνους όταν φτάσεις τις 5 ΕΝΕΡΓΕΣ συστάσεις μέσα σε έναν
// ημερολογιακό μήνα. Οικονομικά: 5 ενεργοποιημένοι χρήστες = εξαιρετικά φθηνό
// CAC (πολύ κάτω από κάθε διαφήμιση), αφού είναι ήδη πραγματικοί, ενεργοί.
// Το μπόνους είναι ΑΞΙΑ ΠΡΟΪΟΝΤΟΣ (μήνες Επαγγελματία), ΟΧΙ μετρητά: μηδενικό
// οριακό κόστος για την Property OS, δεν «μυρίζει» κουπόνι σούπερ-μάρκετ, και
// δεν δημιουργεί ταμειακή έκθεση/φοροτεχνικό βάρος σε ιδιώτες. Κερδίζουν και οι
// δύο: ο συστήνων παίρνει το κορυφαίο πλάνο δωρεάν, εμείς πραγματικούς χρήστες.
// ═══════════════════════════════════════════════════════════════════════════
export const MONTHLY_MILESTONE = 5;          // ενεργές συστάσεις/μήνα για μπόνους
export const MILESTONE_BONUS_MONTHS = 6;     // μήνες Επαγγελματία δωρεάν (αξία προϊόντος)

export function qualifiesMonthlyBonus(activatedThisMonth: number): boolean {
  return activatedThisMonth >= MONTHLY_MILESTONE;
}

/** Πρόοδος προς το μηνιαίο μπόνους (για την μπάρα «X/5»). */
export function monthlyProgress(activatedThisMonth: number): { count: number; target: number; remaining: number; reached: boolean; pct: number } {
  const count = Math.max(0, Math.floor(activatedThisMonth));
  const remaining = Math.max(0, MONTHLY_MILESTONE - count);
  return { count, target: MONTHLY_MILESTONE, remaining, reached: count >= MONTHLY_MILESTONE, pct: Math.min(100, (count / MONTHLY_MILESTONE) * 100) };
}

// ═══════════════════════════════════════════════════════════════════════════
// ΕΠΙΠΕΔΟ 2 — «Συνεργάτης Property OS» (streak 3 μηνών → status + προμήθεια)
// ─────────────────────────────────────────────────────────────────────────
// Όποιος πετύχει το milestone (5+) για 3 ΣΥΝΕΧΟΜΕΝΟΥΣ μήνες γίνεται επίσημος
// Συνεργάτης. ΟΧΙ κουπόνι (θα ήταν φθηνιάρικο) αλλά πραγματική συνεργασία:
// επαναλαμβανόμενη προμήθεια από όσα πληρώνουν οι συστάσεις του (αυτοχρηματο-
// δοτείται, ποτέ ζημιά), μόνιμο δωρεάν Επαγγελματίας όσο είναι ενεργός, σήμα
// και προτεραιότητα. Ιδανικό για λογιστές/μεσίτες — το κανάλι με τη μεγαλύτερη
// μόχλευση για οργανική ανάπτυξη με μικρό κόστος.
// ═══════════════════════════════════════════════════════════════════════════
export const STREAK_TARGET_MONTHS = 3;        // συνεχόμενοι μήνες με milestone
export const PARTNER_COMMISSION_RATE = 0.20;  // % επί των εσόδων των συστάσεων
export const PARTNER_COMMISSION_MONTHS = 12;  // διάρκεια προμήθειας ανά σύσταση

/** Τρέχον σερί: συνεχόμενοι ΤΕΛΕΥΤΑΙΟΙ μήνες με ≥ milestone ενεργοποιήσεις.
 *  monthlyCounts: πίνακας ενεργοποιήσεων ανά μήνα, από παλιότερο → πιο πρόσφατο. */
export function currentStreak(monthlyCounts: number[]): number {
  let n = 0;
  for (let i = monthlyCounts.length - 1; i >= 0; i--) {
    if ((monthlyCounts[i] || 0) >= MONTHLY_MILESTONE) n++;
    else break;
  }
  return n;
}

export function isPartner(monthlyCounts: number[]): boolean {
  return currentStreak(monthlyCounts) >= STREAK_TARGET_MONTHS;
}

/** Πρόοδος προς την ιδιότητα Συνεργάτη (για την μπάρα «X/3 μήνες»). */
export function streakProgress(monthlyCounts: number[]): { current: number; target: number; reached: boolean; pct: number } {
  const streak = currentStreak(monthlyCounts);
  const current = Math.min(streak, STREAK_TARGET_MONTHS);
  return { current, target: STREAK_TARGET_MONTHS, reached: streak >= STREAK_TARGET_MONTHS, pct: Math.min(100, (current / STREAK_TARGET_MONTHS) * 100) };
}

/** Μηνιαία προμήθεια Συνεργάτη επί των εσόδων που παρήγαγαν οι ενεργές του
 *  συστάσεις (μόνο όσες βρίσκονται ακόμη εντός του παραθύρου προμήθειας). */
export function partnerCommission(referredMonthlyRevenue: number): number {
  return Math.max(0, referredMonthlyRevenue) * PARTNER_COMMISSION_RATE;
}

export function partnerCommissionFromSubs(monthlySubs: number[]): number {
  const total = monthlySubs.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  return partnerCommission(total);
}
