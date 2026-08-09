// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΗΜΕΡΟΛΟΓΙΟ ΕΧΕΙ ΕΝΑ ΣΠΙΤΙ
// ─────────────────────────────────────────────────────────────────────────
// Ογδόντα μία κλήσεις στον πίνακα `calendar_events`, μοιρασμένες σε δεκατέσσερα
// components, καθένα με τη δική του εκδοχή των ίδιων τριών πραγμάτων: ποια
// στήλη γράφεται, ποιο είναι το πεδίο εμβέλειας, και τι γίνεται αν αποτύχει.
//
// ΔΕΝ ΕΙΝΑΙ ΘΕΜΑ ΤΑΞΗΣ. Το ίδιο συγχρονιστικό μοτίβο («σβήσε ό,τι είχε γράψει
// αυτή η πηγή, γράψε το φρέσκο») ήταν γραμμένο δέκα φορές, και οι δέκα
// διαφορετικά:
//
//   · Άλλες φορές σε παρτίδες των είκοσι, άλλες όλα μαζί — ένα ακίνητο με
//     εκατόν πενήντα δόσεις χτυπούσε το όριο μεγέθους αιτήματος σε ΜΕΡΙΚΕΣ
//     από τις διαδρομές, όχι σε όλες.
//   · Άλλες φορές με έλεγχο αποτελέσματος, άλλες χωρίς κανέναν.
//   · Και πάντα με τη ΔΙΑΓΡΑΦΗ ΠΡΩΤΑ.
//
// ΓΙΑΤΙ Η ΣΕΙΡΑ ΕΙΝΑΙ ΤΟ ΣΟΒΑΡΟ. Διαγραφή πρώτα σημαίνει: αν η εισαγωγή σκάσει
// στη μέση —πεσμένο δίκτυο, λήξη διακριτικού— ο χρήστης μένει με ημερολόγιο
// ΧΩΡΙΣ τις δόσεις του δανείου και χωρίς τις προθεσμίες του φόρου. Και δεν του
// το λέει κανείς: η οθόνη δείχνει άδειο, το άδειο μοιάζει με «δεν έχω τίποτα».
//
// Εδώ η σειρά είναι ανάποδη: κρατάμε τα αναγνωριστικά των παλιών, γράφουμε τα
// νέα, και ΜΕΤΑ σβήνουμε ακριβώς τα παλιά. Κάθε αποτυχία αφήνει ΠΕΡΙΣΣΟΤΕΡΑ,
// ποτέ λιγότερα. Το διπλό το βλέπει ο χρήστης και διορθώνεται μόνο του στο
// επόμενο πέρασμα· το χαμένο δεν το βλέπει κανείς.
//
// Δεν είναι συναλλαγή — ο πελάτης του περιηγητή δεν έχει συναλλαγές. Είναι η
// καλύτερη σειρά που μπορεί να έχει κάτι που δεν είναι συναλλαγή.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν ειδοποιεί τον χρήστη και δεν πετάει. Επιστρέφει `{ error }`,
// δηλαδή ακριβώς ό,τι περιμένουν η `saved()` και η `must()`, ώστε ο καλών να
// διαλέξει ο ίδιος — όπως έκανε και πριν:
//
//     if (!await saved('Οι δόσεις δεν μπήκαν στο ημερολόγιο',
//         calendar.replaceSource(db, scope, { source: src }, rows))) return
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarEventsRow } from '@/lib/supabase/tables';
import type { DbError } from '@/lib/supabase/writeResult';

const TABLE = 'calendar_events';

/** Πόσες γραμμές ανά αίτημα. Το PostgREST δέχεται περισσότερες, ο περιηγητής
 *  όχι πάντα: ένα ακίνητο με τριακόσιες δόσεις έφτιαχνε αίτημα που κοβόταν. */
export const BATCH = 20;

export type EventCategory = 'tax' | 'financial' | 'bills' | 'maintenance' | 'contract' | 'tenant' | 'reminder';
export type EventPriority = 'low' | 'medium' | 'high' | 'critical';
export type EventStatus   = 'pending' | 'paid' | 'cancelled' | 'in_progress';

const CANONICAL = new Set<string>(['tax', 'financial', 'bills', 'maintenance', 'contract', 'tenant', 'reminder']);

/**
 * ΟΙ ΚΑΤΗΓΟΡΙΕΣ ΠΟΥ ΓΡΑΦΤΗΚΑΝ ΠΡΙΝ ΥΠΑΡΞΟΥΝ ΟΙ ΕΠΤΑ.
 *
 * Τρεις οθόνες έγραφαν ονόματα που το ημερολόγιο δεν γνώριζε, και το ημερολόγιο
 * τα μετέφραζε στην ΑΝΑΓΝΩΣΗ με δικό του πίνακα ψευδωνύμων: έγραφε λάθος και
 * διάβαζε σωστά. Ο πίνακας ζει εδώ, δίπλα στον τύπο που εξηγεί, γιατί είναι
 * γνώση για το ΣΧΗΜΑ των δεδομένων και όχι για μια οθόνη.
 *
 * Οι νέες εγγραφές γράφουν κανονικά. Ο πίνακας μένει για τις παλιές γραμμές —
 * και για δύο σημεία (ασφάλιση, φυσικό αέριο) όπου η κατηγορία ΕΙΝΑΙ το κλειδί
 * που εμποδίζει τη διπλοεγγραφή: αλλάζοντάς την, κάθε υπάρχουσα υπενθύμιση θα
 * ξαναγραφόταν μία φορά, διπλή.
 */
export const CATEGORY_ALIASES: Record<string, EventCategory> = {
  rent_due: 'financial', deposit: 'financial', rent_income: 'financial',
  lease: 'contract', lease_end: 'contract', rent_adjustment: 'contract',
  insurance_renewal: 'contract', gas_contract: 'contract',
  taxes: 'tax',
};

export type LegacyCategory = keyof typeof CATEGORY_ALIASES;

/**
 * Η προτεραιότητα από πηγή που δεν ελέγχουμε — π.χ. την απάντηση της συνάρτησης
 * που παράγει προτάσεις. Ένα «urgent» που δεν υπάρχει στις τέσσερις τιμές
 * γραφόταν αυτούσιο στη βάση και το ημερολόγιο δεν ήξερε τι χρώμα να του δώσει.
 */
export function eventPriority(raw: string | null | undefined): EventPriority {
  const p = (raw || '').trim();
  return (p === 'low' || p === 'medium' || p === 'high' || p === 'critical') ? p : 'medium';
}

/** Η κατηγορία όπως τη διαβάζει η οθόνη: κανονική, ή μεταφρασμένη από παλιά. */
export function canonicalCategory(raw: string | null | undefined): EventCategory {
  const c = (raw || '').trim();
  if (CANONICAL.has(c)) return c as EventCategory;
  return CATEGORY_ALIASES[c] || 'reminder';
}

/** Ο πελάτης, όπως τον δίνει το `createClient()`. Το στρώμα δεν τον φτιάχνει:
 *  τον δέχεται, ώστε να δουλεύει και στον περιηγητή και στον διακομιστή. */
export type Db = SupabaseClient;

/** Σε ποιον και σε ποιο ακίνητο ανήκει το γεγονός. Και τα δύο υποχρεωτικά:
 *  ήταν χειρόγραφα σε κάθε κλήση, και έλειπαν σε αρκετές. */
export interface Scope { propertyId: string; userId: string }

/** Ό,τι δίνει ο καλών. Τα σταθερά («εκκρεμές», «μεσαία προτεραιότητα», «όχι
 *  επαναλαμβανόμενο») τα συμπληρώνει το `row()` — ήταν ξεχασμένα σε τρεις
 *  διαδρομές, και το γεγονός έμπαινε χωρίς κατάσταση. */
export interface EventDraft {
  title: string;
  category: EventCategory | LegacyCategory;
  event_date: string;
  amount?: number | null;
  priority?: EventPriority;
  status?: EventStatus;
  recurring?: boolean;
  recurring_interval?: string | null;
  recurrence_until?: string | null;
  recurrence_count?: number | null;
  recurrence_exdates?: string[] | null;
  notes?: string | null;
  event_time?: string | null;
  duration_minutes?: number | null;
  attachment_url?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  color?: string | null;
  bill_id?: string | null;
  /** Αν λείπει, παίρνει την πηγή του `replaceSource`/`insert`. */
  source?: string;
}

export type EventRow = Omit<CalendarEventsRow, 'id' | 'created_at' | 'recurrence_exdates'> & {
  recurrence_exdates?: string[] | null;
};

/** Το πλήρες αντικείμενο εγγραφής, με τα σταθερά που ξεχνιούνται. */
export function row(scope: Scope, source: string, d: EventDraft): EventRow {
  return {
    property_id: scope.propertyId,
    user_id: scope.userId,
    title: d.title,
    category: d.category,
    event_date: d.event_date,
    amount: d.amount ?? null,
    priority: d.priority ?? 'medium',
    status: d.status ?? 'pending',
    recurring: d.recurring ?? false,
    recurring_interval: d.recurring_interval ?? null,
    recurrence_until: d.recurrence_until ?? null,
    recurrence_count: d.recurrence_count ?? null,
    recurrence_exdates: d.recurrence_exdates ?? null,
    notes: d.notes ?? null,
    event_time: d.event_time ?? null,
    duration_minutes: d.duration_minutes ?? null,
    attachment_url: d.attachment_url ?? null,
    contact_phone: d.contact_phone ?? null,
    contact_email: d.contact_email ?? null,
    color: d.color ?? null,
    bill_id: d.bill_id ?? null,
    source: d.source ?? source,
  };
}

/**
 * Το αποτέλεσμα που καταλαβαίνουν ΚΑΙ η `saved()` ΚΑΙ η `must()`. Το `data: null`
 * δεν είναι διακοσμητικό: χωρίς αυτό η `must()` δεν δέχεται το αντικείμενο, και
 * ο καλών θα αναγκαζόταν να διαλέξει στρατόπεδο.
 */
export interface Outcome { data: null; error: { message?: string; code?: string } | null }

/** Ποια γεγονότα εννοούμε. Συνήθως τα «δικά της» μιας πηγής συγχρονισμού. */
export interface EventMatch {
  /** Ακριβής πηγή. */
  source?: string;
  /** Οποιαδήποτε από τις πηγές. */
  sources?: string[];
  /** Πρόθεμα πηγής, π.χ. `'booking:'` για όλες τις κρατήσεις. */
  prefix?: string;
  /** Πρόσθετος περιορισμός κατηγορίας, όταν η πηγή δεν αρκεί. */
  category?: EventCategory | LegacyCategory;
  /** Ακριβής τίτλος — για έλεγχο διπλοεγγραφής. */
  title?: string;
  /** Ακριβής ημέρα — για έλεγχο διπλοεγγραφής. */
  eventDate?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyMatch(query: any, m: EventMatch): any {
  let q = query;
  if (m.source !== undefined)    q = q.eq('source', m.source);
  if (m.sources !== undefined)   q = q.in('source', m.sources);
  if (m.prefix !== undefined)    q = q.like('source', `${m.prefix}%`);
  if (m.category !== undefined)  q = q.eq('category', m.category);
  if (m.title !== undefined)     q = q.eq('title', m.title);
  if (m.eventDate !== undefined) q = q.eq('event_date', m.eventDate);
  return q;
}

// ── ΑΝΑΓΝΩΣΗ ───────────────────────────────────────────────────────────────
//
// ΟΝΟΜΑΤΙΣΜΕΝΑ ΕΡΩΤΗΜΑΤΑ, ΟΧΙ ΓΕΝΙΚΟΣ ΚΑΤΑΣΚΕΥΑΣΤΗΣ. Ένα `of(db, propertyId)`
// που γυρίζει τον κατασκευαστή του Supabase θα ήταν λιγότερος κώδικας εδώ και
// ακριβώς η ίδια σκόρπια γνώση παραπέρα: κάθε οθόνη θα ξανάγραφε τα δικά της
// φίλτρα, και ο τύπος του αποτελέσματος θα γύριζε `any` σε κάθε κλήση. Οι
// αναγνώσεις είναι έξι, όσες χρειάζονται πραγματικά, και η καθεμιά λέει τι θέλει.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scoped(db: Db, propertyId: string, columns: string): any {
  return db.from(TABLE).select(columns).eq('property_id', propertyId);
}

/** Όλα τα γεγονότα ενός ακινήτου, σε χρονική σειρά. */
export async function all(db: Db, propertyId: string): Promise<CalendarEventsRow[]> {
  const { data } = await scoped(db, propertyId, '*').order('event_date');
  return (data || []) as CalendarEventsRow[];
}

/** Τα αναγνωριστικά όσων έγραψε μια πηγή — προαιρετικά μόνο μέσα σε εύρος ημερών. */
export async function ids(
  db: Db, propertyId: string, match: EventMatch, range?: { from: string; to: string },
): Promise<string[]> {
  let q = applyMatch(scoped(db, propertyId, 'id'), match);
  if (range) q = q.gte('event_date', range.from).lte('event_date', range.to);
  const { data } = await q.order('event_date');
  return ((data || []) as { id: string }[]).map(r => r.id);
}

/** Οι πηγές όσων γεγονότων ταιριάζουν — για να ξέρει η οθόνη τι υπάρχει ήδη. */
export async function sources(db: Db, propertyId: string, match: EventMatch): Promise<string[]> {
  const { data } = await applyMatch(scoped(db, propertyId, 'source'), match);
  return ((data || []) as { source: string | null }[]).map(r => String(r.source || ''));
}

/** Οι τίτλοι όσων γεγονότων ταιριάζουν. */
export async function titles(db: Db, propertyId: string, match: EventMatch): Promise<string[]> {
  const { data } = await applyMatch(scoped(db, propertyId, 'title'), match);
  return ((data || []) as { title: string }[]).map(r => r.title);
}

/** Τα επόμενα γεγονότα από μια ημερομηνία και μετά. */
export async function upcoming(
  db: Db, scope: Scope, from: string, limit: number,
  columns = 'title,event_date,amount,status',
): Promise<Partial<CalendarEventsRow>[]> {
  const { data } = await scoped(db, scope.propertyId, columns)
    .eq('user_id', scope.userId).gte('event_date', from).order('event_date').limit(limit);
  return (data || []) as Partial<CalendarEventsRow>[];
}

/** Υπάρχει ήδη τέτοιο γεγονός; Ο έλεγχος διπλοεγγραφής, γραμμένος μία φορά. */
export async function exists(db: Db, propertyId: string, match: EventMatch): Promise<boolean> {
  const { data } = await applyMatch(scoped(db, propertyId, 'id'), match).limit(1);
  return !!(data && (data as unknown[]).length);
}

// ── ΓΡΑΨΙΜΟ ────────────────────────────────────────────────────────────────

/** Εισαγωγή σε παρτίδες. Σταματά στο πρώτο σφάλμα και το επιστρέφει. */
export async function insert(db: Db, rows: EventRow[]): Promise<Outcome> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db.from(TABLE).insert(rows.slice(i, i + BATCH));
    if (error) return { data: null, error };
  }
  return { data: null, error: null };
}

/** Ένα γεγονός, με το αναγνωριστικό του πίσω. */
export async function add(
  db: Db, scope: Scope, source: string, draft: EventDraft,
): Promise<{ data: { id: string } | null; error: { message?: string; code?: string } | null }> {
  return db.from(TABLE).insert(row(scope, source, draft)).select('id').single();
}

/** Ενημέρωση μιας γραμμής. */
export function update(db: Db, id: string, patch: Partial<CalendarEventsRow>): PromiseLike<{ error: DbError | null }> {
  return db.from(TABLE).update(patch).eq('id', id);
}

/**
 * Ενημέρωση πολλών γραμμών με ΕΝΑ αίτημα.
 *
 * Η μαζική σήμανση «πληρωμένο» έστελνε ένα αίτημα ΑΝΑ γεγονός μέσα σε
 * `Promise.all`: πενήντα επιλεγμένα γεγονότα, πενήντα ταξίδια στον διακομιστή
 * και πενήντα πιθανά μηνύματα σφάλματος για την ίδια ενέργεια.
 */
export function updateMany(db: Db, ids: string[], patch: Partial<CalendarEventsRow>): PromiseLike<{ error: DbError | null }> {
  return db.from(TABLE).update(patch).in('id', ids);
}

/**
 * Ενημέρωση όσων γεγονότων κρέμονται από έναν λογαριασμό. Ο εξοφλημένος
 * λογαριασμός κλείνει και την υπενθύμισή του — αλλιώς το ημερολόγιο ζητά
 * πληρωμή που έχει ήδη γίνει.
 */
export function updateByBill(db: Db, billId: string, patch: Partial<CalendarEventsRow>): PromiseLike<{ error: DbError | null }> {
  return db.from(TABLE).update(patch).eq('bill_id', billId);
}

/** Διαγραφή μιας γραμμής ή πολλών, με ένα αίτημα. */
export function remove(db: Db, id: string | string[]): PromiseLike<{ error: DbError | null }> {
  return Array.isArray(id)
    ? db.from(TABLE).delete().in('id', id)
    : db.from(TABLE).delete().eq('id', id);
}

/**
 * Αντικαθιστά ό,τι είχε γράψει μια πηγή με το φρέσκο σύνολο.
 *
 * Η σειρά είναι: διάβασε τα παλιά αναγνωριστικά, γράψε τα νέα, σβήσε τα παλιά.
 * Ό,τι και να πάει στραβά, ο χρήστης δεν χάνει γεγονότα — το χειρότερο που
 * βλέπει είναι διπλά, και το επόμενο πέρασμα τα καθαρίζει.
 */
export async function replaceSource(
  db: Db, scope: Scope, match: EventMatch, drafts: EventDraft[],
): Promise<Outcome> {
  const sourceOf = match.source ?? match.prefix ?? (match.sources?.[0] ?? '');
  const { data: old, error: readError } = await applyMatch(scoped(db, scope.propertyId, 'id'), match);
  if (readError) return { data: null, error: readError };

  if (drafts.length) {
    const { error } = await insert(db, drafts.map(d => row(scope, sourceOf, d)));
    if (error) return { data: null, error };
  }

  const stale = ((old || []) as { id: string }[]).map(r => r.id);
  for (let i = 0; i < stale.length; i += BATCH) {
    const { error } = await db.from(TABLE).delete().in('id', stale.slice(i, i + BATCH));
    if (error) return { data: null, error };
  }
  return { data: null, error: null };
}

/**
 * Το ΤΡΙΤΟ μοτίβο, δίπλα στο «αντικατάστησέ τα όλα»: κάθε προσχέδιο έχει τη
 * ΔΙΚΗ του πηγή (`tenant:<id>:rent_due`), και ο συγχρονισμός δεν πρέπει να
 * σβήσει τίποτα — μια υπενθύμιση ενοικίου κουβαλά εξαιρέσεις ημερών που ο
 * χρήστης έχει σημειώσει με το χέρι, και το «σβήσε και ξαναγράψε» θα τις έτρωγε.
 *
 * Βάζει ό,τι λείπει και, αν `refresh`, φρεσκάρει ό,τι υπάρχει. Τα υπόλοιπα
 * μένουν ακριβώς όπως είναι.
 */
export async function upsertBySource(
  db: Db, scope: Scope, prefix: string, drafts: EventDraft[],
  opts: { refresh?: boolean; fields?: (keyof CalendarEventsRow)[] } = {},
): Promise<Outcome> {
  const { data: existing, error: readError } = await scoped(db, scope.propertyId, 'id,source').like('source', `${prefix}%`);
  if (readError) return { data: null, error: readError };

  const idBySource = new Map<string, string>();
  for (const r of ((existing || []) as { id: string; source: string | null }[])) {
    if (r.source) idBySource.set(r.source, r.id);
  }

  const fresh = drafts.filter(d => !idBySource.has(d.source ?? prefix));
  if (fresh.length) {
    const { error } = await insert(db, fresh.map(d => row(scope, prefix, d)));
    if (error) return { data: null, error };
  }

  if (opts.refresh) {
    const fields = opts.fields ?? ['event_date', 'amount', 'title', 'notes'];
    for (const d of drafts) {
      const id = idBySource.get(d.source ?? prefix);
      if (!id) continue;
      const full = row(scope, prefix, d) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      for (const f of fields) patch[f] = full[f];
      const { error } = await db.from(TABLE).update(patch).eq('id', id);
      if (error) return { data: null, error };
    }
  }
  return { data: null, error: null };
}

/** Μία γραμμή που αναγνωρίζεται από την πηγή της, όπως είναι αποθηκευμένη. */
export async function bySource(
  db: Db, propertyId: string, source: string, columns: string,
): Promise<Partial<CalendarEventsRow> | null> {
  const { data } = await scoped(db, propertyId, columns).eq('source', source).maybeSingle();
  return (data || null) as Partial<CalendarEventsRow> | null;
}

/** Σβήνει ό,τι έγραψε μια πηγή, χωρίς να γράψει τίποτα στη θέση του. */
export function clearSource(db: Db, scope: Scope, match: EventMatch): Promise<Outcome> {
  return replaceSource(db, scope, match, []);
}
