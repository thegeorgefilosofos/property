// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΕΠΑΦΕΣ, ΚΑΙ ΤΟ JSON ΠΟΥ ΚΡΥΒΕΤΑΙ ΜΕΣΑ ΣΤΙΣ «ΣΗΜΕΙΩΣΕΙΣ»
// ─────────────────────────────────────────────────────────────────────────
// Ο πίνακας `contacts` έχει εννέα στήλες, αλλά η επαφή έχει τριάντα πεδία:
// δεύτερο τηλέφωνο, ΑΦΜ, IBAN, ειδικότητα, ετικέτες, ιστορικό σημειώσεων,
// εμβέλεια. Όλα ζουν μέσα στη στήλη `notes`, σε φάκελο `{ __v: 2, extra,
// notes }` — και ο φάκελος ήταν γραμμένος σε δύο μέρη.
//
// ΤΟ ΠΡΑΓΜΑΤΙΚΟ ΛΑΘΟΣ: η σάρωση εγγράφου έγραφε `JSON.stringify({ __v: 2,
// extra, notes: '' })` με το χέρι, δικό της αντίγραφο του φακέλου που η καρτέλα
// Επαφές παράγει με τη `serializeNotes`. Δύο εκδοχές του ίδιου σχήματος, και η
// μία σε αρχείο που κανείς δεν κοιτά όταν αλλάζει το άλλο. Την ημέρα που ο
// φάκελος γίνει `__v: 3`, η σάρωση θα συνεχίσει να γράφει `__v: 2` και οι
// επαφές που φτιάχνει θα ανοίγουν άδειες — χωρίς κανένα σφάλμα πουθενά.
//
// ΤΟ ΙΔΙΟ ΕΡΩΤΗΜΑ ΔΥΟ ΦΟΡΕΣ: οι Εκκρεμότητες ζητούσαν τον ενοικιαστή-επαφή
// δύο φορές μέσα στην ΙΔΙΑ φόρτωση — μια για `id,full_name` και μια για
// `full_name,phone,email`. Δύο ταξίδια στη βάση για μία γραμμή.
//
// ΚΑΙ ΤΡΕΙΣ ΑΝΑΓΝΩΣΕΙΣ ΑΝΑ ΑΚΙΝΗΤΟ ΧΩΡΙΣ ΧΡΗΣΤΗ: η απογραφή, και οι δύο των
// Εκκρεμοτήτων. Όπου ο καλών ξέρει τον χρήστη, μπαίνει και η δεύτερη κλειδαριά.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContactsRow } from '@/lib/supabase/tables';
import { rows as readRows } from './read';

const TABLE = 'contacts';

export type Db = SupabaseClient;
export type { ContactsRow };
export type ContactPatch = Partial<ContactsRow> & Record<string, unknown>;

// ── Ο ΦΑΚΕΛΟΣ ΤΩΝ ΣΗΜΕΙΩΣΕΩΝ ───────────────────────────────────────────────

/** Η έκδοση του φακέλου. Ένας αριθμός, ένα σημείο. */
const NOTES_VERSION = 2;

/** Ό,τι δεν χώρεσε σε στήλη. Ελεύθερο, γιατί μεγαλώνει χωρίς μετανάστευση. */
export type ContactExtraData = Record<string, unknown>;

/** Το κείμενο της στήλης `notes` → τα δύο κομμάτια του. */
export function decodeNotes(raw: string | null | undefined): { extra: ContactExtraData; notes: string } {
  const text = raw || '';
  try {
    const parsed = JSON.parse(text || '{}');
    if (parsed?.__v === NOTES_VERSION) return { extra: parsed.extra || {}, notes: parsed.notes || '' };
  } catch { /* παλιά επαφή με σκέτο κείμενο: δεν είναι σφάλμα, είναι ιστορικό */ }
  return { extra: {}, notes: text };
}

/** Και η αντίστροφη πορεία, για αποθήκευση. */
export function encodeNotes(extra: ContactExtraData, notes: string): string {
  return JSON.stringify({ __v: NOTES_VERSION, extra, notes });
}

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/** Όλες οι επαφές του χαρτοφυλακίου, αλφαβητικά. */
export async function ofUser<T = Partial<ContactsRow>>(
  db: Db, userId: string, columns: string, opts: { orderBy?: string; ascending?: boolean; limit?: number } = {},
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('user_id', userId)
    .order(opts.orderBy ?? 'full_name', { ascending: opts.ascending ?? true });
  if (opts.limit) q = q.limit(opts.limit);
  return readRows<T>(q);
}

/** Οι επαφές ενός ακινήτου, αλφαβητικά. */
export async function ofProperty<T = Partial<ContactsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  return readRows<T>(q.order('full_name'));
}

/**
 * Η επαφή ενός ρόλου σε αυτό το ακίνητο, ή `null`.
 *
 * Ο ρόλος «tenant» ζητιόταν δύο φορές μέσα στην ίδια φόρτωση, με διαφορετικές
 * στήλες. Μία κλήση, όλες οι στήλες που χρειάζεται ο καλών.
 */
export async function withRole<T = Partial<ContactsRow>>(
  db: Db, propertyId: string, role: string, columns: string, userId?: string,
): Promise<T | null> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId).eq('role', role);
  if (userId) q = q.eq('user_id', userId);
  // ΟΧΙ `row()`: το ερώτημα ζητά λίστα με `limit(1)`, όχι `maybeSingle`. Η
  // πρώτη γραμμή — ή `null` — μένει ακριβώς όπως ήταν.
  return (await readRows<T>(q.limit(1)))[0] ?? null;
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

/** Νέα επαφή. Το ακίνητο και ο χρήστης μπαίνουν εδώ. */
export function add(db: Db, propertyId: string, userId: string, patch: ContactPatch) {
  return db.from(TABLE).insert({ ...patch, property_id: propertyId, user_id: userId });
}

/** Νέα επαφή, με επιστροφή του κλειδιού της. Για όποιον τη χρειάζεται αμέσως. */
export function addReturningId(db: Db, propertyId: string, userId: string, patch: ContactPatch) {
  return db.from(TABLE).insert({ ...patch, property_id: propertyId, user_id: userId }).select('id').single();
}

export function update(db: Db, id: string, patch: ContactPatch) {
  return db.from(TABLE).update(patch).eq('id', id);
}

export function remove(db: Db, id: string) {
  return db.from(TABLE).delete().eq('id', id);
}

export function removeMany(db: Db, ids: string[]) {
  return db.from(TABLE).delete().in('id', ids);
}
