// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΓΕΓΟΝΟΣ «ΗΡΘΕ ΜΗΝΥΜΑ», ΔΙΑΒΑΣΜΕΝΟ ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// Ο πάροχος στέλνει `email.received` με ΜΕΤΑΔΕΔΟΜΕΝΑ: ποιος έστειλε, σε ποιους
// έφτασε, τι θέμα έχει, πόσα συνημμένα — και ΟΧΙ το σώμα. Το κείμενο ζητιέται
// χωριστά, με το `email_id` που δίνει εδώ.
//
// Αυτό δεν είναι παράλειψη του παρόχου, είναι ο λόγος που η διαδρομή μας δεν
// εμπιστεύεται ποτέ το σώμα του webhook για περιεχόμενο: ό,τι μπαίνει στα
// βιβλία έρχεται από κλήση ΜΑΣ προς αυτόν, με το δικό μας κλειδί.
//
// ΤΡΕΙΣ ΛΙΣΤΕΣ ΠΑΡΑΛΗΠΤΩΝ, ΚΑΙ ΟΙ ΤΡΕΙΣ ΜΕΤΡΑΝΕ. Το `to` είναι όσα έγραψε ο
// αποστολέας, το `received_for` όσα παρέλαβε πραγματικά ο διακομιστής (εκεί
// φαίνεται η διεύθυνσή μας όταν το μήνυμα προωθήθηκε), και το `cc` όταν ο
// ιδιοκτήτης μας έβαλε σε κοινοποίηση αντί για παραλήπτη. Οποια από τις τρεις
// αγνοούσαμε, θα ήταν ένας τρόπος χρήσης που «απλώς δεν δουλεύει».
//
// ΤΟ «ΔΕΝ ΔΙΑΒΑΣΤΗΚΕ» ΔΕΝ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΜΕ ΤΟ «ΔΕΝ ΜΑΣ ΑΦΟΡΑ». Γεγονός άλλου
// τύπου (παράδοση, άνοιγμα, απόρριψη) είναι φυσιολογικό και παίρνει 200.
// Γεγονός ΠΑΡΑΛΑΒΗΣ που δεν διαβάστηκε είναι δικό μας πρόβλημα και πρέπει να
// φανεί στον πίνακα του παρόχου, ώστε να ξαναδοκιμαστεί.
// ═══════════════════════════════════════════════════════════════════════════

/** Ο τύπος γεγονότος που μας αφορά, όπως τον ονομάζει ο πάροχος. */
export const EVENT_TYPE = 'email.received';

/** Οσα ξέρουμε για το μήνυμα πριν ζητήσουμε το σώμα του. */
export interface ReceivedEvent {
  /** Το αναγνωριστικό με το οποίο ζητιέται το σώμα, και που κάνει την εγγραφή ιδιοδύναμη. */
  emailId: string;
  from: string;
  subject: string;
  /** `to`, `cc` και `received_for` μαζί, χωρίς διπλά. */
  recipients: string[];
  attachments: number;
}

export type EventRead =
  | { ok: true; event: ReceivedEvent }
  | { ok: false; reason: string; ours: boolean };

const asRecord = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};

const asText = (v: unknown): string => typeof v === 'string' ? v.trim() : '';

const asList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(s => s.trim()).filter(Boolean) : [];

/** Το γεγονός, ή ο λόγος που δεν διαβάστηκε. */
export function readReceivedEvent(payload: unknown): EventRead {
  const top = asRecord(payload);
  const type = asText(top.type);
  if (type !== EVENT_TYPE) return { ok: false, reason: `τύπος «${type || 'χωρίς τύπο'}»`, ours: false };

  const data = asRecord(top.data);
  const emailId = asText(data.email_id);
  if (!emailId) return { ok: false, reason: 'χωρίς email_id', ours: true };

  const recipients = [...new Set([...asList(data.to), ...asList(data.cc), ...asList(data.received_for)])];
  if (!recipients.length) return { ok: false, reason: 'χωρίς παραλήπτη', ours: true };

  return {
    ok: true,
    event: {
      emailId,
      from: asText(data.from),
      subject: asText(data.subject),
      recipients,
      attachments: Array.isArray(data.attachments) ? data.attachments.length : 0,
    },
  };
}
