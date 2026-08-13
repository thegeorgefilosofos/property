'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
// Το προφίλ χρέωσης έχει ένα σπίτι: lib/data/billing.
import * as billing from '@/lib/data/billing';
import { T, fe, fn, fp, fd, ABSENT, Modal, TT } from '@/components/Theme';
import { CustomSelect, DatePicker } from './UIComponents';
import { cleanAma, isValidAmaFormat, amaLengthLooksUnusual } from '@/lib/property/ama';
import { STATUSES, BY_KEY, readStatus, writeStatus, type PropertyStatus } from '@/lib/property/status';
import { fillOnlyEmpty, firstFilled } from '@/lib/core/prefill';
import { failed } from '@/lib/core/dbError';

// Ενεργειακή κλάση (ΠΕΑ) & τύποι θέρμανσης — κοινά για wizard και Ρυθμίσεις.
const PEA_CLASSES = ['A+', 'A', 'B+', 'B', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η'];
const HEATING_OPTS: [string, string][] = [
  ['central_gas', 'Κεντρική (αέριο)'], ['autonomous_gas', 'Αυτόνομη (αέριο)'], ['oil', 'Πετρέλαιο'],
  ['heat_pump', 'Αντλία θερμότητας'], ['electric', 'Ηλεκτρική'], ['pellet', 'Pellet / Ξύλο'],
  ['ac_only', 'Κλιματιστικά'], ['none', 'Χωρίς θέρμανση'], ['other', 'Άλλο'],
];

// ── Domain constants (kept in sync με το dashboard/page.tsx) ────────────────
const STATUS_COLORS: Record<string, string> = {
  rented: 'var(--text-secondary)', vacant: 'var(--text-secondary)', own_use: 'var(--text-secondary)',
  renovation: 'var(--text-secondary)', for_sale: 'var(--text-secondary)', seasonal: 'var(--text-secondary)', disputed: 'var(--text-secondary)',
};
// ΤΟ ΛΕΞΙΛΟΓΙΟ ΤΩΝ ΚΑΤΑΣΤΑΣΕΩΝ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ ΕΔΩ.
//
// Υπήρχε δεύτερος πίνακας ετικετών, και είχε ήδη αποκλίνει από τον κανονικό:
// η κεφαλίδα του ακινήτου έλεγε «Μακροχρόνια μίσθωση», ο οδηγός «Ενοικιάζεται»·
// η κεφαλίδα «Βραχυχρόνια μίσθωση», ο οδηγός «Εποχιακό»· και το «Προς πώληση»
// γραφόταν με δύο διαφορετικές κεφαλαιοποιήσεις. Ίδιο πεδίο, ίδια βάση, τρεις
// διαφωνίες — ο χρήστης δεν μπορούσε να ξέρει ότι μιλάει για το ίδιο πράγμα.
//
// Πηγή είναι το `lib/property/status.ts`, που κρατά και τις επεξηγήσεις και
// ξέρει τι γράφεται στη βάση (`writeStatus`) για κάθε επιλογή.
const PROP_TYPE_LABELS: Record<string, string> = {
  apartment: 'Διαμέρισμα', house: 'Μονοκατοικία', studio: 'Στούντιο',
  maisonette: 'Μεζονέτα', office: 'Γραφείο', shop: 'Κατάστημα',
  warehouse: 'Αποθήκη', land: 'Οικόπεδο', parking: 'Parking',
  storage: 'Αποθήκη Κτιρίου', villa: 'Βίλα', other: 'Άλλο',
};
const PROP_TYPES = ['apartment', 'house', 'studio', 'maisonette', 'office', 'shop', 'warehouse', 'land', 'parking', 'storage', 'villa', 'other'];

// Τύποι χωρίς όροφο / έτος κατασκευής (γη & βοηθητικοί χώροι)
const LAND_LIKE = new Set(['land', 'parking', 'storage', 'warehouse']);
// Airbnb εκτίμηση πληρότητας
const OCCUPANCY = 0.6;

// ── ΤΙΜΗ ΑΝΑ ΔΙΑΝΥΚΤΕΡΕΥΣΗ ⇄ ΑΠΟΘΗΚΕΥΜΕΝΟ ΜΗΝΙΑΙΟ ΙΣΟΔΥΝΑΜΟ ────────────────
//
// Το `target_rent` είναι ΠΑΝΤΟΥ μηνιαίο: το resolveRent το δίνει ως μηνιαίο και
// το computeYields το πολλαπλασιάζει ×12 (Σύγκριση, Αποδόσεις, Χαρτοφυλάκιο,
// δανειακή ικανότητα). Ο οδηγός όμως έδειχνε τα ετήσια έσοδα με πληρότητα 60%
// και αποθήκευε τιμή/νύχτα × 30 — δηλαδή 100% πληρότητα, 30 νύχτες τον μήνα.
// Για 100 € τη νύχτα ο χρήστης διάβαζε «21.900 με εκτιμώμενη πληρότητα 60%»
// και μετά έβλεπε 36.000 στη Σύγκριση: 64% πάνω από αυτό που του υποσχέθηκε
// η ίδια οθόνη, πάνω σε αριθμό που κρίνει αν αγοράζει ή πουλάει.
//
// Δύο κατευθύνσεις, μία σταθερά πληρότητας: αυτό που δείχνει η προεπισκόπηση
// είναι αυτό που γράφεται, και το άνοιγμα-για-επεξεργασία ξαναβγάζει την ίδια
// τιμή/νύχτα αντί να την ανεβάζει σε κάθε αποθήκευση.
const nightlyToMonthlyRent = (nightly: number) => (nightly * 365 * OCCUPANCY) / 12;
const monthlyRentToNightly = (monthly: number) =>
  Math.round(((monthly * 12) / (365 * OCCUPANCY)) * 100) / 100;

const STEPS = ['Τύπος', 'Βασικά', 'Οικονομικά', 'Ρυθμίσεις', 'Σύνοψη'];

// ── property_settings (χωριστός πίνακας, keyed by property_id) ───────────────
// Ίδια πεδία/ετικέτες με την καρτέλα «Ρυθμίσεις» (TabSettings).
interface PropertySettings {
  owner_name: string; owner_afm: string; owner_phone: string; owner_email: string;
  electricity_provider: string; water_provider: string; internet_provider: string;
  property_manager: string; property_manager_phone: string;
  insurance_company: string; insurance_policy: string; insurance_expiry: string; notes: string;
}
const INIT_SETTINGS: PropertySettings = {
  owner_name: '', owner_afm: '', owner_phone: '', owner_email: '',
  electricity_provider: '', water_provider: '', internet_provider: '',
  property_manager: '', property_manager_phone: '',
  insurance_company: '', insurance_policy: '', insurance_expiry: '', notes: '',
};

// ── Εικονίδια ανά τύπο ακινήτου (inline SVG, currentColor) ──────────────────
function TypeIcon({ type }: { type: string }) {
  const p = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (type) {
    case 'apartment': // κτίριο διαμερισμάτων
      return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h.01M12 7h.01M15 7h.01M9 11h.01M12 11h.01M15 11h.01M9 15h.01M15 15h.01" /><path d="M11 21v-3h2v3" /></svg>;
    case 'house': // μονοκατοικία
      return <svg {...p}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>;
    case 'studio': // ενιαίος χώρος
      return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 14h16M14 4v10" /></svg>;
    case 'maisonette': // δύο επίπεδα
      return <svg {...p}><path d="M4 21V9l8-6 8 6v12" /><path d="M4 13h16" /><path d="M10 21v-4h4v4" /></svg>;
    case 'office': // γραφείο
      return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2" /></svg>;
    case 'shop': // κατάστημα / storefront
      return <svg {...p}><path d="M4 9l1-4h14l1 4" /><path d="M4 9a2 2 0 004 0 2 2 0 004 0 2 2 0 004 0 2 2 0 004 0" /><path d="M5 11v9h14v-9" /><path d="M9 20v-5h4v5" /></svg>;
    case 'warehouse': // αποθήκη
      return <svg {...p}><path d="M3 21V8l9-4 9 4v13" /><path d="M3 21h18" /><rect x="7" y="12" width="10" height="9" /><path d="M7 16h10" /></svg>;
    case 'land': // οικόπεδο / πινακίδα
      return <svg {...p}><path d="M4 20h16" /><path d="M6 20V6l7-2v16" /><path d="M13 8h5v5h-5" /></svg>;
    case 'parking': // parking
      return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 16V8h3.5a2.5 2.5 0 010 5H9" /></svg>;
    case 'storage': // αποθήκη κτιρίου / κιβώτιο
      return <svg {...p}><rect x="4" y="6" width="16" height="14" rx="1" /><path d="M4 10h16" /><path d="M10 6V4h4v2" /><path d="M10 14h4" /></svg>;
    case 'villa': // βίλα με πισίνα
      return <svg {...p}><path d="M3 10l6-5 6 5" /><path d="M5 9v6h8V9" /><path d="M16 15c1.5-1 3.5-1 5 0v4c-1.5 1-3.5 1-5 0" /><path d="M8 15v0" /></svg>;
    default: // other
      return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 8v.01M12 11v5" /></svg>;
  }
}

const num = (s: string) => { const v = parseFloat(s.replace(',', '.')); return isNaN(v) ? null : v; };

// ── Στυλ inputs (ίδιο look με το υπάρχον modal) ─────────────────────────────
const inputStyle: React.CSSProperties = {
  // Ύψος από την κοινή κλίμακα: ήταν καρφωμένο 40 σε ~25 πεδία του οδηγού, άρα
  // δεν ακολουθούσε το 44 που ζητά ο δείκτης-δάχτυλο (globals.css, pointer: coarse).
  width: '100%', padding: '10px 16px', height: T.h.lg, borderRadius: 6,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans,
  letterSpacing: 0, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s, box-shadow 0.15s',
};
const monoInputStyle: React.CSSProperties = { ...inputStyle, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' };
const labelStyle: React.CSSProperties = {
  ...TT.label, display: 'flex', alignItems: 'flex-end', minHeight: 28, lineHeight: 1.3, marginBottom: 6,
};

// Όροφοι (ελληνική ονοματολογία): κείμενο, όχι αριθμός.
const FLOOR_OPTS = ['Υπόγειο', 'Ημιυπόγειο', 'Ισόγειο', 'Υπερυψωμένο ισόγειο', 'Ημιώροφος', '1ος', '2ος', '3ος', '4ος', '5ος', '6ος', '7ος και άνω', 'Δώμα / Ρετιρέ'];
const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)'; };
const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => { e.target.style.borderColor = 'var(--border-default)'; e.target.style.boxShadow = 'none'; };


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>;
}

// Επικεφαλίδα υποενότητας (ίδιο accent uppercase look με το panel απόδοσης)
const sectionLabelStyle: React.CSSProperties = {
  fontFamily: T.font.sans, fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 4,
};

interface ExistingProperty {
  id: string; name?: string | null; prop_type?: string | null; address?: string | null;
  postal_code?: string | null; sqm?: number | null; floor?: number | string | null; year_built?: number | null;
  value?: number | null; purchase_price?: number | null; target_rent?: number | null;
  ownership?: number | string | null; status_detail?: string | null; atak?: string | null;
  obj_value?: number | string | null; enfia?: number | string | null; pea_class?: string | null;
  heating?: string | null; purchase_date?: string | null; parking_spaces?: number | string | null;
  storage_sqm?: number | string | null; bedrooms?: number | string | null; rental_mode?: string | null;
  co_owners?: string[] | null; ama?: string | null;
}
const s = (v: number | string | null | undefined) => (v == null ? '' : String(v));

export default function AddPropertyWizard({ userId, onClose, onSaved, existing }: { userId: string; onClose: () => void; onSaved: () => void; existing?: ExistingProperty | null }) {
  const supabase = createClient();
  const isEdit = !!existing?.id;
  const [step, setStep] = useState(0); // 0..3
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Id του ακινήτου που δημιουργήθηκε σε προηγούμενη, μισοτελειωμένη προσπάθεια
  // αποθήκευσης (βλ. save()) — κρατά το «δοκίμασε ξανά» πάνω στο ίδιο ακίνητο.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [propType, setPropType] = useState(existing?.prop_type || 'apartment');
  // ΜΙΑ κατάσταση, στο λεξιλόγιο της εφαρμογής. Η μετάφραση προς τις δύο
  // στήλες της βάσης γίνεται από το `writeStatus`, που τις γράφει ΜΑΖΙ.
  const [statusKey, setStatusKey] = useState<PropertyStatus>(existing ? readStatus(existing) : 'vacant');
  // Η βραχυχρόνια ΔΕΝ είναι πια ξεχωριστός διακόπτης: είναι μία από τις επτά καταστάσεις.
  const airbnb = statusKey === 'rent_short';
  // ΑΜΑ: πεδίο ΤΟΥ ΑΚΙΝΗΤΟΥ, ζητούμενο τη στιγμή που η κατάσταση γίνεται
  // βραχυχρόνια — όχι κρυμμένο σε accordion άλλης καρτέλας πίσω από τρίτο
  // διακόπτη. Το 2025 στάλθηκαν 12.145 καταχωρήσεις για απενεργοποίηση επειδή
  // ο ΑΜΑ έλειπε ή ήταν άκυρος.
  const [ama, setAma] = useState(cleanAma(existing?.ama || ''));

  const [name, setName] = useState(existing?.name || '');
  const [address, setAddress] = useState(existing?.address || '');
  const [postalCode, setPostalCode] = useState(existing?.postal_code || '');
  const [atak, setAtak] = useState(existing?.atak || '');
  const [sqm, setSqm] = useState(s(existing?.sqm));
  const [floor, setFloor] = useState(s(existing?.floor));
  const [yearBuilt, setYearBuilt] = useState(s(existing?.year_built));

  const [value, setValue] = useState(s(existing?.value));
  const [objValue, setObjValue] = useState(s(existing?.obj_value));
  const [enfia, setEnfia] = useState(s(existing?.enfia));
  const [purchasePrice, setPurchasePrice] = useState(s(existing?.purchase_price));
  const [purchaseDate, setPurchaseDate] = useState(existing?.purchase_date || '');
  // Στη βραχυχρόνια το πεδίο ζητά τιμή ΑΝΑ ΔΙΑΝΥΚΤΕΡΕΥΣΗ, ενώ η βάση κρατά
  // μηνιαίο. Το πεδίο φόρτωνε ωμό το `target_rent`: άνοιγες ένα Airbnb ακίνητο
  // για να αλλάξεις τη διεύθυνση και έβρισκες 3.000 στην «τιμή ανά
  // διανυκτέρευση», με την προεπισκόπηση να λέει 657.000 € ετήσια έσοδα. Κάθε
  // αποθήκευση πολλαπλασίαζε ξανά το νούμερο.
  const [rent, setRent] = useState(() =>
    airbnb && existing?.target_rent != null ? String(monthlyRentToNightly(existing.target_rent)) : s(existing?.target_rent)
  );
  const [ownership, setOwnership] = useState(s(existing?.ownership) || '100');
  // Συνιδιοκτήτες: όταν το ποσοστό < 100%, ζητάμε πλήθος (1–99) και ονόματα.
  const [coOwners, setCoOwners] = useState<string[]>(
    Array.isArray(existing?.co_owners) && existing!.co_owners!.length ? existing!.co_owners!.map(String) : ['']
  );
  const setCoOwnerCount = (n: number) => {
    const c = Math.max(1, Math.min(99, Math.floor(n) || 1));
    setCoOwners(prev => {
      const next = prev.slice(0, c);
      while (next.length < c) next.push('');
      return next;
    });
  };
  const setCoOwnerAt = (i: number, val: string) => setCoOwners(prev => prev.map((v, idx) => idx === i ? val : v));
  const [peaClass, setPeaClass] = useState(existing?.pea_class || '');
  const [heating, setHeating] = useState(existing?.heating || '');
  const [parking, setParking] = useState(s(existing?.parking_spaces));
  const [storageSqm, setStorageSqm] = useState(s(existing?.storage_sqm));
  const [bedrooms, setBedrooms] = useState(s(existing?.bedrooms));

  // property_settings (μόνο για υπάρχον ακίνητο υπάρχει ήδη γραμμή· για νέο τη δημιουργούμε στο save)
  const [settings, setSettings] = useState<PropertySettings>(INIT_SETTINGS);
  const setSf = (k: keyof PropertySettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setSettings(p => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (!existing?.id) return;
    let active = true;
    supabase.from('property_settings').select('*').eq('property_id', existing.id).maybeSingle()
      .then(({ data }) => { if (active && data) setSettings({ ...INIT_SETTINGS, ...(data as Partial<PropertySettings>) }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  // ── Ο ΙΔΙΟΚΤΗΤΗΣ ΕΙΝΑΙ Ο ΙΔΙΟΣ ΣΕ ΚΑΘΕ ΑΚΙΝΗΤΟ ΤΟΥ ────────────────────────
  //
  // Ο πίνακας `property_settings` έχει `UNIQUE (property_id)`, άρα κρατά τα
  // στοιχεία ιδιοκτήτη ΑΝΑ ΑΚΙΝΗΤΟ. Ο οδηγός τα ζητούσε κενά κάθε φορά: όνομα,
  // ΑΦΜ, τηλέφωνο, email — τέσσερα πεδία επί κάθε νέο ακίνητο, για το ίδιο
  // ακριβώς πρόσωπο. Το ΑΦΜ είναι εννιά ψηφία που πληκτρολογούνται λάθος· και
  // αρκεί ένα λάθος ψηφίο σε ένα ακίνητο για να κοπεί η δήλωση μισθωτηρίου.
  //
  // Η μία πηγή είναι το προφίλ του χρήστη (`billing_profiles`, μία γραμμή ανά
  // χρήστη) — εκεί όπου ήδη συμπληρώνει τα ίδια στοιχεία για τα παραστατικά.
  // Δεν αντιγράφουμε από «κάποιο άλλο ακίνητο»: αυτό θα διαιώνιζε το λάθος του
  // πρώτου. Το email έρχεται από τον λογαριασμό σύνδεσης, που είναι βέβαιο.
  //
  // Ισχύει ΜΟΝΟ για νέο ακίνητο, και μόνο σε κενά πεδία: αν ο χρήστης πρόλαβε
  // να γράψει κάτι όσο φόρτωνε, ό,τι έγραψε μένει (fillOnlyEmpty).
  useEffect(() => {
    if (existing?.id) return;
    let active = true;
    (async () => {
      const [prof, { data: auth }] = await Promise.all([
        billing.profile<Record<string, string | null>>(
          supabase, userId, 'owner_name, full_name, company_name, afm, phone'),
        supabase.auth.getUser(),
      ]);
      if (!active) return;
      const p = prof;
      const proposed = {
        owner_name:  firstFilled(p?.owner_name, p?.full_name, p?.company_name),
        owner_afm:   firstFilled(p?.afm),
        owner_phone: firstFilled(p?.phone),
        owner_email: firstFilled(auth?.user?.email),
      };
      setSettings(cur => ({ ...cur, ...fillOnlyEmpty(proposed, { ...cur }) }));
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, userId]);

  const isLandLike = LAND_LIKE.has(propType);
  // Συνιδιοκτησία: ποσοστό < 100% ⇒ ζητάμε συνιδιοκτήτες.
  const ownershipN = num(ownership);
  const isShared = ownershipN != null && ownershipN > 0 && ownershipN < 100;
  // Airbnb ⇒ status seasonal
  const dbStatus = writeStatus(statusKey);

  const valueN = num(value);
  // Η αντικειμενική αξία τροφοδοτεί την προεπισκόπηση απόδοσης όταν λείπει η εμπορική
  // (καθρέφτης του resolveValue: εμπορική > αντικειμενική).
  const effValueN = valueN ?? num(objValue);
  const rentN = num(rent);
  // Μηνιαίο ισοδύναμο: ΕΝΑΣ αριθμός που τροφοδοτεί ΚΑΙ την προεπισκόπηση ΚΑΙ το
  // `target_rent` που αποθηκεύεται — δεν μπορούν πια να αποκλίνουν.
  const monthlyRentN = rentN != null ? (airbnb ? nightlyToMonthlyRent(rentN) : rentN) : null;
  const annualRent = monthlyRentN != null ? monthlyRentN * 12 : null;
  const grossYield = (annualRent != null && effValueN != null && effValueN > 0) ? (annualRent / effValueN) * 100 : null;

  const rentLabel = airbnb ? 'Τιμή ανά διανυκτέρευση (€)' : 'Στόχος Ενοικίου (€/μήνα)';
  const sqmLabel = propType === 'land' ? 'Εμβαδόν Οικοπέδου (τ.μ.)' : 'Εμβαδόν (τ.μ.)';

  const canNext = step === 0 ? !!propType : step === 1 ? !!name.trim() : true;

  const save = async () => {
    if (!name.trim()) { setStep(1); return; }
    setSaving(true); setError('');
    // Ό,τι ακριβώς δείχνει η προεπισκόπηση απόδοσης — ίδιο μηνιαίο ισοδύναμο.
    const storedRent = monthlyRentN;
    const payload = {
      name: name.trim(),
      prop_type: propType,
      address: address.trim() || null,
      postal_code: postalCode.trim() || null,
      atak: atak.trim() || null,
      sqm: num(sqm),
      value: valueN,
      purchase_price: num(purchasePrice),
      target_rent: storedRent,
      floor: isLandLike ? null : (floor.trim() || null),
      year_built: isLandLike ? null : (yearBuilt ? parseInt(yearBuilt) : null),
      ownership: num(ownership) ?? 100,
      co_owners: isShared ? coOwners.map(x => x.trim()).filter(Boolean) : null,
      status_detail: dbStatus.status_detail,
      obj_value: num(objValue),
      enfia: num(enfia),
      purchase_date: purchaseDate || null,
      pea_class: isLandLike ? null : (peaClass || null),
      heating: isLandLike ? null : (heating || null),
      parking_spaces: isLandLike ? null : (parking ? parseInt(parking) : null),
      storage_sqm: isLandLike ? null : num(storageSqm),
      bedrooms: isLandLike ? null : (bedrooms ? parseInt(bedrooms) : null),
      rental_mode: dbStatus.rental_mode,
      // Ο ΑΜΑ γράφεται μόνο όταν το ακίνητο είναι βραχυχρόνιο. Αν γυρίσει σε
      // μακροχρόνια, ΔΕΝ σβήνεται (μπορεί να ξαναγίνει Airbnb και ο αριθμός
      // μένει ο ίδιος) — απλώς παύει να ζητείται.
      ...(airbnb ? { ama: isValidAmaFormat(ama) ? ama : null } : {}),
    };
    // Η αποθήκευση είναι δύο κλήσεις: πρώτα το ακίνητο, μετά οι «Ρυθμίσεις».
    // Αν έσκαγε η δεύτερη (π.χ. χάθηκε το δίκτυο ενδιάμεσα), το ακίνητο είχε
    // ΗΔΗ δημιουργηθεί αλλά ο οδηγός το ξεχνούσε: το «Προσθήκη Ακινήτου» που
    // πατούσε ο χρήστης βλέποντας το σφάλμα έκανε ΔΕΥΤΕΡΟ insert. Έβρισκε το
    // ίδιο ακίνητο δύο φορές στη λίστα — και επειδή τα ακίνητα μετρούν στο όριο
    // του πακέτου, το διπλό κατανάλωνε θέση που είχε πληρώσει.
    const savedId = existing?.id ?? createdId;
    let propertyId: string | null = savedId;
    let err: { message?: string } | null = null;
    if (savedId) {
      const { error: uErr } = await properties.update(supabase, savedId, payload, userId);
      err = uErr;
    } else {
      const { data: created, error: iErr } = await properties.add(supabase, { user_id: userId, ...payload });
      err = iErr;
      propertyId = created?.id ?? null;
      // Το κρατάμε ΠΡΙΝ από το δεύτερο βήμα: από εδώ και πέρα κάθε νέα
      // προσπάθεια ενημερώνει αυτό το ακίνητο αντί να φτιάχνει άλλο.
      if (propertyId) setCreatedId(propertyId);
    }
    if (err) { setSaving(false); setError(failed('Το ακίνητο δεν αποθηκεύτηκε', err)); return; }

    // property_settings: αποθήκευση μόνο αν έχει συμπληρωθεί κάτι (αποφυγή κενής γραμμής)
    if (propertyId && Object.values(settings).some(v => (v ?? '').toString().trim() !== '')) {
      const { error: sErr } = await supabase.from('property_settings')
        .upsert({ ...settings, property_id: propertyId, user_id: userId }, { onConflict: 'property_id' });
      // Το ακίνητο έχει ήδη αποθηκευτεί — λέμε ρητά τι έμεινε πίσω, ώστε το
      // «δοκίμασε ξανά» να μη διαβάζεται ως «ξαναφτιάξ' το από την αρχή».
      if (sErr) { setSaving(false); setError(failed('Το ακίνητο αποθηκεύτηκε, αλλά οι ρυθμίσεις του δεν καταχωρήθηκαν', sErr)); return; }
    }

    setSaving(false);
    onSaved();
  };

  // ── Layout helpers ────────────────────────────────────────────────────────
  const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 16 };
  const grid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 16 };

  // ── ΔΕΝ ΚΛΕΙΝΕΙ ΟΣΟ ΑΠΟΘΗΚΕΥΕΙ ────────────────────────────────────────────
  // Το χειρόγραφο κέλυφος έκλεινε μόνο με κλικ στο φόντο ή στο «✕». Το Modal
  // προσθέτει Escape, δηλαδή έναν δρόμο εξόδου που πατιέται κατά λάθος — και η
  // `save()` είναι ΔΥΟ εγγραφές στη σειρά (user_properties, μετά
  // property_settings). Αν το παράθυρο φύγει ανάμεσά τους, χάνεται και το
  // `createdId`: η επόμενη προσπάθεια ΞΑΝΑΦΤΙΑΧΝΕΙ το ακίνητο αντί να το
  // ενημερώσει — ακριβώς το διπλό insert που ο κώδικας της `save()` μπήκε στον
  // κόπο να αποτρέψει. Και το μήνυμα «αποθηκεύτηκε το ακίνητο, όχι οι ρυθμίσεις»
  // δεν προλαβαίνει να διαβαστεί. Όσο γράφει, το παράθυρο μένει.
  const requestClose = () => { if (!saving) onClose(); };

  return (
    // ΠΟΛΥΒΗΜΑΤΙΚΟ, ΑΛΛΑ ΠΑΡΑΘΥΡΟ — ΟΧΙ ΟΛΟΣΕΛΙΔΗ ΕΜΠΕΙΡΙΑ.
    // Κεντραρισμένο, 640 πλάτος, με τίτλο και ενέργειες: ό,τι ακριβώς είναι το
    // Modal. Ο τίτλος μένει σταθερός και ο υπότιτλος αλλάζει ανά βήμα («Βήμα 2
    // από 5 · Βασικά»), οπότε το βήμα λέγεται μία φορά, εκεί που το περιμένει ο
    // χρήστης. Το χειρόγραφο κέλυφος δεν άκουγε Escape, δεν επέστρεφε την
    // εστίαση και δεν κλείδωνε την κύλιση του φόντου· και το «✕» του ήταν
    // 36×36 με radius 18, δηλαδή τέταρτο σχήμα κλεισίματος στην ίδια εφαρμογή.
    <Modal open onClose={requestClose} width={640}
      ariaLabel="Προσθήκη ακινήτου"
      title={isEdit ? 'Επεξεργασία ακινήτου' : 'Νέο Ακίνητο'}
      subtitle={`Βήμα ${step + 1} από ${STEPS.length} · ${STEPS[step]}`}
      footer={<>
        <button onClick={() => (step === 0 ? requestClose() : setStep(s => s - 1))} style={{ height: T.h.lg, padding: '0 20px', borderRadius: T.radius.pill, border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 14, fontWeight: 500, cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-overlay)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          {step === 0 ? 'Ακύρωση' : 'Πίσω'}
        </button>

        {step < STEPS.length - 1 ? (
          <button onClick={() => canNext && setStep(s => s + 1)} disabled={!canNext} style={{
            height: T.h.lg, padding: '0 24px', borderRadius: T.radius.pill, border: 'none',
            background: canNext ? 'var(--accent)' : 'var(--bg-overlay)', color: canNext ? 'var(--accent-text)' : 'var(--text-tertiary)',
            fontFamily: T.font.sans, fontSize: 14, fontWeight: 500, cursor: canNext ? 'pointer' : 'not-allowed',
          }}>Συνέχεια</button>
        ) : (
          <button onClick={save} disabled={saving || !name.trim()} style={{
            height: T.h.lg, padding: '0 24px', borderRadius: T.radius.pill, border: 'none',
            background: saving || !name.trim() ? 'var(--bg-overlay)' : 'var(--accent)', color: saving || !name.trim() ? 'var(--text-tertiary)' : 'var(--accent-text)',
            fontFamily: T.font.sans, fontSize: 14, fontWeight: 500, cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
          }}>{saving ? 'Αποθήκευση…' : isEdit ? 'Αποθήκευση αλλαγών' : 'Προσθήκη Ακινήτου'}</button>
        )}
      </>}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STEPS.map((label, i) => {
          const done = i < step, active = i === step;
          const on = done || active;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : '0 0 auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: on ? 'var(--accent)' : 'var(--bg-overlay)', color: on ? 'var(--accent-text)' : 'var(--text-tertiary)',
                  border: active ? '2px solid var(--accent)' : '2px solid transparent',
                  boxShadow: active ? '0 0 0 4px var(--accent-soft)' : 'none',
                  fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, transition: 'background-color 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s, opacity 0.2s',
                }}>{done ? '✓' : i + 1}</div>
                <div style={{ fontFamily: T.font.sans, fontSize: 11, fontWeight: 500, color: on ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{label}</div>
              </div>
              {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < step ? 'var(--accent)' : 'var(--border-subtle)', margin: '0 8px', marginBottom: 22, transition: 'background 0.2s' }} />}
            </div>
          );
        })}
      </div>

      {/* STEP 1, Τύπος & Κατάσταση */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <label style={labelStyle}>Τύπος ακινήτου</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {PROP_TYPES.map(t => {
                const sel = propType === t;
                return (
                  <button key={t} onClick={() => setPropType(t)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 8px',
                    borderRadius: 12, cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s',
                    border: sel ? '2px solid var(--accent)' : '1px solid var(--border-default)',
                    background: sel ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    color: sel ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg-overlay)'; }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'var(--bg-surface)'; }}>
                    <TypeIcon type={t} />
                    <span style={{ fontFamily: T.font.sans, fontSize: 12, fontWeight: 500, color: sel ? 'var(--text-primary)' : 'var(--text-secondary)', textAlign: 'center' }}>{PROP_TYPE_LABELS[t]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Κατάσταση</label>
            {/* ΕΠΤΑ ΕΠΙΛΟΓΕΣ, ΙΔΙΕΣ ΑΚΡΙΒΩΣ ΜΕ ΤΗΝ ΚΕΦΑΛΙΔΑ ΤΟΥ ΑΚΙΝΗΤΟΥ.
                Η κάθε μία φέρει και την επεξήγησή της, όπως στο μενού: η
                διαφορά μακροχρόνιας και βραχυχρόνιας δεν είναι προφανής από
                τον τίτλο, και ήταν ο λόγος που υπήρχε χωριστός διακόπτης. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 8 }}>
              {STATUSES.map(st => {
                const sel = statusKey === st.key;
                return (
                  <button key={st.key} onClick={() => setStatusKey(st.key)} aria-pressed={sel} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                    padding: '10px 14px', borderRadius: T.radius.inner, cursor: 'pointer', textAlign: 'left',
                    transition: `border-color .15s ${T.ease.standard}, background .15s ${T.ease.standard}`,
                    border: `1px solid ${sel ? 'var(--accent)' : 'var(--border-default)'}`,
                    background: sel ? 'var(--accent-soft)' : 'var(--bg-surface)',
                    fontFamily: T.font.sans,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: sel ? 700 : 500, color: 'var(--text-primary)' }}>{st.label}</span>
                    <span style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--text-tertiary)' }}>{st.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ο ΔΙΑΚΟΠΤΗΣ «Βραχυχρόνια μίσθωση (Airbnb / Booking)» ΕΦΥΓΕ.
              Έκανε ό,τι ακριβώς και το chip «Βραχυχρόνια μίσθωση» — έγραφε
              την ίδια κατάσταση — και όσο ήταν αναμμένος ΝΕΚΡΩΝΕ ολόκληρη τη
              σειρά των chips (opacity 0.5, pointerEvents none). Δύο
              χειριστήρια για ένα πεδίο, με το ένα να απενεργοποιεί το άλλο:
              ο χρήστης δεν μπορούσε να καταλάβει ποιο είναι το κανονικό.
              Ο ΑΜΑ, που ήταν ο πραγματικός λόγος να ξεχωρίζει η βραχυχρόνια,
              εμφανίζεται από μόνος του μόλις επιλεγεί εκείνη η κατάσταση. */}

          {/* Ο ΑΜΑ ΕΜΦΑΝΙΖΕΤΑΙ ΤΗ ΣΤΙΓΜΗ ΠΟΥ ΤΟ ΑΚΙΝΗΤΟ ΓΙΝΕΤΑΙ ΒΡΑΧΥΧΡΟΝΙΟ.
              Δεν υπάρχει ξεχωριστός διακόπτης και δεν κρύβεται σε accordion
              άλλης καρτέλας: η κατάσταση του ακινήτου είναι η ερώτηση, ο ΑΜΑ
              είναι η αμέσως επόμενη. Δεν είναι υποχρεωτικό πεδίο εδώ (ο
              χρήστης μπορεί να μην τον έχει ακόμη) — αν λείψει, η μόνιμη
              γραμμή στους «Επισκέπτες» και στην «Τιμολόγηση» τον ζητά ξανά. */}
          {airbnb && (
            <div style={{ marginTop: -8 }}>
              <Field label="Αριθμός Μητρώου Ακινήτου (ΑΜΑ)">
                <input style={inputStyle} value={ama} onChange={e => setAma(cleanAma(e.target.value))}
                  inputMode="numeric" placeholder="Μόνο ψηφία, από το Μητρώο Ακινήτων Βραχυχρόνιας Διαμονής (myAADE)"
                  onFocus={onFocus} onBlur={onBlur} />
              </Field>
              <div style={{ fontFamily: T.font.sans, fontSize: 12, color: amaLengthLooksUnusual(ama) ? 'var(--warning)' : 'var(--text-secondary)', marginTop: 6, lineHeight: 1.6 }}>
                {amaLengthLooksUnusual(ama)
                  ? `Ο αριθμός έχει ${ama.length} ψηφία, που είναι ασυνήθιστο. Έλεγξέ τον στο myAADE πριν συνεχίσεις.`
                  : 'Ο ΑΜΑ πρέπει να αναγράφεται σε κάθε καταχώρηση σε Airbnb και Booking. Το 2025 στάλθηκαν 12.145 καταχωρήσεις για απενεργοποίηση επειδή έλειπε ή ήταν άκυρος.'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2, Βασικά Στοιχεία */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Ονομασία ακινήτου *">
            <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Παράδειγμα: Αράββου 45" onFocus={onFocus} onBlur={onBlur} autoFocus />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <Field label="Διεύθυνση">
              <input style={inputStyle} value={address} onChange={e => setAddress(e.target.value)} placeholder="Παράδειγμα: Αράββου 45, Βύρωνας" onFocus={onFocus} onBlur={onBlur} />
            </Field>
            <Field label="Ταχ. Κώδικας">
              <input style={inputStyle} value={postalCode} onChange={e => setPostalCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))} inputMode="numeric" placeholder="16232" onFocus={onFocus} onBlur={onBlur} />
            </Field>
          </div>
          <Field label="ΑΤΑΚ (Αριθμός Ταυτότητας Ακινήτου)">
            <input style={monoInputStyle} value={atak} onChange={e => setAtak(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))} inputMode="numeric" placeholder="11 ψηφία, από το Ε9 ή το περιουσιολόγιο" onFocus={onFocus} onBlur={onBlur} />
          </Field>
          {isLandLike ? (
            <Field label={sqmLabel}>
              <input style={monoInputStyle} type="number" min={0} inputMode="decimal" value={sqm} onChange={e => setSqm(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
            </Field>
          ) : (
            <>
              <div style={grid3}>
                <Field label={sqmLabel}>
                  <input style={monoInputStyle} type="number" min={0} inputMode="decimal" value={sqm} onChange={e => setSqm(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
                </Field>
                <Field label="Όροφος">
                  <CustomSelect value={floor} onChange={setFloor} placeholder="Επίλεξε"
                    options={FLOOR_OPTS.map(f => ({ value: f, label: f }))} />
                </Field>
                <Field label="Έτος κατασκευής">
                  <input style={monoInputStyle} type="number" min={0} value={yearBuilt} onChange={e => setYearBuilt(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
                </Field>
              </div>
              <div style={grid3}>
                <Field label="Ενεργειακή κλάση (ΠΕΑ)">
                  <CustomSelect value={peaClass} onChange={setPeaClass} placeholder="Επίλεξε"
                    options={PEA_CLASSES.map(c => ({ value: c, label: c }))} />
                </Field>
                <Field label="Τύπος θέρμανσης">
                  <CustomSelect value={heating} onChange={setHeating} placeholder="Επίλεξε"
                    options={HEATING_OPTS.map(([v, l]) => ({ value: v, label: l }))} />
                </Field>
                <Field label="Θέσεις στάθμευσης">
                  <input style={monoInputStyle} type="number" min={0} value={parking} onChange={e => setParking(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
                </Field>
              </div>
              <div style={grid2}>
                <Field label="Υπνοδωμάτια">
                  <input style={monoInputStyle} type="number" min={0} value={bedrooms} onChange={e => setBedrooms(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
                </Field>
                <Field label="Αποθήκη (τ.μ.)">
                  <input style={monoInputStyle} type="number" min={0} inputMode="decimal" value={storageSqm} onChange={e => setStorageSqm(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
                </Field>
              </div>
            </>
          )}
        </div>
      )}

      {/* STEP 3, Οικονομικά */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={grid2}>
            <Field label="Εμπορική αξία (€)">
              <input style={monoInputStyle} type="number" min={0} inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            <Field label="Αντικειμενική αξία (€)">
              <input style={monoInputStyle} type="number" min={0} inputMode="decimal" value={objValue} onChange={e => setObjValue(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
            </Field>
          </div>
          <div style={grid2}>
            <Field label="Τιμή αγοράς (€)">
              <input style={monoInputStyle} type="number" min={0} inputMode="decimal" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            <Field label="Ημερομηνία αγοράς">
              <DatePicker value={purchaseDate} onChange={setPurchaseDate} />
            </Field>

          </div>
          <div style={grid2}>
            <Field label="Εκτιμώμενος ΕΝΦΙΑ (€/έτος)">
              <input style={monoInputStyle} type="number" min={0} inputMode="decimal" value={enfia} onChange={e => setEnfia(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            <Field label={rentLabel}>
              <input style={monoInputStyle} type="number" min={0} inputMode="decimal" value={rent} onChange={e => setRent(e.target.value)} placeholder={airbnb ? '75' : '820'} onFocus={onFocus} onBlur={onBlur} />
            </Field>
          </div>
          <div style={grid2}>
            <Field label="Ποσοστό ιδιοκτησίας (%)">
              <input style={monoInputStyle} type="number" min={0} inputMode="decimal" value={ownership} onChange={e => setOwnership(e.target.value)} max={100} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            {isShared && (
              <Field label="Αριθμός συνιδιοκτητών">
                <input style={monoInputStyle} type="number" inputMode="numeric" min={1} max={99} value={coOwners.length}
                  onChange={e => setCoOwnerCount(parseInt(e.target.value, 10))} onFocus={onFocus} onBlur={onBlur} />
              </Field>
            )}
          </div>
          {isShared && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontFamily: T.font.sans, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>
                {coOwners.length === 1 ? 'Συνιδιοκτήτης' : 'Συνιδιοκτήτες'}
              </div>
              <div style={grid2}>
                {coOwners.map((nm, i) => (
                  <Field key={i} label={coOwners.length === 1 ? 'Όνομα συνιδιοκτήτη' : `Όνομα συνιδιοκτήτη ${i + 1}`}>
                    <input style={inputStyle} type="text" value={nm} onChange={e => setCoOwnerAt(i, e.target.value)} placeholder="Ονοματεπώνυμο" onFocus={onFocus} onBlur={onBlur} />
                  </Field>
                ))}
              </div>
            </div>
          )}

          {grossYield != null && (
            <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: 14, padding: 16 }}>
              <div style={{ fontFamily: T.font.sans, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)', marginBottom: 6 }}>Εκτιμώμενη μεικτή απόδοση</div>
              <div style={{ fontFamily: T.font.mono, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fp(grossYield)}</div>
              <div style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>
                {airbnb
                  ? `Ετήσια έσοδα ${fe(annualRent!)} με εκτιμώμενη πληρότητα 60%`
                  : `Ετήσια έσοδα ${fe(annualRent!)} επί ${valueN != null ? 'εμπορικής' : 'αντικειμενικής'} αξίας ${fe(effValueN!)}`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4, Ρυθμίσεις (property_settings) */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Ιδιοκτήτης */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionLabelStyle}>Ιδιοκτήτης</div>
            {/* Λέμε από πού ήρθαν τα στοιχεία. Προσυμπληρωμένο ΑΦΜ που δεν
                ελέγχθηκε είναι χειρότερο από κενό: φαίνεται επιβεβαιωμένο. */}
            {!existing?.id && (settings.owner_name || settings.owner_afm) && (
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: -6 }}>
                Συμπληρώθηκαν από το προφίλ σου. Έλεγξέ τα και άλλαξε ό,τι χρειάζεται.
              </div>
            )}
            <Field label="Ονοματεπώνυμο">
              <input style={inputStyle} value={settings.owner_name} onChange={setSf('owner_name')} onFocus={onFocus} onBlur={onBlur} />
            </Field>
            <div style={grid2}>
              <Field label="ΑΦΜ">
                <input style={monoInputStyle} value={settings.owner_afm} onChange={setSf('owner_afm')} inputMode="numeric" onFocus={onFocus} onBlur={onBlur} />
              </Field>
              <Field label="Τηλέφωνο">
                <input style={inputStyle} value={settings.owner_phone} onChange={setSf('owner_phone')} inputMode="tel" onFocus={onFocus} onBlur={onBlur} />
              </Field>
            </div>
            <Field label="Ηλεκτρονικό ταχυδρομείο">
              <input type="email" style={inputStyle} value={settings.owner_email} onChange={setSf('owner_email')} onFocus={onFocus} onBlur={onBlur} />
            </Field>
          </div>

          {/* Πάροχοι */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ΤΟ «ΠΡΟΓΡΑΜΜΑ» ΕΦΥΓΕ. Ζητούσε το εμπορικό όνομα του πακέτου
                internet — κάτι που ούτε ο ίδιος ο συνδρομητής θυμάται, δεν
                χρησιμοποιείται πουθενά στην εφαρμογή, και δεν αλλάζει καμία
                απόφαση. Μια φόρμα καταχώρησης δεν έχει δικαίωμα να ρωτά κάτι
                που δεν πρόκειται να χρησιμοποιήσει. */}
            <div style={sectionLabelStyle}>Πάροχοι</div>
            <div style={grid2}>
              <Field label="Ρεύμα">
                <input style={inputStyle} value={settings.electricity_provider} onChange={setSf('electricity_provider')} onFocus={onFocus} onBlur={onBlur} />
              </Field>
              <Field label="Νερό">
                <input style={inputStyle} value={settings.water_provider} onChange={setSf('water_provider')} onFocus={onFocus} onBlur={onBlur} />
              </Field>
              <Field label="Internet">
                <input style={inputStyle} value={settings.internet_provider} onChange={setSf('internet_provider')} onFocus={onFocus} onBlur={onBlur} />
              </Field>
            </div>
          </div>

          {/* Διαχείριση & Ασφάλεια */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={sectionLabelStyle}>Διαχείριση & Ασφάλεια</div>
            <div style={grid2}>
              <Field label="Διαχειριστής">
                <input style={inputStyle} value={settings.property_manager} onChange={setSf('property_manager')} onFocus={onFocus} onBlur={onBlur} />
              </Field>
              <Field label="Τηλέφωνο διαχειριστή">
                <input style={inputStyle} value={settings.property_manager_phone} onChange={setSf('property_manager_phone')} inputMode="tel" onFocus={onFocus} onBlur={onBlur} />
              </Field>
              <Field label="Ασφαλιστική">
                <input style={inputStyle} value={settings.insurance_company} onChange={setSf('insurance_company')} onFocus={onFocus} onBlur={onBlur} />
              </Field>
              <Field label="Αριθμός ασφαλιστηρίου">
                <input style={inputStyle} value={settings.insurance_policy} onChange={setSf('insurance_policy')} onFocus={onFocus} onBlur={onBlur} />
              </Field>
            </div>
            <Field label="Λήξη ασφάλισης">
              <DatePicker value={settings.insurance_expiry} onChange={v => setSettings(p => ({ ...p, insurance_expiry: v }))} />
            </Field>
          </div>

          {/* Σημειώσεις */}
          <Field label="Σημειώσεις">
            <textarea value={settings.notes} onChange={setSf('notes')} rows={4}
              style={{ ...inputStyle, height: 'auto', resize: 'none' }} />
          </Field>
        </div>
      )}

      {/* STEP 5, Σύνοψη */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
            <div style={{ color: 'var(--accent)' }}><TypeIcon type={propType} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.font.sans, fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name.trim() || ABSENT}</div>
              <div style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{PROP_TYPE_LABELS[propType]}{address.trim() ? ` · ${address.trim()}` : ''}</div>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 100, border: '1px solid var(--border-subtle)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 500, color: STATUS_COLORS[dbStatus.status_detail] }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLORS[dbStatus.status_detail] }} />{BY_KEY[statusKey].label}
            </span>
          </div>

          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden' }}>
            {([
              ['Τύπος', PROP_TYPE_LABELS[propType]],
              ['Κατάσταση', BY_KEY[statusKey].label],
              airbnb ? ['Βραχυχρόνια μίσθωση', 'Ναι (Airbnb / Booking)'] : null,
              ['Διεύθυνση', address.trim() || ABSENT],
              postalCode.trim() ? ['Ταχ. Κώδικας', postalCode.trim()] : null,
              atak.trim() ? ['ΑΤΑΚ', atak.trim()] : null,
              [propType === 'land' ? 'Εμβαδόν Οικοπέδου' : 'Εμβαδόν', num(sqm) != null ? `${fn(num(sqm)!)} τ.μ.` : `${fn(0)}τ.μ.`],
              isLandLike ? null : ['Όροφος', floor.trim() || ABSENT],
              isLandLike ? null : ['Έτος Κατασκευής', yearBuilt.trim() || ABSENT],
              isLandLike ? null : (peaClass ? ['Ενεργειακή Κλάση', peaClass] : null),
              isLandLike ? null : (heating ? ['Θέρμανση', HEATING_OPTS.find(h => h[0] === heating)?.[1] || heating] : null),
              isLandLike ? null : (parking.trim() ? ['Θέσεις Στάθμευσης', parking.trim()] : null),
              isLandLike ? null : (num(storageSqm) != null ? ['Αποθήκη', `${fn(num(storageSqm)!)} τ.μ.`] : null),
              ['Εμπορική Αξία', valueN != null ? fe(valueN) : fe(0)],
              num(objValue) != null ? ['Αντικειμενική Αξία', fe(num(objValue)!)] : null,
              num(enfia) != null ? ['Εκτιμώμενος ΕΝΦΙΑ', `${fe(num(enfia)!)} / έτος`] : null,
              ['Τιμή Αγοράς', num(purchasePrice) != null ? fe(num(purchasePrice)!) : fe(0)],
              purchaseDate ? ['Ημερομηνία Αγοράς', fd(purchaseDate)] : null,
              [airbnb ? 'Τιμή ανά διανυκτέρευση' : 'Στόχος Ενοικίου', rentN != null ? (airbnb ? fe(rentN) : `${fe(rentN)} / μήνα`) : fe(0)],
              ['Ποσοστό Ιδιοκτησίας', `${fn(num(ownership) ?? 100)}%`],
              ['Εκτιμώμενη μεικτή απόδοση', grossYield != null ? `${fp(grossYield)}` : fp(0)],
            ].filter(Boolean) as [string, string][]).map(([k, v], i) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                <span title={k === 'ΑΤΑΚ' ? 'Αριθμός Ταυτότητας Ακινήτου (από το Ε9)' : k === 'Εκτιμώμενος ΕΝΦΙΑ' ? 'Ενιαίος Φόρος Ιδιοκτησίας Ακινήτων (ετήσιος)' : undefined} style={{ fontFamily: T.font.sans, fontSize: 13, color: 'var(--text-secondary)', letterSpacing: '0.25px' }}>{k}</span>
                <span style={{ fontFamily: k === 'Τύπος' || k === 'Κατάσταση' || k === 'Διεύθυνση' || k === 'Βραχυχρόνια μίσθωση' || k === 'Θέρμανση' || k === 'Ενεργειακή Κλάση' || k === 'Ημερομηνία Αγοράς' ? "'Inter', sans-serif" : "'Roboto Mono', monospace", fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>

          {error && (
            <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 14px', fontFamily: T.font.sans, fontSize: 13, color: 'var(--negative)' }}>{error}</div>
          )}
        </div>
      )}
    </Modal>
  );
}
