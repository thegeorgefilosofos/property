// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΔΑΝΕΙΑ: ΟΙ ΓΡΑΜΜΕΣ ΓΙΝΟΝΤΑΙ ΔΟΣΕΙΣ ΠΡΙΝ ΦΤΑΣΟΥΝ ΣΤΗΝ ΟΘΟΝΗ
// ─────────────────────────────────────────────────────────────────────────
// Δώδεκα κλήσεις στον πίνακα `loans` από έντεκα αρχεία. Το σχήμα ήταν ήδη σε ένα
// σημείο (`lib/loans/shape.ts` → `LOAN_COLUMNS`, `toLoanViews`), αλλά η ΧΡΗΣΗ του
// όχι: κάθε οθόνη ζητούσε μόνη της τις γραμμές και θυμόταν —ή ξεχνούσε— να τις
// περάσει από τη μετατροπή.
//
// ΓΙΑΤΙ ΕΧΕΙ ΣΗΜΑΣΙΑ Η ΜΕΤΑΤΡΟΠΗ: ο πίνακας ΔΕΝ έχει στήλες `amount` και `rate`.
// Το ποσό βγαίνει από `loan_amount` μείον την προκαταβολή, και το επιτόκιο από
// τον τύπο (σταθερό, ή Euribor συν περιθώριο). Μια γραμμή που φτάνει ωμή στην
// οθόνη δίνει `undefined`, που γίνεται μηδέν: δάνειο χωρίς δόση και χωρίς τόκο.
//
// ΚΑΙ ΤΟ `user_id`: πέντε από τις δώδεκα αναγνώσεις ζητούσαν δάνεια με σκέτο
// `property_id` — ο προϋπολογισμός, η ασφάλιση, η λογιστική, το ημερολόγιο και οι
// εκκρεμότητες. Όπου ο καλών ξέρει τον χρήστη, μπαίνει και το φίλτρο.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import { LOAN_COLUMNS, toLoanViews, isActiveLoan, type LoanRow, type LoanView } from '@/lib/loans/shape';
import { must } from '@/lib/supabase/must';

const TABLE = 'loans';

export type Db = SupabaseClient;
export type { LoanRow, LoanView };
export { LOAN_COLUMNS };

export type LoanPatch = { [K in keyof LoanRow]?: LoanRow[K] | null };

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/**
 * Τα δάνεια ενός ακινήτου, έτοιμα για την οθόνη: νεότερο πρώτο.
 *
 * Επιστρέφει `LoanView`, όχι ωμές γραμμές. Η μετατροπή δεν είναι προαιρετική και
 * γι' αυτό δεν αφήνεται στον καλούντα.
 *
 * ΤΟ `strict` ΔΕΝ ΕΙΝΑΙ ΓΟΥΣΤΟ. Μια οθόνη που απλώς ΔΕΙΧΝΕΙ δάνεια μπορεί να
 * δείξει άδειο αν η ανάγνωση αποτύχει — άσχημο, αλλά ειλικρινές. Ο συγχρονισμός
 * του ημερολογίου ΟΧΙ: αυτός ανακοινώνει «συγχρονίστηκαν Ν δόσεις», και με
 * αποτυχία που καταπίνεται ανακοινώνει «μηδέν» σαν να μην υπάρχει δάνειο. Εκεί
 * το σφάλμα πρέπει να φτάσει στο try/catch που ήδη το περιμένει.
 */
export async function ofProperty(
  db: Db, propertyId: string, userId?: string,
  opts: { activeOnly?: boolean; strict?: boolean } = {},
): Promise<LoanView[]> {
  let q = db.from(TABLE).select(LOAN_COLUMNS).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  const q2 = q.order('created_at', { ascending: false });
  const rows = opts.strict ? await must(q2) : (await q2).data;
  const views = toLoanViews(rows as LoanRow[] | null);
  return opts.activeOnly ? views.filter(isActiveLoan) : views;
}

/** Τα δάνεια όλου του χαρτοφυλακίου, για αναφορές και ημερολόγιο λογιστή. */
export async function ofUser(db: Db, userId: string, columns = LOAN_COLUMNS): Promise<LoanView[]> {
  const { data } = await db.from(TABLE).select(columns).eq('user_id', userId)
    .order('created_at', { ascending: false });
  return toLoanViews(data as LoanRow[] | null);
}

/**
 * Υπάρχει ενεργό δάνειο σε αυτό το ακίνητο;
 *
 * Η ασφάλιση ρωτούσε μόνο τη στήλη `status` και έκρινε μόνη της τι σημαίνει
 * «ενεργό», με δύο συγκρίσεις γραμμένες στη σειρά. Ο κανόνας ζει στο
 * `lib/loans/shape.ts` και είναι ένας: ό,τι δεν έχει σημανθεί αλλιώς.
 */
export async function hasActive(db: Db, propertyId: string, userId?: string): Promise<boolean> {
  return (await ofProperty(db, propertyId, userId, { activeOnly: true })).length > 0;
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

/** Νέο δάνειο. Το ακίνητο και ο χρήστης μπαίνουν εδώ, όχι στον καλούντα. */
export function add(db: Db, propertyId: string, userId: string, patch: LoanPatch) {
  return db.from(TABLE).insert({ ...patch, property_id: propertyId, user_id: userId });
}

export function update(db: Db, id: string, patch: LoanPatch) {
  return db.from(TABLE).update(patch).eq('id', id);
}

export function remove(db: Db, id: string) {
  return db.from(TABLE).delete().eq('id', id);
}
