// ═══════════════════════════════════════════════════════════════════════════
// ΟΣΑ ΓΙΝΟΝΤΑΙ ΣΕ ΜΙΑ ΣΥΝΔΡΟΜΗ ΠΟΥ ΗΔΗ ΤΡΕΧΕΙ: ΑΛΛΑΓΗ ΠΑΚΕΤΟΥ ΚΑΙ ΑΚΥΡΩΣΗ
// ─────────────────────────────────────────────────────────────────────────
// Δύο πράξεις με το ίδιο κουμπί και εντελώς διαφορετική οικονομία.
//
// ── ΑΝΑΒΑΘΜΙΣΗ: ΠΛΗΡΩΝΕΙ ΤΗ ΔΙΑΦΟΡΑ, ΤΩΡΑ ────────────────────────────────
// «invoice_immediately» ζητά από τον έμπορο να εκδώσει αναλογικό τιμολόγιο και
// να το εισπράξει αμέσως. Η αναλογία είναι δική του δουλειά και είναι η σωστή:
// πιστώνει τις ημέρες που ο πελάτης έχει ήδη πληρώσει στο παλιό πακέτο και
// χρεώνει μόνο τη διαφορά ως τη λήξη της περιόδου. Ετσι ζήτησε να δουλεύει:
// «να αναβαθμισει πληρωνοντας μονο τις ημέρες της διαφοράς».
//
// ── ΥΠΟΒΑΘΜΙΣΗ: ΚΑΝΕΝΑ ΧΡΗΜΑ ΠΙΣΩ, ΚΑΙ ΙΣΧΥΕΙ ΑΠΟ ΤΗΝ ΑΝΑΝΕΩΣΗ ──────────
// «disable_prorations» σημαίνει, με τα λόγια του ίδιου του API: καμία αναλογία
// δεν χρεώνεται και ο πελάτης απλώς χρεώνεται τη ΝΕΑ τιμή στην επόμενη
// ανανέωση. Δηλαδή ο έμπορος κάνει μόνος του το μισό από αυτό που ζητήθηκε:
// «δεν παιρνει χρηματα πισω».
//
// Το άλλο μισό —«υποβαθμιζεται μετά το τελος των 30 ημερων»— ο έμπορος ΔΕΝ το
// υποστηρίζει: η παραλλαγή αλλάζει τη στιγμή του αιτήματος, άρα το πακέτο που
// θα γράψει ο webhook είναι αμέσως το χαμηλότερο. Το κρατάμε εμείς, με τις
// στήλες `hold_plan` / `hold_until` του προφίλ: ώς την ανανέωση, η πρόσβαση
// μένει στο πακέτο που πληρώθηκε. Ο κανόνας ζει σε δύο σημεία που το
// db-replay υποχρεώνει να συμφωνούν — `public.user_plan_rank` και
// `lib/billing/entitlements.ts`.
//
// ── ΚΑΙ ΜΕΣΑ ΣΤΗ ΔΟΚΙΜΗ, ΤΙΠΟΤΑ ΔΕΝ ΧΡΕΩΝΕΤΑΙ ───────────────────────────
// Οσο η συνδρομή είναι `on_trial` δεν έχει πληρωθεί τίποτα, οπότε δεν υπάρχει
// τι να αναλογιστεί: κάθε αλλαγή περνά με `disable_prorations` και η πρώτη
// χρέωση γίνεται στη λήξη της δοκιμής, στη νέα τιμή. Η ημερομηνία λήξης της
// δοκιμής καρφώνεται ΡΗΤΑ στο αίτημα: μια αλλαγή παραλλαγής δεν επιτρέπεται να
// ξαναρχίσει —ούτε να κόψει— δοκιμή που ήδη τρέχει.
// ═══════════════════════════════════════════════════════════════════════════

import { lemonRequest, subscriptionOf } from './lemonApi';
import { isMorStatus, type MorStatus, type ChangeKind } from './subscription';

export interface ChangeWish {
  subscriptionId: string;
  /** Η παραλλαγή του νέου πακέτου, όπως τη λέει το LEMON_VARIANTS. */
  variantId: string;
  kind: ChangeKind;
  /** Τρέχει δοκιμή αυτή τη στιγμή; Τότε δεν χρεώνεται τίποτα σήμερα. */
  onTrial: boolean;
  /** Η λήξη της δοκιμής, ώστε να μη μετακινηθεί από την αλλαγή. */
  trialEndsAt?: string | null;
}

/**
 * Το σώμα του αιτήματος αλλαγής, σε JSON:API.
 *
 * ΤΟ `variant_id` ΕΙΝΑΙ ΑΡΙΘΜΟΣ ΚΑΙ ΟΧΙ ΚΕΙΜΕΝΟ. Το API το δηλώνει ως ακέραιο·
 * ένα «12345» σε εισαγωγικά γίνεται δεκτό σιωπηλά από κάποιες εκδόσεις και
 * απορρίπτεται από άλλες και η διαφορά φαίνεται μόνο σε πραγματική χρέωση.
 */
export function changePayload(w: ChangeWish): Record<string, unknown> {
  const attributes: Record<string, unknown> = { variant_id: Number(w.variantId) };

  if (w.kind === 'upgrade' && !w.onTrial) {
    attributes.invoice_immediately = true;
  } else {
    // Υποβάθμιση, ή οποιαδήποτε αλλαγή μέσα στη δοκιμή: καμία κίνηση χρημάτων
    // σήμερα, νέα τιμή στην επόμενη ανανέωση.
    attributes.disable_prorations = true;
  }

  const trialEnd = (w.trialEndsAt || '').trim();
  if (w.onTrial && trialEnd) attributes.trial_ends_at = trialEnd;

  return { data: { type: 'subscriptions', id: String(w.subscriptionId), attributes } };
}

/** Η κατάσταση της συνδρομής, όπως τη διαβάζουμε από την απάντηση του εμπόρου. */
export interface SubscriptionState {
  status: MorStatus | null;
  variantId: string | null;
  renewsAt: string | null;
  trialEndsAt: string | null;
}

const text = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  return s ? s : null;
};

/**
 * Διαβάζει τα τέσσερα πεδία που κρίνουν την αλλαγή.
 *
 * ΚΑΜΙΑ ΑΓΝΩΣΤΗ ΚΑΤΑΣΤΑΣΗ ΔΕΝ ΓΙΝΕΤΑΙ ΔΕΚΤΗ. Ο ίδιος κανόνας με τον webhook:
 * ό,τι δεν αναγνωρίζεται γίνεται `null` και ο καλών σταματά, αντί να
 * ερμηνευτεί ως «ενεργή» και να χρεώσει κάρτα με λάθος λογική.
 */
export function readSubscriptionState(payload: unknown): SubscriptionState {
  const data = (payload as { data?: unknown } | null)?.data;
  const attrs = ((data as { attributes?: unknown } | null)?.attributes ?? {}) as Record<string, unknown>;
  const status = typeof attrs.status === 'string' && isMorStatus(attrs.status.trim()) ? attrs.status.trim() as MorStatus : null;
  return {
    status,
    variantId: text(attrs.variant_id),
    renewsAt: text(attrs.renews_at),
    trialEndsAt: text(attrs.trial_ends_at),
  };
}

export interface ChangeResult {
  /** Η κατάσταση της συνδρομής ΜΕΤΑ την αλλαγή. `null` όταν δεν έγινε. */
  after: SubscriptionState | null;
  /** Τι πήγε στραβά, με λόγια για τα αρχεία καταγραφής. Κενό όταν όλα καλά. */
  error: string;
}

/** Ρωτά τον έμπορο πώς έχει τώρα η συνδρομή. */
export async function subscriptionState(
  subscriptionId: string, apiKey: string, fetcher?: typeof fetch,
): Promise<ChangeResult> {
  const { json, error } = await subscriptionOf(subscriptionId, apiKey, fetcher);
  if (error) return { after: null, error };
  return { after: readSubscriptionState(json), error: '' };
}

/**
 * ΟΙ ΚΑΤΑΣΤΑΣΕΙΣ ΠΟΥ ΔΕΝ ΕΧΟΥΝ ΤΙΠΟΤΑ ΝΑ ΑΚΥΡΩΣΟΥΝ.
 *
 * Μια ήδη ακυρωμένη ή ληγμένη συνδρομή δεν ξαναακυρώνεται: ο έμπορος θα
 * απαντούσε σφάλμα και ο καλών θα το εκλάμβανε ως «η ακύρωση δεν έγινε» —
 * μπλοκάροντας, για παράδειγμα, μια διαγραφή λογαριασμού που δεν είχε κανέναν
 * λόγο να μπλοκαριστεί.
 */
const ALREADY_OVER: ReadonlySet<string> = new Set(['cancelled', 'expired']);

export const needsCancelling = (status: string | null): boolean =>
  !!status && !ALREADY_OVER.has(status);

/**
 * Ακυρώνει τη συνδρομή στον έμπορο.
 *
 * ΑΚΥΡΩΣΗ ΔΕΝ ΣΗΜΑΙΝΕΙ ΔΙΑΚΟΠΗ ΣΗΜΕΡΑ. Ο έμπορος σταματά τις ΜΕΛΛΟΝΤΙΚΕΣ
 * χρεώσεις και αφήνει τη συνδρομή να τρέξει ώς το τέλος της περιόδου που έχει
 * πληρωθεί — ακριβώς αυτό υπόσχονται οι Οροι. Καμία επιστροφή, καμία απώλεια.
 */
export async function cancelSubscription(
  subscriptionId: string, apiKey: string, fetcher?: typeof fetch,
): Promise<ChangeResult> {
  const { json, error } = await lemonRequest({
    path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    method: 'DELETE',
    apiKey, fetcher,
  });
  if (error) return { after: null, error };
  return { after: readSubscriptionState(json), error: '' };
}

/** Στέλνει την αλλαγή. Επιστρέφει την κατάσταση όπως την είπε ο έμπορος. */
export async function changePlan(
  w: ChangeWish, apiKey: string, fetcher?: typeof fetch,
): Promise<ChangeResult> {
  if (!/^\d+$/.test((w.variantId || '').trim())) {
    return { after: null, error: `η παραλλαγή «${w.variantId}» δεν είναι αριθμός` };
  }
  const { json, error } = await lemonRequest({
    path: `/v1/subscriptions/${encodeURIComponent(w.subscriptionId)}`,
    method: 'PATCH',
    body: changePayload(w),
    apiKey, fetcher,
  });
  if (error) return { after: null, error };
  return { after: readSubscriptionState(json), error: '' };
}
