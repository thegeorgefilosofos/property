// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΔΟΣΕΙΣ ΕΝΟΙΚΙΟΥ: ΑΠΟ ΕΔΩ ΒΓΑΙΝΕΙ ΤΟ Ε2
// ─────────────────────────────────────────────────────────────────────────
// Είκοσι δύο κλήσεις στον πίνακα `rent_payments` από έντεκα αρχεία. Είναι ο
// πίνακας που τροφοδοτεί τη φορολογική δήλωση, τη βεβαίωση ενοικίου, την
// ταμειακή θέση και το «μου χρωστάνε» της Επισκόπησης — δηλαδή ο πίνακας όπου
// μια ασυνέπεια δεν είναι οπτική, είναι λάθος στη δήλωση.
//
// ── ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΠΟΥ ΕΠΑΝΑΛΑΜΒΑΝΟΝΤΑΝ ───────────────────────────────────
//
// 1. Η ΕΙΣΠΡΑΞΗ ΓΡΑΦΕΙ ΤΕΣΣΕΡΙΣ ΣΤΗΛΕΣ, και η ακύρωσή της πρέπει να τις
//    καθαρίσει όλες. Γραμμένο τέσσερις φορές, με διαφορετικό υποσύνολο κάθε
//    φορά: μία ξεχνούσε τη μέθοδο, μία τις ημέρες καθυστέρησης.
//
// 2. ΟΙ ΗΜΕΡΕΣ ΚΑΘΥΣΤΕΡΗΣΗΣ υπολογίζονταν στο σημείο της κλήσης, με τον ίδιο
//    τύπο γραμμένο δύο φορές. Είναι κανόνας της εφαρμογής, όχι λεπτομέρεια
//    οθόνης: μπαίνει σε PDF και σε αναφορά προς λογιστή.
//
// 3. ΤΟ ΚΛΕΙΔΙ ΣΥΓΚΡΟΥΣΗΣ «tenant_id,period_year,period_month» ήταν γραμμένο ως
//    κείμενο σε δύο σημεία. Ένα τυπογραφικό εκεί δεν βγάζει σφάλμα — βγάζει
//    ΔΕΥΤΕΡΗ γραμμή για τον ίδιο μήνα, και διπλό έσοδο στη δήλωση.
//
// ── ΚΑΙ ΤΟ `user_id` ─────────────────────────────────────────────────────
// Πέντε αναγνώσεις ζητούσαν δόσεις με σκέτο `property_id`, στηριγμένες
// αποκλειστικά στην RLS: η κατανομή ιδιοκτησίας, η αναπροσαρμογή ενοικίου, οι
// δύο αναφορές και η Λογιστική. Όπου ο καλών ξέρει τον χρήστη, μπαίνει.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RentPaymentsRow } from '@/lib/supabase/tables';
// ΤΑ `rows`/`row` ΠΑΙΡΝΟΥΝ ΨΕΥΔΩΝΥΜΟ: το αρχείο έχει ήδη παραμέτρους με αυτά τα
// ονόματα (`collectedIn(rows, …)`, `upsertPeriod(db, row, …)`).
import { read, rows as readRows, row as readRow, type ReadResult, type ReadOneResult } from './read';

const TABLE = 'rent_payments';

export type Db = SupabaseClient;
export type RentRow = RentPaymentsRow;

/** Ό,τι χρειάζεται μια περίοδος για να τοποθετηθεί και να αθροιστεί. */
export const PERIOD_COLUMNS = 'period_year,period_month,amount,paid';

/** Το ίδιο, με τις ημερομηνίες που κρίνουν καθυστέρηση και ταμειακή θέση. */
export const LEDGER_COLUMNS = 'period_year,period_month,amount,paid,paid_date,due_date';

/**
 * Το κλειδί μοναδικότητας μιας δόσης.
 *
 * ΜΙΑ ΔΟΣΗ ΑΝΑ ΜΙΣΘΩΤΗ ΑΝΑ ΜΗΝΑ. Ήταν γραμμένο ως κείμενο σε δύο σημεία· ένα
 * τυπογραφικό δεν βγάζει σφάλμα, βγάζει δεύτερη γραμμή για τον ίδιο μήνα.
 */
export const PERIOD_KEY = 'tenant_id,period_year,period_month';

export interface Outcome { data: null; error: { message?: string; code?: string } | null }

/**
 * Πόσο άργησε.
 *
 * Μηδέν όταν πληρώθηκε εγκαίρως, όταν λείπει προθεσμία, ή όταν λείπει η
 * ημερομηνία πληρωμής: το «δεν ξέρω» δεν είναι καθυστέρηση. Ο αριθμός μπαίνει σε
 * PDF και σε αναφορά προς λογιστή, άρα ένας ορισμός και μόνο ένας.
 */
export function daysLate(dueDate: string | null | undefined, paidDate: string | null | undefined): number {
  if (!dueDate || !paidDate || paidDate <= dueDate) return 0;
  return Math.ceil((new Date(paidDate).getTime() - new Date(dueDate).getTime()) / 86400000);
}

/** Η προθεσμία μιας περιόδου. Η ημέρα κλείνεται στο 1-28: ο Φεβρουάριος υπάρχει. */
export function dueDateOf(year: number, month: number, rentDueDay: number): string {
  const day = Math.min(Math.max(1, rentDueDay), 28);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── ΠΟΤΕ ΜΠΑΙΝΕΙ ΜΙΑ ΔΟΣΗ ΣΤΟ ΒΙΒΛΙΟ ───────────────────────────────────────
//
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΔΙΟΡΘΩΝΕΙ. Τρία σημεία έφτιαχναν βιβλίο από τις ίδιες δόσεις,
// με ΔΥΟ διαφορετικούς κανόνες:
//
//   Οι «Αναλυτικές κινήσεις» και το φύλλο των λογαριασμών ΕΛΠ κρατούσαν ό,τι
//   ΕΙΣΠΡΑΧΘΗΚΕ μέσα στη χρήση, δηλαδή κατά ημερομηνία πληρωμής.
//   Το ημερολόγιο και το ισοζύγιο κρατούσαν ό,τι ΑΦΟΡΟΥΣΕ τη χρήση (period_year)
//   — και μετά έγραφαν πάνω του την ημερομηνία πληρωμής.
//
// Το ενοίκιο Δεκεμβρίου 2026 που πληρώθηκε στις 8 Ιανουαρίου 2027 έμπαινε στο
// ισοζύγιο του 2026 με ημερομηνία 08/01/2027 — άρθρο εκτός χρήσης μέσα στο
// βιβλίο της χρήσης — και ταυτόχρονα ΕΛΕΙΠΕ από τις κινήσεις της ίδιας χρήσης.
// Στο ίδιο αρχείο Excel, δύο φύλλα διαφωνούσαν κατά ένα μίσθωμα.
//
// Ο ΚΑΝΟΝΑΣ. Το βιβλίο είναι ΤΑΜΕΙΑΚΟ: μια δόση ανήκει στη χρήση που
// εισπράχθηκε, και φέρει την ημερομηνία είσπραξης. Ένας ορισμός, εδώ.
//
// ΤΟ ΔΕΔΟΥΛΕΥΜΕΝΟ ΔΕΝ ΧΑΝΕΤΑΙ. Ο φόρος υπολογίζεται σε ό,τι ΟΦΕΙΛΕΤΑΙ,
// ανεξάρτητα είσπραξης, και αυτό μετριέται χωριστά με το `period_year` — μαζί
// με τα ανείσπρακτα, που έχουν δική τους γραμμή στη δήλωση.

export interface BookableRent {
  paid?: boolean | null;
  amount?: number | null;
  paid_date?: string | null;
  due_date?: string | null;
  period_year?: number | null;
  period_month?: number | null;
}

/** Η ημερομηνία με την οποία μια δόση μπαίνει στο ταμειακό βιβλίο. */
export function bookDate(p: BookableRent): string {
  return p.paid_date || p.due_date
    || `${p.period_year}-${String(p.period_month ?? 1).padStart(2, '0')}-01`;
}

/**
 * Οι δόσεις που ανήκουν ταμειακά στη χρήση (και προαιρετικά στον μήνα).
 * Ο μήνας είναι 1-12· το 0 σημαίνει «όλη η χρήση».
 */
export function collectedIn<T extends BookableRent>(rows: readonly T[], year: number, month = 0): T[] {
  const prefix = month > 0 ? `${year}-${String(month).padStart(2, '0')}` : String(year);
  return rows.filter(p => p.paid && (p.amount || 0) > 0 && bookDate(p).startsWith(prefix));
}

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

function ofPropertyQuery(db: Db, propertyId: string, columns: string, userId?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: { year?: number; paid?: boolean } = {}): any {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  if (opts.year !== undefined) q = q.eq('period_year', opts.year);
  if (opts.paid !== undefined) q = q.eq('paid', opts.paid);
  return newestFirst(q);
}

/** Οι δόσεις ενός ακινήτου, νεότερη περίοδος πρώτη. */
export async function ofProperty<T = Partial<RentPaymentsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
  opts: { year?: number; paid?: boolean } = {},
): Promise<T[]> {
  // ΕΝΑ ΜΟΝΟΠΑΤΙ: η απλή εκδοχή είναι η ίδια ανάγνωση, χωρίς το σφάλμα της.
  return (await ofPropertyWithError<T>(db, propertyId, columns, userId, opts)).rows;
}

/**
 * Οι ίδιες δόσεις, με το σφάλμα ορατό. Το χρειάζεται η Λογιστική: εκεί μια
 * αποτυχημένη ανάγνωση δεν δίνει «καμία είσπραξη», δίνει μηδενικό εισόδημα σε
 * Ε2 και σε βεβαίωση ενοικίου.
 */
export async function ofPropertyWithError<T = Partial<RentPaymentsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
  opts: { year?: number; paid?: boolean } = {},
): Promise<ReadResult<T>> {
  return read<T>(ofPropertyQuery(db, propertyId, columns, userId, opts));
}

/** Οι δόσεις ενός ακινήτου με την ΠΑΛΑΙΟΤΕΡΗ πρώτη: χρονοσειρά, όχι λίστα. */
export async function chronological<T = Partial<RentPaymentsRow>>(
  db: Db, propertyId: string, columns: string, userId: string,
): Promise<T[]> {
  return readRows<T>(db.from(TABLE).select(columns)
    .eq('property_id', propertyId).eq('user_id', userId)
    .order('period_year').order('period_month'));
}

/** Οι δόσεις πολλών ακινήτων μαζί: αναφορές, ημερολόγιο λογιστή, Ε2. */
export async function ofProperties<T = Partial<RentPaymentsRow>>(
  db: Db, propertyIds: string[], columns: string, userId: string,
  opts: { year?: number; month?: number; paid?: boolean } = {},
): Promise<T[]> {
  if (!propertyIds.length) return [];
  let q = db.from(TABLE).select(columns).in('property_id', propertyIds).eq('user_id', userId);
  if (opts.year !== undefined) q = q.eq('period_year', opts.year);
  if (opts.month !== undefined && opts.month > 0) q = q.eq('period_month', opts.month);
  if (opts.paid !== undefined) q = q.eq('paid', opts.paid);
  return readRows<T>(q);
}

/** Οι δόσεις όλου του χαρτοφυλακίου ενός χρήστη. */
export async function ofUser<T = Partial<RentPaymentsRow>>(
  db: Db, userId: string, columns: string,
  // Το `dueFrom`/`dueTo` το ζητά η συνδρομή ημερολογίου, που κοιτάζει παράθυρο
  // και όχι χρονιά: μια δόση του Δεκεμβρίου λήγει μέσα στο επόμενο έτος.
  opts: { year?: number; unpaid?: boolean; dueFrom?: string; dueTo?: string } = {},
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('user_id', userId);
  if (opts.year !== undefined) q = q.eq('period_year', opts.year);
  // ΤΟ «ΑΠΛΗΡΩΤΟ» ΔΕΝ ΕΙΝΑΙ `paid = false`. Η στήλη μπήκε ΧΩΡΙΣ προεπιλογή
  // (20260724092000): γραμμή γραμμένη χωρίς ρητό `paid` μένει NULL, και το
  // `eq('paid', false)` ΔΕΝ την πιάνει. Μια ανείσπρακτη δόση θα έλειπε σιωπηλά
  // από κάθε ερώτημα που ρωτά «τι μου χρωστάνε».
  if (opts.unpaid) q = q.not('paid', 'is', true);
  if (opts.dueFrom) q = q.gte('due_date', opts.dueFrom);
  if (opts.dueTo) q = q.lte('due_date', opts.dueTo);
  return readRows<T>(q);
}

/**
 * Οι ίδιες δόσεις ΟΛΟΥ του χαρτοφυλακίου, με το σφάλμα ορατό. Από αυτές
 * βγαίνει η ενοποίηση του Ε1: μια αποτυχία εδώ δεν δίνει «ένα ακίνητο», δίνει
 * λάθος μερίδιο φόρου στα υπόλοιπα.
 */
export async function ofUserWithError<T = Partial<RentPaymentsRow>>(
  db: Db, userId: string, columns: string, opts: { year?: number } = {},
): Promise<ReadResult<T>> {
  let q = db.from(TABLE).select(columns).eq('user_id', userId);
  if (opts.year !== undefined) q = q.eq('period_year', opts.year);
  return read<T>(q);
}

/** Το ποσό της τελευταίας καταχωρημένης δόσης. Για την αναπροσαρμογή ενοικίου. */
export async function latestAmount(db: Db, propertyId: string, userId: string): Promise<number | null> {
  const found = await readRow<{ amount?: number | null }>(newestFirst(
    db.from(TABLE).select('amount').eq('property_id', propertyId).eq('user_id', userId),
  ).limit(1).maybeSingle());
  const amount = found?.amount;
  return amount == null ? null : Number(amount);
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

export type RentPatch = { [K in keyof RentPaymentsRow]?: RentPaymentsRow[K] | null };

/**
 * Οι στήλες που λένε «εισπράχθηκε», μαζί.
 *
 * ΤΕΣΣΕΡΙΣ, ΟΧΙ ΜΙΑ. Η ημερομηνία γεννά τις ημέρες καθυστέρησης, η μέθοδος
 * μπαίνει στη βεβαίωση, και η σημαία κρίνει αν το ποσό μετράει ως έσοδο. Όποιος
 * έγραφε μόνο τη σημαία άφηνε δόση «πληρωμένη» χωρίς ημερομηνία — και μηδέν
 * ημέρες καθυστέρησης σε πληρωμή που άργησε τρεις μήνες.
 */
export function paidFields(dueDate: string | null | undefined, paidDate: string, method: string | null) {
  return { paid: true, paid_date: paidDate, method, days_late: daysLate(dueDate, paidDate) };
}

/** Και οι τέσσερις πίσω στο απλήρωτο. Καμία δεν επιβιώνει της ακύρωσης. */
export const unpaidFields = () => ({ paid: false, paid_date: null, method: null, days_late: null });

/** Είσπραξη, με ό,τι τη συνοδεύει (παραστατικό, έγγραφο). */
export function markPaid(
  db: Db, id: string, dueDate: string | null | undefined, paidDate: string,
  method: string | null, extra: RentPatch = {},
) {
  return db.from(TABLE).update({ ...extra, ...paidFields(dueDate, paidDate, method) }).eq('id', id);
}

/** Ακύρωση είσπραξης. */
export function markUnpaid(db: Db, id: string) {
  return db.from(TABLE).update(unpaidFields()).eq('id', id);
}

export function update(db: Db, id: string, patch: RentPatch) {
  return db.from(TABLE).update(patch).eq('id', id);
}

export function updateMany(db: Db, ids: string[], patch: RentPatch) {
  return db.from(TABLE).update(patch).in('id', ids);
}

/** Δημιουργία ή ενημέρωση της δόσης ενός μήνα. Το κλειδί έρχεται από εδώ. */
export function upsertPeriod(db: Db, row: RentPatch, opts: { ignoreDuplicates?: boolean } = {}) {
  return db.from(TABLE).upsert(row, { onConflict: PERIOD_KEY, ...opts });
}

/** Πολλές περίοδοι μαζί, για τη γέννηση του προγράμματος μιας μίσθωσης. */
export function upsertPeriods(db: Db, rows: RentPatch[], opts: { ignoreDuplicates?: boolean } = {}) {
  return db.from(TABLE).upsert(rows, { onConflict: PERIOD_KEY, ...opts });
}

export function remove(db: Db, id: string) {
  return db.from(TABLE).delete().eq('id', id);
}

/** Όλες οι δόσεις ενός μισθωτή. Καλείται μόνο κατά τη διαγραφή του. */
export function removeOfTenant(db: Db, tenantId: string) {
  return db.from(TABLE).delete().eq('tenant_id', tenantId);
}

// ── Βοηθητικά ──────────────────────────────────────────────────────────────

/** Νεότερη περίοδος πρώτη. Δύο στήλες, πάντα με την ίδια σειρά. */
function newestFirst<Q extends { order(column: string, opts: { ascending: boolean }): Q }>(q: Q): Q {
  return q.order('period_year', { ascending: false }).order('period_month', { ascending: false });
}
