export interface Property {
  id: string;
  user_id: string;
  name: string;
  prop_type: string;
  address: string;
  sqm: number;
  ownership: number;
}

export const PROPERTY_TYPES = [
  "Κατοικία",
  "Επαγγελματικό",
  "Οικόπεδο",
  "Αποθήκη",
  "Γκαράζ",
  "Άλλο",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
}

export const EXPENSE_CATEGORIES = [
  "Επισκευή",
  "Συντήρηση",
  "Ασφάλεια",
  "Φόρος",
  "Λοιπά",
] as const;

export interface Bill {
  id: string;
  type: string;
  issuer: string;
  amount: number;
  date: string;
  paid: boolean;
}

export const BILL_TYPES = [
  "ΔΕΗ",
  "ΕΥΔΑΠ",
  "Αέριο",
  "Κοινόχρηστα",
  "Ίντερνετ",
  "Άλλο",
] as const;

export interface RentalInfo {
  isRented: boolean;
  monthlyRent?: number;
  tenantName?: string;
  leaseStart?: string;
  leaseEnd?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  description?: string;
  type: "reminder" | "payment" | "visit" | "other";
}

export interface PropertyDataContent {
  property_id: string;
  value?: number;
  expenses?: Expense[];
  bills?: Bill[];
  rental?: RentalInfo;
  events?: CalendarEvent[];
  notes?: string;
}

export interface PropertyData {
  id: string;
  user_id: string;
  data: PropertyDataContent;
}
