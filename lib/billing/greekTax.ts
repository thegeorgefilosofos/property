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
