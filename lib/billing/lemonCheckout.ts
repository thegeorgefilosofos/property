// ═══════════════════════════════════════════════════════════════════════════
// Ο ΣΥΝΔΕΣΜΟΣ ΠΟΥ ΠΑΕΙ ΣΤΟ ΤΑΜΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΑ ΑΝΑΓΝΩΡΙΣΤΙΚΑ ΓΕΝΝΙΟΥΝΤΑΙ ΣΤΟ ΚΑΤΑΣΤΗΜΑ, ΟΧΙ ΕΔΩ. Ο σύνδεσμος αγοράς της
// Lemon Squeezy έχει μορφή `https://<κατάστημα>.lemonsqueezy.com/buy/<uuid>`,
// και το uuid το δίνει το κατάστημα όταν δημιουργηθεί το προϊόν. Δεν
// υπολογίζεται, δεν μαντεύεται: έρχεται από μεταβλητή περιβάλλοντος.
//
//     LEMON_CHECKOUT_LINKS="solo:monthly=https://…/buy/aaa,solo:annual=https://…/buy/bbb"
//
// ── ΓΙΑΤΙ ΕΛΕΓΧΕΤΑΙ ΤΟ ΟΝΟΜΑ ΧΩΡΟΥ ──────────────────────────────────────
// Αυτή η τιμή γράφεται με το χέρι σε πεδίο ιστοσελίδας και μετά η εφαρμογή
// στέλνει εκεί ΠΕΛΑΤΕΣ ΜΕ ΤΗΝ ΚΑΡΤΑ ΤΟΥΣ. Ενα τυπογραφικό στο όνομα χώρου δεν
// βγάζει σφάλμα· βγάζει σελίδα άλλου. Δεκτά μόνο `https` και υποτομείς του
// `lemonsqueezy.com`.
//
// ── ΤΙ ΤΑΞΙΔΕΥΕΙ ΜΑΖΙ ─────────────────────────────────────────────────────
// Το `checkout[custom][user_id]` είναι ο ΜΟΝΟΣ σύνδεσμος της πληρωμής με τον
// λογαριασμό — το webhook δεν έχει άλλον τρόπο να ξέρει ποιος πλήρωσε. Το
// `checkout[email]` είναι μόνο προσυμπλήρωση, ώστε να μην ξαναγράφει ο πελάτης
// αυτό που η εφαρμογή ήδη ξέρει.
// ═══════════════════════════════════════════════════════════════════════════

import { PLANS, type PlanId } from './plans';
import type { BillingCycle } from './lemon';

/** Το κλειδί ενός συνδέσμου: πακέτο και κύκλος, όπως και στον χάρτη παραλλαγών. */
export const linkKey = (plan: PlanId, cycle: BillingCycle): string => `${plan}:${cycle}`;

export interface CheckoutLinks {
  map: Map<string, string>;
  /** Κενό όταν όλα διαβάστηκαν. Αλλιώς τι ακριβώς δεν διαβάστηκε. */
  error: string;
}

const CYCLES: readonly BillingCycle[] = ['monthly', 'annual'];

/** Δεκτός σύνδεσμος αγοράς; Το «μοιάζει σωστό» δεν αρκεί όταν φεύγει πελάτης. */
export function isCheckoutUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  return u.hostname === 'lemonsqueezy.com' || u.hostname.endsWith('.lemonsqueezy.com');
}

export function parseCheckoutLinks(raw: string | undefined | null): CheckoutLinks {
  const map = new Map<string, string>();
  const text = (raw || '').trim();
  if (!text) return { map, error: 'Δεν έχουν οριστεί σύνδεσμοι αγοράς. Ορισε τη μεταβλητή LEMON_CHECKOUT_LINKS.' };

  const bad: string[] = [];
  for (const entry of text.split(',').map(e => e.trim()).filter(Boolean)) {
    const eq = entry.indexOf('=');
    if (eq < 0) { bad.push(`«${entry}»: περιμένει μορφή πακέτο:κύκλος=σύνδεσμος`); continue; }
    const key = entry.slice(0, eq).trim();
    const url = entry.slice(eq + 1).trim();
    const [plan, cycle] = key.split(':').map(p => (p || '').trim());
    if (!(plan in PLANS)) { bad.push(`«${key}»: άγνωστο πακέτο «${plan}»`); continue; }
    if (!CYCLES.includes(cycle as BillingCycle)) { bad.push(`«${key}»: άγνωστος κύκλος «${cycle}»`); continue; }
    if (!isCheckoutUrl(url)) { bad.push(`«${key}»: ο σύνδεσμος δεν είναι https σε lemonsqueezy.com`); continue; }
    if (map.has(key)) { bad.push(`«${key}»: ορίζεται δύο φορές`); continue; }
    map.set(key, url);
  }

  return { map, error: bad.length ? `Οι σύνδεσμοι αγοράς έχουν σφάλματα: ${bad.join(' · ')}` : '' };
}

/** Οσο από το περιβάλλον αφορά τη χρέωση. Ρητό, ώστε να μη διαβάζεται τίποτε άλλο. */
export type BillingEnv = Record<string, string | undefined>;

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
 * του άρθρου 28 GDPR — δήλωνε μηχαναγνώσιμα `active: false` για τον πάροχο
 * πληρωμών. Δέκα δηλώσεις σε πέντε αρχεία, καμία δεμένη με τον κώδικα.
 *
 * Η απάντηση δεν είναι να ξαναγραφτούν τα κείμενα — θα ξανα-αποκλίνουν την
 * επόμενη φορά. Είναι να μη ΓΡΑΦΟΝΤΑΙ πουθενά αλλού: μία συνθήκη, ίδια για το
 * κουμπί και για τη λέξη.
 */
export function checkoutIsLive(env: BillingEnv = process.env): boolean {
  const { map, error } = parseCheckoutLinks(env.LEMON_CHECKOUT_LINKS);
  return error === '' && map.size > 0;
}

export interface Buyer {
  /** Ο λογαριασμός μας. Χωρίς αυτόν η πληρωμή δεν προσγειώνεται πουθενά. */
  userId: string;
  email?: string | null;
}

/**
 * Ο σύνδεσμος αγοράς για ένα πακέτο. `null` όταν δεν έχει οριστεί.
 *
 * ΕΠΙΣΤΡΕΦΕΙ `null` ΑΝΤΙ ΝΑ ΦΤΙΑΞΕΙ ΚΑΤΙ. Ενας σύνδεσμος που δείχνει σε
 * ανύπαρκτο προϊόν στέλνει τον πελάτη σε σελίδα σφάλματος της Lemon Squeezy,
 * με τη δική μας μάρκα στην πλάτη. Καλύτερα να μην εμφανιστεί το κουμπί.
 */
export function checkoutUrl(links: Map<string, string>, plan: PlanId, cycle: BillingCycle, buyer: Buyer): string | null {
  const base = links.get(linkKey(plan, cycle));
  if (!base || !buyer.userId) return null;

  const u = new URL(base);
  u.searchParams.set('checkout[custom][user_id]', buyer.userId);
  const email = (buyer.email || '').trim();
  if (email) u.searchParams.set('checkout[email]', email);
  return u.toString();
}
