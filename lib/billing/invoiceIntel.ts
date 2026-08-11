// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΞΕΡΕΙ ΤΟ APP ΜΟΛΙΣ ΔΕΙ ΕΝΑ ΠΑΡΑΣΤΑΤΙΚΟ
// ─────────────────────────────────────────────────────────────────────────
// Ο χρήστης δεν θα συμπληρώσει φόρμα. Θα φωτογραφίσει το τιμολόγιο, ή θα πει
// στον βοηθό «πληρώνω το Netflix». Ό,τι μπορεί να βγει από το χαρτί ΔΕΝ
// ρωτιέται — και ό,τι βγαίνει, το ξέρουν ΟΛΑ τα σημεία της εφαρμογής: ο
// Προϋπολογισμός, οι Δαπάνες, το Ημερολόγιο, η Λογιστική, ο βοηθός.
//
// ΕΔΩ ΖΕΙ Η ΣΥΝΑΓΩΓΗ, ΟΧΙ Η ΑΝΑΓΝΩΣΗ. Η ανάγνωση της εικόνας γίνεται μία φορά,
// στο scanDoc.ts. Αυτό το αρχείο παίρνει τα πεδία που διαβάστηκαν και βγάζει τα
// συμπεράσματα: πού φορολογείται, πότε λήγει, πότε ειδοποιούμε, τι συντελεστής
// ΦΠΑ γράφτηκε. Καθαρές συναρτήσεις, δοκιμάσιμες χωρίς εικόνα και χωρίς βάση.
//
// ΤΙΠΟΤΑ ΔΕΝ ΜΑΝΤΕΥΕΤΑΙ. Κάθε συνάρτηση εδώ επιστρέφει `null` όταν το χαρτί δεν
// το λέει. Ένα συμπέρασμα από άγνοια σε φορολογικό πεδίο δεν είναι εκτίμηση,
// είναι λάθος που ταξιδεύει ώς τη δήλωση ΦΠΑ.
// ═══════════════════════════════════════════════════════════════════════════

import { supplyOf, type Supply } from '../tax/placeOfSupply';
import { isValidAfm, afmDigits } from '../core/greek';

/**
 * ΤΟ ΠΡΟΘΕΜΑ ΤΟΥ ΑΡΙΘΜΟΥ ΦΠΑ ΕΙΝΑΙ Η ΧΩΡΑ, ΚΑΙ ΤΟ ΓΡΑΦΕΙ ΚΑΘΕ ΤΙΜΟΛΟΓΙΟ.
 *
 * «IE6388047V», «NL857927374B01», «LU26375245»: τα δύο πρώτα γράμματα είναι ο
 * κωδικός του κράτους μέλους. Δεν χρειάζεται να ξέρουμε ποια εταιρεία είναι —
 * το ίδιο το παραστατικό το δηλώνει, και είναι υποχρεωμένο να το δηλώνει.
 *
 * Το «EL» της Ελλάδας μεταφράζεται σε «GR» από τη `supplyOf`, που ξέρει και τα
 * δύο. Εδώ επιστρέφεται όπως γράφτηκε.
 */
export function countryFromVatNumber(vat: string | null | undefined): string {
  const m = String(vat ?? '').trim().toUpperCase().match(/^([A-Z]{2})[0-9A-Z]{2,}$/);
  return m ? m[1] : '';
}

/** Τα πεδία του παραστατικού που κρίνουν τον τόπο παροχής. */
export interface SupplyEvidence {
  /** Χώρα έδρας του εκδότη, όπως διαβάστηκε (ISO 3166-1 alpha-2). */
  provider_country?: string | null;
  /** Ο αριθμός ΦΠΑ του εκδότη, με το πρόθεμα κράτους μέλους. */
  provider_vat?: string | null;
  /** Το ΑΦΜ του εκδότη: εννέα ψηφία σημαίνει ελληνικό μητρώο. */
  provider_afm?: string | null;
}

/**
 * Η ΧΩΡΑ ΤΟΥ ΕΚΔΟΤΗ, ΑΠΟ ΤΡΕΙΣ ΠΗΓΕΣ ΜΕ ΣΕΙΡΑ ΒΕΒΑΙΟΤΗΤΑΣ.
 *
 *   1. Η χώρα, όταν γράφεται ρητά.
 *   2. Το πρόθεμα του αριθμού ΦΠΑ — το γράφει το ίδιο το παραστατικό.
 *   3. Έγκυρο ελληνικό ΑΦΜ εννέα ψηφίων: μόνο η ελληνική ΑΑΔΕ εκδίδει τέτοιο,
 *      και περνά το checksum της. Δεν είναι εικασία, είναι ταυτοποίηση.
 *
 * Ο έλεγχος checksum ΔΕΝ παραλείπεται: εννέα οποιαδήποτε ψηφία δεν είναι ΑΦΜ,
 * και ένας αριθμός τιμολογίου ή ένα IBAN κομμένο θα περνούσαν για ελληνικό
 * μητρώο, στέλνοντας μια ενδοκοινοτική λήψη στις εγχώριες δαπάνες.
 */
export function providerCountry(doc: SupplyEvidence): string {
  const explicit = String(doc.provider_country ?? '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(explicit)) return explicit;

  const fromVat = countryFromVatNumber(doc.provider_vat);
  if (fromVat) return fromVat;

  return isValidAfm(doc.provider_afm) ? 'GR' : '';
}

/** Ο τόπος παροχής του παραστατικού. `null` όταν το χαρτί δεν αρκεί. */
export function docSupply(doc: SupplyEvidence): Supply | null {
  return supplyOf(providerCountry(doc));
}

// ── Ο ΣΥΝΤΕΛΕΣΤΗΣ ΦΠΑ ──────────────────────────────────────────────────────

/** Οι ελληνικοί συντελεστές. Ό,τι δεν είναι εδώ, δεν είναι ελληνικό τιμολόγιο. */
export const GREEK_VAT_RATES = [0, 6, 13, 24] as const;

export interface VatEvidence {
  /** Ο συντελεστής, όταν γράφεται ρητά («ΦΠΑ 24%»). */
  vat_rate?: number | null;
  /** Το ποσό του φόρου, όταν γράφεται ξεχωριστά. */
  vat_amount?: number | null;
  /** Η καθαρή αξία προ φόρου. */
  net_amount?: number | null;
  /** Το τελικό πληρωτέο. */
  amount?: number | null;
}

/**
 * Ο ΣΥΝΤΕΛΕΣΤΗΣ, ΓΡΑΜΜΕΝΟΣ Ή ΥΠΟΛΟΓΙΣΜΕΝΟΣ.
 *
 * Αν το χαρτί γράφει «24%», αυτό ισχύει. Αλλιώς βγαίνει από τα ποσά — και μόνο
 * αν πέφτει ΑΚΡΙΒΩΣ πάνω σε ελληνικό συντελεστή, με ανοχή μισής μονάδας για τις
 * στρογγυλοποιήσεις του εκδότη. Ένα «23,7%» δεν στρογγυλοποιείται σε 24: θα
 * σήμαινε ότι διαβάσαμε λάθος κάποιο από τα δύο ποσά, και το σωστό είναι να το
 * πούμε άγνωστο αντί να το κουμπώσουμε.
 */
export function vatRateOf(e: VatEvidence): number | null {
  const stated = Number(e.vat_rate);
  if (Number.isFinite(stated) && stated >= 0 && stated <= 30) return stated;

  const net = Number(e.net_amount);
  const vat = Number(e.vat_amount);
  const gross = Number(e.amount);

  const base = Number.isFinite(net) && net > 0 ? net
    : (Number.isFinite(gross) && Number.isFinite(vat) && gross > vat ? gross - vat : NaN);
  if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(vat) || vat < 0) return null;

  const pct = (vat / base) * 100;
  const hit = GREEK_VAT_RATES.find(r => Math.abs(pct - r) <= 0.5);
  return hit ?? null;
}

// ── ΠΟΤΕ ΞΑΝΑΧΡΕΩΝΕΤΑΙ ─────────────────────────────────────────────────────

/**
 * Η περίοδος χρέωσης, όπως τη γράφουν τα παραστατικά.
 *
 * Το `once` δεν είναι συνδρομή: μια εφάπαξ δαπάνη δεν λήγει και δεν ανανεώνεται,
 * οπότε δεν παράγει ούτε υπενθύμιση ούτε γεγονός ημερολογίου.
 */
export type BillingPeriod = 'monthly' | 'bimonthly' | 'quarterly' | 'semiannual' | 'yearly' | 'once';

const MONTHS_OF: Record<BillingPeriod, number> = {
  monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, yearly: 12, once: 0,
};

export const PERIOD_LABEL: Record<BillingPeriod, string> = {
  monthly: 'Μηνιαία', bimonthly: 'Ανά δίμηνο', quarterly: 'Ανά τρίμηνο',
  semiannual: 'Ανά εξάμηνο', yearly: 'Ετήσια', once: 'Εφάπαξ',
};

/**
 * Ό,τι γράφτηκε στο χαρτί, σε μία από τις έξι περιόδους.
 *
 * ΟΙ ΤΟΝΟΙ ΦΕΥΓΟΥΝ ΠΡΩΤΑ. Το χαρτί γράφει «Ετήσια», «ετησια», «ΕΤΗΣΙΑ» — τρεις
 * γραφές της ίδιας λέξης, και μια σύγκριση με τόνο πιάνει τη μία στις τρεις.
 *
 * ΚΑΙ Η ΣΕΙΡΑ ΕΙΝΑΙ ΜΕΡΟΣ ΤΟΥ ΚΑΝΟΝΑ: το «μην» ζει μέσα στο «τριμηνιαία» και
 * στο «εξαμηνιαία». Οι σύνθετες ελέγχονται πρώτες, η μηνιαία τελευταία, αλλιώς
 * κάθε τρίμηνο θα γινόταν μήνας και η υπενθύμιση θα χτυπούσε οκτώ φορές τον
 * χρόνο για κάτι που χρεώνεται τέσσερις.
 */
export function billingPeriod(raw: string | null | undefined): BillingPeriod | null {
  const s = String(raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (!s) return null;
  if (s in MONTHS_OF) return s as BillingPeriod;
  // Οι αριθμημένες μορφές πάνε από τη ΜΕΓΑΛΥΤΕΡΗ προς τη μικρότερη: το «12 μήνες»
  // περιέχει «2 μήνες», και ένα ετήσιο συμβόλαιο θα γινόταν διμηνιαίο.
  if (/ετησ|χρον|year|annual|12 μην/.test(s)) return 'yearly';
  if (/εξαμην|semi|6 μην/.test(s)) return 'semiannual';
  if (/τριμην|quarter|3 μην/.test(s)) return 'quarterly';
  if (/διμην|bimonth|2 μην/.test(s)) return 'bimonthly';
  if (/εφαπαξ|απαξ|once/.test(s)) return 'once';
  if (/μην|month/.test(s)) return 'monthly';
  return null;
}

/** Προσθέτει μήνες σε ημερομηνία, χωρίς να ξεχειλίσει σε επόμενο μήνα. */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * ΠΟΤΕ ΛΗΓΕΙ Η ΣΥΝΔΡΟΜΗ ΠΟΥ ΜΟΛΙΣ ΣΑΡΩΘΗΚΕ.
 *
 * Από την ημερομηνία έκδοσης και την περίοδο. Η 31η Ιανουαρίου με μηνιαία
 * χρέωση δίνει 28 Φεβρουαρίου, όχι 3 Μαρτίου: η ημερομηνία που ξεχειλίζει σε
 * επόμενο μήνα θα έστελνε την υπενθύμιση ΜΕΤΑ τη χρέωση, δηλαδή αφού ο χρήστης
 * πλήρωσε αυτό που ήθελε να ακυρώσει.
 */
export function nextRenewal(issueDate: string | null | undefined, period: BillingPeriod | null): string {
  const iso = String(issueDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !period || period === 'once') return '';
  return addMonths(iso, MONTHS_OF[period]);
}

/** Τρεις ημέρες πριν: αρκετές για να ακυρώσεις, λίγες για να μην ξεχαστεί. */
export const REMINDER_DAYS_BEFORE = 3;

/**
 * Πότε ειδοποιείται ο χρήστης. Κενό όταν η ημερομηνία λήξης δεν ξέρουμε ποια
 * είναι — μια υπενθύμιση σε άγνωστη ημέρα είναι χειρότερη από καμία.
 */
export function reminderDate(renewal: string, daysBefore: number = REMINDER_DAYS_BEFORE): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(renewal)) return '';
  const [y, m, d] = renewal.split('-').map(Number);
  const dt = new Date(y, m - 1, d - Math.max(0, daysBefore));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// ── ΤΙ ΛΕΕΙ Ο ΒΟΗΘΟΣ ───────────────────────────────────────────────────────

export interface DeductionContext {
  /** Έχει επιχείρηση ο χρήστης; Χωρίς αυτό δεν τίθεται θέμα έκπτωσης. */
  business: boolean;
  /** Ο τόπος παροχής, όταν τον ξέρουμε. */
  supply: Supply | null;
  /** Τι ποσοστό της δαπάνης αφορά την επιχείρηση. */
  expensePct?: number;
}

/**
 * Η ΑΠΑΝΤΗΣΗ ΤΟΥ ΒΟΗΘΟΥ, ΣΕ ΠΡΟΤΑΣΕΙΣ ΠΟΥ ΣΤΕΚΟΥΝ.
 *
 * ΓΙΑΤΙ ΔΕΝ ΛΕΕΙ «ΕΚΠΙΠΤΕΙ». Η έκπτωση μιας δαπάνης κρίνεται από το αν
 * εξυπηρετεί το συμφέρον της επιχείρησης, αν αντιστοιχεί σε πραγματική
 * συναλλαγή και αν έχει νόμιμο παραστατικό (ν. 4172/2013, άρθρο 22). Τα δύο
 * πρώτα τα ξέρει μόνο ο χρήστης. Ο βοηθός λέει ΤΙ ΙΣΧΥΕΙ και τι πρέπει να
 * κοιτάξει· δεν υπογράφει τη δήλωσή του.
 *
 * Επιστρέφει προτάσεις, όχι παράγραφο: ο καλών τις ενώνει όπως του ταιριάζει,
 * και οι δοκιμές ελέγχουν την καθεμιά χωριστά.
 */
export function deductionNotes(c: DeductionContext): string[] {
  if (!c.business) {
    return ['Ως ιδιώτης δεν εκπίπτεις δαπάνες συνδρομών: ο πάροχος χρεώνει τον ΦΠΑ και εκεί τελειώνει.'];
  }

  const out: string[] = [];
  const pct = c.expensePct ?? 100;
  out.push(pct >= 100
    ? 'Η δαπάνη εκπίπτει στο σύνολό της, εφόσον εξυπηρετεί την επιχείρηση και έχεις νόμιμο παραστατικό.'
    : `Εκπίπτει το ${pct}% που δήλωσες ως επαγγελματική χρήση, εφόσον έχεις νόμιμο παραστατικό.`);

  if (c.supply === 'intra_eu') {
    out.push('Ενδοκοινοτική λήψη υπηρεσιών: ο πάροχος δεν χρεώνει ΦΠΑ, τον αποδίδεις εσύ με αντίστροφη χρέωση.');
    out.push('Η λήψη δηλώνεται στον ανακεφαλαιωτικό πίνακα, και χρειάζεσαι εγγραφή στο μητρώο VIES.');
  } else if (c.supply === 'third_country') {
    out.push('Λήψη από τρίτη χώρα: ο φόρος αποδίδεται με αντίστροφη χρέωση, χωρίς ανακεφαλαιωτικό πίνακα.');
  } else if (c.supply === 'domestic') {
    out.push('Εγχώρια δαπάνη: ο ΦΠΑ είναι ήδη πάνω στο παραστατικό και εκπίπτει με τους γενικούς κανόνες.');
  } else {
    out.push('Δεν ξέρω πού είναι η έδρα του παρόχου, οπότε δεν μπορώ να πω αν είναι ενδοκοινοτική λήψη. '
      + 'Η χώρα γράφεται στο παραστατικό, δίπλα στον αριθμό ΦΠΑ του.');
  }
  return out;
}
