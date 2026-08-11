'use client';

import { daysUntil } from '@/lib/core/time';
import { NumberInput, CustomSelect, TextInput, Toggle, ToggleField, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { T, fe, feRate, fieldRow, fixedCols, fp, Spinner, pressable } from '@/components/Theme';
import { waterMonthly, waterMonthlyText } from '@/lib/energy/tariff';

const INTERNET_PROVIDERS = [
  { value: 'cosmote',   label: 'Cosmote',   url: 'https://www.cosmote.gr',    color: '#009fe3' },
  { value: 'nova',      label: 'Nova',       url: 'https://www.nova.gr',       color: '#e4002b' },
  { value: 'vodafone',  label: 'Vodafone',   url: 'https://www.vodafone.gr',   color: '#e60000' },
  { value: 'inalan',    label: 'Inalan',     url: 'https://www.inalan.gr',     color: '#0073ff' },
  { value: 'hol',       label: 'HOL',        url: 'https://www.hol.gr',        color: '#f97316' },

  { value: 'dei',       label: 'ΔΕΗ Telecom', url: 'https://www.dei.gr',         color: '#1a7fe0' },
  { value: 'other',     label: 'Άλλος',       url: '',                           color: '#94a3b8' },
];

// ═══════════════════════════════════════════════════════════════════════════
// ΤΑ ΠΑΚΕΤΑ ΣΥΝΔΡΟΜΗΤΙΚΗΣ ΤΗΛΕΟΡΑΣΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΗΤΑΝ ΑΔΕΙΟΣ, ΚΑΙ ΣΩΣΤΑ: οι τιμές των πακέτων αλλάζουν, και το μόνο που τα
// κάνει χρήσιμα είναι να είναι ΣΩΣΤΑ. Ένα επινοημένο «Cosmote TV Full, 30 €»
// δεν είναι προσέγγιση — είναι λάθος νούμερο σε οθόνη που ο ιδιοκτήτης θα
// συγκρίνει με τον λογαριασμό του. Γέμισε από τις επίσημες σελίδες.
//
// ΤΙ ΜΠΗΚΕ ΚΑΙ ΤΙ ΟΧΙ. Μόνο πακέτα ΣΚΕΤΗΣ τηλεόρασης. Οι συνδυασμοί με
// internet (Fiber 100 με Vodafone TV, Double Play με Τηλεόραση) ΔΕΝ μπαίνουν
// εδώ: είναι προγράμματα σύνδεσης και ζουν στο INTERNET_PLANS. Αν έμπαιναν και
// στα δύο, το ίδιο ποσό θα μετριόταν δύο φορές στο μηνιαίο σύνολο.
//
// ΤΟ `sports` ΕΙΝΑΙ Ο ΛΟΓΟΣ ΠΟΥ ΥΠΑΡΧΕΙ Ο ΠΙΝΑΚΑΣ: όταν το πακέτο περιέχει
// αθλητικά κανάλια, ο διακόπτης ανάβει μόνος του. Ο χρήστης δεν ξαναδηλώνει
// κάτι που ήδη είπε διαλέγοντας το πακέτο. Ανάβει, δεν σβήνει: πακέτο χωρίς
// αθλητικά δεν σημαίνει ότι δεν έχει ξεχωριστή συνδρομή.
//
// ΟΙ ΤΙΜΕΣ ΠΕΡΙΛΑΜΒΑΝΟΥΝ ΦΠΑ 24%, όπως τις δείχνουν οι πάροχοι. Όπου η τιμή δεν
// επιβεβαιώνεται, μπαίνει το πακέτο χωρίς ποσό και το γράφει ο χρήστης.
// ═══════════════════════════════════════════════════════════════════════════
const TV_PROVIDERS = [
  { value: 'cosmote',     label: 'Cosmote TV',  url: 'https://www.cosmote.gr/static/residential/el/cosmote-tv-packs' },
  { value: 'nova',        label: 'Nova / EON',  url: 'https://nova.gr/eon-tv/programmata/eon' },
  { value: 'vodafone',    label: 'Vodafone TV', url: 'https://www.vodafone.gr/tv' },
  { value: 'skyshowtime', label: 'SkyShowtime', url: 'https://www.skyshowtime.com/gr' },
  { value: 'other',       label: 'Άλλος',       url: '' },
];

interface TvPack { id: string; name: string; price?: number; sports?: boolean }

const TV_PACKS: Record<string, TvPack[]> = {
  cosmote: [
    // Πακέτα συμβολαίου
    { id: 'cos_entry',        name: 'Entry', price: 8.15 },
    { id: 'cos_cinema',       name: 'Cinema', price: 10.90 },
    { id: 'cos_sports',       name: 'Sports', price: 25.45, sports: true },
    { id: 'cos_full',         name: 'Full', price: 28.20, sports: true },
    // Μηνιαία, χωρίς δέσμευση
    { id: 'cos_ent_m',        name: 'Entertainment, χωρίς δέσμευση', price: 16.00 },
    { id: 'cos_sports_m',     name: 'Sports, χωρίς δέσμευση', price: 30.82, sports: true },
    { id: 'cos_full_m',       name: 'Full, χωρίς δέσμευση', price: 33.54, sports: true },
    // Με Netflix
    { id: 'cos_cinema_nflx',  name: 'Cinema και Netflix', price: 17.90 },
    { id: 'cos_full_nflx',    name: 'Full και Netflix', price: 35.17, sports: true },
    // Μέσω δορυφόρου
    { id: 'cos_sat_family',   name: 'Family, μέσω δορυφόρου', price: 11.73 },
    { id: 'cos_sat_cinema',   name: 'Cinema, μέσω δορυφόρου', price: 15.36 },
    { id: 'cos_sat_sports',   name: 'Sports, μέσω δορυφόρου', price: 27.18, sports: true },
    { id: 'cos_sat_full',     name: 'Full, μέσω δορυφόρου', price: 29.91, sports: true },
  ],
  nova: [
    { id: 'eon_nobox',   name: 'EON, χωρίς Smart Box', price: 10, sports: true },
    { id: 'eon',         name: 'EON', price: 12, sports: true },
    { id: 'eonp_nobox',  name: 'EON+, χωρίς Smart Box', price: 26, sports: true },
    { id: 'eonp',        name: 'EON+', price: 28, sports: true },
  ],
  vodafone: [
    { id: 'vf_start', name: 'Vodafone TV Start', price: 3.90 },
  ],
  // ΤΑ ΔΥΟ ΑΚΡΙΒΟΤΕΡΑ ΠΑΚΕΤΑ ΤΟΥ SKYSHOWTIME ΜΠΑΙΝΟΥΝ ΧΩΡΙΣ ΤΙΜΗ, ΕΠΙΤΗΔΕΣ.
  // Η πηγή που τα αναφέρει γράφει «περίπου» και για τα δύο. Ένα «περίπου» σε
  // πεδίο που αθροίζεται παύει να είναι επιφύλαξη και γίνεται νούμερο: ο χρήστης
  // βλέπει σύνολο που δεν συμφωνεί με την κάρτα του και ψάχνει τη διαφορά. Το
  // όνομα του πακέτου το ξέρουμε, οπότε δίνεται· το ποσό το γράφει ο ίδιος στο
  // διπλανό πεδίο.
  skyshowtime: [
    { id: 'sky_ads',   name: 'Standard, με διαφημίσεις', price: 4.99 },
    { id: 'sky_std',   name: 'Standard, χωρίς διαφημίσεις' },
    { id: 'sky_prem',  name: 'Premium' },
  ],
};

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
    { id:'c_5g50',     name: '5G WiFi Double Play 50',      speed: '50 Mbps',   price: 30.90, hasPhone: true,  note: 'Ασύρματο 5G, Internet backup. Χωρίς καλωδίωση.', networkType: '5G', backup: true },
    { id:'c_5g300',    name: '5G WiFi Double Play 300',     speed: '300 Mbps',  price: 35.90, hasPhone: true,  note: 'Ασύρματο 5G, Internet backup. Χωρίς καλωδίωση.', networkType: '5G', backup: true },
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
    { id:'v_ff500_tv', name: 'Full Fiber 500 + Vodafone TV', speed: '500 Mbps', price: 51.00, hasPhone: true, hasTV: true, note: 'FTTH + Vodafone TV + αποκωδικοποιητής +2,50 €.', networkType: 'Fiber', contract: '24 μήνες' },
    { id:'v_ff1g_tv',  name: 'Full Fiber 1 Gbps + TV',       speed: '1 Gbps',   price: 58.00, hasPhone: true, hasTV: true, note: 'FTTH + Vodafone TV + αποκωδικοποιητής +2,50 €.', networkType: 'Fiber', contract: '24 μήνες' },
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
    { id:'i_300_st',   name: 'Φοιτητικό 300 Mbps',         speed: '300/300 Mbps συμμετρικό', price: 14.00, hasPhone: false, note: 'Φοιτητικό, χωρίς δέσμευση. Απαιτείται φοιτητική ταυτότητα ή ΑΜΚΑ. Δωρεάν εγκατάσταση.', networkType: 'Fiber', student: true },
    { id:'i_1g_st',    name: 'Φοιτητικό 1 Gbps',           speed: '1 Gbps/1 Gbps συμμετρικό', price: 28.00, hasPhone: false, note: 'Φοιτητικό, χωρίς δέσμευση. Απαιτείται φοιτητική ταυτότητα ή ΑΜΚΑ.', networkType: 'Fiber', student: true },
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
  water:    { avg: 12.00, label: 'Μέσος Όρος Αττικής, ~24 € / 2 μήνες' },
  heating:  { avg: 70.00, label: 'Μέσος Όρος χειμώνα'               },
  gas:      { avg: 40.00, label: 'Μέσος Όρος οικιακό'               },
  security: { avg: 18.00, label: 'Μέσος Όρος αγοράς'                },
};

const DEFAULTS = {
  internetProvider: 'cosmote', internetPlanId: '', internetPlan: '',
  internetSpeed: '', internetPrice: '', internetPhone: false,
  internetContractEnd: '', internetSpeedReal: '',
  phoneLocal: true, phoneMobile: false, phoneIntl: false, phoneVoip: false, phoneNotes: '',
  // FIX: "Συνδρομητική τηλεόραση" label
  hasTV: false, tvProvider: 'cosmote', tvPlanId: '', tvPlan: '', tvPrice: '', tvHasSports: false,
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

/**
 * ΜΙΑ ΚΑΡΤΑ, ΜΙΑ ΕΝΟΤΗΤΑ. Το πάνελ κρατούσε πέντε άσχετα θέματα μαζί (internet,
 * τηλεόραση, νερό, θέρμανση, συναγερμό) και άνοιγε ολόκληρο όποια κάρτα κι αν
 * πατούσες. Το `only` λέει ποιο θέμα ζήτησε ο χρήστης· τα υπόλοιπα δεν
 * αποδίδονται καθόλου.
 */
export type ProviderScope = 'internet' | 'water' | 'heating' | 'security';

interface Props { propertyId: string; userId?: string; only?: ProviderScope; }

export default function BillsProviders({ propertyId, userId = '', only }: Props) {
  const show = (k: ProviderScope) => !only || only === k;
  const [s, upd, loading] = useBillsSettings(propertyId, userId, 'providers', DEFAULTS);

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  // ΤΡΕΙΣ ΡΥΘΜΙΣΕΙΣ ΠΛΕΓΜΑΤΟΣ ΣΤΟΝ ΙΔΙΟ ΚΑΤΑΛΟΓΟ ΕΔΙΝΑΝ ΤΡΕΙΣ ΔΕΞΙΕΣ ΑΚΡΕΣ.
  // Το Internet σταματούσε στα 1.290, το Νερό στα 890, η Θέρμανση στα 590 — και
  // καμία από τις τρεις δεν έφτανε στην άκρη της κάρτας. Το μάτι δεν διαβάζει
  // «τρεις ενότητες», διαβάζει σκάλα. Τώρα κάθε σειρά πιάνει ΟΛΟ το πλάτος και
  // μοιράζεται ίσα: μία αριστερή άκρη, μία δεξιά, όσες στήλες χρειάζεται η κάθε
  // ενότητα. Το ελάχιστο κρατά τα στενά πεδία αναγνώσιμα.
  const g2: React.CSSProperties   = { ...fieldRow(200), marginBottom: 14 };
  const g3: React.CSSProperties   = { ...fieldRow(190), marginBottom: 14 };
  const g4: React.CSSProperties   = { ...fieldRow(160), marginBottom: 14 };

  const internetCost = parseFloat(s.internetPrice) || 0;
  const tvCost       = s.hasTV ? (parseFloat(s.tvPrice) || 0) : 0;
  const waterM       = waterMonthly(s);
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
  const tvPackOptions = (TV_PACKS[s.tvProvider] || []).map(p => ({
    value: p.id,
    label: p.price ? `${p.name} · ${fe(p.price)}` : p.name,
  }));
  const planOptions  = (INTERNET_PLANS[s.internetProvider] || []).sort((a, b) => a.price - b.price).map(p => ({
    value: p.id,
    label: [
      p.name,
      p.speed,
      p.price > 0 ? `${fe(p.price)}/μήνα` : '',
      p.student ? '(Φοιτητικό)' : '',
      p.backup ? '(Backup 5G)' : '',
      p.hasTV ? '+ TV' : '',
    ].filter(Boolean).join(', ')
  }));
  const selectedPlan = (INTERNET_PLANS[s.internetProvider] || []).find(p => p.id === s.internetPlanId);
  const secData      = SECURITY_COMPANIES.find(c => c.value === s.securityCompany);
  const waterData    = WATER_PROVIDERS.find(p => p.value === s.waterProvider);
  const gasData      = GAS_PROVIDERS.find(p => p.value === s.gasProvider);

  // ── ΤΟ ΟΝΟΜΑ ΤΟΥ ΠΕΔΙΟΥ ΓΡΑΦΕΤΑΙ ΜΙΑ ΦΟΡΑ, ΚΑΙ ΕΛΕΓΧΕΤΑΙ ──────────────────
  // Οι διακόπτες του σταθερού τηλεφώνου ενημερώνονταν με υπολογισμένο κλειδί,
  // `upd({ [f.key]: !f.val })`. Εκεί ο TypeScript βλέπει σκέτο `string`, άρα το
  // αντικείμενο δεν ταιριάζει στο `Partial` των ρυθμίσεων — και το `as any` το
  // σιώπησε. Τίμημα: ένα ορθογραφικό λάθος στο κλειδί («phoneVoIP» αντί
  // «phoneVoip») θα έγραφε ΝΕΟ πεδίο στο jsonb της βάσης, ο διακόπτης δεν θα
  // άναβε ποτέ, και κανένα σφάλμα δεν θα εμφανιζόταν. Τώρα κάθε γραμμή κρατά τη
  // δική της ενημέρωση με ρητό όνομα πεδίου, οπότε το λάθος σκάει στη μεταγλώττιση.
  //
  // Το `tip` υπάρχει μόνο σε μία γραμμή· δηλώνεται προαιρετικό στον τύπο, αντί
  // να διαβάζεται με `(f as any).tip`.
  const phoneFeatures: { key: string; label: string; val: boolean; toggle: () => void; tip?: string }[] = [
    { key: 'phoneLocal',  label: 'Απεριόριστες κλήσεις εντός', val: s.phoneLocal,  toggle: () => upd({ phoneLocal:  !s.phoneLocal  }) },
    { key: 'phoneMobile', label: 'Κλήσεις σε κινητά',          val: s.phoneMobile, toggle: () => upd({ phoneMobile: !s.phoneMobile }) },
    { key: 'phoneIntl',   label: 'Διεθνείς κλήσεις',           val: s.phoneIntl,   toggle: () => upd({ phoneIntl:   !s.phoneIntl   }) },
    { key: 'phoneVoip',   label: 'VoIP / App',                 val: s.phoneVoip,   toggle: () => upd({ phoneVoip:   !s.phoneVoip   }), tip: 'Κλήσεις μέσω διαδικτύου ή εφαρμογής (VoIP), π.χ. Viber, WhatsApp, Skype' },
  ];

  const secHdr = (label: string, link?: { url: string; text: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans, flex: 1 }}>{label}</span>
      {link?.url && (
        <a href={link.url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.pill, padding: '3px 10px', whiteSpace: 'nowrap' as const }}>
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
          <span style={{ fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
            {isHigh ? `+${fp(((current / avg - 1) * 100))} πάνω από τον μέσο όρο` : isLow ? `-${fp(((1 - current / avg) * 100))} κάτω από τον μέσο όρο` : 'Στο μέσο όρο'}
          </span>
        </div>
        <div style={{ position: 'relative', height: 6, background: 'var(--bg-overlay)', borderRadius: 3 }}>
          <div style={{ position: 'absolute', left: '50%', top: -3, width: 2, height: 12, background: 'var(--text-tertiary)', borderRadius: 3 }}/>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--series-in)', borderRadius: 3 }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
          <span>0 €</span><span style={{ color: 'var(--text-secondary)' }}>μέσος όρος {avg} €</span><span>{fe((avg * 2))}</span>
        </div>
      </div>
    );
  };

  if (loading) return <Spinner label="Φόρτωση…" />;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* ΤΕΣΣΕΡΑ ΤΜΗΜΑΤΑ ΕΦΥΓΑΝ ΑΠΟ ΑΥΤΗ ΤΗΝ ΟΘΟΝΗ.

          Η σειρά τεσσάρων μεγάλων αριθμών στην κορυφή («Internet & TV», «Νερό
          και Θέρμανση», «Security», «Σύνολο παρόχων») έλεγε αθροίσματα
          κατηγοριών που ο χρήστης δεν άνοιξε: μπαίνεις για το νερό και το πρώτο
          που διαβάζεις είναι πόσο πληρώνεις internet. Με μία κατηγορία ανά
          πάνελ, το άθροισμα κατηγοριών το λέει ήδη η ίδια η σειρά καρτών.

          Η «Σύνοψη Παρόχων» στο τέλος επαναλάμβανε τα ίδια πέντε νούμερα μια
          τρίτη φορά, μετά τα πλακίδια και μετά τις ενότητες.

          Η κάρτα «Το φυσικό αέριο έχει τη δική του καρτέλα» ήταν διαφήμιση
          άλλης οθόνης μέσα σε αυτήν, τη στιγμή που η καρτέλα του αερίου στέκει
          δίπλα, στην ίδια σειρά καρτών.

          Ο «Υπολογισμός Ποσοστού» δημοτικών τελών ήταν ΔΕΥΤΕΡΟ αντίγραφο: η
          πραγματική δουλειά (δωδεκάμηνο ιστορικό, μέσος όρος, ποσοστό από τον
          τελευταίο λογαριασμό) ζει στους «Φόρους και υπηρεσίες». Και έγραφε σε
          πεδίο που δεν διάβαζε κανείς — ούτε ο προϋπολογισμός, ούτε η ίδια η
          οθόνη των τελών, που έψαχνε το ποσοστό σε άλλο σημείο των ρυθμίσεων. */}

      {show('internet') && (<>
        {/* ── Internet & Σταθερό Τηλέφωνο ──────────────────────────────────── */}
        <div style={card}>
          {secHdr('Internet και σταθερό τηλέφωνο', { url: 'https://www.eett.gr/opencms/opencms/EETT/Electronic_Communications/Market360/', text: 'ΕΕΤΤ 360° Σύγκριση' })}
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
              <TextInput label="Ονομασία προγράμματος" value={s.internetPlan} onChange={v => upd({ internetPlan: v })} placeholder="Παράδειγμα: Fiber 500"/>
            )}
            <NumberInput label="Μηνιαίο κόστος"  value={s.internetPrice} onChange={v => upd({ internetPrice: v })} suffix="€" step={1}/>
          </div>

          {selectedPlan && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '11px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: T.font.sans }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-default)', flexShrink: 0 }}/>
              <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{selectedPlan.note} · {selectedPlan.hasPhone ? 'Περιλαμβάνει σταθερό τηλέφωνο' : 'Χωρίς σταθερό τηλέφωνο'}</span>
              {provData?.url && (
                <a href={provData.url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans, whiteSpace: 'nowrap' as const }}>
                  Επίσημη σελίδα {provData.label}
                </a>
              )}
            </div>
          )}

          {/* ΔΥΟ ΣΕΙΡΕΣ ΤΩΝ ΤΡΙΩΝ, ΧΩΡΙΣΜΕΝΕΣ ΜΕ ΝΟΗΜΑ. Πάνω: ποιος, τι, πόσο.
              Κάτω: η ταχύτητα που ΥΠΟΣΧΕΤΑΙ το συμβόλαιο, ακριβώς δίπλα σε αυτήν
              που ΠΑΙΡΝΕΙΣ, και μέχρι πότε δεσμεύεσαι. Η σύγκριση των δύο
              ταχυτήτων είναι όλο το νόημα του πεδίου — και ήταν σε άλλη σειρά
              από το νούμερο με το οποίο συγκρίνεται. */}
          <div style={g3}>
            <TextInput   label="Ταχύτητα συμβολαίου" value={s.internetSpeed} onChange={v => upd({ internetSpeed: v })} placeholder="Παράδειγμα: 500/200 Mbps"/>
            <NumberInput label="Πραγματική ταχύτητα λήψης" value={s.internetSpeedReal || ''}  onChange={v => upd({ internetSpeedReal: v })} suffix="Mbps" step={10}/>
            <DatePicker  label="Λήξη συμβολαίου"                      value={s.internetContractEnd || ''} onChange={v => upd({ internetContractEnd: v })}/>
          </div>
          <div style={{ marginBottom: 14 }}>
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

          {/* Ειδοποίηση ανανέωσης συμβολαίου */}
          {s.internetContractEnd && (() => {
            const days = daysUntil(s.internetContractEnd) ?? 0;
            if (days > 90 || days < 0) return null;
            return (
              <div style={{ background: days <= 14 ? 'rgba(197,34,31,0.07)' : 'rgba(242,153,0,0.07)', border: `1px solid ${days <= 14 ? 'rgba(197,34,31,0.25)' : 'rgba(242,153,0,0.25)'}`, borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontFamily: T.font.sans }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: days <= 14 ? 'var(--negative)' : 'var(--warning)', flexShrink: 0 }}/>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Λήξη συμβολαίου Internet σε{' '}
                  <strong style={{ color: days <= 14 ? 'var(--negative)' : 'var(--warning)' }}>{days} ημέρες</strong>
                  {'. '}Σύγκρινε στο ΕΕΤΤ 360° για καλύτερη τιμή.
                </span>
              </div>
            );
          })()}

          <div style={{ marginBottom: 12 }}>
            <Toggle on={s.internetPhone} onChange={v => upd({ internetPhone: v })} label="Σταθερό τηλέφωνο"/>
          </div>

          {s.internetPhone && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, marginBottom: 12, border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Τι περιλαμβάνει το σταθερό τηλέφωνο</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const, marginBottom: 10 }}>
                {phoneFeatures.map(f => (
                  <div key={f.key} {...pressable(f.toggle)} title={f.tip}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: f.val ? 'var(--accent-soft)' : 'var(--bg-base)', border: `1px solid ${f.val ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.btn, padding: '7px 14px', cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: f.val ? 'var(--accent)' : 'var(--border-default)', flexShrink: 0 }}/>
                    <span style={{ fontSize: 11, color: f.val ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: f.val ? 600 : 400, fontFamily: T.font.sans }}>{f.label}</span>
                  </div>
                ))}
              </div>
              <TextInput label="Σημειώσεις πακέτου" value={s.phoneNotes} onChange={v => upd({ phoneNotes: v })} placeholder="Παράδειγμα: 100 λεπτά διεθνή, αποκλείονται premium…"/>
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
                          style={{ cursor: 'pointer', background: isCur ? 'var(--accent-soft)' : 'transparent', transition: 'background 0.15s' }}>
                          <td style={{ padding: '7px 10px', fontWeight: isCur ? 700 : 400, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{plan.name}{isCur ? ' ✓' : ''}</td>
                          <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 10 }}>{plan.speed}</td>
                          <td style={{ padding: '7px 10px', color: plan.hasPhone ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: 700, textAlign: 'center' as const }}>{plan.hasPhone ? 'Ναι' : 'Όχι'}</td>
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

          {/* FIX: "Συνδρομητική τηλεόραση" (was "PAY TV") */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans, flex: 1 }}>Συνδρομητική τηλεόραση</span>
              <Toggle on={s.hasTV} onChange={v => upd({ hasTV: v })} ariaLabel="Συνδρομητική τηλεόραση"/>
            </div>
            {/* ΤΑ ΑΘΛΗΤΙΚΑ ΕΙΝΑΙ ΙΔΙΟΤΗΤΑ ΤΟΥ ΠΑΚΕΤΟΥ, ΟΧΙ ΞΕΧΩΡΙΣΤΗ ΕΡΩΤΗΣΗ.
                Ο διακόπτης κρεμόταν κάτω από τη σειρά, σαν να είναι άλλο θέμα.
                Είναι η τέταρτη στήλη της ίδιας σειράς — και όταν το πακέτο που
                διάλεξες ΠΕΡΙΕΧΕΙ αθλητικά, ανάβει μόνος του: το ξέρει ήδη ο
                κατάλογος, δεν χρειάζεται να το ξαναπεί ο χρήστης. */}
            {s.hasTV && (
              <div style={fieldRow(170)}>
                <CustomSelect label="Πάροχος" value={s.tvProvider}
                  onChange={v => upd({ tvProvider: v, tvPlanId: '', tvPlan: '' })}
                  options={TV_PROVIDERS.map(p => ({ value: p.value, label: p.label }))}/>
                {tvPackOptions.length > 0 ? (
                  <CustomSelect label="Πακέτο" value={s.tvPlanId || ''}
                    onChange={v => {
                      const pack = (TV_PACKS[s.tvProvider] || []).find(x => x.id === v);
                      upd({
                        tvPlanId: v, tvPlan: pack?.name || '',
                        ...(pack?.price ? { tvPrice: String(pack.price) } : {}),
                        // Ανάβει, δεν σβήνει: ένα πακέτο χωρίς αθλητικά δεν
                        // σημαίνει ότι ο χρήστης δεν έχει ξεχωριστή συνδρομή.
                        ...(pack?.sports ? { tvHasSports: true } : {}),
                      });
                    }}
                    options={[{ value: '', label: '— Επιλογή πακέτου —' }, ...tvPackOptions]}/>
                ) : (
                  <TextInput label="Πακέτο" value={s.tvPlan} onChange={v => upd({ tvPlan: v })} placeholder="Ονομασία πακέτου"/>
                )}
                <NumberInput label="Μηνιαίο κόστος" value={s.tvPrice} onChange={v => upd({ tvPrice: v })} suffix="€" step={1}/>
                <ToggleField label="Αθλητικά" on={s.tvHasSports} onChange={v => upd({ tvHasSports: v })}/>
              </div>
            )}
          </div>
        </div>

      </>)}

      {show('water') && (<>
        {/* ── Νερό ─────────────────────────────────────────────────────────── */}
        <div style={card}>
          {secHdr('Νερό')}
          {/* ΤΕΣΣΕΡΑ ΣΤΟΙΧΕΙΑ ΤΗΣ ΙΔΙΑΣ ΠΑΡΟΧΗΣ, ΣΕ ΜΙΑ ΣΕΙΡΑ ΙΣΑ ΜΟΙΡΑΣΜΕΝΗ.
              Ήταν πέντε, και το πέμπτο έπεφτε μόνο του σε δεύτερη γραμμή. */}
          <div {...fixedCols(4, 14)} style={{ ...fixedCols(4, 14).style, marginBottom: 14 }}>
            <CustomSelect label="Πάροχος" value={s.waterProvider}  onChange={v => upd({ waterProvider: v })}  options={WATER_PROVIDERS.map(p => ({ value: p.value, label: p.label }))}/>
            {/* Η παρένθεση έλεγε ό,τι λέει ήδη η λέξη: «Διμηνιαίος (κάθε 2
                μήνες)». Ίδιο πράγμα δύο φορές, και αρκετά μακρύ ώστε να κόβεται
                με αποσιωπητικά — δηλαδή το διπλό έδιωχνε το μισό. */}
            <CustomSelect
              label="Συχνότητα χρέωσης"
              value={s.waterPeriodMonths || '2'}
              onChange={v => upd({ waterPeriodMonths: v, waterMonthly: waterMonthlyText(s.waterBiMonthly, v) })}
              options={[
                { value: '1', label: 'Μηνιαίος' },
                { value: '2', label: 'Διμηνιαίος' },
                { value: '3', label: 'Τριμηνιαίος' },
                { value: '4', label: 'Τετραμηνιαίος' },
                { value: '6', label: 'Εξαμηνιαίος' },
              ]}
            />
            <NumberInput  label="Λογαριασμός νερού" value={s.waterBiMonthly}
              onChange={v => upd({ waterBiMonthly: v, waterMonthly: waterMonthlyText(v, s.waterPeriodMonths) })}
              suffix="€" step={5}/>
            {/* ΤΟ ΠΕΔΙΟ «ΜΗΝΙΑΙΑ ΑΝΑΓΩΓΗ» ΗΤΑΝ ΝΕΚΡΟ ΚΟΥΤΙ. Ήταν ο λογαριασμός
                διά τους μήνες, δηλαδή τιμή που την ξέρει ήδη η οθόνη — και μόλις
                υπήρχε λογαριασμός, ΚΑΙ ΟΙ ΔΥΟ αναγνώστες (η σύνοψη εδώ και ο
                προϋπολογισμός) αγνοούσαν ό,τι πληκτρολογούσε ο χρήστης μέσα του.
                Έγραφε άλλο νούμερο και δεν άλλαζε τίποτα πουθενά. Ο μηνιαίος
                φαίνεται από κάτω, υπολογισμένος. */}
            <NumberInput  label="Άτομα στο ακίνητο"      value={s.waterPersons}  onChange={v => upd({ waterPersons: v })}  suffix="άτομα"  step={1}/>
          </div>
          {waterM > 0 && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '10px 14px', fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, border: '1px solid var(--border-subtle)' }}>
              Μηνιαίο: <strong style={{ color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(waterM)}</strong>
              {s.waterPersons && parseInt(s.waterPersons) > 0 && (
                <span style={{ marginLeft: 14 }}>Ανά άτομο: <strong style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(waterM / parseInt(s.waterPersons))}</strong> / μήνα</span>
              )}
              {waterData?.url && <a href={waterData.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 14, fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Επίσημη σελίδα {waterData.label}</a>}
            </div>
          )}
          {benchmarkBar(waterM * 2, 24, BENCHMARKS.water.label)}
        </div>

      </>)}

      {show('heating') && (<>
        {/* ── Θέρμανση ─────────────────────────────────────────────────────── */}
        <div style={card}>
          {secHdr('Θέρμανση')}
          <div style={g3}>
            <CustomSelect label="Τύπος θέρμανσης" value={s.heatingType} onChange={v => upd({ heatingType: v })} options={HEATING_TYPES}/>
            {['autonomous_gas','central_gas','district','autonomous_heat_pump','autonomous_ac','autonomous_wood'].includes(s.heatingType) && (
              <NumberInput label="Μέσο μηνιαίο κόστος" value={s.heatingMonthly} onChange={v => upd({ heatingMonthly: v })} suffix="€" step={5}/>
            )}
            {s.heatingType === 'autonomous_oil' && (
              <><NumberInput label="Λίτρα τον χρόνο"     value={s.heatingLitersPerYear}    onChange={v => upd({ heatingLitersPerYear: v })}    suffix="L"   step={50}/><NumberInput label="Τιμή ανά λίτρο" value={s.heatingOilPricePerLiter} onChange={v => upd({ heatingOilPricePerLiter: v })} suffix="€" step={0.01}/></>
            )}
            {s.heatingType === 'autonomous_pellet' && (
              <><NumberInput label="Kg / έτος"     value={s.heatingKgPellet}    onChange={v => upd({ heatingKgPellet: v })}    suffix="kg" step={50}/><NumberInput label="Τιμή ανά κιλό" value={s.heatingPelletPrice} onChange={v => upd({ heatingPelletPrice: v })} suffix="€" step={0.01}/></>
            )}
            {['central_oil','central_gas'].includes(s.heatingType) && (
              <NumberInput label="Μερίδιο ιδιοκτησίας" value={s.heatingCentralShare} onChange={v => upd({ heatingCentralShare: v })} suffix="%" step={1}/>
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
                Τυπικό κόστος ενέργειας 2026, ανά <span title="Κιλοβατώρα, μονάδα ενέργειας">κιλοβατώρα</span>: φυσικό αέριο περίπου {feRate(0.08)} · πετρέλαιο περίπου {feRate(0.10)} · αντλία θερμότητας περίπου {feRate(0.06)}
              </div>
            </div>
          )}
          {benchmarkBar(heatingM, BENCHMARKS.heating.avg, BENCHMARKS.heating.label)}
        </div>

      </>)}

      {show('security') && (<>
        {/* ── Security & Συναγερμός ─────────────────────────────────────────── */}
        <div style={card}>
          {secHdr('Συναγερμός και ασφάλεια χώρου')}
          <div style={g3}>
            <CustomSelect label="Εταιρεία"            value={s.securityCompany}  onChange={v => upd({ securityCompany: v })}  options={SECURITY_COMPANIES.map(c => ({ value: c.value, label: c.label }))}/>
            <TextInput    label="Πρόγραμμα ή πακέτο" value={s.securityPlan}    onChange={v => upd({ securityPlan: v })}    placeholder="Παράδειγμα: Basic Monitor"/>
            <NumberInput  label="Μηνιαίο κόστος" value={s.securityMonthly} onChange={v => upd({ securityMonthly: v })} suffix="€" step={2}/>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const, marginBottom: 12 }}>
            <Toggle on={s.securityHasRemote} onChange={v => upd({ securityHasRemote: v })} label="Τηλεχειρισμός από εφαρμογή"/>
            <Toggle on={s.securityHasCamera} onChange={v => upd({ securityHasCamera: v })} label="Κάμερες"/>
            <Toggle on={s.securityHasDoor}   onChange={v => upd({ securityHasDoor: v })}   label="Αυτόματη πόρτα"/>
          </div>
          {securityM > 0 && secData?.url && (
            <a href={secData.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans }}>
              Επίσημη σελίδα {secData.label}
            </a>
          )}
          {benchmarkBar(securityM, BENCHMARKS.security.avg, BENCHMARKS.security.label)}
        </div>

      </>)}

    </div>
  );
}