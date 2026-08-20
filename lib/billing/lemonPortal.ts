// ═══════════════════════════════════════════════════════════════════════════
// Ο ΣΥΝΔΕΣΜΟΣ ΤΗΣ ΠΥΛΗΣ, ΖΗΤΗΜΕΝΟΣ ΤΗ ΣΤΙΓΜΗ ΠΟΥ ΧΡΕΙΑΖΕΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// Η ανάγνωση της απάντησης ζει ΧΩΡΙΣΤΑ από τη διαδρομή, για τον ίδιο λόγο που
// ζει χωριστά κάθε ανάγνωση αυτού του φακέλου: μπορεί να ελεγχθεί χωρίς δίκτυο,
// και ένα σχήμα που άλλαξε πιάνεται από έλεγχο αντί από πελάτη.
//
// ΤΟ ΣΧΗΜΑ ΔΕΝ ΘΕΩΡΕΙΤΑΙ ΔΕΔΟΜΕΝΟ. Ο έμπορος απαντά JSON:API, δηλαδή
// `data.attributes.urls.customer_portal`. Καθένα από τα τέσσερα επίπεδα μπορεί
// να λείπει — και ένα `undefined` που φτάνει στην οθόνη ως σύνδεσμος είναι
// κουμπί που πάει στο πουθενά.
// ═══════════════════════════════════════════════════════════════════════════

/** Το κλειδί του API. Μυστικό: ζει ΜΟΝΟ σε μεταβλητή περιβάλλοντος. */
export const API_KEY_ENV = 'LEMON_SQUEEZY_API_KEY';

const ENDPOINT = 'https://api.lemonsqueezy.com/v1/subscriptions/';

export interface PortalResult {
  /** Ο σύνδεσμος, ή `null` όταν ο έμπορος δεν έδωσε. */
  url: string | null;
  /** Τι πήγε στραβά, με λόγια για τα αρχεία καταγραφής. Κενό όταν όλα καλά. */
  error: string;
}

/**
 * Ο σύνδεσμος πύλης μέσα σε μια απάντηση του εμπόρου.
 *
 * ΔΕΧΕΤΑΙ ΜΟΝΟ `https://`. Ενα σχετικό ή `javascript:` URL που θα ερχόταν από
 * αλλού καταλήγει σε `window.location.href` του περιηγητή· ο έλεγχος είναι
 * φθηνός και το εναλλακτικό είναι ανοιχτή ανακατεύθυνση.
 */
export function readPortalUrl(payload: unknown): string | null {
  const data = (payload as { data?: unknown } | null)?.data;
  const attrs = (data as { attributes?: unknown } | null)?.attributes;
  const urls = (attrs as { urls?: unknown } | null)?.urls;
  const raw = (urls as { customer_portal?: unknown } | null)?.customer_portal;
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  return /^https:\/\/[^/\s]+/.test(url) ? url : null;
}

/** Ρωτά τον έμπορο για φρέσκο σύνδεσμο πύλης. */
export async function portalUrlOf(
  subscriptionId: string, apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<PortalResult> {
  try {
    const res = await fetcher(ENDPOINT + encodeURIComponent(subscriptionId), {
      headers: { Accept: 'application/vnd.api+json', Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    if (!res.ok) return { url: null, error: `ο έμπορος απάντησε ${res.status}` };
    return { url: readPortalUrl(await res.json()), error: '' };
  } catch (e) {
    return { url: null, error: e instanceof Error ? e.message : 'σφάλμα δικτύου' };
  }
}
