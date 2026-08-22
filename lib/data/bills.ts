// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΛΟΓΑΡΙΑΣΜΟΙ: ΤΟ ΠΡΟΓΡΑΜΜΑ, ΟΧΙ ΤΟ ΓΕΓΟΝΟΣ
// ─────────────────────────────────────────────────────────────────────────
// Είκοσι κλήσεις στον πίνακα `bills` από δεκατέσσερα αρχεία. Ο πίνακας είναι το
// μισό του ημερολογίου δαπανών: ο λογαριασμός είναι το ΠΡΟΓΡΑΜΜΑ («η ΔΕΗ έρχεται
// κάθε δίμηνο, λήγει στις 20»), η δαπάνη είναι το ΓΕΓΟΝΟΣ («πληρώθηκαν 84,50 €
// στις 18»). Τα δύο ενώνονται στο `lib/expenses/ledger.ts` με το `bill_id`.
//
// ── ΟΙ ΙΔΙΕΣ ΕΝΝΕΑ ΣΤΗΛΕΣ, ΠΕΝΤΕ ΦΟΡΕΣ ───────────────────────────────────
// Πέντε οθόνες ζητούσαν το ίδιο σύνολο στηλών με πέντε διαφορετικές σειρές, και
// δύο από αυτές το έδιναν κατευθείαν στον κοινό πυρήνα του ημερολογίου. Μια
// ξεχασμένη στήλη εκεί δεν βγάζει σφάλμα: βγάζει `undefined`, που γίνεται μηδέν,
// που γίνεται «φθηνό ακίνητο».
//
// ── ΤΟ «ΠΛΗΡΩΘΗΚΕ» ΕΙΝΑΙ ΔΥΟ ΣΤΗΛΕΣ ΚΑΙ ΜΙΑ ΥΠΟΧΡΕΩΣΗ ────────────────────
// Οι δύο στήλες (`paid`, `paid_at`) γράφονταν αυτούσιες σε τρία σημεία. Η
// υποχρέωση είναι ότι ΚΑΘΕ σήμανση πληρωμής πρέπει να συνοδεύεται από την
// αντίστοιχη κίνηση στη συνδεδεμένη δαπάνη (`expenses.markBillPaid`) — αλλιώς το
// ίδιο ευρώ μένει απλήρωτο στη μία οθόνη και πληρωμένο στην άλλη. Οι τρεις
// καλούντες το κάνουν σωστά· εδώ γράφεται ώστε ο τέταρτος να το βρει.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillsRow } from '@/lib/supabase/tables';
import { rows, row } from './read';

const TABLE = 'bills';

export type Db = SupabaseClient;
export type BillRow = BillsRow;

/**
 * Ό,τι χρειάζεται ο κοινός πυρήνας του ημερολογίου δαπανών.
 *
 * Ήταν γραμμένο πέντε φορές, με πέντε διαφορετικές σειρές. Το `lib/expenses/
 * ledger.ts` διαβάζει ΑΚΡΙΒΩΣ αυτές: πρόγραμμα, ποσό, προθεσμία, κατάσταση.
 */
export const LEDGER_COLUMNS = 'id,name,category,amount,paid,paid_at,due_date,recurring,created_at';

/** Το ίδιο, με το ακίνητο: για χαρτοφυλάκιο και συγκρίσεις. */
export const PORTFOLIO_COLUMNS = `${LEDGER_COLUMNS},property_id`;

export type BillPatch = { [K in keyof BillsRow]?: BillsRow[K] | null };

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/** Οι λογαριασμοί ενός ακινήτου. */
export async function ofProperty<T = Partial<BillsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
  opts: { paid?: boolean; category?: string; since?: string } = {},
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  if (opts.paid !== undefined) q = q.eq('paid', opts.paid);
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.since) q = q.gte('created_at', opts.since);
  return rows<T>(q);
}

/** Οι λογαριασμοί πολλών ακινήτων μαζί. */
export async function ofProperties<T = Partial<BillsRow>>(
  db: Db, propertyIds: string[], columns: string, userId: string,
): Promise<T[]> {
  if (!propertyIds.length) return [];
  return rows<T>(db.from(TABLE).select(columns).in('property_id', propertyIds).eq('user_id', userId));
}

/** Οι λογαριασμοί όλου του χαρτοφυλακίου. */
export async function ofUser<T = Partial<BillsRow>>(
  db: Db, userId: string, columns: string,
  // ΤΟ ΦΙΛΤΡΟ ΑΝΗΚΕΙ ΣΤΗ ΒΑΣΗ, ΟΧΙ ΣΤΟΝ ΚΑΛΟΥΝΤΑ. Η συνδρομή ημερολογίου
  // ζητά μόνο όσα λήγουν μέσα σε ένα παράθυρο· χωρίς αυτά τα δύο ορίσματα θα
  // κατέβαζε ΚΑΘΕ λογαριασμό της ζωής του λογαριασμού σε κάθε ανανέωση, για να
  // πετάξει τους περισσότερους.
  opts: { unpaid?: boolean; dueFrom?: string; dueTo?: string } = {},
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('user_id', userId);
  // Ιδιος κανόνας με τις δόσεις ενοικίου: «απλήρωτο» σημαίνει «όχι πληρωμένο»,
  // και ένα NULL είναι όχι πληρωμένο. Εδώ η στήλη ΕΧΕΙ προεπιλογή `false`, αλλά
  // ο κανόνας πρέπει να διαβάζεται ίδιος και στα δύο σημεία.
  if (opts.unpaid) q = q.not('paid', 'is', true);
  if (opts.dueFrom) q = q.gte('due_date', opts.dueFrom);
  if (opts.dueTo) q = q.lte('due_date', opts.dueTo);
  return rows<T>(q);
}

/** Ένας λογαριασμός, με τις στήλες που ζητά ο καλών. */
export async function one<T = Partial<BillsRow>>(
  db: Db, id: string, columns: string,
): Promise<T | null> {
  return row<T>(db.from(TABLE).select(columns).eq('id', id).maybeSingle());
}

/**
 * Λογαριασμοί που το όνομα ή οι σημειώσεις τους ταιριάζουν σε μοτίβο.
 *
 * Οι εκκρεμότητες ρωτούν «πληρώθηκε ο ΕΝΦΙΑ;» — ερώτηση στο ΚΕΙΜΕΝΟ. Το φίλτρο
 * μένει εδώ ώστε να μη γράφεται στην οθόνη μαζί με το όνομα του πίνακα.
 */
export async function matchingText<T = Partial<BillsRow>>(
  db: Db, propertyId: string, columns: string, orFilter: string, userId?: string, limit = 1,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  return rows<T>(q.or(orFilter).limit(limit));
}

/**
 * Οι τελευταίες μετρήσεις κιλοβατωρών, νεότερη πρώτη.
 *
 * Ζητιόταν με δύο διαφορετικούς τρόπους: μία φορά με σειρά και μία χωρίς. Χωρίς
 * σειρά, η PostgREST δεν εγγυάται τίποτα, οπότε «οι τελευταίες δώδεκα μετρήσεις»
 * ήταν δώδεκα τυχαίες — και από αυτές έβγαινε η σύγκριση κατανάλωσης.
 */
export async function kwhHistory<T = Partial<BillsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string, limit = 12,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId).eq('category', 'electricity');
  if (userId) q = q.eq('user_id', userId);
  return rows<T>(q.not('kwh', 'is', null).order('created_at', { ascending: false }).limit(limit));
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

export function add(db: Db, propertyId: string, userId: string, patch: BillPatch) {
  return db.from(TABLE).insert({ ...patch, property_id: propertyId, user_id: userId });
}

export function addReturning(
  db: Db, propertyId: string, userId: string, patch: BillPatch, columns = 'id',
): PromiseLike<{ data: { id: string } | null; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).insert({ ...patch, property_id: propertyId, user_id: userId }).select(columns).single();
}

export function update(db: Db, id: string, patch: BillPatch) {
  return db.from(TABLE).update(patch).eq('id', id);
}

/** Οι δύο στήλες που λένε «πληρώθηκε». */
export const paidFields = () => ({ paid: true, paid_at: new Date().toISOString() });

/**
 * Σημαίνει τον λογαριασμό πληρωμένο.
 *
 * ΔΕΝ ΑΓΓΙΖΕΙ ΤΗ ΣΥΝΔΕΔΕΜΕΝΗ ΔΑΠΑΝΗ, επίτηδες: η δαπάνη ανήκει σε άλλο στρώμα,
 * και μια σιωπηλή διπλή εγγραφή θα έκρυβε το ένα από τα δύο σφάλματα. Ο καλών
 * καλεί ΚΑΙ την `expenses.markBillPaid(db, id)` — αλλιώς το ίδιο ευρώ μένει
 * απλήρωτο στη μία οθόνη και πληρωμένο στην άλλη.
 */
export function markPaid(db: Db, id: string) {
  return db.from(TABLE).update(paidFields()).eq('id', id);
}
