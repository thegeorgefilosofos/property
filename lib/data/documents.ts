// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΑΡΧΕΙΟ: ΜΙΑ ΑΜΥΝΑ ΓΡΑΜΜΕΝΗ ΤΕΣΣΕΡΙΣ ΦΟΡΕΣ, ΜΕ ΤΕΣΣΕΡΑ ΔΙΑΦΟΡΕΤΙΚΑ ΟΡΙΑ
// ─────────────────────────────────────────────────────────────────────────
// Πέντε στήλες του `property_documents` (`amount`, `provider_afm`,
// `period_from`, `period_to`, `issue_date`) ήρθαν με το migration
// 20260730090000. Η βάση είναι σε δωρεάν βαθμίδα, χωρίς αντίγραφα ασφαλείας,
// και το migration μπορεί να μην έχει τρέξει ακόμη — οπότε ο κώδικας γράφει
// αμυντικά: αν λείπει στήλη, ξαναδοκιμάζει χωρίς αυτήν, ώστε το χαρτί του
// χρήστη να μη χάνεται ποτέ επειδή λείπει μια στήλη.
//
// ΣΩΣΤΗ ΑΠΟΦΑΣΗ, ΓΡΑΜΜΕΝΗ ΤΕΣΣΕΡΙΣ ΦΟΡΕΣ, ΚΑΙ ΤΙΣ ΤΕΣΣΕΡΙΣ ΑΛΛΙΩΣ:
//
//   • η σάρωση αφαιρεί ΜΙΑ στήλη τη φορά, με τον σωστό βρόχο·
//   • η διόρθωση του Αρχείου έχει τον ίδιο βρόχο, με δική της λίστα στηλών·
//   • η αρχειοθέτηση PDF ξέρει ΜΟΝΟ το `supplier` — τίποτε άλλο·
//   • η εκκρεμότητα, στο πρώτο σφάλμα, ξαναγράφει με φορτίο που πετάει ΚΑΙ ΤΙΣ
//     ΠΕΝΤΕ στήλες μαζί. Δηλαδή αν έλειπε μόνο το `issue_date`, το παραστατικό
//     αρχειοθετούνταν και χωρίς ποσό, χωρίς ΑΦΜ και χωρίς περίοδο — δηλαδή
//     χωρίς τίποτα από όσα το κάνουν απόδειξη αντί για εικόνα.
//
// Η λίστα των προαιρετικών στηλών ζει τώρα σε ένα σημείο, και ο βρόχος επίσης.
//
// ΚΑΙ ΤΡΕΙΣ ΑΝΑΓΝΩΣΕΙΣ ΧΩΡΙΣ ΧΡΗΣΤΗ: το Αρχείο, τα παραστατικά παρόχου στις
// Επαφές και το πλήθος εγγράφων στην Επισκόπηση.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PropertyDocumentsRow } from '@/lib/supabase/tables';

const TABLE = 'property_documents';

export type Db = SupabaseClient;
export type { PropertyDocumentsRow };
export type DocumentPatch = Record<string, unknown>;

/**
 * Στήλες που μπορεί να μην υπάρχουν ακόμη στη βάση.
 *
 * Ήταν γραμμένες δύο φορές με το ίδιο περιεχόμενο, μία φορά μισές, και μία φορά
 * καθόλου. Η σειρά μετράει: αφαιρείται μία τη φορά, ξεκινώντας από όποια
 * αναφέρει το σφάλμα, ποτέ όλες μαζί.
 */
export const OPTIONAL_COLUMNS = [
  'amount', 'provider_afm', 'period_from', 'period_to', 'issue_date', 'supplier',
] as const;

/**
 * Εκτελεί μια γραφή και, αν αποτύχει επειδή λείπει προαιρετική στήλη, την
 * αφαιρεί και ξαναδοκιμάζει. Μία στήλη τη φορά.
 */
async function withoutMissingColumns<R>(
  payload: DocumentPatch,
  run: (p: DocumentPatch) => PromiseLike<{ data?: R; error: { message?: string } | null }>,
): Promise<{ data: R | null; error: { message?: string } | null }> {
  const p: DocumentPatch = { ...payload };
  for (let i = 0; i <= OPTIONAL_COLUMNS.length; i++) {
    const { data, error } = await run(p);
    if (!error) return { data: (data ?? null) as R | null, error: null };
    const message = error.message ?? '';
    const missing = OPTIONAL_COLUMNS.find(c => c in p && new RegExp(`\\b${c}\\b`, 'i').test(message));
    if (!missing) return { data: null, error };
    delete p[missing];
  }
  return { data: null, error: { message: 'Το έγγραφο δεν καταχωρήθηκε' } };
}

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/** Τα έγγραφα ενός ακινήτου: νεότερο πρώτο. */
export async function ofProperty<T = Partial<PropertyDocumentsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  const { data } = await q.order('created_at', { ascending: false });
  return (data || []) as T[];
}

/**
 * Τα παραστατικά ενός εκδότη, από το ΑΦΜ του. Αυτό ζητά ο λογιστής.
 *
 * Αν η στήλη `provider_afm` δεν υπάρχει ακόμη, το ερώτημα αποτυγχάνει ολόκληρο
 * και η απάντηση είναι «κανένα» — όχι σφάλμα στην οθόνη.
 */
export async function ofSupplierAfm<T = Partial<PropertyDocumentsRow>>(
  db: Db, propertyId: string, afm: string, columns: string, userId?: string, limit = 50,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId).eq('provider_afm', afm);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q.order('doc_date', { ascending: false }).limit(limit);
  return error ? [] : ((data || []) as T[]);
}

/** Τα έγγραφα που έχουν δεθεί με έναν αντισυμβαλλόμενο (π.χ. `tenant:<id>`). */
export async function ofSupplier<T = Partial<PropertyDocumentsRow>>(
  db: Db, propertyId: string, supplier: string, columns: string, userId?: string,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId).eq('supplier', supplier);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  return error ? [] : ((data || []) as T[]);
}

/** Πόσα έγγραφα έχει αυτό το ακίνητο. Χωρίς να κατεβεί καμία γραμμή. */
export async function count(db: Db, propertyId: string, userId?: string): Promise<number> {
  let q = db.from(TABLE).select('id', { count: 'exact', head: true }).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  const { count: n } = await q;
  return n ?? 0;
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

/** Νέο έγγραφο. Επιστρέφει το κλειδί του, ή `null` αν δεν χρειάστηκε. */
export async function add(
  db: Db, propertyId: string, userId: string, patch: DocumentPatch,
): Promise<{ id: string | null; error: { message?: string } | null }> {
  const { data, error } = await withoutMissingColumns<{ id?: string } | null>(
    { ...patch, property_id: propertyId, user_id: userId },
    p => db.from(TABLE).insert(p).select('id').single(),
  );
  return { id: data?.id ?? null, error };
}

/** Ενημέρωση ενός ή περισσότερων εγγράφων, με την ίδια άμυνα στηλών. */
export async function update(db: Db, ids: string[], patch: DocumentPatch) {
  if (ids.length === 0) return { data: null, error: null };
  return withoutMissingColumns<null>(patch, p => db.from(TABLE).update(p).in('id', ids));
}

export function remove(db: Db, id: string) {
  return db.from(TABLE).delete().eq('id', id);
}

export function removeMany(db: Db, ids: string[]) {
  return db.from(TABLE).delete().in('id', ids);
}
