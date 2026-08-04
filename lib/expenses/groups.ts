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

// ═══════════════════════════════════════════════════════════════════════════
// Η ΟΜΑΔΑ ΠΑΡΑΓΕΤΑΙ ΑΠΟ ΤΗΝ ΚΑΤΗΓΟΡΙΑ — ΔΕΝ ΑΠΟΘΗΚΕΥΕΤΑΙ ΔΕΥΤΕΡΟΣ ΑΞΟΝΑΣ.
//
// ΤΟ ΠΡΟΒΛΗΜΑ: η ερώτηση «εκπίπτει αυτή η δαπάνη;» είχε ΔΥΟ ανεξάρτητες πηγές —
// το `deductible` της ταξινομίας (ανά κατηγορία) και το `expense_group` της
// αποθηκευμένης γραμμής. Όποια οθόνη ξεχνούσε να γράψει ομάδα, παρήγαγε δαπάνη
// που δεν εξέπιπτε ποτέ, ενώ η ταξινομία έλεγε το αντίθετο.
//
// ΓΙΑΤΙ ΟΧΙ ΑΠΟ ΤΗΝ ΟΙΚΟΓΕΝΕΙΑ: μετρήθηκε. Δύο οικογένειες είναι ΜΙΚΤΕΣ —
// `home` έχει 8 εκπεστέες και το `subscription` που δεν εκπίπτει, `official`
// έχει 4 και τον `enfia` που δεν εκπίπτει. Παραγωγή από την οικογένεια θα
// έκανε το Netflix και τον ΕΝΦΙΑ εκπεστέα.
//
// Ο ΚΑΝΟΝΑΣ: η οικογένεια δίνει τη ΛΕΠΤΟΜΕΡΕΙΑ της αναφοράς (πάγιο ή
// συντήρηση), αλλά το `deductible` της ίδιας της κατηγορίας έχει ΠΑΝΤΑ τον
// τελευταίο λόγο. Το groups.test.ts το επιβάλλει για κάθε κατηγορία.

const FAMILY_GROUP: Record<string, string> = {
  home: 'fixed', upkeep: 'maintenance', official: 'fixed', setup: 'other', other: 'other',
}

/** Η ομάδα μιας κατηγορίας — σύμφωνη, εξ ορισμού, με το `deductible` της. */
export function groupForCategory(cat: { family: string; deductible: boolean } | null | undefined): string {
  if (!cat) return 'other'
  if (!cat.deductible) return 'other'
  return FAMILY_GROUP[cat.family] ?? 'other'
}
