'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';
import * as calendar from '@/lib/data/calendar'
import { NumberInput, CustomSelect, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { usePropertyHeating } from './usePropertyHeating';
import { usesGas } from '@/lib/property/heating';
import { T, fe, feRate, Spinner, fixedCols } from '@/components/Theme';
import { RAAEY_COMPARE, RAAEY_NAME } from '@/lib/energy/freshness';
import { saved } from '@/components/dbWrite';
import { athensToday } from '@/lib/core/time';

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
//    δικτύου (ΕΔΑ/ΔΕΣΦΑ), ΕΦΚ και ΦΠΑ 6% και βγαίνει αισθητά υψηλότερος.
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
        kwh: 0.0470, fixed: 4.80, fixedNote: 'Έκπτωση παγίου: −30% με ηλεκτρονικό λογαριασμό και πάγια εντολή, −20% με πάγια εντολή, −10% με ηλεκτρονικό λογαριασμό', vat: 6, contract_months: 12,
        desc: 'Σταθερή τιμή για 12 μήνες, χωρίς προϋποθέσεις και χωρίς ρήτρα αναπροσαρμογής.', sourceNote: 'Επίσημη τιμή nrg, επαληθεύτηκε Ιούλιος 2026' },
      { id: 'nrg_fixed_ot',   name: 'nrg fixed on time GAS',  badge: 'ΜΠΛΕ',    type: 'fixed',    segment: 'residential', priceStatus: 'verified',
        kwh: 0.0350, fixed: 4.80, fixedNote: 'Τελική τιμή με Έκπτωση Συνέπειας ΚΑΙ συνδυασμό με ρεύμα nrg', vat: 6, contract_months: 12,
        desc: 'Σταθερό 12μηνο. Η τιμή 0,035 €/kWh ισχύει με εμπρόθεσμη πληρωμή και ρεύμα nrg, αλλιώς ισχύει υψηλότερη βασική τιμή.', sourceNote: 'Επίσημη τιμή nrg, επαληθεύτηκε Ιούλιος 2026' },
      { id: 'nrg_ontime',     name: 'nrg on time GAS',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'formula',
        ttfMultiplier: 1.10, ttfMargin: 0.0126, fixed: 4.80, fixedNote: 'Πάγιο με εκπτώσεις: 1,80 € με πάγια εντολή και ηλεκτρονικό λογαριασμό, 2,80 € με πάγια εντολή, 3,80 € με ηλεκτρονικό λογαριασμό', vat: 6,
        desc: 'Κυμαινόμενο: (1,10 × TTF) + 0,0126 €/kWh με Έκπτωση Συνέπειας 40% στο περιθώριο. Χωρίς έκπτωση: περιθώριο 0,0210 €/kWh. Χωρίς δέσμευση.', sourceNote: 'Τύπος από επίσημη σελίδα nrg' },
      { id: 'nrg_prime',      name: 'nrg prime GAS',          badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'residential', priceStatus: 'formula',
        ttfMultiplier: 1.00, ttfMargin: 0.0090, fixed: 4.80, fixedNote: 'Προνομιακές εκπτώσεις παγίου', vat: 6,
        desc: 'Ενέργεια στο κόστος + 0,009 €/kWh. Για αυτόνομη ή κεντρική θέρμανση, χωρίς ρήτρα αναπροσαρμογής και χωρίς δέσμευση.', sourceNote: 'Τύπος από επίσημη σελίδα nrg' },
      { id: 'nrg_ontime_biz', name: 'nrg on time GAS 4BUSINESS', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', segment: 'business', priceStatus: 'formula',
        ttfMultiplier: 1.10, ttfMargin: 0.0099, fixed: 4.80, fixedNote: 'Μηδενικό πάγιο με πάγια εντολή και ηλεκτρονικό λογαριασμό', vat: 24,
        desc: 'Επαγγελματικό: (1,10 × TTF) + 0,0099 €/kWh με Έκπτωση Συνέπειας 40% (αρχικό περιθώριο 0,0165).', sourceNote: 'Τύπος από επίσημη σελίδα nrg' },
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
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: T.font.sans }}>{sub}</div>}
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

interface Props { propertyId: string; userId?: string; }

const DEFAULTS = {
  gasProvider: 'nrg', gasTariffId: '', gasMonthly: '', gasKwhMonthly: '',
  networkOperator: 'eda_attikis', gasContractStart: '', gasContractMonths: '',
  hasGasConnection: true,
  ttfPrice: String(DEFAULT_TTF_EUR_MWH), // €/MWh, ο χρήστης το ενημερώνει από ΕΕΧ
};

export default function BillsGas({ propertyId, userId = '' }: Props) {
  const supabase = createClient();
  const [s, su, loading] = useBillsSettings(propertyId, userId, 'gas', DEFAULTS);
  // Διαβάζεται, δεν ρωτιέται ξανά: απαντήθηκε στη Θέρμανση, μία φορά.
  const [heatingType] = usePropertyHeating(propertyId, userId);
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
      const elecData = await settings.section<{ elecProvider?: unknown }>(supabase, propertyId, 'electricity', userId);
      if (elecData?.elecProvider) setElecProvider(String(elecData.elecProvider));
    })();
  }, [propertyId]);

  const sameDualFuelProvider = elecProvider && elecProvider === s.gasProvider &&
    ['dei', 'protergia', 'heron', 'zenith', 'nrg', 'elin', 'enerwave'].includes(s.gasProvider);
  const dualFuelTariff = tariff?.dual_fuel_discount;

  // Ο μήνας από την ώρα της Αθήνας: ο περιηγητής ενός χρήστη σε άλλη ζώνη
  // μπορεί να είναι ήδη στον επόμενο μήνα και η περίοδος θέρμανσης να αρχίσει
  // ή να τελειώσει μια μέρα νωρίτερα από ό,τι στην πραγματικότητα.
  const isHeatingSeason = [10, 11, 12, 1, 2, 3].includes(Number(athensToday().slice(5, 7)));
  const noGasDataYet = effective === 0 && kwh === 0;

  // Ο ΣΥΓΧΡΟΝΙΣΜΟΣ ΠΡΟΣ ΤΟ ΑΚΙΝΗΤΟ ΕΦΥΓΕ, ΜΑΖΙ ΜΕ ΤΟ ΜΕΝΟΥ ΠΟΥ ΤΟΝ ΤΡΟΦΟΔΟΤΟΥΣΕ.
  // Αυτή η οθόνη αντέγραφε το δικό της τρίτιμο λεξιλόγιο στο
  // `user_properties.heating`: όποιος διάλεγε «Συνδυαστικό» έγραφε `combi` σε
  // στήλη που κανένας κατάλογος ετικετών δεν γνωρίζει και η καρτέλα του
  // ακινήτου τύπωνε «Θέρμανση: combi». Τώρα η πηγή είναι μία και η ροή
  // μονόδρομη: το ακίνητο απαντά, οι καρτέλες διαβάζουν.

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
      // Η κατηγορία είναι το κλειδί της μοναδικότητας: η πηγή 'system' τη
      // μοιράζονται και η ασφάλιση και το αέριο.
      if (await calendar.exists(supabase, propertyId, { category: 'gas_contract', eventDate: expiryStr })) { setCalendarSynced(true); return; }

      // Το `.then(() => setCalendarSynced(true))` δήλωνε επιτυχία χωρίς να
      // κοιτάξει: ο Supabase δεν πετά, οπότε μια απόρριψη από πολιτική RLS
      // κατέληγε σε «συγχρονίστηκε», η υπενθύμιση λήξης δεν έμπαινε ποτέ στο
      // ημερολόγιο και ο χρήστης το μάθαινε όταν είχε λήξει η σύμβαση.
      if (await saved('Η υπενθύμιση λήξης δεν μπήκε στο ημερολόγιο',
        calendar.insert(supabase, [calendar.row({ propertyId, userId }, 'system', {
          title: `Λήξη σύμβασης φυσικού αερίου, ${provider?.label ?? ''}`,
          category: 'gas_contract',
          event_date: expiryStr,
          amount: effective > 0 ? effective : null,
          notes: `Η σύμβαση ${tariff?.name ?? ''} λήγει. Σύγκρινε νέα τιμολόγια πριν ανανεώσεις.`,
        })]))) setCalendarSynced(true);
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
        {/* Τρία πλακίδια: το ρευστό πλέγμα έβγαζε 2+1 στα 430. Ιδια κλάση και
            ίδιοι κανόνες με τους δείκτες του KPIGrid. */}
        <div className="kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, '--kpi-lg': 3, '--kpi-md': 3, '--kpi-sm': 1 } as React.CSSProperties}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Μηνιαίο κόστος προμήθειας</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--accent)', lineHeight: 1 }}>{fe(effective)}</div>
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Ετήσιο κόστος, εκτίμηση</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', lineHeight: 1 }}>{fe(effective * 12)}</div>
          </div>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Δίκτυο διανομής</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, lineHeight: 1.2 }}>{NETWORK_OPERATORS.find(n => n.value === s.networkOperator)?.label}</div>
          </div>
        </div>
      </div>

      {/* ── Στοιχεία σύνδεσης ── */}
      <div style={card}>
        {secHdr('Σύνδεση, πάροχος και τιμολόγιο')}
        {/* ══ ΤΕΣΣΕΡΙΣ ΣΕΙΡΕΣ ΤΩΝ ΔΥΟ ΕΓΙΝΑΝ ΔΥΟ ΣΕΙΡΕΣ ΜΕ ΛΟΓΙΚΗ ═════════════
            Εννιά πεδία κάθονταν σε τέσσερα ξεχωριστά πλέγματα των δύο, με σειρά
            που δεν έλεγε τίποτα: πάροχος, μετά κατανάλωση, μετά ημερομηνίες
            σύμβασης, μετά μια χρηματιστηριακή τιμή δίπλα σε παράγραφο. Το ίδιο
            θέμα σπασμένο σε κομμάτια και κάθε κομμάτι στο μισό πλάτος της
            κάρτας — γι' αυτό η κάρτα ήταν ψηλή και διαβαζόταν σαν ερωτηματολόγιο.

            Δύο σειρές και η καθεμία απαντά ΕΝΑ ερώτημα:
              πρώτη   → τι έχεις (δίκτυο, θέρμανση, πάροχος, τιμολόγιο)
              δεύτερη → η σύμβασή σου και η χρήση σου

            Η παράγραφος του TTF έγινε ⓘ πάνω στο ίδιο του το πεδίο: μια
            επεξήγηση δίπλα σε ένα πεδίο διαβάζεται μία φορά και μετά είναι
            θόρυβος για πάντα. Η ίδια σύμβαση με το «Πραγματικό κόστος».

            ΚΑΙ ΕΙΝΑΙ ΣΥΜΒΟΛΟΣΕΙΡΑ, ΟΧΙ JSX. Το `infoNode` τυλίγει σε κουκκίδα
            ΜΟΝΟ τις συμβολοσειρές· οτιδήποτε άλλο τυπώνεται αυτούσιο μέσα στην
            ετικέτα. Με σύνδεσμο μέσα σε <>…</> η επεξήγηση θα ξαναγινόταν
            παράγραφος, θα φούσκωνε η ετικέτα και το πεδίο θα έπεφτε κάτω από τα
            διπλανά του. Ο σύνδεσμος δεν χάνεται από αδιαφορία: το tooltip έχει
            `pointerEvents: none`, οπότε δεν πατιέται ούτως ή άλλως. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ΤΡΙΑ ΠΑΙΔΙΑ, ΟΧΙ ΤΕΣΣΕΡΑ. Το πλήθος ήταν γραμμένο «4» ενώ οι επιλογείς
            είναι τρεις, οπότε ο κανόνας των διαιρετών υπολόγιζε για τέσσερα και
            έβγαζε 2+1: ο τρίτος μόνος του, με τρύπα δίπλα του. Μετρημένο στα
            430, 768 και 820. */}
        <div {...fixedCols(3, 14, 'start')}>
          <CustomSelect label="Διαχειριστής δικτύου" value={s.networkOperator} onChange={v => upd({ networkOperator: v })} options={networkOptions} />
          <CustomSelect label="Πάροχος" value={s.gasProvider}
            onChange={v => upd({ gasProvider: v, gasTariffId: GAS_PROVIDERS.find(p => p.value === v)?.tariffs[0]?.id || '' })}
            options={providerOptions}/>
          <CustomSelect label="Τιμολόγιο" value={s.gasTariffId || provider?.tariffs[0]?.id || ''} onChange={v => upd({ gasTariffId: v })} options={tariffOptions}/>
        </div>
        <div {...fixedCols(5, 14, 'start')}>
          <DatePicker label="Έναρξη σύμβασης" value={s.gasContractStart} onChange={v => upd({ gasContractStart: v })}/>
          <NumberInput label="Διάρκεια σύμβασης" value={s.gasContractMonths} onChange={v => upd({ gasContractMonths: v })} suffix="μήνες"/>
          <NumberInput label="Μηνιαία κατανάλωση" value={s.gasKwhMonthly} onChange={v => upd({ gasKwhMonthly: v })} suffix="kWh"/>
          <NumberInput label="Πραγματικό κόστος τον μήνα" labelInfo="Ολόκληρο το ποσό του λογαριασμού, με δίκτυο, ΕΦΚ και ΦΠΑ. Χρησιμοποιείται για την παρακολούθηση κόστους, ΟΧΙ για τη σύγκριση παρόχων: εκεί συγκρίνεται προμήθεια με προμήθεια."
            value={s.gasMonthly} onChange={v => upd({ gasMonthly: v })} suffix="€"/>
          <NumberInput label="Τρέχουσα τιμή TTF" value={s.ttfPrice} onChange={v => upd({ ttfPrice: v })} suffix="€/MWh" step={1}
            labelInfo="Τα κυμαινόμενα τιμολόγια (σήμανση ƒ) υπολογίζονται από τον επίσημο τύπο του παρόχου με βάση αυτή την τιμή. Η μηνιαία τιμή δημοσιεύεται στο Ευρωπαϊκό Χρηματιστήριο Ενέργειας (EEX) και στους λογαριασμούς των παρόχων."/>
        </div>
        </div>

        {tariff && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--bg-base)', borderRadius: T.radius.inner, border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' as const, gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{tariff.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.badge, background: bc(tariff.badge).bg, border: `1px solid ${bc(tariff.badge).border}`, color: bc(tariff.badge).color }}>{tariff.badge}</span>
                {(() => { const pb = priceBadge(tariff.priceStatus); return (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.badge, background: pb.bg, border: `1px solid ${pb.border}`, color: pb.color }}>{pb.label}</span>
                ); })()}
              </div>
              <a href={provider?.url} target="_blank" rel="noopener noreferrer" className="tap-link"
                style={{ fontSize: 11, color: 'var(--accent)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '4px 12px', textDecoration: 'none', whiteSpace: 'nowrap' as const, fontFamily: T.font.sans, fontWeight: 600 }}>
                Επίσημη σελίδα
              </a>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{tariff.desc}</div>
            {tariff.sourceNote && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: T.font.sans }}>Πηγή: {tariff.sourceNote}</div>}
            <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' as const }}>
              <span title="Κιλοβατώρα, μονάδα μέτρησης κατανάλωσης ενέργειας" style={{ fontSize: 11, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>Χρέωση kWh:{'  '}<strong style={{ color: 'var(--text-primary)' }}>{fk(tariffKwh(tariff))} / kWh</strong></span>
              <span style={{ fontSize: 11, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>Αρχικό πάγιο:{'  '}<strong>{fe(tariff.fixed)} / μήνα</strong></span>
              {tariff.dual_fuel_discount != null && (
                <span title="Κοινός πάροχος ρεύματος και αερίου με ενιαία έκπτωση" style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>Dual Fuel:{'  '}<strong>−{fk(tariff.dual_fuel_discount)} / kWh</strong></span>
              )}
            </div>
            {tariff.fixedNote && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, fontFamily: T.font.sans }}>{tariff.fixedNote}</div>}
          </div>
        )}
      </div>

      {/* ── Σύγκριση παρόχων ── */}
      {kwh > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap' as const, gap: 10 }}>
            {secHdr('Σύγκριση παρόχων', `Βάσει ${kwh} kWh/μήνα και TTF ${feRate(parseFloat(s.ttfPrice) || DEFAULT_TTF_EUR_MWH)}/MWh, χρέωση προμήθειας, χωρίς ρυθμιζόμενες/ΦΠΑ`)}
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
                Δυνητική εξοικονόμηση <strong style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{fe(savings)} τον μήνα</strong> ({fe(savings * 12)} τον χρόνο) με το φθηνότερο τιμολόγιο, στη χρέωση προμήθειας. Δίκτυο, ΕΦΚ και ΦΠΑ είναι ίδια σε κάθε πάροχο και δεν εξοικονομούνται. Επιβεβαίωσε την τρέχουσα προσφορά στον πάροχο.
              </span>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>{['Πάροχος', 'Τιμολόγιο', 'Τύπος', 'Τιμή', 'kWh', 'Πάγιο', 'Μήνας', 'Έτος', 'Διαφορά'].map(h => (
                  <th key={h} style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, background: 'var(--bg-elevated)' }}>{h}</th>
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
                        {!t.isCurrent && isBest && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginRight: 6, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Φθηνότερο</span>}
                        {t.providerLabel}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>{t.name}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: T.radius.badge, background: rowBc.bg, border: `1px solid ${rowBc.border}`, color: rowBc.color }}>{t.badge}</span>
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <span title={t.sourceNote} style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: T.radius.badge, background: pb.bg, border: `1px solid ${pb.border}`, color: pb.color, cursor: 'help' }}>{pb.label}</span>
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
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, background: 'var(--bg-elevated)', padding: '6px 12px', borderRadius: T.radius.badge, lineHeight: 1.5 }}>
            * Οι τιμές αφορούν τη χρέωση προμήθειας χωρίς ρυθμιζόμενες χρεώσεις δικτύου, ΕΦΚ και ΦΠΑ. Οι κυμαινόμενες αλλάζουν μηνιαίως, τελευταία επαλήθευση: {LAST_VERIFIED}. Επίσημη σύγκριση: εργαλείο ΡΑΑΕΥ μέσω gov.gr.
          </div>
        </div>
      )}

      {/* ── Έξυπνες ειδοποιήσεις βάσει πραγματικών δεδομένων ── */}
      {(() => {
        const hints: { text: string; severity: 'info' | 'warning' | 'tip' }[] = [];

        if (sameDualFuelProvider && !dualFuelTariff) {
          hints.push({ text: `Έχεις ${provider?.label} και στα δύο (ρεύμα + αέριο), έλεγξε αν δικαιούσαι τιμολόγιο dual fuel με έκπτωση.`, severity: 'tip' });
        }
        if (dualFuelTariff) {
          hints.push({ text: `Το τρέχον τιμολόγιο έχει Dual Fuel έκπτωση −${fk(dualFuelTariff)}/kWh λόγω κοινού παρόχου με το ρεύμα.`, severity: 'info' });
        }
        if (isHeatingSeason && noGasDataYet && usesGas(heatingType)) {
          hints.push({ text: 'Είμαστε σε περίοδο θέρμανσης και δεν έχεις καταχωρήσει ακόμη κατανάλωση ή κόστος αερίου. Συμπλήρωσε τα στοιχεία για ακριβή παρακολούθηση.', severity: 'warning' });
        }
        if (tariff?.type === 'variable' && kwh > 800) {
          hints.push({ text: `Με ${kwh} kWh/μήνα, ένα σταθερό τιμολόγιο θα σε προστάτευε από διακυμάνσεις TTF τον χειμώνα, τότε οι τιμές συνήθως ανεβαίνουν.`, severity: 'tip' });
        }
        if (heatingType === 'central_gas') {
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

      {/* ══ ΤΡΙΑ ΙΔΙΑ ΓΚΡΙΖΑ ΚΟΥΤΙΑ ΔΙΑΒΑΖΟΝΤΑΙ ΩΣ ΤΟΙΧΟΣ ══════════════════
          Τρεις παράγραφοι με πανομοιότυπο πλαίσιο, φόντο και μέγεθος: τίποτα δεν
          έλεγε στο μάτι ποια αφορά ΕΣΕΝΑ τώρα. Και οι τρεις πληροφορίες είναι
          χρήσιμες, οπότε δεν σβήνονται· αποκτούν όμως κεφαλή που σαρώνεται σε
          ένα δευτερόλεπτο και το πλαίσιο φεύγει υπέρ μιας λεπτής γραμμής.
          Το ίδιο ιδίωμα με τις υπόλοιπες λίστες της εφαρμογής. ══ */}
      <div style={card}>
        {secHdr('Πριν αλλάξεις τιμολόγιο')}
        <div>
          {[
            { t: 'Η αλλαγή παρόχου δεν αγγίζει το δίκτυο',
              b: 'Το δίκτυο διανομής ανήκει στον τοπικό διαχειριστή (ΕΔΑ Αττικής, ΕΔΑ ΘΕΣΣ ή ΔΕΔΑ) και δεν αλλάζει όποιον πάροχο κι αν επιλέξεις. Η αλλαγή είναι καθαρά εμπορική: καμία επέμβαση στον αγωγό ή στον λέβητα, περίπου τρεις εβδομάδες, χωρίς χρέωση.' },
            { t: 'Η «έκπτωση συνέπειας» χάνεται με μία καθυστέρηση',
              b: 'Πολλά τιμολόγια διαφημίζουν τιμή που ισχύει μόνο με εμπρόθεσμη εξόφληση. Αν αργήσεις μία πληρωμή, χρεώνεσαι τη βασική, υψηλότερη τιμή. Σύγκρινε και την καθαρή τιμή, χωρίς την έκπτωση.' },
            { t: 'Τα κυμαινόμενα ακολουθούν τον δείκτη TTF',
              b: 'Ο TTF είναι η ευρωπαϊκή χονδρεμπορική αγορά αερίου και ανεβαίνει συνήθως τον χειμώνα, με τη ζήτηση θέρμανσης. Αν θέλεις σιγουριά, κλείδωσε σταθερό πριν την ψυχρή περίοδο.' },
          ].map((x, i, arr) => (
            <div key={x.t} style={{ padding: '12px 0', borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--border-subtle)' }}>
              <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontFamily: T.font.sans, lineHeight: 1.45 }}>{x.t}</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 3 }}>{x.b}</p>
            </div>
          ))}
        </div>
        <a href={RAAEY_COMPARE} target="_blank" rel="noopener noreferrer" className="tap-link"
          style={{ display: 'inline-block', marginTop: 14, fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.pill, padding: '8px 18px', textDecoration: 'none' }}>
          Επίσημη σύγκριση τιμών <span title={RAAEY_NAME}>ΡΑΑΕΥ</span> στο gov.gr
        </a>
      </div>
    </div>
  );
}