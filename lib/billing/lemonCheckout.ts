// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΤΑΜΕΙΟ ΦΤΙΑΧΝΕΤΑΙ ΑΝΑ ΠΑΤΗΜΑ, ΔΕΝ ΕΙΝΑΙ ΣΤΑΘΕΡΟΣ ΣΥΝΔΕΣΜΟΣ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΑΛΛΑΞΕ. Ο στατικός σύνδεσμος αγοράς (`…/buy/<uuid>`) είναι ο ίδιος για
// όλους, και ακριβώς εκεί είναι το πρόβλημα: η δωρεάν δοκιμή είναι ρύθμιση της
// ΠΑΡΑΛΛΑΓΗΣ, οπότε ΚΑΘΕ αγορά μέσω του ίδιου συνδέσμου γεννά καθαρή δοκιμή 30
// ημερών. Ακύρωση τη δεύτερη μέρα, ξαναπάτημα του ίδιου κουμπιού, νέα δοκιμή —
// ίδιος λογαριασμός, ίδιο email, ίδια κάρτα, επ' άπειρον.
//
// Το ταμείο που φτιάχνεται από τον διακομιστή δέχεται `skip_trial`. Η δοκιμή
// γίνεται έτσι απόφαση ΔΙΚΗ ΜΑΣ, ανά λογαριασμό, αντί για ιδιότητα του
// προϊόντος — και δεν χρειάζονται διπλάσιες παραλλαγές στο κατάστημα.
//
// ── ΚΑΙ ΤΡΙΑ ΑΚΟΜΗ ΠΟΥ Ο ΣΤΑΤΙΚΟΣ ΣΥΝΔΕΣΜΟΣ ΔΕΝ ΕΔΙΝΕ ────────────────────
// · Εκπτωτικός κωδικός από τον διακομιστή, δηλαδή ελεγχόμενος.
// · Προσυμπληρωμένο όνομα, όχι μόνο email: ένα πεδίο λιγότερο στο ταμείο.
// · Λήξη του συνδέσμου. Ενας σύνδεσμος πληρωμής που ζει για πάντα σε ένα
//   ιστορικό περιηγητή είναι σύνδεσμος που κάποιος θα πατήσει κατά λάθος.
//
// ── ΤΙ ΤΑΞΙΔΕΥΕΙ ΜΑΖΙ ─────────────────────────────────────────────────────
// Το `custom.user_id` είναι ο ΜΟΝΟΣ σύνδεσμος της πληρωμής με τον λογαριασμό:
// το webhook δεν έχει άλλον τρόπο να ξέρει ποιος πλήρωσε. Δεν έρχεται ποτέ από
// το αίτημα του περιηγητή — έρχεται από τη συνεδρία.
// ═══════════════════════════════════════════════════════════════════════════

import type { PlanId } from './plans';
import type { BillingCycle } from './lemon';
import { apiConfigError, lemonRequest, storeId, type BillingEnv } from './lemonApi';

export type { BillingEnv };

/**
 * ΕΙΝΑΙ ΖΩΝΤΑΝΗ Η ΧΡΕΩΣΗ; ΜΙΑ ΕΡΩΤΗΣΗ, ΜΙΑ ΑΠΑΝΤΗΣΗ.
 *
 * Ο,τι λέει η εφαρμογή για τα χρήματα — το κουμπί του ταμείου, οι Οροι, το
 * Απόρρητο, η σελίδα εμπιστοσύνης, το FAQ, το μητρώο υπεργολάβων — πρέπει να
 * λέει ΤΟ ΙΔΙΟ πράγμα την ίδια στιγμή.
 *
 * ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΤΗΝ ΓΕΝΝΗΣΕ. Ο χειριστής πληρωμής γράφτηκε και μαζί του ένα
 * κουμπί «Πληρωμή με κάρτα». Πέντε επιφάνειες συνέχισαν να γράφουν «η χρέωση
 * δεν έχει ενεργοποιηθεί», και το μητρώο υπεργολάβων — δημοσιευμένο έγγραφο
 * του άρθρου 28 GDPR — δήλωνε μηχαναγνώσιμα `active: false` για τον πάροχο.
 *
 * ΚΑΙ ΓΙΑΤΙ ΡΩΤΑΕΙ ΚΑΙ ΤΙΣ ΤΡΕΙΣ ΜΕΤΑΒΛΗΤΕΣ. Η προηγούμενη γραφή κοιτούσε μόνο
 * τους συνδέσμους αγοράς: με ξεχασμένο τον χάρτη παραλλαγών, το κουμπί ήταν
 * ζωντανό, τα κείμενα έλεγαν «χρεώνουμε», και ο webhook απαντούσε 500 σε κάθε
 * γεγονός. Πληρωμένοι πελάτες χωρίς πακέτο, από την πρώτη εγγραφή.
 */
export function checkoutIsLive(env: BillingEnv = process.env): boolean {
  if (apiConfigError(env) !== '') return false;
  return parseVariantMapText(env.LEMON_VARIANTS).size > 0;
}

/** Το κλειδί μιας παραλλαγής: πακέτο και κύκλος. */
export const variantKey = (plan: PlanId, cycle: BillingCycle): string => `${plan}:${cycle}`;

/**
 * Ο χάρτης «πακέτο:κύκλος → παραλλαγή», χωρίς κρίση για τα σφάλματα.
 *
 * Η ΑΥΣΤΗΡΗ ΑΝΑΓΝΩΣΗ ΖΕΙ ΣΤΟ `lemon.ts` (`parseVariantMap`), που καταγγέλλει
 * ονομαστικά κάθε λάθος γραμμή. Εδώ χρειάζεται μόνο η ερώτηση «υπάρχει
 * τουλάχιστον μία;», και μια δεύτερη αυστηρή υλοποίηση θα ήταν ακριβώς η
 * δεύτερη πηγή που το αρχείο αυτό υπάρχει για να αποφύγει.
 */
function parseVariantMapText(raw: string | undefined | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (raw || '').split(',').map(e => e.trim()).filter(Boolean)) {
    const [variantId, plan, cycle] = entry.split(':').map(p => (p || '').trim());
    if (variantId && plan && (cycle === 'monthly' || cycle === 'annual')) {
      map.set(`${plan}:${cycle}`, variantId);
    }
  }
  return map;
}

/** Η παραλλαγή ενός πακέτου. Κενό όταν δεν έχει οριστεί. */
export function variantFor(env: BillingEnv, plan: PlanId, cycle: BillingCycle): string {
  return parseVariantMapText(env.LEMON_VARIANTS).get(variantKey(plan, cycle)) || '';
}

export interface Buyer {
  /** Ο λογαριασμός μας. Χωρίς αυτόν η πληρωμή δεν προσγειώνεται πουθενά. */
  userId: string;
  email?: string | null;
  name?: string | null;
}

export interface CheckoutWish {
  storeId: string;
  variantId: string;
  buyer: Buyer;
  /** Πού γυρίζει ο πελάτης μετά την πληρωμή. */
  redirectUrl: string;
  /**
   * ΠΑΡΑΛΕΙΨΗ ΤΗΣ ΔΟΚΙΜΗΣ. `true` για κάθε λογαριασμό που έχει ήδη πάρει τη
   * δική του: η δοκιμή είναι μία ανά ΛΟΓΑΡΙΑΣΜΟ, όχι μία ανά συνδρομή.
   */
  skipTrial: boolean;
  /** Εκπτωτικός κωδικός, όταν ο λογαριασμός δικαιούται. */
  discountCode?: string;
  /** Πότε λήγει ο σύνδεσμος, σε ISO. */
  expiresAt?: string;
  testMode?: boolean;
}

/**
 * Το σώμα του αιτήματος. Καθαρή συνάρτηση, ώστε να ελέγχεται χωρίς δίκτυο:
 * ένα λάθος πεδίο εδώ σημαίνει ταμείο που δεν ανοίγει, ή χειρότερα, ταμείο που
 * ανοίγει με λάθος όρους.
 */
export function checkoutPayload(w: CheckoutWish): Record<string, unknown> {
  const custom: Record<string, string> = { user_id: w.buyer.userId };
  const data: Record<string, unknown> = { custom };
  const email = (w.buyer.email || '').trim();
  const name = (w.buyer.name || '').trim();
  if (email) data.email = email;
  if (name) data.name = name;
  if (w.discountCode) data.discount_code = w.discountCode;

  return {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: data,
        checkout_options: { skip_trial: w.skipTrial, embed: false },
        // ΜΟΝΟ Η ΠΑΡΑΛΛΑΓΗ ΠΟΥ ΔΙΑΛΕΧΤΗΚΕ. Χωρίς αυτό, το ταμείο δείχνει
        // επιλογέα με ΟΛΕΣ τις παραλλαγές του προϊόντος: ο πελάτης που πάτησε
        // «ετήσια» μπορεί να φύγει με μηνιαία, και η οθόνη μας θα λέει άλλα.
        product_options: { enabled_variants: [w.variantId], redirect_url: w.redirectUrl },
        ...(w.expiresAt ? { expires_at: w.expiresAt } : {}),
        ...(w.testMode === undefined ? {} : { test_mode: w.testMode }),
      },
      relationships: {
        store: { data: { type: 'stores', id: w.storeId } },
        variant: { data: { type: 'variants', id: w.variantId } },
      },
    },
  };
}

/**
 * Η διεύθυνση του ταμείου μέσα σε μια απάντηση του εμπόρου.
 *
 * ΔΕΧΕΤΑΙ ΜΟΝΟ `https://`. Ο σύνδεσμος καταλήγει σε `window.location.href`·
 * χωρίς τον έλεγχο, μια απάντηση που δεν είναι αυτή που περιμέναμε γίνεται
 * ανοιχτή ανακατεύθυνση.
 */
export function readCheckoutUrl(payload: unknown): string | null {
  const data = (payload as { data?: unknown } | null)?.data;
  const attrs = (data as { attributes?: unknown } | null)?.attributes;
  const raw = (attrs as { url?: unknown } | null)?.url;
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  return /^https:\/\/[^/\s]+/.test(url) ? url : null;
}

export interface CheckoutResult { url: string | null; error: string }

/** Ζητά από τον έμπορο ένα ταμείο και επιστρέφει τη διεύθυνσή του. */
export async function createCheckout(
  w: CheckoutWish, apiKey: string, fetcher?: typeof fetch,
): Promise<CheckoutResult> {
  const { json, error } = await lemonRequest({
    path: '/v1/checkouts', method: 'POST', body: checkoutPayload(w), apiKey, fetcher,
  });
  if (error) return { url: null, error };
  return { url: readCheckoutUrl(json), error: '' };
}

export { storeId };
