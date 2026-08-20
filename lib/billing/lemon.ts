// ═══════════════════════════════════════════════════════════════════════════
// Ο ΕΜΠΟΡΟΣ ΤΥΠΟΥ RECORD: ΤΙ ΛΕΕΙ, ΚΑΙ ΤΙ ΤΟΥ ΠΙΣΤΕΥΟΥΜΕ
// ─────────────────────────────────────────────────────────────────────────
// Η Lemon Squeezy πουλά ΣΤΟ ΟΝΟΜΑ ΤΗΣ: εκείνη εκδίδει το παραστατικό, εκείνη
// αποδίδει τον ΦΠΑ κάθε χώρας, εκείνη είναι ο αντισυμβαλλόμενος του πελάτη.
// Γι' αυτό επιλέχθηκε — επιτρέπει πωλήσεις πριν υπάρξει εταιρεία.
//
// ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ ΔΕΝ ΑΓΓΙΖΕΙ ΔΙΚΤΥΟ. Είναι καθαρή λογική, ώστε κάθε απόφαση
// που κρίνει τι βλέπει ένας πληρωμένος συνδρομητής να ελέγχεται με τεστ.
//
// ── ΤΡΕΙΣ ΚΑΝΟΝΕΣ ────────────────────────────────────────────────────────
//
// 1. ΚΑΜΙΑ ΑΓΝΩΣΤΗ ΚΑΤΑΣΤΑΣΗ ΔΕΝ ΕΡΜΗΝΕΥΕΤΑΙ. Αν η Lemon Squeezy στείλει
//    κατάσταση που δεν ξέρουμε, το γεγονός ΑΠΟΡΡΙΠΤΕΤΑΙ ονομαστικά. Η
//    εναλλακτική — «ό,τι δεν αναγνωρίζω το θεωρώ ενεργό» — δίνει τζάμπα
//    συνδρομή· το αντίστροφο κόβει πρόσβαση σε πληρωμένο πελάτη. Και τα δύο
//    είναι σιωπηλά. Το σφάλμα δεν είναι.
//
// 2. ΚΑΜΙΑ ΠΑΡΑΛΛΑΓΗ ΔΕΝ ΜΑΝΤΕΥΕΤΑΙ. Ποιο πακέτο δίνει ποιο `variant_id`
//    ορίζεται σε μεταβλητή περιβάλλοντος, γιατί τα αναγνωριστικά γεννιούνται
//    στο κατάστημα και δεν υπάρχουν μέσα στον κώδικα. Παραλλαγή εκτός χάρτη
//    δεν αναβαθμίζει κανέναν.
//
// 3. ΤΟ `custom_data.user_id` ΕΙΝΑΙ Ο ΜΟΝΟΣ ΣΥΝΔΕΣΜΟΣ ΜΕ ΤΟΝ ΛΟΓΑΡΙΑΣΜΟ. Το
//    ηλεκτρονικό ταχυδρομείο ΔΕΝ αρκεί: ο πελάτης μπορεί να πληρώσει με άλλο
//    από αυτό που έχει στην εφαρμογή, και τότε η συνδρομή θα προσγειωνόταν σε
//    λάθος λογαριασμό ή σε κανέναν.
// ═══════════════════════════════════════════════════════════════════════════

import { PLANS, normalizePlan, BILLING_CYCLES, type PlanId, type BillingCycle } from './plans';

/**
 * Οι καταστάσεις συνδρομής της Lemon Squeezy, όπως τις ορίζει η τεκμηρίωσή της.
 * Η λίστα δεν επεκτείνεται από εικασία.
 */
export const LS_STATUSES = [
  'on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired',
] as const;

export type LsStatus = (typeof LS_STATUSES)[number];

export const isLsStatus = (v: unknown): v is LsStatus =>
  typeof v === 'string' && (LS_STATUSES as readonly string[]).includes(v);

export interface VariantPlan { plan: PlanId; cycle: BillingCycle }

export interface LsSubscription {
  /** Το αναγνωριστικό της συνδρομής στη Lemon Squeezy. */
  id: string;
  status: LsStatus;
  variantId: string;
  customerId: string;
  /** Ο λογαριασμός μας, από το `custom_data`. `null` όταν λείπει. */
  userId: string | null;
  /** Πότε ανανεώνεται. Κενό όταν δεν ανανεώνεται. */
  renewsAt: string | null;
  /** Πότε λήγει η πρόσβαση. Γεμάτο σε ακύρωση και σε λήξη. */
  endsAt: string | null;
}

// ── ΠΟΤΕ ΙΣΧΥΕΙ Η ΣΥΝΔΡΟΜΗ ────────────────────────────────────────────────
//
// `on_trial`   δοκιμή σε εξέλιξη — η μόνη δωρεάν περίοδος του προϊόντος.
// `active`     πληρωμένη και ενεργή.
// `past_due`   μια ανανέωση απέτυχε και η Lemon Squeezy ξαναδοκιμάζει επί δύο
//              εβδομάδες. Η πρόσβαση ΜΕΝΕΙ: το να κλείσει η πόρτα σε πελάτη
//              που απλώς άλλαξε κάρτα είναι χειρότερο από δύο εβδομάδες πίστωση.
// `cancelled`  ακυρώθηκε η ΜΕΛΛΟΝΤΙΚΗ χρέωση, αλλά η περίοδος που πληρώθηκε
//              τρέχει ακόμη. Η πρόσβαση ΜΕΝΕΙ ώς το `ends_at`, και ούτε μέρα
//              παραπάνω. Χωρίς `ends_at` δεν υπάρχει πρόσβαση: δεν εφευρίσκουμε
//              ημερομηνία λήξης για να είμαστε γενναιόδωροι.
// `paused`     η είσπραξη έχει παύσει με τη θέληση του πελάτη. ΔΕΝ δίνει
//              πρόσβαση: το προϊόν δεν έχει δωρεάν βαθμίδα, και μια παύση που
//              κρατά τη συνδρομή ανοιχτή θα ήταν ακριβώς αυτό.
// `unpaid`     απέτυχαν και οι τέσσερις προσπάθειες είσπραξης.
// `expired`    τελείωσε.
//
/**
 * Ισχύει η συνδρομή τη δεδομένη στιγμή;
 *
 * @param nowIso Η στιγμή που κρίνεται, σε ISO. Δίνεται από τον καλούντα ώστε ο
 *               έλεγχος να είναι ντετερμινιστικός.
 */
export function isEntitled(sub: { status: LsStatus; endsAt: string | null }, nowIso: string): boolean {
  switch (sub.status) {
    case 'on_trial':
    case 'active':
    case 'past_due':
      return true;
    case 'cancelled':
      return !!sub.endsAt && nowIso < sub.endsAt;
    case 'paused':
    case 'unpaid':
    case 'expired':
      return false;
  }
}

// ── ΠΩΣ ΛΕΓΕΤΑΙ Η ΚΑΤΑΣΤΑΣΗ ΣΤΟΝ ΑΝΘΡΩΠΟ ──────────────────────────────────
//
// Η ΟΘΟΝΗ ΔΕΝ ΞΑΝΑΓΡΑΦΕΙ ΤΟ ΛΕΞΙΛΟΓΙΟ ΤΟΥ ΕΜΠΟΡΟΥ. Η κάρτα της συνδρομής
// συνέκρινε με συμβολοσειρές γραμμένες με το χέρι· μια αλλαγή παρόχου σημαίνει
// ότι καμία συνθήκη δεν ταιριάζει πια, και ο πελάτης με ενεργή συνδρομή βλέπει
// κάρτα που δεν λέει τίποτα — χωρίς κανένα σφάλμα να το εξηγεί.
//
// Η μετάφραση γίνεται ΕΔΩ, δίπλα στη λίστα των καταστάσεων, ώστε μια νέα
// κατάσταση να μη γίνεται δεκτή χωρίς να αποφασιστεί τι λέει στον άνθρωπο.
export type SubPhase =
  /** Δοκιμή σε εξέλιξη. */
  | 'trial'
  /** Πληρωμένη και ενεργή. */
  | 'active'
  /** Μια ανανέωση απέτυχε και ξαναδοκιμάζεται. Η πρόσβαση μένει. */
  | 'retrying'
  /** Τελείωσε, πάγωσε, ή δεν πληρώθηκε ποτέ. */
  | 'lapsed'
  /** Καμία συνδρομή δεν έχει υπάρξει. */
  | 'none';

/**
 * Σε ποια φάση βρίσκεται η συνδρομή, από την κατάσταση που έγραψε ο webhook.
 *
 * ΤΟ `cancelled` ΔΕΝ ΕΙΝΑΙ ΦΑΣΗ ΕΔΩ, ΕΙΝΑΙ ΗΜΕΡΟΜΗΝΙΑ. Ακυρωμένη συνδρομή που
 * τρέχει ώς το `ends_at` δεν διαβάζεται από την κατάσταση αλλά από την ίδια την
 * ημερομηνία, που η οθόνη ελέγχει πρώτη.
 */
export function subPhase(status: string): SubPhase {
  if (!isLsStatus(status)) return 'none';
  switch (status) {
    case 'on_trial': return 'trial';
    case 'active': return 'active';
    case 'past_due': return 'retrying';
    case 'cancelled':
    case 'paused':
    case 'unpaid':
    case 'expired': return 'lapsed';
  }
}

// ── Ο ΧΑΡΤΗΣ ΠΑΡΑΛΛΑΓΩΝ ───────────────────────────────────────────────────
//
// ΓΙΑΤΙ ΚΕΙΜΕΝΟ ΚΑΙ ΟΧΙ JSON. Η τιμή γράφεται στο πεδίο μεταβλητής του Vercel,
// με το χέρι, μία φορά. Το JSON εκεί σημαίνει εισαγωγικά μέσα σε εισαγωγικά και
// ένα ξεχασμένο κόμμα που ρίχνει ΟΛΟΝ τον χάρτη. Η μορφή είναι:
//
//     LEMON_VARIANTS="811223:solo:monthly,811224:solo:annual,811225:owner:monthly"
//
// Κάθε λάθος καταγγέλλεται ονομαστικά, με τη γραμμή που το προκάλεσε.

export interface VariantMapResult {
  map: Map<string, VariantPlan>;
  /** Κενό όταν όλα διαβάστηκαν. Αλλιώς τι ακριβώς δεν διαβάστηκε. */
  error: string;
}

export function parseVariantMap(raw: string | undefined | null): VariantMapResult {
  const map = new Map<string, VariantPlan>();
  const text = (raw || '').trim();
  if (!text) return { map, error: 'Ο χάρτης παραλλαγών είναι κενός. Ορισε τη μεταβλητή LEMON_VARIANTS.' };

  const bad: string[] = [];
  for (const entry of text.split(',').map(e => e.trim()).filter(Boolean)) {
    const [variantId, planRaw, cycleRaw] = entry.split(':').map(p => (p || '').trim());
    if (!variantId || !planRaw || !cycleRaw) { bad.push(`«${entry}»: περιμένει μορφή variant:πακέτο:κύκλος`); continue; }
    // ΟΧΙ normalizePlan ΕΔΩ: εκείνο επιστρέφει «free» για ό,τι δεν αναγνωρίζει,
    // δηλαδή θα δεχόταν τυπογραφικό και θα χάριζε πακέτο χωρίς να πει λέξη.
    if (!(planRaw in PLANS)) { bad.push(`«${entry}»: άγνωστο πακέτο «${planRaw}»`); continue; }
    if (!BILLING_CYCLES.includes(cycleRaw as BillingCycle)) { bad.push(`«${entry}»: άγνωστος κύκλος «${cycleRaw}»`); continue; }
    if (map.has(variantId)) { bad.push(`«${entry}»: η παραλλαγή ${variantId} ορίζεται δύο φορές`); continue; }
    map.set(variantId, { plan: normalizePlan(planRaw), cycle: cycleRaw as BillingCycle });
  }

  return { map, error: bad.length ? `Ο χάρτης παραλλαγών έχει σφάλματα: ${bad.join(' · ')}` : '' };
}

/** Ποιο πακέτο δίνει μια παραλλαγή. `null` όταν δεν είναι στον χάρτη. */
export function planOfVariant(map: Map<string, VariantPlan>, variantId: string): VariantPlan | null {
  return map.get(variantId) ?? null;
}

// ── Η ΑΝΑΓΝΩΣΗ ΤΟΥ ΓΕΓΟΝΟΤΟΣ ──────────────────────────────────────────────

export type ReadResult =
  | { ok: true; event: string; sub: LsSubscription }
  | { ok: false; reason: string };

/** Αριθμός ή κείμενο από τη Lemon Squeezy, πάντα ως κείμενο για εμάς. */
function idText(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

const dateText = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;

// ── ΠΟΙΑ ΓΕΓΟΝΟΤΑ ΚΟΥΒΑΛΟΥΝ ΟΝΤΩΣ ΣΥΝΔΡΟΜΗ ───────────────────────────────
//
// ΤΟ ΠΡΟΘΕΜΑ ΔΕΝ ΑΡΚΕΙ, ΚΑΙ ΤΟ ΛΑΘΟΣ ΘΑ ΕΒΓΑΙΝΕ ΜΟΝΟ ΣΤΗΝ ΠΑΡΑΓΩΓΗ. Τα
// `subscription_payment_*` αρχίζουν κι εκείνα από «subscription_», αλλά στο
// `data` δεν φέρνουν συνδρομή: φέρνουν ΠΑΡΑΣΤΑΤΙΚΟ, με `status` που παίρνει
// τιμές «paid», «pending», «refunded». Καμία τους δεν είναι κατάσταση
// συνδρομής.
//
// Ο χειριστής τα διάβαζε ως συνδρομές, αποτύγχανε στην ανάγνωση της
// κατάστασης, και απαντούσε 422 — δηλαδή «ξαναστείλ' το». Ο έμπορος
// ξαναδοκίμαζε, ο πίνακάς του γέμιζε κόκκινο, και ο ιδιοκτήτης του
// καταστήματος έψαχνε βλάβη που δεν υπήρχε. Και θα συνέβαινε ΜΟΛΙΣ κάποιος
// επέλεγε «όλα τα γεγονότα συνδρομής» στη ρύθμιση του webhook — δηλαδή την
// πρώτη φορά.
//
// Η λίστα είναι ΘΕΤΙΚΗ και όχι εξαίρεση: ένα νέο `subscription_κάτι` που δεν
// ξέρουμε αγνοείται ήσυχα, αντί να θεωρηθεί σφάλμα.
const SUBSCRIPTION_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
  'subscription_plan_changed',
]);

/** Κουβαλά το γεγονός αντικείμενο συνδρομής στο `data`; */
export const carriesSubscription = (event: string): boolean =>
  SUBSCRIPTION_EVENTS.has(event.trim());

/**
 * Διαβάζει ένα γεγονός συνδρομής.
 *
 * ΔΕΝ ΞΕΧΩΡΙΖΕΙ ΑΝΑ ΟΝΟΜΑ ΓΕΓΟΝΟΤΟΣ, ΚΑΙ ΑΥΤΟ ΕΙΝΑΙ ΣΚΟΠΙΜΟ. Ολα τα
 * `subscription_*` κουβαλούν την ΤΡΕΧΟΥΣΑ κατάσταση της συνδρομής μέσα στο
 * `data.attributes.status`. Ενας χειριστής που κρίνει από το όνομα («ήρθε
 * subscription_cancelled, άρα κόψε») θα έπαιρνε λάθος απόφαση μόλις η Lemon
 * Squeezy προσθέσει γεγονός που δεν ξέρουμε, ή μόλις δύο γεγονότα φτάσουν
 * ανάποδα. Η κατάσταση είναι το δεδομένο· το όνομα είναι η αφορμή.
 */
export function readSubscriptionEvent(payload: unknown): ReadResult {
  const root = payload as { meta?: unknown; data?: unknown } | null;
  const meta = (root?.meta ?? null) as { event_name?: unknown; custom_data?: unknown } | null;
  const data = (root?.data ?? null) as { id?: unknown; attributes?: unknown } | null;

  const event = typeof meta?.event_name === 'string' ? meta.event_name.trim() : '';
  if (!event) return { ok: false, reason: 'Λείπει το meta.event_name.' };
  if (!carriesSubscription(event)) return { ok: false, reason: `Το γεγονός «${event}» δεν κουβαλά συνδρομή.` };

  const id = idText(data?.id);
  if (!id) return { ok: false, reason: 'Λείπει το data.id της συνδρομής.' };

  const attrs = (data?.attributes ?? null) as Record<string, unknown> | null;
  if (!attrs) return { ok: false, reason: 'Λείπει το data.attributes.' };

  const status = attrs.status;
  if (!isLsStatus(status)) {
    return { ok: false, reason: `Αγνωστη κατάσταση συνδρομής «${String(status)}». Δεν ερμηνεύεται.` };
  }

  const variantId = idText(attrs.variant_id);
  if (!variantId) return { ok: false, reason: 'Λείπει το variant_id: δεν προκύπτει πακέτο.' };

  const custom = (meta?.custom_data ?? null) as Record<string, unknown> | null;
  const userId = idText(custom?.user_id) || null;

  return {
    ok: true,
    event,
    sub: {
      id,
      status,
      variantId,
      customerId: idText(attrs.customer_id),
      userId,
      renewsAt: dateText(attrs.renews_at),
      endsAt: dateText(attrs.ends_at),
    },
  };
}
