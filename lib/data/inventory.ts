// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΠΟΓΡΑΦΗ: ΔΕΚΑΕΠΤΑ ΚΛΗΣΕΙΣ, ΚΑΙ ΤΡΕΙΣ ΔΙΑΦΟΡΕΤΙΚΕΣ ΑΠΑΝΤΗΣΕΙΣ ΣΤΟ ΙΔΙΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ `updated_at` ΗΤΑΝ ΤΥΧΑΙΟ. Ο πίνακας `inventory_items` ΔΕΝ έχει σκανδάλη
// `update_updated_at_column` — σε αντίθεση με είκοσι άλλους πίνακες, όπου τη
// σφραγίδα τη βάζει η βάση. Εδώ την έβαζε ο καλών, και την έβαζε όποτε
// θυμόταν: η αλλαγή κατάστασης ναι, η μαζική αλλαγή δωματίου ναι, η αντιγραφή
// από άλλο ακίνητο όχι, η μαζική εισαγωγή όχι. Δηλαδή η στήλη που απαντά «πότε
// άλλαξε αυτό το αντικείμενο» έλεγε ψέματα σε δύο από τις τέσσερις διαδρομές.
// Τώρα μπαίνει σε ΚΑΘΕ ενημέρωση, σε ένα σημείο.
//
// ΤΟ ΑΚΙΝΗΤΟ ΚΑΙ Ο ΧΡΗΣΤΗΣ ΕΙΝΑΙ ΚΕΙΜΕΝΟ, ΟΧΙ uuid. Έτσι ορίστηκαν οι στήλες
// (`"property_id" text`), και μια σύγκριση uuid με κείμενο δεν αποτυγχάνει —
// γυρίζει άδειο. Η μετατροπή γίνεται εδώ, μία φορά, και όχι με `String(userId)`
// γραμμένο σε έξι σημεία και ξεχασμένο σε τέσσερα.
//
// ΚΑΜΙΑ ΑΠΟ ΤΙΣ ΕΞΙ ΑΝΑΓΝΩΣΕΙΣ ΑΝΑ ΑΚΙΝΗΤΟ ΔΕΝ ΦΙΛΤΡΑΡΕ ΤΟΝ ΧΡΗΣΤΗ, ούτε καν η
// αντιγραφή αντικειμένων ΑΠΟ άλλο ακίνητο — που είναι ακριβώς η διαδρομή όπου
// το αναγνωριστικό ακινήτου έρχεται από επιλογή στην οθόνη.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InventoryItemsRow } from '@/lib/supabase/tables';

const TABLE = 'inventory_items';

/** Οι παρτίδες κρατούν το ίδιο μέγεθος με τις υπόλοιπες μαζικές εισαγωγές. */
const BATCH = 50;

export type Db = SupabaseClient;
export type { InventoryItemsRow };
export type InventoryPatch = Partial<InventoryItemsRow> & Record<string, unknown>;

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/** Τα αντικείμενα ενός ακινήτου: νεότερο πρώτο. */
export async function ofProperty<T = Partial<InventoryItemsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', String(propertyId));
  if (userId) q = q.eq('user_id', String(userId));
  const { data } = await q.order('created_at', { ascending: false });
  return (data || []) as T[];
}

/** Όλη η απογραφή του χαρτοφυλακίου, αλφαβητικά: για τις χρεώσεις φθοράς. */
export async function ofUser<T = Partial<InventoryItemsRow>>(
  db: Db, userId: string, columns: string,
): Promise<T[]> {
  const { data } = await db.from(TABLE).select(columns).eq('user_id', String(userId)).order('name');
  return (data || []) as T[];
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

/**
 * Νέα αντικείμενα, σε παρτίδες. Το ακίνητο και ο χρήστης μπαίνουν εδώ.
 *
 * Η μαζική εισαγωγή από φύλλο και η αντιγραφή από άλλο ακίνητο έστελναν
 * ΟΛΟΚΛΗΡΗ τη λίστα σε ένα αίτημα — μια απογραφή τριακοσίων αντικειμένων είναι
 * ένα αίτημα που είτε περνά ολόκληρο είτε χάνεται ολόκληρο.
 */
export async function add(
  db: Db, propertyId: string, userId: string, rows: InventoryPatch[],
): Promise<{ error: { message?: string } | null }> {
  if (rows.length === 0) return { error: null };
  const stamped = rows.map(r => ({ ...r, property_id: String(propertyId), user_id: String(userId) }));
  for (let i = 0; i < stamped.length; i += BATCH) {
    const { error } = await db.from(TABLE).insert(stamped.slice(i, i + BATCH));
    if (error) return { error };
  }
  return { error: null };
}

/** Ενημέρωση ενός αντικειμένου. Η σφραγίδα χρόνου μπαίνει πάντα. */
export function update(db: Db, id: string, patch: InventoryPatch) {
  return db.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
}

/** Η ίδια αλλαγή σε πολλά αντικείμενα μαζί. */
export function updateMany(db: Db, ids: string[], patch: InventoryPatch) {
  return db.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).in('id', ids);
}

export function remove(db: Db, id: string) {
  return db.from(TABLE).delete().eq('id', id);
}

export function removeMany(db: Db, ids: string[]) {
  return db.from(TABLE).delete().in('id', ids);
}
