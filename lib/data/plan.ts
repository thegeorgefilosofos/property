// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΣΧΕΔΙΟ ΑΞΙΟΠΟΙΗΣΗΣ: ΜΙΑ ΑΝΑΓΝΩΣΗ, ΜΙΑ ΕΓΓΡΑΦΗ
// ─────────────────────────────────────────────────────────────────────────
// Η οθόνη κρατά τέσσερα πράγματα — ποια βήματα έγιναν, τι είδους εκκρεμότητα
// είναι, τι κοστίζει ο κενός μήνας, με μεσίτη ή μόνος σου — και μέχρι τώρα τα
// κρατούσε σε τέσσερα ξεχωριστά κλειδιά του `localStorage`. Στη βάση είναι μία
// γραμμή: μία ανάγνωση στο άνοιγμα, μία εγγραφή σε κάθε αλλαγή.
//
// ── ΓΙΑΤΙ ΤΟ ΣΧΗΜΑ ΕΛΕΓΧΕΤΑΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΤΗΝ ΟΘΟΝΗ ─────────────────────
// Οι στήλες είναι `jsonb`, δηλαδή η βάση δέχεται ό,τι της δώσεις. Μια γραμμή
// γραμμένη από παλιότερη έκδοση, ή χαλασμένη με το χέρι, θα έφτανε στην οθόνη
// ως `undefined.map` και θα έσπαγε ολόκληρη την καρτέλα. Το καθάρισμα γίνεται
// στο σύνορο: ό,τι βγαίνει από εδώ έχει το σχήμα που υπόσχεται ο τύπος του.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PropertyPlanRow } from '@/lib/supabase/tables';

const TABLE = 'property_plan';

export type Db = SupabaseClient;

/** Ο,τι κρατά το σχέδιο ενός ακινήτου, καθαρισμένο. */
export interface PlanState {
  /** Ανά κατάσταση ακινήτου: τα αναγνωριστικά των βημάτων που έγιναν. */
  done: Record<string, string[]>;
  disputeKind: string | null;
  vacancyCosts: Record<string, number>;
  useAgent: boolean;
}

export const EMPTY_PLAN: PlanState = { done: {}, disputeKind: null, vacancyCosts: {}, useAgent: true };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Ο χάρτης «κατάσταση → βήματα», καθαρισμένος.
 *
 * ΚΡΑΤΑΕΙ ΜΟΝΟ ΣΥΜΒΟΛΟΣΕΙΡΕΣ. Ενα `null` μέσα στον πίνακα γίνεται αργότερα
 * `checked.has(null)` που δεν σκάει, αλλά και δεν σημαίνει τίποτα: μένει έξω,
 * ώστε το πλήθος των ολοκληρωμένων να είναι αληθινό.
 */
export function readDone(v: unknown): Record<string, string[]> {
  if (!isRecord(v)) return {};
  const out: Record<string, string[]> = {};
  for (const [status, ids] of Object.entries(v)) {
    if (!Array.isArray(ids)) continue;
    const clean = ids.filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (clean.length) out[status] = clean;
  }
  return out;
}

/**
 * Τα πάγια του κενού μήνα, καθαρισμένα.
 *
 * ΤΟ `NaN` ΚΑΙ ΤΟ ΑΠΕΙΡΟ ΔΕΝ ΕΙΝΑΙ ΠΟΣΑ. Θα περνούσαν άθικτα από το JSON και
 * θα έβγαιναν στην οθόνη ως «NaN €» μέσα σε άθροισμα που δεν διορθώνεται.
 */
export function readCosts(v: unknown): Record<string, number> {
  if (!isRecord(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v)) {
    if (typeof n === 'number' && Number.isFinite(n)) out[k] = n;
  }
  return out;
}

/** Η γραμμή της βάσης, καθαρισμένη σε `PlanState`. */
export function shape(row: Partial<PropertyPlanRow> | null | undefined): PlanState {
  if (!row) return EMPTY_PLAN;
  return {
    done: readDone(row.done_steps),
    disputeKind: typeof row.dispute_kind === 'string' ? row.dispute_kind : null,
    vacancyCosts: readCosts(row.vacancy_costs),
    // ΤΟ `use_agent` ΕΧΕΙ ΠΡΟΕΠΙΛΟΓΗ «ΝΑΙ», ΟΧΙ «ΟΧΙ». Το `Boolean(undefined)`
    // θα έδινε ψευδές και θα άλλαζε το καθαρό ποσό που δείχνει η οθόνη σε
    // γραμμή που απλώς δεν έχει γραφτεί ακόμη.
    useAgent: typeof row.use_agent === 'boolean' ? row.use_agent : true,
  };
}

export const COLUMNS = 'done_steps,dispute_kind,vacancy_costs,use_agent';

/**
 * Το σχέδιο ενός ακινήτου, ΜΑΖΙ με το αν η ανάγνωση πέτυχε.
 *
 * ΓΙΑΤΙ ΔΕΝ ΑΡΚΕΙ ΤΟ ΣΧΕΔΙΟ. Μια αποτυχημένη ανάγνωση γυρίζει άδειο, ακριβώς
 * όπως ένα ακίνητο που δεν έχει σχέδιο ακόμη. Η οθόνη θα έδειχνε δώδεκα άθικτα
 * βήματα και, με την πρώτη αλλαγή, θα έγραφε αυτό το άδειο ΠΑΝΩ στη γραμμή που
 * υπάρχει: ο χρήστης θα έχανε ό,τι είχε τσεκάρει, χωρίς να το πατήσει ποτέ.
 *
 * Το «δεν ξέρω» δεν επιτρέπεται να διαβάζεται ως «δεν υπάρχει».
 */
export async function read(db: Db, propertyId: string): Promise<{ plan: PlanState; error: string | null }> {
  const { data, error } = await db.from(TABLE).select(COLUMNS).eq('property_id', propertyId).maybeSingle();
  if (error) return { plan: EMPTY_PLAN, error: error.message || 'άγνωστο σφάλμα' };
  return { plan: shape(data as Partial<PropertyPlanRow> | null), error: null };
}

/**
 * Γράφει ΟΛΟ το σχέδιο, με σύγκρουση στο ακίνητο.
 *
 * ΜΙΑ ΕΓΓΡΑΦΗ ΚΑΙ ΟΧΙ «ΔΙΑΒΑΣΕ, ΑΛΛΑΞΕ, ΓΡΑΨΕ». Το τσεκάρισμα τριών βημάτων
 * στη σειρά θα έστελνε τρεις κύκλους ανάγνωσης-εγγραφής και ο τελευταίος θα
 * έγραφε πάνω στους δύο πρώτους. Η οθόνη κρατά ήδη ολόκληρη την κατάσταση σε
 * μνήμη, οπότε στέλνει ολόκληρη.
 */
export function save(db: Db, propertyId: string, userId: string, s: PlanState) {
  return db.from(TABLE).upsert({
    property_id: propertyId,
    user_id: userId,
    done_steps: s.done,
    dispute_kind: s.disputeKind,
    vacancy_costs: s.vacancyCosts,
    use_agent: s.useAgent,
  }, { onConflict: 'property_id' });
}
