// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΣΩΜΑ ΤΟΥ ΜΗΝΥΜΑΤΟΣ ΖΗΤΙΕΤΑΙ, ΔΕΝ ΠΑΡΑΛΑΜΒΑΝΕΤΑΙ
// ─────────────────────────────────────────────────────────────────────────
// Το γεγονός `email.received` κουβαλά μεταδεδομένα: αποστολέα, παραλήπτες,
// θέμα, πλήθος συνημμένων. ΟΧΙ κείμενο. Το κείμενο ζητιέται με το `email_id`,
// από τη διεύθυνση `/emails/receiving/{id}` του παρόχου, με το δικό μας κλειδί.
//
// ΚΑΙ ΕΙΝΑΙ ΚΑΛΥΤΕΡΑ ΕΤΣΙ. Το σώμα του webhook είναι ό,τι μας έστειλε κάποιος
// από έξω· η απάντηση σε αυτή την κλήση είναι ό,τι μας λέει ο πάροχος όταν τον
// ρωτάμε εμείς. Τα ποσά που θα μπουν στα βιβλία βγαίνουν από το δεύτερο.
//
// ΤΟ ΚΛΕΙΔΙ ΔΕΝ ΓΡΑΦΕΤΑΙ ΕΔΩ. Ερχεται ως όρισμα, από μεταβλητή περιβάλλοντος.
// ═══════════════════════════════════════════════════════════════════════════

/** Η ρίζα του παρόχου. Μία φορά, ώστε να μη γραφτεί σε δεύτερο σημείο. */
export const API_ROOT = 'https://api.resend.com';

/** Η μεταβλητή με το κλειδί του παρόχου. */
export const KEY_ENV = 'RESEND_API_KEY';

/** Η διεύθυνση ενός παραληφθέντος μηνύματος. */
export const receivingUrl = (emailId: string): string =>
  `${API_ROOT}/emails/receiving/${encodeURIComponent(emailId)}`;

/** Το σώμα, όπως το επιστρέφει ο πάροχος. Ο,τι δεν είναι κείμενο γίνεται `null`. */
export interface FetchedBody { text: string | null; html: string | null }

export type BodyResult =
  | { ok: true; body: FetchedBody }
  | { ok: false; reason: string };

const asTextOrNull = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;

/**
 * Το κείμενο ενός μηνύματος από τον πάροχο.
 *
 * @param fetcher Δίνεται ως όρισμα ώστε ο έλεγχος να μη χτυπά δίκτυο.
 */
export async function fetchBody(
  emailId: string, apiKey: string | undefined, fetcher: typeof fetch = fetch,
): Promise<BodyResult> {
  const key = (apiKey || '').trim();
  if (!key) return { ok: false, reason: 'χωρίς κλειδί παρόχου' };

  let res: Response;
  try {
    res = await fetcher(receivingUrl(emailId), {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
  } catch {
    // Η ΑΙΤΙΑ ΔΕΝ ΤΑΞΙΔΕΥΕΙ. Το μήνυμα ενός σφάλματος δικτύου κουβαλά συχνά τη
    // διεύθυνση και την υποδομή· ο καλών χρειάζεται μόνο «δεν απάντησε».
    return { ok: false, reason: 'ο πάροχος δεν απάντησε' };
  }
  if (!res.ok) return { ok: false, reason: `ο πάροχος απάντησε ${res.status}` };

  let payload: unknown;
  try { payload = await res.json(); } catch { return { ok: false, reason: 'η απάντηση δεν ήταν JSON' }; }

  const data = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {};
  return { ok: true, body: { text: asTextOrNull(data.text), html: asTextOrNull(data.html) } };
}
