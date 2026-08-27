// ─────────────────────────────────────────────────────────────────────────
// ΠΟΙΟ ΚΑΘΕΣΤΩΣ ΦΠΑ ΙΣΧΥΕΙ ΓΙΑ ΤΟΝ ΣΥΝΔΡΟΜΗΤΗ, ΚΑΙ ΤΙΠΟΤΑ ΑΛΛΟ.
//
// Η καρτέλα χρέωσης το γράφει δίπλα στη συνδρομή, ώστε ο συνδρομητής να ξέρει
// τι θα δει στην απόδειξη που του στέλνει ο έμπορος.
//
// ΕΔΩ ΖΟΥΣΕ ΚΑΙ ΜΗΧΑΝΗ ΕΚΔΟΣΗΣ ΠΑΡΑΣΤΑΤΙΚΩΝ: ανάλυση ποσού σε καθαρό και ΦΠΑ
// (`vatFromNet`, `vatFromGross`) και αρίθμηση σειράς ΤΠΥ/ΑΠΥ (`invoiceSeries`,
// `formatInvoiceNumber`). Καμία οθόνη δεν τις καλούσε· μόνο το δικό τους τεστ.
// Η εφαρμογή ΔΕΝ εκδίδει παραστατικά και δεν πρόκειται: τα εκδίδει ο έμπορος.
// Κώδικας που στέκεται εξαγόμενος με επικεφαλίδα «έτοιμος να εκδώσει σωστό,
// νόμιμο παραστατικό» διαβάζεται ως δυνατότητα της εφαρμογής· δεν είναι.
//
// Καθεστώτα:
//   • domestic      : πελάτης Ελλάδας → ΦΠΑ Ελλάδας.
//   • oss_b2c       : καταναλωτής άλλης ΕΕ → ΦΠΑ χώρας καταναλωτή μέσω OSS.
//   • reverse_charge: επιχείρηση άλλης ΕΕ με έγκυρο VIES → αντιστροφή υποχρέωσης.
//   • outside_eu    : εκτός ΕΕ → εκτός πεδίου ΦΠΑ ΕΕ.
// ─────────────────────────────────────────────────────────────────────────

import { standardVatRate } from './vatRates';
import { isEuCountry } from './invoiceProfile';

export type VatTreatment = 'domestic' | 'oss_b2c' | 'reverse_charge' | 'outside_eu';

export interface VatDecision {
  treatment: VatTreatment;
  ratePct: number;        // 0 για reverse_charge / outside_eu
  country: string;        // χώρα καταναλωτή/πελάτη
  note: string;           // νομική σημείωση για το παραστατικό
}

export function determineVat(p: { doc_type: string; country: string; vat_number?: string }): VatDecision {
  const country = (p.country || 'GR').toUpperCase();
  const isInvoice = p.doc_type === 'invoice';

  if (country === 'GR') {
    return { treatment: 'domestic', ratePct: standardVatRate('GR'), country, note: 'ΦΠΑ Ελλάδας' };
  }
  if (isEuCountry(country)) {
    if (isInvoice && (p.vat_number || '').trim()) {
      return {
        treatment: 'reverse_charge', ratePct: 0, country,
        note: 'Αντιστροφή υποχρέωσης (reverse charge), άρθρο 196 Οδηγίας 2006/112/ΕΚ',
      };
    }
    // B2C καταναλωτής άλλης ΕΕ: ηλεκτρονικές υπηρεσίες → τόπος φορολόγησης η χώρα
    // του καταναλωτή, με τον ΤΟΠΙΚΟ συντελεστή μέσω OSS (ΔΕΝ είναι 0%). Εξαίρεση:
    // κάτω από το κατώφλι €10.000/έτος διασυνοριακών B2C (άρθρο 59γ) επιτρέπεται να
    // χρεώνεται ελληνικός ΦΠΑ· εδώ κρατάμε τη συντηρητική, πάντα ασφαλή προσέγγιση OSS.
    return { treatment: 'oss_b2c', ratePct: standardVatRate(country), country, note: `ΦΠΑ ${country} μέσω OSS` };
  }
  return { treatment: 'outside_eu', ratePct: 0, country, note: 'Εκτός πεδίου ΦΠΑ ΕΕ' };
}

// Σύντομη, ανθρώπινη περιγραφή καθεστώτος για το UI (π.χ. προεπισκόπηση).
export function vatTreatmentLabel(v: VatDecision): string {
  switch (v.treatment) {
    case 'domestic':       return `ΦΠΑ Ελλάδας ${v.ratePct}%`;
    case 'oss_b2c':        return `ΦΠΑ ${v.country} ${v.ratePct}% (OSS)`;
    case 'reverse_charge': return 'Αντιστροφή υποχρέωσης (reverse charge), χωρίς ΦΠΑ';
    case 'outside_eu':     return 'Εκτός πεδίου ΦΠΑ ΕΕ';
  }
}
