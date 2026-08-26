// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΜΗΤΡΩΟ ΙΣΧΥΟΣ: ΚΑΘΕ ΝΟΥΜΕΡΟ ΤΟΥ ΚΡΑΤΟΥΣ ΞΕΡΕΙ ΠΟΤΕ ΛΗΓΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ, ΓΡΑΜΜΕΝΟ ΟΠΩΣ ΕΙΝΑΙ. Οι κλίμακες φόρου, τα κλιμάκια του ΕΝΦΙΑ,
// οι συντελεστές του ΤΑΚΚ, το τέλος ανθεκτικότητας και τα κρατικά προγράμματα
// δανείων ισχύουν για ΕΝΑ έτος. Η εφαρμογή τα γράφει σωστά για το 2026. Την 1η
// Ιανουαρίου 2027 κάποια από αυτά θα είναι λάθος και ΤΙΠΟΤΑ δεν θα το πει: ο
// τύπος είναι σωστός, το τεστ περνά, η οθόνη δείχνει έναν αριθμό με σιγουριά.
//
// Ενας υπολογισμός που ήταν σωστός και σιωπηλά έγινε λάθος είναι χειρότερος από
// υπολογισμό που δεν υπήρξε ποτέ: ο χρήστης τον έχει ήδη εμπιστευτεί, τον έχει
// δείξει στον λογιστή του και έχει πάρει απόφαση πάνω του.
//
// ΤΙ ΚΑΝΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ. Κάθε ρυθμιζόμενο μέγεθος δηλώνεται εδώ ΜΙΑ φορά, με
// τέσσερα πράγματα που κανένα δεν είναι γνώμη:
//
//   ώς πότε ισχύει   (`validTo`)
//   πού ζει          (`where`, το αρχείο που κρατά την τιμή)
//   από πού βγήκε    (`source`, νόμος ή επίσημη σελίδα)
//   πότε ελέγχθηκε   (`checkedAt`, από άνθρωπο, με το μάτι)
//
// Ο φύλακας `scripts/guard-validity.mjs` κοκκινίζει όταν κάτι έληξε, όταν λήγει
// μέσα στις επόμενες 45 ημέρες ή όταν δεν έχει ελεγχθεί πάνω από 12 μήνες. Η
// σελίδα «Ισχύς δεδομένων» δείχνει το ίδιο μητρώο στον ιδιοκτήτη του προϊόντος,
// ταξινομημένο κατά ημερομηνία λήξης.
//
// ΓΙΑΤΙ ΜΗΤΡΩΟ ΚΑΙ ΟΧΙ ΣΧΟΛΙΟ ΔΙΠΛΑ ΣΤΗΝ ΤΙΜΗ. Ενα σχόλιο δεν κοκκινίζει. Το
// μητρώο είναι δεδομένα, άρα διαβάζεται από φύλακα, από cron και από οθόνη.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ. Δεν κατεβάζει νόμους και δεν μαντεύει. Λέει ΠΟΤΕ πρέπει να
// κοιτάξει άνθρωπος και ΠΟΥ, με τον σύνδεσμο έτοιμο. Το «άνοιξε αυτή τη σελίδα
// και δες αν άλλαξε» είναι δουλειά δέκα λεπτών· το «δεν ήξερα ότι άλλαξε» είναι
// λάθος υπολογισμός σε κάθε χρήστη για έναν χρόνο.
// ═══════════════════════════════════════════════════════════════════════════

import { AADE_HOME } from '@/lib/tax/aade';

/** Πόσο νωρίς θέλουμε προειδοποίηση πριν από τη λήξη. */
export const WARN_DAYS = 45;

/** Πάνω από τόσους μήνες χωρίς ανθρώπινο έλεγχο, η τιμή θεωρείται αβέβαιη. */
export const RECHECK_MONTHS = 12;

export type Regulated = {
  /** Σταθερό αναγνωριστικό. Δεν αλλάζει όταν αλλάζει η τιμή. */
  id: string;
  /** Τι είναι, στα ελληνικά, όπως θα το έλεγε ο χρήστης. */
  label: string;
  /** Το αρχείο που κρατά την τιμή. Αν μετακινηθεί, ο φύλακας το βρίσκει κενό. */
  where: string;
  /** Πρώτη ημέρα ισχύος (ISO). */
  validFrom: string;
  /**
   * Τελευταία ημέρα ισχύος (ISO), ή `null` όταν η ρύθμιση δεν έχει ημερομηνία
   * λήξης στον νόμο. Το `null` ΔΕΝ σημαίνει «δεν χρειάζεται έλεγχος»: το
   * `checkedAt` ισχύει και εκεί.
   */
  validTo: string | null;
  /** Ο νόμος ή η επίσημη σελίδα. Ανοίγει με ένα κλικ από τη σελίδα ισχύος. */
  source: string;
  /** Πότε το είδε άνθρωπος τελευταία φορά (ISO). */
  checkedAt: string;
  /** Τι πρέπει να κοιτάξει ο άνθρωπος όταν έρθει η ώρα. Μία πρόταση. */
  recheck: string;
};

/**
 * ΤΟ ΜΗΤΡΩΟ.
 *
 * Η σειρά είναι θεματική, όχι χρονολογική: ταξινομεί η οθόνη και ο φύλακας.
 * Καθε εγγραφή προστίθεται ΜΑΖΙ με την τιμή που περιγράφει, ποτέ μετά.
 */
export const REGULATED: readonly Regulated[] = [
  // ── Φόρος εισοδήματος από ακίνητα ────────────────────────────────────────
  {
    id: 'rental-brackets',
    label: 'Κλίμακα φόρου εισοδήματος από ακίνητα',
    where: 'lib/billing/greekTax.ts',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: 'https://www.et.gr/api/DownloadFeksApi/?fek_pdf=20250100201',
    checkedAt: '2026-08-26',
    recheck: 'Αν άλλαξαν τα όρια ή οι συντελεστές των κλιμακίων για το επόμενο έτος, πρόσθεσε ΝΕΑ κλίμακα με το έτος της· η παλιά μένει για τις δηλώσεις που υποβάλλονται αναδρομικά.',
  },
  {
    id: 'business-brackets',
    label: 'Κλίμακα φόρου επιχειρηματικής δραστηριότητας',
    where: 'lib/billing/greekTax.ts',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: `${AADE_HOME}/polites/eisodima`,
    checkedAt: '2026-08-26',
    recheck: 'Ίδια εξέταση με την κλίμακα ενοικίων: όρια και συντελεστές ανά κλιμάκιο.',
  },
  {
    id: 'self-employed-min-income',
    label: 'Τεκμαρτό ελάχιστο καθαρό εισόδημα ελεύθερου επαγγελματία',
    where: 'lib/billing/greekTax.ts',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: `${AADE_HOME}/polites/eisodima`,
    checkedAt: '2026-08-26',
    recheck: 'Το ποσό αναπροσαρμόζεται με τον κατώτατο μισθό. Πρόσθεσε νέα χρονιά στο SELF_EMPLOYED_MIN_NET_INCOME· μην αντικαταστήσεις την παλιά.',
  },
  {
    id: 'advance-tax',
    label: 'Συντελεστές προκαταβολής φόρου',
    where: 'lib/billing/greekTax.ts',
    validFrom: '2026-01-01',
    validTo: null,
    source: `${AADE_HOME}/polites/eisodima`,
    checkedAt: '2026-08-26',
    recheck: 'Μένουν σταθεροί επί χρόνια. Έλεγχος μία φορά τον χρόνο, μαζί με τις κλίμακες.',
  },
  {
    id: 'depreciation-rates',
    label: 'Συντελεστές απόσβεσης κτιρίων και εξοπλισμού',
    where: 'lib/billing/greekTax.ts',
    validFrom: '2026-01-01',
    validTo: null,
    source: `${AADE_HOME}/epiheiriseis/forologikes-ypiresies/eisodima`,
    checkedAt: '2026-08-26',
    recheck: 'Ο πίνακας του άρθρου 24 ΚΦΕ. Αλλάζει σπάνια· ελέγχεται μαζί με τα υπόλοιπα.',
  },

  // ── ΕΝΦΙΑ ────────────────────────────────────────────────────────────────
  {
    id: 'enfia-coefficients',
    label: 'Συντελεστές ΕΝΦΙΑ: ζώνη, όροφος, παλαιότητα',
    where: 'lib/billing/enfia.ts',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: `${AADE_HOME}/polites/enfia`,
    checkedAt: '2026-08-26',
    recheck: 'Οι συντελεστές αλλάζουν όταν αναπροσαρμόζονται οι αντικειμενικές αξίες. Δες αν εκδόθηκε νέα απόφαση ζωνών.',
  },
  {
    id: 'enfia-thresholds',
    label: 'Οριο συμπληρωματικού ΕΝΦΙΑ και αφορολόγητο περιουσίας',
    where: 'lib/billing/enfia.ts',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: `${AADE_HOME}/polites/enfia`,
    checkedAt: '2026-08-26',
    recheck: 'Τα 500.000 €, 400.000 € και 300.000 € του συμπληρωματικού. Ελεγξε αν μετακινήθηκαν.',
  },
  {
    id: 'enfia-instalments',
    label: 'Πλήθος και προθεσμίες δόσεων ΕΝΦΙΑ',
    where: 'lib/tax/greekTaxCalendar.ts',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: `${AADE_HOME}/polites/enfia`,
    checkedAt: '2026-08-26',
    recheck: 'Οι προθεσμίες ορίζονται κάθε χρόνο με απόφαση. Ενημέρωσε το ημερολόγιο υποχρεώσεων.',
  },

  // ── Βραχυχρόνια μίσθωση ──────────────────────────────────────────────────
  {
    id: 'climate-levy',
    label: 'Τέλος ανθεκτικότητας στην κλιματική κρίση (ΤΑΚΚ)',
    where: 'lib/billing/greekTax.ts',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: `${AADE_HOME}/epiheiriseis/forologikes-ypiresies/telos-anthektikotitas-stin-klimatiki-krisi`,
    checkedAt: '2026-08-26',
    recheck: 'Τα ποσά ανά διανυκτέρευση διαφέρουν χειμώνα και καλοκαίρι, ανά κατηγορία καταλύματος. Ελεγξε και τα δύο.',
  },
  {
    id: 'municipal-accommodation-tax',
    label: 'Δημοτικός φόρος διαμονής',
    where: 'lib/billing/greekTax.ts',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: `${AADE_HOME}/epiheiriseis/forologikes-ypiresies`,
    checkedAt: '2026-08-26',
    recheck: 'Ο συντελεστής 0,5% επί του τζίρου. Ελεγξε αν άλλαξε ή αν επεκτάθηκε σε άλλες κατηγορίες.',
  },
  {
    id: 'str-registry',
    label: 'Υποχρεώσεις Μητρώου Ακινήτων Βραχυχρόνιας Διαμονής',
    where: 'lib/tax/shortTermTax.ts',
    validFrom: '2026-01-01',
    validTo: null,
    source: `${AADE_HOME}/epiheiriseis/forologikes-ypiresies/mitroo-akiniton-brahyhronias-diamonis`,
    checkedAt: '2026-08-26',
    recheck: 'Ορια ακινήτων ανά ΑΦΜ, υποχρέωση έναρξης δραστηριότητας, ΦΠΑ σε υπηρεσίες. Το πεδίο αλλάζει συχνά.',
  },

  // ── Μισθώσεις ────────────────────────────────────────────────────────────
  {
    id: 'lease-declaration',
    label: 'Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης',
    where: 'lib/tax/leaseDeclaration.ts',
    validFrom: '2026-01-01',
    validTo: null,
    source: `${AADE_HOME}/polites/misthoseis-akiniton`,
    checkedAt: '2026-08-26',
    recheck: 'Προθεσμία υποβολής και υποχρεωτικά πεδία του εντύπου.',
  },
  {
    id: 'rent-adjustment-cap',
    label: 'Ανώτατο ποσοστό αναπροσαρμογής μισθώματος',
    where: 'lib/documents/rentAdjustment.ts',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: 'https://www.et.gr/',
    checkedAt: '2026-08-26',
    recheck: 'Αν ισχύει πλαφόν αναπροσαρμογής για τη νέα χρονιά, ή αν επανήλθε ο ΔΤΚ ελεύθερα.',
  },
  {
    id: 'cpi-index',
    label: 'Δείκτης Τιμών Καταναλωτή για την αναπροσαρμογή',
    where: 'lib/market/cpi.ts',
    validFrom: '2026-01-01',
    validTo: '2027-01-31',
    source: 'https://www.statistics.gr/el/statistics/-/publication/DKT87/-',
    checkedAt: '2026-08-26',
    recheck: 'Η ΕΛΣΤΑΤ δημοσιεύει τον ετήσιο μέσο τον Ιανουάριο. Πρόσθεσε τη νέα χρονιά στο CPI_BY_YEAR.',
  },

  // ── Δάνεια και κρατικά προγράμματα ───────────────────────────────────────
  {
    id: 'loan-programs',
    label: 'Κρατικά προγράμματα στέγασης και επιδότησης',
    where: 'lib/loans/programStatus.ts',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: 'https://www.gov.gr/ipiresies/periousia-kai-phorologia',
    checkedAt: '2026-08-26',
    recheck: 'Σπίτι μου, Ανακαινίζω Ενοικιάζω, Εξοικονομώ: αν άνοιξε νέος κύκλος, αν άλλαξαν εισοδηματικά όρια ή αν έκλεισε το πρόγραμμα.',
  },
  {
    id: 'transfer-tax',
    label: 'Φόρος μεταβίβασης ακινήτου και απαλλαγή πρώτης κατοικίας',
    where: 'app/dashboard/components/TabLoanCalculator.tsx',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    source: `${AADE_HOME}/polites/akinita`,
    checkedAt: '2026-08-26',
    recheck: 'Ο συντελεστής 3% και τα όρια απαλλαγής πρώτης κατοικίας ανά οικογενειακή κατάσταση.',
  },

  // ── Ενέργεια ─────────────────────────────────────────────────────────────
  // ΤΑ ΤΙΜΟΛΟΓΙΑ ΡΕΥΜΑΤΟΣ ΚΑΙ ΑΕΡΙΟΥ ΔΕΝ ΕΙΝΑΙ ΕΔΩ, ΕΠΙΤΗΔΕΣ. Είναι ΤΙΜΕΣ, όχι
  // κανόνες: αλλάζουν κάθε 1η του μήνα και τις φυλάει ο δικός τους φύλακας
  // (`npm run prices`) με όριο 40 ημερών, δηλαδή πολύ πιο σφιχτό από τις 45
  // εδώ. Δύο φύλακες για το ίδιο πράγμα σημαίνει ότι ο ένας θα λέει ψέματα.
  // Ο ΦΠΑ όμως είναι κανόνας και μένει.
  {
    id: 'vat-rates',
    label: 'Συντελεστές ΦΠΑ σε ενέργεια και υπηρεσίες',
    where: 'lib/energy/catalogue.ts',
    validFrom: '2026-01-01',
    validTo: null,
    source: `${AADE_HOME}/epiheiriseis/forologikes-ypiresies/fpa`,
    checkedAt: '2026-08-26',
    recheck: 'Ο μειωμένος 6% στο ρεύμα έχει παραταθεί επανειλημμένα. Ελεγξε αν λήγει.',
  },
];

/** Πόσες ημέρες μένουν ώσπου να λήξει· `null` όταν δεν λήγει. */
export function daysLeft(r: Regulated, today: string): number | null {
  if (!r.validTo) return null;
  return Math.round((Date.parse(r.validTo) - Date.parse(today)) / 86_400_000);
}

/** Πόσοι μήνες πέρασαν από τον τελευταίο ανθρώπινο έλεγχο. */
export function monthsSinceCheck(r: Regulated, today: string): number {
  return (Date.parse(today) - Date.parse(r.checkedAt)) / (86_400_000 * 30.44);
}

export type Status = 'expired' | 'expiring' | 'stale' | 'ok';

/**
 * Η κατάσταση μιας εγγραφής σε μια δεδομένη ημέρα.
 *
 * Η ΣΕΙΡΑ ΤΩΝ ΕΛΕΓΧΩΝ ΕΙΝΑΙ Η ΣΕΙΡΑ ΤΗΣ ΣΟΒΑΡΟΤΗΤΑΣ. Μια τιμή που ΕΛΗΞΕ είναι
 * ήδη λάθος στην οθόνη· μια που λήγει σε ένα μήνα είναι ακόμη σωστή. Το «δεν
 * ελέγχθηκε» έρχεται τελευταίο, γιατί είναι υποψία και όχι γεγονός.
 */
export function statusOf(r: Regulated, today: string): Status {
  const d = daysLeft(r, today);
  if (d !== null && d < 0) return 'expired';
  if (d !== null && d <= WARN_DAYS) return 'expiring';
  if (monthsSinceCheck(r, today) > RECHECK_MONTHS) return 'stale';
  return 'ok';
}

/** Οσα θέλουν ανθρώπινο μάτι σήμερα, με τα πιο επείγοντα πρώτα. */
export function needsAttention(today: string): { r: Regulated; status: Status }[] {
  const rank: Record<Status, number> = { expired: 0, expiring: 1, stale: 2, ok: 3 };
  return REGULATED
    .map(r => ({ r, status: statusOf(r, today) }))
    .filter(x => x.status !== 'ok')
    .sort((a, b) => rank[a.status] - rank[b.status] || (daysLeft(a.r, today) ?? 1e9) - (daysLeft(b.r, today) ?? 1e9));
}
