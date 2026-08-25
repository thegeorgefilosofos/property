// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΠΟΣΤΟΛΗ: ΤΡΙΑ ΚΛΕΙΔΙΑ, ΕΝΑΣ ΦΑΚΕΛΟΣ, ΤΡΕΙΣ ΕΚΒΑΣΕΙΣ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΒΙΒΛΙΟΘΗΚΗ ΚΑΙ ΟΧΙ ΔΙΚΗ ΜΑΣ ΚΡΥΠΤΟΓΡΑΦΙΑ. Το πρωτόκολλο (RFC 8291)
// θέλει εφήμερο ζεύγος P-256, HKDF με δύο διαφορετικά «αλάτια», AES-128-GCM με
// γέμισμα δύο ψηφίων και υπογραφή VAPID ES256. Καθένα από αυτά, γραμμένο
// λάθος, δίνει μήνυμα που ο περιηγητής ΠΕΤΑΕΙ ΣΙΩΠΗΛΑ: καμία ειδοποίηση,
// κανένα σφάλμα, τίποτα να διορθώσεις.
//
// ── ΟΙ ΤΡΕΙΣ ΕΚΒΑΣΕΙΣ, ΚΑΙ ΓΙΑΤΙ ΞΕΧΩΡΙΖΟΥΝ ──────────────────────────────
//
//   ΕΦΥΓΕ.        Η υπηρεσία το πήρε. Δεν σημαίνει ότι το είδε άνθρωπος.
//   ΠΕΘΑΝΕ (404, 410). Η συνδρομή δεν υπάρχει πια: σβήστηκε η εφαρμογή,
//                 καθαρίστηκε ο περιηγητής, άλλαξε τηλέφωνο. Η γραμμή ΦΕΥΓΕΙ.
//   ΑΠΕΤΥΧΕ.      Δίκτυο, όριο ρυθμού, βλάβη της υπηρεσίας. Ξαναδοκιμάζουμε
//                 αύριο· η γραμμή ΜΕΝΕΙ και η αποτυχία μετριέται.
//
// Το να σβήναμε στη δεύτερη περίπτωση όπως και στην τρίτη θα έσβηνε ζωντανές
// συσκευές σε μια στιγμιαία βλάβη του Google.
//
// ── ΤΟ ΙΔΙΩΤΙΚΟ ΚΛΕΙΔΙ ΔΕΝ ΜΠΑΙΝΕΙ ΣΕ ΚΑΘΟΛΙΚΗ ΚΑΤΑΣΤΑΣΗ ────────────────
// Η `setVapidDetails()` της βιβλιοθήκης το κρατά σε μεταβλητή ενότητας. Εδώ
// δίνεται ΑΝΑ ΚΛΗΣΗ: καμία ενέργεια στο φόρτωμα της ενότητας, κανένα μυστικό
// να επιβιώσει σε στιγμιότυπο μνήμης περισσότερο απ' όσο χρειάζεται.
// ═══════════════════════════════════════════════════════════════════════════

import webpush from 'web-push';
import type { PushMessage } from './message';
import type { DeviceSubscription } from './subscription';

/** Το δημόσιο κλειδί. Το ΙΔΙΟ που βλέπει ο περιηγητής: γι' αυτό `NEXT_PUBLIC_`. */
export const VAPID_PUBLIC_ENV = 'NEXT_PUBLIC_VAPID_PUBLIC_KEY';
/** Το ιδιωτικό. Ζει μόνο στον διακομιστή και μόνο ως μεταβλητή περιβάλλοντος. */
export const VAPID_PRIVATE_ENV = 'VAPID_PRIVATE_KEY';
/**
 * Η ταυτότητά μας προς την υπηρεσία push: «mailto:» ή διεύθυνση της σελίδας.
 * Το ζητά το πρωτόκολλο ώστε η Google να ξέρει ποιον να ειδοποιήσει αν κάτι
 * πάει στραβά με τα μηνύματά μας.
 */
export const VAPID_SUBJECT_ENV = 'VAPID_SUBJECT';

export interface VapidKeys { subject: string; publicKey: string; privateKey: string }

/** Το περιβάλλον όπως το διαβάζουμε: ονόματα σε τιμές, τίποτα παραπάνω. */
export type PushEnv = Record<string, string | undefined>;

/**
 * Τα κλειδιά, ή το όνομα αυτού που λείπει.
 *
 * ΤΟ ΜΙΣΟ ΡΥΘΜΙΣΜΕΝΟ ΕΙΝΑΙ ΑΡΥΘΜΙΣΤΟ. Με δημόσιο κλειδί και χωρίς ιδιωτικό, ο
 * διακόπτης θα εμφανιζόταν, η συσκευή θα γραφόταν και καμία ειδοποίηση δεν θα
 * έφτανε ποτέ.
 */
export function vapidKeys(env: PushEnv): VapidKeys | { missing: string } {
  const subject = (env[VAPID_SUBJECT_ENV] || '').trim();
  const publicKey = (env[VAPID_PUBLIC_ENV] || '').trim();
  const privateKey = (env[VAPID_PRIVATE_ENV] || '').trim();
  if (!publicKey) return { missing: VAPID_PUBLIC_ENV };
  if (!privateKey) return { missing: VAPID_PRIVATE_ENV };
  if (!subject) return { missing: VAPID_SUBJECT_ENV };
  return { subject, publicKey, privateKey };
}

export type SendOutcome =
  | { sent: true }
  | { sent: false; gone: boolean; status: number; reason: string };

/** Πόσο κρατά η υπηρεσία το μήνυμα για συσκευή που κοιμάται. Μία ημέρα. */
export const TTL_SECONDS = 86_400;

/**
 * Στέλνει ΕΝΑ μήνυμα σε ΜΙΑ συσκευή.
 *
 * @param sub  Η συνδρομή, όπως τη διάβασε η `readSubscription`.
 * @param msg  Τι θα δει η κλειδωμένη οθόνη.
 * @param keys Τα κλειδιά VAPID αυτής της εγκατάστασης.
 */
export async function sendPush(
  sub: DeviceSubscription, msg: PushMessage, keys: VapidKeys,
): Promise<SendOutcome> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(msg),
      { TTL: TTL_SECONDS, urgency: 'normal', vapidDetails: keys },
    );
    return { sent: true };
  } catch (e) {
    const status = Number((e as { statusCode?: number }).statusCode) || 0;
    const reason = e instanceof Error ? e.message : String(e);
    return { sent: false, gone: status === 404 || status === 410, status, reason };
  }
}
