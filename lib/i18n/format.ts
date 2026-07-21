// ═══════════════════════════════════════════════════════════════════════════
// i18n/format — Locale + currency-aware μορφοποίηση για διεθνείς χρήστες (P3.3).
//
// Τα ποσά ΑΠΟΘΗΚΕΥΟΝΤΑΙ σε EUR. Εδώ μετατρέπουμε σε νόμισμα εμφάνισης με ρητή
// ισοτιμία (fxRate = μονάδες νομίσματος ανά 1 EUR) και μορφοποιούμε με το σωστό
// locale — ώστε ο ξένος ιδιοκτήτης να βλέπει σωστά νούμερα (π.χ. $ ή £), όχι
// απλώς αλλαγμένο σύμβολο πάνω σε ευρώ. Καθαρό & δοκιμάσιμο.
// ═══════════════════════════════════════════════════════════════════════════

export type Locale = 'el' | 'en';

export interface IntlPrefs {
  locale: Locale;
  currency: string;   // ISO 4217 (EUR, USD, GBP…)
  fxRate?: number;    // μονάδες `currency` ανά 1 EUR (default 1 = EUR)
}

export const DEFAULT_INTL: IntlPrefs = { locale: 'el', currency: 'EUR', fxRate: 1 };

export const bcp47 = (l: Locale): string => (l === 'en' ? 'en-US' : 'el-GR');

const rate = (p: IntlPrefs) => (Number.isFinite(p.fxRate) && (p.fxRate as number) > 0 ? (p.fxRate as number) : 1);

/** Μετατροπή EUR → νόμισμα εμφάνισης. */
export function convertFromEur(amountEur: number, p: IntlPrefs): number {
  return Math.round((Number(amountEur) || 0) * rate(p) * 10000) / 10000;
}

/** Μορφοποίηση χρηματικού ποσού (EUR είσοδος) στο νόμισμα/locale εμφάνισης. */
export function formatMoney(amountEur: number, p: IntlPrefs = DEFAULT_INTL): string {
  const v = convertFromEur(amountEur, p);
  try {
    return new Intl.NumberFormat(bcp47(p.locale), { style: 'currency', currency: p.currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  } catch {
    // Άγνωστος κωδικός νομίσματος → fallback με το locale + τον κωδικό.
    return `${new Intl.NumberFormat(bcp47(p.locale), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} ${p.currency}`;
  }
}

/** Αριθμός χωρίς νόμισμα, στο locale εμφάνισης. */
export function formatNumber(n: number, p: IntlPrefs = DEFAULT_INTL, decimals = 0): string {
  return new Intl.NumberFormat(bcp47(p.locale), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(n) || 0);
}

/** Ημερομηνία στο locale εμφάνισης. */
export function formatDate(d: string | Date, p: IntlPrefs = DEFAULT_INTL): string {
  const t = new Date(d);
  return isNaN(t.getTime()) ? '' : t.toLocaleDateString(bcp47(p.locale), { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Ελάχιστο λεξικό διεπαφής (starter) — EL/EN. Επεκτείνεται σταδιακά· ο πυρήνας
// t() είναι έτοιμος ώστε το UI να «γυρίζει» γλώσσα χωρίς αλλαγή αρχιτεκτονικής.
export const STRINGS: Record<string, { el: string; en: string }> = {
  dashboard: { el: 'Πίνακας', en: 'Dashboard' },
  properties: { el: 'Ακίνητα', en: 'Properties' },
  income: { el: 'Έσοδα', en: 'Income' },
  expenses: { el: 'Έξοδα', en: 'Expenses' },
  net: { el: 'Καθαρό', en: 'Net' },
  tenant: { el: 'Ενοικιαστής', en: 'Tenant' },
  rent: { el: 'Ενοίκιο', en: 'Rent' },
  report: { el: 'Αναφορά', en: 'Report' },
  settings: { el: 'Ρυθμίσεις', en: 'Settings' },
  save: { el: 'Αποθήκευση', en: 'Save' },
  cancel: { el: 'Άκυρο', en: 'Cancel' },
  download: { el: 'Λήψη', en: 'Download' },
};

export function t(key: string, locale: Locale = 'el'): string {
  const s = STRINGS[key];
  return s ? (locale === 'en' ? s.en : s.el) : key;
}

// Συνήθη νομίσματα για επιλογή στις Ρυθμίσεις.
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'AUD', 'CAD'] as const;
