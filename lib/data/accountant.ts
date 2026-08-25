// ═══════════════════════════════════════════════════════════════════════════
// Ο ΧΩΡΟΣ ΤΟΥ ΛΟΓΙΣΤΗ — ΤΟ ΣΤΡΩΜΑ ΔΕΔΟΜΕΝΩΝ
//
// Ο λογιστής ΔΕΝ έχει δικαίωμα ανάγνωσης στους πίνακες του ιδιοκτήτη. Κάθε
// νούμερο που βλέπει περνά από συνάρτηση της βάσης που ελέγχει τη σύνδεση και
// επιστρέφει ΜΟΝΟ ό,τι της ζητήσαμε ρητά. Εδώ ζει η μία πλευρά αυτής της
// συνομιλίας, ώστε το σχήμα της απάντησης να γράφεται μία φορά.
//
// ΤΟ «ΤΙ ΛΕΙΠΕΙ» ΔΕΝ ΥΠΟΛΟΓΙΖΕΤΑΙ ΣΤΗ ΒΑΣΗ. Η βάση μετρά, η εφαρμογή κρίνει.
// Ο κανόνας του τι λείπει ζει στο lib/accounting/dossier.ts μαζί με τη
// διατύπωση και το ποιος το φέρνει· γραμμένος και σε SQL, θα απέκλινε την
// πρώτη φορά που άλλαζε ο ένας από τους δύο. Εδώ μεταφράζονται οι ωμοί
// αριθμοί σε προτάσεις, με τον ίδιο κανόνα για κάθε πελάτη.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';

type Db = SupabaseClient;

/** Ό,τι μετρά η βάση για έναν πελάτη, χωρίς καμία κρίση πάνω του. */
export interface ClientCounts {
  ownerId: string;
  name: string;
  afm: string | null;
  linkedAt: string;
  /**
   * Το τρέχον αναγνωριστικό της κατάστασης, για να ανοίγει η κάρτα.
   *
   * ΓΙΑΤΙ ΕΡΧΕΤΑΙ ΜΕ ΤΗ ΛΙΣΤΑ ΚΑΙ ΔΕΝ ΚΡΑΤΙΕΤΑΙ. Ο ιδιοκτήτης μπορεί να
   * περιστρέψει τον σύνδεσμό του· ένας σελιδοδείκτης θα κρατούσε τον παλιό και
   * θα οδηγούσε σε «δεν είναι έγκυρος». Εδώ έρχεται φρέσκο σε κάθε φόρτωση.
   * Κενό σημαίνει ανακλημένος ή ληγμένος σύνδεσμος.
   */
  token: string | null;
  /**
   * Πότε κινήθηκε τελευταία φορά ο φάκελος: η νεότερη καταχώρηση σε δαπάνες,
   * εισπράξεις, διαμονές ή έγγραφα.
   *
   * ΓΙΑΤΙ ΜΕΤΡΑΕΙ. Δύο πελάτες με τα ίδια κενά είναι εντελώς διαφορετική
   * δουλειά όταν ο ένας καταχώρησε χθες και ο άλλος τον Μάρτιο. `null` όταν
   * δεν έχει καταχωρήσει ποτέ τίποτα.
   */
  lastActivity: string | null;
  /**
   * Τα ανοιχτά αιτήματα ΟΛΟΚΛΗΡΑ, όχι σε πλήθος: ένας αριθμός δεν λέει ούτε τι
   * ζητήθηκε ούτε πότε, ούτε επιτρέπει να παρθεί πίσω.
   */
  requests: SentRequest[];
  properties: number;
  expenses: number;
  uncategorised: number;
  noSupplierAfm: number;
  rentsUnpaid: number;
  stays: number;
  staysNoFee: number;
  openRequests: number;
}

/** Ενα αίτημα που έχει ήδη σταλεί, όπως το βλέπει ο λογιστής στη λίστα του. */
export interface SentRequest {
  id: string;
  item: string;
  /** Η σημείωση που έγραψε ο λογιστής δίπλα του. Κενή όταν δεν έγραψε. */
  note: string | null;
  createdAt: string;
}

/** Μια εκκρεμότητα, όπως θα τη διάβαζε ο ιδιοκτήτης στο τηλέφωνο. */
export interface Gap {
  /** Σταθερό κλειδί, ώστε το ίδιο αίτημα να μη γράφεται δύο φορές. */
  key: string;
  /** Τι λείπει, σε μία φράση που στέκεται μόνη της. */
  item: string;
  /** Πόσο σοβαρό: τα μπλοκαριστικά πρώτα, πάντα. */
  blocking: boolean;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Τι λείπει από έναν πελάτη, από τους αριθμούς που μέτρησε η βάση.
 *
 * ΣΕΙΡΑ ΜΕ ΝΟΗΜΑ. Πρώτα ό,τι εμποδίζει τη δήλωση, μετά ό,τι τη χαλάει χωρίς να
 * τη σταματά. Μέσα σε κάθε ομάδα, το ακριβότερο πρώτο.
 */
export function gapsOf(c: ClientCounts): Gap[] {
  const out: Gap[] = [];

  if (c.properties === 0) {
    out.push({ key: 'no_properties', item: 'Δεν έχει καταχωρήσει κανένα ακίνητο', blocking: true });
    return out;   // Χωρίς ακίνητο, τα υπόλοιπα δεν έχουν νόημα να ειπωθούν.
  }
  if (c.expenses === 0) {
    out.push({ key: 'no_expenses', item: 'Καμία καταχωρημένη δαπάνη για τη χρήση', blocking: true });
  }
  if (c.uncategorised > 0) {
    out.push({
      key: 'uncategorised',
      item: `${c.uncategorised} ${plural(c.uncategorised, 'δαπάνη χωρίς κατηγορία', 'δαπάνες χωρίς κατηγορία')}`,
      blocking: true,
    });
  }
  if (c.noSupplierAfm > 0) {
    out.push({
      key: 'no_supplier_afm',
      item: `${c.noSupplierAfm} ${plural(c.noSupplierAfm, 'δαπάνη χωρίς ΑΦΜ προμηθευτή', 'δαπάνες χωρίς ΑΦΜ προμηθευτή')}`,
      blocking: false,
    });
  }
  if (c.staysNoFee > 0) {
    out.push({
      key: 'stays_no_fee',
      item: `${c.staysNoFee} ${plural(c.staysNoFee, 'κράτηση πλατφόρμας χωρίς προμήθεια', 'κρατήσεις πλατφόρμας χωρίς προμήθεια')}`,
      blocking: false,
    });
  }
  if (c.rentsUnpaid > 0) {
    out.push({
      key: 'rents_unpaid',
      item: `${c.rentsUnpaid} ${plural(c.rentsUnpaid, 'ανείσπρακτο μίσθωμα', 'ανείσπρακτα μισθώματα')}`,
      blocking: false,
    });
  }
  if (!c.afm) {
    out.push({ key: 'owner_afm', item: 'Δεν έχει συμπληρώσει ΑΦΜ', blocking: false });
  }
  return out;
}

/** Πόσο έτοιμος είναι ο φάκελός του, σε μία λέξη που δεν κρύβει τίποτα. */
export function readinessOf(gaps: readonly Gap[]): { label: string; blocking: number } {
  const blocking = gaps.filter(g => g.blocking).length;
  if (gaps.length === 0) return { label: 'Έτοιμος', blocking: 0 };
  if (blocking === 0) return { label: 'Σχεδόν έτοιμος', blocking: 0 };
  return { label: 'Δεν κλείνει', blocking };
}

// ── ΟΙ ΤΕΣΣΕΡΙΣ ΚΛΗΣΕΙΣ ────────────────────────────────────────────────────

/** Ο λογιστής διεκδικεί σύνδεσμο που του έστειλε ιδιοκτήτης. */
export async function claim(db: Db, token: string): Promise<{ ok: boolean; owner?: string; reason?: string }> {
  const { data, error } = await db.rpc('accountant_claim', { p_token: token.trim() });
  if (error) return { ok: false, reason: 'error' };
  return (data ?? { ok: false, reason: 'error' }) as { ok: boolean; owner?: string; reason?: string };
}

/** Όλοι οι πελάτες που τον εξουσιοδότησαν, με τους αριθμούς της χρήσης. */
export async function clients(db: Db, year: number): Promise<ClientCounts[]> {
  const { data, error } = await db.rpc('accountant_clients_overview', { p_year: year });
  if (error || !Array.isArray(data)) return [];
  return data as ClientCounts[];
}

/** «Ζήτησέ το»: γράφει εκκρεμότητα που ο ιδιοκτήτης βλέπει στον πίνακά του. */
export async function request(db: Db, ownerId: string, item: string, note?: string): Promise<boolean> {
  const { data, error } = await db.rpc('accountant_request_item', {
    p_owner: ownerId, p_item: item, p_note: note ?? null,
  });
  if (error) return false;
  return Boolean((data as { ok?: boolean } | null)?.ok);
}

/**
 * ΠΑΙΡΝΕΙ ΠΙΣΩ ΑΙΤΗΜΑ ΠΟΥ ΕΣΤΕΙΛΕ ΚΑΤΑ ΛΑΘΟΣ.
 *
 * Η πολιτική `accountant_requests_withdraw` το επιτρέπει από την πρώτη μέρα
 * και καμία οθόνη δεν το πρόσφερε: ο λογιστής που ζητούσε λάθος πράγμα άφηνε
 * στον ιδιοκτήτη μια εκκρεμότητα που δεν έκλεινε ποτέ.
 */
export async function withdrawRequest(db: Db, id: string): Promise<boolean> {
  const { error } = await db.from('accountant_requests').delete().eq('id', id);
  return !error;
}

/**
 * ΒΓΑΖΕΙ ΠΕΛΑΤΗ ΑΠΟ ΤΗ ΛΙΣΤΑ ΤΟΥ ΛΟΓΙΣΤΗ.
 *
 * ΔΕΝ ΕΙΝΑΙ ΑΝΑΚΛΗΣΗ, ΕΙΝΑΙ ΤΑΚΤΟΠΟΙΗΣΗ. Η ανάκληση ανήκει στον ιδιοκτήτη και
 * μένει δική του. Ομως ο λογιστής που έχασε πελάτη έβλεπε τη γραμμή του για
 * πάντα και μετρούσε στο «δεν κλείνουν»: το εργαλείο του τον χρέωνε δουλειά
 * που δεν έχει. Η ίδια γραμμή ξαναγεννιέται με τον σύνδεσμο, αν χρειαστεί.
 */
export async function dropClient(db: Db, ownerId: string): Promise<boolean> {
  const { error } = await db.from('accountant_clients').delete().eq('owner_id', ownerId);
  return !error;
}

/** Η άλλη πλευρά: ποιος λογιστής βλέπει τα δικά μου. */
export async function myAccountants(db: Db): Promise<{ accountantId: string; name: string; linkedAt: string }[]> {
  const { data, error } = await db.rpc('my_accountants');
  if (error || !Array.isArray(data)) return [];
  return data as { accountantId: string; name: string; linkedAt: string }[];
}

// ── Η ΠΛΕΥΡΑ ΤΟΥ ΙΔΙΟΚΤΗΤΗ ─────────────────────────────────────────────────
// Τα αιτήματα τα διαβάζει απευθείας: η RLS του πίνακα τον περιορίζει ήδη στα
// δικά του. Δεν χρειάζεται συνάρτηση που παρακάμπτει και όπου δεν χρειάζεται,
// δεν μπαίνει.

export interface OpenRequest {
  id: string;
  item: string;
  note: string | null;
  createdAt: string;
  /** Ποιος ζήτησε. Χωρίς όνομα, η ειδοποίηση λέει «κάποιος σου ζήτησε κάτι». */
  from: string;
}

export async function openRequests(db: Db): Promise<OpenRequest[]> {
  const [{ data }, who] = await Promise.all([
    db.from('accountant_requests')
      .select('id,item,note,created_at,accountant_id')
      .eq('status', 'open')
      .order('created_at'),
    myAccountants(db),
  ]);
  const nameOf = new Map(who.map(a => [a.accountantId, a.name]));
  return (data ?? []).map(r => ({
    id: r.id as string,
    item: r.item as string,
    note: (r.note ?? null) as string | null,
    createdAt: r.created_at as string,
    from: nameOf.get(r.accountant_id as string) ?? 'Ο λογιστής σου',
  }));
}

/** «Το έστειλα» ή «δεν ισχύει». Το κείμενο του αιτήματος δεν το αγγίζει. */
export async function answerRequest(db: Db, id: string, status: 'done' | 'dismissed'): Promise<boolean> {
  const { error } = await db.from('accountant_requests')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}
