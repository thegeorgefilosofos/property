// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ πηγή αλήθειας για τη φορολογία εισοδήματος από ακίνητα (ενοίκια) στην
// Ελλάδα. Ισχύει για εισοδήματα που αποκτώνται από 1/1/2026 και μετά, με τον νέο
// ενδιάμεσο συντελεστή 25%.
//
//   • έως 12.000 €           → 15%
//   • 12.000 – 24.000 €      → 25%   (νέο κλιμάκιο 2026)
//   • 24.000 – 35.000 €      → 35%
//   • πάνω από 35.000 €      → 45%
//
// Πηγές: νέα κλίμακα φορολογίας ενοικίων 2026 (ενδιάμεσος 25% στα 12–24k).
// Όλα τα εργαλεία (Αποδόσεις, Δάνειο, Ρυθμίσεις, βοηθός) ΠΡΕΠΕΙ να καλούν αυτό,
// ώστε να μη διαφέρει ο φόρος από καρτέλα σε καρτέλα.
// ═══════════════════════════════════════════════════════════════════════════

export interface TaxBracket { from: number; to: number; rate: number; }

export const RENTAL_TAX_BRACKETS_2026: TaxBracket[] = [
  { from: 0,     to: 12000,    rate: 0.15 },
  { from: 12000, to: 24000,    rate: 0.25 },
  { from: 24000, to: 35000,    rate: 0.35 },
  { from: 35000, to: Infinity, rate: 0.45 },
];

/** Προοδευτικός φόρος ενοικίων: φορολογείται το ΠΛΑΤΟΣ κάθε κλιμακίου, όχι το όριο. */
export function rentalIncomeTax(taxable: number, brackets: TaxBracket[] = RENTAL_TAX_BRACKETS_2026): number {
  if (!(taxable > 0)) return 0;
  let tax = 0;
  for (const b of brackets) {
    if (taxable <= b.from) break;
    const slice = Math.min(taxable, b.to) - b.from;
    if (slice > 0) tax += slice * b.rate;
  }
  return tax;
}

/** Οριακός συντελεστής (marginal) στο δεδομένο εισόδημα. */
export function marginalRate(taxable: number, brackets: TaxBracket[] = RENTAL_TAX_BRACKETS_2026): number {
  let r = brackets[0].rate;
  for (const b of brackets) if (taxable > b.from) r = b.rate;
  return r;
}

/** Μέσος (πραγματικός) συντελεστής: φόρος / εισόδημα. */
export function effectiveRentalRate(taxable: number): number {
  return taxable > 0 ? rentalIncomeTax(taxable) / taxable : 0;
}

/** Γραμμές κλίμακας για εμφάνιση σε πίνακα UI. */
export const RENTAL_TAX_ROWS_2026: { range: string; rate: string; from: number; to: number }[] = [
  { range: '0 – 12.000 €',      rate: '15%', from: 0,     to: 12000 },
  { range: '12.001 – 24.000 €', rate: '25%', from: 12000, to: 24000 },
  { range: '24.001 – 35.000 €', rate: '35%', from: 24000, to: 35000 },
  { range: 'Πάνω από 35.000 €', rate: '45%', from: 35000, to: Infinity },
];

// ── Γενική κλίμακα φόρου εισοδήματος (ν.4172/2013 άρθρο 15, όπως ισχύει με τον
// ν.5246/2025 για εισοδήματα από 1/1/2026). Ισχύει για μισθωτή εργασία, συντάξεις
// και ΕΠΙΧΕΙΡΗΜΑΤΙΚΗ δραστηριότητα φυσικού προσώπου (ατομική επιχείρηση / ελεύθερος
// επαγγελματίας). ΔΕΝ ισχύει για παθητικό εισόδημα ενοικίων (άρθρο 40 — δική του
// κλίμακα 15/25/35/45). Τα ΝΟΜΙΚΑ πρόσωπα φορολογούνται με σταθερό 22%.
// Νέα κλίμακα 2026: μεσαία κλιμάκια −2 μονάδες, νέο κλιμάκιο 40–60k στο 39%.
export const BUSINESS_INCOME_BRACKETS_2026: TaxBracket[] = [
  { from: 0,     to: 10000,    rate: 0.09 },
  { from: 10000, to: 20000,    rate: 0.20 },
  { from: 20000, to: 30000,    rate: 0.26 },
  { from: 30000, to: 40000,    rate: 0.34 },
  { from: 40000, to: 60000,    rate: 0.39 },
  { from: 60000, to: Infinity, rate: 0.44 },
];
export const BUSINESS_INCOME_ROWS_2026: { range: string; rate: string; from: number; to: number }[] = [
  { range: '0 – 10.000 €',      rate: '9%',  from: 0,     to: 10000 },
  { range: '10.001 – 20.000 €', rate: '20%', from: 10000, to: 20000 },
  { range: '20.001 – 30.000 €', rate: '26%', from: 20000, to: 30000 },
  { range: '30.001 – 40.000 €', rate: '34%', from: 30000, to: 40000 },
  { range: '40.001 – 60.000 €', rate: '39%', from: 40000, to: 60000 },
  { range: 'Πάνω από 60.000 €', rate: '44%', from: 60000, to: Infinity },
];
export const CORPORATE_TAX_RATE_2026 = 0.22; // νομικά πρόσωπα (ΑΕ/ΕΠΕ/ΙΚΕ/ΟΕ/ΕΕ)

// ── Κλίμακα άρθρου 15 για ΝΕΟΥΣ (ν.5246/2025) — μηδενικός/μειωμένος φόρος στα
// πρώτα 20.000 €. Αφορά μισθωτή/επιχειρηματική δραστηριότητα, ΟΧΙ παθητικά ενοίκια.
//   • έως 25 ετών:  0% έως 20.000 €, μετά κανονική κλίμακα.
//   • 26–30 ετών:   9% έως 20.000 €, μετά κανονική κλίμακα.
export const YOUTH_UP_TO_25_BRACKETS_2026: TaxBracket[] = [
  { from: 0,     to: 10000,    rate: 0.00 },
  { from: 10000, to: 20000,    rate: 0.00 },
  { from: 20000, to: 30000,    rate: 0.26 },
  { from: 30000, to: 40000,    rate: 0.34 },
  { from: 40000, to: 60000,    rate: 0.39 },
  { from: 60000, to: Infinity, rate: 0.44 },
];
export const YOUTH_26_30_BRACKETS_2026: TaxBracket[] = [
  { from: 0,     to: 10000,    rate: 0.09 },
  { from: 10000, to: 20000,    rate: 0.09 },
  { from: 20000, to: 30000,    rate: 0.26 },
  { from: 30000, to: 40000,    rate: 0.34 },
  { from: 40000, to: 60000,    rate: 0.39 },
  { from: 60000, to: Infinity, rate: 0.44 },
];

// Νέος επαγγελματίας (πρώτη τριετία, άρθρο 29 §1): πρώτο κλιμάκιο 4,5% (μισό του 9%).
export const NEW_PROFESSIONAL_BRACKETS_2026: TaxBracket[] = [
  { from: 0,     to: 10000,    rate: 0.045 },
  { from: 10000, to: 20000,    rate: 0.20 },
  { from: 20000, to: 30000,    rate: 0.26 },
  { from: 30000, to: 40000,    rate: 0.34 },
  { from: 40000, to: 60000,    rate: 0.39 },
  { from: 60000, to: Infinity, rate: 0.44 },
];

/** Κλίμακα άρθρου 15 ανάλογα με ηλικία & πρώτη τριετία δραστηριότητας.
 *  Προτεραιότητα στη χαμηλότερη επιβάρυνση: νέοι έως 30 (0%/9%) υπερισχύουν. */
export function art15BracketsForAge(age?: number | null, firstThreeYears?: boolean): TaxBracket[] {
  if (age != null && age > 0) {
    if (age <= 25) return YOUTH_UP_TO_25_BRACKETS_2026;
    if (age <= 30) return YOUTH_26_30_BRACKETS_2026;
  }
  if (firstThreeYears) return NEW_PROFESSIONAL_BRACKETS_2026;
  return BUSINESS_INCOME_BRACKETS_2026;
}

// ── Επιχειρηματικοί συντελεστές/παράμετροι (ν.4172/2013) ────────────────────
/** Προκαταβολή φόρου: ατομική 55%, νομικά πρόσωπα 80%· μειωμένη 50% την πρώτη
 *  τριετία νέας δραστηριότητας (άρθρα 69–71). Πιστώνεται το επόμενο έτος. */
export const ADVANCE_TAX_RATE_SOLE = 0.55;
export const ADVANCE_TAX_RATE_COMPANY = 0.80;
export function advanceTaxRate(form: 'sole' | 'company', firstThreeYears?: boolean): number {
  const base = form === 'company' ? ADVANCE_TAX_RATE_COMPANY : ADVANCE_TAX_RATE_SOLE;
  return firstThreeYears ? base * 0.5 : base;
}
/** Απόσβεση κτιρίων/κατασκευών, σταθερή μέθοδος (άρθρο 24). Η γη δεν αποσβένεται. */
export const BUILDING_DEPRECIATION_RATE = 0.04;
/** Τυπικό ποσοστό αξίας που αναλογεί στο κτίσμα (το υπόλοιπο στη γη) — ενδεικτικό. */
export const BUILDING_VALUE_FRACTION = 0.6;
/** Παρακράτηση φόρου μερισμάτων στη διανομή κερδών νομικού προσώπου (άρθρο 64). */
export const DIVIDEND_WITHHOLDING_RATE = 0.05;
/** Τεκμαρτό ελάχιστο καθαρό εισόδημα ελεύθερου επαγγελματία (ν.5073/2023),
 *  βασικό ποσό· προσαυξάνεται με έτη/μισθοδοσία/τζίρο — εδώ το βασικό (ενδεικτικό). */
// Βασικό ελάχιστο τεκμαρτό καθαρό εισόδημα ελεύθερου επαγγελματία (άρθρο 28Α ΚΦΕ,
// ν.5073/2023) = ετήσιος κατώτατος μισθός = 880 €/μήνα × 14 (ισχύς κατ. μισθού από
// 1/4/2025), για εισοδήματα 2025 / δηλώσεις 2026. Πάνω σε αυτό προστίθενται
// προσαυξήσεις παλαιότητας/τζίρου (θέμα λογιστή). Ήταν 11.620 € για εισοδήματα 2024.
export const SELF_EMPLOYED_MIN_NET_INCOME_2026 = 12320;

/** Σύντομη περιγραφή της κλίμακας (για τον βοηθό / tooltips). */
export const RENTAL_TAX_SUMMARY_2026 =
  'Φόρος εισοδήματος από ενοίκια (κλίμακα 2026): 15% έως 12.000 €, 25% από 12.000 έως 24.000 €, 35% από 24.000 έως 35.000 €, 45% πάνω από 35.000 €.';

// ── Τέλος Ανθεκτικότητας στην Κλιματική Κρίση (ΤΑΚΚ), βραχυχρόνια μίσθωση /
// αυτοεξυπηρετούμενα καταλύματα. Επιβάλλεται ΑΝΑ ΔΙΑΝΥΚΤΕΡΕΥΣΗ, ανά ακίνητο. ΔΕΝ
// είναι ενιαίο ποσό: εξαρτάται από τον ΤΥΠΟ/μέγεθος του ακινήτου και την περίοδο.
// Ενδεικτικά ποσά 2025 (επιβεβαίωσε τα ισχύοντα στην ΑΑΔΕ):
//   • διαμερίσματα/κατοικίες βραχυχρόνιας: υψηλή περίοδος 8 €, χαμηλή 2 €
//   • ΜΟΝΟΚΑΤΟΙΚΙΕΣ άνω των 80 τ.μ.:        υψηλή περίοδος 15 €, χαμηλή 4 €
// Το υψηλότερο κλιμάκιο (15/4) αφορά μονοκατοικίες >80 τ.μ., ΟΧΙ κάθε ακίνητο
// >80 τ.μ. (ένα διαμέρισμα 100 τ.μ. παραμένει στο 8/2).
// Υψηλή περίοδος = Απρίλιος–Οκτώβριος, χαμηλή = Νοέμβριος–Μάρτιος (ενδεικτικά).
// Πηγές: ΑΑΔΕ (δήλωση/απόδοση τέλους ανθεκτικότητας), ν.5073/2023.
export const CLIMATE_LEVY_STR_2025 = {
  small: { high: 8, low: 2 },    // διαμερίσματα/κατοικίες
  large: { high: 15, low: 4 },   // μονοκατοικίες άνω των 80 τ.μ.
};
// Συμβατότητα προς τα πίσω: προεπιλογή (διαμέρισμα/κατοικία).
export const CLIMATE_LEVY_PER_NIGHT_2025 = CLIMATE_LEVY_STR_2025.small;

/**
 * Συντελεστές ΤΑΚΚ ανά διανυκτέρευση. Το υψηλότερο κλιμάκιο ισχύει μόνο για
 * ΜΟΝΟΚΑΤΟΙΚΙΑ άνω των 80 τ.μ.· τα διαμερίσματα (ακόμη και >80 τ.μ.) στο βασικό.
 */
export function climateLevyRates(sqm?: number | null, isHouse?: boolean): { high: number; low: number } {
  return isHouse && sqm != null && sqm > 80 ? CLIMATE_LEVY_STR_2025.large : CLIMATE_LEVY_STR_2025.small;
}

/** Σύντομη περιγραφή του ΤΑΚΚ (για τον βοηθό / tooltips) — ενδεικτικές τιμές 2025. */
export const CLIMATE_LEVY_SUMMARY_2025 =
  'Τέλος Ανθεκτικότητας στην Κλιματική Κρίση (βραχυχρόνια μίσθωση, ανά διανυκτέρευση, ανά ακίνητο). Δεν είναι ενιαίο: εξαρτάται από τον τύπο του ακινήτου και την περίοδο. Ενδεικτικά 2025, διαμερίσματα/κατοικίες περίπου 8 € στην υψηλή περίοδο (Απρίλιος-Οκτώβριος) και 2 € στη χαμηλή· μονοκατοικίες άνω των 80 τ.μ. περίπου 15 € και 4 € αντίστοιχα. Τα ακριβή ποσά και οι μήνες ορίζονται από την ΑΑΔΕ, επιβεβαίωσέ τα εκεί ή με τον λογιστή σου.';

/** Υψηλή τουριστική περίοδος (Απρ–Οκτ). monthIndex: 0=Ιανουάριος. */
export function isHighSeasonMonth(monthIndex: number): boolean {
  return monthIndex >= 3 && monthIndex <= 9;
}

/** Ετήσιο ΤΑΚΚ από διανυκτερεύσεις ανά μήνα (12 τιμές, 0=Ιαν), με βάση τύπο/μέγεθος. */
export function climateLevyForNights(nightsByMonth: number[], sqm?: number | null, isHouse?: boolean): number {
  const r = climateLevyRates(sqm, isHouse);
  return nightsByMonth.reduce((sum, n, i) =>
    sum + Math.max(0, n) * (isHighSeasonMonth(i) ? r.high : r.low), 0);
}

// ── Τέλος Παρεπιδημούντων (δημοτικό τέλος διαμονής), 0,5% επί των μεικτών ──────
// Εξαίρεση: φυσικά πρόσωπα που εκμισθώνουν βραχυχρόνια έως 2 ακίνητα (χωρίς
// υποχρέωση έναρξης εργασιών) ΔΕΝ επιβαρύνονται (0 €). Η υποχρέωση προκύπτει από
// την επιχειρηματική ιδιότητα (3+ ακίνητα ή νομικό πρόσωπο), ΟΧΙ από τα τ.μ. ή τον
// τύπο του ακινήτου. Πηγές: ΑΑΔΕ / δήμοι, ν.5073/2023. Επιβεβαίωσε με τον δήμο/λογιστή.
export const MUNICIPAL_ACCOM_TAX_RATE = 0.005; // 0,5%

/** Είναι το ακίνητο εξαιρεμένο από το τέλος παρεπιδημούντων; Κριτήριο: ιδιότητα
 * (φυσικό πρόσωπο) και αριθμός ακινήτων (≤2), όχι μέγεθος/τύπος. */
export function isMunicipalTaxExempt(opts: { sqm?: number | null; isHouse?: boolean; propertyCount?: number; individual?: boolean }): boolean {
  const individual = opts.individual ?? true;
  const count = opts.propertyCount ?? 1;
  return individual && count <= 2;
}

/** Τέλος παρεπιδημούντων: 0,5% επί των μεικτών, ή 0 € αν ισχύει η εξαίρεση. */
export function municipalAccommodationTax(gross: number, opts: { sqm?: number | null; isHouse?: boolean; propertyCount?: number; individual?: boolean } = {}): number {
  if (isMunicipalTaxExempt(opts)) return 0;
  return Math.round(Math.max(0, gross) * MUNICIPAL_ACCOM_TAX_RATE * 100) / 100;
}

export const MUNICIPAL_ACCOM_SUMMARY =
  'Τέλος παρεπιδημούντων (δημοτικό): 0,5% επί των μεικτών εσόδων. Εξαιρούνται τα φυσικά πρόσωπα που εκμισθώνουν βραχυχρόνια έως 2 ακίνητα (χωρίς υποχρέωση έναρξης εργασιών), ανεξαρτήτως μεγέθους ή τύπου — οπότε 0 € για τους περισσότερους μικρούς ιδιοκτήτες. Η υποχρέωση προκύπτει από την επιχειρηματική ιδιότητα (3+ ακίνητα ή νομικό πρόσωπο). Επιβεβαίωσε με τον δήμο/λογιστή.';

export interface ShortTermNet {
  grossRevenue: number;   // διανυκτερεύσεις × τιμή
  platformFees: number;   // προμήθειες πλατφορμών
  cleaningTotal: number;  // κόστος καθαρισμού (× αριθμό διαμονών)
  levy: number;           // ΤΑΚΚ
  net: number;            // καθαρά έσοδα (πριν φόρο εισοδήματος)
  stays: number;          // εκτιμώμενες διαμονές
}

/** Καθαρά έσοδα βραχυχρόνιας: μεικτά − προμήθειες − καθαρισμός − ΤΑΚΚ. */
export function shortTermNet(input: {
  nightsByMonth: number[]; nightlyRate: number;
  platformFeePct: number; cleaningPerStay: number; avgNightsPerStay: number; sqm?: number | null; isHouse?: boolean;
}): ShortTermNet {
  const totalNights = input.nightsByMonth.reduce((s, n) => s + Math.max(0, n || 0), 0);
  const grossRevenue = totalNights * Math.max(0, input.nightlyRate || 0);
  const platformFees = grossRevenue * Math.max(0, input.platformFeePct || 0) / 100;
  const stays = input.avgNightsPerStay > 0 ? totalNights / input.avgNightsPerStay : 0;
  const cleaningTotal = stays * Math.max(0, input.cleaningPerStay || 0);
  const levy = climateLevyForNights(input.nightsByMonth, input.sqm, input.isHouse);
  const net = grossRevenue - platformFees - cleaningTotal - levy;
  return { grossRevenue, platformFees, cleaningTotal, levy, net, stays };
}
