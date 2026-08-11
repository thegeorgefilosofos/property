// ═══════════════════════════════════════════════════════════════════════════
// ΑΠΟ ΤΗ ΣΥΝΔΡΟΜΗ ΣΤΗ ΔΑΠΑΝΗ — Η ΑΠΟΦΑΣΗ, ΧΩΡΙΣ ΒΑΣΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΚΕΝΟ. Ο χρήστης δήλωνε δεκαπέντε συνδρομές και τις έβλεπε σε μια κάρτα.
// Τίποτα άλλο. Δεν έμπαιναν στις δαπάνες, δεν έφταναν στη λογιστική, δεν
// έβγαιναν στο Excel του λογιστή. Ήταν λίστα, όχι κόστος.
//
// ΤΟ ΠΟΣΟΣΤΟ ΕΙΝΑΙ ΤΟ ΚΛΕΙΔΙ. Το Microsoft 365 ενός διαχειριστή ακινήτων είναι
// επαγγελματικό εργαλείο· το Netflix του δεν είναι. Και τα δύο χρεώνονται στην
// ίδια κάρτα. Κάθε συνδρομή δηλώνει ΤΙ ΠΟΣΟΣΤΟ της πηγαίνει στις δαπάνες, και
// στη δαπάνη γράφεται ΜΟΝΟ αυτό το κομμάτι — όχι όλο το ποσό με μια σημείωση
// «κατά 60%», που κανείς δεν διαβάζει τη στιγμή που αθροίζει.
//
// ΓΙΑΤΙ ΚΑΘΑΡΗ ΣΥΝΑΡΤΗΣΗ. Η ΑΠΟΦΑΣΗ (ποιο ποσό, ποια κατηγορία, ποιος φόρος)
// ελέγχεται με δοκιμές χωρίς βάση· η ΕΚΤΕΛΕΣΗ (γράψιμο) μένει στην οθόνη. Ίδιο
// μοτίβο με το lib/expenses/pay.ts, για τον ίδιο λόγο: μια φορολογική συνέπεια
// δεν επαληθεύεται με το μάτι.
// ═══════════════════════════════════════════════════════════════════════════

import { SUB_GROUPS, subShare, type SubscriptionEntry, type SubService } from './subscriptions';
import { supplyOf, reverseChargeVat, type Supply } from '../tax/placeOfSupply';
import { fn } from '../core/format';

/** Η κατηγορία δαπάνης των συνδρομών — μία, και οδηγεί στον κουβά «Συνδρομές». */
export const SUBSCRIPTION_CATEGORY = 'subscription';

/** Όλη η συνδρομή στις δαπάνες, όσο δεν έχει πει κάτι άλλο ο χρήστης. */
export const DEFAULT_EXPENSE_PCT = 100;

/**
 * Τα δύο πεδία που προσθέτει ο χρήστης πάνω σε μια ενεργή συνδρομή.
 *
 * Ζουν στις ίδιες ρυθμίσεις με την υπόλοιπη εγγραφή, γιατί είναι ιδιότητες ΤΗΣ
 * ΣΥΝΔΡΟΜΗΣ: πόσο από αυτήν είναι δαπάνη, και από ποια χώρα τιμολογείται.
 */
export interface BookableEntry extends SubscriptionEntry {
  /** 0–100. Απόν σημαίνει ολόκληρη. */
  expensePct?: number;
  /** ISO 3166-1 alpha-2, όπως το γράφει το παραστατικό. Κενό σημαίνει άγνωστη. */
  supplierCountry?: string;
}

export interface SubscriptionCharge {
  service: string;
  label: string;
  /** Το όνομα του πακέτου, για να αναγνωρίζεται η γραμμή στο καθολικό. */
  plan: string;
  /** Το μηνιαίο κόστος του χρήστη, μετά τον διαμοιρασμό με άλλα άτομα. */
  monthly: number;
  /** Πόσο από αυτό είναι δαπάνη. */
  expensePct: number;
  /** Το ποσό που γράφεται στις δαπάνες: `monthly × expensePct / 100`. */
  amount: number;
  supplierCountry: string;
  /** `null` όταν δεν έχει δηλωθεί χώρα. Άγνωστο, όχι «εγχώρια». */
  supply: Supply | null;
  /** Ο φόρος της αντίστροφης χρέωσης πάνω στο ποσό της δαπάνης. */
  reverseChargeVat: number;
  renewalDate: string;
}

/** 0–100, με το άγνωστο να σημαίνει ολόκληρη τη συνδρομή. */
export function expensePct(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  if (!Number.isFinite(n)) return DEFAULT_EXPENSE_PCT;
  return Math.min(100, Math.max(0, n));
}

/**
 * Κάθε ενεργή συνδρομή, με το ποσό που της αναλογεί στις δαπάνες.
 *
 * ΜΕΝΟΥΝ ΚΑΙ ΟΣΕΣ ΕΧΟΥΝ ΜΗΔΕΝ ΠΟΣΟΣΤΟ. Η οθόνη πρέπει να τις δείχνει για να
 * αλλάξει ο χρήστης το ποσοστό· το φιλτράρισμα γίνεται τη στιγμή της εγγραφής,
 * όχι εδώ. Μια λίστα που κρύβει ό,τι δεν καταχωρείται δεν εξηγεί γιατί λείπει.
 */
export function subscriptionCharges(section: unknown): SubscriptionCharge[] {
  if (!section || typeof section !== 'object') return [];
  const s = section as Record<string, unknown>;
  const out: SubscriptionCharge[] = [];

  for (const g of SUB_GROUPS) {
    const list = Array.isArray(s[g.key]) ? (s[g.key] as BookableEntry[]) : [];
    for (const a of list) {
      const svc: SubService | undefined = g.catalog.find(x => x.value === a.service);
      if (!svc) continue;
      const monthly = subShare(svc, a);
      const pct = expensePct(a.expensePct);
      const amount = monthly * (pct / 100);
      const country = String(a.supplierCountry ?? '').trim();
      const supply = supplyOf(country);
      out.push({
        service: a.service,
        label: svc.label,
        plan: svc.plans.find(p => p.id === a.planId)?.name ?? '',
        monthly,
        expensePct: pct,
        amount,
        supplierCountry: country,
        supply,
        reverseChargeVat: supply ? reverseChargeVat(amount, supply).vat : 0,
        renewalDate: a.renewalDate || '',
      });
    }
  }
  return out;
}

/** Το μηνιαίο σύνολο που πηγαίνει στις δαπάνες, μετά τα ποσοστά. */
export function bookableTotal(charges: SubscriptionCharge[]): number {
  return charges.reduce((s, c) => s + c.amount, 0);
}

/** Πόσος φόρος αποδίδεται με αντίστροφη χρέωση για τον μήνα. */
export function reverseChargeTotal(charges: SubscriptionCharge[]): number {
  return charges.reduce((s, c) => s + c.reverseChargeVat, 0);
}

/**
 * Όσες συνδρομές έρχονται απέξω και ΔΕΝ έχουν δηλωμένη χώρα.
 *
 * Δεν είναι σφάλμα του χρήστη: είναι ερώτηση που δεν του έγινε ποτέ. Η οθόνη τη
 * ρωτά μία φορά ανά υπηρεσία, και ο λογιστής δεν βρίσκει έκπληξη τον Απρίλιο.
 */
export function missingCountry(charges: SubscriptionCharge[]): SubscriptionCharge[] {
  return charges.filter(c => c.amount > 0 && c.supply === null);
}

/** Η ημέρα της χρέωσης μέσα στον μήνα: η ημέρα ανανέωσης, αλλιώς η πρώτη. */
export function chargeDate(month: string, renewalDate: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  const lastDay = new Date(y, m, 0).getDate();
  const day = Number(renewalDate.split('-')[2]) || 1;
  return `${month}-${String(Math.min(Math.max(day, 1), lastDay)).padStart(2, '0')}`;
}

/**
 * Η γραμμή δαπάνης, όπως γράφεται. Επιστρέφει το σχήμα του `ExpenseDraft`
 * (lib/data/expenses) χωρίς να το εισάγει: εκείνο κουβαλά τον τύπο της βάσης,
 * και αυτό εδώ οφείλει να μένει δοκιμάσιμο χωρίς Supabase.
 */
export interface SubscriptionExpense {
  description: string;
  amount: number;
  category: string;
  date: string;
  paid: true;
  is_recurring: true;
  recurring_frequency: 'monthly';
  /** Το αναγνωριστικό της υπηρεσίας: πάνω σε αυτό κρίνεται τι έχει ήδη γραφτεί. */
  store_vendor: string;
  share_percent: number | null;
  share_note: string | null;
  notes: string;
}

/**
 * ΤΙ ΓΡΑΦΕΤΑΙ, ΚΑΙ ΤΙ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ.
 *
 * Το `recorded` κρατά τις υπηρεσίες που έχουν ήδη δαπάνη αυτόν τον μήνα. Χωρίς
 * αυτό, δύο πατήματα του κουμπιού θα έγραφαν το Netflix δύο φορές και ο μήνας
 * θα έδειχνε διπλάσιο κόστος — σφάλμα που δεν φαίνεται, γιατί και οι δύο
 * γραμμές είναι σωστές από μόνες τους.
 *
 * Οι μηδενικές δεν γράφονται καθόλου: μηδέν ευρώ σε καθολικό δαπανών είναι
 * θόρυβος, όχι πληροφορία.
 */
export function toExpenses(
  charges: SubscriptionCharge[],
  opts: { month: string; recorded?: ReadonlySet<string> },
): SubscriptionExpense[] {
  const recorded = opts.recorded ?? new Set<string>();
  return charges
    .filter(c => c.amount > 0 && !recorded.has(c.service))
    .map(c => ({
      description: c.plan ? `${c.label}, ${c.plan}` : c.label,
      amount: Math.round(c.amount * 100) / 100,
      category: SUBSCRIPTION_CATEGORY,
      date: chargeDate(opts.month, c.renewalDate),
      paid: true as const,
      is_recurring: true as const,
      recurring_frequency: 'monthly' as const,
      store_vendor: c.service,
      share_percent: c.expensePct < 100 ? c.expensePct : null,
      share_note: c.expensePct < 100 ? 'Ποσοστό επαγγελματικής χρήσης' : null,
      notes: noteFor(c),
    }));
}

/**
 * Η σημείωση της γραμμής: μόνο ό,τι δεν φαίνεται από το ίδιο το ποσό.
 *
 * Πλήρης συνδρομή από Έλληνα πάροχο δεν χρειάζεται σημείωση — το ποσό τα λέει
 * όλα. Οτιδήποτε άλλο (μερική χρήση, φόρος που αποδίδει ο λήπτης) γράφεται,
 * γιατί ο λογιστής θα ρωτήσει ακριβώς αυτό.
 */
function noteFor(c: SubscriptionCharge): string {
  const parts: string[] = [];
  if (c.expensePct < 100) {
    parts.push(`${fn(c.expensePct, 2)}% από ${fn(c.monthly, 2)} € τον μήνα`);
  }
  if (c.supply === 'intra_eu') parts.push(`Ενδοκοινοτική λήψη, ΦΠΑ ${fn(c.reverseChargeVat, 2)} € με αντίστροφη χρέωση`);
  if (c.supply === 'third_country') parts.push(`Λήψη από τρίτη χώρα, ΦΠΑ ${fn(c.reverseChargeVat, 2)} € με αντίστροφη χρέωση`);
  return parts.join('. ');
}
