// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΠΡΟΣΘΕΤΑ: Ο,ΤΙ ΧΡΕΩΝΕΤΑΙ ΠΑΝΩ ΑΠΟ ΤΗΝ ΤΙΜΗ ΤΟΥ ΠΑΚΕΤΟΥ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ. Η σύνδεση με την τράπεζα ΜΑΣ κοστίζει ανά συνδεδεμένο
// λογαριασμό, κάθε μήνα, για όσο μένει συνδεδεμένος. Αν την περνούσαμε μέσα
// στην τιμή του πακέτου, θα την πλήρωναν και οι εννιά στους δέκα που δεν τη
// χρησιμοποιούν — δηλαδή θα ακρίβαινε το προϊόν για να είναι δωρεάν ένα
// χαρακτηριστικό. Και θα ήταν ζημιά σε κάθε χρήστη με τέσσερις λογαριασμούς.
//
// Ο ΚΑΝΟΝΑΣ ΤΗΣ ΔΙΑΦΑΝΕΙΑΣ, ΓΡΑΜΜΕΝΟΣ ΩΣ ΚΩΔΙΚΑΣ. Η τιμή του πακέτου είναι
// ΜΙΑ και δεν αλλάζει· το πρόσθετο εμφανίζεται ΜΟΝΟ στην τελική πληρωμή, ως
// δική του γραμμή, με τη μονάδα και το πλήθος του. Ο χρήστης δεν βλέπει ποτέ
// «9,90 €» στον τιμοκατάλογο και «13,90 €» στην κάρτα του χωρίς εξήγηση: το
// τιμολόγιο κουβαλά τις ίδιες γραμμές με την οθόνη της πληρωμής.
//
// ΓΙΑΤΙ Η ΤΙΜΗ ΕΙΝΑΙ ΑΚΟΜΗ `null`. Κανένας πάροχος open banking στην Ευρώπη
// δεν δημοσιεύει τιμοκατάλογο — η τιμή δίνεται με προσφορά. Ένας αριθμός
// γραμμένος εδώ «προσωρινά» θα ήταν υπόσχεση προς τον χρήστη πριν ξέρουμε το
// κόστος μας, δηλαδή ή ζημιά ή αναγγελία αύξησης. Όσο η τιμή είναι `null`, το
// πρόσθετο ΔΕΝ προσφέρεται πουθενά: `available()` false, καμία γραμμή στην
// πληρωμή, κανένα κουμπί στην οθόνη. Μπαίνει ένας αριθμός, ανοίγει μόνο του.
// ═══════════════════════════════════════════════════════════════════════════

import { PLANS, type PlanId } from './plans';
import { cents } from '@/lib/core/money'

export type AddonId = 'bank_link';

export interface Addon {
  id: AddonId;
  name: string;
  /** Η μονάδα χρέωσης, όπως γράφεται στο τιμολόγιο. */
  unit: string;
  /** Τιμή ανά μονάδα τον μήνα, σε ευρώ. `null` = δεν έχει οριστεί ακόμη. */
  priceMonthly: number | null;
  /** Η μία πρόταση που εξηγεί τη γραμμή στο τιμολόγιο. */
  invoiceNote: string;
}

export const ADDONS: Record<AddonId, Addon> = {
  bank_link: {
    id: 'bank_link',
    name: 'Σύνδεση με την τράπεζα',
    unit: 'ανά συνδεδεμένο λογαριασμό τον μήνα',
    priceMonthly: null,
    invoiceNote: 'Η χρέωση αφορά την άδεια ανάγνωσης κινήσεων μέσω αδειοδοτημένου παρόχου και υπολογίζεται ανά λογαριασμό που παραμένει συνδεδεμένος μέσα στον μήνα.',
  },
};

/** Προσφέρεται αυτή τη στιγμή; Χωρίς τιμή, δεν προσφέρεται. */
export const available = (id: AddonId): boolean => ADDONS[id].priceMonthly != null;

export interface CheckoutLine {
  key: string;
  label: string;
  /** Πλήθος μονάδων. Η συνδρομή είναι πάντα μία. */
  qty: number;
  unitPrice: number;
  total: number;
  /** Η επεξήγηση που συνοδεύει τη γραμμή στο τιμολόγιο. Κενή για τη συνδρομή. */
  note?: string;
}

export interface CheckoutInput {
  plan: PlanId;
  /** Ετήσια χρέωση; Τα πρόσθετα μένουν μηνιαία, γι' αυτό πολλαπλασιάζονται. */
  annual?: boolean;
  /** Ακίνητα πέρα από όσα περιλαμβάνει το πακέτο. */
  extraProperties?: number;
  /** Τραπεζικοί λογαριασμοί που θα μείνουν συνδεδεμένοι. */
  bankAccounts?: number;
}


const count = (n: number | undefined) => Math.max(0, Math.floor(n ?? 0));

/**
 * Οι γραμμές της τελικής πληρωμής, με τη σειρά που διαβάζονται: πρώτα η
 * συνδρομή, μετά ό,τι προστέθηκε πάνω της.
 *
 * ΤΑ ΠΡΟΣΘΕΤΑ ΕΙΝΑΙ ΠΑΝΤΑ ΜΗΝΙΑΙΑ, ΚΑΙ ΣΤΗΝ ΕΤΗΣΙΑ ΧΡΕΩΣΗ ΠΟΛΛΑΠΛΑΣΙΑΖΟΝΤΑΙ
 * ΕΠΙ ΔΩΔΕΚΑ. Ο πάροχος μάς χρεώνει κάθε μήνα που ο λογαριασμός μένει
 * συνδεδεμένος· έκπτωση στην ετήσια θα σήμαινε ότι πληρώνουμε εμείς τη διαφορά
 * για δώδεκα μήνες μπροστά, χωρίς να ξέρουμε αν ο χρήστης θα μείνει.
 */
export function checkoutLines(input: CheckoutInput): CheckoutLine[] {
  const plan = PLANS[input.plan];
  const months = input.annual ? 12 : 1;
  const lines: CheckoutLine[] = [];

  const planPrice = input.annual ? plan.priceAnnual : plan.priceMonthly;
  lines.push({
    key: 'plan',
    label: `Πακέτο ${plan.name}${input.annual ? ', ετήσια' : ''}`,
    qty: 1, unitPrice: cents(planPrice), total: cents(planPrice),
  });

  const extras = count(input.extraProperties);
  if (extras > 0 && plan.extraPropertyPrice > 0) {
    const unit = cents(plan.extraPropertyPrice * months);
    lines.push({
      key: 'extra_properties',
      label: 'Επιπλέον ακίνητα',
      qty: extras, unitPrice: unit, total: cents(unit * extras),
      note: `Πέρα από τα ${plan.maxProperties} που περιλαμβάνει το πακέτο.`,
    });
  }

  const accounts = count(input.bankAccounts);
  const bank = ADDONS.bank_link;
  if (accounts > 0 && bank.priceMonthly != null) {
    const unit = cents(bank.priceMonthly * months);
    lines.push({
      key: 'bank_link',
      label: bank.name,
      qty: accounts, unitPrice: unit, total: cents(unit * accounts),
      note: bank.invoiceNote,
    });
  }

  return lines;
}

export const checkoutTotal = (lines: readonly CheckoutLine[]): number =>
  cents(lines.reduce((s, l) => s + l.total, 0));

/**
 * Χρεώνεται κάτι πάνω από τη συνδρομή;
 *
 * Το χρειάζεται η οθόνη της πληρωμής για να ΜΗΝ εμφανίσει ανάλυση όταν δεν
 * υπάρχει τίποτα να αναλυθεί: μια «ανάλυση» μιας γραμμής είναι θόρυβος που
 * κάνει την απλή περίπτωση να μοιάζει περίπλοκη.
 */
export const hasExtras = (lines: readonly CheckoutLine[]): boolean => lines.length > 1;
