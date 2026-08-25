// ═══════════════════════════════════════════════════════════════════════════
// ΠΟΙΟΣ ΕΜΠΟΡΟΣ, ΚΑΙ ΠΟΙΟΣ ΤΟ ΑΠΟΦΑΣΙΖΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Μία μεταβλητή, «MERCHANT_PROVIDER». Χωρίς αυτήν ισχύει ο σημερινός πάροχος:
// ένα υπάρχον ανέβασμα δεν αλλάζει συμπεριφορά επειδή προστέθηκε η θύρα.
//
// ΑΓΝΩΣΤΟ ΟΝΟΜΑ ΔΕΝ ΠΕΦΤΕΙ ΣΙΩΠΗΛΑ ΣΤΟΝ ΠΡΟΕΠΙΛΕΓΜΕΝΟ. Ενα τυπογραφικό στη
// μεταβλητή θα σήμαινε ότι η εφαρμογή χρεώνει από άλλον πάροχο απ' ό,τι νομίζει
// όποιος τη ρύθμισε. Πετά, ώστε να φανεί στο πρώτο κιόλας αίτημα.
// ═══════════════════════════════════════════════════════════════════════════
import { lemonPort } from './lemon';
import type { MerchantPort, MerchantId, BillingEnv } from './port';

export * from './port';

/** Ο κατάλογος. Ενας νέος πάροχος μπαίνει εδώ και πουθενά αλλού. */
const PORTS: Record<MerchantId, MerchantPort> = {
  lemon: lemonPort,
};

/** Το όνομα της μεταβλητής που διαλέγει πάροχο. */
export const PROVIDER_ENV = 'MERCHANT_PROVIDER';

/** Ο προεπιλεγμένος: ό,τι τρέχει σήμερα στην παραγωγή. */
export const DEFAULT_PROVIDER: MerchantId = 'lemon';

/** Τα ονόματα που δέχεται η μεταβλητή, για μηνύματα σφάλματος. */
export const KNOWN_PROVIDERS = Object.keys(PORTS) as MerchantId[];

/**
 * Ο έμπορος αυτής της εγκατάστασης.
 *
 * @param env το περιβάλλον, ρητά, ώστε οι σουίτες να μην πειράζουν τη διεργασία
 */
export function merchant(env: BillingEnv = process.env): MerchantPort {
  const raw = (env[PROVIDER_ENV] || '').trim().toLowerCase();
  if (!raw) return PORTS[DEFAULT_PROVIDER];
  const port = PORTS[raw as MerchantId];
  if (!port) {
    throw new Error(
      `Η ${PROVIDER_ENV} λέει «${raw}», που δεν είναι πάροχος που ξέρουμε. `
      + `Δεκτά: ${KNOWN_PROVIDERS.join(', ')}.`,
    );
  }
  return port;
}
