// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΜΙΣΘΩΤΕΣ: ΠΟΙΟΣ ΕΙΝΑΙ «Ο ΤΡΕΧΩΝ», ΓΡΑΜΜΕΝΟ ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// Τριάντα κλήσεις στον πίνακα `tenants` από δεκαπέντε αρχεία. Οι μισές ρωτούν
// το ίδιο πράγμα — «ποιος μένει τώρα στο ακίνητο;» — και το ρωτούν με ΤΕΣΣΕΡΙΣ
// διαφορετικούς τρόπους:
//
//     .order('created_at', desc).limit(1)      βεβαίωση ενοικίου, πύλη, Ε2
//     .order('updated_at', desc).limit(1)      Επισκόπηση, βοηθός, συμβόλαιο
//     .neq('status', 'past')                   ημερολόγιο
//     (καμία συνθήκη)                          λογαριασμοί, ασφάλιση, απογραφή
//
// ΔΕΝ ΕΙΝΑΙ ΘΕΩΡΗΤΙΚΟ. Ο ιδιοκτήτης που άλλαξε μισθωτή έχει δύο γραμμές. Η
// «τελευταία δημιουργημένη» και η «τελευταία ενημερωμένη» δεν είναι ο ίδιος
// άνθρωπος: αν διορθώσεις το ΑΦΜ του παλιού μισθωτή, εκείνος γίνεται ο πιο
// πρόσφατα ενημερωμένος. Και καμία από τις δύο δεν κοιτάζει καν αν έχει φύγει.
// Αποτέλεσμα: η βεβαίωση ενοικίου έβγαινε στο όνομα άλλου ανθρώπου από αυτόν
// που δείχνει η Επισκόπηση, για το ίδιο ακίνητο, την ίδια στιγμή.
//
// Ο ΚΑΝΟΝΑΣ ΥΠΗΡΧΕ ΗΔΗ, σε μία γραμμή μέσα στην καρτέλα Μισθωτές:
//
//     const isPastTenant = t => t.status === 'past' || !!t.move_out_date
//
// Δεν τον έβλεπε κανένα από τα υπόλοιπα δεκατέσσερα αρχεία. Εδώ γίνεται η μία
// πηγή, και το «τρέχων» παύει να είναι θέμα γνώμης.
//
// ΚΑΙ ΤΟ `user_id`: δέκα από τις τριάντα αναγνώσεις ζητούσαν μισθωτές με σκέτο
// `property_id`, στηριγμένες αποκλειστικά στην RLS. Όπου ο καλών ξέρει τον
// χρήστη, το στρώμα προσθέτει το φίλτρο — δεύτερη κλειδαριά, όχι διακοσμητικό.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantsRow } from '@/lib/supabase/tables';

const TABLE = 'tenants';

export type Db = SupabaseClient;
export type TenantRow = TenantsRow;

export interface Outcome { data: null; error: { message?: string; code?: string } | null }

/** Το ελάχιστο που χρειάζεται μια οθόνη για να πει ποιος μένει εδώ. */
export const NAME_COLUMNS = 'id,full_name';

/** Οι στήλες που κρίνουν αν ο μισθωτής έχει φύγει. Ζητούνται ΠΑΝΤΑ μαζί. */
const STATUS_COLUMNS = 'status,move_out_date';

/** Το σχήμα που κρίνει το «έφυγε». Δύο στήλες, καμία παραπάνω. */
export interface TenantStatus {
  status?: string | null;
  move_out_date?: string | null;
}

/**
 * Έφυγε;
 *
 * ΔΥΟ ΣΤΗΛΕΣ, ΟΧΙ ΜΙΑ. Η κατάσταση γράφεται `past` όταν ο χρήστης πατά «Αποχώρηση»,
 * αλλά η ημερομηνία αποχώρησης μπορεί να μπει και μόνη της — από τη σάρωση
 * συμβολαίου, από την εισαγωγή δεδομένων, από διόρθωση. Ένα φίλτρο που κοιτάζει
 * μόνο το `status` αφήνει μέσα ανθρώπους που έχουν ήδη φύγει.
 */
export const hasLeft = (t: TenantStatus): boolean =>
  t.status === 'past' || !!t.move_out_date;

/**
 * Ποιος μένει τώρα: όσοι δεν έχουν φύγει, νεότερη μίσθωση πρώτη.
 *
 * Η ΣΕΙΡΑ ΕΙΝΑΙ Η ΕΝΑΡΞΗ ΤΗΣ ΜΙΣΘΩΣΗΣ, όχι η ώρα που γράφτηκε η γραμμή. Το
 * `created_at` λέει πότε ο ιδιοκτήτης πληκτρολόγησε, το `updated_at` πότε
 * διόρθωσε κάτι — κανένα από τα δύο δεν είναι πληροφορία για το ποιος μένει στο
 * σπίτι. Όταν λείπει η ημερομηνία έναρξης, πέφτουμε πίσω στη δημιουργία, ώστε
 * ημιτελής καταχώρηση να μη βγει μπροστά από πλήρη.
 */
export function sortCurrentFirst<T extends TenantStatus & { lease_start?: string | null; created_at?: string | null }>(rows: T[]): T[] {
  return [...rows]
    .filter(t => !hasLeft(t))
    .sort((a, b) => String(b.lease_start || b.created_at || '').localeCompare(String(a.lease_start || a.created_at || '')));
}

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/**
 * Ο τρέχων μισθωτής ενός ακινήτου, ή `null` αν το ακίνητο είναι κενό.
 *
 * Η ΕΠΙΛΟΓΗ ΓΙΝΕΤΑΙ ΕΔΩ, ΟΧΙ ΣΤΗ ΒΑΣΗ. Ένα `.neq('status','past').limit(1)` δεν
 * μπορεί να εκφράσει τον κανόνα των δύο στηλών ούτε την εφεδρική ταξινόμηση, και
 * κάθε οθόνη που θα προσπαθούσε θα τον έγραφε λίγο αλλιώς. Οι μισθωτές ενός
 * ακινήτου είναι λίγοι· η ταξινόμηση σε μνήμη κοστίζει μηδέν και λέει την αλήθεια.
 *
 * Οι στήλες κατάστασης προστίθενται πάντα στο αίτημα, ακόμη κι αν ο καλών δεν τις
 * ζήτησε — χωρίς αυτές η ερώτηση δεν απαντιέται.
 */
export async function current<T = Partial<TenantsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
): Promise<T | null> {
  const rows = await currentAll<T>(db, propertyId, columns, userId);
  return rows[0] ?? null;
}

/** Όλοι όσοι μένουν τώρα (συγκατοίκηση), νεότερη μίσθωση πρώτη. */
export async function currentAll<T = Partial<TenantsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
): Promise<T[]> {
  const rows = await ofProperty<T>(db, propertyId, withStatus(columns), userId);
  return sortCurrentFirst(rows as (T & TenantStatus & { lease_start?: string | null; created_at?: string | null })[]) as T[];
}

/** Κάθε μισθωτής του ακινήτου, παρελθόντες μαζί, νεότερη καταχώρηση πρώτη. */
export async function ofProperty<T = Partial<TenantsRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', propertyId);
  if (userId) q = q.eq('user_id', userId);
  const { data } = await q.order('created_at', { ascending: false });
  return (data || []) as T[];
}

/** Οι μισθωτές όλου του χαρτοφυλακίου ενός χρήστη. */
export async function ofUser<T = Partial<TenantsRow>>(
  db: Db, userId: string, columns: string,
): Promise<T[]> {
  const { data } = await db.from(TABLE).select(columns).eq('user_id', userId)
    .order('created_at', { ascending: false });
  return (data || []) as T[];
}

/**
 * Ο τρέχων μισθωτής ΑΝΑ ΑΚΙΝΗΤΟ, σε έναν χάρτη.
 *
 * Το χαρτοφυλάκιο ρωτούσε το ίδιο πράγμα με ένα ερώτημα και μετά κρατούσε την
 * πρώτη γραμμή κάθε ακινήτου — δηλαδή εφάρμοζε τον τέταρτο ορισμό, τον σιωπηλό.
 */
export async function currentByProperty<T extends TenantStatus & { property_id?: string | null }>(
  db: Db, userId: string, columns: string,
): Promise<Map<string, T>> {
  const rows = await ofUser<T>(db, userId, withStatus(columns.includes('property_id') ? columns : `property_id,${columns}`));
  const byProperty = new Map<string, T[]>();
  for (const r of rows) {
    const pid = String(r.property_id || '');
    if (!pid) continue;
    const arr = byProperty.get(pid);
    if (arr) arr.push(r); else byProperty.set(pid, [r]);
  }
  const out = new Map<string, T>();
  for (const [pid, list] of byProperty) {
    const first = sortCurrentFirst(list as (T & { lease_start?: string | null; created_at?: string | null })[])[0];
    if (first) out.set(pid, first as T);
  }
  return out;
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

/**
 * Ό,τι γράφεται σε μισθωτή.
 *
 * Όπως και στα ακίνητα, ΔΕΝ είναι `Partial<TenantsRow>`: το «καθάρισε αυτό το
 * πεδίο» γράφεται με ρητό `null`, και το `Partial` το απέρριπτε.
 */
export type TenantPatch = { [K in keyof TenantsRow]?: TenantsRow[K] | null };

/** Νέος μισθωτής. Το ακίνητο και ο χρήστης μπαίνουν εδώ, όχι στον καλούντα. */
export function add(db: Db, propertyId: string, userId: string, patch: TenantPatch) {
  return db.from(TABLE).insert({ ...patch, property_id: propertyId, user_id: userId });
}

/** Νέος μισθωτής, με τη γραμμή πίσω. */
export function addReturning(db: Db, propertyId: string, userId: string, patch: TenantPatch, columns = '*') {
  return db.from(TABLE).insert({ ...patch, property_id: propertyId, user_id: userId }).select(columns).single();
}

export function update(db: Db, id: string, patch: TenantPatch) {
  return db.from(TABLE).update(patch).eq('id', id);
}

export function updateReturning(db: Db, id: string, patch: TenantPatch, columns = '*') {
  return db.from(TABLE).update(patch).eq('id', id).select(columns).single();
}

export function remove(db: Db, id: string) {
  return db.from(TABLE).delete().eq('id', id);
}

/**
 * Αποχώρηση.
 *
 * ΓΡΑΦΕΙ ΚΑΙ ΤΙΣ ΔΥΟ ΣΤΗΛΕΣ, γιατί και οι δύο κρίνουν το «έφυγε». Όποιος έγραφε
 * μόνο το `status` άφηνε ακίνητο που φαινόταν κενό αλλού και κατοικημένο εδώ.
 */
export function markPast(db: Db, id: string, moveOutDate: string) {
  return db.from(TABLE).update({ status: 'past', move_out_date: moveOutDate }).eq('id', id);
}

// ── Βοηθητικά ──────────────────────────────────────────────────────────────

/** Οι στήλες του καλούντος συν εκείνες που κρίνουν το «έφυγε», χωρίς διπλά. */
function withStatus(columns: string): string {
  if (columns === '*') return columns;
  const asked = new Set(columns.split(',').map(c => c.trim()).filter(Boolean));
  for (const c of STATUS_COLUMNS.split(',')) asked.add(c);
  asked.add('lease_start');
  asked.add('created_at');
  return [...asked].join(',');
}
