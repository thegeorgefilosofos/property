// ─────────────────────────────────────────────────────────────────────────
// Στοιχεία τιμολόγησης: τι χρειάζεται για ένα ΣΩΣΤΟ παραστατικό παροχής
// (διαδικτυακών) υπηρεσιών κατά το ελληνικό/ΕΕ δίκαιο.
//
//   • Απόδειξη (ιδιώτης/καταναλωτής): αρκεί ονοματεπώνυμο + χώρα (η χώρα ορίζει
//     τον τόπο φορολόγησης για ψηφιακές υπηρεσίες B2C / OSS).
//   • Τιμολόγιο (επιχείρηση): επωνυμία, δραστηριότητα, πλήρης διεύθυνση, χώρα
//     και φορολογικό αναγνωριστικό:
//       – Ελλάδα: ΑΦΜ + ΔΟΥ.
//       – Άλλη χώρα ΕΕ: κοινοτικός VAT (VIES) → αντιστροφή υποχρέωσης.
//       – Εκτός ΕΕ: φορολογικό μητρώο (εκτός πεδίου ΦΠΑ ΕΕ).
//
// Καθαρές συναρτήσεις, χωρίς I/O — δοκιμάσιμες.
// ─────────────────────────────────────────────────────────────────────────

export interface InvoiceProfile {
  doc_type: string;      // 'receipt' | 'invoice'
  full_name: string;
  company_name: string;
  afm: string;
  doy: string;
  profession: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;       // ISO-3166-1 alpha-2 (π.χ. 'GR')
  vat_number: string;
  phone: string;
}

export interface FieldReq { key: keyof InvoiceProfile; label: string }

// 27 κράτη-μέλη ΕΕ (κωδικός VIES + ελληνική ονομασία). Η Ελλάδα χωριστά.
export const EU_COUNTRIES: { code: string; name: string }[] = [
  { code: 'GR', name: 'Ελλάδα' },
  { code: 'AT', name: 'Αυστρία' },
  { code: 'BE', name: 'Βέλγιο' },
  { code: 'BG', name: 'Βουλγαρία' },
  { code: 'HR', name: 'Κροατία' },
  { code: 'CY', name: 'Κύπρος' },
  { code: 'CZ', name: 'Τσεχία' },
  { code: 'DK', name: 'Δανία' },
  { code: 'EE', name: 'Εσθονία' },
  { code: 'FI', name: 'Φινλανδία' },
  { code: 'FR', name: 'Γαλλία' },
  { code: 'DE', name: 'Γερμανία' },
  { code: 'HU', name: 'Ουγγαρία' },
  { code: 'IE', name: 'Ιρλανδία' },
  { code: 'IT', name: 'Ιταλία' },
  { code: 'LV', name: 'Λετονία' },
  { code: 'LT', name: 'Λιθουανία' },
  { code: 'LU', name: 'Λουξεμβούργο' },
  { code: 'MT', name: 'Μάλτα' },
  { code: 'NL', name: 'Ολλανδία' },
  { code: 'PL', name: 'Πολωνία' },
  { code: 'PT', name: 'Πορτογαλία' },
  { code: 'RO', name: 'Ρουμανία' },
  { code: 'SK', name: 'Σλοβακία' },
  { code: 'SI', name: 'Σλοβενία' },
  { code: 'ES', name: 'Ισπανία' },
  { code: 'SE', name: 'Σουηδία' },
];

// Χώρες εκτός ΕΕ που συναντάμε συχνά (η λίστα δεν είναι εξαντλητική· υπάρχει «Άλλη»).
export const NON_EU_COUNTRIES: { code: string; name: string }[] = [
  { code: 'GB', name: 'Ηνωμένο Βασίλειο' },
  { code: 'CH', name: 'Ελβετία' },
  { code: 'US', name: 'ΗΠΑ' },
  { code: 'OTHER', name: 'Άλλη χώρα' },
];

export const ALL_COUNTRIES = [...EU_COUNTRIES, ...NON_EU_COUNTRIES];

export const isEuCountry = (code: string): boolean =>
  EU_COUNTRIES.some(c => c.code === (code || '').toUpperCase());

const nonEmpty = (v: unknown) => String(v ?? '').trim().length > 0;

// Ποια πεδία απαιτούνται, ανάλογα με τον τύπο παραστατικού και τη χώρα.
export function requiredInvoiceFields(d: Pick<InvoiceProfile, 'doc_type' | 'country'>): FieldReq[] {
  const country = (d.country || 'GR').toUpperCase();
  const isInvoice = d.doc_type === 'invoice';

  if (!isInvoice) {
    // Απόδειξη (καταναλωτής): όνομα + χώρα (για σωστή φορολόγηση ψηφιακών υπηρεσιών).
    return [
      { key: 'full_name', label: 'Ονοματεπώνυμο' },
      { key: 'country', label: 'Χώρα' },
    ];
  }

  const req: FieldReq[] = [
    { key: 'company_name', label: 'Επωνυμία' },
    { key: 'profession', label: 'Δραστηριότητα' },
    { key: 'address', label: 'Διεύθυνση' },
    { key: 'city', label: 'Πόλη' },
    { key: 'postal_code', label: 'Ταχ. κώδικας' },
    { key: 'country', label: 'Χώρα' },
  ];
  if (country === 'GR') {
    req.push({ key: 'afm', label: 'ΑΦΜ' }, { key: 'doy', label: 'ΔΟΥ' });
  } else if (isEuCountry(country)) {
    req.push({ key: 'vat_number', label: 'VAT (VIES)' });
  } else {
    req.push({ key: 'vat_number', label: 'Φορολογικό μητρώο' });
  }
  return req;
}

export function missingInvoiceFields(d: InvoiceProfile): FieldReq[] {
  return requiredInvoiceFields(d).filter(f => !nonEmpty(d[f.key]));
}

export function isInvoiceProfileComplete(d: InvoiceProfile): boolean {
  return missingInvoiceFields(d).length === 0;
}

// Ισχύει αντιστροφή υποχρέωσης (reverse charge); Ναι για επιχείρηση άλλης ΕΕ χώρας.
export function isReverseCharge(d: Pick<InvoiceProfile, 'doc_type' | 'country'>): boolean {
  const country = (d.country || 'GR').toUpperCase();
  return d.doc_type === 'invoice' && country !== 'GR' && isEuCountry(country);
}
