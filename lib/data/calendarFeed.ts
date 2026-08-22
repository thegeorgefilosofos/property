// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΥΝΔΡΟΜΗ ΗΜΕΡΟΛΟΓΙΟΥ ΕΧΕΙ ΕΝΑ ΣΠΙΤΙ
// ─────────────────────────────────────────────────────────────────────────
// Δύο πλευρές, και οι δύο περνούν από εδώ: η οθόνη που δείχνει τη διεύθυνση
// στον ιδιοκτήτη, και η διαδρομή που την εξυπηρετεί χωρίς καμία συνεδρία.
//
// Η ΑΝΑΖΗΤΗΣΗ ΜΕ ΚΟΥΠΟΝΙ ΔΟΥΛΕΥΕΙ ΜΟΝΟ ΜΕ ΤΟΝ ΠΕΛΑΤΗ ΥΠΗΡΕΣΙΑΣ. Ο πίνακας
// δεν έχει πολιτική που να επιτρέπει σε συνδεδεμένο χρήστη να ψάξει ΞΕΝΟ
// κουπόνι — με το δημόσιο κλειδί η αναζήτηση γυρίζει πάντα κενή, που είναι
// ακριβώς το ζητούμενο.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarFeedTokensRow } from '@/lib/supabase/tables';
import type { DbError } from '@/lib/supabase/writeResult';
import { readOne, type ReadOneResult } from './read';
import { siteUrl } from '@/lib/core/site';

// Ο ΠΙΝΑΚΑΣ ΥΠΗΡΧΕ ΗΔΗ, ΚΑΙ ΤΟΝ ΧΡΗΣΙΜΟΠΟΙΕΙ Η «ΖΩΝΤΑΝΗ ΣΥΝΔΡΟΜΗ» ΤΟΥ
// ΗΜΕΡΟΛΟΓΙΟΥ. Δεύτερος πίνακας για το ίδιο μυστικό θα σήμαινε δύο διευθύνσεις
// ανά χρήστη και μία από τις δύο να μένει ζωντανή όταν ακυρωθεί η άλλη.
const TABLE = 'calendar_feed_tokens';

export type Db = SupabaseClient;

export type FeedRow = Pick<CalendarFeedTokensRow, 'token'>;
export type FeedOwner = Pick<CalendarFeedTokensRow, 'user_id' | 'expires_at'>;

/**
 * Εχει λήξει το κουπόνι;
 *
 * ΤΟ `expires_at` ΜΠΗΚΕ ΜΕ ΤΟΝ ΕΛΕΓΧΟ ΔΙΕΙΣΔΥΣΗΣ (20260723100000) ΚΑΙ ΕΧΕΙ
 * ΝΟΗΜΑ ΜΟΝΟ ΑΝ ΤΟ ΚΟΙΤΑΞΕΙ ΚΑΠΟΙΟΣ. Δύο χρόνια ζωής ανά διεύθυνση: ένα
 * κουπόνι που διέρρευσε σταματά μόνο του, ακόμη κι αν ο ιδιοκτήτης δεν το
 * ακύρωσε ποτέ. Οι παλιές γραμμές με `null` δεν λήγουν, όπως το όρισε εκείνη η
 * μετανάστευση.
 */
export const feedExpired = (row: FeedOwner | null, now = Date.now()): boolean =>
  !!row?.expires_at && Date.parse(row.expires_at) <= now;

/**
 * Η διεύθυνση που προστίθεται στο ημερολόγιο του χρήστη.
 *
 * ΤΟ `webcal://` ΕΙΝΑΙ ΤΟ ΜΙΣΟ ΤΗΣ ΔΟΥΛΕΙΑΣ. Με `https`, το πάτημα κατεβάζει
 * ΕΝΑ αρχείο και το ημερολόγιο δεν ξαναρωτά ποτέ: οι προθεσμίες παγώνουν στη
 * μέρα που προστέθηκαν. Με `webcal`, το λειτουργικό ανοίγει το ημερολόγιο και
 * γράφει ΣΥΝΔΡΟΜΗ, που ανανεώνεται μόνη της. Ιδια διεύθυνση, άλλο πρωτόκολλο.
 */
export const feedUrl = (token: string | null | undefined): string =>
  token ? siteUrl(`/imerologio/${token}.ics`) : '';

export const feedSubscribeUrl = (token: string | null | undefined): string =>
  feedUrl(token).replace(/^https?:/, 'webcal:');

/** Η συνδρομή του συνδεδεμένου, ή τίποτα όταν δεν έχει γεννηθεί. */
export async function feed(db: Db, userId: string): Promise<ReadOneResult<FeedRow>> {
  return readOne<FeedRow>(db.from(TABLE).select('token').eq('user_id', userId).maybeSingle());
}

/** Σε ποιον ανήκει ένα κουπόνι. ΜΟΝΟ για τον διακομιστή. */
export async function ownerOfToken(db: Db, token: string): Promise<ReadOneResult<FeedOwner>> {
  return readOne<FeedOwner>(db.from(TABLE).select('user_id,expires_at').eq('token', token).maybeSingle());
}

/** Νέα διεύθυνση, όταν η παλιά έφυγε σε συσκευή που δεν ελέγχουμε πια. */
export async function rotate(db: Db): Promise<{ token: string | null; error: DbError | null }> {
  const { data, error } = await db.rpc('rotate_calendar_feed');
  return { token: typeof data === 'string' ? data : null, error: error as DbError | null };
}
