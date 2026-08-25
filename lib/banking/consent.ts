// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΥΓΚΑΤΑΘΕΣΗ ΛΗΓΕΙ, ΚΑΙ Ο ΧΡΗΣΤΗΣ ΠΡΕΠΕΙ ΝΑ ΤΟ ΜΑΘΕΙ ΠΡΙΝ ΛΗΞΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Το PSD2 δεν επιτρέπει μόνιμη πρόσβαση: ο κάτοχος του λογαριασμού ξανα-
// εξουσιοδοτεί περιοδικά στην τράπεζά του. Η ακριβής διάρκεια ΔΕΝ γράφεται
// εδώ ως αριθμός — τη δίνει ο πάροχος ανά σύνδεση (`consentExpiresAt`), γιατί
// εξαρτάται από το ρυθμιστικό πλαίσιο και από την ίδια την τράπεζα και έχει
// ήδη αλλάξει μία φορά με τροποποίηση των RTS. Ενας αριθμός καρφωμένος εδώ θα
// ήταν λάθος τη μέρα που θα άλλαζε, σιωπηλά.
//
// ΤΙ ΚΡΙΝΕΤΑΙ ΕΔΩ, ΚΑΙ ΓΙΑΤΙ ΕΙΝΑΙ ΚΑΘΑΡΗ ΣΥΝΑΡΤΗΣΗ. Το «λήγει σε πόσες
// ημέρες» και το «πρέπει να ειδοποιηθεί;» είναι κανόνες προϊόντος, όχι
// δικτύου. Οταν ζουν σε component, δοκιμάζονται μόνο με μάτια.
//
// Η ΣΙΩΠΗΛΗ ΛΗΞΗ ΕΙΝΑΙ ΤΟ ΧΕΙΡΟΤΕΡΟ ΣΕΝΑΡΙΟ. Ο χρήστης πληρώνει το πρόσθετο,
// η σύνδεση λήγει, οι κινήσεις σταματούν να έρχονται — και η οθόνη δείχνει
// απλώς λιγότερες κινήσεις. Δεν φαίνεται σαν βλάβη· φαίνεται σαν μήνας με
// λίγα έξοδα. Γι' αυτό η κατάσταση λήξης έχει δικό της όνομα, δικό της
// μήνυμα και προειδοποίηση ΠΡΙΝ συμβεί.
// ═══════════════════════════════════════════════════════════════════════════

import type { BankConnection, ConnectionStatus } from './types';

/** Πόσες ημέρες πριν τη λήξη αρχίζουμε να το λέμε. */
export const RENEWAL_NOTICE_DAYS = 14;

export interface ConsentState {
  /** Δίνει κινήσεις αυτή τη στιγμή; */
  usable: boolean;
  /** Ημέρες ώς τη λήξη. Αρνητικό = έληξε. `null` = δεν ξέρουμε ακόμη. */
  daysLeft: number | null;
  /** Πρέπει να δει ο χρήστης προτροπή ανανέωσης; */
  needsRenewal: boolean;
  /** Η μία πρόταση που εξηγεί την κατάσταση. */
  message: string;
}

/**
 * Ημέρες μεταξύ δύο ημερολογιακών ημερών, σε UTC.
 *
 * Η συγκατάθεση λήγει σε χρονική ΣΤΙΓΜΗ που ορίζει ο πάροχος, όχι σε
 * ημερολογιακή ημέρα Αθήνας — γι' αυτό εδώ δεν καλείται το `athensToday`.
 * Στρογγυλοποιούμε ΠΡΟΣ ΤΑ ΚΑΤΩ: «λήγει σε 0 ημέρες» σημαίνει «σήμερα»,
 * και μια συγκατάθεση που λήγει σε δώδεκα ώρες δεν επιτρέπεται να γράφει «1».
 */
export function daysUntilExpiry(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - now.getTime()) / 86_400_000);
}

export function consentState(c: Pick<BankConnection, 'status' | 'consentExpiresAt'>, now: Date = new Date()): ConsentState {
  const daysLeft = daysUntilExpiry(c.consentExpiresAt, now);

  if (c.status === 'revoked') {
    return { usable: false, daysLeft, needsRenewal: false, message: 'Η σύνδεση έχει διακοπεί από εσένα.' };
  }
  if (c.status === 'error') {
    return { usable: false, daysLeft, needsRenewal: true, message: 'Η τράπεζα ή ο πάροχος επέστρεψε σφάλμα. Ξανασύνδεσε τον λογαριασμό.' };
  }
  if (c.status === 'pending') {
    return { usable: false, daysLeft, needsRenewal: false, message: 'Η σύνδεση δεν ολοκληρώθηκε στην τράπεζα.' };
  }
  // ΕΝΕΡΓΗ ΚΑΤΑ ΤΟΝ ΠΑΡΟΧΟ, ΑΛΛΑ Η ΗΜΕΡΟΜΗΝΙΑ ΜΠΟΡΕΙ ΝΑ ΤΗΝ ΕΧΕΙ ΠΡΟΣΠΕΡΑΣΕΙ.
  // Ο πάροχος ενημερώνει την κατάστασή του με καθυστέρηση· η ημερομηνία λήξης
  // είναι το πιο πρόσφατο που ξέρουμε και υπερισχύει.
  if (daysLeft !== null && daysLeft < 0) {
    return { usable: false, daysLeft, needsRenewal: true, message: 'Η άδεια ανάγνωσης έληξε. Χρειάζεται ανανέωση στην τράπεζά σου.' };
  }
  if (daysLeft !== null && daysLeft <= RENEWAL_NOTICE_DAYS) {
    return {
      usable: true, daysLeft, needsRenewal: true,
      message: daysLeft === 0
        ? 'Η άδεια ανάγνωσης λήγει σήμερα. Ανανέωσέ την για να μη σταματήσουν οι κινήσεις.'
        : `Η άδεια ανάγνωσης λήγει σε ${daysLeft} ${daysLeft === 1 ? 'ημέρα' : 'ημέρες'}. Ανανέωσέ την για να μη σταματήσουν οι κινήσεις.`,
    };
  }
  return { usable: true, daysLeft, needsRenewal: false, message: 'Ενεργή σύνδεση.' };
}

/**
 * Πόσοι λογαριασμοί χρεώνονται αυτόν τον μήνα.
 *
 * ΤΟ ΠΡΟΣΘΕΤΟ ΧΡΕΩΝΕΤΑΙ «ΑΝΑ ΣΥΝΔΕΔΕΜΕΝΟ ΛΟΓΑΡΙΑΣΜΟ ΤΟΝ ΜΗΝΑ» (lib/billing/
 * addons.ts). Μετράει ό,τι ΚΑΤΑΝΑΛΩΝΕΙ άδεια στον πάροχο: ενεργές συνδέσεις
 * και όσες έληξαν αλλά δεν έχουν διακοπεί. ΔΕΝ μετράει τις διακομμένες, ούτε
 * τις εκκρεμείς που ο χρήστης δεν ολοκλήρωσε ποτέ — γι' αυτές δεν πληρώνουμε,
 * άρα δεν πληρώνει.
 */
const BILLABLE: ReadonlySet<ConnectionStatus> = new Set<ConnectionStatus>(['active', 'expired', 'error']);

export function billableConnections(cs: readonly Pick<BankConnection, 'status'>[]): number {
  return cs.filter(c => BILLABLE.has(c.status)).length;
}
