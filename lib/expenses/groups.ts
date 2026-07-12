// Μία πηγή αλήθειας για το ΠΟΙΕΣ ομάδες δαπανών είναι φορολογικά εκπιπτόμενες
// (για επαγγελματία/ΕΛΠ). Το χρησιμοποιούν η Λογιστική και η καρτέλα Δαπανών,
// ώστε ο χαρακτηρισμός να ΜΗ διαφέρει από καρτέλα σε καρτέλα.
// Σημ.: για φυσικό πρόσωπο με μακροχρόνια κατοικίας ισχύει τεκμαρτή έκπτωση 5%
// (δεν εκπίπτουν αναλυτικά έξοδα) — βλ. lib/accounting/statement.ts.

export const DEDUCTIBLE_EXPENSE_GROUPS: ReadonlySet<string> = new Set([
  'fixed', 'appliance_lease', 'maintenance', 'vehicle_lease', 'commercial', 'broker', 'legal',
])

export function isGroupDeductible(group: string | null | undefined): boolean {
  return !!group && DEDUCTIBLE_EXPENSE_GROUPS.has(group)
}
