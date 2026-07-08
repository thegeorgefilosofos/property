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

/** Σύντομη περιγραφή της κλίμακας (για τον βοηθό / tooltips). */
export const RENTAL_TAX_SUMMARY_2026 =
  'Φόρος εισοδήματος από ενοίκια (κλίμακα 2026): 15% έως 12.000 €, 25% από 12.000 έως 24.000 €, 35% από 24.000 έως 35.000 €, 45% πάνω από 35.000 €.';

// ── Τέλος Ανθεκτικότητας στην Κλιματική Κρίση (ΤΑΚΚ), βραχυχρόνια μίσθωση /
// αυτοεξυπηρετούμενα καταλύματα. Επιβάλλεται ΑΝΑ ΔΙΑΝΥΚΤΕΡΕΥΣΗ, ανά ακίνητο, και
// ΕΞΑΡΤΑΤΑΙ ΑΠΟ ΤΟ ΕΜΒΑΔΟΝ. Ποσά 2025:
//   • έως 80 τ.μ.:   υψηλή περίοδος 8 €,  χαμηλή περίοδος 2 €
//   • άνω των 80 τ.μ.: υψηλή περίοδος 15 €, χαμηλή περίοδος 4 €
// Υψηλή περίοδος = Απρίλιος–Οκτώβριος, χαμηλή = Νοέμβριος–Μάρτιος.
// Πηγές: ΑΑΔΕ (δήλωση/απόδοση τέλους ανθεκτικότητας), ν.5073/2023.
export const CLIMATE_LEVY_STR_2025 = {
  small: { high: 8, low: 2 },    // έως 80 τ.μ.
  large: { high: 15, low: 4 },   // άνω των 80 τ.μ.
};
// Συμβατότητα προς τα πίσω: προεπιλογή για ακίνητα έως 80 τ.μ.
export const CLIMATE_LEVY_PER_NIGHT_2025 = CLIMATE_LEVY_STR_2025.small;

/** Συντελεστές ΤΑΚΚ ανά διανυκτέρευση, ανάλογα με το εμβαδόν (>80 τ.μ. = μεγάλη κλίμακα). */
export function climateLevyRates(sqm?: number | null): { high: number; low: number } {
  return sqm != null && sqm > 80 ? CLIMATE_LEVY_STR_2025.large : CLIMATE_LEVY_STR_2025.small;
}

/** Σύντομη περιγραφή του ΤΑΚΚ (για τον βοηθό / tooltips) — ακριβείς τιμές. */
export const CLIMATE_LEVY_SUMMARY_2025 =
  'Τέλος Ανθεκτικότητας στην Κλιματική Κρίση (βραχυχρόνια μίσθωση, ανά διανυκτέρευση, ανά ακίνητο): έως 80 τ.μ. 8 € στην υψηλή περίοδο (Απρίλιος-Οκτώβριος) και 2 € στη χαμηλή (Νοέμβριος-Μάρτιος)· άνω των 80 τ.μ. 15 € υψηλή και 4 € χαμηλή. Πηγή: ΑΑΔΕ.';

/** Υψηλή τουριστική περίοδος (Απρ–Οκτ). monthIndex: 0=Ιανουάριος. */
export function isHighSeasonMonth(monthIndex: number): boolean {
  return monthIndex >= 3 && monthIndex <= 9;
}

/** Ετήσιο ΤΑΚΚ από διανυκτερεύσεις ανά μήνα (12 τιμές, 0=Ιαν), με βάση το εμβαδόν. */
export function climateLevyForNights(nightsByMonth: number[], sqm?: number | null): number {
  const r = climateLevyRates(sqm);
  return nightsByMonth.reduce((sum, n, i) =>
    sum + Math.max(0, n) * (isHighSeasonMonth(i) ? r.high : r.low), 0);
}

// ── Τέλος Παρεπιδημούντων (δημοτικό τέλος διαμονής), 0,5% επί των μεικτών ──────
// Εξαίρεση: μονοκατοικίες και ακίνητα έως 80 τ.μ. που εκμισθώνονται αποκλειστικά
// από φυσικά πρόσωπα, για έως 2 ακίνητα, ΔΕΝ επιβαρύνονται (0 €). Δηλαδή για τους
// περισσότερους μικρούς ιδιοκτήτες βραχυχρόνιας το τέλος είναι μηδενικό.
// Πηγές: ΑΑΔΕ / δήμοι. Επιβεβαίωσε με τον δήμο/λογιστή σου.
export const MUNICIPAL_ACCOM_TAX_RATE = 0.005; // 0,5%

/** Είναι το ακίνητο εξαιρεμένο από το τέλος παρεπιδημούντων; */
export function isMunicipalTaxExempt(opts: { sqm?: number | null; isHouse?: boolean; propertyCount?: number; individual?: boolean }): boolean {
  const individual = opts.individual ?? true;
  const count = opts.propertyCount ?? 1;
  const smallOrHouse = (opts.isHouse ?? false) || (opts.sqm != null && opts.sqm <= 80);
  return individual && count <= 2 && smallOrHouse;
}

/** Τέλος παρεπιδημούντων: 0,5% επί των μεικτών, ή 0 € αν ισχύει η εξαίρεση. */
export function municipalAccommodationTax(gross: number, opts: { sqm?: number | null; isHouse?: boolean; propertyCount?: number; individual?: boolean } = {}): number {
  if (isMunicipalTaxExempt(opts)) return 0;
  return Math.round(Math.max(0, gross) * MUNICIPAL_ACCOM_TAX_RATE * 100) / 100;
}

export const MUNICIPAL_ACCOM_SUMMARY =
  'Τέλος παρεπιδημούντων (δημοτικό): 0,5% επί των μεικτών εσόδων. Εξαιρούνται μονοκατοικίες και ακίνητα έως 80 τ.μ. που εκμισθώνονται από φυσικά πρόσωπα με έως 2 ακίνητα (οπότε 0 € για τους περισσότερους ιδιοκτήτες βραχυχρόνιας). Επιβεβαίωσε με τον δήμο/λογιστή.';

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
  platformFeePct: number; cleaningPerStay: number; avgNightsPerStay: number; sqm?: number | null;
}): ShortTermNet {
  const totalNights = input.nightsByMonth.reduce((s, n) => s + Math.max(0, n || 0), 0);
  const grossRevenue = totalNights * Math.max(0, input.nightlyRate || 0);
  const platformFees = grossRevenue * Math.max(0, input.platformFeePct || 0) / 100;
  const stays = input.avgNightsPerStay > 0 ? totalNights / input.avgNightsPerStay : 0;
  const cleaningTotal = stays * Math.max(0, input.cleaningPerStay || 0);
  const levy = climateLevyForNights(input.nightsByMonth, input.sqm);
  const net = grossRevenue - platformFees - cleaningTotal - levy;
  return { grossRevenue, platformFees, cleaningTotal, levy, net, stays };
}
