'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const fk = (n: number) => `${n.toFixed(4)} €`;
const LAST_UPDATED = 'Ιούνιος 2026';
const RAAYEY_URL  = 'https://energycost.gr/%CF%85%CF%80%CE%BF%CE%BB%CE%BF%CE%B3%CE%B9%CF%83%CE%BC%CF%8C%CF%82-%CF%84%CE%B9%CE%BC%CE%AE%CF%82-%CE%B2%CE%AC%CF%83%CE%B5%CE%B9-%CE%BA%CE%B1%CF%84%CE%B1%CE%BD%CE%AC%CE%BB%CF%89%CF%83%CE%B7%CF%82-2/';
const ERT    = 0.00856;  // Ειδικό Ρυθμιστικό Τέλος
const ETMEAR = 0.0152;   // ΑΠΕ τέλος

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font: { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};

const histInputStyle = (isCurrent: boolean, isHovered = false): React.CSSProperties => ({
  width: '100%', background: isCurrent ? 'rgba(212,175,66,0.09)' : isHovered ? 'var(--bg-elevated)' : 'var(--bg-base)',
  border: `1px solid ${isCurrent ? 'var(--accent)' : isHovered ? 'var(--border-default)' : 'var(--border-subtle)'}`,
  borderRadius: T.radius.badge, padding: '6px 4px', color: 'var(--text-primary)',
  fontSize: 11, fontFamily: T.font.mono, outline: 'none', textAlign: 'center',
  boxSizing: 'border-box', transition: 'all 0.15s', cursor: 'pointer',
});

// ── CONTRACT DURATION OPTIONS ─────────────────────────────────────────────────
const DURATION_OPTIONS = [
  { value: '',    label: 'Χωρίς δέσμευση' },
  { value: '12',  label: '12 μήνες'        },
  { value: '18',  label: '18 μήνες'        },
  { value: '24',  label: '24 μήνες'        },
  { value: '36',  label: '36 μήνες'        },
];

// ── REAL JUNE 2026 TARIFFS — SOURCE: bestenergydeals.gr / pricefox.gr (3/6/2026) ──
interface Tariff {
  id: string; name: string; badge: string; type: string;
  kwh_day: number; kwh_night?: number | null;
  kwh_tier2?: number; tier2_threshold?: number;
  flat_monthly?: number | null;
  fixed: number; fixed_ebill?: number | null;
  vat: number; desc: string;
  contract_months?: number;
  no_fixed?: boolean;
  smart_meter?: boolean;
  discount_ebill?: number;
  dynamic?: boolean;
  student?: boolean;
  segment?: 'residential' | 'business';  // οικιακό ή επιχειρηματικό
}

const PROVIDERS = [
  {
    value: 'dei', label: 'ΔΕΗ', url: 'https://www.dei.gr',
    tariffs: [
      { id: 'dei_enter',        name: 'myHome Enter',           badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1450, kwh_night: null,   fixed: 5.00, fixed_ebill: 3.50, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μήνες. Πάγιο 3.50 € με e-bill + πάγια εντολή.' },
      { id: 'dei_entertwo',     name: 'myHome EnterTwo',        badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1450, kwh_night: 0.0950, fixed: 5.00, fixed_ebill: 3.50, contract_months: 24, vat: 6, segment: 'residential', desc: 'Σταθερό 24 μήνες με νυχτερινή ζώνη (23:00-07:00). Ιδανικό για πλυντήρια, θερμοσίφωνα.' },
      { id: 'dei_online',       name: 'myHome Online',          badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1420, kwh_night: null,   fixed: 5.00, fixed_ebill: 3.50, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό online-only 12 μήνες. Χαμηλότερη τιμή με e-bill + πάγια εντολή.' },
      { id: 'dei_maxima',       name: 'myHome Maxima',          badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1320, kwh_night: null,   kwh_tier2: 0.1220, tier2_threshold: 600, fixed: 5.00, fixed_ebill: 3.50, contract_months: 12, vat: 6, segment: 'residential', desc: 'Κλιμακωτό: 0.132 € (0-600 kWh), 0.122 € (>600 kWh). Συμφέρει για υψηλή κατανάλωση.' },
      { id: 'dei_plan',         name: 'myHome Plan',            badge: 'ΜΠΛΕ',    type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 60.00, fixed: 0, contract_months: 12, vat: 6, segment: 'residential', desc: 'Flat 60 €/μήνα all-in. Ιδανικό για 2.500-4.500 kWh/έτος.' },
      { id: 'dei_4all',         name: 'myHome 4All',            badge: 'ΚΙΤΡΙΝΟ', type: 'variable',      kwh_day: 0.1370, kwh_night: null,   kwh_tier2: 0.1870, tier2_threshold: 500, fixed: 5.00, fixed_ebill: 3.50, contract_months: 0, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. 0.137 € (0-500 kWh) / 0.187 € (>500 kWh). Χωρίς δέσμευση.' },
      { id: 'dei_4students',    name: 'myHome 4Students',       badge: 'ΚΙΤΡΙΝΟ', type: 'variable',      kwh_day: 0.1290, kwh_night: null,   kwh_tier2: 0.1850, tier2_threshold: 150, fixed: 3.00, fixed_ebill: 0, contract_months: 0, vat: 6, segment: 'residential', desc: 'Φοιτητικό: 0.129 € (0-150 kWh) / 0.185 € (>150 kWh). Πάγιο 3 €. Bonus καλοκαίρι.' },
      { id: 'dei_prasino',      name: 'Γ1 Πράσινο',            badge: 'ΠΡΑΣΙΝΟ', type: 'variable',      kwh_day: 0.1440, kwh_night: null,   fixed: 5.00, fixed_ebill: 3.50, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ειδικό Οικιακό (Γ1) — κυμαινόμενο. Ανακοινώνεται κάθε 1η του μήνα.' },
      { id: 'dei_prasino_n',    name: 'Γ1Ν Πράσινο Νυχτερινό', badge: 'ΠΡΑΣΙΝΟ', type: 'variable',      kwh_day: 0.1440, kwh_night: 0.1160, fixed: 5.00, fixed_ebill: 3.50, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ειδικό με νυχτερινή ζώνη. Ανακοινώνεται κάθε 1η του μήνα.' },
      { id: 'dei_dynamic',      name: 'myHome Dynamic',         badge: 'ΔΥΝΑΜΙΚΟ',type: 'dynamic',       kwh_day: 0, kwh_night: null, fixed: 5.00, smart_meter: true, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ωριαία τιμολόγηση βάσει χονδρεμπορικής (HEnEx). Απαιτεί έξυπνο μετρητή ΔΕΔΔΗΕ.' },
      // ── Επαγγελματικά (Γ21/Γ22) ────────────────────────────────────────
      { id: 'dei_biz_enter',   name: 'myBusiness Enter',       badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1510, kwh_night: null, flat_monthly: null, fixed: 6.00, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'business', desc: 'Σταθερό επαγγελματικό. Πάγια εντολή υποχρεωτική.' },
      { id: 'dei_biz_4all',    name: 'myBusiness 4ALL',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.16366, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'business', desc: 'Κυμαινόμενο επαγγελματικό χωρίς δέσμευση.' },
      { id: 'dei_biz_g21',     name: 'Γ21 Επαγγελματικό',      badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.16417, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'business', desc: 'Ειδικό κοινό τιμολόγιο Γ21 (kVA≤25). Ανακοινώνεται 1η του μήνα.' },
    ] as unknown as Tariff[],
  },
    {
    value: 'heron', label: 'Ήρων', url: 'https://www.heron.gr',
    tariffs: [
      // ── Σταθερά (Μπλε) ────────────────────────────────────────────────────
      { id: 'heron_blue_smart',   name: 'Blue Smart Home',              badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1380, kwh_night: null, flat_monthly: null, fixed: 7.95,  fixed_ebill: 7.95, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Πάγιο 7.95€ (≤150 kWh) / 15.90€ (>150 kWh). Έκπτωση Συνέπειας.' },
      { id: 'heron_blue_gen_max', name: 'Blue Generous Max Home',       badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1440, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 18, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Best Seller. Πάγιο 11.90€. Έκπτωση Συνέπειας. 18 μήνες.' },
      { id: 'heron_blue_gen',     name: 'Blue Generous Home',           badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1530, kwh_night: null, flat_monthly: null, fixed: 10.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Πάγιο 10.90€. Έκπτωση Συνέπειας.' },
      { id: 'heron_blue_simple',  name: 'Blue Simple Home',             badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1580, kwh_night: null, flat_monthly: null, fixed: 15.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Χωρίς προϋπόθεση συνέπειας. Πάγιο 15.90€.' },
      // ── Κυμαινόμενα (Κίτρινα) ─────────────────────────────────────────────
      { id: 'heron_yellow_one',     name: 'Yellow One Home',            badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.13044, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Έκπτωση Συνέπειας. Συμβατό με ΚΟΤ.' },
      { id: 'heron_yellow_free',    name: 'Yellow Free Home',           badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0840,  kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 12, no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', desc: 'Χωρίς πάγιο. Τιμή + ΜΔΚΑ. Απαιτείται πάγια εντολή.' },
      { id: 'heron_yellow_student', name: 'Yellow Free Student',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0840,  kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 12, no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', desc: 'Φοιτητικό. Χωρίς πάγιο. Δώρο 20€. Απαιτείται φοιτητική ταυτότητα ή ΑΜΚΑ.' },
      { id: 'heron_protect',        name: 'Protect Home',               badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0825,  kwh_night: null, flat_monthly: null, fixed: 5.50,  fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Νέο τιμολόγιο. Τιμή 0.0825€ + ΜΔΚΑ. Πάγιο 5.50€.' },
      { id: 'heron_happy_hour',     name: 'Happy Hour Home',            badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0825,  kwh_night: null, flat_monthly: null, fixed: 7.00,  fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Νέο. 3 ώρες δωρεάν ρεύμα ημερησίως. Πάγιο 7€.' },
      // ── Πράσινο (Γ1 Ειδικό) ───────────────────────────────────────────────
      { id: 'heron_basic',          name: 'Basic Home (Γ1 Πράσινο)',    badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1642,  kwh_night: null, flat_monthly: null, fixed: 7.00,  fixed_ebill: null, contract_months: 0, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Ειδικό τιμολόγιο Γ1. Ανακοινώνεται κάθε 1η μήνα. Έκπτωση συνέπειας 7 λεπτά/kWh.' },
      { id: 'heron_ena',            name: 'Ε.ΝΑ (Virtual Net Metering)', badge: 'VNM',   type: 'vnm',      kwh_day: 0.1290,  kwh_night: null, flat_monthly: null, fixed: 7.00,  fixed_ebill: null, contract_months: 0, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Εικονική Καθαρή Μέτρηση. Συμμετοχή σε κοινό φωτοβολταϊκό. Χωρίς δέσμευση.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'heron_blue_smart_biz', name: 'Blue Smart Business',     badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1580, kwh_night: null, flat_monthly: null, fixed: 7.95,  fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό επαγγελματικό. Κλιμακωτό πάγιο.' },
      { id: 'heron_blue_gen_max_biz', name: 'Blue Generous Max Business', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.1650, kwh_night: null, flat_monthly: null, fixed: 13.90, fixed_ebill: null, contract_months: 18, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό 18μηνο επαγγελματικό.' },
      { id: 'heron_protect_biz_s', name: 'Protect Business Small',   badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1395, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Κυμαινόμενο μικρής επιχείρησης.' },
      { id: 'heron_yellow_one_biz', name: 'Yellow One Business S',   badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.14804, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Κυμαινόμενο. Έκπτωση συνέπειας.' },
      { id: 'heron_basic_biz_s',  name: 'Basic Business Small',      badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.17344, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Ειδικό Γ21 επαγγελματικό. Ανακοινώνεται 1η του μήνα.' },
    ] as unknown as Tariff[],
  },

  {
    value: 'protergia', label: 'Protergia', url: 'https://www.protergia.gr',
    tariffs: [
      { id: 'prot_flow',        name: 'Value Flow',             badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.13767, kwh_night: null,  fixed: 5.00, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο — φθηνότερο της Protergia. Χωρίς δέσμευση.' },
      { id: 'prot_sure_18',     name: 'Value Sure 18M 2.0',     badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1450, kwh_night: null,  fixed: 5.00, contract_months: 18, vat: 6, segment: 'residential', desc: 'Σταθερό 18 μήνες. Κλειδωμένη τιμή μακροπρόθεσμα.' },
      { id: 'prot_sure_12',     name: 'Value Sure 12M',         badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1520, kwh_night: null,  fixed: 5.00, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μήνες.' },
      { id: 'prot_standard',    name: 'Value Standard',         badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1590, kwh_night: null,  fixed: 5.00, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο ειδικό. Ανακοινώνεται κάθε 1η μήνα.' },
      { id: 'prot_lite2',       name: 'Value Lite 2.0',         badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.16267, kwh_night: null, fixed: 0,    no_fixed: true, contract_months: 0, vat: 6, segment: 'residential', desc: 'Χωρίς πάγιο. Ιδανικό για σπάνια χρήση ή εξοχικά.' },
      { id: 'prot_dynamic',     name: 'Dynamic One Home',       badge: 'ΔΥΝΑΜΙΚΟ',type: 'dynamic',  kwh_day: 0,      kwh_night: null, fixed: 0,    smart_meter: true, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ωριαία δυναμική τιμολόγηση. Ενεργοποιήθηκε Ιούνιο 2026.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'prot_simple_biz1',  name: 'Value Simple Επαγγελματικό 1', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.14700, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Φθηνότερο κυμαινόμενο επαγγελματικό στην αγορά.' },
      { id: 'prot_sure_biz1',    name: 'Value Sure Επαγγελματικό 1',   badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1699,  kwh_night: null, flat_monthly: null, fixed: 13.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό 12μηνο επαγγελματικό.' },
      { id: 'prot_sure_biz2',    name: 'Value Sure Επαγγελματικό 2',   badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1999,  kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 12, no_fixed: true,  dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό χωρίς πάγιο. Ιδανικό για μικρή κατανάλωση.' },
      { id: 'prot_picasso_s',    name: 'Picasso Small',                badge: 'FLAT',    type: 'flat',     kwh_day: 0,       kwh_night: null, flat_monthly: 39.90, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'All-in flat πακέτο. Προϊόν Χρονιάς 2026.' },
      { id: 'prot_picasso_m',    name: 'Picasso Medium',               badge: 'FLAT',    type: 'flat',     kwh_day: 0,       kwh_night: null, flat_monthly: 82.90, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'All-in flat πακέτο. Προϊόν Χρονιάς 2026.' },
      { id: 'prot_picasso_l',    name: 'Picasso Large',                badge: 'FLAT',    type: 'flat',     kwh_day: 0,       kwh_night: null, flat_monthly: 259.90, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'All-in flat πακέτο μεγάλης κατανάλωσης.' },
    ] as unknown as Tariff[],
  },
  {
    value: 'volterra', label: 'Volterra', url: 'https://www.volterra.gr',
    tariffs: [
      { id: 'volt_easy',        name: 'Volterra Easy',          badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1610, kwh_night: null, fixed: 6.50, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Χωρίς δέσμευση.' },
      { id: 'volt_stable',      name: 'Volterra Stable',        badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1490, kwh_night: null, fixed: 7.00, contract_months: 24, vat: 6, segment: 'residential', desc: 'Σταθερό 24 μήνες. Μέγιστη ασφάλεια τιμής.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'volt_biz_stable', name: 'Volterra Business Stable', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.1620, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό επαγγελματικό 12μηνο.' },
    ] as unknown as Tariff[],
  },
  {
    value: 'nrg', label: 'NRG', url: 'https://www.nrg.gr',
    tariffs: [
      { id: 'nrg_now',          name: 'NRG Now Οικιακό',        badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1595, kwh_night: null, fixed: 6.90, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Χωρίς δέσμευση.' },
      { id: 'nrg_adjust',       name: 'NRG adjust 1.0',         badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1580, kwh_night: null, fixed: 9.90, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μήνες. Τελευταία γνωστή τιμή.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'nrg_adjust_biz',  name: 'adjust 1.0 Business',    badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1580, kwh_night: null, flat_monthly: null, fixed: 13.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό επαγγελματικό χωρίς ρήτρα.' },
      { id: 'nrg_simple_biz',  name: 'simple 1.0 Business 1',  badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1790, kwh_night: null, flat_monthly: null, fixed: 9.90,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Κυμαινόμενο επαγγελματικό.' },
    ] as unknown as Tariff[],
  },
  {
    value: 'zenith', label: 'Zenith', url: 'https://www.zenith.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'zen_fixed_1y',  name: 'Power Home Fixed 1Y',     badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1290, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μηνών. Έκπτωση Συνέπειας από τον 1ο λογαριασμό.' },
      { id: 'zen_fixed_24',  name: 'Power Home Fixed 24',     badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1350, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 24, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό 24 μηνών — κλειδωμένη τιμή 2 χρόνια.' },
      { id: 'zen_pair',      name: 'Power Home Pair',         badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1380, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Dual fuel — ρεύμα και φυσικό αέριο μαζί.' },
      { id: 'zen_sure_plus', name: 'Power Home Sure Plus',    badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1450, kwh_night: null, flat_monthly: null, fixed: 9.90,  fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό πρόγραμμα ασφαλείας.' },
      { id: 'zen_select',    name: 'Power Home Select',       badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1490, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Κίτρινο κυμαινόμενο. Χωρίς δέσμευση.' },
      { id: 'zen_save30',    name: 'Power Home Save 3.0',     badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1530, kwh_night: null, flat_monthly: null, fixed: 4.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Κίτρινο κυμαινόμενο χαμηλό πάγιο.' },
      { id: 'zen_light',     name: 'Power Home Light',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1560, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 0,  no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', desc: 'Χαμηλό πάγιο. Ιδανικό χαμηλή κατανάλωση.' },
      { id: 'zen_student',   name: 'Power Home Student',      badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1450, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 0,  no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', student: true, desc: 'Φοιτητικό. Απαιτείται φοιτητική ταυτότητα.' },
      { id: 'zen_start',     name: 'Power Home Start (Ειδικό)', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1988, kwh_night: null, flat_monthly: null, fixed: 6.80, fixed_ebill: null, contract_months: 0, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Ανακοινώνεται κάθε 1η του μήνα.' },
      { id: 'zen_zenergy',   name: 'ZeΝergy',                 badge: 'FLAT',    type: 'flat',     kwh_day: 0,      kwh_night: null, flat_monthly: 49.00, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in πακέτα από 49€/μήνα.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'zen_biz_start', name: 'Power Business Start',    badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.2090, kwh_night: null, flat_monthly: null, fixed: 1.00, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Ειδικό επαγγελματικό. Χαμηλό πάγιο, ετήσια δέσμευση.' },
    ] as unknown as Tariff[],
  },
  {
    value: 'elin', label: 'Elin', url: 'https://energy.elin.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'elin_power_green', name: 'Power On! Home Green',  badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1640, kwh_night: null, flat_monthly: null, fixed: 7.10, fixed_ebill: null, contract_months: 0, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Δημοσιεύεται την 1η κάθε μήνα.' },
      { id: 'elin_blue',        name: 'Home Blue Fixed',       badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1480, kwh_night: null, flat_monthly: null, fixed: 9.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό 12μηνο.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'elin_biz_green',   name: 'Business Green',        badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.16587, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Ειδικό επαγγελματικό Γ21.' },
    ] as unknown as Tariff[],
  },
  {
    value: 'elpedison', label: 'Elpedison', url: 'https://www.elpedison.gr',
    tariffs: [
      { id: 'elp_bright',       name: 'Elpedison Bright',       badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1690, kwh_night: null, fixed: 3.00, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μήνες. Χαμηλό πάγιο.' },
      { id: 'elp_one',          name: 'Elpedison One Home',     badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1706, kwh_night: null, fixed: 5.00, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Ανακοινώνεται κάθε 1η μήνα.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'elp_biz_one', name: 'Elpedison One Business', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1750, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Κυμαινόμενο επαγγελματικό.' },
    ] as unknown as Tariff[],
  },
  {
    value: 'volton', label: 'Volton', url: 'https://volton.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'volton_green',    name: 'Volton Green Ειδικό',   badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1861, kwh_night: null, flat_monthly: null, fixed: 0,    fixed_ebill: null, contract_months: 0,  no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Μηδενική εγγύηση. Ανακοινώνεται 1η μήνα.' },
      { id: 'volton_blue',     name: 'Volton Blue Flat 18M',  badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1590, kwh_night: null, flat_monthly: null, fixed: 9.90, fixed_ebill: null, contract_months: 18, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό 18 μηνών. Χωρίς ρήτρα.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'volton_yellow_biz', name: 'Yellow Simple Business', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.14078, kwh_night: null, flat_monthly: null, fixed: 6.90, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Κυμαινόμενο επαγγελματικό.' },
      { id: 'volton_blue_biz',   name: 'Blue Flat 18M Business', badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1590,  kwh_night: null, flat_monthly: null, fixed: 9.90, fixed_ebill: null, contract_months: 18, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό 18μηνο επαγγελματικό.' },
      { id: 'volton_green_biz',  name: 'Green Ειδικό Business',  badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1863,  kwh_night: null, flat_monthly: null, fixed: 4.90, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Ειδικό Γ21 επαγγελματικό.' },
    ] as unknown as Tariff[],
  },
  {
    value: 'enerwave', label: 'Enerwave', url: 'https://www.enerwave.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'enrw_saver',       name: 'Reward Saver',           badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1290, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 0,  no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', desc: 'Φθηνότερο κυμαινόμενο χωρίς πάγιο.' },
      { id: 'enrw_stable_max',  name: 'Reward Stable Max',      badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1390, kwh_night: null, flat_monthly: null, fixed: 12.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Φθηνότερο σταθερό 12 μηνών.' },
      { id: 'enrw_stable',      name: 'Reward Stable',          badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1690, kwh_night: null, flat_monthly: null, fixed: 12.90, fixed_ebill: null, contract_months: 18, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό 18 μηνών.' },
      { id: 'enrw_stable_zero', name: 'Reward Stable Zero 12M', badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1890, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 12, no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό χωρίς πάγιο, 12 μήνες.' },
      { id: 'enrw_smart',       name: 'Smart',                  badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.14504, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο smart πρόγραμμα.' },
      { id: 'enrw_smart_zero',  name: 'Smart Zero',             badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.15914, kwh_night: null, flat_monthly: null, fixed: 0,    fixed_ebill: null, contract_months: 0,  no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο χωρίς πάγιο.' },
      { id: 'enrw_night',       name: 'Night Saver',            badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1490, kwh_night: 0.0650, flat_monthly: null, fixed: 8.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό με νυχτερινή ζώνη. Ιδανικό θερμοσίφωνα/πλυντήρια.' },
      { id: 'enrw_special',     name: 'Ειδικό Οικιακό',         badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1590, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', kwh_tier2: 0.21550, tier2_threshold: 100, desc: 'Ειδικό Γ1. 0.159€ πρώτες 100kWh, 0.2155€ άνω.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'enrw_saver_biz',   name: 'Reward Saver Business',  badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1490, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 0,  no_fixed: true,  dynamic: false, vat: 24, segment: 'business', desc: 'Φθηνότερο κυμαινόμενο επαγγελματικό.' },
      { id: 'enrw_stable_biz',  name: 'Reward Stable for Business Γ21', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.1690, kwh_night: null, flat_monthly: null, fixed: 12.90, fixed_ebill: null, contract_months: 18, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό επαγγελματικό 18μηνο.' },
      { id: 'enrw_special_biz', name: 'Ειδικό Επιχειρήσεις Γ21', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1590, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Ειδικό Γ21 επαγγελματικό.' },
      { id: 'enrw_wave_daily',  name: 'My Wave Daily Business', badge: 'FLAT',    type: 'flat',     kwh_day: 0,      kwh_night: null, flat_monthly: 65.00, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Συνδρομητικό από 1.5€/ημέρα. Σταθερό κόστος.' },
    ] as unknown as Tariff[],
  },
  {
    value: 'fysiko_aerio', label: 'Φυσικό Αέριο Ελλάδος', url: 'https://www.gaselli.gr',
    tariffs: [
      { id: 'fa_oikia',         name: 'Oikia Green',            badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.14265, kwh_night: null, fixed: 5.00, contract_months: 0, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Ανακοινώνεται κάθε 1η μήνα.' },
    ] as unknown as Tariff[],
  },
];

const BADGE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  'ΠΡΑΣΙΝΟ':  { bg: 'rgba(52,168,83,0.1)',  color: 'var(--positive)', border: 'rgba(52,168,83,0.25)'  },
  'ΚΙΤΡΙΝΟ':  { bg: 'rgba(242,153,0,0.1)',  color: 'var(--warning)',  border: 'rgba(242,153,0,0.25)'  },
  'ΜΠΛΕ':     { bg: 'rgba(26,115,232,0.1)', color: 'var(--info)',     border: 'rgba(26,115,232,0.25)' },
  'VNM':      { bg: 'rgba(212,175,66,0.1)', color: 'var(--accent)',   border: 'rgba(212,175,66,0.25)' },
  'ΔΥΝΑΜΙΚΟ': { bg: 'rgba(139,92,246,0.1)', color: '#8b5cf6',         border: 'rgba(139,92,246,0.25)' },
};
const bc = (badge: string) => BADGE_COLORS[badge] || { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' };

const ELEC_DEFAULTS = {
  elecProvider: 'dei', elecTariff: 'dei_enter', useEbill: true,
  kwhMonthly: '250', nightPct: '30', kwhHistory: Array(12).fill(''),
  contractStart: '', contractMonths: '', manualMonthly: '',
};

export default function BillsElectricity({ propertyId, userId, onNavigateTab }: { propertyId: string; userId?: string; onNavigateTab?: (tab: string) => void }) {
  const supabase   = createClient();
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties   = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 };
  const currentMonth = new Date().getMonth();
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  const [s, su] = useBillsSettings(propertyId, userId || '', 'electricity', ELEC_DEFAULTS);

  // State
  const [provider,         setProvider]         = useState('dei');
  const [tariffId,         setTariffId]         = useState('dei_enter');
  const [useEbill,         setUseEbill]          = useState(true);
  const [kwhMonthly,       setKwhMonthly]       = useState('250');
  const [nightPct,         setNightPct]         = useState('30');
  const [kwhHistory,       setKwhHistory]       = useState<string[]>(Array(12).fill(''));
  const [contractStart,    setContractStart]    = useState('');
  const [contractMonths,   setContractMonths]   = useState('');
  const [manualMonthly,    setManualMonthly]    = useState('');
  const [insData,          setInsData]          = useState<{ eq: boolean; fl: boolean } | null>(null);
  const [segmentFilter,    setSegmentFilter]    = useState<'residential' | 'business'>('residential');

  // Load from settings
  useEffect(() => {
    if (!s) return;
    if (s.elecProvider)          setProvider(s.elecProvider as string);
    if (s.elecTariff)            setTariffId(s.elecTariff as string);
    if (s.useEbill !== undefined) setUseEbill(Boolean(s.useEbill));
    if (s.kwhMonthly)            setKwhMonthly(String(s.kwhMonthly));
    if (s.nightPct)              setNightPct(String(s.nightPct));
    if (s.kwhHistory)            setKwhHistory(s.kwhHistory as string[]);
    if (s.contractStart)         setContractStart(String(s.contractStart));
    if (s.contractMonths)        setContractMonths(String(s.contractMonths));
    if (s.manualMonthly)         setManualMonthly(String(s.manualMonthly));
  }, [s]);

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        const { data } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'insurance').maybeSingle();
        if (data?.data) { const d = data.data as any; setInsData({ eq: !!d.insCustomEarthquake, fl: !!d.insCustomFlood }); }
      } catch (_) {}
    })();
  }, [propertyId]);

  const save = (patch: Record<string, unknown>) => su({ elecProvider: provider, elecTariff: tariffId, useEbill, kwhMonthly, nightPct, kwhHistory, contractStart, contractMonths, manualMonthly, ...patch });

  // Derived
  const providerObj   = PROVIDERS.find(p => p.value === provider) || PROVIDERS[0];
  const tariffOptions = providerObj.tariffs.map(t => ({ value: t.id, label: t.name }));
  const tariff        = providerObj.tariffs.find(t => t.id === tariffId) || providerObj.tariffs[0];
  const tariffBc      = bc(tariff.badge);

  const kwh     = parseFloat(kwhMonthly)  || 0;
  const nightP  = parseFloat(nightPct)    || 30;
  const dayKwh  = kwh * (1 - nightP / 100);
  const niteKwh = kwh * (nightP / 100);
  const fixedToUse = useEbill && tariff.fixed_ebill != null ? tariff.fixed_ebill : tariff.fixed;

  const calcMonthly = useMemo(() => {
    if (!tariff) return 0;
    if (tariff.type === 'fixed_monthly') return tariff.flat_monthly || 0;
    if (tariff.type === 'dynamic') return parseFloat(manualMonthly) || 0;
    if (tariff.type === 'vnm' || tariff.type === 'variable' || tariff.type === 'fixed') {
      let charge = 0;
      if (tariff.kwh_tier2 && tariff.tier2_threshold) {
        const tier1 = Math.min(kwh, tariff.tier2_threshold);
        const tier2 = Math.max(0, kwh - tariff.tier2_threshold);
        const dayT1 = Math.min(dayKwh, tier1);
        charge = dayT1 * tariff.kwh_day + (dayKwh - dayT1) * tariff.kwh_day + tier2 * tariff.kwh_tier2;
        if (tariff.kwh_night) charge += niteKwh * tariff.kwh_night;
      } else {
        charge = dayKwh * tariff.kwh_day;
        if (tariff.kwh_night) charge += niteKwh * tariff.kwh_night;
        else charge += niteKwh * tariff.kwh_day;
      }
      return fixedToUse + charge + kwh * (ERT + ETMEAR);
    }
    return 0;
  }, [tariff, kwh, dayKwh, niteKwh, fixedToUse, manualMonthly]);

  // Contract countdown
  const contractExpiry = useMemo(() => {
    if (!contractStart || !contractMonths) return null;
    const start = new Date(contractStart);
    const months = parseInt(contractMonths) || 0;
    if (!months) return null;
    const expiry = new Date(start);
    expiry.setMonth(expiry.getMonth() + months);
    const daysLeft = Math.ceil((expiry.getTime() - new Date().getTime()) / 86400000);
    return { date: expiry.toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' }), daysLeft };
  }, [contractStart, contractMonths]);

  // Comparison — all tariffs from all providers
  const allTariffs = useMemo(() => {
    return PROVIDERS.flatMap(p => p.tariffs.map(t => {
      const isCurrent = t.id === tariffId;
      let monthly = 0;
      if (t.type === 'fixed_monthly') {
        monthly = t.flat_monthly || 0;
      } else if (t.type !== 'dynamic') {
        let charge = dayKwh * t.kwh_day;
        if (t.kwh_night) charge += niteKwh * t.kwh_night;
        else charge += niteKwh * t.kwh_day;
        if (t.kwh_tier2 && t.tier2_threshold) {
          const tier1 = Math.min(kwh, t.tier2_threshold);
          const tier2 = Math.max(0, kwh - t.tier2_threshold);
          charge = tier1 * t.kwh_day + tier2 * t.kwh_tier2;
          if (t.kwh_night) charge += niteKwh * t.kwh_night;
        }
        const fixedCost = t.fixed_ebill != null ? t.fixed_ebill : t.fixed;
        monthly = fixedCost + charge + kwh * (ERT + ETMEAR);
      }
      const diff = isCurrent ? 0 : monthly - calcMonthly;
      return { ...t, providerLabel: p.label, monthly, isCurrent, diff };
    })).filter(t => t.type !== 'dynamic')
      .sort((a, b) => a.monthly - b.monthly);
  }, [kwh, dayKwh, niteKwh, calcMonthly, tariffId, segmentFilter]);

  const bestMonthly  = allTariffs[0]?.monthly || 0;
  const savings      = calcMonthly - bestMonthly;

  const secHdr = (label: string, sub?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1, fontFamily: T.font.sans }}>{sub}</div>}
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Ρεύμα</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Τιμολόγια {LAST_UPDATED} — Πηγή: bestenergydeals.gr / ΡΑΑΕΥ</div>
        </div>
        <a href={RAAYEY_URL} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 11, color: 'var(--accent)', background: 'rgba(212,175,66,0.08)', border: '1px solid rgba(212,175,66,0.25)', borderRadius: T.radius.pill, padding: '6px 16px', cursor: 'pointer', textDecoration: 'none', fontFamily: T.font.sans, fontWeight: 600 }}>
          Σύγκριση ΡΑΑΕΥ →
        </a>
      </div>

      {/* ── Contract expiry alert ── */}
      {contractExpiry && contractExpiry.daysLeft <= 60 && (
        <div style={{ marginBottom: 14, background: contractExpiry.daysLeft <= 14 ? 'rgba(197,34,31,0.06)' : 'rgba(242,153,0,0.05)', border: `1px solid ${contractExpiry.daysLeft <= 14 ? 'rgba(197,34,31,0.2)' : 'rgba(242,153,0,0.2)'}`, borderRadius: T.radius.inner, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: contractExpiry.daysLeft <= 14 ? 'var(--negative)' : 'var(--warning)' }}/>
          <span style={{ fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-primary)', fontWeight: 600 }}>
            Σύμβαση ρεύματος λήγει σε {contractExpiry.daysLeft} ημέρες — {contractExpiry.date}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
            Καλό να συγκρίνεις τιμές πριν ανανεώσεις
          </span>
        </div>
      )}

      {/* ── Provider + Tariff + Contract ── */}
      <div style={card}>
        {secHdr('Πάροχος & Τιμολόγιο')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Πάροχος</div>
            <select value={provider} onChange={e => {
              const p = e.target.value; setProvider(p);
              const prov = PROVIDERS.find(x => x.value === p);
              const firstId = prov?.tariffs[0]?.id || '';
              setTariffId(firstId);
              save({ elecProvider: p, elecTariff: firstId });
            }} style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: T.font.sans, outline: 'none', cursor: 'pointer' }}>
              {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Τιμολόγιο</div>
            <select value={tariffId} onChange={e => { setTariffId(e.target.value); save({ elecTariff: e.target.value }); }}
              style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '10px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: T.font.sans, outline: 'none', cursor: 'pointer' }}>
              {providerObj.tariffs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {/* Selected tariff card */}
        <div style={{ background: tariffBc.bg, border: `1px solid ${tariffBc.border}`, borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{tariff.name}</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: tariffBc.color, background: tariffBc.border, padding: '2px 10px', borderRadius: T.radius.pill, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{tariff.badge}</span>
              {tariff.contract_months ? (
                <span style={{ fontSize: 9, color: 'var(--info)', background: 'rgba(26,115,232,0.08)', padding: '2px 10px', borderRadius: T.radius.pill, border: '1px solid rgba(26,115,232,0.2)', fontFamily: T.font.sans }}>
                  {tariff.contract_months} μήνες
                </span>
              ) : (
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', fontFamily: T.font.sans }}>
                  Χωρίς δέσμευση
                </span>
              )}
              {tariff.no_fixed && <span style={{ fontSize: 9, color: 'var(--positive)', background: 'rgba(52,168,83,0.08)', padding: '2px 10px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Χωρίς πάγιο</span>}
              {tariff.smart_meter && <span style={{ fontSize: 9, color: '#8b5cf6', background: 'rgba(139,92,246,0.08)', padding: '2px 10px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Έξυπνος Μετρητής</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: T.font.sans }}>{tariff.desc}</div>
            {tariff.desc.includes('ΜΔΚΑ') && (
              <div style={{ marginTop: 6, background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.18)', borderRadius: T.radius.badge, padding: '6px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--info)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span style={{ fontSize: 10, color: 'var(--info)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                  <strong>ΜΔΚΑ</strong> = Μέσο Μηνιαίο Κόστος Κύκλου Αγοράς. Πρόσθετη χρέωση σε κυμαινόμενα τιμολόγια ("κίτρινα") που αντανακλά τη διακύμανση της τιμής χονδρικής ηλεκτρισμού στην αγορά ενέργειας — αντικαθιστά παλαιότερες ρήτρες αναπροσαρμογής. Ανακοινώνεται κάθε 1η του μήνα από τον πάροχο. <a href="https://compareprices.energy.gov.gr" target="_blank" style={{ color: "var(--info)", fontWeight: 600 }}>ΡΑΑΕΥ →</a>
                </span>
              </div>
            )}
            {tariff.type !== 'dynamic' && tariff.type !== 'fixed_monthly' && (
              <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>
                  Χρέωση ημέρας:{'  '}<strong style={{ color: tariffBc.color }}>{fk(tariff.kwh_day)} / kWh</strong>
                </span>
                {tariff.kwh_night != null && (
                  <span style={{ fontSize: 11, fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>
                    Χρέωση νύχτας:{'  '}<strong style={{ color: tariffBc.color }}>{fk(tariff.kwh_night)} / kWh</strong>
                  </span>
                )}
                {tariff.kwh_tier2 && (
                  <span style={{ fontSize: 11, fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>
                    Άνω των {tariff.tier2_threshold} kWh:{'  '}<strong style={{ color: tariffBc.color }}>{fk(tariff.kwh_tier2)} / kWh</strong>
                  </span>
                )}
                <span style={{ fontSize: 11, fontFamily: T.font.mono, color: 'var(--text-secondary)' }}>
                  Μηνιαίο πάγιο:{'  '}<strong>{tariff.no_fixed ? '0,00 €' : `${fixedToUse.toFixed(2)} € / μήνα`}</strong>
                </span>
              </div>
            )}
          </div>
          <a href={providerObj.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, color: tariffBc.color, border: `1px solid ${tariffBc.border}`, borderRadius: T.radius.pill, padding: '4px 12px', textDecoration: 'none', whiteSpace: 'nowrap' as const, fontFamily: T.font.sans, fontWeight: 600 }}>
            Επίσκεψη →
          </a>
        </div>

        {/* Contract dates + E-bill toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 14, alignItems: 'center' }}>
          <DatePicker
            label="Έναρξη Σύμβασης"
            value={contractStart}
            onChange={v => { setContractStart(v); save({ contractStart: v }); }}
          />
          <CustomSelect label="Διάρκεια Σύμβασης" value={contractMonths}
            onChange={v => { setContractMonths(v); save({ contractMonths: v }); }}
            options={DURATION_OPTIONS}/>
          {contractExpiry && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '9px 12px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 3, fontFamily: T.font.sans }}>Λήξη Σύμβασης</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: contractExpiry.daysLeft <= 60 ? 'var(--warning)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{contractExpiry.date}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{contractExpiry.daysLeft} ημέρες</div>
            </div>
          )}
          {tariff.fixed_ebill != null && (
            <div style={{ paddingTop: 20 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>e-bill</div>
              <input type="checkbox" checked={useEbill} onChange={e => { setUseEbill(e.target.checked); save({ useEbill: e.target.checked }); }}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}/>
            </div>
          )}
        </div>
      </div>

      {/* ── Κατανάλωση + υπολογισμός ── */}
      <div style={card}>
        {secHdr('Κατανάλωση & Εκτιμώμενο Κόστος')}
        <div style={{ display: 'grid', gridTemplateColumns: tariff.kwh_night ? '1fr 1fr 1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <NumberInput label="Μέση Μηνιαία Κατανάλωση (kWh)" value={kwhMonthly} onChange={v => { setKwhMonthly(v); save({ kwhMonthly: v }); }} suffix="kWh" step={10}/>
          {tariff.kwh_night && <NumberInput label="Νυχτερινή Κατανάλωση (%)" value={nightPct} onChange={v => { setNightPct(v); save({ nightPct: v }); }} suffix="%" step={5}/>}
          {tariff.type === 'dynamic' && <NumberInput label="Μηνιαίο Κόστος (€) — Από Λογαριασμό" value={manualMonthly} onChange={v => { setManualMonthly(v); save({ manualMonthly: v }); }} suffix="€" step={1}/>}
        </div>

        {tariff.type !== 'dynamic' && kwh > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Εκτιμώμενο / μήνα', value: fe(calcMonthly),       color: 'var(--accent)' },
              { label: 'Ετήσιο Κόστος',      value: fe(calcMonthly * 12), color: 'var(--text-primary)' },
              { label: 'Κόστος / kWh net',   value: kwh > 0 ? fk(calcMonthly / kwh) : '—', color: 'var(--text-secondary)' },
              { label: 'Εξοικονόμηση vs καλύτερο', value: savings > 0.5 ? `+${fe(savings)}` : '—', color: savings > 0.5 ? 'var(--positive)' : 'var(--text-tertiary)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 14px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: i === 0 ? 20 : 14, fontWeight: 700, color: k.color, fontFamily: T.font.mono, lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* kWh history */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>Ιστορικό Κατανάλωσης — kWh ανά μήνα</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
            {MONTHS_GR.map((m, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: i === currentMonth ? 'var(--accent)' : 'var(--text-tertiary)', marginBottom: 4, fontWeight: i === currentMonth ? 700 : 400, fontFamily: T.font.sans }}>{m}</div>
                <input type="number" value={kwhHistory[i] || ''} placeholder="—"
                  style={histInputStyle(i === currentMonth, hoveredMonth === i)}
                  onMouseEnter={() => setHoveredMonth(i)} onMouseLeave={() => setHoveredMonth(null)}
                  onChange={e => {
                    const h = [...kwhHistory]; h[i] = e.target.value;
                    setKwhHistory(h); save({ kwhHistory: h });
                  }}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Σύγκριση παρόχων ── */}
      {kwh > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap' as const, gap: 10 }}>
            {secHdr('Σύγκριση Όλων των Παρόχων', `Βάσει ${kwh} kWh/μήνα — ${LAST_UPDATED}`)}
            <div style={{ display: 'flex', background: 'var(--bg-base)', borderRadius: T.radius.pill, padding: 3, border: '1px solid var(--border-default)' }}>
              {(['residential', 'business'] as const).map(seg => (
                <button key={seg} onClick={() => setSegmentFilter(seg)}
                  style={{
                    padding: '6px 16px', borderRadius: T.radius.pill, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, fontFamily: T.font.sans,
                    background: segmentFilter === seg ? 'var(--accent)' : 'transparent',
                    color: segmentFilter === seg ? '#1a1a1a' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}>
                  {seg === 'residential' ? 'Οικιακό' : 'Επιχειρηματικό'}
                </button>
              ))}
            </div>
          </div>
          {savings > 1 && (
            <div style={{ background: 'rgba(52,168,83,0.05)', border: '1px solid rgba(52,168,83,0.2)', borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)' }}/>
              <span style={{ fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
                Μπορείς να εξοικονομήσεις <strong style={{ fontFamily: T.font.mono, color: 'var(--positive)' }}>{fe(savings)} / μήνα</strong> ({fe(savings * 12)} / έτος) με το καλύτερο τιμολόγιο
              </span>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>{['Πάροχος','Πρόγραμμα','Τύπος','kWh','Πάγιο','Διάρκεια','Μήνας','Έτος','Διαφορά'].map((h,i) => (
                  <th key={i} style={{ fontSize: 9, color: 'var(--text-secondary)', padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, background: 'var(--bg-elevated)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {allTariffs.slice(0, 20).map((t, i) => {
                  const rowBc   = bc(t.badge);
                  const isBest  = i === 0;
                  const isCur   = t.isCurrent;
                  return (
                    <tr key={t.id} style={{ background: isCur ? 'rgba(212,175,66,0.04)' : isBest ? 'rgba(52,168,83,0.03)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
                        {isCur && <span style={{ fontSize: 7, color: 'var(--accent)', marginRight: 6, fontWeight: 800, textTransform: 'uppercase' as const }}>▶ ΤΡΕΧΟΝ</span>}
                        {!isCur && isBest && <span style={{ fontSize: 7, color: 'var(--positive)', marginRight: 6, fontWeight: 800 }}>★ ΚΑΛΥΤΕΡΟ</span>}
                        {t.providerLabel}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontFamily: T.font.sans }}>{t.name}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: rowBc.color, background: rowBc.border, padding: '2px 8px', borderRadius: T.radius.pill, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{t.badge}</span>
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.font.mono, color: 'var(--text-secondary)', whiteSpace: 'nowrap' as const }}>
                        {t.type === 'fixed_monthly' ? 'all-in' : t.type === 'vnm' ? 'VNM' : `${fk(t.kwh_day)}`}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.font.mono, color: 'var(--text-secondary)', whiteSpace: 'nowrap' as const }}>
                        {t.no_fixed ? '0 €' : `${(t.fixed_ebill != null ? t.fixed_ebill : t.fixed).toFixed(2)} €`}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
                        {t.contract_months ? `${t.contract_months} μήνες` : 'Χωρίς δέσμευση'}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: T.font.mono, color: isBest ? 'var(--positive)' : isCur ? 'var(--accent)' : 'var(--text-primary)', whiteSpace: 'nowrap' as const }}>
                        {t.type === 'dynamic' ? 'Ωριαίο' : fe(t.monthly)}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.font.mono, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' as const }}>
                        {t.type === 'dynamic' ? '—' : fe(t.monthly * 12)}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: T.font.mono, whiteSpace: 'nowrap' as const,
                        color: isCur ? 'var(--text-tertiary)' : t.diff < 0 ? 'var(--positive)' : t.diff > 0 ? 'var(--negative)' : 'var(--text-tertiary)' }}>
                        {isCur ? '—' : t.diff === 0 ? '—' : `${t.diff < 0 ? '' : '+'}${fe(t.diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Smart live hints based on real user data */}
      {(() => {
        // Build personalized smart hints based on what user has entered
        const hints: { text: string; severity: 'info' | 'warning' | 'tip'; action?: string; tab?: string }[] = [];
        const kwhNum   = parseFloat(kwhMonthly) || 0;
        const costNum  = calcMonthly;

        // ── Insurance gap — only if VNM/solar is relevant (cross-tab context) ──
        if (insData && kwhNum > 200) {
          if (!insData.eq) {
            hints.push({ text: 'Η ασφάλειά σου δεν καλύπτει σεισμό. Ελέγξτε τις καλύψεις σας.', severity: 'warning', action: 'Ασφάλεια & Συνδρομές', tab: 'insurance' });
          }
        }

        // ── Κατανάλωση insights ─────────────────────────────────────────────────
        if (kwhNum > 400) {
          const vnmTariff = allTariffs.find(t => t.id === 'heron_ena');
          if (vnmTariff && vnmTariff.monthly < costNum - 5) {
            hints.push({ text: `Με ${kwhNum} kWh/μήνα το VNM (Εικονική Καθαρή Μέτρηση) μπορεί να σου εξοικονομήσει ${((costNum - vnmTariff.monthly)).toFixed(0)}€/μήνα.`, severity: 'tip', action: 'Πάρε Προσφορά', tab: 'electricity' });
          } else {
            hints.push({ text: `Κατανάλωση ${kwhNum} kWh/μήνα — αξίζει σύγκριση με φωτοβολταϊκό ή κοινοτικό VNM.`, severity: 'tip' });
          }
        } else if (kwhNum > 0 && kwhNum < 100) {
          const noFixed = allTariffs.find(t => t.no_fixed && t.type !== 'dynamic');
          if (noFixed && noFixed.monthly < costNum) {
            hints.push({ text: `Χαμηλή κατανάλωση (${kwhNum} kWh). Τιμολόγιο χωρίς πάγιο (${noFixed.providerLabel} ${noFixed.name}) εξοικονομεί ${(costNum - noFixed.monthly).toFixed(0)}€/μήνα.`, severity: 'tip' });
          }
        }

        // ── Contract expiry ─────────────────────────────────────────────────────
        if (contractExpiry && contractExpiry.daysLeft <= 30 && contractExpiry.daysLeft > 0) {
          hints.push({ text: `Η σύμβασή σου λήγει σε ${contractExpiry.daysLeft} ημέρες (${contractExpiry.date}). Σύγκρινε πριν ανανεώσεις.`, severity: 'warning' });
        }

        // ── Dynamic tariff suggestion ───────────────────────────────────────────
        if (tariff.type !== 'dynamic' && kwhNum > 300) {
          hints.push({ text: 'Με έξυπνο μετρητή ΔΕΔΔΗΕ, το δυναμικό (ωριαίο) τιμολόγιο μπορεί να μειώσει το κόστος έως 20% μεταφέροντας χρήση σε ώρες χαμηλής ζήτησης.', severity: 'info' });
        }

        // ── Night tariff suggestion ─────────────────────────────────────────────
        if (!tariff.kwh_night && kwhNum > 150) {
          hints.push({ text: 'Αν χρησιμοποιείς πλυντήριο ή θερμοσίφωνα το βράδυ, τα νυχτερινά τιμολόγια (ΔΕΗ Γ1Ν Πράσινο Νυχτερινό ή myHome EnterTwo) μειώνουν το κόστος έως 35%.', severity: 'tip' });
        }

        if (hints.length === 0) return null;

        const SEV_STYLE = {
          warning: { bg: 'rgba(242,153,0,0.05)', border: 'rgba(242,153,0,0.2)', dot: 'var(--warning)', text: 'var(--warning)' },
          info:    { bg: 'rgba(26,115,232,0.04)', border: 'rgba(26,115,232,0.15)', dot: 'var(--info)', text: 'var(--info)' },
          tip:     { bg: 'rgba(52,168,83,0.04)', border: 'rgba(52,168,83,0.15)', dot: 'var(--positive)', text: 'var(--positive)' },
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {hints.map((h, i) => {
              const s = SEV_STYLE[h.severity];
              return (
                <div key={i} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: T.radius.inner, padding: '10px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 5 }}/>
                  <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                    {h.text}
                  </div>
                  {h.action && h.tab && (
                    <button
                      onClick={() => onNavigateTab?.(h.tab!)}
                      style={{ fontSize: 10, fontWeight: 700, color: s.text, background: 'transparent', border: `1px solid ${s.border}`, borderRadius: T.radius.pill, padding: '4px 12px', cursor: 'pointer', whiteSpace: 'nowrap' as const, fontFamily: T.font.sans }}>
                      {h.action} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}