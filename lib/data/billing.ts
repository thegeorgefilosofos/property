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
// αλλά ΟΧΙ το `billing_cycle` ούτε τα `stripe_*`. Η μία οθόνη που το ήξερε
// έγραφε `delete payload.plan; delete payload.billing_cycle;` δίπλα σε ένα
// σχόλιο· οι άλλες πέντε δεν το ήξεραν καθόλου. Τώρα το ξέρει το στρώμα, και
// το ξέρει για όλους.
//
// ΤΟ `updated_at` ΤΟ ΕΓΡΑΦΕ ΜΙΑ ΣΤΙΣ ΕΞΙ. Ο πίνακας δεν έχει σκανδάλη γι' αυτό:
// μόνο η φόρμα τιμολόγησης το έστελνε. Η αλλαγή ονόματος, ο τύπος προφίλ, η
// νομική μορφή, τα βιβλία και η συγκατάθεση δεδομένων άφηναν τη στήλη στην
// τιμή που είχε από την προηγούμενη φορά — δηλαδή η μόνη ένδειξη «πότε άλλαξε
// αυτό το προφίλ» ήταν λάθος στις πέντε από τις έξι διαδρομές.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingProfilesRow } from '@/lib/supabase/tables';

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
  'stripe_customer_id', 'stripe_subscription_id', 'subscription_status',
] as const;

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/** Το προφίλ του χρήστη, ή `null` αν δεν έχει δημιουργηθεί ακόμη. */
export async function profile<T = Partial<BillingProfilesRow>>(
  db: Db, userId: string, columns: string,
): Promise<T | null> {
  if (!userId) return null;
  const { data } = await db.from(TABLE).select(columns).eq('user_id', userId).maybeSingle();
  return (data as T | null) ?? null;
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
  const { data, error } = await db.from(TABLE).select(columns).eq('user_id', userId).maybeSingle();
  return { data: (data as T | null) ?? null, error };
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

/**
 * Γράφει ό,τι επιτρέπεται να γράψει ο χρήστης, και σφραγίζει τον χρόνο.
 *
 * Το κλειδί σύγκρουσης είναι το `user_id` — το πρωτεύον κλειδί του πίνακα.
 */
export function save(db: Db, userId: string, patch: BillingPatch) {
  const clean: Record<string, unknown> = { ...patch };
  for (const key of SERVER_OWNED) delete clean[key];
  return db.from(TABLE).upsert(
    { ...clean, user_id: userId, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
}

/** Ό,τι θα αγνοηθεί από μια εγγραφή πελάτη. Δηλωμένο, για να ελέγχεται. */
export const serverOwnedColumns: readonly string[] = SERVER_OWNED;
