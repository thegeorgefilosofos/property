// ═══════════════════════════════════════════════════════════════════════════
// Ο ΣΥΝΔΕΣΜΟΣ ΤΟΥ ΛΟΓΙΣΤΗ: ΜΙΑ ΑΛΗΘΕΙΑ, ΔΥΟ ΟΘΟΝΕΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΥΠΗΡΧΕ. Ο ΙΔΙΟΣ σύνδεσμος γεννιόταν από δύο σημεία, με δύο υλοποιήσεις που
// είχαν αποκλίνει:
//
//   Λογιστική  →  upsert με `expires_at` ρητά ανανεωμένο, με περιστροφή token
//   Ρυθμίσεις  →  upsert ΧΩΡΙΣ `expires_at`, χωρίς καμία ανάκληση
//
// Η προεπιλογή της βάσης (`now() + 180 days`) ισχύει ΜΟΝΟ σε insert. Σε update
// δεν εφαρμόζεται. Αρα ο σύνδεσμος που «δημιουργούσες» από τις Ρυθμίσεις μετά
// τις 180 ημέρες έβγαινε ήδη ληγμένος: η οθόνη έλεγε «Αντιγράφηκε», ο ιδιοκτήτης
// τον έστελνε και ο λογιστής έβλεπε «Ο σύνδεσμος δεν είναι έγκυρος». Κανένα
// μήνυμα, καμία εξήγηση, δύο άνθρωποι να ψάχνουν τι φταίει.
//
// ΚΑΙ ΚΑΤΙ ΠΟΥ ΕΛΕΙΠΕ ΚΑΙ ΑΠΟ ΤΙΣ ΔΥΟ: ΤΟ ΣΒΗΣΙΜΟ. Το κουμπί «Ανάκληση» της
// Λογιστικής ΠΕΡΙΣΤΡΕΦΕΙ το token — σκοτώνει τον παλιό σύνδεσμο και γεννά
// αμέσως καινούριο, ζωντανό. Είναι σωστό όταν αλλάζεις λογιστή. Δεν είναι
// ανάκληση όταν θέλεις απλώς να ΣΤΑΜΑΤΗΣΕΙ η πρόσβαση: μέχρι σήμερα δεν υπήρχε
// κανένας τρόπος να κλείσει η πύλη, μόνο να αλλάξει κλειδαριά.
//
// ΤΡΕΙΣ ΠΡΑΞΕΙΣ, ΜΕ ΤΑ ΟΝΟΜΑΤΑ ΤΟΥΣ:
//   issue()   δημιουργία ή ανανέωση — πάντα με νέα λήξη
//   rotate()  νέο token, ο παλιός πεθαίνει, ο νέος ζει (αλλαγή λογιστή)
//   revoke()  active = false — η πύλη κλείνει και δεν ανοίγει άλλη
//
// Και οι τρεις γράφουν ρητά ό,τι πρέπει να γραφτεί. Καμία σιωπηλή προεπιλογή.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from '@supabase/supabase-js';
import { row as readRow } from './read';
import { siteUrl } from '@/lib/core/site';

const TABLE = 'accountant_links';

/**
 * Πόσο ζει ο σύνδεσμος. Ιδια διάρκεια με την προεπιλογή της βάσης, γραμμένη και
 * εδώ γιατί η ανανέωση γίνεται από τον πελάτη και η προεπιλογή δεν την πιάνει.
 */
export const ACCOUNTANT_LINK_DAYS = 180;

const expiry = () => new Date(Date.now() + ACCOUNTANT_LINK_DAYS * 86400000).toISOString();

export interface AccountantLink {
  token: string;
  /** Πλήρης διεύθυνση, έτοιμη για αντιγραφή. */
  url: string;
  expiresAt: string | null;
  /** Ζει ακόμη; Ενεργός ΚΑΙ μη ληγμένος — ο ίδιος έλεγχος με τη βάση. */
  live: boolean;
}

type Row = { token: string; active: boolean | null; expires_at: string | null };

/**
 * Η ΔΙΕΥΘΥΝΣΗ ΤΟΥ ΠΡΟΪΟΝΤΟΣ, ΟΧΙ ΤΟΥ ΠΕΡΙΗΓΗΤΗ.
 *
 * Χτιζόταν από το `window.location.origin`, δηλαδή από ό,τι έτυχε να γράφει η
 * μπάρα διευθύνσεων τη στιγμή της αντιγραφής. Ενας ιδιοκτήτης που άνοιξε την
 * εφαρμογή από τη διεύθυνση προεπισκόπησης του Vercel, ή από «www» ενώ ο
 * κανονικός τομέας είναι χωρίς, έστελνε στον λογιστή του σύνδεσμο προς άλλη
 * εγκατάσταση. Ο λογιστής τον άνοιγε και έβλεπε «δεν είναι έγκυρος».
 *
 * Η ίδια σταθερά χτίζει κάθε άλλη δημόσια διεύθυνση της εφαρμογής.
 */
const urlOf = (token: string) => siteUrl(`/accountant/${token}`);

const shape = (row: Row | null | undefined): AccountantLink | null => {
  if (!row?.token) return null;
  const notExpired = !row.expires_at || new Date(row.expires_at).getTime() > Date.now();
  return {
    token: row.token,
    url: urlOf(row.token),
    expiresAt: row.expires_at,
    live: row.active !== false && notExpired,
  };
};

/** Ο σύνδεσμος όπως είναι τώρα, χωρίς να δημιουργηθεί κανένας. */
export async function current(db: SupabaseClient, userId: string): Promise<AccountantLink | null> {
  return shape(await readRow<Row>(
    db.from(TABLE).select('token,active,expires_at').eq('user_id', userId).maybeSingle(),
  ));
}

/**
 * Δημιουργεί τον σύνδεσμο, ή ανανεώνει τη λήξη του υπάρχοντος.
 *
 * Το `expires_at` γράφεται ΠΑΝΤΑ: η προεπιλογή της βάσης δεν εφαρμόζεται σε
 * update και χωρίς αυτή τη γραμμή ένας παλιός σύνδεσμος ξαναμοιραζόταν ληγμένος.
 */
export async function issue(db: SupabaseClient, userId: string): Promise<AccountantLink | null> {
  return shape(await readRow<Row>(
    db.from(TABLE)
      .upsert({ user_id: userId, active: true, expires_at: expiry() }, { onConflict: 'user_id' })
      .select('token,active,expires_at').maybeSingle(),
  ));
}

/**
 * Νέο token: ο παλιός σύνδεσμος πεθαίνει αμέσως και βγαίνει καινούριος.
 *
 * ΤΟ ΚΛΕΙΔΙ ΕΙΝΑΙ ΚΡΥΠΤΟΓΡΑΦΙΚΟ Η ΔΕΝ ΓΙΝΕΤΑΙ ΤΙΠΟΤΑ. Το token δίνει πρόσβαση
 * σε ολόκληρο το χαρτοφυλάκιο· η `Math.random` δεν είναι κρυπτογραφική και η
 * ώρα είναι γνωστή. Καλύτερα να αποτύχει η περιστροφή παρά να γίνει με
 * προβλέψιμο κλειδί και να το πει.
 */
export async function rotate(db: SupabaseClient, userId: string): Promise<AccountantLink | null | 'insecure'> {
  const fresh = globalThis.crypto?.randomUUID?.();
  if (!fresh) return 'insecure';
  return shape(await readRow<Row>(
    db.from(TABLE)
      .upsert({ user_id: userId, token: fresh, active: true, expires_at: expiry() }, { onConflict: 'user_id' })
      .select('token,active,expires_at').maybeSingle(),
  ));
}

/**
 * Κλείνει την πύλη. Ο σύνδεσμος παύει να απαντά και ο λογιστής που τον είχε
 * αξιώσει χάνει και τον χώρο εργασίας του: η `accountant_link_live` απαιτεί
 * ενεργό σύνδεσμο, όχι απλώς ενεργή αξίωση.
 */
export async function revoke(db: SupabaseClient, userId: string): Promise<boolean> {
  const { error } = await db.from(TABLE).update({ active: false }).eq('user_id', userId);
  return !error;
}

/** «έως 14/02/2027», ή κενό όταν δεν υπάρχει λήξη. */
export function expiryLabel(link: AccountantLink | null): string {
  if (!link?.expiresAt) return '';
  return `έως ${new Date(link.expiresAt).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
}
