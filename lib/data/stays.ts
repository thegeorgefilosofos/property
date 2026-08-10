// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΔΙΑΜΟΝΕΣ: ΤΕΣΣΕΡΙΣ ΣΤΗΛΕΣ ΠΟΥ ΚΡΙΝΟΥΝ ΤΟ ΔΗΛΩΤΕΟ ΕΣΟΔΟ
// ─────────────────────────────────────────────────────────────────────────
// Δεκαεννέα κλήσεις στον πίνακα `client_stays` από δώδεκα αρχεία. Από εδώ βγαίνει
// το έσοδο της βραχυχρόνιας μίσθωσης — δηλαδή η μισή φορολογική δήλωση όσων
// νοικιάζουν σε πλατφόρμες.
//
// ── ΤΟ ΣΙΩΠΗΛΟ ΛΑΘΟΣ ──────────────────────────────────────────────────────
// Το δηλωτέο ποσό ΔΕΝ είναι το `total`. Η πλατφόρμα κρατά προμήθεια και εισπράττει
// τέλος ανθεκτικότητας: το δηλωτέο ακαθάριστο βγαίνει από την ανάλυση
// (`gross_guest_paid`, `platform_fee`, `climate_levy`, `amount_basis`), και η
// `declarableGrossOrTotal` υποχωρεί στο ωμό `total` ΜΟΝΟ όταν η ανάλυση λείπει.
//
// Άρα ένα ερώτημα που ξεχνά αυτές τις τέσσερις στήλες δεν βγάζει σφάλμα: βγάζει
// σιωπηλά το PAYOUT αντί για το ακαθάριστο, δηλαδή ΛΙΓΟΤΕΡΟ δηλωμένο εισόδημα σε
// κάθε γραμμή. Η ίδια λίστα στηλών ήταν γραμμένη τέσσερις φορές, με τέσσερις
// διαφορετικές σειρές, και σε δύο ακόμη σημεία έλειπε ολόκληρη.
//
// ── ΤΟ `property_id` ΕΔΩ ΕΙΝΑΙ ΚΕΙΜΕΝΟ ───────────────────────────────────
// Ο πίνακας κρατά το ακίνητο ως `text`, ενώ όλοι οι άλλοι ως `uuid`. Κάθε
// καλών έπρεπε να θυμηθεί το cast· εδώ γίνεται μία φορά.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientStaysRow } from '@/lib/supabase/tables';

const TABLE = 'client_stays';

export type Db = SupabaseClient;
export type StayRow = ClientStaysRow;

/**
 * Οι στήλες που χρειάζεται ο υπολογισμός δηλωτέου εσόδου.
 *
 * ΟΙ ΤΕΣΣΕΡΙΣ ΤΕΛΕΥΤΑΙΕΣ ΕΙΝΑΙ ΥΠΟΧΡΕΩΤΙΚΕΣ. Χωρίς αυτές, η
 * `declarableGrossOrTotal` υποχωρεί στο ωμό `total` — δηλαδή στο payout — και το
 * δηλωμένο εισόδημα βγαίνει μικρότερο από το πραγματικό, χωρίς κανένα σφάλμα.
 */
export const DECLARABLE_COLUMNS =
  'check_in,check_out,nights,nightly_rate,total,channel,gross_guest_paid,platform_fee,climate_levy,amount_basis';

/** Το ίδιο, με το ακίνητο: για χαρτοφυλάκιο, αναφορές και Ε2. */
export const PORTFOLIO_COLUMNS = `property_id,${DECLARABLE_COLUMNS}`;

/** Το ίδιο, με τη σήμανση δήλωσης στο myAADE. */
export const ACCOUNTING_COLUMNS = `${DECLARABLE_COLUMNS},declared_at`;

export type StayPatch = { [K in keyof ClientStaysRow]?: ClientStaysRow[K] | null };

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/**
 * Οι διαμονές ενός ακινήτου.
 *
 * Το `from`/`to` κόβουν στην ΑΦΙΞΗ: μια διαμονή ανήκει στο έτος που ξεκίνησε,
 * όπως τη μετρά και ο υπολογισμός φόρου.
 */
export async function ofProperty<T = Partial<ClientStaysRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
  opts: { from?: string; to?: string } = {},
): Promise<T[]> {
  let q = db.from(TABLE).select(columns).eq('property_id', String(propertyId));
  if (userId) q = q.eq('user_id', userId);
  if (opts.from) q = q.gte('check_in', opts.from);
  if (opts.to) q = q.lte('check_in', opts.to);
  const { data } = await q;
  return (data || []) as T[];
}

/** Οι διαμονές πολλών ακινήτων μαζί. Το κείμενο του κλειδιού γίνεται εδώ. */
export async function ofProperties<T = Partial<ClientStaysRow>>(
  db: Db, propertyIds: string[], columns: string, userId: string,
): Promise<T[]> {
  if (!propertyIds.length) return [];
  const { data } = await db.from(TABLE).select(columns)
    .in('property_id', propertyIds.map(String)).eq('user_id', userId);
  return (data || []) as T[];
}

/** Οι διαμονές όλου του χαρτοφυλακίου. */
export async function ofUser<T = Partial<ClientStaysRow>>(
  db: Db, userId: string, columns: string,
): Promise<T[]> {
  const { data } = await db.from(TABLE).select(columns).eq('user_id', userId);
  return (data || []) as T[];
}

/**
 * Οι διαμονές ενός ακινήτου με το όνομα του πελάτη, νεότερη άφιξη πρώτη.
 *
 * Το ημερολόγιο και η πληρότητα χρειάζονται όνομα· η ένωση με τους πελάτες
 * γράφεται μία φορά εδώ αντί για δύο στις οθόνες.
 */
export async function withClientName<T = Partial<ClientStaysRow>>(
  db: Db, propertyId: string, columns: string, userId?: string,
): Promise<T[]> {
  let q = db.from(TABLE).select(`${columns},clients(full_name)`).eq('property_id', String(propertyId));
  if (userId) q = q.eq('user_id', userId);
  const { data } = await q.order('check_in', { ascending: false });
  return (data || []) as T[];
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

export function add(db: Db, rows: StayPatch[]) {
  return db.from(TABLE).insert(rows);
}

/**
 * Πολλές διαμονές σε παρτίδες.
 *
 * Η εισαγωγή από φύλλο πλατφόρμας φέρνει εκατοντάδες γραμμές· ένα `insert` με
 * χίλιες γραμμές χτυπά στο όριο αιτήματος και αποτυγχάνει ΟΛΟ. Η παρτίδα των 50
 * ήταν γραμμένη στην οθόνη· εδώ είναι κανόνας του πίνακα.
 */
export async function addBatched(db: Db, rows: StayPatch[], batch = 50) {
  for (let i = 0; i < rows.length; i += batch) {
    const { error } = await db.from(TABLE).insert(rows.slice(i, i + batch));
    if (error) return { data: null, error };
  }
  return { data: null, error: null };
}

export function update(db: Db, id: string, patch: StayPatch) {
  return db.from(TABLE).update(patch).eq('id', id);
}

export function remove(db: Db, id: string) {
  return db.from(TABLE).delete().eq('id', id);
}
