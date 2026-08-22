// ═══════════════════════════════════════════════════════════════════════════
// Ο ΔΙΑΚΟΠΤΗΣ ΤΗΣ ΣΥΣΚΕΥΗΣ, ΑΠΟ ΤΗΝ ΠΛΕΥΡΑ ΤΟΥ ΠΕΡΙΗΓΗΤΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΠΡΕΠΕΙ ΝΑ ΙΣΧΥΟΥΝ ΓΙΑ ΝΑ ΦΤΑΣΕΙ ΕΙΔΟΠΟΙΗΣΗ ΣΕ ΚΛΕΙΣΤΗ
// ΕΦΑΡΜΟΓΗ: service worker, άδεια, και δημόσιο κλειδί VAPID. Λείπει ένα, δεν
// υπάρχει λειτουργία — και τότε ο διακόπτης ΔΕΝ εμφανίζεται καθόλου, αντί να
// εμφανίζεται και να μη δουλεύει.
//
// ΤΟ ΙΔΙΩΤΙΚΟ ΚΛΕΙΔΙ ΔΕΝ ΠΕΡΝΑ ΠΟΤΕ ΑΠΟ ΕΔΩ. Το δημόσιο ταξιδεύει με τη
// σελίδα (γι' αυτό λέγεται δημόσιο) και μόνο αυτό χρειάζεται ο περιηγητής για
// να φτιάξει συνδρομή. Ο διακομιστής υπογράφει με το ιδιωτικό, που ζει ως
// μεταβλητή περιβάλλοντος και δεν φαίνεται σε καμία οθόνη.
//
// ΣΤΟ iPhone ΧΡΕΙΑΖΕΤΑΙ ΕΓΚΑΤΑΣΤΑΣΗ ΠΡΩΤΑ. Το Safari δίνει `PushManager` μόνο
// σε εφαρμογή προστεθειμένη στην αρχική οθόνη· στην καρτέλα του περιηγητή η
// συνδρομή αποτυγχάνει. Το λέμε πριν το πατήσει κανείς, όχι μετά.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Το δημόσιο κλειδί VAPID, γραμμένο ΩΣ ΚΥΡΙΟΛΕΞΙΑ.
 *
 * Το Next αντικαθιστά μόνο `process.env.NEXT_PUBLIC_*` γραμμένο ολόκληρο στον
 * κώδικα. Με μεταβλητή στη μέση (`process.env[name]`) η τιμή μένει κενή στον
 * περιηγητή και η λειτουργία εξαφανίζεται σιωπηλά.
 */
export const VAPID_PUBLIC_KEY = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();

/**
 * Το κλειδί που θυμάται ΑΥΤΗ η συσκευή ότι ο διακόπτης είναι ανοιχτός.
 *
 * ΓΙΑΤΙ ΥΠΑΡΧΕΙ ΚΑΙ ΔΕΥΤΕΡΟ ΣΗΜΕΙΟ ΠΕΡΑ ΑΠΟ ΤΗ ΒΑΣΗ. Ο ίδιος διακόπτης ανάβει
 * ΔΥΟ πράγματα: τις ειδοποιήσεις που φτάνουν με την εφαρμογή κλειστή (βάση) και
 * την προειδοποίηση δέκα λεπτά πριν από ραντεβού, όσο η εφαρμογή είναι ανοιχτή
 * (ημερολόγιο). Το δεύτερο δεν αγγίζει δίκτυο και δεν πρέπει: μια υπενθύμιση
 * που περιμένει απάντηση διακομιστή δεν είναι υπενθύμιση.
 */
export const NOTIFY_KEY = 'cal_notify';

/** Το γεγονός που ακούει όποια οθόνη είναι ήδη ανοιχτή όταν αλλάξει ο διακόπτης. */
export const NOTIFY_EVENT = 'pos-notify-changed';

/** Ανάβει ή σβήνει τον διακόπτη ΣΕ ΟΛΗ την εφαρμογή, όχι μόνο στην οθόνη που τον πάτησε. */
export function setDeviceNotify(on: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (on) localStorage.setItem(NOTIFY_KEY, '1');
    else localStorage.removeItem(NOTIFY_KEY);
  } catch { /* ιδιωτική περιήγηση: ο διακόπτης ζει όσο η καρτέλα */ }
  window.dispatchEvent(new CustomEvent(NOTIFY_EVENT, { detail: on }));
}

/** Είναι ανοιχτός ο διακόπτης σε αυτή τη συσκευή; */
export function deviceNotifyOn(): boolean {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  try { return localStorage.getItem(NOTIFY_KEY) === '1' && Notification.permission === 'granted'; }
  catch { return false; }
}

/** Ο περιηγητής μπορεί να δεχτεί ειδοποιήσεις με την εφαρμογή κλειστή; */
export function pushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && typeof Notification !== 'undefined';
}

/** Υπάρχει διακομιστής να στείλει; Χωρίς κλειδί, τίποτα δεν έχει νόημα. */
export const pushConfigured = (): boolean => VAPID_PUBLIC_KEY.length > 0;

/**
 * base64url → bytes, όπως το θέλει η `subscribe()`.
 *
 * Το κλειδί δίνεται σε base64url (χωρίς γεμίσματα)· το `atob` θέλει base64 με
 * γεμίσματα και με «+/» αντί για «-_».
 */
export function decodeKey(base64url: string): Uint8Array {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - base64url.length % 4) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Η συνδρομή αυτής της συσκευής, αν υπάρχει ήδη. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** Το αποτέλεσμα μιας απόπειρας εγγραφής, με τον λόγο όταν δεν έγινε. */
export type SubscribeOutcome =
  | { ok: true; subscription: PushSubscription }
  | { ok: false; reason: 'unsupported' | 'unconfigured' | 'denied' | 'failed' };

/**
 * Ζητά άδεια και γράφει τη συσκευή στην υπηρεσία push.
 *
 * ΤΟ `userVisibleOnly` ΕΙΝΑΙ ΥΠΟΣΧΕΣΗ: κάθε μήνυμα που στέλνουμε ΘΑ δείξει
 * ειδοποίηση. Οι περιηγητές την επιβάλλουν, και σωστά — αλλιώς το push θα ήταν
 * κανάλι σιωπηλής παρακολούθησης.
 */
export async function subscribeDevice(): Promise<SubscribeOutcome> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  if (!pushConfigured()) return { ok: false, reason: 'unconfigured' };
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return { ok: true, subscription: existing };
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(VAPID_PUBLIC_KEY) as BufferSource,
    });
    return { ok: true, subscription };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/**
 * Σβήνει τη συνδρομή από την υπηρεσία push.
 *
 * Η ΑΔΕΙΑ ΔΕΝ ΑΝΑΚΑΛΕΙΤΑΙ ΑΠΟ ΕΔΩ, ΚΑΙ ΔΕΝ ΓΙΝΕΤΑΙ. Την ανακαλεί ο χρήστης
 * από τον περιηγητή. Εμείς σταματάμε να στέλνουμε, που είναι το ζητούμενο.
 */
export async function unsubscribeDevice(): Promise<string | null> {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch { /* η γραμμή φεύγει έτσι κι αλλιώς */ }
  return endpoint;
}
