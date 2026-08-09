'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { T, fe, feRate, Spinner } from '@/components/Theme';
import { RAAEY_COMPARE } from '@/lib/energy/freshness';
import { notifyError } from '@/components/Toast';
import { saved } from '@/components/dbWrite';
import { athensToday } from '@/lib/core/time';
import { failed } from '@/lib/core/dbError';

/**
 * Η ΤΙΜΗ ΤΗΣ ΚΙΛΟΒΑΤΩΡΑΣ ΑΕΡΙΟΥ, ΜΕ ΤΑ ΔΕΚΑΔΙΚΑ ΠΟΥ ΤΗΝ ΞΕΧΩΡΙΖΟΥΝ.
 * Το ίδιο σφάλμα με το ρεύμα, στην επόμενη οθόνη: ήταν `fe(n, 4)`, που
 * διαβάζεται σαν «τέσσερα δεκαδικά» ενώ το δεύτερο όρισμα αγνοούνταν. Οι
 * χρεώσεις αερίου κινούνται στα 0,0850–0,0899 €/kWh — στα δύο δεκαδικά όλες
 * γίνονταν «0,09 €», δηλαδή η στήλη σύγκρισης έδειχνε τα πάντα ίδια.
 */
const fk = feRate;

// ─────────────────────────────────────────────────────────────────────────────
// ΠΗΓΕΣ & ΗΜΕΡΟΜΗΝΙΑ ΕΠΑΛΗΘΕΥΣΗΣ
// Τελευταία επαλήθευση: Ιούλιος 2026, από επίσημες σελίδες παρόχων
// (nrg.gr, zenith.gr, energy.elin.gr, fysikoaerioellados.gr, protergia.gr,
//  heron.gr, dei.gr) και το εργαλείο σύγκρισης της ΡΑΑΕΥ.
//
// ΣΗΜΑΝΤΙΚΟ, για να ΜΗΝ παραπλανάται ο χρήστης:
// 1. Όλες οι τιμές αφορούν ΜΟΝΟ τη χρέωση προμήθειας (ανταγωνιστικό σκέλος).
//    Ο τελικός λογαριασμός περιλαμβάνει επιπλέον: ρυθμιζόμενες χρεώσεις
//    δικτύου (ΕΔΑ/ΔΕΣΦΑ), ΕΦΚ και ΦΠΑ 6%, και βγαίνει αισθητά υψηλότερος.
// 2. Τα κυμαινόμενα τιμολόγια ΔΕΝ έχουν σταθερή τιμή: υπολογίζονται από
//    τύπο βάσει του δείκτη TTF που αλλάζει κάθε μήνα. Εδώ ο υπολογισμός
//    γίνεται διαφανώς από τον τύπο του παρόχου + το TTF που ορίζει ο χρήστης.
// 3. Κάθε τιμή φέρει σήμανση: ΕΠΙΒΕΒΑΙΩΜΕΝΗ / ΕΝΔΕΙΚΤΙΚΗ / ΤΥΠΟΣ TTF.
// ─────────────────────────────────────────────────────────────────────────────
const LAST_VERIFIED = 'Ιούλιος 2026';
const DEFAULT_TTF_EUR_MWH = 33; // Ενδεικτική τιμή TTF €/MWh, ο χρήστης τη διορθώνει

type PriceStatus = 'verified' | 'indicative' | 'formula';

interface GasTariff {
  id: string;
  name: string;
  badge: 'ΜΠΛΕ' | 'ΚΙΤΡΙΝΟ' | 'ΕΙΔΙΚΟ';
  type: 'fixed' | 'variable' | 'special';
  segment: 'residential' | 'business';
  priceStatus: PriceStatus;      // πόσο αξιόπιστη είναι η τιμή
  kwh?: number;                  // σταθερή/ενδεικτική χρέωση €/kWh (προμήθεια)
  ttfMultiplier?: number;        // για formula: kWh = multiplier × TTF + margin
  ttfMargin?: number;            // περιθώριο παρόχου €/kWh
  fixed: number;                 // αρχικό μηνιαίο πάγιο €
  fixedNote?: string;            // εκπτώσεις παγίου
  vat: number;
  desc: string;
  contract_months?: number;
  dual_fuel_discount?: number;   // €/kWh έκπτωση σε συνδυασμό με ρεύμα
  sourceNote?: string;           // από πού προκύπτει η τιμή
}

// ── Διαχειριστές δικτύου ανά περιοχή ─────────────────────────────────────────
const NETWORK_OPERATORS = [
  { value: 'eda_attikis', label: 'ΕΔΑ Αττικής', region: 'Αττική', url: 'https://www.edaattikis.gr' },
  { value: 'eda_thess',   label: 'ΕΔΑ ΘΕΣΣ',     region: 'Θεσσαλονίκη / Θεσσαλία', url: 'https://www.edathess.gr' },
  { value: 'deda',        label: 'ΔΕΔΑ',          region: 'Λοιπή Ελλάδα', url: 'https://deda.gr' },
];

const GAS_PROVIDERS: { value: string; label: string; url: string; tariffs: GasTariff[] }[] = [
  {
    value: 'nrg', label: 'nrg (Motor Oil)', url: 'https://www.nrg.gr',
    tariffs: [
      { id: 'nrg_fixed',      name: 'nrg fixed GAS',          badge: 'ΜΠΛΕ',    type: 'fixed',    segment: 'residential', priceStatus: 'verified',
        kwh: 0.0470, fixed: 4.80, fixedNote: 'Έκπτωση παγίου: −30% με e-bill + πάγια εντολή, −20% με πάγια εντολή, −10% με e-bill', vat: 6, contract_months: 12,
        desc: 'Σταθερή τιμή για 12 μήνες, χωρίς προϋποθέσεις και χωρίς ρήτρα αναπροσαρμογής.', sourceNote: 'Επίσημη τιμή nrg, επαληθεύτηκε Ιούλιος 2026' },
      { id: 'nrg_fixed_ot',   name: 'nrg fixed on time GAS',  badge: 'ΜΠΛΕ',    type: 'fixed',    segment: 'residential', priceStatus: 'verified',
        kwh: 0.0350, fixed: 4.80, fixedNote: 'Τελική τιμή με Έκπτωση Συνέπειας ΚΑΙ συνδυασμό με ρεύμα nrg', vat: 6, contract_months: 12,
        desc: 'Σταθερό 12μηνο. Η τιμή 0,035 €/kWh ισχύει με εμπρόθεσμη πληρωμή και ρεύμα nrg, αλλιώς ισχύει υψηλότερη βασική τιμή.', sourceNote: 'Επίσημη τιμή nrg, επαληθεύτηκε Ιούλιος 2026' },
      { id: 'nrg_ontime',     name: 'nrg on time GAS',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'formula',
        ttfMultiplier: 1.10, ttfMargin: 0.0126, fixed: 4.80, fixedNote: 'Πάγιο με εκπτώσεις: 1,8 € (πάγια εντολή + e-bill), 2,8 € (πάγια εντολή), 3,8 € (e-bill)', vat: 6,
        desc: 'Κυμαινόμενο: (1,10 × TTF) + 0,0126 €/kWh με Έκπτωση Συνέπειας 40% στο περιθώριο. Χωρίς έκπτωση: περιθώριο 0,0210 €/kWh. Χωρίς δέσμευση.', sourceNote: 'Τύπος από επίσημη σελίδα nrg' },
      { id: 'nrg_prime',      name: 'nrg prime GAS',          badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'formula',
        ttfMultiplier: 1.00, ttfMargin: 0.0090, fixed: 4.80, fixedNote: 'Προνομιακές εκπτώσεις παγίου', vat: 6,
        desc: 'Ενέργεια στο κόστος + 0,009 €/kWh. Για αυτόνομη ή κεντρική θέρμανση, χωρίς ρήτρα αναπροσαρμογής και χωρίς δέσμευση.', sourceNote: 'Τύπος από επίσημη σελίδα nrg' },
      { id: 'nrg_ontime_biz', name: 'nrg on time GAS 4BUSINESS', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'business', priceStatus: 'formula',
        ttfMultiplier: 1.10, ttfMargin: 0.0099, fixed: 4.80, fixedNote: 'Μηδενικό πάγιο με πάγια εντολή + e-bill', vat: 24,
        desc: 'Επαγγελματικό: (1,10 × TTF) + 0,0099 €/kWh με Έκπτωση Συνέπειας 40% (αρχικό περιθώριο 0,0165).', sourceNote: 'Τύπος από επίσημη σελίδα nrg' },
    ],
  },
  {
    value: 'zenith', label: 'ZeniΘ', url: 'https://zenith.gr/el/for-the-home/gas/',
    tariffs: [
      { id: 'zen_flex',    name: 'Gas Home Flex',   badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0480, fixed: 5.00, vat: 6,
        desc: 'Κυμαινόμενο, συνδεδεμένο με TTF. Η ZeniΘ ανακοινώνει τη χρέωση προμήθειας κάθε μήνα, δες «Ιστορικό Τιμών» στο zenith.gr.', sourceNote: 'Ενδεικτική τιμή, η επίσημη ανακοινώνεται μηνιαίως στο zenith.gr' },
      { id: 'zen_t2',      name: 'Οικιακό Τ2 (αυτόνομη θέρμανση)', badge: 'ΕΙΔΙΚΟ', type: 'special', segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0460, fixed: 5.00, vat: 6,
        desc: 'Κλασικό οικιακό τιμολόγιο θέρμανσης. Μηνιαία ανακοινωθείσα χρέωση με ιστορικότητα στο site.', sourceNote: 'Ενδεικτική τιμή, η επίσημη ανακοινώνεται μηνιαίως στο zenith.gr' },
      { id: 'zen_biz',     name: 'Gas Business Flex', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'business', priceStatus: 'indicative',
        kwh: 0.0520, fixed: 7.00, vat: 24,
        desc: 'Επαγγελματικό κυμαινόμενο. Μηνιαία ανακοινωθείσα χρέωση.', sourceNote: 'Ενδεικτική τιμή, δες zenith.gr' },
    ],
  },
  {
    value: 'elin', label: 'ελίν (ΕΛΙΝΟΙΛ)', url: 'https://energy.elin.gr',
    tariffs: [
      { id: 'elin_f12',  name: 'Gas On! Fixed Now 12M', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0460, fixed: 5.00, vat: 6, contract_months: 12, dual_fuel_discount: 0.005,
        desc: 'Σταθερό 12μηνο. Σε συνδυασμό με ρεύμα ελίν: έκπτωση έως 30% στη χρέωση προμήθειας + 200 πόντοι elin up/μήνα για καύσιμα.', sourceNote: 'Ενδεικτική τιμή, ο επίσημος τιμοκατάλογος στο energy.elin.gr' },
      { id: 'elin_f24',  name: 'Gas On! Fixed Now 24M', badge: 'ΜΠΛΕ', type: 'fixed', segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0450, fixed: 5.00, vat: 6, contract_months: 24, dual_fuel_discount: 0.005,
        desc: 'Σταθερό 24μηνο, ελαφρώς χαμηλότερη τιμή λόγω μεγαλύτερης δέσμευσης.', sourceNote: 'Ενδεικτική τιμή, ο επίσημος τιμοκατάλογος στο energy.elin.gr' },
    ],
  },
  {
    value: 'fysiko_aerio', label: 'Φυσικό αέριο ΕΕΕ (ΔΕΠΑ)', url: 'https://fysikoaerioellados.gr',
    tariffs: [
      { id: 'fae_extra',   name: 'Οικιακό Πλήρες Extra', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'verified',
        kwh: 0.03794, fixed: 4.50, vat: 6,
        desc: 'Κυμαινόμενο, κοστοστρεφής τιμολόγηση, η τιμή αναθεωρείται μηνιαίως.', sourceNote: 'Τελευταία γνωστή δημοσιευμένη τιμή: Μάρτιος 2026, ενδέχεται να έχει αλλάξει' },
      { id: 'fae_pliris',  name: 'Οικιακό Πλήρες',       badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0420, fixed: 0, vat: 6,
        desc: 'Κυμαινόμενο ΧΩΡΙΣ μηνιαίο πάγιο. Ελαφρώς υψηλότερη χρέωση kWh από το Extra.', sourceNote: 'Ενδεικτική, μηνιαία ανακοίνωση στο fysikoaerioellados.gr' },
      { id: 'fae_kouzina', name: 'Κουζίνα',              badge: 'ΕΙΔΙΚΟ',  type: 'special',  segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0450, fixed: 0, vat: 6,
        desc: 'Για χρήση μόνο σε μαγείρεμα/ζεστό νερό. Χωρίς πάγιο.', sourceNote: 'Ενδεικτική, δες επίσημο τιμοκατάλογο' },
      { id: 'fae_biz',     name: 'Επαγγελματικό',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'business', priceStatus: 'indicative',
        kwh: 0.0550, fixed: 14.90, vat: 24,
        desc: 'Επαγγελματικό κυμαινόμενο.', sourceNote: 'Ενδεικτική, δες επίσημο τιμοκατάλογο' },
    ],
  },
  {
    value: 'dei', label: 'ΔΕΗ', url: 'https://www.dei.gr',
    tariffs: [
      { id: 'dei_gas',     name: 'myHome Φυσικό αέριο', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0480, fixed: 5.00, vat: 6, dual_fuel_discount: 0.003,
        desc: 'Κυμαινόμενο, η τιμή ανακοινώνεται μηνιαίως στο dei.gr. Έκπτωση dual fuel με ρεύμα ΔΕΗ.', sourceNote: 'Ενδεικτική τιμή, μηνιαία ανακοίνωση στο dei.gr' },
      { id: 'dei_gas_biz', name: 'myBusiness Αέριο',    badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'business', priceStatus: 'indicative',
        kwh: 0.0520, fixed: 7.00, vat: 24,
        desc: 'Επαγγελματικό κυμαινόμενο.', sourceNote: 'Ενδεικτική τιμή, δες dei.gr' },
    ],
  },
  {
    value: 'protergia', label: 'Protergia (Metlen)', url: 'https://www.protergia.gr',
    tariffs: [
      { id: 'prot_secure', name: 'Value Gas Secure',    badge: 'ΜΠΛΕ',    type: 'fixed',    segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0450, fixed: 5.00, vat: 6, contract_months: 12, dual_fuel_discount: 0.003,
        desc: 'Σταθερό 12μηνο. Power&Gas: επιπλέον έκπτωση με ρεύμα Protergia. Δώρο πάγια καλοκαιρινών μηνών σε προωθητικές περιόδους.', sourceNote: 'Ενδεικτική, επίσημος τιμοκατάλογος στο protergia.gr' },
      { id: 'prot_single', name: 'Single Value Gas',    badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0470, fixed: 5.00, vat: 6,
        desc: 'Κυμαινόμενο για αυτόνομη σύνδεση, με τιμές βάσει κόστους.', sourceNote: 'Ενδεικτική, δες protergia.gr' },
      { id: 'prot_koin',   name: 'Οικιακό Κοινόχρηστο', badge: 'ΕΙΔΙΚΟ',  type: 'special',  segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0460, fixed: 5.00, vat: 6,
        desc: 'Για κεντρική θέρμανση πολυκατοικίας (κοινόχρηστος μετρητής).', sourceNote: 'Ενδεικτική, δες protergia.gr' },
      { id: 'prot_biz',    name: 'Φυσικό αέριο Εμπορικό', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'business', priceStatus: 'indicative',
        kwh: 0.0550, fixed: 5.00, vat: 24,
        desc: 'Επαγγελματικό.', sourceNote: 'Ενδεικτική, δες protergia.gr' },
    ],
  },
  {
    value: 'heron', label: 'ΗΡΩΝ', url: 'https://www.heron.gr',
    tariffs: [
      { id: 'heron_fix',  name: 'ΗΡΩΝ Gas Σταθερό',     badge: 'ΜΠΛΕ',    type: 'fixed',    segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0460, fixed: 5.00, vat: 6, contract_months: 12,
        desc: 'Σταθερό 12μηνο. Περιοδικές προσφορές (π.χ. δώρο % μηνιαίας κατανάλωσης), δες τρέχουσα προωθητική ενέργεια.', sourceNote: 'Ενδεικτική, δες heron.gr' },
      { id: 'heron_var',  name: 'ΗΡΩΝ Gas Κυμαινόμενο', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0440, fixed: 4.50, vat: 6,
        desc: 'Κυμαινόμενο χωρίς δέσμευση.', sourceNote: 'Ενδεικτική, δες heron.gr' },
    ],
  },
  {
    value: 'enerwave', label: 'enerwave (πρώην Elpedison)', url: 'https://www.enerwave.gr',
    tariffs: [
      { id: 'enw_gas', name: 'enerwave Gas Home', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'indicative',
        kwh: 0.0470, fixed: 5.00, vat: 6,
        desc: 'Κυμαινόμενο οικιακό. Η Elpedison μετονομάστηκε σε enerwave.', sourceNote: 'Ενδεικτική, δες επίσημη σελίδα' },
    ],
  },
];

const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };

const secHdr = (label: string, sub?: string) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: T.font.sans }}>{sub}</div>}
    </div>
  </div>
);

const bc = (badge: string) => {
  switch (badge) {
    case 'ΜΠΛΕ':    return { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', color: 'var(--text-secondary)' };
    case 'ΚΙΤΡΙΝΟ': return { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', color: 'var(--text-secondary)' };
    case 'ΕΙΔΙΚΟ':  return { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', color: 'var(--text-secondary)' };
    default:         return { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', color: 'var(--text-secondary)' };
  }
};

// Σήμανση αξιοπιστίας τιμής
const priceBadge = (status: PriceStatus) => {
  switch (status) {
    case 'verified':   return { label: '✓ Επιβεβαιωμένη', color: 'var(--accent)', bg: 'var(--bg-elevated)',  border: 'var(--border-subtle)' };
    case 'formula':    return { label: 'ƒ Τύπος TTF',     color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)' };
    case 'indicative': return { label: '~ Ενδεικτική',    color: 'var(--text-secondary)',  bg: 'var(--bg-elevated)',  border: 'var(--border-subtle)' };
  }
};

interface Props { propertyId: string; userId?: string; onNavigateTab?: (tab: string) => void; }

const DEFAULTS = {
  gasProvider: 'nrg', gasTariffId: '', gasMonthly: '', gasKwhMonthly: '',
  networkOperator: 'eda_attikis', gasContractStart: '', gasContractMonths: '',
  hasGasConnection: true, heatingType: 'autonomous_gas',
  ttfPrice: String(DEFAULT_TTF_EUR_MWH), // €/MWh, ο χρήστης το ενημερώνει από ΕΕΧ
};

export default function BillsGas({ propertyId, userId = '', onNavigateTab }: Props) {
  const supabase = createClient();
  const [s, su, loading] = useBillsSettings(propertyId, userId, 'gas', DEFAULTS);
  const [segmentFilter, setSegmentFilter] = useState<'residential' | 'business'>('residential');
  const [elecProvider, setElecProvider]   = useState<string>('');
  const [calendarSynced, setCalendarSynced] = useState(false);

  const upd = (patch: Partial<typeof DEFAULTS>) => su(patch);

  const kwh    = parseFloat(s.gasKwhMonthly) || 0;
  const ttf    = (parseFloat(s.ttfPrice) || DEFAULT_TTF_EUR_MWH) / 1000; // €/MWh → €/kWh

  // Ενιαίος, διαφανής υπολογισμός χρέωσης kWh ανά τιμολόγιο.
  //
  // ΣΕ useCallback ΓΙΑ ΝΑ ΕΙΝΑΙ Η ΕΞΑΡΤΗΣΗ ΑΠΟΔΕΙΞΙΜΗ. Η συνάρτηση κλείνει πάνω
  // στο `ttf` (τιμή χονδρικής αερίου). Ως απλή συνάρτηση σώματος, ο έλεγχος
  // εξαρτήσεων δεν μπορούσε να το δει και ζητούσε το `tariffKwh` στα useMemo —
  // εκεί το `ttf` υπήρχε ήδη, οπότε το αποτέλεσμα ήταν σωστό ΚΑΤΑ ΤΥΧΗ. Την
  // ημέρα που η συνάρτηση διαβάσει και δεύτερη τιμή, η τύχη τελειώνει σιωπηλά.
  const tariffKwh = useCallback((t: GasTariff): number => {
    if (t.priceStatus === 'formula' && t.ttfMultiplier !== undefined && t.ttfMargin !== undefined)
      return t.ttfMultiplier * ttf + t.ttfMargin;
    return t.kwh ?? 0;
  }, [ttf]);

  const provider    = GAS_PROVIDERS.find(p => p.value === s.gasProvider);
  const tariff      = provider?.tariffs.find(t => t.id === s.gasTariffId) || provider?.tariffs[0];
  const calcMonthly = tariff ? kwh * tariffKwh(tariff) + tariff.fixed : 0;
  const manual      = parseFloat(s.gasMonthly) || 0;
  const effective   = manual > 0 ? manual : calcMonthly;

  // ── Cross-tab: πάροχος ρεύματος για ανίχνευση Dual Fuel ─────────────────────
  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      const { data } = await supabase
        .from('bills_settings').select('data')
        .eq('property_id', propertyId).eq('section', 'electricity').maybeSingle();
      const elecData = data?.data as Record<string, unknown> | undefined;
      if (elecData?.elecProvider) setElecProvider(String(elecData.elecProvider));
    })();
  }, [propertyId]);

  const sameDualFuelProvider = elecProvider && elecProvider === s.gasProvider &&
    ['dei', 'protergia', 'heron', 'zenith', 'nrg', 'elin', 'enerwave'].includes(s.gasProvider);
  const dualFuelTariff = tariff?.dual_fuel_discount;

  // Ο μήνας από την ώρα της Αθήνας: ο περιηγητής ενός χρήστη σε άλλη ζώνη
  // μπορεί να είναι ήδη στον επόμενο μήνα, και η περίοδος θέρμανσης να αρχίσει
  // ή να τελειώσει μια μέρα νωρίτερα από ό,τι στην πραγματικότητα.
  const isHeatingSeason = [10, 11, 12, 1, 2, 3].includes(Number(athensToday().slice(5, 7)));
  const noGasDataYet = effective === 0 && kwh === 0;

  // ── Sync-back: properties.heating ────────────────────────────────────────────
  const propertyHeatingSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!propertyId || !s.heatingType) return;
    if (propertyHeatingSyncTimer.current) clearTimeout(propertyHeatingSyncTimer.current);
    propertyHeatingSyncTimer.current = setTimeout(() => {
      // Ανύπαρκτος πίνακας + `.then(() => {})` που καταπίνει το σφάλμα: ο τύπος
      // θέρμανσης δεν αποθηκευόταν ΠΟΤΕ στο ακίνητο, σιωπηλά.
      supabase.from('user_properties').update({ heating: s.heatingType }).eq('id', propertyId)
        .then(({ error }) => { if (error) notifyError(failed('Ο τύπος θέρμανσης δεν αποθηκεύτηκε', error)); });
    }, 1200);
    return () => { if (propertyHeatingSyncTimer.current) clearTimeout(propertyHeatingSyncTimer.current); };
  }, [propertyId, s.heatingType]);

  // ── Auto-sync λήξης σύμβασης → calendar_events ───────────────────────────────
  useEffect(() => {
    if (!propertyId || !s.gasContractStart || !s.gasContractMonths || calendarSynced) return;
    const months = parseInt(s.gasContractMonths) || 0;
    if (months <= 0) return;
    // Ίδιο σφάλμα θερινής ώρας: η λήξη του συμβολαίου αερίου έπεφτε μία μέρα
    // νωρίτερα όταν το διάστημα περνούσε από χειμερινή σε θερινή ώρα.
    const expiry = new Date(`${s.gasContractStart}T00:00:00Z`);
    if (Number.isNaN(expiry.getTime())) return;
    expiry.setUTCMonth(expiry.getUTCMonth() + months);
    const expiryStr = expiry.toISOString().slice(0, 10);

    (async () => {
      const { data: existing } = await supabase
        .from('calendar_events').select('id')
        .eq('property_id', propertyId).eq('category', 'gas_contract')
        .eq('event_date', expiryStr).limit(1);
      if (existing?.length) { setCalendarSynced(true); return; }

      // Το `.then(() => setCalendarSynced(true))` δήλωνε επιτυχία χωρίς να
      // κοιτάξει: ο Supabase δεν πετά, οπότε μια απόρριψη από πολιτική RLS
      // κατέληγε σε «συγχρονίστηκε», η υπενθύμιση λήξης δεν έμπαινε ποτέ στο
      // ημερολόγιο, και ο χρήστης το μάθαινε όταν είχε λήξει η σύμβαση.
      if (await saved('Η υπενθύμιση λήξης δεν μπήκε στο ημερολόγιο',
        supabase.from('calendar_events').insert({
          property_id: propertyId,
          user_id: userId,
          title: `Λήξη σύμβασης φυσικού αερίου, ${provider?.label ?? ''}`,
          category: 'gas_contract',
          event_date: expiryStr,
          amount: effective > 0 ? effective : null,
          priority: 'medium',
          status: 'pending',
          recurring: false,
          notes: `Η σύμβαση ${tariff?.name ?? ''} λήγει. Σύγκρινε νέα τιμολόγια πριν ανανεώσεις.`,
          source: 'system',
        }))) setCalendarSynced(true);
    })();
  }, [propertyId, s.gasContractStart, s.gasContractMonths]);

  const allTariffs = useMemo(() => {
    return GAS_PROVIDERS.flatMap(p => p.tariffs
      .filter(t => t.segment === segmentFilter)
      .map(t => {
        const rate = tariffKwh(t);
        return { ...t, providerLabel: p.label, providerUrl: p.url, rate, monthly: kwh * rate + t.fixed, isCurrent: t.id === s.gasTariffId };
      })).sort((a, b) => a.monthly - b.monthly);
  }, [kwh, tariffKwh, s.gasTariffId, segmentFilter]);

  const bestMonthly = allTariffs[0]?.monthly || 0;
  // ═══ ΤΑ ΔΥΟ ΝΟΥΜΕΡΑ ΔΕΝ ΕΙΝΑΙ ΤΟΥ ΙΔΙΟΥ ΕΙΔΟΥΣ ══════════════════════════
  // Η εξοικονόμηση υπολογιζόταν ως `effective − bestMonthly`. Το `effective`
  // είναι το ΠΡΑΓΜΑΤΙΚΟ ποσό του λογαριασμού όταν ο χρήστης το έχει γράψει:
  // μέσα του κάθονται ρυθμιζόμενες χρεώσεις δικτύου, ΕΦΚ και ΦΠΑ 6%. Το
  // `bestMonthly` είναι μόνο η χρέωση προμήθειας. Η αφαίρεση έβγαζε τη διαφορά
  // ΦΟΡΩΝ ΚΑΙ ΔΙΚΤΥΟΥ και την παρουσίαζε ως «δυνητική εξοικονόμηση αλλάζοντας
  // πάροχο» — ποσό που δεν πρόκειται να εξοικονομηθεί ποτέ, γιατί οι χρεώσεις
  // αυτές είναι ίδιες σε κάθε πάροχο. Όσο μεγαλύτερος ο λογαριασμός, τόσο
  // μεγαλύτερο το ψέμα.
  //
  // Η σύγκριση γίνεται τώρα προμήθεια προς προμήθεια: το τρέχον πρόγραμμα με
  // τη ΔΙΚΗ ΤΟΥ κατανάλωση, απέναντι στο φθηνότερο με την ίδια κατανάλωση.
  const savings     = calcMonthly - bestMonthly;

  const providerOptions = GAS_PROVIDERS.map(p => ({ value: p.value, label: p.label }));
  const tariffOptions   = (provider?.tariffs ?? []).filter(t => t.segment === segmentFilter)
    .map(t => ({ value: t.id, label: `${t.name}, ${t.badge}, ${fk(tariffKwh(t))}/kWh` }));
  const networkOptions  = NETWORK_OPERATORS.map(n => ({ value: n.value, label: `${n.label} (${n.region})` }));

  if (loading) return <Spinner label="Φόρτωση…" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Διαφάνεια τιμών, τι ακριβώς βλέπεις ── */}
      <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 14, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-primary)' }}>Διαφάνεια τιμών:</strong> Οι τιμές αφορούν μόνο τη <strong>χρέωση προμήθειας</strong> (ανταγωνιστικό σκέλος), χωρίς ρυθμιζόμενες χρεώσεις δικτύου, <span title="Ειδικός Φόρος Κατανάλωσης">ΕΦΚ</span> και <span title="Φόρος Προστιθέμενης Αξίας">ΦΠΑ</span>, ο τελικός λογαριασμός είναι υψηλότερος.
        Σήμανση κάθε τιμής: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓ Επιβεβαιωμένη</span> (επίσημη, {LAST_VERIFIED}) ·{' '}
        <span title="Δείκτης χονδρικής τιμής φυσικού αερίου στην ευρωπαϊκή αγορά (Title Transfer Facility)" style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>ƒ Τύπος TTF</span> (υπολογίζεται από τον επίσημο τύπο του παρόχου) ·{' '}
        <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>~ Ενδεικτική</span> (τάξη μεγέθους, επιβεβαίωσε στον πάροχο).
      </div>

      {/* ── Επισκόπηση κόστους ── */}
      <div style={card}>
        {secHdr('Τρέχον κόστος', `Τελευταία επαλήθευση δεδομένων: ${LAST_VERIFIED}`)}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Μηνιαίο κόστος προμήθειας</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--accent)', lineHeight: 1 }}>{fe(effective)}</div>
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Ετήσιο κόστος, εκτίμηση</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', lineHeight: 1 }}>{fe(effective * 12)}</div>
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Δίκτυο διανομής</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, lineHeight: 1.2 }}>{NETWORK_OPERATORS.find(n => n.value === s.networkOperator)?.label}</div>
          </div>
        </div>
      </div>

      {/* ── Στοιχεία σύνδεσης ── */}
      <div style={card}>
        {secHdr('Στοιχεία σύνδεσης και πάροχος')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
          <CustomSelect label="Διαχειριστής δικτύου" value={s.networkOperator} onChange={v => upd({ networkOperator: v })} options={networkOptions} />
          <CustomSelect label="Τύπος θέρμανσης" value={s.heatingType} onChange={v => upd({ heatingType: v })}
            options={[
              { value: 'autonomous_gas', label: 'Αυτόνομη θέρμανση αερίου' },
              { value: 'central_gas',    label: 'Κεντρική θέρμανση, κοινόχρηστη' },
              { value: 'combi',          label: 'Συνδυαστικό, αέριο και άλλη πηγή' },
            ]}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
          <CustomSelect label="Πάροχος" value={s.gasProvider}
            onChange={v => upd({ gasProvider: v, gasTariffId: GAS_PROVIDERS.find(p => p.value === v)?.tariffs[0]?.id || '' })}
            options={providerOptions}/>
          <CustomSelect label="Πρόγραμμα" value={s.gasTariffId || provider?.tariffs[0]?.id || ''} onChange={v => upd({ gasTariffId: v })} options={tariffOptions}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
          <NumberInput label="Μηνιαία κατανάλωση" value={s.gasKwhMonthly} onChange={v => upd({ gasKwhMonthly: v })} suffix="kWh"/>
          <NumberInput label="Πραγματικό κόστος τον μήνα" labelInfo="Ολόκληρο το ποσό του λογαριασμού, με δίκτυο, ΕΦΚ και ΦΠΑ. Χρησιμοποιείται για την παρακολούθηση κόστους, ΟΧΙ για τη σύγκριση παρόχων: εκεί συγκρίνεται προμήθεια με προμήθεια."
            value={s.gasMonthly} onChange={v => upd({ gasMonthly: v })} suffix="€"/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginTop: 14 }}>
          <DatePicker label="Έναρξη σύμβασης" value={s.gasContractStart} onChange={v => upd({ gasContractStart: v })}/>
          <NumberInput label="Διάρκεια σύμβασης" value={s.gasContractMonths} onChange={v => upd({ gasContractMonths: v })} suffix="μήνες"/>
        </div>

        {/* TTF, για τα κυμαινόμενα */}
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, alignItems: 'end' }}>
          <NumberInput label="Τρέχουσα τιμή TTF" value={s.ttfPrice} onChange={v => upd({ ttfPrice: v })} suffix="€/MWh" step={1}/>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, paddingBottom: 6 }}>
            Τα κυμαινόμενα προγράμματα (σήμανση ƒ) υπολογίζονται από τον επίσημο τύπο του παρόχου με βάση αυτή την τιμή TTF.
            Η μηνιαία τιμή δημοσιεύεται στο{' '}
            <a href="https://www.eex.com" target="_blank" rel="noopener noreferrer" title="Ευρωπαϊκό Χρηματιστήριο Ενέργειας (European Energy Exchange)" style={{ color: 'var(--accent)', textDecoration: 'none' }}>EEX</a>
            {' '}και στους λογαριασμούς των παρόχων.
          </div>
        </div>

        {tariff && (
          <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-base)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' as const, gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{tariff.name}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.badge, background: bc(tariff.badge).bg, border: `1px solid ${bc(tariff.badge).border}`, color: bc(tariff.badge).color }}>{tariff.badge}</span>
                {(() => { const pb = priceBadge(tariff.priceStatus); return (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.badge, background: pb.bg, border: `1px solid ${pb.border}`, color: pb.color }}>{pb.label}</span>
                ); })()}
              </div>
              <a href={provider?.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: 'var(--accent)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '4px 12px', textDecoration: 'none', whiteSpace: 'nowrap' as const, fontFamily: T.font.sans, fontWeight: 600 }}>
                Επίσημη σελίδα →
              </a>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tariff.desc}</div>
            {tariff.sourceNote && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: T.font.sans }}>Πηγή: {tariff.sourceNote}</div>}
            <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' as const }}>
              <span title="Κιλοβατώρα, μονάδα μέτρησης κατανάλωσης ενέργειας" style={{ fontSize: 11, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>Χρέωση kWh:{'  '}<strong style={{ color: 'var(--text-primary)' }}>{fk(tariffKwh(tariff))} / kWh</strong></span>
              <span style={{ fontSize: 11, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>Αρχικό πάγιο:{'  '}<strong>{fe(tariff.fixed)} / μήνα</strong></span>
              {tariff.dual_fuel_discount != null && (
                <span title="Κοινός πάροχος ρεύματος και αερίου με ενιαία έκπτωση" style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>Dual Fuel:{'  '}<strong>−{fk(tariff.dual_fuel_discount)} / kWh</strong></span>
              )}
            </div>
            {tariff.fixedNote && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: T.font.sans }}>{tariff.fixedNote}</div>}
          </div>
        )}
      </div>

      {/* ── Σύγκριση παρόχων ── */}
      {kwh > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap' as const, gap: 10 }}>
            {secHdr('Σύγκριση παρόχων', `Βάσει ${kwh} kWh/μήνα και TTF ${s.ttfPrice} €/MWh, χρέωση προμήθειας, χωρίς ρυθμιζόμενες/ΦΠΑ`)}
            <div style={{ display: 'flex', background: 'var(--bg-base)', borderRadius: T.radius.pill, padding: 3, border: '1px solid var(--border-default)' }}>
              {(['residential', 'business'] as const).map(seg => (
                <button key={seg} onClick={() => setSegmentFilter(seg)}
                  style={{ padding: '6px 16px', borderRadius: T.radius.pill, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    background: segmentFilter === seg ? 'var(--accent)' : 'transparent',
                    color: segmentFilter === seg ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                  {seg === 'residential' ? 'Οικιακό' : 'Επιχειρηματικό'}
                </button>
              ))}
            </div>
          </div>

          {savings > 1 && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }}/>
              <span style={{ fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
                Δυνητική εξοικονόμηση <strong style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{fe(savings)} τον μήνα</strong> ({fe(savings * 12)} τον χρόνο) με το φθηνότερο πρόγραμμα, στη χρέωση προμήθειας. Δίκτυο, ΕΦΚ και ΦΠΑ είναι ίδια σε κάθε πάροχο και δεν εξοικονομούνται. Επιβεβαίωσε την τρέχουσα προσφορά στον πάροχο.
              </span>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>{['Πάροχος', 'Πρόγραμμα', 'Τύπος', 'Τιμή', 'kWh', 'Πάγιο', 'Μήνας', 'Έτος', 'Διαφορά'].map(h => (
                  <th key={h} style={{ fontSize: 9, color: 'var(--text-secondary)', padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, background: 'var(--bg-elevated)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {allTariffs.map((t, i) => {
                  const rowBc  = bc(t.badge);
                  const pb     = priceBadge(t.priceStatus);
                  const isBest = i === 0;
                  const diff   = t.monthly - bestMonthly;
                  return (
                    <tr key={t.id} style={{ background: t.isCurrent ? 'var(--accent-soft)' : isBest ? 'var(--bg-elevated)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600 }}>
                        {!t.isCurrent && isBest && <span style={{ fontSize: 9, color: 'var(--text-tertiary)', marginRight: 6, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Φθηνότερο</span>}
                        {t.providerLabel}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>{t.name}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: T.radius.badge, background: rowBc.bg, border: `1px solid ${rowBc.border}`, color: rowBc.color }}>{t.badge}</span>
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span title={t.sourceNote} style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: T.radius.badge, background: pb.bg, border: `1px solid ${pb.border}`, color: pb.color, cursor: 'help' }}>{pb.label}</span>
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fk(t.rate)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(t.fixed)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--accent)' }}>{fe(t.monthly)}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-tertiary)' }}>{fe(t.monthly * 12)}</td>
                      {/* Ο πίνακας είναι ήδη ταξινομημένος από το φθηνότερο: η
                          κατεύθυνση της διαφοράς φαίνεται από τη θέση, δεν
                          χρειάζεται φανάρι. Και το μηδέν λέγεται με μηδέν, όχι
                          με παύλα που διαβάζεται ως «λείπει». */}
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                        {diff > 0 ? `+${fe(diff)}` : fe(diff)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans, background: 'var(--bg-elevated)', padding: '6px 12px', borderRadius: T.radius.badge, lineHeight: 1.5 }}>
            * Οι τιμές αφορούν τη χρέωση προμήθειας χωρίς ρυθμιζόμενες χρεώσεις δικτύου, ΕΦΚ και ΦΠΑ. Οι κυμαινόμενες αλλάζουν μηνιαίως, τελευταία επαλήθευση: {LAST_VERIFIED}. Επίσημη σύγκριση: εργαλείο ΡΑΑΕΥ μέσω gov.gr.
          </div>
        </div>
      )}

      {/* ── Έξυπνες ειδοποιήσεις βάσει πραγματικών δεδομένων ── */}
      {(() => {
        const hints: { text: string; severity: 'info' | 'warning' | 'tip' }[] = [];

        if (sameDualFuelProvider && !dualFuelTariff) {
          hints.push({ text: `Έχεις ${provider?.label} και στα δύο (ρεύμα + αέριο), έλεγξε αν δικαιούσαι dual fuel πρόγραμμα με έκπτωση.`, severity: 'tip' });
        }
        if (dualFuelTariff) {
          hints.push({ text: `Το τρέχον πρόγραμμα έχει Dual Fuel έκπτωση −${fk(dualFuelTariff)}/kWh λόγω κοινού παρόχου με το ρεύμα.`, severity: 'info' });
        }
        if (isHeatingSeason && noGasDataYet && s.heatingType === 'autonomous_gas') {
          hints.push({ text: 'Είμαστε σε περίοδο θέρμανσης και δεν έχεις καταχωρήσει ακόμη κατανάλωση ή κόστος αερίου. Συμπλήρωσε τα στοιχεία για ακριβή παρακολούθηση.', severity: 'warning' });
        }
        if (tariff?.type === 'variable' && kwh > 800) {
          hints.push({ text: `Με ${kwh} kWh/μήνα, ένα σταθερό τιμολόγιο θα σε προστάτευε από διακυμάνσεις TTF τον χειμώνα, τότε οι τιμές συνήθως ανεβαίνουν.`, severity: 'tip' });
        }
        if (s.heatingType === 'central_gas') {
          hints.push({ text: 'Με κεντρική θέρμανση, το κόστος αερίου μοιράζεται στους ενοίκους/ιδιοκτήτες βάσει χιλιοστών. Έλεγξε τον κανονισμό κοινοχρήστων.', severity: 'info' });
        }

        if (hints.length === 0) return null;

        const SEV_STYLE = {
          warning: { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', dot: 'var(--warning)' },
          info:    { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', dot: 'var(--accent)' },
          tip:     { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', dot: 'var(--accent)' },
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {hints.map((h, i) => {
              const sv = SEV_STYLE[h.severity];
              return (
                <div key={i} style={{ background: sv.bg, border: `1px solid ${sv.border}`, borderRadius: T.radius.inner, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: sv.dot, flexShrink: 0, marginTop: 5 }}/>
                  <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>{h.text}</div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Χρήσιμες πληροφορίες ── */}
      <div style={card}>
        {secHdr('Χρήσιμες πληροφορίες')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Το δίκτυο διανομής ανήκει στον τοπικό διαχειριστή (ΕΔΑ Αττικής, ΕΔΑ ΘΕΣΣ ή ΔΕΔΑ), δεν αλλάζει όποιον πάροχο κι αν επιλέξεις. Η αλλαγή παρόχου είναι καθαρά εμπορική, δεν γίνεται καμία επέμβαση στον αγωγό ή τον λέβητα, και ολοκληρώνεται σε περίπου 3 εβδομάδες χωρίς χρέωση.
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Πρόσεχε την «έκπτωση συνέπειας»: πολλά προγράμματα διαφημίζουν χαμηλή τιμή που ισχύει μόνο με εμπρόθεσμη εξόφληση, αν αργήσεις μία πληρωμή, χρεώνεσαι τη βασική (υψηλότερη) τιμή. Σύγκρινε πάντα και την «καθαρή» τιμή χωρίς έκπτωση.
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Τα κίτρινα/κυμαινόμενα τιμολόγια ακολουθούν τον δείκτη TTF (ευρωπαϊκή χονδρεμπορική αγορά). Οι τιμές ανεβαίνουν συνήθως τον χειμώνα λόγω ζήτησης θέρμανσης, αν θες σιγουριά, κλείδωσε σταθερό πριν την ψυχρή περίοδο.
          </div>
          <a href={RAAEY_COMPARE} target="_blank" rel="noopener noreferrer"
            style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.pill, padding: '8px 18px', textDecoration: 'none' }}>
            Επίσημη σύγκριση τιμών <span title="Ρυθμιστική Αρχή Αποβλήτων, Ενέργειας και Υδάτων">ΡΑΑΕΥ</span> στο gov.gr
          </a>
        </div>
      </div>
    </div>
  );
}