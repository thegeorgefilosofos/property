// ═══════════════════════════════════════════════════════════════════════════
// Η ΘΥΡΑ ΤΟΥ ΕΜΠΟΡΟΥ: ΜΙΑ ΔΙΕΠΑΦΗ, ΠΟΛΛΕΣ ΥΛΟΠΟΙΗΣΕΙΣ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΓΡΑΦΤΗΚΕ, ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΑΡΧΙΤΕΚΤΟΝΙΚΗ ΓΙΑ ΤΗΝ ΑΡΧΙΤΕΚΤΟΝΙΚΗ. Η
// επαλήθευση ταυτότητας στον έναν έμπορο απορρίφθηκε. Χωρίς αυτήν δεν
// ενεργοποιείται κατάστημα και δεν εισπράττεται ευρώ, δηλαδή ολόκληρο το
// προϊόν είναι μπλοκαρισμένο από μια απόφαση τρίτου που δεν ελέγχουμε.
//
// ΤΙ ΜΕΤΡΗΘΗΚΕ ΠΡΙΝ ΓΡΑΦΤΕΙ. Επτά αρχεία εισήγαγαν κατευθείαν τα «lemon*»:
// τέσσερις διαδρομές API, ένα component και δύο νομικά κείμενα. Οι στήλες της
// βάσης όμως λέγονταν ΗΔΗ «mor_*» (merchant of record) και όχι «lemon_*»,
// ενώ το όνομα του εμπόρου ζούσε ήδη σε ένα σημείο. Δηλαδή η απόφαση «ο έμπορος
// είναι αντικαταστάσιμος» είχε παρθεί στη βάση και δεν είχε φτάσει στον κώδικα.
//
// ΤΙ ΕΙΝΑΙ ΕΙΔΙΚΟ ΑΝΑ ΕΜΠΟΡΟ ΚΑΙ ΤΙ ΟΧΙ. Οι κανόνες —ποιος δικαιούται τι, πότε
// είναι αναβάθμιση, τι σημαίνει «σε δοκιμή»— είναι ΔΙΚΟΙ ΜΑΣ και μένουν όπου
// είναι. Πίσω από τη θύρα μπαίνει μόνο ό,τι αλλάζει με τον πάροχο:
//
//     το σχήμα HTTP        το ταμείο, η συνδρομή, η πύλη πελάτη
//     η υπογραφή           πώς αποδεικνύεται ότι το γεγονός είναι δικό του
//     τα ονόματα γεγονότων ποιο γεγονός κουβαλά συνδρομή
//     ο χάρτης παραλλαγών  πώς λέγεται στον πάροχο το «Ιδιοκτήτης, ετήσια»
//
// ΚΑΙ Ο ΚΑΛΩΝ ΔΕΝ ΒΛΕΠΕΙ ΠΟΤΕ ΠΑΡΑΛΛΑΓΗ. Η διαδρομή ζητά «Ιδιοκτήτης+,
// ετήσια» και παίρνει διεύθυνση ταμείου· ο webhook παίρνει πακέτο, όχι
// αναγνωριστικό που πρέπει να ψάξει σε χάρτη. Οσο το αναγνωριστικό ταξίδευε
// έξω από τη θύρα, ο επόμενος πάροχος θα άλλαζε και τις διαδρομές.
// ═══════════════════════════════════════════════════════════════════════════
import type { PlanId, BillingCycle } from '../plans';
import type { BillingEnv } from '../lemonApi';

export type { BillingEnv };
import type { MorStatus, MorSubscription, VariantPlan } from '../lemon';

export type { MorStatus, MorSubscription, VariantPlan };

/** Ο αγοραστής, όπως τον ξέρει η εφαρμογή μας. */
export interface Buyer {
  /** Ο λογαριασμός μας. Χωρίς αυτόν η πληρωμή δεν προσγειώνεται πουθενά. */
  userId: string;
  email?: string | null;
  name?: string | null;
}

/** Τι ζητά η εφαρμογή από τον έμπορο, χωρίς μια λέξη δική του. */
export interface CheckoutOrder {
  buyer: Buyer;
  plan: PlanId;
  cycle: BillingCycle;
  /** Πού γυρίζει ο πελάτης μετά την πληρωμή. */
  redirectUrl: string;
  /** Η δοκιμή είναι μία ανά ΛΟΓΑΡΙΑΣΜΟ, όχι μία ανά συνδρομή. */
  skipTrial: boolean;
  discountCode?: string;
  /** Πότε λήγει ο σύνδεσμος, σε ISO. */
  expiresAt?: string;
  testMode?: boolean;
}

/** Τι ζητά η εφαρμογή όταν ο πελάτης αλλάζει πακέτο. */
export interface ChangeOrder {
  subscriptionId: string;
  plan: PlanId;
  cycle: BillingCycle;
  kind: 'upgrade' | 'downgrade' | 'same';
  /** Τρέχει δοκιμή τώρα; Τότε δεν χρεώνεται τίποτα σήμερα. */
  onTrial: boolean;
  /** Η λήξη της δοκιμής, ώστε να μη μετακινηθεί από την αλλαγή. */
  trialEndsAt?: string | null;
}

/** Η κατάσταση μιας συνδρομής, όπως τη λέει ο έμπορος. */
export interface SubscriptionState {
  status: MorStatus | null;
  variantId: string | null;
  renewsAt: string | null;
  trialEndsAt: string | null;
}

export interface CheckoutResult { url: string | null; error: string }
export interface PortalResult { url: string | null; error: string }
export interface ChangeResult { after: SubscriptionState | null; error: string }

/**
 * Ενα γεγονός συνδρομής, μεταφρασμένο στη γλώσσα μας.
 *
 * Το `plan` έρχεται ΛΥΜΕΝΟ: `null` σημαίνει «παραλλαγή εκτός χάρτη», δηλαδή
 * ρύθμιση που λείπει, όχι πακέτο που δεν υπάρχει.
 */
export interface MerchantEvent {
  /** Το όνομα του γεγονότος, για τα αρχεία καταγραφής. */
  name: string;
  sub: MorSubscription;
  plan: VariantPlan | null;
  /** Πότε συνέβη, για να μη γράψει καθυστερημένο πάνω από νεότερο. */
  occurredAt: string | null;
}

/**
 * Το αποτέλεσμα της ανάγνωσης ενός γεγονότος.
 *
 * ΤΡΕΙΣ ΠΕΡΙΠΤΩΣΕΙΣ ΚΑΙ ΟΧΙ ΔΥΟ, γιατί ο καλών πρέπει να απαντήσει διαφορετικά:
 *   · `ours: false`  — παραγγελία ή παραστατικό. Φυσιολογικό, απαντά 200.
 *   · `ours: true`   — γεγονός συνδρομής που δεν διαβάστηκε. Πρέπει να φανεί
 *                      στον πίνακα του εμπόρου, απαντά 422 ώστε να ξαναέρθει.
 *   · `config: true` — δική ΜΑΣ ρύθμιση σπασμένη. Απαντά 500: το να ζητάς από
 *                      τον έμπορο να ξαναστείλει δεν διορθώνει μεταβλητή.
 */
export type ReadEvent =
  | { ok: true; event: MerchantEvent }
  | { ok: false; reason: string; ours: boolean; config?: boolean };

/** Οι πάροχοι που ξέρει το έργο. */
export type MerchantId = 'lemon';

/**
 * Η θύρα. Καμία μέθοδος δεν δέχεται ή επιστρέφει έννοια του παρόχου.
 *
 * Το `env` περνιέται ρητά αντί να διαβάζεται μέσα: έτσι οι σουίτες δοκιμάζουν
 * κάθε συνδυασμό ρύθμισης χωρίς να πειράξουν το περιβάλλον της διεργασίας.
 */
export interface MerchantPort {
  /** Το κλειδί στις μεταβλητές και στα αρχεία καταγραφής. */
  readonly id: MerchantId;
  /** Το όνομα που διαβάζει ο πελάτης και τα νομικά κείμενα. */
  readonly name: string;
  /** Ολα ρυθμισμένα; Οσο είναι `false`, το κουμπί χρέωσης δεν ζωντανεύει. */
  isLive(env: BillingEnv): boolean;
  /** Τι λείπει, με ονόματα μεταβλητών. Κενό όταν δεν λείπει τίποτα. */
  configError(env: BillingEnv): string;
  openCheckout(order: CheckoutOrder, env: BillingEnv, fetcher?: typeof fetch): Promise<CheckoutResult>;
  portalUrl(subscriptionId: string, env: BillingEnv, fetcher?: typeof fetch): Promise<PortalResult>;
  subscriptionState(subscriptionId: string, env: BillingEnv, fetcher?: typeof fetch): Promise<ChangeResult>;
  changePlan(order: ChangeOrder, env: BillingEnv, fetcher?: typeof fetch): Promise<ChangeResult>;
  cancel(subscriptionId: string, env: BillingEnv, fetcher?: typeof fetch): Promise<ChangeResult>;
  /** Χρειάζεται ακύρωση μια συνδρομή σε αυτή την κατάσταση; */
  needsCancelling(status: string | null): boolean;
  /**
   * Ποιο πακέτο αντιστοιχεί σε αυτή την κατάσταση, κατά τον έμπορο.
   *
   * `null` σημαίνει «παραλλαγή εκτός χάρτη»: ο καλών πέφτει στο δικό μας
   * προφίλ. Χωρίς αυτό, η διαδρομή αλλαγής πακέτου έπρεπε να διαβάσει η ίδια
   * τον χάρτη παραλλαγών, δηλαδή να ξέρει τι είναι παραλλαγή.
   */
  planOf(state: SubscriptionState, env: BillingEnv): VariantPlan | null;
  /**
   * Είναι η συνδρομή ήδη ακριβώς σε αυτό το πακέτο και κύκλο;
   *
   * Το δεύτερο πάτημα στο ίδιο πακέτο δεν είναι σφάλμα. Η σύγκριση γινόταν με
   * αναγνωριστικό παραλλαγής μέσα στη διαδρομή· τώρα τη λέει ο έμπορος.
   */
  isAt(state: SubscriptionState, plan: PlanId, cycle: BillingCycle, env: BillingEnv): boolean;
  /** Είναι το γεγονός όντως δικό του; Μόνη απόδειξη ταυτότητας του webhook. */
  verifyWebhook(rawBody: string, headers: Headers, env: BillingEnv): boolean;
  readEvent(payload: unknown, env: BillingEnv): ReadEvent;
}
