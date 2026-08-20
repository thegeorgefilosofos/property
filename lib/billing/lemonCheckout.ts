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
