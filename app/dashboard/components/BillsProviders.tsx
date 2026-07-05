'use client';

import { useState } from 'react';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { T, fe, Spinner } from '@/components/Theme';

const INTERNET_PROVIDERS = [
  { value: 'cosmote',   label: 'Cosmote',   url: 'https://www.cosmote.gr',    color: '#009fe3' },
  { value: 'nova',      label: 'Nova',       url: 'https://www.nova.gr',       color: '#e4002b' },
  { value: 'vodafone',  label: 'Vodafone',   url: 'https://www.vodafone.gr',   color: '#e60000' },
  { value: 'inalan',    label: 'Inalan',     url: 'https://www.inalan.gr',     color: '#0073ff' },
  { value: 'enterwave', label: 'Enterwave',  url: 'https://www.enterwave.gr',  color: '#f59e0b' },
  { value: 'hol',       label: 'HOL',        url: 'https://www.hol.gr',        color: '#f97316' },
  { value: 'cyta',      label: 'Cyta',       url: 'https://www.cyta.gr',       color: '#003da5' },

  { value: 'dei',       label: 'ΔΕΗ Telecom', url: 'https://www.dei.gr',         color: '#1a7fe0' },
  { value: 'other',     label: 'Άλλος',       url: '',                           color: '#94a3b8' },
];

const INTERNET_PLANS: Record<string, {
  id: string; name: string; speed: string; price: number;
  hasPhone: boolean; hasTV?: boolean; hasMobile?: boolean;
  note: string; contract?: string; student?: boolean; backup?: boolean;
  networkType?: string; // ADSL | VDSL | Fiber | 5G
}[]> = {
  cosmote: [
    // ── Double Play (Σταθερή + Internet) ─────────────────────────────────
    { id:'c_dp_24',    name: 'Double Play Unlimited 24',    speed: '24 Mbps',   price: 19.90, hasPhone: true,  note: 'ADSL. Απεριόριστα λεπτά σταθερά και κινητά.', networkType: 'ADSL', contract: '24 μήνες' },
    { id:'c_dp_50',    name: 'Double Play Advanced 50',     speed: '50 Mbps',   price: 22.90, hasPhone: true,  note: 'VDSL. Απεριόριστα λεπτά σταθερά και κινητά.', networkType: 'VDSL', contract: '24 μήνες' },
    { id:'c_f100',     name: 'Fiber 100 Unlimited',         speed: '100 Mbps',  price: 23.71, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'c_f300',     name: 'Fiber 300 Unlimited',         speed: '300 Mbps',  price: 27.90, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'c_f500',     name: 'Fiber 500 Unlimited',         speed: '500 Mbps',  price: 31.90, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'c_f1g',      name: 'Fiber 1 Gbps Unlimited',      speed: '1 Gbps',    price: 35.90, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'c_f3g',      name: 'Fiber 3 Gbps Unlimited',      speed: '3 Gbps',    price: 70.39, hasPhone: true,  note: 'Υπερ-γρήγορο οπτική ίνα FTTH.', networkType: 'Fiber', contract: '24 μήνες' },
    // ── 5G WiFi (Internet backup μέσω 5G) ────────────────────────────────
    { id:'c_5g50',     name: '5G WiFi Double Play 50',      speed: '50 Mbps',   price: 30.90, hasPhone: true,  note: 'Ασύρματο 5G — Internet backup. Χωρίς καλωδίωση.', networkType: '5G', backup: true },
    { id:'c_5g300',    name: '5G WiFi Double Play 300',     speed: '300 Mbps',  price: 35.90, hasPhone: true,  note: 'Ασύρματο 5G — Internet backup. Χωρίς καλωδίωση.', networkType: '5G', backup: true },
    { id:'c_5g_free',  name: '5G WiFi 300 Χωρίς Σύμβαση',  speed: '300 Mbps',  price: 35.90, hasPhone: true,  note: 'Ασύρματο 5G χωρίς δέσμευση. Εξοπλισμός 349€.', networkType: '5G', backup: true },
    // ── Triple Play (Σταθερή + Internet + Τηλεόραση) ─────────────────────
    { id:'c_f100_tv',  name: 'Fiber 100 + Cosmote TV Full', speed: '100 Mbps',  price: 48.77, hasPhone: true, hasTV: true, note: 'FTTH + Cosmote TV πλήρες πακέτο. Δωρεάν εξοπλισμός.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'c_f300_tv',  name: 'Fiber 300 + Cosmote TV Full', speed: '300 Mbps',  price: 51.85, hasPhone: true, hasTV: true, note: 'FTTH + Cosmote TV πλήρες πακέτο. Δωρεάν εξοπλισμός.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'c_f500_tv',  name: 'Fiber 500 + TV + Netflix',    speed: '500 Mbps',  price: 62.06, hasPhone: true, hasTV: true, note: 'FTTH + Cosmote TV + Netflix. Δωρεάν εξοπλισμός.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'c_f1g_tv',   name: 'Fiber 1 Gbps + TV + Netflix', speed: '1 Gbps',    price: 65.30, hasPhone: true, hasTV: true, note: 'FTTH + Cosmote TV + Netflix. Δωρεάν εξοπλισμός.', networkType: 'Fiber', contract: '24 μήνες' },
  ],
  nova: [
    // ── Double Play (Σταθερή + Internet) ─────────────────────────────────
    { id:'n_24',       name: 'Nova 24 Double Play',         speed: '24 Mbps',   price: 18.90, hasPhone: true,  note: 'ADSL. Απεριόριστα λεπτά σταθερά και κινητά.', networkType: 'ADSL', contract: '24 μήνες' },
    { id:'n_50',       name: 'Nova 50 Double Play',         speed: '50 Mbps',   price: 22.90, hasPhone: true,  note: 'VDSL. Απεριόριστα λεπτά σταθερά και κινητά.', networkType: 'VDSL', contract: '24 μήνες' },
    { id:'n_f100',     name: 'Nova Fiber 100',              speed: '100 Mbps',  price: 24.90, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'n_f300',     name: 'Nova Fiber 300',              speed: '300 Mbps',  price: 27.90, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'n_f600',     name: 'Nova Fiber 600',              speed: '600 Mbps',  price: 32.90, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'n_f1g',      name: 'Nova Fiber 1 Gbps',           speed: '1 Gbps',    price: 37.90, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    // ── Triple Play (Σταθερή + Internet + Τηλεόραση) ─────────────────────
    { id:'n_f100_tv',  name: 'Nova Fiber 100 + TV',         speed: '100 Mbps',  price: 41.90, hasPhone: true, hasTV: true, note: 'FTTH + Nova TV Sport + Cinema.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'n_f300_tv',  name: 'Nova Fiber 300 + TV',         speed: '300 Mbps',  price: 44.90, hasPhone: true, hasTV: true, note: 'FTTH + Nova TV Sport + Cinema.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'n_f1g_tv',   name: 'Nova Fiber 1 Gbps + TV',      speed: '1 Gbps',    price: 54.90, hasPhone: true, hasTV: true, note: 'FTTH + Nova TV Sport + Cinema + Netflix.', networkType: 'Fiber', contract: '24 μήνες' },
  ],
  vodafone: [
    // ── Double Play (Σταθερή + Internet) ─────────────────────────────────
    { id:'v_24',       name: 'Vodafone 24',                 speed: '24 Mbps',   price: 21.00, hasPhone: true,  note: 'ADSL. Απεριόριστα σταθερά, 300 λεπτά κινητά.', networkType: 'ADSL', contract: '24 μήνες' },
    { id:'v_50',       name: 'Vodafone 50',                 speed: '50 Mbps',   price: 24.00, hasPhone: true,  note: 'VDSL. Απεριόριστα σταθερά, 300 λεπτά κινητά.', networkType: 'VDSL', contract: '24 μήνες' },
    { id:'v_ff300',    name: 'Full Fiber 300',              speed: '300 Mbps',  price: 35.00, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'v_ff500',    name: 'Full Fiber 500',              speed: '500 Mbps',  price: 42.00, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'v_ff1g',     name: 'Full Fiber 1 Gbps',           speed: '1 Gbps',    price: 49.00, hasPhone: true,  note: 'Οπτική ίνα FTTH. Απεριόριστα λεπτά.', networkType: 'Fiber', contract: '24 μήνες' },
    // ── Triple Play (+ Vodafone TV) ───────────────────────────────────────
    { id:'v_ff300_tv', name: 'Full Fiber 300 + Vodafone TV', speed: '300 Mbps', price: 44.00, hasPhone: true, hasTV: true, note: 'FTTH + Vodafone TV (45 κανάλια, HBO).', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'v_ff500_tv', name: 'Full Fiber 500 + Vodafone TV', speed: '500 Mbps', price: 51.00, hasPhone: true, hasTV: true, note: 'FTTH + Vodafone TV + αποκωδικοποιητής +2.50€.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'v_ff1g_tv',  name: 'Full Fiber 1 Gbps + TV',       speed: '1 Gbps',   price: 58.00, hasPhone: true, hasTV: true, note: 'FTTH + Vodafone TV + αποκωδικοποιητής +2.50€.', networkType: 'Fiber', contract: '24 μήνες' },
  ],
  dei: [
    { id:'dei_f500',   name: 'ΔΕΗ Fiber 500',              speed: '500 Mbps',  price: 17.90, hasPhone: false, note: 'Φθηνότερο fiber στην αγορά. Χωρίς τηλεφωνία.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'dei_f1g',    name: 'ΔΕΗ Fiber 1 Gbps',           speed: '1 Gbps',    price: 24.90, hasPhone: false, note: 'Οπτική ίνα. Χωρίς τηλεφωνία.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'dei_f25g',   name: 'ΔΕΗ Fiber 2.5 Gbps',         speed: '2.5 Gbps',  price: 52.90, hasPhone: false, note: 'Ultra broadband. Χωρίς τηλεφωνία.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'dei_f500_v', name: 'ΔΕΗ Fiber 500 + Φωνή',       speed: '500 Mbps',  price: 21.90, hasPhone: true,  note: 'Fiber + τηλεφωνία (+4€). Απεριόριστα λεπτά σταθερά.', networkType: 'Fiber', contract: '24 μήνες' },
  ],
  inalan: [
    // ── Οικιακά (με σύμβαση 24 μηνών) ────────────────────────────────────
    { id:'i_300_24',   name: 'Fiber 300 (24 μήνες)',        speed: '300/300 Mbps συμμετρικό', price: 28.00, hasPhone: false, note: 'Χωρίς τηλεφωνία. Δωρεάν εξοπλισμός.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'i_300_ph',   name: 'Fiber 300 + Τηλεφωνία',      speed: '300/300 Mbps + τηλεφωνία', price: 28.00, hasPhone: true,  note: 'Απεριόριστα λεπτά εντός Ευρωπαϊκής Ένωσης.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'i_1g_24',    name: 'Fiber 1 Gbps (24 μήνες)',     speed: '1 Gbps/1 Gbps συμμετρικό', price: 38.00, hasPhone: false, note: 'Υπερ-γρήγορο FTTH. Δωρεάν εξοπλισμός.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'i_1g_ph',    name: 'Fiber 1 Gbps + Τηλεφωνία',   speed: '1 Gbps + τηλεφωνία', price: 38.00, hasPhone: true, note: 'Απεριόριστα λεπτά + 300 λεπτά σε ΕΕ/ΗΠΑ/Καναδά.', networkType: 'Fiber', contract: '24 μήνες' },
    // ── Αδέσμευτα ────────────────────────────────────────────────────────
    { id:'i_300_free', name: 'Fiber 300 Χωρίς Δέσμευση',   speed: '300/300 Mbps', price: 22.90, hasPhone: false, note: 'Χωρίς σύμβαση. Δωρεάν εξοπλισμός και εγκατάσταση.', networkType: 'Fiber' },
    { id:'i_1g_free',  name: 'Fiber 1 Gbps Χωρίς Δέσμευση',speed: '1 Gbps/1 Gbps', price: 27.90, hasPhone: false, note: 'Χωρίς σύμβαση. Δωρεάν εξοπλισμός και εγκατάσταση.', networkType: 'Fiber' },
    // ── Φοιτητικά ────────────────────────────────────────────────────────
    { id:'i_300_st',   name: 'Φοιτητικό 300 Mbps',         speed: '300/300 Mbps συμμετρικό', price: 14.00, hasPhone: false, note: 'Φοιτητικό — χωρίς δέσμευση. Απαιτείται φοιτητική ταυτότητα ή ΑΜΚΑ. Δωρεάν εγκατάσταση.', networkType: 'Fiber', student: true },
    { id:'i_1g_st',    name: 'Φοιτητικό 1 Gbps',           speed: '1 Gbps/1 Gbps συμμετρικό', price: 28.00, hasPhone: false, note: 'Φοιτητικό — χωρίς δέσμευση. Απαιτείται φοιτητική ταυτότητα ή ΑΜΚΑ.', networkType: 'Fiber', student: true },
  ],
  enterwave: [
    { id:'ew_100',     name: 'Enterwave Fiber 100',         speed: '100 Mbps',  price: 16.90, hasPhone: false, note: 'FTTH Αθήνα και Θεσσαλονίκη.', networkType: 'Fiber' },
    { id:'ew_500',     name: 'Enterwave Fiber 500',         speed: '500 Mbps',  price: 21.90, hasPhone: false, note: 'FTTH Αθήνα και Θεσσαλονίκη.', networkType: 'Fiber' },
  ],
  cyta: [
    { id:'cy_100',     name: 'CytaFiber 100',               speed: '100 Mbps',  price: 18.90, hasPhone: true,  note: 'Δέσμευση 24 μηνών.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'cy_500',     name: 'CytaFiber 500',               speed: '500 Mbps',  price: 24.90, hasPhone: true,  note: 'Δέσμευση 24 μηνών.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'cy_1g',      name: 'CytaFiber 1 Gbps',            speed: '1 Gbps',    price: 29.90, hasPhone: true,  note: 'Δέσμευση 24 μηνών.', networkType: 'Fiber', contract: '24 μήνες' },
  ],
  hol: [
    { id:'h_100',      name: 'HOL Fiber 100',               speed: '100/50 Mbps', price: 19.90, hasPhone: true, note: 'Δέσμευση 24 μηνών.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'h_500',      name: 'HOL Fiber 500',               speed: '500/200 Mbps',price: 24.90, hasPhone: true, note: 'Δέσμευση 24 μηνών.', networkType: 'Fiber', contract: '24 μήνες' },
  ],

};
const WATER_PROVIDERS = [
  { value: 'eydap', label: 'ΕΥΔΑΠ (Αττική)',         url: 'https://www.eydap.gr',  color: '#06b6d4' },
  { value: 'eyath', label: 'ΕΥΑΘ (Θεσσαλονίκη)',     url: 'https://www.eyath.gr',  color: '#0ea5e9' },
  { value: 'local', label: 'Τοπική ΔΕΥΑ',             url: '',                       color: '#38bdf8' },
];

const GAS_PROVIDERS = [
  { value: 'eda_attikis', label: 'ΕΔΑ Αττικής',   url: 'https://www.edaattikis.gr', color: '#f97316' },
  { value: 'eda_thess',   label: 'ΕΔΑ Θεσσαλίας', url: 'https://www.edathess.gr',   color: '#fb923c' },
  { value: 'heron',       label: 'Ήρων',           url: 'https://www.heron.gr',      color: '#e85d04' },
  { value: 'protergia',   label: 'Protergia',       url: 'https://www.protergia.gr', color: '#7c3aed' },
];

const HEATING_TYPES = [
  { value: 'autonomous_gas',       label: 'Αυτόνομη Φυσικού Αερίου' },
  { value: 'autonomous_oil',       label: 'Αυτόνομη Πετρελαίου'     },
  { value: 'autonomous_heat_pump', label: 'Αντλία Θερμότητας'        },
  { value: 'autonomous_ac',        label: 'Κλιματιστικό'              },
  { value: 'autonomous_pellet',    label: 'Pellet'                    },
  { value: 'autonomous_wood',      label: 'Ξύλα / Τζάκι'             },
  { value: 'central_gas',          label: 'Κεντρική Φυσικού Αερίου'  },
  { value: 'central_oil',          label: 'Κεντρική Πετρελαίου'      },
  { value: 'district',             label: 'Τηλεθέρμανση'              },
];

const SECURITY_COMPANIES = [
  { value: 'eltrak',    label: 'Eltrak',    url: 'https://www.eltrak.gr',        color: '#dc2626' },
  { value: 'g4s',       label: 'G4S',       url: 'https://www.g4s.com/gr-gr',    color: '#166534' },
  { value: 'vaninfo',   label: 'Vaninfo',   url: 'https://www.vaninfo.gr',       color: '#1d4ed8' },
  { value: 'dsp',       label: 'DSP',       url: 'https://www.dsp.gr',           color: '#0f172a' },
  { value: 'securitas', label: 'Securitas', url: 'https://www.securitas.com/gr', color: '#b91c1c' },
  { value: 'other',     label: 'Άλλη',      url: '',                              color: '#64748b' },
];

const BENCHMARKS = {
  internet: { avg: 22.50, label: 'Μέσος Όρος Ελλάδας'              },
  water:    { avg: 12.00, label: 'Μέσος Όρος Αττικής — ~24 € / 2 μήνες' },
  heating:  { avg: 70.00, label: 'Μέσος Όρος χειμώνα'               },
  gas:      { avg: 40.00, label: 'Μέσος Όρος οικιακό'               },
  security: { avg: 18.00, label: 'Μέσος Όρος αγοράς'                },
};

const DEFAULTS = {
  internetProvider: 'cosmote', internetPlanId: '', internetPlan: '',
  internetSpeed: '', internetPrice: '', internetPhone: false,
  internetContractEnd: '', internetSpeedReal: '',
  phoneLocal: true, phoneMobile: false, phoneIntl: false, phoneVoip: false, phoneNotes: '',
  // FIX: "Συνδρομητική Τηλεόραση" label
  hasTV: false, tvProvider: 'cosmote', tvPlan: '', tvPrice: '', tvHasSports: false,
  waterProvider: 'eydap', waterBiMonthly: '', waterMonthly: '', waterPersons: '2', waterPeriodMonths: '2',
  heatingType: 'autonomous_gas', heatingMonthly: '',
  heatingLitersPerYear: '', heatingOilPricePerLiter: '1.20',
  heatingKgPellet: '', heatingPelletPrice: '0.38',
  heatingCentralShare: '',
  gasProvider: 'eda_attikis', gasPlan: '', gasMonthly: '',
  securityCompany: 'other', securityPlan: '', securityMonthly: '',
  securityHasRemote: false, securityHasCamera: false, securityHasDoor: false,
  dimotika: '4.8', dimotikaCalcCons: '', dimotikaCalcAmount: '',
};

interface Props { propertyId: string; userId?: string; }

export default function BillsProviders({ propertyId, userId = '' }: Props) {
  const [s, upd, loading] = useBillsSettings(propertyId, userId, 'providers', DEFAULTS);

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties   = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 };
  const g3: React.CSSProperties   = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 14 };
  const g4: React.CSSProperties   = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 14, marginBottom: 14 };

  const internetCost = parseFloat(s.internetPrice) || 0;
  const tvCost       = s.hasTV ? (parseFloat(s.tvPrice) || 0) : 0;
  const waterM       = s.waterBiMonthly ? (parseFloat(s.waterBiMonthly) || 0) / (parseInt(s.waterPeriodMonths || '2') || 2) : (parseFloat(s.waterMonthly) || 0);
  const heatingM     = (() => {
    if (s.heatingType === 'autonomous_oil' && s.heatingLitersPerYear)
      return (parseFloat(s.heatingLitersPerYear) * parseFloat(s.heatingOilPricePerLiter)) / 12;
    if (s.heatingType === 'autonomous_pellet' && s.heatingKgPellet)
      return (parseFloat(s.heatingKgPellet) * parseFloat(s.heatingPelletPrice)) / 12;
    return parseFloat(s.heatingMonthly) || 0;
  })();
  const gasM      = parseFloat(s.gasMonthly)      || 0;
  const securityM = parseFloat(s.securityMonthly) || 0;
  const totalM    = internetCost + tvCost + waterM + heatingM + gasM + securityM;

  const provData     = INTERNET_PROVIDERS.find(p => p.value === s.internetProvider);
  const planOptions  = (INTERNET_PLANS[s.internetProvider] || []).sort((a, b) => a.price - b.price).map(p => ({
    value: p.id,
    label: [
      p.name,
      p.speed,
      p.price > 0 ? `${p.price.toFixed(2)} €/μήνα` : '',
      p.student ? '(Φοιτητικό)' : '',
      p.backup ? '(Backup 5G)' : '',
      p.hasTV ? '+ TV' : '',
    ].filter(Boolean).join(' — ')
  }));
  const selectedPlan = (INTERNET_PLANS[s.internetProvider] || []).find(p => p.id === s.internetPlanId);
  const secData      = SECURITY_COMPANIES.find(c => c.value === s.securityCompany);
  const waterData    = WATER_PROVIDERS.find(p => p.value === s.waterProvider);
  const gasData      = GAS_PROVIDERS.find(p => p.value === s.gasProvider);

  const secHdr = (label: string, link?: { url: string; text: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans, flex: 1 }}>{label}</span>
      {link?.url && (
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--info)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans, background: 'rgba(26,115,232,0.06)', border: '1px solid rgba(26,115,232,0.18)', borderRadius: T.radius.pill, padding: '3px 10px', whiteSpace: 'nowrap' as const }}>
          {link.text}
        </a>
      )}
    </div>
  );

  const benchmarkBar = (current: number, avg: number, label: string) => {
    if (!current || !avg) return null;
    const pct   = Math.min((current / (avg * 2)) * 100, 100);
    const isHigh = current > avg * 1.15;
    const isLow  = current < avg * 0.85;
    return (
      <div style={{ marginTop: 10, background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 10, fontFamily: T.font.sans }}>
          <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
          <span style={{ fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: isHigh ? 'var(--negative)' : isLow ? 'var(--positive)' : 'var(--text-primary)' }}>
            {isHigh ? `+${((current / avg - 1) * 100).toFixed(0)}% πάνω από τον μέσο όρο` : isLow ? `-${((1 - current / avg) * 100).toFixed(0)}% κάτω από τον μέσο όρο` : 'Στο μέσο όρο'}
          </span>
        </div>
        <div style={{ position: 'relative', height: 6, background: 'var(--bg-overlay)', borderRadius: 3 }}>
          <div style={{ position: 'absolute', left: '50%', top: -3, width: 2, height: 12, background: 'var(--text-tertiary)', borderRadius: 1 }}/>
          <div style={{ height: '100%', width: `${pct}%`, background: isHigh ? 'var(--negative)' : isLow ? 'var(--positive)' : 'var(--accent)', borderRadius: 3 }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
          <span>0 €</span><span style={{ color: 'var(--text-secondary)' }}>μέσος όρος {avg} €</span><span>{(avg * 2).toFixed(0)} €</span>
        </div>
      </div>
    );
  };

  if (loading) return <Spinner label="Φόρτωση…" />;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Internet & TV',                   value: fe(internetCost + tvCost), accent: false },
          { label: 'Νερό & Θέρμανση',                 value: fe(waterM + heatingM),     accent: false },
          { label: 'Security',                          value: fe(securityM),             accent: false },
          { label: 'Σύνολο Παρόχων / μήνα',           value: fe(totalM),                accent: totalM > 0 },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.accent ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Δημοτικά Τέλη ─────────────────────────────────────────────────
          FIX: compact result — inline pill, not a large box
      ─────────────────────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, marginBottom: 16 }}>
        {secHdr('Δημοτικά Τέλη — Υπολογισμός Ποσοστού')}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 12 }}>
          <NumberInput
            label="Ποσοστό % (αν το γνωρίζεις)"
            value={s.dimotika}
            onChange={v => upd({ dimotika: v })}
            suffix="%" step={0.1}
          />
          <NumberInput
            label="Κατανάλωση λογαριασμού ρεύματος (€)"
            value={s.dimotikaCalcCons}
            onChange={v => upd({ dimotikaCalcCons: v })}
            suffix="€" step={1}
          />
          <NumberInput
            label="Δημοτικά Τέλη στον λογαριασμό (€)"
            value={s.dimotikaCalcAmount}
            onChange={v => upd({ dimotikaCalcAmount: v })}
            suffix="€" step={0.5}
          />
        </div>

        {/* FIX: compact result row — no big box, just a clean info strip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
          {/* Active % pill */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: s.dimotika ? 'rgba(26,115,232,0.07)' : 'var(--bg-base)', border: `1px solid ${s.dimotika ? 'rgba(26,115,232,0.2)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: '8px 14px' }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--info)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {s.dimotika ? `${s.dimotika}%` : '—'}
            </span>
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>Ενεργό ποσοστό</div>
              <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Αθήνα: ~5% · Τυπικό: 3–6%</div>
            </div>
          </div>

          {/* Apply button — only when calc fields are filled */}
          {s.dimotikaCalcCons && s.dimotikaCalcAmount && parseFloat(s.dimotikaCalcCons) > 0 && (
            <button
              onClick={() => upd({ dimotika: (parseFloat(s.dimotikaCalcAmount) / parseFloat(s.dimotikaCalcCons) * 100).toFixed(1) })}
              style={{ background: 'var(--info)', color: '#fff', border: 'none', borderRadius: T.radius.btn, padding: '8px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
              Εφαρμογή {(parseFloat(s.dimotikaCalcAmount) / parseFloat(s.dimotikaCalcCons) * 100).toFixed(1)}%
            </button>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            Χρησιμοποιείται αυτόματα στον υπολογισμό ρεύματος (tab Ρεύμα).
          </span>
        </div>
      </div>

      {/* ── Internet & Σταθερό Τηλέφωνο ──────────────────────────────────── */}
      <div style={card}>
        {secHdr('Internet & Σταθερό Τηλέφωνο', { url: 'https://www.eett.gr/opencms/opencms/EETT/Electronic_Communications/Market360/', text: 'ΕΕΤΤ 360° Σύγκριση →' })}
        <div style={g2}>
          <CustomSelect label="Πάροχος" value={s.internetProvider}
            onChange={v => upd({ internetProvider: v, internetPlanId: '', internetPrice: '', internetSpeed: '' })}
            options={INTERNET_PROVIDERS.map(p => ({ value: p.value, label: p.label }))}/>
          {planOptions.length > 0 ? (
            <CustomSelect label="Πρόγραμμα (επίσημες τιμές)" value={s.internetPlanId}
              onChange={v => {
                const plan = (INTERNET_PLANS[s.internetProvider] || []).find(p => p.id === v);
                upd({ internetPlanId: v, internetPlan: plan?.name || '', internetSpeed: plan?.speed || '', internetPrice: plan ? String(plan.price) : '', internetPhone: plan?.hasPhone || false });
              }}
              options={[{ value: '', label: '— Επιλογή προγράμματος —' }, ...planOptions]}/>
          ) : (
            <TextInput label="Ονομασία Προγράμματος" value={s.internetPlan} onChange={v => upd({ internetPlan: v })} placeholder="Παράδειγμα: Fiber 500"/>
          )}
          <TextInput   label="Ταχύτητα"            value={s.internetSpeed} onChange={v => upd({ internetSpeed: v })} placeholder="Παράδειγμα: 500/200 Mbps"/>
          <NumberInput label="Μηνιαίο Κόστος (€)"  value={s.internetPrice} onChange={v => upd({ internetPrice: v })} suffix="€" step={1}/>
        </div>

        {selectedPlan && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '11px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: T.font.sans }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--info)', flexShrink: 0 }}/>
            <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{selectedPlan.note} · {selectedPlan.hasPhone ? 'Περιλαμβάνει σταθερό τηλέφωνο' : 'Χωρίς σταθερό τηλέφωνο'}</span>
            {provData?.url && (
              <a href={provData.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
                Επίσημη σελίδα {provData.label} →
              </a>
            )}
          </div>
        )}

        <div style={g3}>
          <DatePicker  label="Λήξη Συμβολαίου"                      value={s.internetContractEnd || ''} onChange={v => upd({ internetContractEnd: v })}/>
          <NumberInput label="Πραγματική Ταχύτητα Download (Mbps)"   value={s.internetSpeedReal || ''}  onChange={v => upd({ internetSpeedReal: v })} suffix="Mbps" step={10}/>
          <div style={{ display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end', paddingBottom: 2 }}>
            {s.internetSpeedReal && s.internetSpeed && (() => {
              const pct = parseFloat(s.internetSpeed) > 0 ? Math.round((parseFloat(s.internetSpeedReal) / parseFloat(s.internetSpeed)) * 100) : 0;
              const good = pct >= 80;
              return (
                <div style={{ background: good ? 'rgba(52,168,83,0.07)' : 'rgba(242,153,0,0.07)', border: `1px solid ${good ? 'rgba(52,168,83,0.25)' : 'rgba(242,153,0,0.25)'}`, borderRadius: T.radius.inner, padding: '10px 14px' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: good ? 'var(--positive)' : 'var(--warning)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{pct}%</div>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{good ? 'Καλή απόδοση' : 'Μειωμένη ταχύτητα'}</div>
                </div>
              );
            })()}
            {(!s.internetSpeedReal || !s.internetSpeed) && (
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
                Μέτρησε στο{' '}<a href="https://www.speedtest.net" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>speedtest.net</a>
              </div>
            )}
          </div>
        </div>

        {/* Contract renewal alert */}
        {s.internetContractEnd && (() => {
          const days = Math.ceil((new Date(s.internetContractEnd).getTime() - Date.now()) / 86400000);
          if (days > 90 || days < 0) return null;
          return (
            <div style={{ background: days <= 14 ? 'rgba(197,34,31,0.07)' : 'rgba(242,153,0,0.07)', border: `1px solid ${days <= 14 ? 'rgba(197,34,31,0.25)' : 'rgba(242,153,0,0.25)'}`, borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontFamily: T.font.sans }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: days <= 14 ? 'var(--negative)' : 'var(--warning)', flexShrink: 0 }}/>
              <span style={{ color: 'var(--text-secondary)' }}>
                Λήξη συμβολαίου Internet σε{' '}
                <strong style={{ color: days <= 14 ? 'var(--negative)' : 'var(--warning)' }}>{days} ημέρες</strong>
                {' '}— Σύγκρινε στο ΕΕΤΤ 360° για καλύτερη τιμή.
              </span>
            </div>
          );
        })()}

        <div style={{ marginBottom: 12 }}>
          <Toggle on={s.internetPhone} onChange={v => upd({ internetPhone: v })} label="Περιλαμβάνει Σταθερό Τηλέφωνο" labelOff="Χωρίς Σταθερό Τηλέφωνο"/>
        </div>

        {s.internetPhone && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, marginBottom: 12, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Τι περιλαμβάνει το σταθερό τηλέφωνο</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 10 }}>
              {[
                { key: 'phoneLocal',  label: 'Απεριόριστες κλήσεις εντός', val: s.phoneLocal  },
                { key: 'phoneMobile', label: 'Κλήσεις σε κινητά',          val: s.phoneMobile },
                { key: 'phoneIntl',   label: 'Διεθνείς κλήσεις',           val: s.phoneIntl   },
                { key: 'phoneVoip',   label: 'VoIP / App',                  val: s.phoneVoip   },
              ].map(f => (
                <div key={f.key} onClick={() => upd({ [f.key]: !f.val } as any)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: f.val ? 'rgba(52,168,83,0.08)' : 'var(--bg-base)', border: `1px solid ${f.val ? 'var(--positive)' : 'var(--border-subtle)'}`, borderRadius: T.radius.btn, padding: '7px 14px', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: f.val ? 'var(--positive)' : 'var(--border-default)', flexShrink: 0 }}/>
                  <span style={{ fontSize: 11, color: f.val ? 'var(--positive)' : 'var(--text-secondary)', fontWeight: f.val ? 600 : 400, fontFamily: T.font.sans }}>{f.label}</span>
                </div>
              ))}
            </div>
            <TextInput label="Σημειώσεις πακέτου" value={s.phoneNotes} onChange={v => upd({ phoneNotes: v })} placeholder="Παράδειγμα: 100 λεπτά διεθνή, αποκλείονται premium..."/>
          </div>
        )}

        {(INTERNET_PLANS[s.internetProvider] || []).length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Διαθέσιμα Προγράμματα {provData?.label}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 500 }}>
                <thead>
                  <tr>{['Πρόγραμμα','Ταχύτητα','Σταθερό Τηλέφωνο','Δέσμευση','Μηνιαίο','Ετήσιο'].map((h, i) => (
                    <th key={i} style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 600, fontFamily: T.font.sans, background: 'var(--bg-elevated)', whiteSpace: 'nowrap' as const }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {(INTERNET_PLANS[s.internetProvider] || []).map(plan => {
                    const isCur = plan.id === s.internetPlanId;
                    return (
                      <tr key={plan.id}
                        onClick={() => upd({ internetPlanId: plan.id, internetPlan: plan.name, internetSpeed: plan.speed, internetPrice: String(plan.price), internetPhone: plan.hasPhone })}
                        style={{ cursor: 'pointer', background: isCur ? 'rgba(26,115,232,0.08)' : 'transparent', transition: 'background 0.15s' }}>
                        <td style={{ padding: '7px 10px', fontWeight: isCur ? 700 : 400, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{plan.name}{isCur ? ' ✓' : ''}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 10 }}>{plan.speed}</td>
                        <td style={{ padding: '7px 10px', color: plan.hasPhone ? 'var(--positive)' : 'var(--text-tertiary)', fontWeight: 700, textAlign: 'center' as const }}>{plan.hasPhone ? '✓' : '—'}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-tertiary)', fontSize: 10, fontFamily: T.font.sans }}>{plan.contract || 'Χωρίς δέσμευση'}</td>
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const }}>{fe(plan.price)}</td>
                        <td style={{ padding: '7px 10px', color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 10, whiteSpace: 'nowrap' as const }}>{fe(plan.price * 12)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {benchmarkBar(internetCost, BENCHMARKS.internet.avg, BENCHMARKS.internet.label)}

        {/* FIX: "Συνδρομητική Τηλεόραση" (was "PAY TV") */}
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans, flex: 1 }}>Συνδρομητική Τηλεόραση</span>
            <Toggle on={s.hasTV} onChange={v => upd({ hasTV: v })} label="Ενεργό" labelOff="Δεν έχω"/>
          </div>
          {s.hasTV && (
            <>
              {/* FIX: 3 cols + separate toggle row — avoids Sports Package label truncation */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 12 }}>
                <CustomSelect label="Πάροχος" value={s.tvProvider} onChange={v => upd({ tvProvider: v })}
                  options={[{ value: 'cosmote', label: 'Cosmote TV' },{ value: 'nova', label: 'Nova / EON' },{ value: 'skyshowtime', label: 'SkyShowtime' },{ value: 'other', label: 'Άλλος' }]}/>
                <TextInput   label="Πρόγραμμα / Πακέτο"  value={s.tvPlan}  onChange={v => upd({ tvPlan: v })}  placeholder="Παράδειγμα: Cosmote TV Start"/>
                <NumberInput label="Μηνιαίο Κόστος (€)"   value={s.tvPrice} onChange={v => upd({ tvPrice: v })} suffix="€" step={1}/>
              </div>
              <Toggle on={s.tvHasSports} onChange={v => upd({ tvHasSports: v })} label="Sports Package ενεργό" labelOff="Χωρίς Sports Package"/>
            </>
          )}
        </div>
      </div>

      {/* ── Νερό ─────────────────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Νερό')}
        {/* FIX: 2+2 layout — prevents label overflow on narrow screens */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
          <CustomSelect label="Πάροχος" value={s.waterProvider}  onChange={v => upd({ waterProvider: v })}  options={WATER_PROVIDERS.map(p => ({ value: p.value, label: p.label }))}/>
          <CustomSelect
            label="Συχνότητα Χρέωσης"
            value={s.waterPeriodMonths || '2'}
            onChange={v => upd({ waterPeriodMonths: v })}
            options={[
              { value: '1', label: 'Μηνιαίος' },
              { value: '2', label: 'Διμηνιαίος (κάθε 2 μήνες)' },
              { value: '3', label: 'Τριμηνιαίος (κάθε 3 μήνες)' },
              { value: '4', label: 'Τετραμηνιαίος (κάθε 4 μήνες)' },
              { value: '6', label: 'Εξαμηνιαίος (κάθε 6 μήνες)' },
            ]}
          />
          <NumberInput  label="Λογαριασμός Νερού (€)" value={s.waterBiMonthly}
            onChange={v => upd({ waterBiMonthly: v, waterMonthly: v ? String(((parseFloat(v) || 0) / (parseInt(s.waterPeriodMonths || '2') || 2)).toFixed(2)) : '' })}
            suffix="€" step={5}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
          <NumberInput  label="Μηνιαία Αναγωγή (€)"   value={s.waterMonthly}  onChange={v => upd({ waterMonthly: v })}  suffix="€"      step={2}/>
          <NumberInput  label="Άτομα στο ακίνητο"      value={s.waterPersons}  onChange={v => upd({ waterPersons: v })}  suffix="άτομα"  step={1}/>
        </div>
        {waterM > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, border: '1px solid var(--border-subtle)' }}>
            Μηνιαίο: <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(waterM)}</strong>
            {s.waterPersons && parseInt(s.waterPersons) > 0 && (
              <span style={{ marginLeft: 14 }}>Ανά άτομο: <strong style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(waterM / parseInt(s.waterPersons))}</strong> / μήνα</span>
            )}
            {waterData?.url && <a href={waterData.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 14, fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Επίσημη σελίδα {waterData.label} →</a>}
          </div>
        )}
        {benchmarkBar(waterM * 2, 24, BENCHMARKS.water.label)}
      </div>

      {/* ── Θέρμανση ─────────────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Θέρμανση')}
        <div style={g3}>
          <CustomSelect label="Τύπος Θέρμανσης" value={s.heatingType} onChange={v => upd({ heatingType: v })} options={HEATING_TYPES}/>
          {['autonomous_gas','central_gas','district','autonomous_heat_pump','autonomous_ac','autonomous_wood'].includes(s.heatingType) && (
            <NumberInput label="Μέσο Μηνιαίο Κόστος (€)" value={s.heatingMonthly} onChange={v => upd({ heatingMonthly: v })} suffix="€" step={5}/>
          )}
          {s.heatingType === 'autonomous_oil' && (
            <><NumberInput label="Λίτρα / έτος"     value={s.heatingLitersPerYear}    onChange={v => upd({ heatingLitersPerYear: v })}    suffix="L"   step={50}/><NumberInput label="Τιμή / λίτρο (€)" value={s.heatingOilPricePerLiter} onChange={v => upd({ heatingOilPricePerLiter: v })} suffix="€" step={0.01}/></>
          )}
          {s.heatingType === 'autonomous_pellet' && (
            <><NumberInput label="Kg / έτος"     value={s.heatingKgPellet}    onChange={v => upd({ heatingKgPellet: v })}    suffix="kg" step={50}/><NumberInput label="Τιμή / kg (€)" value={s.heatingPelletPrice} onChange={v => upd({ heatingPelletPrice: v })} suffix="€" step={0.01}/></>
          )}
          {['central_oil','central_gas'].includes(s.heatingType) && (
            <NumberInput label="Μερίδιο Ιδιοκτησίας %" value={s.heatingCentralShare} onChange={v => upd({ heatingCentralShare: v })} suffix="%" step={1}/>
          )}
        </div>
        {heatingM > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '12px 16px', border: '1px solid var(--border-subtle)', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' as const, marginBottom: 6 }}>
              {[{ label: 'Μέσο Μηνιαίο', value: fe(heatingM) },{ label: 'Εκτιμώμενο Ετήσιο', value: fe(heatingM * 12) }].map((k, i) => (
                <div key={i}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, marginBottom: 4, fontFamily: T.font.sans }}>{k.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
              Μέσος Όρος: Φυσικό αέριο ~0.08 €/kWh · Πετρέλαιο ~0.10 €/kWh · Αντλία θερμότητας ~0.06 €/kWh — 2026
            </div>
          </div>
        )}
        {benchmarkBar(heatingM, BENCHMARKS.heating.avg, BENCHMARKS.heating.label)}
      </div>

      {/* ── Φυσικό Αέριο → μετακόμισε σε αφιερωμένο tab ─────────────────────── */}
      <div style={{ background: 'rgba(249,115,22,0.05)', border: '1px solid rgba(249,115,22,0.18)', borderRadius: T.radius.card, padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: T.radius.inner, background: 'rgba(249,115,22,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><path d="M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-1.5-.5-2.5-1.5-4 .5 2-.5 3-1.5 2.5.5-2-.5-4-2-5.5z"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 2 }}>Το Φυσικό Αέριο έχει το δικό του tab</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>Σύγκριση 7 παρόχων με πραγματικά τιμολόγια, διαχειριστές δικτύου (ΕΔΑ Αττικής/ΘΕΣΣ/ΔΕΔΑ) και ζωντανές ειδοποιήσεις σύμβασης.</div>
        </div>
      </div>

      {/* ── Security & Συναγερμός ─────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Security & Συναγερμός')}
        <div style={g3}>
          <CustomSelect label="Εταιρεία"            value={s.securityCompany}  onChange={v => upd({ securityCompany: v })}  options={SECURITY_COMPANIES.map(c => ({ value: c.value, label: c.label }))}/>
          <TextInput    label="Πρόγραμμα / Πακέτο" value={s.securityPlan}    onChange={v => upd({ securityPlan: v })}    placeholder="Παράδειγμα: Basic Monitor"/>
          <NumberInput  label="Μηνιαίο Κόστος (€)" value={s.securityMonthly} onChange={v => upd({ securityMonthly: v })} suffix="€" step={2}/>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const, marginBottom: 12 }}>
          <Toggle on={s.securityHasRemote} onChange={v => upd({ securityHasRemote: v })} label="Τηλεχειρισμός μέσω App" labelOff="Χωρίς τηλεχειρισμό"/>
          <Toggle on={s.securityHasCamera} onChange={v => upd({ securityHasCamera: v })} label="Κάμερες"                 labelOff="Χωρίς κάμερες"/>
          <Toggle on={s.securityHasDoor}   onChange={v => upd({ securityHasDoor: v })}   label="Αυτόματη Πόρτα"         labelOff="Χωρίς αυτόματη πόρτα"/>
        </div>
        {securityM > 0 && secData?.url && (
          <a href={secData.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans }}>
            Επίσημη σελίδα {secData.label} →
          </a>
        )}
        {benchmarkBar(securityM, BENCHMARKS.security.avg, BENCHMARKS.security.label)}
      </div>

      {/* ── Σύνοψη Παρόχων ───────────────────────────────────────────────── */}
      {totalM > 0 && (
        <div style={card}>
          {secHdr('Σύνοψη Παρόχων')}
          {[
            { label: 'Internet',               amount: internetCost, skip: !internetCost },
            { label: s.tvProvider === 'cosmote' ? 'Cosmote TV' : 'Συνδρομητική TV', amount: tvCost, skip: !s.hasTV },
            { label: 'Νερό',                   amount: waterM,       skip: !waterM      },
            { label: 'Θέρμανση',               amount: heatingM,     skip: !heatingM    },
            { label: 'Security',               amount: securityM,    skip: !securityM   },
          ].filter(r => !r.skip && r.amount > 0).map((r, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{r.label}</span>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(r.amount)} / μήνα</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(r.amount * 12)} / έτος</span>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalM > 0 ? (r.amount / totalM) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 2 }}/>
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans }}>Σύνολο Παρόχων</span>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(totalM)} / μήνα</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(totalM * 12)} / έτος</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}