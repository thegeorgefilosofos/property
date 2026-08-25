// ═══════════════════════════════════════════════════════════════════════════
// ΟΙ ΣΥΣΚΕΥΕΣ ΠΟΥ ΔΕΧΟΝΤΑΙ ΕΙΔΟΠΟΙΗΣΕΙΣ ΕΧΟΥΝ ΕΝΑ ΣΠΙΤΙ
// ─────────────────────────────────────────────────────────────────────────
// Δύο πλευρές: η οθόνη που ανάβει και σβήνει τον διακόπτη σε ΑΥΤΗ τη συσκευή,
// και ο αποστολέας που διαβάζει όλες τις συσκευές όλων και καθαρίζει τις
// νεκρές. Η δεύτερη τρέχει με τον πελάτη υπηρεσίας· η πρώτη με την ταυτότητα
// του χρήστη και η RLS κρίνει.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PushSubscriptionsRow } from '@/lib/supabase/tables';
import type { DbError } from '@/lib/supabase/writeResult';
import { read, type ReadResult } from './read';
import type { DeviceSubscription } from '@/lib/push/subscription';

const TABLE = 'push_subscriptions';

export type Db = SupabaseClient;

/** Οσα χρειάζεται ο αποστολέας για να στείλει και να καθαρίσει. */
export const SEND_COLUMNS = 'id,user_id,endpoint,p256dh,auth,last_sent_at,failures';

export type SendRow = Pick<PushSubscriptionsRow,
  'id' | 'user_id' | 'endpoint' | 'p256dh' | 'auth' | 'last_sent_at' | 'failures'>;

/**
 * Γράφει τη συνδρομή ΑΥΤΗΣ της συσκευής.
 *
 * ΤΟ `endpoint` ΕΙΝΑΙ Η ΤΑΥΤΟΤΗΤΑ ΤΗΣ ΣΥΣΚΕΥΗΣ, ΟΧΙ ΤΟ `id`. Ο περιηγητής
 * ανανεώνει τα κλειδιά της ίδιας συνδρομής χωρίς να το πει σε κανέναν: με
 * `insert` θα μαζεύαμε διπλές γραμμές για το ίδιο τηλέφωνο και θα του
 * στέλναμε την ίδια ειδοποίηση δύο φορές.
 */
export async function save(
  db: Db, userId: string, sub: DeviceSubscription, userAgent?: string | null,
): Promise<{ error: DbError | null }> {
  const { error } = await db.from(TABLE).upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    user_agent: (userAgent || '').slice(0, 300) || null,
  }, { onConflict: 'endpoint' });
  return { error: error as DbError | null };
}

/** Σβήνει τη συνδρομή αυτής της συσκευής. */
export async function remove(db: Db, endpoint: string): Promise<{ error: DbError | null }> {
  const { error } = await db.from(TABLE).delete().eq('endpoint', endpoint);
  return { error: error as DbError | null };
}

/** Δέχεται ήδη ειδοποιήσεις αυτή η συσκευή; */
export async function has(db: Db, userId: string, endpoint: string): Promise<boolean> {
  const { count } = await db.from(TABLE).select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('endpoint', endpoint);
  return (count ?? 0) > 0;
}

/** Ολες οι συσκευές που δέχονται, για τον αποστολέα. ΜΟΝΟ με πελάτη υπηρεσίας. */
export async function all(db: Db): Promise<ReadResult<SendRow>> {
  return read<SendRow>(db.from(TABLE).select(SEND_COLUMNS).order('user_id'));
}

/** Η αποστολή πέτυχε: σημειώνεται η ώρα και μηδενίζονται οι αποτυχίες. */
export function markSent(db: Db, id: string): PromiseLike<{ error: DbError | null }> {
  return db.from(TABLE).update({ last_sent_at: new Date().toISOString(), failures: 0 }).eq('id', id);
}

/**
 * Η συνδρομή πέθανε: την έσβησε ο χρήστης, καθάρισε τον περιηγητή, άλλαξε
 * τηλέφωνο. Η υπηρεσία απαντά 404 ή 410 και η γραμμή φεύγει — αλλιώς
 * στέλνουμε για πάντα σε διεύθυνση που δεν υπάρχει.
 */
export function drop(db: Db, id: string): PromiseLike<{ error: DbError | null }> {
  return db.from(TABLE).delete().eq('id', id);
}

/** Απέτυχε για άλλον λόγο (δίκτυο, όριο): μετριέται, δεν σβήνεται. */
export function markFailure(db: Db, id: string, failures: number): PromiseLike<{ error: DbError | null }> {
  return db.from(TABLE).update({ failures: failures + 1 }).eq('id', id);
}
