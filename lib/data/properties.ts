// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΑΚΙΝΗΤΑ: ΕΝΑ ΣΠΙΤΙ, ΚΑΙ ΔΕΥΤΕΡΗ ΚΛΕΙΔΑΡΙΑ ΣΤΗΝ ΠΟΡΤΑ
// ─────────────────────────────────────────────────────────────────────────
// Σαράντα εννέα κλήσεις στον πίνακα `user_properties` από τριάντα αρχεία, και
// σχεδόν όλες με το ίδιο σχήμα: `.select('τρεις στήλες').eq('id', propertyId)`.
// Δεκαπέντε διαφορετικοί συνδυασμοί στηλών, γραμμένοι ο καθένας από την αρχή.
//
// ΤΟ ΣΟΒΑΡΟ ΔΕΝ ΕΙΝΑΙ Η ΕΠΑΝΑΛΗΨΗ. Είναι ότι καμία από αυτές τις αναγνώσεις δεν
// φιλτράρει με `user_id`: ζητούν ένα ακίνητο ΜΕ ΤΟ ΑΝΑΓΝΩΡΙΣΤΙΚΟ ΤΟΥ και
// βασίζονται αποκλειστικά στην πολιτική RLS για να μη γυρίσει ξένη γραμμή.
//
// Η RLS είναι σωστή και πρέπει να μείνει η κύρια άμυνα. Αλλά είναι ΜΙΑ άμυνα,
// γραμμένη σε άλλο αρχείο, σε άλλη γλώσσα, από άλλο πέρασμα: μια λάθος
// μετανάστευση, ένας πίνακας που ξεχάστηκε, ένα `USING (true)` που έμεινε από
// δοκιμή, και σαράντα εννέα σημεία διαρρέουν ταυτόχρονα, σιωπηλά.
//
// Όπου ο καλών ΞΕΡΕΙ τον χρήστη, το στρώμα προσθέτει `.eq('user_id', userId)`.
// Δεν αντικαθιστά την RLS· στέκεται μπροστά της. Αν κάποτε πέσει η μία, η άλλη
// κρατάει — και αν πέσουν και οι δύο, τουλάχιστον το ξέρουμε από ένα σημείο.
//
// ΟΙ ΣΤΗΛΕΣ ΕΧΟΥΝ ΟΝΟΜΑΤΑ. Τρεις οθόνες ζητούσαν «id,name,address», δύο
// «id,name», μία «id,name,address,sqm,atak». Οι συνηθισμένες ομάδες γράφονται
// μία φορά και λέγονται με τη λέξη τους.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserPropertiesRow } from '@/lib/supabase/tables';
// ΤΟ `row` ΠΑΙΡΝΕΙ ΨΕΥΔΩΝΥΜΟ: το αρχείο έχει ήδη παραμέτρους με το όνομα `row`
// στις εγγραφές (`add`, `addFull`).
import { read, row as readRow } from './read';

const TABLE = 'user_properties';

export type Db = SupabaseClient;
export type PropertyRow = UserPropertiesRow;

/** Ό,τι χρειάζεται ένας επιλογέας ακινήτου: όνομα και διεύθυνση. */
export const CARD_COLUMNS = 'id,name,address';

/** Ό,τι χρειάζεται μια λίστα με στοιχεία μεγέθους και μητρώου. */
export const LIST_COLUMNS = 'id,name,address,sqm,atak';

export type PropertyCard = Pick<UserPropertiesRow, 'id' | 'name' | 'address'>;

export interface Outcome { data: null; error: { message?: string; code?: string } | null }

/**
 * Ό,τι γράφεται σε ακίνητο.
 *
 * ΔΕΝ είναι `Partial<UserPropertiesRow>`: εκεί το «προαιρετικό» σημαίνει «ή
 * undefined», ενώ η βάση δέχεται ρητό NULL σε κάθε στήλη που το επιτρέπει — και
 * το «καθάρισε αυτό το πεδίο» γράφεται ακριβώς έτσι. Με το `Partial` ο
 * μεταγλωττιστής απέρριπτε το σβήσιμο τιμής.
 */
export type PropertyPatch = { [K in keyof UserPropertiesRow]?: UserPropertiesRow[K] | null };

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/**
 * Ένα ακίνητο, με τις στήλες που ζητά ο καλών.
 *
 * Το `userId` είναι προαιρετικό μόνο επειδή δεν το έχουν όλες οι οθόνες στο
 * χέρι· όπου υπάρχει, ΔΙΝΕΤΑΙ. Δεύτερη κλειδαριά, όχι διακοσμητικό.
 */
export async function one<T = Partial<UserPropertiesRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
): Promise<T | null> {
  let q = db.from(TABLE).select(columns).eq('id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  return readRow<T>(q.maybeSingle());
}

/** Τα ακίνητα ενός χρήστη. */
export async function list<T = PropertyCard>(
  db: Db, userId: string,
  opts: { columns?: string; orderBy?: string; ascending?: boolean } = {},
): Promise<T[]> {
  // ΕΝΑ ΜΟΝΟΠΑΤΙ: η απλή εκδοχή είναι η ίδια ανάγνωση, χωρίς το σφάλμα της.
  return (await listWithError<T>(db, userId, opts)).rows;
}

/**
 * Τα ακίνητα ΜΑΖΙ με το σφάλμα.
 *
 * Η Επισκόπηση πρέπει να ξεχωρίζει το «δεν έχεις ακίνητα» από το «δεν μπόρεσα
 * να τα διαβάσω»: το πρώτο δείχνει καλωσόρισμα, το δεύτερο πρέπει να πει ότι τα
 * δεδομένα υπάρχουν και φταίει η σύνδεση. Με σκέτη λίστα τα δύο γίνονται ένα,
 * και ο χρήστης νομίζει ότι έχασε τα ακίνητά του.
 */
export async function listWithError<T = PropertyCard>(
  db: Db, userId: string,
  opts: { columns?: string; orderBy?: string; ascending?: boolean } = {},
): Promise<{ rows: T[]; error: { message?: string; code?: string } | null }> {
  let q = db.from(TABLE).select(opts.columns ?? CARD_COLUMNS).eq('user_id', userId);
  if (opts.orderBy) q = q.order(opts.orderBy, { ascending: opts.ascending !== false });
  const { rows, error } = await read<T>(q);
  // Το ίδιο αντικείμενο σφάλματος περνά ΩΣ ΕΧΕΙ· μόνο ο τύπος `DbError` είναι
  // πλατύτερος (δέχεται `null` στα πεδία), γι' αυτό η στένωση εδώ — η δημόσια
  // υπογραφή της συνάρτησης μένει απαράλλαχτη.
  return { rows, error: error as { message?: string; code?: string } | null };
}

/**
 * Ερώτημα με την εμβέλεια δεμένη, για τη ΜΙΑ οθόνη που χτίζει το φίλτρο της
 * δυναμικά (η λωρίδα ΑΜΑ δείχνει είτε όλα τα ακίνητα είτε ένα). Παντού αλλού
 * χρησιμοποιείται η `list`: ένας γενικός κατασκευαστής σε κάθε οθόνη θα ήταν
 * ακριβώς η σκόρπια γνώση που το στρώμα ήρθε να μαζέψει.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function query(db: Db, userId: string, columns: string): any {
  return db.from(TABLE).select(columns).eq('user_id', userId);
}

/** Πόσα ακίνητα του χρήστη είναι σε βραχυχρόνια μίσθωση. */
export async function countShortTerm(db: Db, userId: string): Promise<number> {
  const { count: n } = await db.from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('rental_mode', 'short_term');
  return n ?? 0;
}

/**
 * Πόσα ακίνητα έχει ο χρήστης.
 *
 * Με `head: true` δεν κατεβαίνει καμία γραμμή: το πλήθος έρχεται από κεφαλίδα.
 * Τρεις οθόνες το έγραφαν σωστά και καμία δεν το είχε ονομάσει.
 */
export async function count(db: Db, userId: string): Promise<number> {
  const { count: n } = await db.from(TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId);
  return n ?? 0;
}

// ── ΓΡΑΨΙΜΟ ────────────────────────────────────────────────────────────────

/** Ενημέρωση ακινήτου, δεμένη στον χρήστη όπου τον ξέρουμε. */
export function update(
  db: Db, propertyId: string, patch: PropertyPatch, userId?: string,
): PromiseLike<{ error: { message?: string; code?: string } | null }> {
  const q = db.from(TABLE).update(patch).eq('id', propertyId);
  return userId ? q.eq('user_id', userId) : q;
}

/** Νέο ακίνητο, με το αναγνωριστικό του πίσω. */
export function add(
  db: Db, row: PropertyPatch,
): PromiseLike<{ data: { id: string } | null; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).insert(row).select('id').single();
}

/** Νέο ακίνητο, με ΟΛΗ τη γραμμή πίσω: η Επισκόπηση το βάζει αμέσως στη λίστα. */
export function addFull<T>(
  db: Db, row: PropertyPatch,
): PromiseLike<{ data: T | null; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).insert(row).select('*').single();
}

/** Διαγραφή ακινήτου. Ο χρήστης δίνεται πάντα: εδώ δεν υπάρχει «δεν τον ξέρω». */
export function remove(db: Db, propertyId: string, userId: string): PromiseLike<{ error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).delete().eq('id', propertyId).eq('user_id', userId);
}
