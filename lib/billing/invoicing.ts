// ─────────────────────────────────────────────────────────────────────────
// Μηχανή τιμολόγησης (OSS-ready): καθεστώς ΦΠΑ, ανάλυση ποσών και αρίθμηση
// παραστατικών. Καθαρές συναρτήσεις — έτοιμες να τις καλέσει ο webhook του εμπόρου
// για να εκδώσει σωστό, νόμιμο παραστατικό. Καμία χρέωση εδώ.
//
// Καθεστώτα:
//   • domestic      : πελάτης Ελλάδας → ΦΠΑ Ελλάδας.
//   • oss_b2c       : καταναλωτής άλλης ΕΕ → ΦΠΑ χώρας καταναλωτή μέσω OSS.
//   • reverse_charge: επιχείρηση άλλης ΕΕ με έγκυρο VIES → αντιστροφή υποχρέωσης.
//   • outside_eu    : εκτός ΕΕ → εκτός πεδίου ΦΠΑ ΕΕ.
// ─────────────────────────────────────────────────────────────────────────

import { standardVatRate } from './vatRates';
import { isEuCountry } from './invoiceProfile';
import { cents } from '@/lib/core/money'

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

export interface VatBreakdown { net: number; vatPct: number; vat: number; gross: number }


// Από καθαρή αξία (χωρίς ΦΠΑ) → ανάλυση.
export function vatFromNet(net: number, pct: number): VatBreakdown {
  const vat = cents(net * pct / 100);
  return { net: cents(net), vatPct: pct, vat, gross: cents(net + vat) };
}

// Από τελική αξία (με ΦΠΑ) → ανάλυση.
export function vatFromGross(gross: number, pct: number): VatBreakdown {
  const net = pct > 0 ? cents(gross / (1 + pct / 100)) : cents(gross);
  return { net, vatPct: pct, vat: cents(gross - net), gross: cents(gross) };
}

// ── Αρίθμηση παραστατικών ───────────────────────────────────────────────────
// Σειρά ανά τύπο: ΤΠΥ (τιμολόγιο παροχής υπηρεσιών) / ΑΠΥ (απόδειξη παροχής).
export const invoiceSeries = (docType: string): 'ΤΠΥ' | 'ΑΠΥ' =>
  docType === 'invoice' ? 'ΤΠΥ' : 'ΑΠΥ';

// Μορφή αριθμού: SERIES-YYYY-000123 (σειριακός, χωρίς κενά, ανά έτος).
export function formatInvoiceNumber(series: string, year: number, seq: number): string {
  return `${series}-${year}-${String(Math.max(1, Math.trunc(seq))).padStart(6, '0')}`;
}
