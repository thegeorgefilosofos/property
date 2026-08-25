// ═══════════════════════════════════════════════════════════════════════════
// Η ΥΠΟΓΡΑΦΗ ΤΟΥ ΤΑΧΥΔΡΟΜΕΙΟΥ
// ─────────────────────────────────────────────────────────────────────────
// Η διαδρομή που παραλαμβάνει τα εισερχόμενα μηνύματα είναι δημόσια. Χωρίς
// έλεγχο, οποιοσδήποτε θα μπορούσε να της στείλει «ήρθε λογαριασμός 4.000 €
// για τον χρήστη Χ» — και το κουπόνι της διεύθυνσης δεν αρκεί: ταξιδεύει σε
// κάθε κεφαλίδα κάθε προωθημένου μηνύματος.
//
// ΤΟ ΣΧΗΜΑ ΔΕΝ ΤΟ ΕΠΙΝΟΟΥΜΕ. Είναι το Standard Webhooks, αυτό που στέλνει ο
// πάροχος: κεφαλίδες `webhook-id`, `webhook-timestamp`, `webhook-signature`
// (και τα ίδια με πρόθεμα `svix-`, από την προηγούμενη ονομασία τους). Το
// μυστικό είναι `whsec_` + base64. Υπογράφεται η συμβολοσειρά
// «αναγνωριστικό.χρονοσήμανση.σώμα», με HMAC-SHA256 και το αποτέλεσμα
// γράφεται σε base64 δίπλα στην έκδοση: `v1,<υπογραφή>`.
//
// ── ΤΕΣΣΕΡΑ ΣΗΜΕΙΑ ΠΟΥ ΚΡΙΝΟΥΝ ───────────────────────────────────────────
//
// ΤΟ ΣΩΜΑ ΕΙΝΑΙ ΤΟ ΩΜΟ. Ενα `JSON.parse` και ξανά `stringify` αλλάζει κενά·
// η σύνοψη βγαίνει άλλη και κάθε γνήσιο μήνυμα απορρίπτεται.
//
// Η ΧΡΟΝΟΣΗΜΑΝΣΗ ΕΛΕΓΧΕΤΑΙ. Χωρίς αυτήν, μια υπογραφή που κάποιος κατέγραψε
// κάποτε ισχύει για πάντα και το ίδιο μήνυμα ξαναπαίζεται όποτε θέλει.
// Ανοχή πέντε λεπτά προς τις δύο κατευθύνσεις, όσο και ο αποστολέας.
//
// ΟΙ ΥΠΟΓΡΑΦΕΣ ΕΙΝΑΙ ΠΟΛΛΕΣ. Στην περιστροφή μυστικού ο πάροχος στέλνει και
// την παλιά και τη νέα, χωρισμένες με κενό. Αρκεί μία να ταιριάζει.
//
// Η ΣΥΓΚΡΙΣΗ ΕΙΝΑΙ ΣΤΑΘΕΡΟΥ ΧΡΟΝΟΥ και τα μήκη ελέγχονται ΠΡΙΝ: η
// `timingSafeEqual` πετάει σε άνισα μήκη και μια εξαίρεση μέσα στον έλεγχο
// ασφαλείας γίνεται 500 αντί για 401.
// ═══════════════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Οι τρεις κεφαλίδες, με τα δύο ονόματα που κυκλοφορούν για την καθεμία. */
export const ID_HEADERS = ['webhook-id', 'svix-id'] as const;
export const TIMESTAMP_HEADERS = ['webhook-timestamp', 'svix-timestamp'] as const;
export const SIGNATURE_HEADERS = ['webhook-signature', 'svix-signature'] as const;

/** Η μεταβλητή με το μυστικό υπογραφής. Ορίζεται ΜΟΝΟ στον διακομιστή. */
export const SECRET_ENV = 'RESEND_WEBHOOK_SECRET';

/** Οση ανοχή δέχεται και ο αποστολέας: πέντε λεπτά. */
export const TOLERANCE_SECONDS = 5 * 60;

const PREFIX = 'whsec_';

/** Ο,τι ξέρει η διαδρομή για τις κεφαλίδες: όνομα σε πεζά, τιμή ή τίποτα. */
export type Headers = { get(name: string): string | null };

const pick = (h: Headers, names: readonly string[]): string =>
  (names.map(n => h.get(n)).find(v => (v || '').trim()) || '').trim();

/** Τα ψηφία του μυστικού, ή κενό buffer όταν δεν είναι μυστικό. */
function keyOf(secret: string | undefined): Buffer {
  const raw = (secret || '').trim();
  const body = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : raw;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return Buffer.alloc(0);
  const key = Buffer.from(body, 'base64');
  // Μυστικό μικρότερο από 128 δυαδικά δεν είναι μυστικό. Και ένα κενό κλειδί
  // θα παρήγαγε έγκυρη σύνοψη, δηλαδή έλεγχο που περνούν όλοι.
  return key.length >= 16 ? key : Buffer.alloc(0);
}

/** Η αναμενόμενη υπογραφή για αυτά τα τρία, σε base64. */
export function sign(key: Buffer, id: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`, 'utf8').digest('base64');
}

const same = (a: string, b: string): boolean => {
  // Το μήκος ελέγχεται ΠΡΙΝ: η `timingSafeEqual` πετάει σε άνισα buffer.
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
};

/**
 * Ηρθε αυτό το σώμα από τον πάροχο, τώρα;
 *
 * @param rawBody Το σώμα ΑΚΡΙΒΩΣ όπως ήρθε.
 * @param headers Οι κεφαλίδες του αιτήματος.
 * @param secret  Το μυστικό υπογραφής, από το περιβάλλον.
 * @param nowMs   Η ώρα, ως όρισμα ώστε ο έλεγχος να είναι ελέγξιμος.
 */
export function verifySignature(
  rawBody: string, headers: Headers, secret: string | undefined, nowMs: number = Date.now(),
): boolean {
  const key = keyOf(secret);
  if (!key.length) return false;

  const id = pick(headers, ID_HEADERS);
  const ts = pick(headers, TIMESTAMP_HEADERS);
  const sigHeader = pick(headers, SIGNATURE_HEADERS);
  if (!id || !ts || !sigHeader) return false;

  if (!/^\d{1,15}$/.test(ts)) return false;
  const drift = Math.abs(Math.floor(nowMs / 1000) - Number(ts));
  if (drift > TOLERANCE_SECONDS) return false;

  const expected = sign(key, id, ts, rawBody);
  for (const part of sigHeader.split(' ')) {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) continue;
    if (same(value, expected)) return true;
  }
  return false;
}
