// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΠΟΡΤΑ ΠΡΟΣ ΤΟΝ ΕΜΠΟΡΟ
// ─────────────────────────────────────────────────────────────────────────
// Τρία πράγματα μιλούν πλέον στο API του εμπόρου: το ταμείο, η πύλη
// διαχείρισης, και η αλλαγή πακέτου. Καθένα τους χρειάζεται το ίδιο κλειδί,
// τις ίδιες κεφαλίδες, την ίδια μεταχείριση σφάλματος — και τρία αντίγραφα
// αυτών θα απέκλιναν στην πρώτη αλλαγή.
//
// ── Ο ΠΕΛΑΤΗΣ ΕΓΧΕΕΤΑΙ, ΓΙΑΤΙ ΑΛΛΙΩΣ ΔΕΝ ΕΛΕΓΧΕΤΑΙ ΤΙΠΟΤΑ ────────────────
// Καθε συνάρτηση εδώ δέχεται `fetcher`. Χωρίς αυτό, ο μόνος τρόπος να δοκιμάσει
// κανείς αν στέλνουμε το σωστό σώμα θα ήταν να χρεώσει πραγματική κάρτα.
//
// ── ΤΟ ΚΛΕΙΔΙ ΤΑΞΙΔΕΥΕΙ ΩΣ ΚΕΦΑΛΙΔΑ, ΠΟΤΕ ΣΤΗ ΔΙΕΥΘΥΝΣΗ ──────────────────
// Οι διευθύνσεις καταλήγουν σε αρχεία καταγραφής ενδιάμεσων, σε ιστορικό
// περιηγητή και σε αναφορές σφαλμάτων. Το κλειδί δίνει πρόσβαση σε κάθε πελάτη
// και κάθε συνδρομή του καταστήματος.
// ═══════════════════════════════════════════════════════════════════════════

const BASE = 'https://api.lemonsqueezy.com';

/** Το κλειδί του API. Μυστικό: ζει ΜΟΝΟ σε μεταβλητή περιβάλλοντος. */
export const API_KEY_ENV = 'LEMON_SQUEEZY_API_KEY';
/** Το κατάστημα. Δημόσιος αριθμός, αλλά χωρίς αυτόν δεν φτιάχνεται ταμείο. */
export const STORE_ENV = 'LEMON_STORE_ID';

export type BillingEnv = Record<string, string | undefined>;

export interface ApiResult {
  /** Το σώμα της απάντησης, όταν όλα πήγαν καλά. */
  json: unknown;
  /** Τι πήγε στραβά, με λόγια για τα αρχεία καταγραφής. Κενό όταν όλα καλά. */
  error: string;
}

export interface ApiCall {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  apiKey: string;
  fetcher?: typeof fetch;
}

/**
 * Ενα αίτημα προς τον έμπορο.
 *
 * ΤΟ ΣΦΑΛΜΑ ΕΠΙΣΤΡΕΦΕΤΑΙ, ΔΕΝ ΠΕΤΑΓΕΤΑΙ. Ο καλών είναι πάντα διαδρομή HTTP που
 * πρέπει να απαντήσει κάτι στον χρήστη· μια εξαίρεση εκεί γίνεται 500 χωρίς
 * μήνυμα, ενώ η αλήθεια («ο έμπορος απάντησε 422») χωράει σε μια πρόταση.
 */
export async function lemonRequest(call: ApiCall): Promise<ApiResult> {
  const f = call.fetcher ?? fetch;
  try {
    const res = await f(BASE + call.path, {
      method: call.method ?? 'GET',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${call.apiKey}`,
      },
      ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
      cache: 'no-store',
    });
    if (!res.ok) {
      // Το σώμα του σφάλματος του εμπόρου λέει ΠΟΙΟ πεδίο έφταιξε. Χωρίς αυτό,
      // ένα 422 σε ρύθμιση οκτώ παραλλαγών είναι κυνήγι στα τυφλά.
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch { /* το σώμα δεν διαβάστηκε */ }
      return { json: null, error: `ο έμπορος απάντησε ${res.status}${detail ? `: ${detail}` : ''}` };
    }
    return { json: await res.json(), error: '' };
  } catch (e) {
    return { json: null, error: e instanceof Error ? e.message : 'σφάλμα δικτύου' };
  }
}

/**
 * Η συνδρομή, όπως τη βλέπει ΤΩΡΑ ο έμπορος.
 *
 * ΓΙΑΤΙ ΡΩΤΑΜΕ ΑΝΤΙ ΝΑ ΔΙΑΒΑΣΟΥΜΕ ΤΗ ΔΙΚΗ ΜΑΣ ΓΡΑΜΜΗ. Το προφίλ μας γράφεται
 * από τον webhook, δηλαδή είναι όσο φρέσκο πρόλαβε να γίνει. Οταν πρόκειται να
 * αλλάξουμε πακέτο —πράξη που χρεώνει κάρτα— η κατάσταση και η ημερομηνία
 * ανανέωσης πρέπει να είναι του ΕΜΠΟΡΟΥ: ένα καθυστερημένο «δοκιμή» στη δική
 * μας πλευρά θα στελνε αναβάθμιση χωρίς χρέωση σε κάποιον που ήδη πληρώνει.
 *
 * Η ΑΝΑΓΝΩΣΗ ΤΗΣ ΑΠΑΝΤΗΣΗΣ ΔΕΝ ΖΕΙ ΕΔΩ. Εδώ ζει μόνο η κλήση, γιατί τη
 * μοιράζονται δύο πράγματα που διαβάζουν ΑΛΛΑ πεδία της ίδιας απάντησης: η
 * πύλη διαχείρισης (σύνδεσμος) και η αλλαγή πακέτου (κατάσταση, ημερομηνίες).
 */
export const subscriptionOf = (
  subscriptionId: string, apiKey: string, fetcher?: typeof fetch,
): Promise<ApiResult> => lemonRequest({
  path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, apiKey, fetcher,
});

/** Τι λείπει για να μιλήσουμε στον έμπορο. Κενό σημαίνει «τίποτα». */
export function apiConfigError(env: BillingEnv = process.env): string {
  const missing: string[] = [];
  if (!(env[API_KEY_ENV] || '').trim()) missing.push(API_KEY_ENV);
  // ΤΟ ΚΑΤΑΣΤΗΜΑ ΕΙΝΑΙ ΑΡΙΘΜΟΣ. Ενα αντιγραμμένο όνομα («PropertyOS») περνά
  // αθόρυβα ως συμβολοσειρά και ο έμπορος απαντά 404 σε κάθε ταμείο.
  const store = (env[STORE_ENV] || '').trim();
  if (!store) missing.push(STORE_ENV);
  else if (!/^\d+$/.test(store)) return `Η ${STORE_ENV} πρέπει να είναι αριθμός, όχι «${store}».`;
  return missing.length ? `Λείπουν οι μεταβλητές: ${missing.join(', ')}.` : '';
}

/** Το αναγνωριστικό καταστήματος, καθαρό. Κενό όταν λείπει ή δεν είναι αριθμός. */
export const storeId = (env: BillingEnv = process.env): string => {
  const v = (env[STORE_ENV] || '').trim();
  return /^\d+$/.test(v) ? v : '';
};
