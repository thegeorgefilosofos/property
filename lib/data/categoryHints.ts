// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΚΑΝΟΝΕΣ ΤΟΥ ΙΔΙΟΚΤΗΤΗ ΓΙΑ ΤΙΣ ΚΑΤΗΓΟΡΙΕΣ
// ─────────────────────────────────────────────────────────────────────────
// Δύο πλευρές: οι οθόνες που γράφουν τη διόρθωση με την ταυτότητα του χρήστη
// (και η RLS κρίνει) και ο αποστολέας του ταχυδρομείου που τους ΔΙΑΒΑΖΕΙ με
// πελάτη υπηρεσίας για λογαριασμό συγκεκριμένου χρήστη — γι' αυτό κάθε
// ανάγνωση παίρνει ρητά το `userId` και δεν στηρίζεται μόνο στην RLS.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CategoryHintsRow } from '@/lib/supabase/tables';
import type { DbError } from '@/lib/supabase/writeResult';
import type { Hint } from '@/lib/expenses/hints';
import { read, type ReadResult } from './read';

const TABLE = 'category_hints';

export type Db = SupabaseClient;

/** Οσα χρειάζεται μια οθόνη για να ξέρει τι θα γράψει. */
export const HINT_COLUMNS = 'vendor_key,category';

export type HintRow = Pick<CategoryHintsRow, 'vendor_key' | 'category'>;

/** Ολοι οι κανόνες ενός ιδιοκτήτη. Λίγες δεκάδες γραμμές, μία ανάγνωση. */
export async function forUser(db: Db, userId: string): Promise<ReadResult<HintRow>> {
  return read<HintRow>(db.from(TABLE).select(HINT_COLUMNS).eq('user_id', userId));
}

/**
 * Γράφει ή ανανεώνει τον κανόνα ενός παρόχου.
 *
 * ΕΝΑ ΕΡΩΤΗΜΑ, ΟΧΙ ΔΥΟ. Ενα «κοίτα αν υπάρχει και μετά γράψε» αφήνει κενό
 * ανάμεσα στα δύο: δύο καρτέλες που σώζουν την ίδια στιγμή γράφουν και οι δύο
 * `insert` και η μία παίρνει σφάλμα διπλού κλειδιού. Το `upsert` πάνω στο
 * πρωτεύον κλειδί το λύνει στη βάση.
 */
export async function learn(
  db: Db, userId: string, vendorKey: string, category: string,
): Promise<{ error: DbError | null }> {
  const { error } = await db.from(TABLE).upsert({
    user_id: userId, vendor_key: vendorKey, category,
  }, { onConflict: 'user_id,vendor_key' });
  return { error: error as DbError | null };
}

/** Ο κανόνας δεν χρειάζεται πια: ο ιδιοκτήτης ξαναδιάλεξε ό,τι λέει η ταξινομία. */
export async function forget(
  db: Db, userId: string, vendorKey: string,
): Promise<{ error: DbError | null }> {
  const { error } = await db.from(TABLE).delete()
    .eq('user_id', userId).eq('vendor_key', vendorKey);
  return { error: error as DbError | null };
}

/** Ο,τι διάβασε η βάση, στη μορφή που ζητά η καθαρή βιβλιοθήκη. */
export const asHints = (rows: readonly HintRow[]): Hint[] =>
  rows.map(r => ({ vendor_key: r.vendor_key, category: r.category }));
