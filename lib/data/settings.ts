// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΡΥΘΜΙΣΕΙΣ ΤΟΥ ΑΚΙΝΗΤΟΥ: ΟΚΤΩ ΕΝΟΤΗΤΕΣ, ΔΕΚΑΕΝΝΕΑ ΔΡΟΜΟΙ ΠΡΟΣ ΤΑ ΕΚΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Ο πίνακας `bills_settings` δεν είναι πίνακας λογαριασμών: είναι ένα κλειδί
// ανά (ακίνητο, ενότητα) με ένα `jsonb` από κάτω. Ρεύμα, αέριο, πάροχοι,
// ασφάλεια, υπηρεσίες, κοινόχρηστα, προϋπολογισμοί, προτιμήσεις εφαρμογής.
//
// ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΗΤΑΝ ΓΡΑΜΜΕΝΑ ΔΕΚΑΕΝΝΕΑ ΦΟΡΕΣ, ΚΑΙ ΤΑ ΤΡΙΑ ΛΑΘΟΣ ΚΑΠΟΥ:
//
// 1. ΚΑΜΙΑ ΑΝΑΓΝΩΣΗ ΔΕΝ ΦΙΛΤΡΑΡΕ ΤΟΝ ΧΡΗΣΤΗ. Και οι δεκατρείς ζητούσαν
//    `property_id` + `section` και τίποτε άλλο. Η πολιτική RLS κρατάει, αλλά
//    είναι η ΜΟΝΗ κλειδαριά: αν αύριο μια πολιτική γραφτεί λάθος, ή αν η ίδια
//    ανάγνωση τρέξει με πελάτη υπηρεσίας, δεν υπάρχει δεύτερη άμυνα. Όπου ο
//    καλών ξέρει τον χρήστη, μπαίνει και το φίλτρο.
//
// 2. ΤΟ `updated_at` ΓΡΑΦΟΤΑΝ ΑΠΟ ΤΟ ΡΟΛΟΪ ΤΟΥ ΠΕΡΙΗΓΗΤΗ. Πέντε σημεία
//    έστελναν `new Date().toISOString()`. Ο πίνακας έχει ήδη σκανδάλη
//    (`bills_settings_updated_at` BEFORE UPDATE) που το γράφει με `NOW()` του
//    διακομιστή και προεπιλογή `now()` στην εισαγωγή. Δηλαδή στην ενημέρωση η
//    τιμή του πελάτη πεταγόταν πάντα και στην ΠΡΩΤΗ εγγραφή περνούσε — άρα
//    ένα ξεστραβωμένο ρολόι έγραφε ημερομηνία που καμία άλλη γραμμή δεν είχε.
//    Σβήστηκε: το `updated_at` ανήκει στη βάση.
//
// 3. ΤΟ ΟΝΟΜΑ ΤΗΣ ΕΝΟΤΗΤΑΣ ΗΤΑΝ ΚΕΙΜΕΝΟ. Ένα `'insurnace'` δεν βγάζει σφάλμα:
//    επιστρέφει «καμία ρύθμιση», δηλαδή η οθόνη δείχνει προεπιλογές σαν να μην
//    έχει δηλώσει ποτέ τίποτε ο ιδιοκτήτης. Οι οκτώ ενότητες είναι πλέον τύπος.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import { rows as readRows, row as readRow } from './read';

const TABLE = 'bills_settings';

export type Db = SupabaseClient;

/** Οι ενότητες που υπάρχουν. Ό,τι δεν είναι εδώ, δεν γράφεται και δεν διαβάζεται. */
export const SECTIONS = [
  'electricity', 'gas', 'providers', 'insurance',
  'services', 'common', 'budgets', 'app_preferences',
] as const;

export type Section = typeof SECTIONS[number];

/** Το περιεχόμενο μιας ενότητας: ελεύθερο αντικείμενο, όχι `any`. */
export type SettingsData = Record<string, unknown>;

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────

/**
 * Το `data` μιας ενότητας, ή `null` αν δεν έχει γραφτεί ποτέ.
 *
 * Επιστρέφει το ΠΕΡΙΕΧΟΜΕΝΟ, όχι τη γραμμή: κάθε καλών έγραφε `row?.data as …`
 * και το `as` έσβηνε τον τύπο μαζί με το λάθος.
 */
export async function section<T = SettingsData>(
  db: Db, propertyId: string, name: Section, userId?: string,
): Promise<T | null> {
  if (!propertyId) return null;
  let q = db.from(TABLE).select('data').eq('property_id', propertyId).eq('section', name);
  if (userId) q = q.eq('user_id', userId);
  const found = await readRow<{ data: T }>(q.maybeSingle());
  return (found?.data as T | undefined) ?? null;
}

/**
 * Πολλές ενότητες του ίδιου ακινήτου, με ΜΙΑ ανάγνωση, σε χάρτη ανά ενότητα.
 *
 * Ο καλών έγραφε μόνος του το `find(r => r.section === name)?.data` — και ο
 * προϋπολογισμός το έγραφε δύο φορές, μια για κάθε λίστα ενοτήτων που ζητούσε.
 */
export async function sections<T = SettingsData>(
  db: Db, propertyId: string, names: readonly Section[], userId?: string,
): Promise<Partial<Record<Section, T>>> {
  if (!propertyId || names.length === 0) return {};
  let q = db.from(TABLE).select('section,data').eq('property_id', propertyId).in('section', names as unknown as string[]);
  if (userId) q = q.eq('user_id', userId);
  const out: Partial<Record<Section, T>> = {};
  for (const row of await readRows<{ section: Section; data: T }>(q)) out[row.section] = row.data;
  return out;
}

/**
 * Η ΙΔΙΑ ενότητα σε πολλά ακίνητα, σε χάρτη ανά ακίνητο. Για τη σύγκριση.
 *
 * Κενή λίστα σημαίνει κανένα ερώτημα: το `.in('property_id', [])` στέλνει
 * αίτημα που δεν μπορεί να επιστρέψει τίποτε.
 */
export async function acrossProperties<T = SettingsData>(
  db: Db, propertyIds: string[], name: Section, userId?: string,
): Promise<Record<string, T>> {
  if (propertyIds.length === 0) return {};
  let q = db.from(TABLE).select('property_id,data').in('property_id', propertyIds).eq('section', name);
  if (userId) q = q.eq('user_id', userId);
  const out: Record<string, T> = {};
  for (const row of await readRows<{ property_id: string | null; data: T }>(q)) {
    if (row.property_id) out[row.property_id] = row.data;
  }
  return out;
}

// ── ΕΓΓΡΑΦΗ ────────────────────────────────────────────────────────────────

/**
 * Γράφει το περιεχόμενο μιας ενότητας. Το κλειδί σύγκρουσης είναι το ΜΟΝΑΔΙΚΟ
 * ευρετήριο του πίνακα, `(property_id, section)` και γράφεται εδώ μία φορά
 * αντί για πέντε — ένα λάθος γραμμένο κλειδί δεν ενημερώνει, διπλασιάζει.
 *
 * Επιστρέφει το αποτέλεσμα του Supabase, ώστε ο καλών να το δώσει στη `saved()`
 * ή στη `must()` και η αποτυχία να μη χαθεί.
 */
export function put(db: Db, propertyId: string, userId: string, name: Section, data: SettingsData) {
  return db.from(TABLE).upsert(
    { property_id: propertyId, user_id: String(userId), section: name, data },
    { onConflict: 'property_id,section' },
  );
}
