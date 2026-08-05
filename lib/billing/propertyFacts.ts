// ═══════════════════════════════════════════════════════════════════════════
// Single source of truth: κανονική επίλυση των βασικών οικονομικών ενός ακινήτου.
//
// Το ίδιο νούμερο (ενοίκιο, αξία, ΕΝΦΙΑ, ασφάλεια, απόδοση) αποθηκεύεται σε πολλά
// σημεία και υπολογίζεται διαφορετικά σε κάθε tab — με αποτέλεσμα να ΜΗ συμφωνούν.
// Εδώ ορίζεται ΜΙΑ ντετερμινιστική προτεραιότητα πηγών + ΕΝΑΣ τρόπος υπολογισμού
// αποδόσεων, ώστε παντού να βγαίνει το ίδιο. Καθαρό & πλήρως δοκιμασμένο.
// ═══════════════════════════════════════════════════════════════════════════

import { fp } from '../core/format';

export type Source = 'tenant' | 'actual' | 'target' | 'settings' | 'property' | 'services' | 'none';

const pos = (n: unknown): number | null => (typeof n === 'number' && isFinite(n) && n > 0 ? n : null);
const str = (s: unknown): string | null => (typeof s === 'string' && s.trim() ? s.trim() : null);

// ── Ενοίκιο ──────────────────────────────────────────────────────────────────
// Προτεραιότητα: πραγματικό ενοίκιο ενοικιαστή > actual (ROI) > στόχος ακινήτου.
export interface RentInputs { tenantRent?: number | null; actualRent?: number | null; targetRent?: number | null; }
export function resolveRent(i: RentInputs): { value: number; source: Source } {
  const t = pos(i.tenantRent); if (t) return { value: t, source: 'tenant' };
  const a = pos(i.actualRent); if (a) return { value: a, source: 'actual' };
  const g = pos(i.targetRent); if (g) return { value: g, source: 'target' };
  return { value: 0, source: 'none' };
}

// ── Αξία ακινήτου ────────────────────────────────────────────────────────────
// Προτεραιότητα: εμπορική αξία > αντικειμενική.
export function resolveValue(commercial?: number | null, objective?: number | null): { value: number; source: Source } {
  const c = pos(commercial); if (c) return { value: c, source: 'property' };
  const o = pos(objective); if (o) return { value: o, source: 'property' };
  return { value: 0, source: 'none' };
}

// ── ΕΝΦΙΑ ────────────────────────────────────────────────────────────────────
// Προτεραιότητα: ρητή τιμή ακινήτου > ετήσιο από υπολογιστή Υπηρεσιών > μηνιαίο×12.
export interface EnfiaInputs { propertyEnfia?: number | null; servicesAnnual?: number | null; servicesMonthly?: number | null; }
export function resolveEnfia(i: EnfiaInputs): { annual: number; source: Source } {
  const p = pos(i.propertyEnfia); if (p) return { annual: p, source: 'property' };
  const a = pos(i.servicesAnnual); if (a) return { annual: a, source: 'services' };
  const m = pos(i.servicesMonthly); if (m) return { annual: m * 12, source: 'services' };
  return { annual: 0, source: 'none' };
}

// ── Ασφάλεια ─────────────────────────────────────────────────────────────────
// Εταιρεία/λήξη: property_settings (καρτέλα Ρυθμίσεις) > εγγραφή ακινήτου.
// Ποσό (ασφάλιστρο): εγγραφή ακινήτου > bills_settings ασφάλειας.
export interface InsuranceInputs {
  settingsCompany?: string | null; settingsExpiry?: string | null; settingsPolicy?: string | null;
  propertyCompany?: string | null; propertyAmount?: number | null; propertyExpiry?: string | null;
  billsAmount?: number | null;
}
export function resolveInsurance(i: InsuranceInputs): { company: string | null; amount: number | null; expiry: string | null; policy: string | null } {
  return {
    company: str(i.settingsCompany) || str(i.propertyCompany),
    expiry: str(i.settingsExpiry) || str(i.propertyExpiry),
    policy: str(i.settingsPolicy),
    amount: pos(i.propertyAmount) || pos(i.billsAmount),
  };
}

// ── Αποδόσεις (ΕΝΑΣ τρόπος υπολογισμού για όλα τα tabs) ──────────────────────
// Μεικτή = ετήσιο ενοίκιο / αξία. Καθαρή = (ετήσιο ενοίκιο − ετήσιες δαπάνες) / αξία.
// Επιστρέφει 0 όταν λείπει η αξία (αντί για NaN/Infinity).
export function computeYields(monthlyRent: number, propertyValue: number, annualExpenses: number): {
  annualRent: number; grossYield: number; netYield: number;
} {
  const rent = pos(monthlyRent) || 0;
  const value = pos(propertyValue) || 0;
  const exp = Math.max(0, typeof annualExpenses === 'number' && isFinite(annualExpenses) ? annualExpenses : 0);
  const annualRent = rent * 12;
  const grossYield = value > 0 ? (annualRent / value) * 100 : 0;
  const netYield = value > 0 ? ((annualRent - exp) / value) * 100 : 0;
  return { annualRent, grossYield, netYield };
}

// Στρογγυλοποίηση ποσοστού απόδοσης (ενιαία μορφή παντού: 1 δεκαδικό).
export const fmtYield = (y: number): string => `${fp((isFinite(y) ? y : 0), 1)}`;

// ── Τρόπος μίσθωσης & πληρότητα στοιχείων (καθαρά, δοκιμάσιμα) ────────────────
/** Airbnb/εποχιακό ⇒ βραχυχρόνια· αλλιώς μακροχρόνια. */
export function rentalModeFromAirbnb(isAirbnb: boolean): 'short_term' | 'long_term' {
  return isAirbnb ? 'short_term' : 'long_term';
}

/**
 * Έχει το ακίνητο αρκετά στοιχεία ώστε τα KPI (αξία/ενοίκιο/απόδοση) να μη
 * δείχνουν 0; Απαιτεί κάποια αξία (εμπορική ή αντικειμενική) ΚΑΙ κάποιο ενοίκιο
 * (στόχος ή ενεργός ενοικιαστής). Τα μηδενικά δεν μετρούν (pos()).
 */
export function propertyDetailsComplete(
  p: { value?: number | null; obj_value?: number | null; target_rent?: number | null },
  hasTenant: boolean,
): boolean {
  return !!((pos(p.value) || pos(p.obj_value)) && (pos(p.target_rent) || hasTenant));
}
