// ═══════════════════════════════════════════════════════════════════════════
// Ο ΣΥΝΔΕΣΜΟΣ ΤΗΣ ΠΥΛΗΣ, ΖΗΤΗΜΕΝΟΣ ΤΗ ΣΤΙΓΜΗ ΠΟΥ ΧΡΕΙΑΖΕΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// Η ανάγνωση της απάντησης ζει ΧΩΡΙΣΤΑ από τη διαδρομή, για τον ίδιο λόγο που
// ζει χωριστά κάθε ανάγνωση αυτού του φακέλου: μπορεί να ελεγχθεί χωρίς δίκτυο,
// και ένα σχήμα που άλλαξε πιάνεται από έλεγχο αντί από πελάτη.
//
// ΤΟ ΑΙΤΗΜΑ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ. Οι κεφαλίδες, το κλειδί και η μεταχείριση του
// σφάλματος ζουν μία φορά, στο `lemonApi.ts` — τρία αντίγραφά τους (ταμείο,
// πύλη, αλλαγή πακέτου) θα απέκλιναν στην πρώτη αλλαγή.
//
// ΤΟ ΣΧΗΜΑ ΔΕΝ ΘΕΩΡΕΙΤΑΙ ΔΕΔΟΜΕΝΟ. Ο έμπορος απαντά JSON:API, δηλαδή
// `data.attributes.urls.customer_portal`. Καθένα από τα τέσσερα επίπεδα μπορεί
// να λείπει — και ένα `undefined` που φτάνει στην οθόνη ως σύνδεσμος είναι
// κουμπί που πάει στο πουθενά.
// ═══════════════════════════════════════════════════════════════════════════

import { subscriptionOf } from './lemonApi';

export { API_KEY_ENV } from './lemonApi';

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
  subscriptionId: string, apiKey: string, fetcher?: typeof fetch,
): Promise<PortalResult> {
  const { json, error } = await subscriptionOf(subscriptionId, apiKey, fetcher);
  if (error) return { url: null, error };
  return { url: readPortalUrl(json), error: '' };
}
