// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΕΚΚΡΕΜΟΤΗΤΕΣ: ΤΡΕΙΣ ΣΤΗΛΕΣ ΠΟΥ ΠΡΕΠΕΙ ΝΑ ΣΥΜΦΩΝΟΥΝ, ΚΑΙ ΣΥΜΦΩΝΟΥΝ ΕΔΩ
// ─────────────────────────────────────────────────────────────────────────
// Τριάντα μία κλήσεις στον πίνακα `checklist_items` από έξι αρχεία. Δύο μοτίβα
// επαναλαμβάνονταν αυτούσια, και τα δύο είναι κανόνες της εφαρμογής:
//
// ── 1. ΤΙ ΕΙΝΑΙ «ΑΝΟΙΧΤΗ ΕΚΚΡΕΜΟΤΗΤΑ» ────────────────────────────────────
//
//     .neq('status', 'done').neq('status', 'skipped')
//
// Γραμμένο τέσσερις φορές: Επισκόπηση, Χαρτοφυλάκιο, βοηθός, υποχρεώσεις. Δύο
// αρνήσεις στη σειρά είναι εύκολο να γίνουν μία σε μια βιαστική αντιγραφή — και
// τότε οι παρατημένες εργασίες μετρούν ως εκκρεμείς, για πάντα.
//
// ── 2. ΤΟ ΚΛΕΙΣΙΜΟ ΓΡΑΦΕΙ ΤΡΕΙΣ ΣΤΗΛΕΣ ───────────────────────────────────
//
//     { status: 'done', completed: true, completed_at: <τώρα> }
//
// Γραμμένο τέσσερις φορές, και η αντίστροφη κίνηση («ξανα-άνοιγμα») μία, με
// τριπλό τριαδικό τελεστή. Οι τρεις στήλες ΠΡΕΠΕΙ να συμφωνούν: η οθόνη διαβάζει
// `status`, το φίλτρο του χαρτοφυλακίου διαβάζει `status`, οι αναφορές διαβάζουν
// `completed`, και η χρονολόγηση διαβάζει `completed_at`. Μία ξεχασμένη στήλη
// σημαίνει εργασία που φαίνεται κλειστή σε μία οθόνη και ανοιχτή στην άλλη.
//
// ── ΚΑΙ ΤΟ `user_id` ─────────────────────────────────────────────────────
// Πέντε αναγνώσεις ζητούσαν εκκρεμότητες με σκέτο `property_id`, στηριγμένες
// αποκλειστικά στην RLS. Όπου ο καλών ξέρει τον χρήστη, μπαίνει και το φίλτρο.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistItemsRow } from '@/lib/supabase/tables';
// ΤΟ `rows` ΠΑΙΡΝΕΙ ΨΕΥΔΩΝΥΜΟ: το αρχείο ονομάζει ήδη `row`/`rows` τις
// παραμέτρους των εγγραφών (`add`, `addMany`), και μια σκέτη εισαγωγή θα
// σκιαζόταν μέσα τους.
import { rows as readRows } from './read';

const TABLE = 'checklist_items';

export type Db = SupabaseClient;
export type ChecklistRow = ChecklistItemsRow;

/** Ό,τι χρειάζεται μια ατζέντα: πότε λήγει, πού βρίσκεται, πόσο επείγει. */
export const AGENDA_COLUMNS = 'due_date,status,priority';

/**
 * Καταστάσεις που ΔΕΝ είναι ανοιχτή εκκρεμότητα.
 *
 * Το `skipped` δεν είναι «ακυρωμένο λάθος»: είναι εργασία που ο ιδιοκτήτης
 * αποφάσισε ρητά να μην κάνει. Μετράει στο ιστορικό, δεν μετράει στα εκκρεμή.
 */
export const CLOSED_STATUSES = ['done', 'skipped'] as const;

/** Ανοιχτή; Η μία ανάγνωση του κανόνα, για ό,τι έχει ήδη φορτωθεί σε μνήμη. */
export const isOpen = (t: { status?: string | null }): boolean =>
  !CLOSED_STATUSES.includes(String(t.status ?? '') as (typeof CLOSED_STATUSES)[number]);

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/** Οι ανοιχτές εκκρεμότητες ενός ακινήτου. */
export async function open<T = Partial<ChecklistItemsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  return readRows<T>(onlyOpen(q));
}

/**
 * Οι ανοιχτές εκκρεμότητες ενός ακινήτου, με προθεσμία πρώτα.
 *
 * Ξεχωριστή από την `open` επειδή αυτό που αλλάζει δεν είναι η ταξινόμηση αλλά η
 * ΕΡΩΤΗΣΗ: «τι με περιμένει» θέλει σειρά και ταβάνι, «πόσα έχω ανοιχτά» όχι.
 * Οι εργασίες χωρίς προθεσμία πάνε τελευταίες: δεν είναι επείγουσες, είναι
 * αχρονολόγητες.
 */
export async function upcoming<T = Partial<ChecklistItemsRow>>(
  db: Db, propertyId: string, columns: string, userId: string, limit = 60,
): Promise<T[]> {
  return readRows<T>(onlyOpen(
    db.from(TABLE).select(columns).eq('property_id', propertyId).eq('user_id', userId),
  ).order('due_date', { ascending: true, nullsFirst: false }).limit(limit));
}

/** Οι ανοιχτές εκκρεμότητες όλου του χαρτοφυλακίου. */
export async function openOfUser<T = Partial<ChecklistItemsRow>>(
  db: Db, userId: string, columns: string,
): Promise<T[]> {
  return readRows<T>(onlyOpen(db.from(TABLE).select(columns).eq('user_id', userId)));
}

/** Κάθε εργασία του ακινήτου, με τη σειρά που τη βλέπει ο χρήστης. */
export async function all<T = Partial<ChecklistItemsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  return readRows<T>(q.order('sort_order').order('created_at'));
}

/**
 * Εργασίες που η περιγραφή τους ταιριάζει σε μοτίβο.
 *
 * Η ασφάλιση ρωτά «υπάρχει εκκρεμότητα ανανέωσης ασφαλιστηρίου;» — ερώτηση στο
 * ΚΕΙΜΕΝΟ, όχι στην κατάσταση. Μένει εδώ ώστε το `ilike` να μη γράφεται στην
 * οθόνη μαζί με το όνομα του πίνακα.
 */
export async function matchingDescription<T = Partial<ChecklistItemsRow>>(
  db: Db, propertyId: string, columns: string, pattern: string, userId?: string, limit = 1,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  return readRows<T>(q.ilike('description', pattern).limit(limit));
}

/** Ποια πρότυπα έχουν ήδη εφαρμοστεί εδώ. Για να μη διπλογραφτούν. */
export async function templateIds(
  db: Db, propertyId: string, userId?: string, prefix?: string,
): Promise<Set<string>> {
  let q = db.from(TABLE).select('template_id').eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  if (prefix) q = q.like('template_id', `${prefix}%`);
  return new Set((await readRows<{ template_id: string | null }>(q))
    .map(r => r.template_id).filter((t): t is string => !!t));
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

export type ChecklistPatch = { [K in keyof ChecklistItemsRow]?: ChecklistItemsRow[K] | null };

export function add(db: Db, row: ChecklistPatch) {
  return db.from(TABLE).insert(row);
}

export function addReturning(
  db: Db, row: ChecklistPatch, columns = 'id',
): PromiseLike<{ data: { id?: string } | null; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).insert(row).select(columns).single();
}

export function addMany(db: Db, rows: ChecklistPatch[]) {
  return db.from(TABLE).insert(rows);
}

export function addManyReturning(
  db: Db, rows: ChecklistPatch[], columns = 'id,sort_order',
): PromiseLike<{ data: { id: string; sort_order: number }[] | null; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).insert(rows).select(columns);
}

export function update(db: Db, id: string, patch: ChecklistPatch) {
  return db.from(TABLE).update(patch).eq('id', id);
}

export function remove(db: Db, id: string) {
  return db.from(TABLE).delete().eq('id', id);
}

export function removeMany(db: Db, ids: string[]) {
  return db.from(TABLE).delete().in('id', ids);
}

/**
 * Οι τρεις στήλες που λένε «κλειστή», μαζί.
 *
 * ΓΙΑΤΙ ΣΥΝΑΡΤΗΣΗ ΚΑΙ ΟΧΙ ΣΤΑΘΕΡΑ: η ώρα ολοκλήρωσης είναι η ώρα ΤΗΣ ΕΝΕΡΓΕΙΑΣ.
 * Ένα σταθερό αντικείμενο θα κρατούσε την ώρα φόρτωσης της σελίδας.
 */
export const doneFields = () => ({
  status: 'done', completed: true, completed_at: new Date().toISOString(),
});

/** Και οι τρεις πίσω στο ανοιχτό. */
export const reopenFields = () => ({
  status: 'pending', completed: false, completed_at: null,
});

/** Οι στήλες μιας κατάστασης, όποια κι αν είναι. Μία απόφαση, όχι τρεις. */
export const statusFields = (status: string) =>
  (status === 'done' ? doneFields() : { status, completed: false, completed_at: null });

/** Κλείνει μία εργασία, με ό,τι άλλο τη συνοδεύει (κόστος, παραστατικό). */
export function markDone(db: Db, id: string, extra: ChecklistPatch = {}) {
  return db.from(TABLE).update({ ...extra, ...doneFields() }).eq('id', id);
}

/** Κλείνει πολλές μαζί: ένα ερώτημα, ένα σφάλμα να ελεγχθεί. */
export function markDoneMany(db: Db, ids: string[]) {
  return db.from(TABLE).update(doneFields()).in('id', ids);
}

/** Αλλάζει κατάσταση, κρατώντας τις τρεις στήλες συμφωνημένες. */
export function setStatus(db: Db, id: string, status: string) {
  return db.from(TABLE).update(statusFields(status)).eq('id', id);
}

/** Συνδέει ή αποσυνδέει την εργασία με γεγονός ημερολογίου. */
export function linkEvent(db: Db, id: string, eventId: string | null) {
  return db.from(TABLE).update({ calendar_event_id: eventId }).eq('id', id);
}

// ── Βοηθητικά ──────────────────────────────────────────────────────────────

/** Ο κανόνας του «ανοιχτή», γραμμένος μία φορά ως φίλτρο ερωτήματος. */
function onlyOpen<Q extends { neq(column: string, value: string): Q }>(q: Q): Q {
  let out = q;
  for (const s of CLOSED_STATUSES) out = out.neq('status', s);
  return out;
}
