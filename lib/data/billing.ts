// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΡΟΦΙΛ ΧΡΕΩΣΗΣ: ΜΙΑ ΓΡΑΜΜΗ ΑΝΑ ΧΡΗΣΤΗ, ΔΕΚΑΕΞΙ ΔΡΟΜΟΙ ΠΡΟΣ ΤΑ ΕΚΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Ο πίνακας `billing_profiles` έχει κλειδί το `user_id`: μία γραμμή, πάντα.
// Δέκα οθόνες τη διάβαζαν και έξι την έγραφαν, καθεμιά με το δικό της
// `.eq('user_id', …).maybeSingle()` και το δικό της `onConflict`.
//
// ΤΙ ΕΠΙΤΡΕΠΕΤΑΙ ΝΑ ΓΡΑΨΕΙ Ο ΠΕΛΑΤΗΣ. Το πλάνο, ο κύκλος χρέωσης, οι
// προσφορές και τα αναγνωριστικά της πληρωμής ΔΕΝ είναι πεδία της φόρμας:
// τα ορίζει ο πάροχος πληρωμών, μέσω webhook, με πελάτη υπηρεσίας. Η βάση
// φυλάει ήδη το `plan` και τα `comp_*` με σκανδάλη (`lock_billing_plan`) —
// αλλά ΟΧΙ το `billing_cycle` ούτε τα `mor_*`. Η μία οθόνη που το ήξερε
// έγραφε `delete payload.plan; delete payload.billing_cycle;` δίπλα σε ένα
// σχόλιο· οι άλλες πέντε δεν το ήξεραν καθόλου. Τώρα το ξέρει το στρώμα, και
// το ξέρει για όλους.
//
// ΤΟ `updated_at` ΤΟ ΕΓΡΑΦΕ ΜΙΑ ΣΤΙΣ ΕΞΙ, ΚΑΙ ΜΕΤΑ ΤΟ ΕΓΡΑΦΕ ΑΠΟ ΛΑΘΟΣ ΡΟΛΟΪ.
// Πρώτα το έστελνε μόνο η φόρμα τιμολόγησης, οπότε πέντε στις έξι διαδρομές
// άφηναν τη στήλη στην παλιά τιμή. Μετά το έστειλε το στρώμα, από το ρολόι του
// ΠΕΡΙΗΓΗΤΗ: σε συσκευή με λάθος ώρα, η ταξινόμηση «τελευταία αλλαγή πρώτη»
// έβγαζε άλλη σειρά.
//
// Τώρα το γράφει η ίδια η βάση, με σκανδάλη `billing_profiles_updated_at`
// (μετανάστευση 20260819170000). Το `updated_at` ανήκει στη βάση.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingProfilesRow } from '@/lib/supabase/tables';
import { readOne } from './read';
import type { DbError } from '@/lib/supabase/writeResult';

const TABLE = 'billing_profiles';

export type Db = SupabaseClient;
export type { BillingProfilesRow };
export type BillingPatch = Partial<BillingProfilesRow> & Record<string, unknown>;

/**
 * Στήλες που ανήκουν στον πάροχο πληρωμών, όχι στη φόρμα.
 *
 * Αφαιρούνται από κάθε εγγραφή πελάτη. Δεν είναι δυσπιστία προς τις οθόνες:
 * είναι το ότι μια νέα οθόνη που θα κάνει `upsert({ ...ολόκληρο το προφίλ })`
 * δεν έχει κανέναν τρόπο να το ξέρει.
 */
const SERVER_OWNED = [
  'plan', 'billing_cycle',
  'comp_plan', 'comp_until', 'comp_months_granted', 'comp_started_at',
  'mor_customer_id', 'mor_subscription_id', 'mor_variant_id', 'mor_renews_at', 'mor_ends_at', 'mor_event_at', 'subscription_status',
  // Η χρήση της δοκιμής και η ιδιότητα δοκιμαστή δίνουν ΔΩΡΕΑΝ ΧΡΗΣΗ: αν τις
  // έγραφε ο πελάτης, η δοκιμή θα ξεκινούσε από την αρχή όποτε ήθελε.
  'trial_used_at', 'tester_since',
  // Η κράτηση υποβάθμισης ΚΡΑΤΑ ΤΟ ΑΚΡΙΒΟΤΕΡΟ ΠΑΚΕΤΟ ώς μια ημερομηνία: αν την
  // έγραφε ο πελάτης, θα κρατούσε το «Επαγγελματίας+» ώς το 2100.
  'hold_plan', 'hold_until',
  // ΟΙ ΘΕΣΕΙΣ ΑΚΙΝΗΤΟΥ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΤΟ ΠΡΟΪΟΝ. Η σκανδάλη `lock_billing_plan`
  // τις φυλάει ήδη στη βάση, αλλά ο κατάλογος εδώ είναι η πρώτη γραμμή: χωρίς
  // τις δύο, ένα `saveProfile({ extra_properties: 500 })` έφτανε ώς τη βάση και
  // στηριζόταν αποκλειστικά στη σκανδάλη για να μη γίνει δεκτό.
  'extra_properties', 'bonus_properties', 'bonus_properties_until',
] as const;

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/** Το προφίλ του χρήστη, ή `null` αν δεν έχει δημιουργηθεί ακόμη. */
export async function profile<T = Partial<BillingProfilesRow>>(
  db: Db, userId: string, columns: string,
): Promise<T | null> {
  // Ο έλεγχος μένει ΕΔΩ, πριν από κάθε ερώτημα: χωρίς χρήστη δεν ρωτάμε τη βάση.
  if (!userId) return null;
  // ΕΝΑ ΜΟΝΟΠΑΤΙ: η απλή εκδοχή είναι η ίδια ανάγνωση, χωρίς το σφάλμα της.
  return (await profileOutcome<T>(db, userId, columns)).data;
}

/**
 * Το ίδιο, αλλά με το σφάλμα ορατό.
 *
 * Για τη συγκατάθεση δεδομένων η διαφορά μετράει: «δεν υπάρχει προφίλ» σημαίνει
 * ότι ο χρήστης δεν ρωτήθηκε ποτέ και πρέπει να ρωτηθεί· «η ανάγνωση απέτυχε»
 * σημαίνει ότι δεν ξέρουμε, και τότε δεν του δείχνουμε διακόπτη που θα τον
 * παραπλανούσε για το τι έχει ήδη επιλέξει.
 */
export async function profileOutcome<T = Partial<BillingProfilesRow>>(
  db: Db, userId: string, columns: string,
): Promise<{ data: T | null; error: { message?: string } | null }> {
  const { row, error } = await readOne<T>(
    db.from(TABLE).select(columns).eq('user_id', userId).maybeSingle(),
  );
  // Το ίδιο αντικείμενο σφάλματος περνά ΩΣ ΕΧΕΙ· μόνο ο τύπος `DbError` είναι
  // πλατύτερος (δέχεται `null` στα πεδία), γι' αυτό η στένωση εδώ — η δημόσια
  // υπογραφή της συνάρτησης μένει απαράλλαχτη.
  return { data: row, error: error as { message?: string } | null };
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

/**
 * Γράφει ό,τι επιτρέπεται να γράψει ο χρήστης. Τον χρόνο τον σφραγίζει η βάση.
 *
 * Το κλειδί σύγκρουσης είναι το `user_id` — το πρωτεύον κλειδί του πίνακα.
 */
export function save(db: Db, userId: string, patch: BillingPatch) {
  const clean: Record<string, unknown> = { ...patch };
  for (const key of SERVER_OWNED) delete clean[key];
  return db.from(TABLE).upsert({ ...clean, user_id: userId }, { onConflict: 'user_id' });
}

// ── ΟΙ ΓΡΑΨΙΜΑΤΑ ΤΟΥ ΔΙΑΚΟΜΙΣΤΗ ────────────────────────────────────────────
//
// ΤΑ ΤΡΙΑ ΠΑΡΑΚΑΤΩ ΠΑΡΑΚΑΜΠΤΟΥΝ ΣΚΟΠΙΜΑ ΤΟ `SERVER_OWNED`, ΚΑΙ ΓΙ' ΑΥΤΟ ΖΟΥΝ
// ΕΔΩ ΜΕ ΟΝΟΜΑ. Γράφουν ακριβώς τις στήλες που η σκανδάλη `lock_billing_plan`
// απαγορεύει στον πελάτη· καλούνται ΜΟΝΟ από διαδρομές που κρατούν ρόλο
// υπηρεσίας, αφού έχουν πρώτα κρίνει οι ίδιες ποιος δικαιούται τι.
//
// Γραμμένα κατευθείαν μέσα στις διαδρομές, θα ήταν τρία `db.from(…)` σκόρπια
// σε τρία αρχεία — και το επόμενο θα ξεχνούσε μια στήλη ή θα έγραφε λάθος
// όνομα, που το PostgREST δεν το λέει σφάλμα.

/**
 * Ο,ΤΙ ΧΡΕΙΑΖΕΤΑΙ ΜΙΑ ΔΙΑΔΡΟΜΗ ΓΙΑ ΝΑ ΚΡΙΝΕΙ ΑΛΛΑΓΗ ΠΑΚΕΤΟΥ.
 *
 * Τέσσερα πεδία, μία ανάγνωση. Η εξαργύρωση του κωδικού δοκιμαστή κοιτά τα δύο
 * πρώτα· η αλλαγή πακέτου και τα τέσσερα — χρειάζεται να ξέρει από ΠΟΥ ξεκινά,
 * όταν ο χάρτης παραλλαγών δεν αναγνωρίζει αυτή που τρέχει στον έμπορο.
 */
export interface PlanContext {
  testerSince: string | null;
  subscriptionId: string | null;
  plan: string | null;
  cycle: string | null;
  /** Κράτηση υποβάθμισης σε ισχύ: τι έχει ήδη πληρωθεί για την τρέχουσα περίοδο. */
  holdPlan: string | null;
  holdUntil: string | null;
}

/** Διαβάζει τα τέσσερα, με το σφάλμα ορατό. */
export async function planContext(db: Db, userId: string): Promise<{ state: PlanContext; error: DbError | null }> {
  const { row, error } = await readOne<{
    tester_since: string | null; mor_subscription_id: string | null;
    plan: string | null; billing_cycle: string | null;
    hold_plan: string | null; hold_until: string | null;
  }>(
    db.from(TABLE).select('tester_since, mor_subscription_id, plan, billing_cycle, hold_plan, hold_until')
      .eq('user_id', userId).maybeSingle(),
  );
  return {
    state: {
      testerSince: row?.tester_since ?? null,
      subscriptionId: row?.mor_subscription_id ?? null,
      plan: row?.plan ?? null,
      cycle: row?.billing_cycle ?? null,
      holdPlan: row?.hold_plan ?? null,
      holdUntil: row?.hold_until ?? null,
    },
    error,
  };
}

/**
 * Δίνει την ιδιότητα δοκιμαστή.
 *
 * ΙΔΙΟΔΥΝΑΜΟ ΚΑΙ ΧΩΡΙΣ ΜΕΤΑΚΙΝΗΣΗ ΤΗΣ ΗΜΕΡΟΜΗΝΙΑΣ: δεύτερη εξαργύρωση από τον
 * ίδιο δεν είναι σφάλμα, είναι κάποιος που ξαναπάτησε το κουμπί.
 */
export function markTester(db: Db, userId: string, since: string) {
  return db.from(TABLE).upsert({ user_id: userId, tester_since: since }, { onConflict: 'user_id' });
}

/**
 * Η αλλαγή πακέτου, όπως καταλήγει στη γραμμή του λογαριασμού.
 *
 * ΓΡΑΦΕΙ ΚΑΙ ΤΗΝ ΚΡΑΤΗΣΗ, ΠΑΝΤΑ. Δύο ξεχωριστές γραφές —μία για το πακέτο και
 * μία για την κράτηση— θα σήμαιναν ότι μια αναβάθμιση μπορεί να αφήσει πίσω
 * της την κράτηση μιας παλιότερης υποβάθμισης: ο πελάτης θα πλήρωνε το ακριβό
 * πακέτο και θα κρατούσε ένα ακόμη ακριβότερο ώς την ανανέωση. Οποιος καλεί,
 * λέει και τα δύο.
 *
 * ΜΟΝΟ ΜΕ ΡΟΛΟ ΥΠΗΡΕΣΙΑΣ, αφού έχει κριθεί το δικαίωμα και έχει απαντήσει ο
 * έμπορος: και οι τέσσερις στήλες είναι κλειδωμένες από τη `lock_billing_plan`.
 */
export interface PlanChangeWrite {
  plan: string;
  cycle: string;
  /** Το πακέτο που κρατιέται ώς την ανανέωση, ή `null` όταν δεν κρατιέται τίποτα. */
  holdPlan: string | null;
  holdUntil: string | null;
}

export function applyPlanChange(db: Db, userId: string, w: PlanChangeWrite) {
  return db.from(TABLE).update({
    plan: w.plan, billing_cycle: w.cycle,
    hold_plan: w.holdPlan, hold_until: w.holdUntil,
  }).eq('user_id', userId);
}

/** Ό,τι θα αγνοηθεί από μια εγγραφή πελάτη. Δηλωμένο, για να ελέγχεται. */
export const serverOwnedColumns: readonly string[] = SERVER_OWNED;
