// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΥΝΔΡΟΜΗ ΤΗΣ ΣΥΣΚΕΥΗΣ, ΕΛΕΓΜΕΝΗ ΠΡΙΝ ΜΠΕΙ ΣΤΗ ΒΑΣΗ
// ─────────────────────────────────────────────────────────────────────────
// Ο,ΤΙ ΕΡΧΕΤΑΙ ΑΠΟ ΤΟΝ ΠΕΡΙΗΓΗΤΗ ΕΙΝΑΙ ΕΙΣΟΔΟΣ, ΚΑΙ ΕΛΕΓΧΕΤΑΙ. Η
// `PushSubscription.toJSON()` δίνει ένα αντικείμενο που το γράφουμε αυτούσιο
// σε τρεις στήλες. Χωρίς έλεγχο, μια σπασμένη συνδρομή —κενά κλειδιά, διεύθυνση
// χωρίς https— γράφεται κανονικά και αποτυγχάνει ΣΙΩΠΗΛΑ σε κάθε αποστολή,
// για πάντα.
//
// ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΕΛΕΓΧΟΝΤΑΙ ΚΑΙ ΚΑΝΕΝΑ ΤΕΤΑΡΤΟ:
//
//   Η ΔΙΕΥΘΥΝΣΗ ΕΙΝΑΙ https. Ολες οι υπηρεσίες push είναι https· ένα
//   `http://` ή `javascript:` δεν είναι συνδρομή, είναι κάτι άλλο.
//
//   ΤΑ ΚΛΕΙΔΙΑ ΕΙΝΑΙ base64url ΚΑΙ ΕΧΟΥΝ ΜΗΚΟΣ. Το `p256dh` είναι δημόσιο
//   κλειδί P-256 (65 ψηφία, 87 χαρακτήρες σε base64url) και το `auth` δεκαέξι
//   ψηφία (22 χαρακτήρες). Δεν επιβάλλουμε ακριβές μήκος —οι υλοποιήσεις
//   διαφέρουν σε γεμίσματα— αλλά ένα κενό κλειδί δεν κρυπτογραφεί τίποτα.
//
//   ΤΙΠΟΤΑ ΔΕΝ ΚΟΒΕΤΑΙ ΣΙΩΠΗΛΑ. Μια διεύθυνση 2.000 χαρακτήρων είναι
//   φυσιολογική για κάποιες υπηρεσίες. Κόβοντάς την «για ασφάλεια» θα
//   στέλναμε σε λάθος μέρος.
// ═══════════════════════════════════════════════════════════════════════════

/** Ο,τι δίνει ο περιηγητής, όπως το δίνει. */
export interface RawSubscription {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown } | null;
}

/** Ο,τι κρατά η βάση, ελεγμένο. */
export interface DeviceSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

const text = (v: unknown): string => typeof v === 'string' ? v.trim() : '';

/** Συνδρομή που μπορεί να δεχτεί μήνυμα, ή `null`. */
export function readSubscription(raw: RawSubscription | null | undefined): DeviceSubscription | null {
  const endpoint = text(raw?.endpoint);
  const p256dh = text(raw?.keys?.p256dh);
  const auth = text(raw?.keys?.auth);
  if (!endpoint.startsWith('https://')) return null;
  if (!BASE64URL.test(p256dh) || p256dh.length < 40) return null;
  if (!BASE64URL.test(auth) || auth.length < 16) return null;
  return { endpoint, p256dh, auth };
}

/**
 * Ο διακομιστής της υπηρεσίας push, για τα αρχεία καταγραφής.
 *
 * ΟΛΟΚΛΗΡΗ Η ΔΙΕΥΘΥΝΣΗ ΔΕΝ ΚΑΤΑΓΡΑΦΕΤΑΙ ΠΟΤΕ. Ειναι η μοναδική διεύθυνση της
 * συσκευής ενός ανθρώπου: όποιος τη διαβάσει σε αρχείο καταγραφής μπορεί να
 * του στέλνει. Το «fcm.googleapis.com» λέει ό,τι χρειάζεται για διάγνωση.
 */
export function endpointHost(endpoint: string): string {
  try { return new URL(endpoint).host; } catch { return 'άγνωστος'; }
}
