// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΔΑΠΑΝΕΣ ΕΧΟΥΝ ΕΝΑ ΣΠΙΤΙ, ΚΑΙ Η ΟΜΑΔΑ ΔΕΝ ΞΕΧΝΙΕΤΑΙ ΠΟΤΕ ΞΑΝΑ
// ─────────────────────────────────────────────────────────────────────────
// Σαράντα έξι κλήσεις στον πίνακα `expenses` από είκοσι έξι αρχεία. Το
// `lib/expenses/groups.ts` γράφει ρητά τον κανόνα, εδώ και καιρό:
//
//     «Η ΟΜΑΔΑ ΠΑΡΑΓΕΤΑΙ ΑΠΟ ΤΗΝ ΚΑΤΗΓΟΡΙΑ. Όποια οθόνη ξεχνούσε να γράψει
//      ομάδα, παρήγαγε δαπάνη που δεν εξέπιπτε ποτέ, ενώ η ταξινομία έλεγε
//      το αντίθετο.»
//
// Ο κανόνας υπήρχε. Η επιβολή του όχι — κάθε οθόνη τον θυμόταν μόνη της:
//
//   · Η δόση δανείου, η αμοιβή συνεργάτη και η τραπεζική κίνηση γράφονταν
//     ΧΩΡΙΣ ομάδα. Κενή ομάδα σημαίνει «δεν εκπίπτει».
//   · Το ημερολόγιο έγραφε `expense_group: 'general'` — ομάδα που ΔΕΝ υπάρχει
//     στην ταξινομία, παραγμένη από την κατηγορία του ΓΕΓΟΝΟΤΟΣ και όχι της
//     δαπάνης. Ασφάλιστρο καταχωρημένο από το ημερολόγιο έπαυε να εκπίπτει.
//
// Δεν είναι θέμα στυλ: είναι ευρώ που ο ιδιοκτήτης δεν αφαιρεί από το
// φορολογητέο εισόδημά του επειδή η γραμμή γράφτηκε από λάθος οθόνη.
//
// Εδώ η ομάδα ΠΑΡΑΓΕΤΑΙ, πάντα, από την ταξινομία — εκτός αν ο καλών τη δώσει
// ρητά, όπως κάνει το `lib/expenses/pay.ts` που την ξέρει ήδη από τον
// λογαριασμό.
//
// ΚΑΙ ΟΙ ΣΤΗΛΕΣ. Η ίδια λίστα στηλών ήταν γραμμένη με το χέρι σε πέντε οθόνες,
// κάθε φορά με μια στήλη παραπάνω ή λιγότερη — και όποια έλειπε γινόταν
// `undefined` στους υπολογισμούς, σιωπηλά. Μία λίστα, ένα όνομα.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExpensesRow } from '@/lib/supabase/tables';
import type { DbError } from '@/lib/supabase/writeResult';
import { classifyExpense } from '@/lib/expenses/classify';
// ΤΟ `rows` ΠΑΙΡΝΕΙ ΨΕΥΔΩΝΥΜΟ: το αρχείο έχει ήδη δικό του `row()` (χτίζει τη
// γραμμή προς τη βάση) και παραμέτρους με το όνομα `rows` στις εγγραφές.
import { read, rows as readRows } from './read';

const TABLE = 'expenses';

/** Πόσες γραμμές ανά αίτημα, όπως και στο ημερολόγιο. */
export const BATCH = 20;

export type Db = SupabaseClient;

/** Σε ποιον και σε ποιο ακίνητο ανήκει η δαπάνη. */
export interface Scope { propertyId: string; userId: string }

/**
 * ΟΙ ΣΤΗΛΕΣ ΤΟΥ ΚΑΘΟΛΙΚΟΥ, ΓΡΑΜΜΕΝΕΣ ΜΙΑ ΦΟΡΑ. Πέντε οθόνες ζητούσαν σχεδόν
 * την ίδια λίστα: η μία ξεχνούσε το `expense_group`, η άλλη το `is_recurring`,
 * και η στήλη που δεν ζητήθηκε γίνεται `undefined` — όχι σφάλμα, απλώς λάθος
 * νούμερο παρακάτω.
 */
export const LEDGER_COLUMNS = 'id,bill_id,amount,date,description,category,paid,expense_group,is_recurring,store_vendor,supplier_afm';

/**
 * Ο τύπος της γραμμής που γυρίζει το `LEDGER_COLUMNS`, κομμένος από το
 * παραγόμενο σχήμα. Η λίστα και ο τύπος είναι δίπλα δίπλα: αν αλλάξει η μία
 * χωρίς τον άλλο, φαίνεται εδώ και όχι στην οθόνη.
 *
 * ΤΟ `supplier_afm` ΜΠΗΚΕ ΣΤΗ ΛΙΣΤΑ ΓΙΑΤΙ ΚΑΜΙΑ ΟΘΟΝΗ ΔΕΝ ΤΟ ΔΙΑΒΑΖΕ ΠΙΣΩ. Η
 * στήλη υπάρχει από τη μετανάστευση 20260812120000, ο φάκελος του λογιστή
 * μετρά τις δαπάνες χωρίς ΑΦΜ (lib/data/accountant.ts, κενό «no_supplier_afm»)
 * και η εξαγωγή έχει στήλη γι' αυτό — αλλά η μόνη διαδρομή που το ΕΓΡΑΦΕ ήταν
 * η σάρωση παραστατικού (lib/billing/documents.ts). Χωρίς ανάγνωση δεν υπήρχε
 * τρόπος να συμπληρωθεί μετά. Κόστος: μία στήλη κειμένου ανά γραμμή.
 */
export type LedgerRow = Pick<ExpensesRow,
  'id' | 'bill_id' | 'amount' | 'date' | 'description' | 'category' | 'paid' | 'expense_group' | 'is_recurring' | 'store_vendor' | 'supplier_afm'>;

/** Η ίδια γραμμή, όταν τα ακίνητα είναι πολλά και πρέπει να ξεχωρίζουν. */
export type LedgerRowWithProperty = LedgerRow & Pick<ExpensesRow, 'property_id'>;

/** Οι στήλες που φτάνουν στις αναφορές και στα φύλλα Excel. */
export const REPORT_COLUMNS = 'property_id,date,amount,category,description';

export type ExpenseRow = Omit<ExpensesRow, 'id' | 'created_at'>;

/** Ό,τι δίνει ο καλών. Τα υπόλοιπα τα συμπληρώνει το `row()`. */
export interface ExpenseDraft {
  description: string;
  amount: number;
  category: string;
  date: string;
  paid?: boolean;
  paid_by?: string | null;
  notes?: string | null;
  bill_id?: string | null;
  contact_id?: string | null;
  store_vendor?: string | null;
  payment_method?: string | null;
  is_recurring?: boolean | null;
  recurring_frequency?: string | null;
  share_percent?: number | null;
  share_note?: string | null;
  /** Χώρα εκδότη (ISO 3166-1 alpha-2) και ο τόπος παροχής που προκύπτει. */
  supplier_country?: string | null;
  supply?: string | null;
  /** ΑΦΜ εκδότη, εννέα ψηφία. Ό,τι δεν περνά τον έλεγχο δεν γράφεται. */
  supplier_afm?: string | null;
  /**
   * ΜΟΝΟ όταν ο καλών την ξέρει από αλλού — π.χ. ο χάρτης λογαριασμών του
   * `lib/expenses/pay.ts`. Αλλιώς παράγεται από την κατηγορία, που είναι και
   * ο κανόνας.
   */
  expense_group?: string;
}

/** Το αποτέλεσμα που καταλαβαίνουν και η `saved()` και η `must()`. */
export interface Outcome { data: null; error: { message?: string; code?: string } | null }

/**
 * Η ομάδα μιας δαπάνης από την κατηγορία της.
 *
 * Άγνωστη κατηγορία δίνει `'other'`, που δεν εκπίπτει — το λάθος προς τα πάνω
 * κοστίζει στον ιδιοκτήτη πρόστιμο, προς τα κάτω μόνο έναν έλεγχο.
 */
export function groupOf(category: string): string {
  return classifyExpense(category).group;
}

/** Η πλήρης γραμμή, με την ομάδα παραγμένη και τα σταθερά συμπληρωμένα. */
export function row(scope: Scope, d: ExpenseDraft): Partial<ExpenseRow> {
  return {
    property_id: scope.propertyId,
    user_id: scope.userId,
    description: d.description,
    amount: d.amount,
    category: d.category,
    date: d.date,
    expense_group: d.expense_group ?? groupOf(d.category),
    paid: d.paid ?? false,
    paid_by: d.paid_by ?? 'owner',
    notes: d.notes ?? null,
    bill_id: d.bill_id ?? null,
    contact_id: d.contact_id ?? null,
    store_vendor: d.store_vendor ?? null,
    payment_method: d.payment_method ?? null,
    is_recurring: d.is_recurring ?? null,
    recurring_frequency: d.recurring_frequency ?? null,
    share_percent: d.share_percent ?? null,
    share_note: d.share_note ?? null,
    supplier_country: d.supplier_country ?? null,
    supply: d.supply ?? null,
    supplier_afm: d.supplier_afm ?? null,
  } as Partial<ExpenseRow>;
}

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoped(db: Db, columns: string): any {
  return db.from(TABLE).select(columns);
}

export interface LedgerOpts {
  from?: string; to?: string; columns?: string; userId?: string;
  excludeCategory?: string;
  /** Φίλτρο «ή» του PostgREST — η μόνη περίπτωση που το χρειάζεται μια οθόνη:
   *  οι δαπάνες μιας επαφής, από το `contact_id` ή, για τις παλιές, το όνομα. */
  or?: string;
  order?: { column: string; ascending: boolean };
  limit?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ledgerQuery(db: Db, propertyId: string, opts: LedgerOpts): any {
  let q = scoped(db, opts.columns ?? LEDGER_COLUMNS).eq('property_id', propertyId);
  if (opts.userId) q = q.eq('user_id', opts.userId);
  if (opts.from) q = q.gte('date', opts.from);
  if (opts.to) q = q.lte('date', opts.to);
  if (opts.excludeCategory) q = q.neq('category', opts.excludeCategory);
  if (opts.or) q = q.or(opts.or);
  if (opts.order) q = q.order(opts.order.column, { ascending: opts.order.ascending });
  if (opts.limit) q = q.limit(opts.limit);
  return q;
}

/** Το καθολικό ενός ακινήτου, με τις στήλες που χρειάζονται όλες οι οθόνες. */
export async function ledger<T = LedgerRow>(
  db: Db, propertyId: string, opts: LedgerOpts = {},
): Promise<T[]> {
  // ΕΝΑ ΜΟΝΟΠΑΤΙ: η απλή εκδοχή είναι η ίδια ανάγνωση, χωρίς το σφάλμα της.
  return (await ledgerWithError<T>(db, propertyId, opts)).rows;
}

/**
 * ΤΟ ΙΔΙΟ ΚΑΘΟΛΙΚΟ, ΜΕ ΤΟ ΣΦΑΛΜΑ ΟΡΑΤΟ. Για την ΜΙΑ οθόνη όπου η διαφορά
 * κρίνει: τη Λογιστική.
 *
 * Η `ledger` γυρίζει `[]` και όταν δεν υπάρχουν δαπάνες και όταν η ανάγνωση
 * απέτυχε. Στις υπόλοιπες οθόνες τα δύο μοιάζουν αρκετά ώστε να μη χαλά τίποτα:
 * μια άδεια λίστα δαπανών είναι άδεια λίστα δαπανών. Στη Λογιστική όμως το ίδιο
 * κενό γίνεται «μηδέν δαπάνες», δηλαδή μεγαλύτερο φορολογητέο εισόδημα και
 * μεγαλύτερος φόρος — σε οθόνη που παράγει Ε2, βεβαίωση ενοικίου και φάκελο
 * λογιστή, με αριθμό εγγράφου και κωδικό επαλήθευσης.
 *
 * Ενα PDF με μηδενικά που φαίνεται πλήρες είναι χειρότερο από ένα PDF που δεν
 * βγήκε.
 */
export async function ledgerWithError<T = LedgerRow>(
  db: Db, propertyId: string, opts: LedgerOpts = {},
): Promise<{ rows: T[]; error: { message?: string; code?: string } | null }> {
  const { rows, error } = await read<T>(ledgerQuery(db, propertyId, opts));
  // Το ίδιο αντικείμενο σφάλματος περνά ΩΣ ΕΧΕΙ· μόνο ο τύπος `DbError` είναι
  // πλατύτερος (δέχεται `null` στα πεδία), γι' αυτό η στένωση εδώ — η δημόσια
  // υπογραφή της συνάρτησης μένει απαράλλαχτη.
  return { rows, error: error as { message?: string; code?: string } | null };
}

/** Το καθολικό πολλών ακινήτων του ίδιου χρήστη — σύγκριση, χαρτοφυλάκιο. */
export async function ledgerOfProperties<T = LedgerRowWithProperty>(
  db: Db, propertyIds: string[], userId: string, from: string,
  columns = `${LEDGER_COLUMNS},property_id`,
): Promise<T[]> {
  return readRows<T>(scoped(db, columns).in('property_id', propertyIds).eq('user_id', userId).gte('date', from));
}

/** Υπάρχει ήδη ίδια δαπάνη; Ο έλεγχος διπλοεγγραφής της σάρωσης. */
export async function similar(
  db: Db, propertyId: string, category: string, amount: number, date: string, limit = 5,
): Promise<Partial<ExpensesRow>[]> {
  return readRows<Partial<ExpensesRow>>(scoped(db, 'id,description')
    .eq('property_id', propertyId).eq('category', category).eq('amount', amount).eq('date', date).limit(limit));
}

/** Το καθολικό ΟΛΩΝ των ακινήτων ενός χρήστη — για το χαρτοφυλάκιο. */
export async function ledgerOfUser<T = LedgerRowWithProperty>(
  db: Db, userId: string, from: string, columns = `${LEDGER_COLUMNS},property_id`,
): Promise<T[]> {
  return readRows<T>(scoped(db, columns).eq('user_id', userId).gte('date', from));
}

/** Δαπάνες πολλών ακινήτων μέσα σε διάστημα — αναφορές, ημερολόγιο λογιστή. */
export async function inRange(
  db: Db, propertyIds: string[], from: string, to: string, columns = REPORT_COLUMNS,
): Promise<Partial<ExpensesRow>[]> {
  return readRows<Partial<ExpensesRow>>(scoped(db, columns).in('property_id', propertyIds).gte('date', from).lte('date', to));
}

/** Οι δαπάνες ενός ακινήτου μέσα σε διάστημα. */
export async function inRangeOfProperty(
  db: Db, propertyId: string, from: string, to: string, columns = 'amount,date',
): Promise<Partial<ExpensesRow>[]> {
  return readRows<Partial<ExpensesRow>>(scoped(db, columns).eq('property_id', propertyId).gte('date', from).lte('date', to));
}

/** Υπάρχει ήδη δαπάνη δεμένη σε αυτόν τον λογαριασμό; */
export async function existsForBill(db: Db, billId: string): Promise<boolean> {
  const found = await readRows<{ id: string }>(scoped(db, 'id').eq('bill_id', billId).limit(1));
  return found.length > 0;
}

// ── ΓΡΑΨΙΜΟ ────────────────────────────────────────────────────────────────

/** Εισαγωγή σε παρτίδες. Σταματά στο πρώτο σφάλμα και το επιστρέφει. */
export async function insert(db: Db, rows: Partial<ExpenseRow>[]): Promise<Outcome> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from(TABLE).insert(rows.slice(i, i + BATCH));
    if (error) return { data: null, error };
  }
  return { data: null, error: null };
}

/**
 * Εισαγωγή δαπανών που προέρχονται από τραπεζική κίνηση.
 *
 * ΤΟ ΙΔΙΟ ΑΝΤΙΓΡΑΦΟ ΚΙΝΗΣΕΩΝ, ΔΥΟ ΦΟΡΕΣ, ΔΥΟ ΣΥΝΟΛΑ. Η εισαγωγή γράφει σε δύο
 * πίνακες: το `bank_transactions` κάνει upsert πάνω στο αποτύπωμα και δεν
 * διπλογράφει, τα `expenses` γράφονταν με σκέτο insert σε πίνακα χωρίς κανένα
 * μοναδικό κλειδί. Ο χρήστης που ξανακάνει επικόλληση μετά από διακοπείσα
 * εισαγωγή — συνηθέστατο — έπαιρνε διπλάσιες δαπάνες στο Ε2 και δήλωνε στην
 * ΑΑΔΕ έξοδα που δεν έκανε, ενώ το τραπεζικό καθολικό δίπλα του έδειχνε σωστά.
 *
 * Το `ignoreDuplicates` κάνει τη δεύτερη εισαγωγή σιωπηλή, όχι αποτυχημένη:
 * σωστό, γιατί ο χρήστης δεν έκανε λάθος — απλώς επανέλαβε.
 */
export async function insertFromBank(db: Db, rows: Partial<ExpenseRow>[]): Promise<Outcome> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from(TABLE)
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'user_id,dedup_hash', ignoreDuplicates: true });
    if (error) return { data: null, error };
  }
  return { data: null, error: null };
}

/** Εισαγωγή με τα αναγνωριστικά πίσω — για όσους πρέπει να κρατήσουν αναφορά. */
export function insertReturning(
  db: Db, rows: Partial<ExpenseRow>[],
): PromiseLike<{ data: { id: string }[] | null; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).insert(rows).select('id');
}

/** Μία γραμμή έτοιμη από αλλού, με το αναγνωριστικό της πίσω. */
export function addRow(
  db: Db, r: Partial<ExpenseRow>,
): PromiseLike<{ data: { id: string } | null; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).insert(r).select('id').single();
}

/** Σημειώνει πληρωμένες τις δαπάνες ενός λογαριασμού και λέει ποιες ήταν. */
export function markBillPaid(
  db: Db, billId: string,
): PromiseLike<{ data: { id: string }[] | null; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).update({ paid: true }).eq('bill_id', billId).select('id');
}

/** Μία δαπάνη, με το αναγνωριστικό της πίσω. */
export async function add(
  db: Db, scope: Scope, draft: ExpenseDraft,
): Promise<{ data: { id: string } | null; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).insert(row(scope, draft)).select('id').single();
}

/** Ενημέρωση μιας γραμμής. */
export function update(db: Db, id: string, patch: Partial<ExpensesRow>): PromiseLike<{ error: DbError | null }> {
  return db.from(TABLE).update(patch).eq('id', id);
}

/** Ενημέρωση όσων δαπανών κρέμονται από έναν λογαριασμό. */
export function updateByBill(db: Db, billId: string, patch: Partial<ExpensesRow>): PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).update(patch).eq('bill_id', billId);
}

/** Διαγραφή μιας γραμμής ή πολλών, με ένα αίτημα. */
export function remove(db: Db, id: string | string[]): PromiseLike<{ error: DbError | null }> {
  return Array.isArray(id)
    ? db.from(TABLE).delete().in('id', id)
    : db.from(TABLE).delete().eq('id', id);
}

/**
 * Διαγραφή ΜΟΝΟ αν δεν έχει πληρωθεί.
 *
 * Η πληρωμένη δαπάνη έχει παραστατικό πίσω της: το χρήμα ξοδεύτηκε, και δεν
 * παύει να ξοδεύτηκε επειδή σβήστηκε η εργασία που τη γέννησε.
 */
export function removeIfUnpaid(db: Db, id: string): PromiseLike<{ error: DbError | null }> {
  return db.from(TABLE).delete().eq('id', id).eq('paid', false);
}
