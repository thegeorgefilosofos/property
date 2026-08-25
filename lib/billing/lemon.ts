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
//    από αυτό που έχει στην εφαρμογή και τότε η συνδρομή θα προσγειωνόταν σε
//    λάθος λογαριασμό ή σε κανέναν.
// ═══════════════════════════════════════════════════════════════════════════

import { PLANS, normalizePlan, BILLING_CYCLES, type PlanId, type BillingCycle } from './plans';
import { type VariantPlan, type MorStatus, type MorSubscription, isMorStatus } from './subscription';

// ΟΙ ΤΥΠΟΙ ΞΑΝΑΒΓΑΙΝΟΥΝ ΑΠΟ ΕΔΩ ΜΟΝΟ ΓΙΑ ΤΗ ΘΥΡΑ. Ο υπόλοιπος κώδικας τους
// παίρνει από το «subscription.ts»: ο φύλακας της θύρας δεν αφήνει κανέναν
// έξω από το «merchant/» να εισάγει αυτό εδώ το αρχείο.
export type { VariantPlan, MorStatus, MorSubscription };

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
  | { ok: true; event: string; sub: MorSubscription }
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
// κατάστασης και απαντούσε 422 — δηλαδή «ξαναστείλ' το». Ο έμπορος
// ξαναδοκίμαζε, ο πίνακάς του γέμιζε κόκκινο και ο ιδιοκτήτης του
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
  if (!isMorStatus(status)) {
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
