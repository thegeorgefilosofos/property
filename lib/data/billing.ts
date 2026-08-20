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

/** Ό,τι θα αγνοηθεί από μια εγγραφή πελάτη. Δηλωμένο, για να ελέγχεται. */
export const serverOwnedColumns: readonly string[] = SERVER_OWNED;
