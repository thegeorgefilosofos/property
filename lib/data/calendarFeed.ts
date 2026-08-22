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
import type { CalendarFeedsRow } from '@/lib/supabase/tables';
import type { DbError } from '@/lib/supabase/writeResult';
import { readOne, type ReadOneResult } from './read';
import { siteUrl } from '@/lib/core/site';

const TABLE = 'calendar_feeds';

export type Db = SupabaseClient;

export type FeedRow = Pick<CalendarFeedsRow, 'token' | 'active'>;
export type FeedOwner = Pick<CalendarFeedsRow, 'user_id' | 'active'>;

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
  return readOne<FeedRow>(db.from(TABLE).select('token,active').eq('user_id', userId).maybeSingle());
}

/** Σε ποιον ανήκει ένα κουπόνι. ΜΟΝΟ για τον διακομιστή. */
export async function ownerOfToken(db: Db, token: string): Promise<ReadOneResult<FeedOwner>> {
  return readOne<FeedOwner>(db.from(TABLE).select('user_id,active').eq('token', token).maybeSingle());
}

/** Νέα διεύθυνση, όταν η παλιά έφυγε σε συσκευή που δεν ελέγχουμε πια. */
export async function rotate(db: Db): Promise<{ token: string | null; error: DbError | null }> {
  const { data, error } = await db.rpc('rotate_calendar_feed');
  return { token: typeof data === 'string' ? data : null, error: error as DbError | null };
}
