// ═══════════════════════════════════════════════════════════════════════════
// ΠΛΗΡΩΜΗ ΛΟΓΑΡΙΑΣΜΟΥ — ΜΙΑ ΑΠΟΦΑΣΗ, ΟΧΙ ΜΙΑ ΑΝΑ ΟΘΟΝΗ.
//
// ΤΟ ΠΡΟΒΛΗΜΑ, ΜΕΤΡΗΜΕΝΟ
// Το «Πληρώθηκε» υπήρχε σε δύο οθόνες και έγραφε ΔΙΑΦΟΡΕΤΙΚΑ πράγματα:
//
//   Λογαριασμοί → expense_group: 'fixed'   (από BILL_GROUP)
//   Δαπάνες     → expense_group: ΤΙΠΟΤΑ    (δεν το έγραφε καθόλου)
//
// Και το `isGroupDeductible` (lib/expenses/groups.ts) επιστρέφει false για κενή
// ομάδα. Δηλαδή ο ΙΔΙΟΣ λογαριασμός ΔΕΗ των 84,50 € ΕΞΕΠΙΠΤΕ ή ΟΧΙ ανάλογα με
// το ποιο κουμπί πάτησε ο χρήστης. Δύο οθόνες, δύο φορολογικά αποτελέσματα, για
// την ίδια πράξη — και καμία ένδειξη ότι κάτι διαφέρει.
//
// Δεύτερη, μικρότερη απόκλιση: το BILL_GROUP δεν είχε κλειδί `other` και έπεφτε
// σε `{ group: 'fixed' }`. Επειδή το 'fixed' είναι εκπεστέο και το 'other' δεν
// είναι, κάθε λογαριασμός «Άλλο» γινόταν σιωπηλά εκπεστέος.
//
// ΓΙΑΤΙ ΚΑΘΑΡΗ ΣΥΝΑΡΤΗΣΗ ΚΑΙ ΟΧΙ ΚΛΗΣΕΙΣ ΣΤΗ ΒΑΣΗ
// Η ΑΠΟΦΑΣΗ (τι γράφεται) ελέγχεται με tests χωρίς βάση· η ΕΚΤΕΛΕΣΗ (γράψιμο)
// μένει στην οθόνη, όπου ζει ο client. Έτσι η φορολογική συνέπεια δοκιμάζεται,
// αντί να επαληθεύεται με το μάτι σε δύο αρχεία.
// ═══════════════════════════════════════════════════════════════════════════

import { EXPENSE_MAP } from '../billing/parse';
import { BY_SLUG, resolveCategory } from './taxonomy';
import { groupForCategory } from './groups';
import { athensToday } from '../core/time';

/** Ό,τι χρειάζεται από τον λογαριασμό για να αποφασιστεί η πληρωμή. */
export interface BillToPay {
  id: string;
  name?: string | null;
  amount?: number | null;
  /** Το κλειδί κατηγορίας του λογαριασμού (electricity, water, …). */
  category?: string | null;
  paid_by?: string | null;
  share_percent?: number | null;
  share_note?: string | null;
}

export interface NewExpense {
  property_id: string;
  user_id: string;
  bill_id: string;
  amount: number;
  description: string;
  date: string;
  category: string;
  /** ΠΑΝΤΑ γραμμένο. Η κενή ομάδα σημαίνει «δεν εκπίπτει». */
  expense_group: string;
  paid: true;
  paid_by: string;
  share_percent: number | null;
  share_note: string | null;
}

export interface PaymentPlan {
  /** Τι γράφεται στον λογαριασμό. */
  bill: { paid: true; paid_at: string };
  /** Υπάρχει ήδη συνδεδεμένη δαπάνη → μόνο σήμανση, καμία νέα γραμμή. */
  linkedExpenseUpdate: { paid: true } | null;
  /** Δεν υπάρχει → δημιουργείται, με ΟΛΑ τα πεδία. */
  newExpense: NewExpense | null;
}

/**
 * Η κατηγορία και η ομάδα ενός λογαριασμού, από τη ΜΙΑ πηγή.
 *
 * Η ΟΜΑΔΑ ΔΕΝ ΔΙΑΒΑΖΕΤΑΙ ΑΠΟ ΤΟΝ ΠΙΝΑΚΑ. Το EXPENSE_MAP δίνει την ελληνική
 * ετικέτα, αλλά η ομάδα παράγεται από την ταξινομία (lib/expenses/groups.ts),
 * ώστε να μην υπάρχει δεύτερος άξονας που μπορεί να διαφωνήσει για το αν μια
 * δαπάνη εκπίπτει. Όπου η ταξινομία δεν ξέρει την κατηγορία, μένει η ομάδα του
 * χάρτη — και αν ούτε αυτός την ξέρει, «other», που δεν εκπίπτει.
 */
export function billCategory(category: string | null | undefined): { group: string; cat: string } {
  const key = String(category ?? '').trim();
  const mapped = EXPENSE_MAP[key] ?? EXPENSE_MAP.other;

  // ΤΟ ΛΑΘΟΣ: το `BY_SLUG[key]` ήταν ΑΚΡΙΒΗΣ αναζήτηση slug, αλλά τα κλειδιά των
  // λογαριασμών ΔΕΝ είναι slug της ταξινομίας. Πέντε δεν ταίριαζαν ΠΟΤΕ:
  //   taxes→enfia  streaming→subscription  cleaner→cleaning  gardener→garden
  //   maintenance→repair
  // Όσα αστοχούσαν έπαιρναν την ομάδα του ΧΑΡΤΗ — κι ο χάρτης λέει 'fixed' για
  // τα δύο πρώτα. Το 'fixed' ΕΚΠΙΠΤΕΙ, ενώ η ταξινομία έχει τον ΕΝΦΙΑ και τις
  // συνδρομές ρητά deductible:false. Δηλαδή ο ιδιοκτήτης που πάτησε «Πληρώθηκε»
  // σε λογαριασμό ΕΝΦΙΑ ή Netflix έπαιρνε δαπάνη σημειωμένη ως εκπεστέα: το
  // σύνολο εκπτώσεων φούσκωνε και θα δήλωνε έξοδα που ΔΕΝ εκπίπτουν, με κίνδυνο
  // προστίμου στον έλεγχο. Είναι ακριβώς οι δύο περιπτώσεις για τις οποίες
  // προειδοποιεί το lib/expenses/groups.ts — απλώς έμπαιναν από άλλη πόρτα.
  //
  // Η ελληνική ετικέτα του χάρτη είναι η γέφυρα: το «ΕΝΦΙΑ» και η «Άλλη Πάγια»
  // τα αναγνωρίζει η ταξινομία, οπότε η ομάδα ξαναβγαίνει από τη ΜΙΑ πηγή αντί
  // να την υπαγορεύει η δεύτερη στήλη του χάρτη.
  const known = BY_SLUG[key] ?? BY_SLUG[resolveCategory(mapped.cat) ?? ''];

  return { cat: mapped.cat, group: known ? groupForCategory(known) : mapped.group };
}

/**
 * Τι πρέπει να γραφτεί όταν πληρώνεται ένας λογαριασμός.
 *
 * `hasLinkedExpense`: το ξέρει ο καλών, ρωτώντας τη βάση για δαπάνη με αυτό το
 * bill_id. Περνιέται ως όρισμα ώστε η απόφαση να μένει καθαρή.
 */
export function planBillPayment(
  bill: BillToPay,
  ctx: { propertyId: string; userId: string; nowIso: string; hasLinkedExpense: boolean },
): PaymentPlan {
  const base = { bill: { paid: true as const, paid_at: ctx.nowIso } };

  // Υπάρχει ήδη δαπάνη για αυτόν τον λογαριασμό: ΔΕΝ φτιάχνουμε δεύτερη.
  // Το mergeLedger θα τη μετρούσε μία φορά, αλλά η δεύτερη γραμμή θα πήγαινε
  // στα duplicates και θα ζητούσε από τον χρήστη να την κοιτάξει χωρίς λόγο.
  if (ctx.hasLinkedExpense) {
    return { ...base, linkedExpenseUpdate: { paid: true }, newExpense: null };
  }

  const { group, cat } = billCategory(bill.category);
  return {
    ...base,
    linkedExpenseUpdate: null,
    newExpense: {
      property_id: ctx.propertyId,
      user_id: ctx.userId,
      bill_id: bill.id,
      amount: Number(bill.amount) || 0,
      description: (bill.name || '').trim() || cat,
      // ΗΜΕΡΟΛΟΓΙΑΚΗ ΗΜΕΡΑ ΑΘΗΝΑΣ, ΟΧΙ UTC.
      // Το `ctx.nowIso.slice(0, 10)` έκοβε τη στιγμή σε UTC. Ο ιδιοκτήτης που
      // πατούσε «Πληρώθηκε» στη 01:30 της 1ης Ιουλίου (θερινή ώρα, UTC+3)
      // έγραφε δαπάνη με ημερομηνία 30/06 — δηλαδή σε ΑΛΛΟ φορολογικό μήνα, και
      // στις 31 Δεκεμβρίου σε άλλο φορολογικό ΕΤΟΣ.
      date: athensToday(new Date(ctx.nowIso)),
      category: cat,
      expense_group: group,
      paid: true,
      paid_by: bill.paid_by || 'owner',
      share_percent: bill.share_percent ?? null,
      share_note: bill.share_note ?? null,
    },
  };
}
