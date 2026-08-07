'use client';

import { useState, useMemo, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { T, fe, fn, Skeleton, histInputStyle } from '@/components/Theme';
import { monthlyCost, compareTariffs, estimateUsage, type Tariff, type Usage } from '@/lib/energy/tariff';
import { MONTHS_SHORT } from '@/lib/core/months';

const fk = (n: number) => `${fe(n, 4)}`;
// Η ημερομηνία τελευταίου ελέγχου των τιμών.
//
// ΓΙΑΤΙ ΓΡΑΜΜΕΝΗ ΕΔΩ ΚΑΙ ΟΧΙ ΜΕ import ΤΟΥ JSON: ένα `import ... from '.json'`
// σε module scope, μέσα σε αρχείο που φορτώνεται σε ΚΑΘΕ άνοιγμα του πίνακα
// ελέγχου, είναι εξάρτηση από τον τρόπο που ο bundler κάνει interop τα JSON. Αν
// αστοχήσει, δεν σκάει μια οθόνη: δεν φορτώνει ΟΛΗ η εφαρμογή, επειδή το
// σφάλμα συμβαίνει πριν καν αποδοθεί τίποτα. Δεν αξίζει τέτοιο ρίσκο για μια
// ετικέτα ημερομηνίας.
//
// Η συνέπεια με το data/price-sources.json, που είναι η πηγή αλήθειας για το
// workflow φρεσκάδας, φυλάσσεται από test: αν αποκλίνουν, κοκκινίζει το CI.
const LAST_UPDATED = 'Ιούλιος 2026';
const RAAYEY_URL  = 'https://energycost.gr/%CF%85%CF%80%CE%BF%CE%BB%CE%BF%CE%B3%CE%B9%CF%83%CE%BC%CF%8C%CF%82-%CF%84%CE%B9%CE%BC%CE%AE%CF%82-%CE%B2%CE%AC%CF%83%CE%B5%CE%B9-%CE%BA%CE%B1%CF%84%CE%B1%CE%BD%CE%AC%CE%BB%CF%89%CF%83%CE%B7%CF%82-2/';
// Ο υπολογισμός κόστους ζει σε ένα σημείο, με tests. Δείτε lib/energy/tariff.ts
// για τον λόγο: εδώ υπήρχαν δύο διαφορετικοί τύποι για το ίδιο νούμερο.


// ── CONTRACT DURATION OPTIONS ─────────────────────────────────────────────────
const DURATION_OPTIONS = [
  { value: '',    label: 'Χωρίς δέσμευση' },
  { value: '12',  label: '12 μήνες'        },
  { value: '18',  label: '18 μήνες'        },
  { value: '24',  label: '24 μήνες'        },
  { value: '36',  label: '36 μήνες'        },
];

// ── REAL TARIFFS, SOURCE: bestenergydeals.gr / pricefox.gr / Selectra (June–July 2026) ──
// Τα πεδία που χρειάζεται ο ΥΠΟΛΟΓΙΣΜΟΣ ζουν στο lib/energy/tariff.ts. Εδώ
// προστίθενται μόνο όσα χρειάζεται η ΟΘΟΝΗ. Έτσι, όποιος αλλάξει τον τρόπο
// χρέωσης το κάνει σε ένα αρχείο που έχει tests, όχι μέσα σε ένα component.
// ΤΟ `as unknown as LocalTariff[]` ΗΤΑΝ ΓΡΑΜΜΕΝΟ ΕΝΤΕΚΑ ΦΟΡΕΣ, μία ανά πάροχο.
// Ο κανόνας του έργου το απαγορεύει, και εδώ δεν έκρυβε καν λάθος δεδομένα:
// έκρυβε ότι ο κατάλογος ΔΕΝ ελεγχόταν καθόλου. Ένα τιμολόγιο με λάθος όνομα
// πεδίου (`kwh_tier_2` αντί `kwh_tier2`) ή με ξεχασμένο `vat` θα περνούσε τη
// μεταγλώττιση και θα έβγαζε λάθος σύγκριση κόστους στην οθόνη του ιδιοκτήτη.
// Με δηλωμένο τύπο στο ίδιο το PROVIDERS, κάθε ένα από τα εκατόν είκοσι
// τιμολόγια ελέγχεται πεδίο προς πεδίο.
interface ProviderGroup { value: string; label: string; url: string; tariffs: LocalTariff[] }

interface LocalTariff extends Tariff {
  desc: string;
  contract_months?: number;
  no_fixed?: boolean;
  smart_meter?: boolean;
  discount_ebill?: number;
  dynamic?: boolean;
  student?: boolean;
}

const PROVIDERS: ProviderGroup[] = [
  {
    value: 'dei', label: 'ΔΕΗ', url: 'https://www.dei.gr',
    tariffs: [
      // FIX: πάγιο myHome Enter αναπροσαρμόστηκε 5,00€ → 7,50€ (επιβεβαιωμένο, Ιούλιος 2026)
      { id: 'dei_enter',        name: 'myHome Enter',           badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1450, kwh_night: null,   fixed: 7.50, fixed_ebill: 3.50, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μήνες. Πάγιο 7.50 € (3.50 € με e-bill + πάγια εντολή).' },
      // FIX: πάγιο myHome EnterTwo αναπροσαρμόστηκε → 9,00€ (επιβεβαιωμένο, Ιούλιος 2026)
      { id: 'dei_entertwo',     name: 'myHome EnterTwo',        badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1450, kwh_night: 0.0950, fixed: 9.00, fixed_ebill: 3.50, contract_months: 24, vat: 6, segment: 'residential', desc: 'Σταθερό 24 μήνες με νυχτερινή ζώνη (23:00-07:00). Ιδανικό για πλυντήρια, θερμοσίφωνα.' },
      { id: 'dei_online',       name: 'myHome Online',          badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1420, kwh_night: null,   fixed: 5.00, fixed_ebill: 3.50, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό online-only 12 μήνες. Χαμηλότερη τιμή με e-bill + πάγια εντολή.' },
      // FIX: κλιμάκια myHome Maxima αναπροσαρμόστηκαν 0.132/0.122 → 0.141/0.129 (επιβεβαιωμένο, Ιούλιος 2026)
      { id: 'dei_maxima',       name: 'myHome Maxima',          badge: 'ΜΠΛΕ',    type: 'fixed',         kwh_day: 0.1410, kwh_night: null,   kwh_tier2: 0.1290, tier2_threshold: 600, fixed: 5.00, fixed_ebill: 3.50, contract_months: 12, vat: 6, segment: 'residential', desc: 'Κλιμακωτό: 0.141 € (0-600 kWh), 0.129 € (>600 kWh). Συμφέρει για υψηλή κατανάλωση.' },
      { id: 'dei_plan',         name: 'myHome Plan',            badge: 'ΜΠΛΕ',    type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 60.00, fixed: 0, contract_months: 12, vat: 6, segment: 'residential', desc: 'Flat 60 €/μήνα all-in. Ιδανικό για 2.500-4.500 kWh/έτος.' },
      { id: 'dei_4all',         name: 'myHome 4All',            badge: 'ΚΙΤΡΙΝΟ', type: 'variable',      kwh_day: 0.1370, kwh_night: null,   kwh_tier2: 0.1870, tier2_threshold: 500, fixed: 5.00, fixed_ebill: 3.50, contract_months: 0, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. 0.137 € (0-500 kWh) / 0.187 € (>500 kWh). Χωρίς δέσμευση.' },
      { id: 'dei_4students',    name: 'myHome 4Students',       badge: 'ΚΙΤΡΙΝΟ', type: 'variable',      kwh_day: 0.1290, kwh_night: null,   kwh_tier2: 0.1850, tier2_threshold: 150, fixed: 3.00, fixed_ebill: 0, contract_months: 0, vat: 6, segment: 'residential', student: true, desc: 'Φοιτητικό: 0.129 € (0-150 kWh) / 0.185 € (>150 kWh). Πάγιο 3 €. Bonus καλοκαίρι.' },
      { id: 'dei_prasino',      name: 'Γ1 Πράσινο',            badge: 'ΠΡΑΣΙΝΟ', type: 'variable',      kwh_day: 0.1440, kwh_night: null,   fixed: 5.00, fixed_ebill: 3.50, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ειδικό Οικιακό (Γ1), κυμαινόμενο. Ανακοινώνεται κάθε 1η του μήνα.' },
      { id: 'dei_prasino_n',    name: 'Γ1Ν Πράσινο Νυχτερινό', badge: 'ΠΡΑΣΙΝΟ', type: 'variable',      kwh_day: 0.1440, kwh_night: 0.1160, fixed: 5.00, fixed_ebill: 3.50, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ειδικό με νυχτερινή ζώνη. Ανακοινώνεται κάθε 1η του μήνα.' },
      { id: 'dei_dynamic',      name: 'myHome Dynamic',         badge: 'ΔΥΝΑΜΙΚΟ',type: 'dynamic',       kwh_day: 0, kwh_night: null, fixed: 5.00, smart_meter: true, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ωριαία τιμολόγηση βάσει χονδρεμπορικής (HEnEx). Απαιτεί έξυπνο μετρητή ΔΕΔΔΗΕ.' },
      // ── Επαγγελματικά (Γ21/Γ22) ────────────────────────────────────────
      { id: 'dei_biz_enter',   name: 'myBusiness Enter',       badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1510, kwh_night: null, flat_monthly: null, fixed: 6.00, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'business', desc: 'Σταθερό επαγγελματικό. Πάγια εντολή υποχρεωτική.' },
      { id: 'dei_biz_4all',    name: 'myBusiness 4ALL',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.16366, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'business', desc: 'Κυμαινόμενο επαγγελματικό χωρίς δέσμευση.' },
      { id: 'dei_biz_g21',     name: 'Γ21 Επαγγελματικό',      badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.16417, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'business', desc: 'Ειδικό κοινό τιμολόγιο Γ21 (kVA≤25). Ανακοινώνεται 1η του μήνα.' },
    ],
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
      { id: 'heron_yellow_student', name: 'Yellow Free Student',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0840,  kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 12, no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', student: true, desc: 'Φοιτητικό. Χωρίς πάγιο. Δώρο 20€. Απαιτείται φοιτητική ταυτότητα ή ΑΜΚΑ.' },
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
    ],
  },

  {
    value: 'protergia', label: 'Protergia', url: 'https://www.protergia.gr',
    tariffs: [
      { id: 'prot_flow',        name: 'Value Flow',             badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.13767, kwh_night: null,  fixed: 5.00, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο, φθηνότερο της Protergia. Χωρίς δέσμευση.' },
      { id: 'prot_sure_18',     name: 'Value Sure 18M 2.0',     badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1450, kwh_night: null,  fixed: 5.00, contract_months: 18, vat: 6, segment: 'residential', desc: 'Σταθερό 18 μήνες. Κλειδωμένη τιμή μακροπρόθεσμα.' },
      { id: 'prot_sure_12',     name: 'Value Sure 12M',         badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1520, kwh_night: null,  fixed: 5.00, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μήνες.' },
      { id: 'prot_standard',    name: 'Value Standard',         badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1590, kwh_night: null,  fixed: 5.00, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο ειδικό. Ανακοινώνεται κάθε 1η μήνα.' },
      { id: 'prot_lite2',       name: 'Value Lite 2.0',         badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.16267, kwh_night: null, fixed: 0,    no_fixed: true, contract_months: 0, vat: 6, segment: 'residential', desc: 'Χωρίς πάγιο. Ιδανικό για σπάνια χρήση ή εξοχικά.' },
      { id: 'prot_dynamic',     name: 'Dynamic One Home',       badge: 'ΔΥΝΑΜΙΚΟ',type: 'dynamic',  kwh_day: 0,      kwh_night: null, fixed: 0,    smart_meter: true, contract_months: 0, vat: 6, segment: 'residential', desc: 'Ωριαία δυναμική τιμολόγηση. Ενεργοποιήθηκε Ιούνιο 2026.' },
      // ── Picasso 2.0, ΟΛΑ τα 9 πακέτα + Φοιτητικό ────────────────────────
      // FIX: πριν υπήρχαν μόνο 3/9 πακέτα, με λάθος segment:'business' (το Picasso
      // είναι οικιακό προϊόν) και type:'flat' που δεν υπολογιζόταν καθόλου σωστά.
      // Επιβεβαιωμένο: Protergia Picasso, Προϊόν Χρονιάς 2026, μπλε/σταθερό,
      // 12μηνη σύμβαση, 5% δωρεάν ανοχή υπέρβασης, υπέρβαση 0,169€/kWh,
      // ετήσια εκκαθάριση μέσω ΔΕΔΔΗΕ. (Πηγή: Selectra, protergia.gr, επιβεβαιωμένο screenshot)
      { id: 'prot_picasso_s1', name: 'Picasso Small, 1.325 kWh/έτος',  badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 39.90,  flat_annual_kwh: 1325,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για 1-2 άτομα, χαμηλές ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_s2', name: 'Picasso Small, 1.875 kWh/έτος',  badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 49.90,  flat_annual_kwh: 1875,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για 1-2 άτομα, χαμηλές ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_s3', name: 'Picasso Small, 2.700 kWh/έτος',  badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 64.90,  flat_annual_kwh: 2700,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για 1-2 άτομα, χαμηλές ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_m1', name: 'Picasso Medium, 3.550 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 82.90,  flat_annual_kwh: 3550,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για οικογένειες μέσου όρου κατανάλωσης. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_m2', name: 'Picasso Medium, 4.600 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 102.90, flat_annual_kwh: 4600,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για οικογένειες μέσου όρου κατανάλωσης. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_m3', name: 'Picasso Medium, 6.000 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 134.90, flat_annual_kwh: 6000,  flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για οικογένειες μέσου όρου κατανάλωσης. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_l1', name: 'Picasso Large, 11.000 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 259.90, flat_annual_kwh: 11000, flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για μεγάλες οικογένειες με αυξημένες ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_l2', name: 'Picasso Large, 15.300 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 359.90, flat_annual_kwh: 15300, flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για μεγάλες οικογένειες με αυξημένες ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_l3', name: 'Picasso Large, 20.200 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 479.90, flat_annual_kwh: 20200, flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Για μεγάλες οικογένειες με αυξημένες ανάγκες. Δώρο 5% επιπλέον kWh.' },
      { id: 'prot_picasso_student', name: 'Picasso Student', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 39.90, flat_annual_kwh: 1325, flat_overage_rate: 0.169, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', student: true, desc: 'Ίδιο πακέτο με Picasso Small, αποκλειστικά για φοιτητές. Απαιτείται φοιτητική ταυτότητα.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'prot_simple_biz1',  name: 'Value Simple Επαγγελματικό 1', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.14700, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Φθηνότερο κυμαινόμενο επαγγελματικό στην αγορά.' },
      { id: 'prot_sure_biz1',    name: 'Value Sure Επαγγελματικό 1',   badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1699,  kwh_night: null, flat_monthly: null, fixed: 13.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό 12μηνο επαγγελματικό.' },
      { id: 'prot_sure_biz2',    name: 'Value Sure Επαγγελματικό 2',   badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1999,  kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 12, no_fixed: true,  dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό χωρίς πάγιο. Ιδανικό για μικρή κατανάλωση.' },
    ],
  },
  {
    value: 'nrg', label: 'NRG', url: 'https://www.nrg.gr',
    tariffs: [
      { id: 'nrg_now',          name: 'NRG Now Οικιακό',        badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1595, kwh_night: null, fixed: 6.90, contract_months: 0,  vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Χωρίς δέσμευση.' },
      { id: 'nrg_adjust',       name: 'NRG adjust 1.0',         badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1580, kwh_night: null, fixed: 9.90, contract_months: 12, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μήνες. Τελευταία γνωστή τιμή, η NRG έχει ανανεώσει τη γκάμα προγραμμάτων, χρειάζεται νέα επιβεβαίωση.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'nrg_adjust_biz',  name: 'adjust 1.0 Business',    badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1580, kwh_night: null, flat_monthly: null, fixed: 13.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό επαγγελματικό χωρίς ρήτρα.' },
      { id: 'nrg_simple_biz',  name: 'simple 1.0 Business 1',  badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1790, kwh_night: null, flat_monthly: null, fixed: 9.90,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Κυμαινόμενο επαγγελματικό.' },
    ],
  },
  {
    value: 'zenith', label: 'Zenith', url: 'https://www.zenith.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'zen_fixed_1y',  name: 'Power Home Fixed 1Y',     badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1290, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό 12 μηνών. Έκπτωση Συνέπειας από τον 1ο λογαριασμό. Δώρο κάρτα υγείας Ευ Ζην 150€.' },
      { id: 'zen_fixed_24',  name: 'Power Home Fixed 24',     badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1350, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 24, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό 24 μηνών, κλειδωμένη τιμή 2 χρόνια. Δώρο κάρτα υγείας Ευ Ζην 150€.' },
      { id: 'zen_pair',      name: 'Power Home Pair',         badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1380, kwh_night: null, flat_monthly: null, fixed: 11.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Dual fuel, ρεύμα και φυσικό αέριο μαζί. Έκπτωση παγίου.' },
      { id: 'zen_sure_plus', name: 'Power Home Sure Plus',    badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1450, kwh_night: null, flat_monthly: null, fixed: 9.90,  fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό πρόγραμμα ασφαλείας.' },
      { id: 'zen_select',    name: 'Power Home Select',       badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1490, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Κίτρινο κυμαινόμενο. Χωρίς δέσμευση.' },
      { id: 'zen_save30',    name: 'Power Home Save 3.0',     badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1530, kwh_night: null, flat_monthly: null, fixed: 4.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Κίτρινο κυμαινόμενο χαμηλό πάγιο.' },
      { id: 'zen_light',     name: 'Power Home Light',        badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1560, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 0,  no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', desc: 'Χαμηλό πάγιο. Ιδανικό χαμηλή κατανάλωση.' },
      // FIX: τιμή αναπροσαρμόστηκε 0.1450 → 0.095 (επιβεβαιωμένο, Ιούνιος 2026), ισχύει για τις πρώτες 200 kWh/μήνα
      { id: 'zen_student',   name: 'Power Home Student',      badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0950, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 0,  no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', student: true, desc: 'Φοιτητικό. Τιμή 0.095€/kWh για τις πρώτες 200 kWh/μήνα, πάνω από αυτό ισχύει διαφορετική τιμή, επιβεβαίωσε στο zenith.gr πριν την ένταξη. Απαιτείται φοιτητική ταυτότητα.' },
      { id: 'zen_start',     name: 'Power Home Start (Ειδικό)', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1988, kwh_night: null, flat_monthly: null, fixed: 6.80, fixed_ebill: null, contract_months: 0, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Ανακοινώνεται κάθε 1η του μήνα.' },
      // ── ZeΝergy, all-in πακέτα, ΟΛΑ τα 5 μεγέθη ─────────────────────────
      // FIX: πριν υπήρχε μόνο 1 πακέτο (49€). Επιβεβαιωμένο 5μελές σύστημα.
      // Ακριβή όρια kWh επιβεβαιωμένα μόνο για XS και XL, για S/M/L δες zenith.gr.
      { id: 'zen_zenergy_xs', name: 'ZeΝergy XS, έως 2.000 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 49.00,  flat_annual_kwh: 2000, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Μικρό μέγεθος κατανάλωσης.' },
      { id: 'zen_zenergy_s',  name: 'ZeΝergy S',                       badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 69.00,  fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Ακριβές όριο κατανάλωσης: δες zenith.gr.' },
      { id: 'zen_zenergy_m',  name: 'ZeΝergy M',                       badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 90.00,  fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Ακριβές όριο κατανάλωσης: δες zenith.gr.' },
      { id: 'zen_zenergy_l',  name: 'ZeΝergy L',                       badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 137.00, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Ακριβές όριο κατανάλωσης: δες zenith.gr.' },
      { id: 'zen_zenergy_xl', name: 'ZeΝergy XL, έως 12.000 kWh/έτος',badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 262.00, flat_annual_kwh: 12000, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'All-in σταθερό μηνιαίο. Μεγάλο μέγεθος κατανάλωσης.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'zen_biz_start', name: 'Power Business Start',    badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.2090, kwh_night: null, flat_monthly: null, fixed: 1.00, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Ειδικό επαγγελματικό. Χαμηλό πάγιο, ετήσια δέσμευση.' },
    ],
  },
  {
    value: 'elin', label: 'Elin', url: 'https://energy.elin.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'elin_power_green', name: 'Power On! Home Green',  badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1640, kwh_night: null, flat_monthly: null, fixed: 7.10, fixed_ebill: null, contract_months: 0, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Δημοσιεύεται την 1η κάθε μήνα.' },
      { id: 'elin_blue',        name: 'Home Blue Fixed',       badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1480, kwh_night: null, flat_monthly: null, fixed: 9.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό 12μηνο.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'elin_biz_green',   name: 'Business Green',        badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.16587, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Ειδικό επαγγελματικό Γ21.' },
    ],
  },
  {
    value: 'volton', label: 'Volton', url: 'https://volton.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'volton_green',    name: 'Volton Green Ειδικό',   badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1861, kwh_night: null, flat_monthly: null, fixed: 0,    fixed_ebill: null, contract_months: 0,  no_fixed: true,  dynamic: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Μηδενική εγγύηση. Ανακοινώνεται 1η μήνα.' },
      { id: 'volton_blue',     name: 'Volton Blue Flat 18M',  badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1520, kwh_night: null, flat_monthly: null, fixed: 9.90, fixed_ebill: null, contract_months: 18, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό 18 μηνών με έκπτωση συνέπειας. Καλοκαιρινή προσφορά Ιούν-Αύγ: -15% (~0.129€/kWh), επιβεβαίωσε τρέχουσα εποχιακή τιμή στο volton.gr.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'volton_yellow_biz', name: 'Yellow Simple Business', badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.14078, kwh_night: null, flat_monthly: null, fixed: 6.90, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Κυμαινόμενο επαγγελματικό.' },
      { id: 'volton_blue_biz',   name: 'Blue Flat 18M Business', badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1590,  kwh_night: null, flat_monthly: null, fixed: 9.90, fixed_ebill: null, contract_months: 18, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό 18μηνο επαγγελματικό.' },
      { id: 'volton_green_biz',  name: 'Green Ειδικό Business',  badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1863,  kwh_night: null, flat_monthly: null, fixed: 4.90, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Ειδικό Γ21 επαγγελματικό.' },
    ],
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
      { id: 'enrw_night',       name: 'Reward Night Saver',     badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1400, kwh_night: 0.0650, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Νέο διζωνικό κυμαινόμενο. Ιδανικό θερμοσίφωνα/πλυντήρια το βράδυ.' },
      { id: 'enrw_special',     name: 'Ειδικό Οικιακό',         badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1590, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', kwh_tier2: 0.21550, tier2_threshold: 100, desc: 'Ειδικό Γ1. 0.159€ πρώτες 100kWh, 0.2155€ άνω.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'enrw_saver_biz',   name: 'Reward Saver Business',  badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1490, kwh_night: null, flat_monthly: null, fixed: 0,     fixed_ebill: null, contract_months: 0,  no_fixed: true,  dynamic: false, vat: 24, segment: 'business', desc: 'Φθηνότερο κυμαινόμενο επαγγελματικό.' },
      { id: 'enrw_stable_biz',  name: 'Reward Stable for Business Γ21', badge: 'ΜΠΛΕ', type: 'fixed', kwh_day: 0.1690, kwh_night: null, flat_monthly: null, fixed: 12.90, fixed_ebill: null, contract_months: 18, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό επαγγελματικό 18μηνο.' },
      { id: 'enrw_special_biz', name: 'Ειδικό Επιχειρήσεις Γ21', badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1590, kwh_night: null, flat_monthly: null, fixed: 5.00, fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Ειδικό Γ21 επαγγελματικό.' },
      // ── My Wave Daily Business, ΟΛΑ τα 5 μεγέθη ─────────────────────────
      // FIX: πριν υπήρχε μόνο 1 μη-ρεαλιστικό πακέτο (65€, καμία αντιστοιχία).
      // Επιβεβαιωμένο πλήρες σύστημα 5 μεγεθών με ημερήσια χρέωση, ετήσιο όριο kWh
      // και ακριβή τιμή υπέρβασης ανά μέγεθος. Μηνιαίο = ημερήσια τιμή × 30.
      { id: 'enrw_wave_1',   name: 'My Wave Daily 1€/ημέρα, έως 1.920 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 30.00, flat_annual_kwh: 1920,  flat_overage_rate: 0.239, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Συνδρομητικό 1€/ημέρα (≈30€/μήνα). Υπέρβαση 0.239€/kWh.' },
      { id: 'enrw_wave_15',  name: 'My Wave Daily 1,5€/ημέρα, έως 3.000 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 45.00, flat_annual_kwh: 3000,  flat_overage_rate: 0.229, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Συνδρομητικό 1,5€/ημέρα (≈45€/μήνα). Υπέρβαση 0.229€/kWh.' },
      { id: 'enrw_wave_2',   name: 'My Wave Daily 2€/ημέρα, έως 4.200 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 60.00, flat_annual_kwh: 4200,  flat_overage_rate: 0.219, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Συνδρομητικό 2€/ημέρα (≈60€/μήνα). Υπέρβαση 0.219€/kWh.' },
      { id: 'enrw_wave_25',  name: 'My Wave Daily 2,5€/ημέρα, έως 5.400 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 75.00, flat_annual_kwh: 5400,  flat_overage_rate: 0.209, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Συνδρομητικό 2,5€/ημέρα (≈75€/μήνα). Υπέρβαση 0.209€/kWh.' },
      { id: 'enrw_wave_3',   name: 'My Wave Daily 3€/ημέρα, έως 6.600 kWh/έτος', badge: 'FLAT', type: 'fixed_monthly', kwh_day: 0, kwh_night: null, flat_monthly: 90.00, flat_annual_kwh: 6600,  flat_overage_rate: 0.199, fixed: 0, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Συνδρομητικό 3€/ημέρα (≈90€/μήνα). Υπέρβαση 0.199€/kWh.' },
    ],
  },
  {
    value: 'wattvolt', label: 'Watt+Volt (πλέον Protergia)', url: 'https://www.protergia.gr',
    tariffs: [
      // ── Οικιακά ────────────────────────────────────────────────────────
      { id: 'wv_home_standard', name: 'Home Standard',          badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1480, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο βασικό (+ ΜΔΚΑ). Χωρίς δέσμευση. Επιβεβαίωσε τρέχουσα τιμή στο watt-volt.gr.' },
      { id: 'wv_home_blue',     name: 'Home Blue Σταθερό 12M',  badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1450, kwh_night: null, flat_monthly: null, fixed: 9.90,  fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Σταθερό 12μηνο. Τελευταία γνωστή ένδειξη, επιβεβαίωσε τρέχουσα τιμή/όρους.' },
      { id: 'wv_home_special',  name: 'Home Ειδικό (Γ1)',       badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1650, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Ανακοινώνεται κάθε 1η του μήνα.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'wv_biz_standard',  name: 'Business Standard',      badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.1520, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Κυμαινόμενο επαγγελματικό (Γ21). Επιβεβαίωσε τρέχουσα τιμή.' },
      { id: 'wv_biz_blue',      name: 'Business Blue Σταθερό',  badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1590, kwh_night: null, flat_monthly: null, fixed: 12.90, fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό 12μηνο επαγγελματικό.' },
    ],
  },
  {
    value: 'eunice', label: 'Eunice Power', url: 'https://eunice-power.gr',
    tariffs: [
      // ── Οικιακά (100% καθαρή ενέργεια από ΑΠΕ) ─────────────────────────
      { id: 'eun_home_core',    name: 'Home Core',              badge: 'ΚΙΤΡΙΝΟ', type: 'variable', kwh_day: 0.0980, kwh_night: null, flat_monthly: null, fixed: 7.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: '100% καθαρή ενέργεια. Τιμή 0.098€/kWh (+ ΜΔΚΑ) με έκπτωση συνέπειας. Πάγιο 7€.' },
      { id: 'eun_home_special', name: 'Ειδικό Τιμολόγιο Home',  badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.1600, kwh_night: null, flat_monthly: null, fixed: 5.00,  fixed_ebill: null, contract_months: 0,  no_fixed: false, dynamic: false, vat: 6, segment: 'residential', desc: 'Ειδικό Γ1. Ανακοινώνεται κάθε 1η του μήνα.' },
      // ── Επαγγελματικά ──────────────────────────────────────────────────
      { id: 'eun_biz_secure',   name: 'Small Business Secure',  badge: 'ΜΠΛΕ',    type: 'fixed',    kwh_day: 0.1650, kwh_night: null, flat_monthly: null, fixed: 4.00,  fixed_ebill: null, contract_months: 12, no_fixed: false, dynamic: false, vat: 24, segment: 'business', desc: 'Σταθερό επαγγελματικό μικρής επιχείρησης. Πάγιο 4€.' },
    ],
  },
  {
    value: 'fysiko_aerio', label: 'Φυσικό Αέριο Ελλάδος', url: 'https://www.fysikoaerioellados.gr',
    tariffs: [
      { id: 'fa_oikia',         name: 'Oikia Green',            badge: 'ΠΡΑΣΙΝΟ', type: 'variable', kwh_day: 0.14265, kwh_night: null, fixed: 5.00, contract_months: 0, vat: 6, segment: 'residential', desc: 'Κυμαινόμενο. Ανακοινώνεται κάθε 1η μήνα.' },
    ],
  },
];

const BADGE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  'ΠΡΑΣΙΝΟ':  { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' },
  'ΚΙΤΡΙΝΟ':  { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' },
  'ΜΠΛΕ':     { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' },
  'VNM':      { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' },
  'ΔΥΝΑΜΙΚΟ': { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' },
  // FIX: 'FLAT' badge δεν είχε χρώμα, έπεφτε στο γκρι fallback. Τώρα distinct teal.
  'FLAT':     { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' },
};
const bc = (badge: string) => BADGE_COLORS[badge] || { bg: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: 'var(--border-subtle)' };

const ELEC_DEFAULTS = {
  elecProvider: 'dei', elecTariff: 'dei_enter', useEbill: true,
  kwhMonthly: '250', nightPct: '30', kwhHistory: Array(12).fill(''),
  contractStart: '', contractMonths: '', manualMonthly: '',
};

// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΥΓΚΡΙΣΗ ΩΣ ΕΙΔΟΠΟΙΗΣΗ, ΟΧΙ ΩΣ ΚΑΡΤΕΛΑ.
//
// Ο ιδιοκτήτης δεν ανοίγει καρτέλα «σύγκριση παρόχων» — δεν ξύπνησε το πρωί
// θέλοντας να συγκρίνει τιμολόγια. Θέλει να του πουν, μία φορά, ότι πληρώνει
// παραπάνω. Αυτή η συνάρτηση απαντά ΜΟΝΟ όταν υπάρχει πραγματική διαφορά πάνω
// σε ΠΡΑΓΜΑΤΙΚΗ κατανάλωση: αν δεν ξέρουμε πόσες κιλοβατώρες καίει (ούτε από
// ιστορικό, ούτε από τους λογαριασμούς του), επιστρέφει null. Σύγκριση πάνω σε
// μαντεψιά είναι χειρότερη από καμία σύγκριση: οδηγεί σε αλλαγή παρόχου με
// λάθος κριτήριο.
// ═══════════════════════════════════════════════════════════════════════════

/** Το ελάχιστο μηνιαίο όφελος που αξίζει να διακόψει τον χρήστη. */
const SWITCH_NOISE = 5;

export interface SwitchFinding {
  /** Τι πληρώνει σήμερα, τον μήνα. */
  current: number;
  /** Τι θα πλήρωνε με την καλύτερη εναλλακτική. */
  best: number;
  /** Πάντα θετικό: πόσα τον μήνα. */
  savingsMonthly: number;
  /** Πώς λέγεται η εναλλακτική («ΔΕΗ myHome Enter»). */
  bestLabel: string;
  /** Πάνω σε τι στηρίζεται το νούμερο, με τα λόγια του χρήστη. */
  basedOn: string;
}

export function electricitySwitchFinding(
  s: Record<string, unknown> | null | undefined,
  billsKwh: number[],
): SwitchFinding | null {
  if (!s) return null;
  const usageEst = estimateUsage(
    (s.kwhHistory as string[]) ?? [], billsKwh, parseFloat(String(s.kwhMonthly ?? '')),
  );
  // Χωρίς αξιόπιστη κατανάλωση, καμία ειδοποίηση.
  if (usageEst.source === 'unknown' || !usageEst.reliable) return null;

  const providerObj = PROVIDERS.find(p => p.value === (s.elecProvider ?? 'dei')) || PROVIDERS[0];
  const tariff = providerObj.tariffs.find(t => t.id === s.elecTariff) || providerObj.tariffs[0];
  if (!tariff) return null;

  const usage: Usage = {
    kwhMonthly: usageEst.kwhMonthly,
    nightPct: parseFloat(String(s.nightPct ?? '')) || 30,
    ebill: s.useEbill === undefined ? true : Boolean(s.useEbill),
    manualMonthly: parseFloat(String(s.manualMonthly ?? '')) || 0,
  };
  const current = monthlyCost(tariff as Tariff, usage).total;

  const ranked = compareTariffs(
    PROVIDERS.flatMap(p => p.tariffs.map(t => ({ ...t, providerLabel: p.label }))) as (LocalTariff & { providerLabel: string })[],
    usage, tariff.id, current,
  ).filter(r => r.tariff.segment === tariff.segment);

  const best = ranked[0];
  if (!best || best.isCurrent) return null;
  const savings = current - best.cost.total;
  if (!(savings >= SWITCH_NOISE)) return null;

  return {
    current, best: best.cost.total, savingsMonthly: savings,
    bestLabel: `${best.tariff.providerLabel} ${best.tariff.name}`,
    basedOn: usageEst.source === 'history'
      ? `${usageEst.kwhMonthly} kWh τον μήνα, από το ιστορικό σου`
      : usageEst.source === 'bills'
      ? `${usageEst.kwhMonthly} kWh τον μήνα, από τους λογαριασμούς σου`
      : `${usageEst.kwhMonthly} kWh τον μήνα`,
  };
}

export default function BillsElectricity({ propertyId, userId, onNavigateTab }: { propertyId: string; userId?: string; onNavigateTab?: (tab: string) => void }) {
  const supabase   = createClient();
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties   = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 };
  const currentMonth = new Date().getMonth();
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

  // Το τρίτο στοιχείο (loading) αγνοούνταν: η καρτέλα «Ρεύμα» εμφάνιζε τα
  // ELEC_DEFAULTS (ΔΕΗ, 250 kWh) σαν να ήταν τα αποθηκευμένα στοιχεία του χρήστη και
  // μετά τα αντικαθιστούσε σιωπηλά — ο χρήστης προλάβαινε να διαβάσει λάθος κόστος.
  const [s, su, loading] = useBillsSettings(propertyId, userId || '', 'electricity', ELEC_DEFAULTS);

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
  // Κιλοβατώρες από τους ΠΡΑΓΜΑΤΙΚΟΥΣ λογαριασμούς του χρήστη. Η στήλη bills.kwh
  // υπήρχε από την αρχή και δεν τη ρωτούσε κανείς: η σύγκριση έτρεχε πάνω σε
  // προεπιλογή 250 κιλοβατώρες, δηλαδή πάνω σε κατανάλωση κάποιου άλλου.
  const [billsKwh,         setBillsKwh]         = useState<number[]>([]);

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
        if (data?.data) { const d = data.data as Record<string, unknown>; setInsData({ eq: !!d.insCustomEarthquake, fl: !!d.insCustomFlood }); }
      } catch (_) {}
    })();
  }, [propertyId]);

  // Οι δικές του κιλοβατώρες, από τους δικούς του λογαριασμούς ρεύματος.
  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        const { data } = await supabase.from('bills')
          .select('kwh,created_at').eq('property_id', propertyId).eq('category', 'electricity')
          .not('kwh', 'is', null).order('created_at', { ascending: false }).limit(12);
        setBillsKwh((data ?? []).map(b => Number((b as { kwh?: number }).kwh)).filter(n => Number.isFinite(n) && n > 0));
      } catch (_) {}
    })();
  }, [propertyId]);

  const save = (patch: Record<string, unknown>) => su({ elecProvider: provider, elecTariff: tariffId, useEbill, kwhMonthly, nightPct, kwhHistory, contractStart, contractMonths, manualMonthly, ...patch });

  // Derived
  const providerObj   = PROVIDERS.find(p => p.value === provider) || PROVIDERS[0];
  const tariffOptions = providerObj.tariffs.map(t => ({ value: t.id, label: t.name }));
  const tariff        = providerObj.tariffs.find(t => t.id === tariffId) || providerObj.tariffs[0];
  const tariffBc      = bc(tariff.badge);

  // ── ΜΙΑ ΚΑΤΑΝΑΛΩΣΗ, ΤΟΥ ΧΡΗΣΤΗ ──────────────────────────────────────────
  // Σειρά: το δωδεκάμηνο που συμπλήρωσε, μετά οι κιλοβατώρες των λογαριασμών
  // του, μετά ό,τι έγραψε στο πεδίο. Αν δεν υπάρχει τίποτα, το λέμε και δεν
  // συγκρίνουμε: σύγκριση πάνω σε μαντεψιά οδηγεί σε αλλαγή παρόχου με λάθος
  // κριτήριο, που είναι χειρότερο από καμία σύγκριση.
  const usageEst = useMemo(
    () => estimateUsage(kwhHistory, billsKwh, parseFloat(kwhMonthly)),
    [kwhHistory, billsKwh, kwhMonthly],
  );
  const kwh = usageEst.kwhMonthly;
  const nightP = parseFloat(nightPct) || 30;
  const manualNum = parseFloat(manualMonthly) || 0;
  // Απλό αντικείμενο, χωρίς useMemo: ο υπολογισμός είναι μια πρόσθεση και ένας
  // πολλαπλασιασμός. Το να τον «βελτιστοποιήσουμε» θα έκρυβε τη μία αλήθεια
  // πίσω από εξαρτήσεις που πρέπει να μένουν συγχρονισμένες με το χέρι.
  const usage: Usage = { kwhMonthly: kwh, nightPct: nightP, ebill: useEbill, manualMonthly: manualNum };

  // ΕΝΑΣ ΤΥΠΟΣ. Πριν υπήρχαν δύο, ένας για «το τιμολόγιό σου» και ένας για τη
  // σύγκριση, και διέφεραν σε τρία σημεία. Ο υπολογισμός ζει πλέον στο
  // lib/energy/tariff.ts με 53 ελέγχους από πάνω του.
  const currentCost = monthlyCost(tariff as Tariff, usage);
  const calcMonthly = currentCost.total;

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

  // Σύγκριση με ΤΟΝ ΙΔΙΟ τύπο που υπολόγισε το τρέχον τιμολόγιο.
  // Χωρίς useMemo: εκατό τιμολόγια επί μερικές πράξεις το καθένα κοστίζουν
  // μικροδευτερόλεπτα, ενώ ένας πίνακας εξαρτήσεων που ξεχνιέται κοστίζει λάθος
  // τιμή στην οθόνη. Η ταχύτητα εδώ δεν ήταν ποτέ το πρόβλημα.
  const allTariffs = compareTariffs(
    PROVIDERS.flatMap(p => p.tariffs.map(t => ({ ...t, providerLabel: p.label }))) as (LocalTariff & { providerLabel: string })[],
    usage, tariffId, calcMonthly,
  )
    // Το κουμπί Οικιακό/Επιχειρηματικό υπήρχε και δεν φιλτράριζε τίποτα.
    .filter(r => r.tariff.segment === segmentFilter)
    .map(r => ({ ...r.tariff, monthly: r.cost.total, isCurrent: r.isCurrent, diff: r.diff }));

  const bestMonthly  = allTariffs[0]?.monthly || 0;
  const savings      = calcMonthly - bestMonthly;

  const secHdr = (label: string, sub?: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1, fontFamily: T.font.sans }}>{sub}</div>}
      </div>
    </div>
  );

  // Ο σκελετός μπαίνει ΜΕΤΑ από όλα τα hooks (κανόνας των hooks) και αντιγράφει το
  // πραγματικό σχήμα της καρτέλας: κεφαλίδα + τρεις στοιβαγμένες κάρτες. Σκελετός
  // KPIs θα υποσχόταν σειρά μετρικών που αυτή η καρτέλα δεν έχει καθόλου.
  if (loading) return (
    <div style={{ fontFamily: T.font.sans }}>
      <div style={{ marginBottom: 16 }}>
        <Skeleton w={110} h={20} r={6} />
        <Skeleton w={320} h={12} r={6} style={{ marginTop: 8 }} />
      </div>
      {[220, 180, 140].map((h, i) => <Skeleton key={i} h={h} r={T.radius.card} style={{ marginBottom: 16 }} />)}
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Ρεύμα</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Τιμολόγια {LAST_UPDATED}, Πηγή: bestenergydeals.gr / ΡΑΑΕΥ</div>
        </div>
        <a href={RAAYEY_URL} target="_blank" rel="noopener noreferrer" title="Ρυθμιστική Αρχή Αποβλήτων, Ενέργειας και Υδάτων"
          style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.pill, padding: '6px 16px', cursor: 'pointer', textDecoration: 'none', fontFamily: T.font.sans, fontWeight: 600 }}>
          Σύγκριση ΡΑΑΕΥ →
        </a>
      </div>

      {/* ── Contract expiry alert ── */}
      {contractExpiry && contractExpiry.daysLeft <= 60 && (
        <div style={{ marginBottom: 14, background: contractExpiry.daysLeft <= 14 ? 'rgba(197,34,31,0.06)' : 'rgba(242,153,0,0.05)', border: `1px solid ${contractExpiry.daysLeft <= 14 ? 'rgba(197,34,31,0.2)' : 'rgba(242,153,0,0.2)'}`, borderRadius: T.radius.inner, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: contractExpiry.daysLeft <= 14 ? 'var(--negative)' : 'var(--warning)' }}/>
          <span style={{ fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-primary)', fontWeight: 600 }}>
            Σύμβαση ρεύματος λήγει σε {contractExpiry.daysLeft} ημέρες, {contractExpiry.date}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
            Καλό να συγκρίνεις τιμές πριν ανανεώσεις
          </span>
        </div>
      )}

      {/* ── Provider + Tariff + Contract ── */}
      <div style={card}>
        {secHdr('Πάροχος και τιμολόγιο')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
          <CustomSelect label="Πάροχος" value={provider} onChange={p => {
            setProvider(p);
            const prov = PROVIDERS.find(x => x.value === p);
            const firstId = prov?.tariffs[0]?.id || '';
            setTariffId(firstId);
            save({ elecProvider: p, elecTariff: firstId });
          }} options={PROVIDERS.map(p => ({ value: p.value, label: p.label }))} />
          <CustomSelect label="Τιμολόγιο" value={tariffId} onChange={v => { setTariffId(v); save({ elecTariff: v }); }}
            options={providerObj.tariffs.map(t => ({ value: t.id, label: t.name }))} />
        </div>

        {/* Selected tariff card */}
        <div style={{ background: tariffBc.bg, border: `1px solid ${tariffBc.border}`, borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' as const }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{tariff.name}</span>
              <span style={{ fontSize: 9, fontWeight: 800, color: tariffBc.color, background: tariffBc.border, padding: '2px 10px', borderRadius: T.radius.pill, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{tariff.badge}</span>
              {tariff.contract_months ? (
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', fontFamily: T.font.sans }}>
                  {tariff.contract_months} μήνες
                </span>
              ) : (
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', fontFamily: T.font.sans }}>
                  Χωρίς δέσμευση
                </span>
              )}
              {tariff.no_fixed && <span style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Χωρίς πάγιο</span>}
              {tariff.smart_meter && <span style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Έξυπνος Μετρητής</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: T.font.sans }}>{tariff.desc}</div>
            {tariff.desc.includes('ΜΔΚΑ') && (
              <div style={{ marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, padding: '6px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                  <strong>ΜΔΚΑ</strong> = Μέσο Μηνιαίο Κόστος Κύκλου Αγοράς. Πρόσθετη χρέωση σε κυμαινόμενα τιμολόγια («κίτρινα») που αντανακλά τη διακύμανση της τιμής χονδρικής ηλεκτρισμού στην αγορά ενέργειας, αντικαθιστά παλαιότερες ρήτρες αναπροσαρμογής. Ανακοινώνεται κάθε 1η του μήνα από τον πάροχο. <a href="https://www.raaey.gr" target="_blank" title="Ρυθμιστική Αρχή Αποβλήτων, Ενέργειας και Υδάτων" style={{ color: "var(--accent)", fontWeight: 600 }}>ΡΑΑΕΥ →</a>
                </span>
              </div>
            )}
            {/* FIX: new, Picasso-family flat packages had no explanation of the tolerance/overage/settlement mechanic anywhere in the UI */}
            {tariff.type === 'fixed_monthly' && tariff.flat_annual_kwh != null && tariff.flat_overage_rate != null && (
              <div style={{ marginTop: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.badge, padding: '6px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
                  Σταθερό μηνιαίο ποσό για {tariff.contract_months || 12} μήνες (προμήθεια + ρυθμιζόμενες χρεώσεις, όχι υπέρ τρίτων). Ανοχή υπέρβασης 5% χωρίς χρέωση· πάνω από αυτό, {fk(tariff.flat_overage_rate)}/kWh. Ετήσια εκκαθάριση.
                </span>
              </div>
            )}
            {tariff.type !== 'dynamic' && tariff.type !== 'fixed_monthly' && (
              <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                  Χρέωση ημέρας:{'  '}<strong style={{ color: tariffBc.color }}>{fk(tariff.kwh_day)} / kWh</strong>
                </span>
                {tariff.kwh_night != null && (
                  <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    Χρέωση νύχτας:{'  '}<strong style={{ color: tariffBc.color }}>{fk(tariff.kwh_night)} / kWh</strong>
                  </span>
                )}
                {tariff.kwh_tier2 && (
                  <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    Άνω των {tariff.tier2_threshold} kWh:{'  '}<strong style={{ color: tariffBc.color }}>{fk(tariff.kwh_tier2)} / kWh</strong>
                  </span>
                )}
                <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                  Μηνιαίο πάγιο:{'  '}<strong>{tariff.no_fixed ? '0,00 €' : `${fe(((useEbill && tariff.fixed_ebill != null) ? tariff.fixed_ebill : tariff.fixed), 2)} / μήνα`}</strong>
                </span>
              </div>
            )}
            {/* FIX: new, fixed_monthly tariffs previously showed nothing here at all (the block above explicitly excludes them) */}
            {tariff.type === 'fixed_monthly' && (
              <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                  Σταθερό μηνιαίο κόστος:{'  '}<strong style={{ color: tariffBc.color }}>{fe(tariff.flat_monthly || 0)} / μήνα</strong>
                </span>
                {tariff.flat_annual_kwh != null && (
                  <span style={{ fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                    Όριο κατανάλωσης:{'  '}<strong>{tariff.flat_annual_kwh.toLocaleString('el-GR')} kWh / έτος</strong>
                  </span>
                )}
              </div>
            )}
          </div>
          <a href={providerObj.url} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 10, color: 'var(--accent)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: '4px 12px', textDecoration: 'none', whiteSpace: 'nowrap' as const, fontFamily: T.font.sans, fontWeight: 600 }}>
            Επίσκεψη →
          </a>
        </div>

        {/* Contract dates + E-bill toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 14, alignItems: 'center' }}>
          <DatePicker
            label="Έναρξη σύμβασης"
            value={contractStart}
            onChange={v => { setContractStart(v); save({ contractStart: v }); }}
          />
          <CustomSelect label="Διάρκεια σύμβασης" value={contractMonths}
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
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 6, fontFamily: T.font.sans }}>Ηλεκτρονικός Λογαριασμός</div>
              {/* ΤΡΙΤΗ ΓΕΩΜΕΤΡΙΑ ΓΙΑ ΤΟ ΙΔΙΟ ΠΡΑΓΜΑ. Εδώ ζούσε χειρόγραφος
                  διακόπτης 40×26 με δείκτη 20, ενώ το κοινό `Toggle` υπήρχε ήδη
                  — και ήταν ΗΔΗ εισαγμένο σε αυτό το αρχείο (γραμμή 5) χωρίς να
                  χρησιμοποιείται πουθενά. Δηλαδή τρίτο μέγεθος διακόπτη στην
                  εφαρμογή (36×20, 52×32, 40×26), ωμό #fff στον δείκτη, ωμό rgba
                  στη σκιά και το ίδιο κείμενο κατάστασης στα 12 αντί για 14. Το
                  κοινό component κρατά aria-checked και δίνει ρητή ελληνική
                  aria-label, που πριν έλειπε τελείως. */}
              {/* Το nowrap έμενε πίσω στη μεταφορά. Ο παλιός χειρόγραφος είχε
                  whiteSpace: 'nowrap' στο κείμενο κατάστασης· το κοινό `Toggle`
                  δεν το έχει, και το κείμενο μεγάλωσε από 12 σε 14 (η ετικέτα
                  «Ενεργό, μειωμένο πάγιο» πάει από ~133px σε ~155px) μέσα σε
                  στήλη `auto` ενός grid `1fr 1fr 1fr auto`. Σε στενό πλάτος θα
                  έσπαγε σε δύο γραμμές μέσα σε κουτί σταθερού ύψους T.h.lg (40px)
                  και θα ξεχείλιζε πάνω στη γραμμή. Το white-space κληρονομείται,
                  οπότε μπαίνει εδώ αντί να αλλάξει το κοινό component. */}
              <div style={{ display: 'flex', alignItems: 'center', height: T.h.lg, whiteSpace: 'nowrap' }}>
                <Toggle
                  on={useEbill}
                  onChange={v => { setUseEbill(v); save({ useEbill: v }); }}
                  label="Ενεργό, μειωμένο πάγιο"
                  labelOff="Ανενεργό"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Κατανάλωση + υπολογισμός ── */}
      <div style={card}>
        {secHdr('Κατανάλωση και εκτιμώμενο κόστος')}
        <div style={{ display: 'grid', gridTemplateColumns: tariff.kwh_night ? '1fr 1fr 1fr' : '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <NumberInput label="Μέση μηνιαία κατανάλωση" value={kwhMonthly} onChange={v => { setKwhMonthly(v); save({ kwhMonthly: v }); }} suffix="kWh" step={10}/>
          {tariff.kwh_night && <NumberInput label="Νυχτερινή κατανάλωση" value={nightPct} onChange={v => { setNightPct(v); save({ nightPct: v }); }} suffix="%" step={5}/>}
          {tariff.type === 'dynamic' && <NumberInput label="Μηνιαίο Κόστος (€), Από Λογαριασμό" value={manualMonthly} onChange={v => { setManualMonthly(v); save({ manualMonthly: v }); }} suffix="€" step={1}/>}
        </div>

        {/* ΑΠΟ ΠΟΥ ΒΓΗΚΕ Ο ΑΡΙΘΜΟΣ. Χωρίς αυτό, ο χρήστης δεν έχει τρόπο να
            ξέρει αν η σύγκριση τρέχει πάνω στη ΔΙΚΗ ΤΟΥ κατανάλωση ή σε μια
            προεπιλογή. Πριν ήταν πάντα προεπιλογή, και δεν φαινόταν πουθενά. */}
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginBottom: 14 }}>
          {usageEst.source === 'history'
            ? `Υπολογισμός με ${usageEst.kwhMonthly} kWh τον μήνα, μέσος όρος από ${usageEst.months} ${usageEst.months === 1 ? 'μήνα' : 'μήνες'} του ιστορικού σου.`
            : usageEst.source === 'bills'
              ? `Υπολογισμός με ${usageEst.kwhMonthly} kWh τον μήνα, μέσος όρος από ${usageEst.months} ${usageEst.months === 1 ? 'λογαριασμό' : 'λογαριασμούς'} που έχεις καταχωρήσει.`
              : usageEst.source === 'manual'
                ? `Υπολογισμός με ${usageEst.kwhMonthly} kWh τον μήνα, όπως τα δήλωσες.`
                : 'Δεν ξέρουμε ακόμη πόσο ρεύμα καίει το ακίνητο. Γράψε τη μέση μηνιαία κατανάλωση ή συμπλήρωσε το ιστορικό πιο κάτω, και η σύγκριση θα τρέξει στα δικά σου νούμερα.'}
          {usageEst.source !== 'unknown' && !usageEst.reliable && (
            <> Με {usageEst.months} {usageEst.months === 1 ? 'μήνα' : 'μήνες'} δεδομένων η εικόνα είναι πρόχειρη: ο Ιούλιος με κλιματιστικό και ο Απρίλιος δεν μοιάζουν.</>
          )}
        </div>

        {tariff.type !== 'dynamic' && kwh > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 14 }}>
            {[
              { label: 'Εκτιμώμενο / μήνα', value: fe(calcMonthly),       color: 'var(--accent)' },
              { label: 'Ετήσιο Κόστος',      value: fe(calcMonthly * 12), color: 'var(--text-primary)' },
              { label: 'Κόστος / kWh net',   value: kwh > 0 ? fk(calcMonthly / kwh) : '—', color: 'var(--text-secondary)' },
              { label: 'Εξοικονόμηση vs καλύτερο', value: savings > 0.5 ? `+${fe(savings)}` : fn(0), color: savings > 0.5 ? 'var(--positive)' : 'var(--text-tertiary)' },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 14px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: i === 0 ? 20 : 14, fontWeight: 700, color: k.color, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* kWh history */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>Ιστορικό Κατανάλωσης, <span title="κιλοβατώρα, μονάδα μέτρησης κατανάλωσης ηλεκτρικής ενέργειας">kWh</span> ανά μήνα</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 4 }}>
            {MONTHS_SHORT.map((m, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: i === currentMonth ? 'var(--accent)' : 'var(--text-tertiary)', marginBottom: 4, fontWeight: i === currentMonth ? 700 : 400, fontFamily: T.font.sans }}>{m}</div>
                <input type="number" value={kwhHistory[i] || ''} placeholder="0"
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
            {secHdr('Σύγκριση Όλων των Παρόχων', `Βάσει ${kwh} kWh/μήνα, ${LAST_UPDATED}`)}
            <div style={{ display: 'flex', background: 'var(--bg-base)', borderRadius: T.radius.pill, padding: 3, border: '1px solid var(--border-default)' }}>
              {(['residential', 'business'] as const).map(seg => (
                <button key={seg} onClick={() => setSegmentFilter(seg)}
                  style={{
                    padding: '6px 16px', borderRadius: T.radius.pill, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, fontFamily: T.font.sans,
                    background: segmentFilter === seg ? 'var(--accent)' : 'transparent',
                    color: segmentFilter === seg ? 'var(--accent-text)' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}>
                  {seg === 'residential' ? 'Οικιακό' : 'Επιχειρηματικό'}
                </button>
              ))}
            </div>
          </div>
          {savings > 1 && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }}/>
              <span style={{ fontSize: 12, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
                Μπορείς να εξοικονομήσεις <strong style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--positive)' }}>{fe(savings)} / μήνα</strong> ({fe(savings * 12)} / έτος) με το καλύτερο τιμολόγιο
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
                    <tr key={t.id} style={{ background: isCur ? 'var(--accent-soft)' : isBest ? 'var(--bg-elevated)' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
                        {isCur && <span style={{ fontSize: 7, color: 'var(--accent)', marginRight: 6, fontWeight: 800, textTransform: 'uppercase' as const }}>▶ ΤΡΕΧΟΝ</span>}
                        {!isCur && isBest && <span style={{ fontSize: 7, color: 'var(--positive)', marginRight: 6, fontWeight: 800 }}>★ ΚΑΛΥΤΕΡΟ</span>}
                        {t.providerLabel}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-primary)', fontFamily: T.font.sans }}>{t.name}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 8, fontWeight: 700, color: rowBc.color, background: rowBc.border, padding: '2px 8px', borderRadius: T.radius.pill, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{t.badge}</span>
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' as const }}>
                        {t.type === 'fixed_monthly' ? 'all-in' : t.type === 'vnm' ? <span title="Εικονική Καθαρή Μέτρηση (Virtual Net Metering)">VNM</span> : `${fk(t.kwh_day)}`}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)', whiteSpace: 'nowrap' as const }}>
                        {/* FIX: fixed_monthly tariffs showed a misleading "0.00 €" pagio (implying free, like no_fixed), now shows, instead */}
                        {t.type === 'fixed_monthly' ? '—' : t.no_fixed ? '0 €' : `${fe((t.fixed_ebill != null ? t.fixed_ebill : t.fixed), 2)}`}
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
                        {t.contract_months ? `${t.contract_months} μήνες` : 'Χωρίς δέσμευση'}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: isBest ? 'var(--positive)' : isCur ? 'var(--accent)' : 'var(--text-primary)', whiteSpace: 'nowrap' as const }}>
                        {t.type === 'dynamic' ? 'Ωριαίο' : fe(t.monthly)}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' as const }}>
                        {t.type === 'dynamic' ? '—' : fe(t.monthly * 12)}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const,
                        color: isCur ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                        {isCur ? '—' : t.diff === 0 ? '—' : `${t.diff < 0 ? '' : '+'}${fe(t.diff)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ΤΙ ΑΚΡΙΒΩΣ ΣΥΓΚΡΙΝΕΤΑΙ ΚΑΙ ΑΠΟ ΠΟΥ. Χωρίς αυτή τη γραμμή, ο χρήστης
              βλέπει ένα ποσό και δεν ξέρει ούτε πότε ισχύει ούτε τι δεν
              περιλαμβάνει. Οι τιμές λιανικής ρεύματος ΔΕΝ αλλάζουν σε πραγματικό
              χρόνο: το κυμαινόμενο ανακοινώνεται μηνιαία. Το «ζωντανή τιμή» θα
              ήταν διαφήμιση, όχι ακρίβεια. */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', fontSize: 11, lineHeight: 1.6, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            Συγκρίνεται η <strong style={{ color: 'var(--text-secondary)' }}>χρέωση προμήθειας</strong>, δηλαδή πάγιο και ενέργεια, μαζί με τα ρυθμιζόμενα τέλη και τον ΦΠΑ.
            Δεν περιλαμβάνονται χρεώσεις δικτύου ΔΕΔΔΗΕ, δημοτικά τέλη και τέλος ΕΡΤ, επειδή είναι ίδια όποιον πάροχο κι αν διαλέξεις και δεν αλλάζουν τη σειρά.
            <br />
            Τιμές όπως δημοσιεύονται από τους παρόχους. Τελευταίος έλεγχος: {LAST_UPDATED}.
            {' '}<a href={RAAYEY_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Διασταύρωσε στη ΡΑΑΕΥ</a>.
            Πριν υπογράψεις, επιβεβαίωσε την τιμή στη σελίδα του παρόχου: το κυμαινόμενο ανακοινώνεται κάθε μήνα.
          </div>
        </div>
      )}

      {/* Smart live hints based on real user data */}
      {(() => {
        // Build personalized smart hints based on what user has entered
        const hints: { text: string; severity: 'info' | 'warning' | 'tip'; action?: string; tab?: string }[] = [];
        const kwhNum   = parseFloat(kwhMonthly) || 0;
        const costNum  = calcMonthly;

        // FIX: new, warn if the SELECTED flat-tier package's kWh limit is smaller than
        // the user's actual projected usage. Without this, someone could pick "Picasso
        // Small" while consuming way more, with no indication they'll hit overage charges.
        if (tariff.type === 'fixed_monthly' && tariff.flat_annual_kwh && tariff.flat_overage_rate) {
          const projectedAnnual = kwhNum * 12;
          const allowance = tariff.flat_annual_kwh * 1.05;
          if (projectedAnnual > allowance) {
            const overageKwh = Math.round(projectedAnnual - tariff.flat_annual_kwh);
            hints.push({ text: `Με ${kwhNum} kWh/μήνα (~${Math.round(projectedAnnual)} kWh/έτος) ξεπερνάς το όριο του "${tariff.name}" (${tariff.flat_annual_kwh.toLocaleString('el-GR')} kWh + 5% ανοχή) κατά ~${overageKwh} kWh. Η υπέρβαση χρεώνεται ${fk(tariff.flat_overage_rate)}/kWh, σκέψου μεγαλύτερο πακέτο.`, severity: 'warning' });
          }
        }

        // ── Insurance gap, only if VNM/solar is relevant (cross-tab context) ──
        if (insData && kwhNum > 200) {
          if (!insData.eq) {
            hints.push({ text: 'Η ασφάλειά σου δεν καλύπτει σεισμό. Δες τις καλύψεις σου.', severity: 'warning', action: 'Ασφάλεια & συνδρομές', tab: 'insurance' });
          }
        }

        // ── Κατανάλωση insights ─────────────────────────────────────────────────
        if (kwhNum > 400) {
          const vnmTariff = allTariffs.find(t => t.id === 'heron_ena');
          if (vnmTariff && vnmTariff.monthly < costNum - 5) {
            // Το κουμπί «Πάρε Προσφορά» έστελνε στην καρτέλα «Ρεύμα» — δηλαδή σε
            // αυτήν ΠΟΥ ΗΔΗ ΒΛΕΠΕΙ ο χρήστης. Η υπόδειξη μένει, το κουμπί φεύγει.
            hints.push({ text: `Με ${kwhNum} kWh/μήνα το VNM (Εικονική Καθαρή Μέτρηση) μπορεί να σου εξοικονομήσει ${fe(costNum - vnmTariff.monthly)} τον μήνα.`, severity: 'tip' });
          } else {
            hints.push({ text: `Κατανάλωση ${kwhNum} kWh/μήνα, αξίζει σύγκριση με φωτοβολταϊκό ή κοινοτικό VNM.`, severity: 'tip' });
          }
        } else if (kwhNum > 0 && kwhNum < 100) {
          const noFixed = allTariffs.find(t => t.no_fixed && t.type !== 'dynamic');
          if (noFixed && noFixed.monthly < costNum) {
            hints.push({ text: `Χαμηλή κατανάλωση (${kwhNum} kWh). Τιμολόγιο χωρίς πάγιο (${noFixed.providerLabel} ${noFixed.name}) εξοικονομεί ${fe((costNum - noFixed.monthly), 0)}/μήνα.`, severity: 'tip' });
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
          info:    { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', dot: 'var(--text-tertiary)', text: 'var(--accent)' },
          tip:     { bg: 'var(--bg-elevated)', border: 'var(--border-subtle)', dot: 'var(--text-tertiary)', text: 'var(--accent)' },
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