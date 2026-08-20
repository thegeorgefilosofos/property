// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΥΝΔΡΟΜΗ ΤΗΣ STRIPE, ΜΕΤΑΦΡΑΣΜΕΝΗ ΣΕ ΠΑΚΕΤΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΑΛΛΑΞΕ ΑΠΟ ΤΟΝ ΠΡΟΗΓΟΥΜΕΝΟ ΕΜΠΟΡΟ, ΚΑΙ ΓΙΑΤΙ ΕΧΕΙ ΣΗΜΑΣΙΑ. Το Lemon
// Squeezy ήταν merchant of record: πουλούσε στο ΔΙΚΟ ΤΟΥ όνομα και απέδιδε τον
// ΦΠΑ κάθε χώρας. Η Stripe ΔΕΝ είναι: πουλάει ο ίδιος ο κάτοχος του
// λογαριασμού. Το κείμενο των Ορων και του Απορρήτου το λέει πλέον σωστά, και
// ο ΦΠΑ υπολογίζεται από το Stripe Tax πάνω στη διεύθυνση του πελάτη.
//
// ── ΚΑΜΙΑ ΧΕΙΡΟΓΡΑΦΗ ΑΝΤΙΣΤΟΙΧΙΣΗ ────────────────────────────────────────
// Ο προηγούμενος έμπορος απαιτούσε μεταβλητή περιβάλλοντος που έλεγε ποια
// παραλλαγή δίνει ποιο πακέτο — δηλαδή δεύτερη πηγή αλήθειας, γραμμένη με το
// χέρι σε πεδίο ιστοσελίδας, που ΘΑ αποκλίνει.
//
// Εδώ η αντιστοίχιση ζει στα ΙΔΙΑ τα αντικείμενα της Stripe: κάθε τιμή φέρει
// `metadata.plan_id` και `metadata.cycle`. Ο κώδικας ρωτά «ποια τιμή είναι το
// ετήσιο Ιδιοκτήτης+;» και η απάντηση έρχεται από το κατάστημα. Καμία
// μεταβλητή, κανένα αναγνωριστικό μέσα στον κώδικα, και μια νέα τιμή δουλεύει
// μόλις δημιουργηθεί.
// ═══════════════════════════════════════════════════════════════════════════

import { PLANS, normalizePlan, type PlanId } from './plans';

/**
 * Οι καταστάσεις συνδρομής της Stripe, όπως τις ορίζει το SDK της
 * (`Stripe.Subscription.Status`). Η λίστα δεν επεκτείνεται από εικασία.
 */
export const SUB_STATUSES = [
  'incomplete', 'incomplete_expired', 'trialing', 'active',
  'past_due', 'canceled', 'unpaid', 'paused',
] as const;

export type SubStatus = (typeof SUB_STATUSES)[number];

export const isSubStatus = (v: unknown): v is SubStatus =>
  typeof v === 'string' && (SUB_STATUSES as readonly string[]).includes(v);

export type BillingCycle = 'monthly' | 'annual';
export const CYCLES: readonly BillingCycle[] = ['monthly', 'annual'];

/** Η στιγμή ενός Unix timestamp της Stripe, σε ISO. `null` όταν λείπει. */
export function isoFrom(seconds: unknown): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

// ── ΠΟΤΕ ΙΣΧΥΕΙ Η ΣΥΝΔΡΟΜΗ ────────────────────────────────────────────────
//
// `trialing`           δοκιμή σε εξέλιξη — η μόνη δωρεάν περίοδος του προϊόντος.
// `active`             πληρωμένη και ενεργή.
// `past_due`           μια ανανέωση απέτυχε και η Stripe ξαναδοκιμάζει. Η
//                      πρόσβαση ΜΕΝΕΙ: το να κλείσει η πόρτα σε πελάτη που
//                      απλώς άλλαξε κάρτα είναι χειρότερο από λίγες μέρες
//                      πίστωση.
// `incomplete`         η ΠΡΩΤΗ πληρωμή δεν ολοκληρώθηκε (π.χ. εκκρεμεί 3DS).
//                      ΔΕΝ δίνει πρόσβαση: δεν έχει πληρωθεί τίποτα ακόμη.
// `incomplete_expired` η πρώτη πληρωμή δεν ολοκληρώθηκε ποτέ.
// `canceled`           τέλος. Η ΠΛΗΡΩΜΕΝΗ ΠΕΡΙΟΔΟΣ ΔΕΝ ΧΑΝΕΤΑΙ ΕΤΣΙ: όταν ο
//                      πελάτης ακυρώνει στο τέλος της περιόδου, η Stripe κρατά
//                      τη συνδρομή `active` με `cancel_at_period_end` και τη
//                      γυρίζει σε `canceled` ΜΟΛΙΣ λήξει. Δηλαδή εδώ έχει ήδη
//                      λήξει, και η πόρτα κλείνει.
// `unpaid`             απέτυχαν όλες οι προσπάθειες είσπραξης.
// `paused`             η είσπραξη έχει παύσει. ΔΕΝ δίνει πρόσβαση: το προϊόν
//                      δεν έχει δωρεάν βαθμίδα εκτός από τη δοκιμή, και μια
//                      παύση που κρατά τη συνδρομή ανοιχτή θα ήταν ακριβώς αυτό.
export function isEntitled(status: SubStatus): boolean {
  switch (status) {
    case 'trialing':
    case 'active':
    case 'past_due':
      return true;
    case 'incomplete':
    case 'incomplete_expired':
    case 'canceled':
    case 'unpaid':
    case 'paused':
      return false;
  }
}

// ── ΠΩΣ ΛΕΓΕΤΑΙ Η ΚΑΤΑΣΤΑΣΗ ΣΤΟΝ ΑΝΘΡΩΠΟ ──────────────────────────────────
//
// Η ΟΘΟΝΗ ΜΙΛΟΥΣΕ ΑΛΛΗ ΓΛΩΣΣΑ ΑΠΟ ΤΟΝ WEBHOOK. Η κάρτα της συνδρομής συνέκρινε
// με `on_trial` και `cancelled` — ονόματα του προηγούμενου εμπόρου — ενώ στη
// βάση γράφονται `trialing` και `canceled`. Καμία συνθήκη δεν ταίριαζε ποτέ:
// πελάτης με ενεργή συνδρομή έβλεπε κάρτα που δεν έλεγε τίποτα.
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
  /** Η πρώτη πληρωμή εκκρεμεί (π.χ. ταυτοποίηση κάρτας). Πρόσβαση δεν υπάρχει. */
  | 'pending'
  /** Τελείωσε ή δεν ολοκληρώθηκε ποτέ. */
  | 'lapsed'
  /** Καμία συνδρομή δεν έχει υπάρξει. */
  | 'none';

/** Σε ποια φάση βρίσκεται η συνδρομή, από την κατάσταση που έγραψε ο webhook. */
export function subPhase(status: string): SubPhase {
  if (!isSubStatus(status)) return 'none';
  switch (status) {
    case 'trialing': return 'trial';
    case 'active': return 'active';
    case 'past_due': return 'retrying';
    case 'incomplete': return 'pending';
    case 'incomplete_expired':
    case 'canceled':
    case 'unpaid':
    case 'paused': return 'lapsed';
  }
}

// ── ΤΙ ΑΓΟΡΑΣΤΗΚΕ ─────────────────────────────────────────────────────────

export interface PricePlan { priceId: string; plan: PlanId; cycle: BillingCycle }

/** Οσο χρειάζεται από μια τιμή της Stripe για να κριθεί τι πακέτο είναι. */
export interface PriceLike {
  id?: string | null;
  active?: boolean | null;
  metadata?: { plan_id?: string | null; cycle?: string | null } | null;
}

/**
 * Ο κατάλογος πακέτων, διαβασμένος από τις τιμές του καταστήματος.
 *
 * ΑΓΝΟΕΙ Ο,ΤΙ ΔΕΝ ΕΧΕΙ ΣΗΜΑΝΘΕΙ. Μια τιμή χωρίς `plan_id`/`cycle` δεν είναι
 * λάθος — είναι τιμή για κάτι άλλο (πρόσθετο, εφάπαξ, δοκιμή). Λάθος θα ήταν
 * να μαντέψουμε πακέτο από το ποσό της.
 */
export function catalogue(prices: readonly PriceLike[]): PricePlan[] {
  const out: PricePlan[] = [];
  for (const p of prices) {
    if (p.active === false) continue;
    const id = (p.id || '').trim();
    const plan = (p.metadata?.plan_id || '').trim();
    const cycle = (p.metadata?.cycle || '').trim();
    if (!id || !(plan in PLANS) || !CYCLES.includes(cycle as BillingCycle)) continue;
    // Το «free» δεν πωλείται· μια τιμή σημασμένη έτσι είναι σφάλμα ρύθμισης.
    if (PLANS[normalizePlan(plan)].priceMonthly <= 0) continue;
    out.push({ priceId: id, plan: normalizePlan(plan), cycle: cycle as BillingCycle });
  }
  return out;
}

/** Η τιμή ενός πακέτου σε έναν κύκλο. `null` όταν δεν έχει δημιουργηθεί ακόμη. */
export function priceFor(cat: readonly PricePlan[], plan: PlanId, cycle: BillingCycle): string | null {
  return cat.find(p => p.plan === plan && p.cycle === cycle)?.priceId ?? null;
}

/** Ποιο πακέτο δίνει μια τιμή. `null` όταν δεν είναι στον κατάλογο. */
export function planOfPrice(cat: readonly PricePlan[], priceId: string): PricePlan | null {
  return cat.find(p => p.priceId === priceId) ?? null;
}

/**
 * Τι λείπει από το κατάστημα. Κενό κείμενο σημαίνει «τίποτα».
 *
 * ΟΝΟΜΑΣΤΙΚΑ, ΓΙΑΤΙ ΤΟ ΚΕΝΟ ΕΙΝΑΙ ΑΟΡΑΤΟ. Ενα πακέτο χωρίς τιμή δεν βγάζει
 * σφάλμα: απλώς το κουμπί του δεν εμφανίζεται, και κανείς δεν καταλαβαίνει
 * γιατί δεν πουλήθηκε ποτέ το ετήσιο Επαγγελματίας+.
 */
export function catalogueGaps(cat: readonly PricePlan[]): string {
  const paid = (Object.keys(PLANS) as PlanId[]).filter(p => PLANS[p].priceMonthly > 0);
  const missing: string[] = [];
  for (const plan of paid) {
    for (const cycle of CYCLES) {
      if (!priceFor(cat, plan, cycle)) missing.push(`${PLANS[plan].name} ${cycle === 'annual' ? 'ετήσια' : 'μηνιαία'}`);
    }
  }
  return missing.length ? `Λείπουν τιμές από το κατάστημα: ${missing.join(', ')}.` : '';
}

// ── Η ΑΝΑΓΝΩΣΗ ΤΗΣ ΣΥΝΔΡΟΜΗΣ ──────────────────────────────────────────────

export interface SubscriptionState {
  id: string;
  status: SubStatus;
  priceId: string | null;
  customerId: string | null;
  /** Ο λογαριασμός μας, από τα metadata της συνδρομής ή του πελάτη. */
  userId: string | null;
  /** Πότε ανανεώνεται ή λήγει η τρέχουσα περίοδος. */
  periodEnd: string | null;
  /** Ζητήθηκε ακύρωση στο τέλος της περιόδου; */
  cancelAtPeriodEnd: boolean;
}

export type ReadResult =
  | { ok: true; sub: SubscriptionState }
  | { ok: false; reason: string };

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Διαβάζει μια συνδρομή της Stripe.
 *
 * ΔΕΝ ΞΕΧΩΡΙΖΕΙ ΑΝΑ ΟΝΟΜΑ ΓΕΓΟΝΟΤΟΣ, ΚΑΙ ΑΥΤΟ ΕΙΝΑΙ ΣΚΟΠΙΜΟ. Ολα τα
 * `customer.subscription.*` κουβαλούν την ΤΡΕΧΟΥΣΑ κατάσταση. Ενας χειριστής
 * που κρίνει από το όνομα («ήρθε deleted, άρα κόψε») παίρνει λάθος απόφαση
 * μόλις δύο γεγονότα φτάσουν ανάποδα. Η κατάσταση είναι το δεδομένο· το όνομα
 * είναι η αφορμή.
 */
export function readSubscription(raw: unknown): ReadResult {
  const s = (raw ?? null) as {
    id?: unknown; status?: unknown; customer?: unknown; metadata?: unknown;
    cancel_at_period_end?: unknown; current_period_end?: unknown; items?: unknown;
  } | null;

  const id = text(s?.id);
  if (!id) return { ok: false, reason: 'Λείπει το αναγνωριστικό της συνδρομής.' };

  const status = s?.status;
  if (!isSubStatus(status)) {
    return { ok: false, reason: `Αγνωστη κατάσταση συνδρομής «${String(status)}». Δεν ερμηνεύεται.` };
  }

  // Ο πελάτης έρχεται είτε ως αναγνωριστικό είτε ως πλήρες αντικείμενο.
  const cust = s?.customer;
  const customerId = typeof cust === 'string' ? cust.trim() : text((cust as { id?: unknown } | null)?.id);

  const meta = (s?.metadata ?? null) as { user_id?: unknown } | null;

  // ΤΟ ΠΑΚΕΤΟ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗ ΓΡΑΜΜΗ ΤΗΣ ΣΥΝΔΡΟΜΗΣ. Παίρνουμε την ΠΡΩΤΗ: οι
  // συνδρομές του προϊόντος έχουν ένα πακέτο, και ένα πρόσθετο ανά ακίνητο που
  // δεν αλλάζει το πακέτο.
  const items = (s?.items ?? null) as { data?: unknown } | null;
  const first = Array.isArray(items?.data) ? items.data[0] as { price?: unknown } | undefined : undefined;
  const price = first?.price;
  const priceId = typeof price === 'string' ? price.trim() : text((price as { id?: unknown } | null)?.id);

  // Το τέλος περιόδου ζει στη γραμμή της συνδρομής από την έκδοση 2025-03-31·
  // στις παλαιότερες ζούσε στη ρίζα. Διαβάζονται και τα δύο, χωρίς εικασία.
  const rootEnd = (s as { current_period_end?: unknown } | null)?.current_period_end;
  const itemEnd = (first as { current_period_end?: unknown } | undefined)?.current_period_end;

  return {
    ok: true,
    sub: {
      id,
      status,
      priceId: priceId || null,
      customerId: customerId || null,
      userId: text(meta?.user_id) || null,
      periodEnd: isoFrom(itemEnd) ?? isoFrom(rootEnd),
      cancelAtPeriodEnd: s?.cancel_at_period_end === true,
    },
  };
}
