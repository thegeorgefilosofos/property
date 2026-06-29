'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

const INSURANCEMARKET_URL = 'https://www.insurancemarket.gr/asfaleia-katoikias';
const PRICEFOX_URL = 'https://www.pricefox.gr/asfalia-katoikias/';

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font: { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

// ─── Insurance data ────────────────────────────────────────────────────────────
const INSURANCE_COMPANIES = [
  { value: 'hellas_direct', label: 'Hellas Direct',       url: 'https://www.hellasdirect.gr',        agent_label: 'Ψηφιακή — χωρίς ασφαλιστή',        plans: [{ id: 'hd_basic', name: 'Basic', monthly: 8.90, annual: 89, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },{ id: 'hd_plus', name: 'Plus', monthly: 14.90, annual: 149, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Πλημμύρα','Θύελλα'], earthquake: false, flood: true, natural: true },{ id: 'hd_premium', name: 'Premium', monthly: 22.90, annual: 219, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'], earthquake: true, flood: true, natural: true }] },
  { value: 'interamerican', label: 'Interamerican',       url: 'https://www.interamerican.gr',        agent_label: 'Ασφαλιστής Interamerican',           plans: [{ id: 'ia_basic', name: 'Oikia Basic', monthly: 12.50, annual: 125, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις'], earthquake: false, flood: false, natural: false },{ id: 'ia_comfort', name: 'Oikia Comfort', monthly: 18.00, annual: 180, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις','Θεομηνία'], earthquake: false, flood: true, natural: true },{ id: 'ia_full', name: 'Oikia Full', monthly: 26.00, annual: 250, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις','Σεισμός','Πλημμύρα'], earthquake: true, flood: true, natural: true }] },
  { value: 'eurolife',      label: 'Eurolife FFH',        url: 'https://www.eurolife.gr',             agent_label: 'Σύμβουλος Eurolife FFH',             plans: [{ id: 'el_std', name: 'My Home First Standard', monthly: 12.00, annual: 120, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικές Καταστροφές'], earthquake: true, flood: true, natural: true },{ id: 'el_plus', name: 'My Home First Plus', monthly: 20.00, annual: 195, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικές Καταστροφές','Βραχυκύκλωμα'], earthquake: true, flood: true, natural: true },{ id: 'el_luxury', name: 'My Home Luxury', monthly: 30.00, annual: 290, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Καθίζηση'], earthquake: true, flood: true, natural: true }] },
  { value: 'generali',      label: 'Generali',            url: 'https://www.generali.gr',             agent_label: 'Σύμβουλος Generali',                plans: [{ id: 'gen_basic', name: 'MyHome Basic', monthly: 11.00, annual: 110, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },{ id: 'gen_plus', name: 'MyHome Plus', monthly: 16.00, annual: 155, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'], earthquake: false, flood: true, natural: true },{ id: 'gen_premium', name: 'MyHome Premium', monthly: 24.00, annual: 230, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'], earthquake: true, flood: true, natural: true }] },
  { value: 'axa',           label: 'AXA Ασφαλιστική',    url: 'https://www.axa.gr',                  agent_label: 'Σύμβουλος AXA',                      plans: [{ id: 'axa_basic', name: 'Home Basic', monthly: 9.50, annual: 95, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },{ id: 'axa_comfort', name: 'Home Comfort', monthly: 15.00, annual: 148, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'], earthquake: false, flood: true, natural: true },{ id: 'axa_premium', name: 'Home Premium', monthly: 23.00, annual: 225, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα'], earthquake: true, flood: true, natural: true }] },
  { value: 'ethniki',       label: 'Εθνική Ασφαλιστική', url: 'https://www.ethniki-asfalistiki.gr',  agent_label: 'Σύμβουλος Εθνικής',                 plans: [{ id: 'eth_oikos', name: 'Οίκος', monthly: 13.00, annual: 126, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις'], earthquake: false, flood: false, natural: false },{ id: 'eth_mega', name: 'MegaHome', monthly: 20.00, annual: 195, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'], earthquake: false, flood: true, natural: true },{ id: 'eth_ultra', name: 'UltraHome', monthly: 28.00, annual: 270, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'], earthquake: true, flood: true, natural: true }] },
  { value: 'allianz',       label: 'Allianz Hellas',      url: 'https://www.allianz.gr',              agent_label: 'Σύμβουλος Allianz',                  plans: [{ id: 'alz_basic', name: 'Allianz Home Basic', monthly: 12.00, annual: 115, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },{ id: 'alz_comfort', name: 'Allianz Home Comfort', monthly: 19.00, annual: 182, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικά Φαινόμενα'], earthquake: false, flood: true, natural: true },{ id: 'alz_premium', name: 'Allianz Home Premium', monthly: 27.00, annual: 258, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα'], earthquake: true, flood: true, natural: true }] },
  { value: 'ergo',      label: 'ERGO Ασφαλιστική',     url: 'https://www.ergo.gr',              agent_label: 'Μεσίτης / Online',
    plans: [
      { id: 'ergo_home',    name: 'Home Basic',      monthly: 10.00, annual: 99,  covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'ergo_plus',    name: 'Home Plus',       monthly: 15.50, annual: 155, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Πλημμύρα'], earthquake: false, flood: true, natural: true },
      { id: 'ergo_premium', name: 'Home Premium',    monthly: 21.00, annual: 199, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Πλημμύρα','Σεισμός'], earthquake: true, flood: true, natural: true },
    ] },
  { value: 'allianz',   label: 'Allianz Hellas',        url: 'https://www.allianz.gr',           agent_label: 'Ασφαλιστής / Online',
    plans: [
      { id: 'allianz_basic',   name: 'MeinHaus Compact', monthly: 12.00, annual: 110, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'allianz_comfort', name: 'MeinHaus Comfort',  monthly: 17.90, annual: 170, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Πλημμύρα'], earthquake: false, flood: true, natural: true },
      { id: 'allianz_full',    name: 'MeinHaus Plus',     monthly: 24.90, annual: 239, covers: ['Πλήρης + Σεισμός'], earthquake: true, flood: true, natural: true },
    ] },
  { value: 'groupama',  label: 'Groupama (myZen)',      url: 'https://www.groupama.gr',          agent_label: 'Online — myZen',
    plans: [
      { id: 'grp_basic',   name: 'myZen Basic',     monthly: 9.90,  annual: 95,  covers: ['Πυρκαγιά','Κλοπή'], earthquake: false, flood: false, natural: false },
      { id: 'grp_comfort', name: 'myZen Comfort',   monthly: 13.50, annual: 130, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Πλημμύρα'], earthquake: false, flood: true, natural: true },
      { id: 'grp_full',    name: 'myZen Full',      monthly: 19.90, annual: 189, covers: ['Πλήρης + Σεισμός'], earthquake: true, flood: true, natural: true },
    ] },
  { value: 'ethniki',   label: 'Εθνική Ασφαλιστική',   url: 'https://www.ethniki-asfalistiki.gr', agent_label: 'Ασφαλιστής',
    plans: [
      { id: 'eth_basic',   name: 'Οικία Basic',     monthly: 14.00, annual: 132, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'eth_plus',    name: 'Οικία Plus',      monthly: 19.90, annual: 190, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Πλημμύρα'], earthquake: false, flood: true, natural: true },
      { id: 'eth_premium', name: 'Οικία Premium',   monthly: 26.90, annual: 259, covers: ['Πλήρης κάλυψη + Σεισμός'], earthquake: true, flood: true, natural: true },
    ] },
  { value: 'anytime',   label: 'Anytime (Interamerican)', url: 'https://www.anytime.gr',         agent_label: 'Online — Digital',
    plans: [
      { id: 'any_basic', name: 'Home Essential',    monthly: 9.50,  annual: 90,  covers: ['Πυρκαγιά','Κλοπή'], earthquake: false, flood: false, natural: false },
      { id: 'any_plus',  name: 'Home Plus',         monthly: 13.90, annual: 135, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Πλημμύρα'], earthquake: false, flood: true, natural: true },
      { id: 'any_full',  name: 'Home Full',         monthly: 19.50, annual: 185, covers: ['Πλήρης + Σεισμός'], earthquake: true, flood: true, natural: true },
    ] },
  { value: 'other',     label: 'Άλλη Ασφαλιστική',     url: '',                                 agent_label: 'Ασφαλιστής',
    plans: [{ id: 'other_custom', name: 'Προσαρμοσμένο', monthly: 0, annual: 0, covers: [], earthquake: false, flood: false, natural: false }] },
];

const STREAMING = [
  { value: 'netflix',    label: 'Netflix',            color: '#e50914', url: 'https://www.netflix.com/gr',             plans: [{ id: 'n_basic', name: 'Βασικό — 8,99 €', price: 8.99 },{ id: 'n_standard', name: 'Standard — 12,49 €', price: 12.49 },{ id: 'n_premium', name: 'Premium 4K — 15,99 €', price: 15.99 }] },
  { value: 'disney',     label: 'Disney+',            color: '#0063e5', url: 'https://www.disneyplus.com/el-gr',        plans: [{ id: 'd_standard', name: 'Standard — 8,99 €', price: 8.99 },{ id: 'd_premium', name: 'Premium — 13,99 €', price: 13.99 }] },
  { value: 'apple_tv',   label: 'Apple TV+',          color: '#555555', url: 'https://www.apple.com/gr/apple-tv-plus', plans: [{ id: 'a_std', name: 'Apple TV+ — 9,99 €', price: 9.99 }] },
  { value: 'amazon',     label: 'Amazon Prime Video', color: '#00a8e1', url: 'https://www.primevideo.com',              plans: [{ id: 'am_std', name: 'Prime Video — 8,99 €', price: 8.99 }] },
  { value: 'max',        label: 'Max (HBO)',           color: '#0d1ce5', url: 'https://www.max.com/gr/el',              plans: [{ id: 'max_basic', name: 'Basic με διαφημίσεις — 5,99 €', price: 5.99 },{ id: 'max_std', name: 'Standard — 9,99 €', price: 9.99 },{ id: 'max_ult', name: 'Ultimate 4K — 15,99 €', price: 15.99 }] },
  { value: 'spotify',    label: 'Spotify',            color: '#1db954', url: 'https://www.spotify.com/gr',             plans: [{ id: 's_individual', name: 'Individual — 10,99 €', price: 10.99 },{ id: 's_duo', name: 'Duo — 14,99 €', price: 14.99 },{ id: 's_family', name: 'Family (6 άτομα) — 17,99 €', price: 17.99 }] },
  { value: 'youtube',    label: 'YouTube Premium',    color: '#ff0000', url: 'https://www.youtube.com/premium',        plans: [{ id: 'y_individual', name: 'Individual — 13,99 €', price: 13.99 },{ id: 'y_family', name: 'Family — 22,99 €', price: 22.99 }] },
  { value: 'ant1plus',   label: 'ANT1+',              color: '#1a56db', url: 'https://www.ant1plus.gr',                plans: [{ id: 'ant_monthly', name: 'Μηνιαία — 2,99 €', price: 2.99 }] },
  { value: 'cosmote_tv', label: 'Cosmote TV',         color: '#00adef', url: 'https://www.cosmote.gr',                 plans: [{ id: 'cos_start', name: 'Start — 6,00 €', price: 6.00 },{ id: 'cos_full', name: 'Full — 30,00 €', price: 30.00 }] },
];

const CLOUD = [
  { value: 'icloud',       label: 'iCloud+',       url: 'https://www.icloud.com',          plans: [{ id: 'ic_50', name: '50 GB — 0,99 €', price: 0.99 },{ id: 'ic_200', name: '200 GB — 2,99 €', price: 2.99 },{ id: 'ic_2t', name: '2 TB — 9,99 €', price: 9.99 }] },
  { value: 'google_one',   label: 'Google One',    url: 'https://one.google.com',          plans: [{ id: 'g_100', name: '100 GB — 1,99 €', price: 1.99 },{ id: 'g_200', name: '200 GB — 2,99 €', price: 2.99 },{ id: 'g_2t', name: '2 TB — 9,99 €', price: 9.99 }] },
  { value: 'microsoft365', label: 'Microsoft 365', url: 'https://www.microsoft.com/el-gr', plans: [{ id: 'ms_pers', name: 'Personal — 6,99 €', price: 6.99 },{ id: 'ms_fam', name: 'Family — 9,99 €', price: 9.99 }] },
  { value: 'dropbox',      label: 'Dropbox',       url: 'https://www.dropbox.com',         plans: [{ id: 'db_plus', name: 'Plus 2 TB — 9,99 €', price: 9.99 }] },
  { value: 'adobe',        label: 'Adobe CC',      url: 'https://www.adobe.com/gr',        plans: [{ id: 'ad_photo', name: 'Photography — 12,29 €', price: 12.29 }] },
];

const miniSelectStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
  borderRadius: T.radius.badge, padding: '7px 10px', color: 'var(--text-primary)',
  fontSize: 11, outline: 'none', fontFamily: T.font.sans, cursor: 'pointer',
};

interface StreamingEntry { service: string; planId: string; customPrice: string; splitPeople: number; splitActive: boolean; renewalDate: string; }
interface CloudEntry     { service: string; planId: string; customPrice: string; splitPeople: number; splitActive: boolean; renewalDate: string; }
interface OtherSub       { name: string; price: string; renewalDate: string; }

// ─── Ασφαλιστικό Comparison Engine ─────────────────────────────────────────────
// Simulates real-time insurance quotes based on property data
// When insurancemarket.gr API becomes available, replace computeQuotes() with real API call
interface LiveQuote {
  company: string;
  companyLabel: string;
  plan: string;
  planLabel: string;
  monthlyEstimate: number;
  annualEstimate: number;
  earthquake: boolean;
  flood: boolean;
  natural: boolean;
  covers: string[];
  url: string;
  confidence: 'live' | 'estimated';
  savings?: number; // vs current plan
}

function computeLiveQuotes(sqm: number, propValue: number, contentValue: number, floor: string, age: string, city: string): LiveQuote[] {
  if (!sqm || !propValue) return [];

  // Pricing factors based on property characteristics
  const sqmFactor    = Math.max(0.7, Math.min(1.5, sqm / 100));
  const valueFactor  = Math.max(0.8, Math.min(2.0, propValue / 150000));
  const contentF     = Math.max(0.9, Math.min(1.4, (contentValue || 20000) / 20000));
  const floorRisk    = floor === 'ground' ? 1.15 : floor === 'basement' ? 1.25 : 1.0;
  const ageRisk      = age === 'over_30' ? 1.20 : age === '25_30' ? 1.10 : age === 'under_5' ? 0.90 : 1.0;
  const cityRisk     = city.toLowerCase().includes('αθήν') || city.toLowerCase().includes('athen') ? 1.05 : 1.0;
  const totalFactor  = sqmFactor * valueFactor * contentF * floorRisk * ageRisk * cityRisk;

  return INSURANCE_COMPANIES
    .filter(c => c.value !== 'other')
    .flatMap(c => c.plans.map(p => {
      const base = (p as any).monthly;
      const estimate = base * totalFactor;
      return {
        company:       c.value,
        companyLabel:  c.label,
        plan:          p.id,
        planLabel:     (p as any).name,
        monthlyEstimate: Math.round(estimate * 100) / 100,
        annualEstimate:  Math.round(estimate * 12 * 100) / 100,
        earthquake:    (p as any).earthquake,
        flood:         (p as any).flood,
        natural:       (p as any).natural,
        covers:        (p as any).covers || [],
        url:           c.url,
        confidence:    'estimated' as const,
      };
    }))
    .sort((a, b) => a.monthlyEstimate - b.monthlyEstimate);
}

// ─── ΑΑΔΕ API Integration (Ready for when API launches) ──────────────────────
// Structure ready — replace fetchENFIAFromAADE with real call when API opens
interface AADEEnfiaData {
  year: number;
  totalAmount: number;
  installments: number;
  installmentAmount: number;
  propertyDetails: { sqm: number; zone: string; floor: string; ownership: number }[];
  reductions: string[];
  source: 'api' | 'manual';
}

// When ΑΑΔΕ API launches: replace this with actual API call
// Expected endpoint: GET https://api.aade.gr/v1/taxpayer/enfia?year=2026
// Auth: OAuth2 with TAXISnet credentials (user authorizes via popup)
async function fetchENFIAFromAADE(_propertyId: string, _taxisnetToken?: string): Promise<AADEEnfiaData | null> {
  // TODO: Replace with real ΑΑΔΕ API call when available:
  // const response = await fetch('https://api.aade.gr/v1/taxpayer/enfia?year=2026', {
  //   headers: { 'Authorization': `Bearer ${taxisnetToken}` }
  // });
  // const data = await response.json();
  // return { ...data, source: 'api' };

  // For now: return null (triggers manual entry UI)
  return null;
}

export default function BillsInsurance({ propertyId, userId = '' }: { propertyId: string; userId?: string }) {
  const supabase = createClient();
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 };
  const g3: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 };
  const g4: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 14 };

  // ── Cross-tab: checklist renewal ─────────────────────────────────────────
  const [checklistRenewal, setChecklistRenewal] = useState<{ daysLeft: number | null } | null>(null);
  // ── Cross-tab: property data from other tabs ─────────────────────────────
  const [crossProperty, setCrossProperty] = useState<{
    sqm?: string; zone?: string; floor?: string; age?: string;
    propValue?: string; contentValue?: string; city?: string;
  }>({});
  // ── ΑΑΔΕ API state ───────────────────────────────────────────────────────
  const [aadeData,        setAadeData]        = useState<AADEEnfiaData | null>(null);
  const [aadeLoading,     setAadeLoading]     = useState(false);
  const [aadeConnected,   setAadeConnected]   = useState(false);
  // ── Live quotes state ─────────────────────────────────────────────────────
  const [liveQuotes,      setLiveQuotes]      = useState<LiveQuote[]>([]);
  const [quotesLoading,   setQuotesLoading]   = useState(false);
  const [quotesFilter,    setQuotesFilter]    = useState<'all'|'earthquake'|'flood'|'natural'>('all');
  const [showQuotes,      setShowQuotes]      = useState(false);
  const quotesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        // Checklist
        const { data: chk } = await supabase.from('checklist_items').select('status,due_date').eq('property_id', propertyId).ilike('description', '%ασφαλιστήριο%').limit(1);
        if (chk?.[0]) setChecklistRenewal({ daysLeft: chk[0].due_date ? Math.ceil((new Date(chk[0].due_date).getTime() - Date.now()) / 86400000) : null });

        // Property data from services (ΕΝΦΙΑ has sqm, zone, floor, age)
        const { data: svc } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'services').maybeSingle();
        // Property name/address from properties table for city detection
        const { data: prop } = await supabase.from('properties').select('address,city,sqm').eq('id', propertyId).maybeSingle();
        if (svc?.data) {
          const d = svc.data as any;
          setCrossProperty({
            sqm:          d.enfiaSqm       || prop?.sqm       || '',
            zone:         d.enfiaZone      || '',
            floor:        d.enfiaFloor     || 'second',
            age:          d.enfiaAge       || '10_20',
            city:         prop?.city       || prop?.address   || '',
          });
        }
      } catch (_) {}
    })();
  }, [propertyId]);

  const [ps, updPs] = useBillsSettings(propertyId, userId, 'insurance', {
    insProvider: 'hellas_direct', insPlanId: 'hd_basic',
    insCustomPrice: '', insCustomPlanName: '',
    insAgentName: '', insAgentPhone: '', insRenewalDate: '',
    insPropValue: '', insContentValue: '',
    insCustomCovers: '', insEditCovers: false,
    insCustomEarthquake: false, insCustomFlood: false, insCustomNatural: false,
    // NEW: property details for live quotes
    insSqm: '', insFloor: 'second', insAge: '10_20', insCity: '',
    activeStreaming: [] as StreamingEntry[],
    activeCloud:     [] as CloudEntry[],
    otherSubs:       [] as OtherSub[],
  });

  const {
    insProvider, insPlanId, insCustomPrice, insCustomPlanName, insAgentName, insAgentPhone,
    insRenewalDate, insPropValue, insContentValue, insCustomCovers, insEditCovers,
    insCustomEarthquake, insCustomFlood, insCustomNatural,
    insSqm, insFloor, insAge, insCity,
    activeStreaming, activeCloud, otherSubs,
  } = ps;

  const u = (patch: any) => updPs(patch);

  // Auto-fill from cross-tab data if not manually set
  const effectiveSqm    = insSqm    || crossProperty.sqm    || '';
  const effectiveFloor  = insFloor  || crossProperty.floor  || 'second';
  const effectiveAge    = insAge    || crossProperty.age    || '10_20';
  const effectiveCity   = insCity   || crossProperty.city   || '';

  // ── Live quotes computation (debounced) ──────────────────────────────────
  useEffect(() => {
    const sqm    = parseFloat(effectiveSqm)   || 0;
    const pVal   = parseFloat(insPropValue)   || 0;
    const cVal   = parseFloat(insContentValue)|| 0;

    if (!sqm || !pVal) { setLiveQuotes([]); return; }

    if (quotesTimer.current) clearTimeout(quotesTimer.current);
    setQuotesLoading(true);
    quotesTimer.current = setTimeout(() => {
      // Simulate API latency (replace with real fetch)
      const quotes = computeLiveQuotes(sqm, pVal, cVal, effectiveFloor, effectiveAge, effectiveCity);
      // Add savings vs current plan
      const currentMonthly = parseFloat(insCustomPrice) || (insCompany?.plans.find(p => p.id === insPlanId) as any)?.monthly || 0;
      const withSavings = quotes.map(q => ({ ...q, savings: currentMonthly > 0 ? currentMonthly - q.monthlyEstimate : undefined }));
      setLiveQuotes(withSavings);
      setQuotesLoading(false);
    }, 800);

    return () => { if (quotesTimer.current) clearTimeout(quotesTimer.current); };
  }, [effectiveSqm, insPropValue, insContentValue, effectiveFloor, effectiveAge, effectiveCity, insCustomPrice, insPlanId]);

  // ── ΑΑΔΕ connect ─────────────────────────────────────────────────────────
  const connectAADE = async () => {
    // ΑΑΔΕ API δεν είναι διαθέσιμο ακόμη — ανοίγουμε myaade.gov.gr
    // Όταν ανοίξει το API: αντικατάστησε με OAuth2 flow
    setAadeLoading(true);
    try {
      // Άνοιξε το myAADE σε νέο tab
      if (typeof window !== 'undefined') {
        window.open('https://www.aade.gr/polites/forologikes-ypiresies/enfia', '_blank', 'noopener,noreferrer');
      }
      // Simulate API not available yet
      await new Promise(r => setTimeout(r, 400));
      setAadeConnected(false);
    } finally { setAadeLoading(false); }
  };

  const insCompany = INSURANCE_COMPANIES.find(c => c.value === insProvider);
  const insPlan    = insCompany?.plans.find(p => p.id === insPlanId) as any;
  const insCost    = parseFloat(insCustomPrice) || insPlan?.monthly || 0;

  const effectiveCovers     = insEditCovers && insCustomCovers ? insCustomCovers.split(',').map(s => s.trim()).filter(Boolean) : (insPlan?.covers || []);
  const effectiveEarthquake = insEditCovers ? insCustomEarthquake : (insPlan?.earthquake || false);
  const effectiveFloodState = insEditCovers ? insCustomFlood      : (insPlan?.flood      || false);
  const effectiveNatural    = insEditCovers ? insCustomNatural    : (insPlan?.natural    || false);

  const streamingCost = (activeStreaming || []).reduce((s, a) => {
    const svc  = STREAMING.find(x => x.value === a.service);
    const plan = svc?.plans.find(p => p.id === a.planId);
    const base = parseFloat(a.customPrice) || plan?.price || 0;
    return s + (a.splitActive && a.splitPeople > 1 ? base / a.splitPeople : base);
  }, 0);
  const cloudCost = (activeCloud || []).reduce((s, a) => {
    const svc  = CLOUD.find(x => x.value === a.service);
    const plan = svc?.plans.find(p => p.id === a.planId);
    const base = parseFloat(a.customPrice) || plan?.price || 0;
    return s + (a.splitActive && a.splitPeople > 1 ? base / a.splitPeople : base);
  }, 0);
  const otherCost = (otherSubs || []).reduce((s, o) => s + (parseFloat(o.price) || 0), 0);
  const total     = insCost + streamingCost + cloudCost + otherCost;

  // Renewal alerts
  const renewalAlerts: { name: string; daysLeft: number; type: 'danger'|'warning'|'info' }[] = [];
  const checkRenewal = (name: string, dateStr: string, days: number) => {
    if (!dateStr) return;
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    if (diff >= 0 && diff <= days) renewalAlerts.push({ name, daysLeft: diff, type: diff <= 3 ? 'danger' : diff <= 7 ? 'warning' : 'info' });
  };
  if (insRenewalDate) checkRenewal(`Ασφάλεια κατοικίας (${insCompany?.label})`, insRenewalDate, 60);
  (activeStreaming || []).forEach(a => { const svc = STREAMING.find(x => x.value === a.service); if (a.renewalDate) checkRenewal(svc?.label || a.service, a.renewalDate, 5); });
  (otherSubs || []).forEach(s => { if (s.renewalDate) checkRenewal(s.name, s.renewalDate, 7); });

  const insOptions     = INSURANCE_COMPANIES.map(c => ({ value: c.value, label: c.label }));
  const insPlanOptions = (insCompany?.plans || []).map(p => ({ value: p.id, label: `${(p as any).name} — ~${(p as any).monthly > 0 ? `${(p as any).monthly.toFixed(2)} €` : 'Χειροκίνητο'}` }));

  const filteredQuotes = liveQuotes.filter(q =>
    quotesFilter === 'all'       ? true :
    quotesFilter === 'earthquake' ? q.earthquake :
    quotesFilter === 'flood'      ? q.flood :
    quotesFilter === 'natural'    ? q.natural : true
  );

  const toggleStreaming = (svc: string) => {
    if ((activeStreaming || []).find(a => a.service === svc)) {
      u({ activeStreaming: (activeStreaming || []).filter(a => a.service !== svc) });
    } else {
      const s = STREAMING.find(x => x.value === svc);
      u({ activeStreaming: [...(activeStreaming || []), { service: svc, planId: s?.plans[0].id || '', customPrice: '', splitPeople: 2, splitActive: false, renewalDate: '' }] });
    }
  };
  const updateS = (svc: string, field: string, val: any) =>
    u({ activeStreaming: (activeStreaming || []).map(a => a.service === svc ? { ...a, [field]: val } : a) });

  const toggleCloud = (svc: string) => {
    if ((activeCloud || []).find(a => a.service === svc)) {
      u({ activeCloud: (activeCloud || []).filter(a => a.service !== svc) });
    } else {
      const s = CLOUD.find(x => x.value === svc);
      u({ activeCloud: [...(activeCloud || []), { service: svc, planId: s?.plans[0].id || '', customPrice: '', splitPeople: 2, splitActive: false, renewalDate: '' }] });
    }
  };
  const updateC = (svc: string, field: string, val: any) =>
    u({ activeCloud: (activeCloud || []).map(a => a.service === svc ? { ...a, [field]: val } : a) });

  const [newSubName, setNewSubName] = useState('');
  const [newSubPrice, setNewSubPrice] = useState('');
  const [newSubRenewal, setNewSubRenewal] = useState('');

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</span>
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* ── Checklist renewal banner ──────────────────────────────────────── */}
      {checklistRenewal && checklistRenewal.daysLeft !== null && checklistRenewal.daysLeft <= 60 && (
        <div style={{ background: checklistRenewal.daysLeft <= 7 ? 'rgba(197,34,31,0.07)' : 'rgba(242,153,0,0.07)', border: `1px solid ${checklistRenewal.daysLeft <= 7 ? 'rgba(197,34,31,0.25)' : 'rgba(242,153,0,0.25)'}`, borderRadius: T.radius.inner, padding: '11px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: checklistRenewal.daysLeft <= 7 ? 'var(--negative)' : 'var(--warning)', flexShrink: 0 }}/>
          <div style={{ flex: 1, fontSize: 12, fontFamily: T.font.sans }}>
            <span style={{ fontWeight: 700, color: checklistRenewal.daysLeft <= 7 ? 'var(--negative)' : 'var(--warning)' }}>Ανανέωση ασφαλιστηρίου </span>
            <span style={{ color: 'var(--text-secondary)' }}>{checklistRenewal.daysLeft <= 0 ? 'έχει λήξει' : `σε ${checklistRenewal.daysLeft} ημέρες`}</span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Checklist</span>
        </div>
      )}

      {/* ── Renewal alerts ──────────────────────────────────────────────── */}
      {renewalAlerts.map((a, i) => (
        <div key={i} style={{ background: a.type === 'danger' ? 'rgba(197,34,31,0.08)' : a.type === 'warning' ? 'rgba(242,153,0,0.08)' : 'rgba(26,115,232,0.06)', border: `1px solid ${a.type === 'danger' ? 'var(--negative)' : a.type === 'warning' ? 'var(--warning)' : 'var(--info)'}`, borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: T.font.sans }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.type === 'danger' ? 'var(--negative)' : a.type === 'warning' ? 'var(--warning)' : 'var(--info)', flexShrink: 0 }}/>
          <strong>{a.name}</strong>: {a.daysLeft === 0 ? 'Λήγει ΣΗΜΕΡΑ' : `Λήγει σε ${a.daysLeft} ημέρες`}
        </div>
      ))}

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Ασφάλεια Κατοικίας', value: fe(insCost)       },
          { label: 'Streaming & Media',   value: fe(streamingCost) },
          { label: 'Cloud & Λογισμικό',   value: fe(cloudCost)     },
          { label: 'Σύνολο / μήνα',       value: fe(total)         },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: i === 3 && total > 0 ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Ασφάλεια Κατοικίας ───────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Ασφάλεια Κατοικίας')}

        {/* ── ΑΑΔΕ API Integration Banner ─────────────────────────────────── */}
        <div style={{ background: 'rgba(26,115,232,0.05)', border: '1px solid rgba(26,115,232,0.15)', borderRadius: T.radius.inner, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--info)', fontFamily: T.font.sans, marginBottom: 3 }}>
              🔗 Σύνδεση ΑΑΔΕ — Αυτόματη λήψη ΕΝΦΙΑ εκκαθαριστικού
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
              {aadeConnected
                ? `✓ Συνδεδεμένο — ΕΝΦΙΑ ${aadeData?.year}: ${fe(aadeData?.totalAmount || 0)} (${aadeData?.installments} δόσεις × ${fe(aadeData?.installmentAmount || 0)})`
                : 'Σύνδεσε τους κωδικούς TAXISnet για αυτόματη λήψη χωρίς χειροκίνητη καταχώρηση'}
            </div>
          </div>
          {!aadeConnected ? (
            <a
              href="https://www.aade.gr/polites/forologikes-ypiresies/enfia"
              target="_blank"
              rel="noopener noreferrer"
              onClick={connectAADE}
              style={{ display: 'inline-block', background: 'var(--info)', color: '#fff', border: 'none', borderRadius: T.radius.btn, padding: '8px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, textDecoration: 'none' }}>
              Σύνδεση με TAXISnet →
            </a>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--positive)', fontFamily: T.font.sans, fontWeight: 700, background: 'rgba(52,168,83,0.1)', padding: '4px 12px', borderRadius: T.radius.pill }}>✓ Συνδεδεμένο</span>
          )}
        </div>

        {/* ── Property details for live quotes ──────────────────────────── */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>
            Στοιχεία Ακινήτου — για Live Σύγκριση Ασφαλιστικών
          </div>
          {crossProperty.sqm && !insSqm && (
            <div style={{ fontSize: 10, color: 'var(--positive)', fontFamily: T.font.sans, marginBottom: 8 }}>
              ✓ Τα στοιχεία συμπληρώθηκαν αυτόματα από tab Υπηρεσίες (ΕΝΦΙΑ) — μπορείς να τα επεξεργαστείς
            </div>
          )}
          {/* FIX: 2+2 grid — Πόλη label doesn't overflow */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <NumberInput label="Εμβαδόν (τ.μ.)"       value={effectiveSqm}    onChange={v => u({ insSqm: v })}          suffix="τ.μ." step={5}/>
            <TextInput   label="Πόλη / Περιοχή"         value={effectiveCity}   onChange={v => u({ insCity: v })}         placeholder="π.χ. Αθήνα, Θεσσαλονίκη..."/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <NumberInput label="Αξία Κτηρίου (€)"      value={insPropValue}    onChange={v => u({ insPropValue: v })}    suffix="€" step={5000}/>
            <NumberInput label="Αξία Περιεχομένου (€)" value={insContentValue} onChange={v => u({ insContentValue: v })} suffix="€" step={1000}/>
          </div>
        </div>

        {/* ── Live Quotes Engine ────────────────────────────────────────── */}
        {(parseFloat(effectiveSqm) > 0 && parseFloat(insPropValue) > 0) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: quotesLoading ? 'var(--warning)' : liveQuotes.length > 0 ? 'var(--positive)' : 'var(--border-default)', flexShrink: 0, transition: 'background 0.3s' }}/>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>
                  {quotesLoading ? 'Υπολογισμός quotes...' : `Live Σύγκριση — ${liveQuotes.length} προγράμματα`}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>
                  Εκτίμηση βάσει στοιχείων
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { key: 'all',       label: 'Όλα'       },
                  { key: 'earthquake',label: 'Σεισμός'   },
                  { key: 'flood',     label: 'Πλημμύρα'  },
                  { key: 'natural',   label: 'Φυσ. Καταστροφές' },
                ].map(f => (
                  <button key={f.key} onClick={() => setQuotesFilter(f.key as any)}
                    style={{ fontSize: 9, padding: '4px 10px', borderRadius: T.radius.pill, border: `1px solid ${quotesFilter === f.key ? 'var(--accent)' : 'var(--border-subtle)'}`, background: quotesFilter === f.key ? 'rgba(212,175,66,0.1)' : 'transparent', color: quotesFilter === f.key ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans, fontWeight: quotesFilter === f.key ? 700 : 400 }}>
                    {f.label}
                  </button>
                ))}
                <button onClick={() => setShowQuotes(v => !v)}
                  style={{ fontSize: 9, padding: '4px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>
                  {showQuotes ? '▲ Σύμπτυξη' : '▼ Ανάπτυξη'}
                </button>
              </div>
            </div>

            {/* Top 3 deals */}
            {!quotesLoading && filteredQuotes.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: showQuotes ? 12 : 0 }}>
                {filteredQuotes.slice(0, 3).map((q, i) => {
                  const isCurrent = q.company === insProvider && q.plan === insPlanId;
                  const isBest    = i === 0;
                  return (
                    <div key={q.plan}
                      onClick={() => { u({ insProvider: q.company, insPlanId: q.plan }); }}
                      style={{ background: isCurrent ? 'rgba(212,175,66,0.07)' : isBest ? 'rgba(52,168,83,0.05)' : 'var(--bg-elevated)', border: `1px solid ${isCurrent ? 'var(--accent)' : isBest ? 'rgba(52,168,83,0.3)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: 12, cursor: 'pointer', transition: 'all 0.15s', position: 'relative' as const }}>
                      {isBest && !isCurrent && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 8, fontWeight: 700, color: 'var(--positive)', background: 'rgba(52,168,83,0.1)', padding: '2px 6px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>ΚΑΛΥΤΕΡΗ ΤΙΜΗ</div>}
                      {isCurrent && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 8, fontWeight: 700, color: 'var(--accent)', background: 'rgba(212,175,66,0.1)', padding: '2px 6px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>ΤΡΕΧΟΝ</div>}
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 2 }}>{q.companyLabel}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginBottom: 8 }}>{q.planLabel}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: isCurrent ? 'var(--accent)' : isBest ? 'var(--positive)' : 'var(--text-primary)', fontFamily: T.font.mono, lineHeight: 1 }}>{fe(q.monthlyEstimate)}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 2 }}>εκτίμηση / μήνα</div>
                      {q.savings !== undefined && q.savings > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--positive)', fontFamily: T.font.sans, marginTop: 4, fontWeight: 700 }}>Εξοικονόμηση {fe(q.savings)}/μήνα</div>
                      )}
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' as const }}>
                        {q.earthquake && <span style={{ fontSize: 8, color: 'var(--positive)', background: 'rgba(52,168,83,0.1)', padding: '1px 6px', borderRadius: 3, fontFamily: T.font.sans }}>Σεισμός</span>}
                        {q.flood     && <span style={{ fontSize: 8, color: 'var(--info)',     background: 'rgba(26,115,232,0.1)', padding: '1px 6px', borderRadius: 3, fontFamily: T.font.sans }}>Πλημμύρα</span>}
                        {q.natural   && <span style={{ fontSize: 8, color: 'var(--warning)', background: 'rgba(242,153,0,0.1)',  padding: '1px 6px', borderRadius: 3, fontFamily: T.font.sans }}>Φυσ.Καταστρ.</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Full table */}
            {showQuotes && !quotesLoading && filteredQuotes.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 700 }}>
                  <thead>
                    <tr>{['Εταιρεία','Πρόγραμμα','Σεισμός','Πλημμύρα','Φυσ.Κατ.','Εκτ. Μηνιαίο','Εκτ. Ετήσιο','Εξοικ./μήνα'].map((h, i) => (
                      <th key={i} style={{ fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 600, fontFamily: T.font.sans, background: 'var(--bg-elevated)', whiteSpace: 'nowrap' as const }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filteredQuotes.map(q => {
                      const isCur = q.company === insProvider && q.plan === insPlanId;
                      return (
                        <tr key={q.plan} onClick={() => { u({ insProvider: q.company, insPlanId: q.plan }); }}
                          style={{ cursor: 'pointer', background: isCur ? 'rgba(212,175,66,0.08)' : 'transparent', transition: 'background 0.15s' }}>
                          <td style={{ padding: '6px 8px', fontWeight: isCur ? 700 : 400, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{q.companyLabel}{isCur ? ' ✓' : ''}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 9 }}>{q.planLabel}</td>
                          <td style={{ padding: '6px 8px', color: q.earthquake ? 'var(--positive)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: 700 }}>{q.earthquake ? '✓' : '—'}</td>
                          <td style={{ padding: '6px 8px', color: q.flood     ? 'var(--positive)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: 700 }}>{q.flood     ? '✓' : '—'}</td>
                          <td style={{ padding: '6px 8px', color: q.natural   ? 'var(--positive)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: 700 }}>{q.natural   ? '✓' : '—'}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 600, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, whiteSpace: 'nowrap' as const }}>{fe(q.monthlyEstimate)}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: T.font.mono, fontSize: 9, whiteSpace: 'nowrap' as const }}>{fe(q.annualEstimate)}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, fontFamily: T.font.mono, whiteSpace: 'nowrap' as const, color: q.savings !== undefined && q.savings > 0 ? 'var(--positive)' : q.savings !== undefined && q.savings < 0 ? 'var(--negative)' : 'var(--text-tertiary)' }}>
                            {q.savings !== undefined && q.savings !== 0 ? `${q.savings > 0 ? '+' : ''}${fe(q.savings)}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans, background: 'var(--bg-elevated)', padding: '6px 12px', borderRadius: T.radius.badge }}>
                  * Εκτιμώμενες τιμές βάσει στοιχείων ακινήτου — Χρησιμοποίησε <a href="https://www.insurancemarket.gr/katoikia/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>insurancemarket.gr</a> για ακριβή προσφορά · Πάτα γραμμή για επιλογή
                </div>
              </div>
            )}
          </div>
        )}

        {(!parseFloat(effectiveSqm) || !parseFloat(insPropValue)) && (
          <div style={{ background: 'rgba(212,175,66,0.05)', border: '1px solid rgba(212,175,66,0.15)', borderRadius: T.radius.inner, padding: '10px 14px', marginBottom: 14, fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            Συμπλήρωσε εμβαδόν + αξία κτηρίου για live σύγκριση ασφαλιστικών προγραμμάτων
          </div>
        )}

        {/* ── Current plan selection ────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>Τρέχον Πρόγραμμα</div>
          <div style={g3}>
            <CustomSelect label="Ασφαλιστική Εταιρεία" value={insProvider}
              onChange={v => { u({ insProvider: v }); const c = INSURANCE_COMPANIES.find(x => x.value === v); if (c) u({ insPlanId: c.plans[0].id }); }}
              options={insOptions}/>
            <CustomSelect label="Πρόγραμμα Ασφάλισης" value={insPlanId}
              onChange={v => u({ insPlanId: v })}
              options={insPlanOptions}/>
            <NumberInput label="Πραγματικό Κόστος / μήνα (€)" value={insCustomPrice} onChange={v => u({ insCustomPrice: v })} suffix="€" step={1}/>
          </div>
          <div style={g4}>
            <TextInput   label={insCompany?.agent_label || 'Ασφαλιστής'} value={insAgentName}    onChange={v => u({ insAgentName: v })}    placeholder="Ονοματεπώνυμο"/>
            <TextInput   label="Τηλέφωνο Ασφαλιστή"                      value={insAgentPhone}   onChange={v => u({ insAgentPhone: v })}   placeholder="69xxxxxxxx"/>
            <DatePicker  label="Ημερομηνία Ανανέωσης"                     value={insRenewalDate}  onChange={v => u({ insRenewalDate: v })}/>
            {insCompany?.url && (
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                <a href={insCompany.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '9px 14px', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans }}>
                  Επίσημη σελίδα →
                </a>
              </div>
            )}
          </div>

          {/* Covers display */}
          {insPlan && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, border: '1px solid var(--border-subtle)', marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 20 }}>
                  {[{ label: 'Σεισμός', ok: effectiveEarthquake },{ label: 'Πλημμύρα', ok: effectiveFloodState },{ label: 'Φυσικές Καταστροφές', ok: effectiveNatural }].map((r, i) => (
                    <div key={i} style={{ textAlign: 'center' as const }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: r.ok ? 'var(--positive)' : 'var(--negative)', lineHeight: 1, marginBottom: 2 }}>{r.ok ? '✓' : '✗'}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, fontFamily: T.font.sans }}>{r.label}</div>
                    </div>
                  ))}
                </div>
                <button onClick={() => { u({ insEditCovers: !insEditCovers }); if (!insEditCovers) { u({ insCustomCovers: effectiveCovers.join(', '), insCustomEarthquake: effectiveEarthquake, insCustomFlood: effectiveFloodState, insCustomNatural: effectiveNatural }); } }}
                  style={{ fontSize: 10, color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: T.radius.badge, padding: '5px 12px', cursor: 'pointer', fontFamily: T.font.sans, fontWeight: 600 }}>
                  {insEditCovers ? 'Αποθήκευση' : 'Επεξεργασία'}
                </button>
              </div>
              {insEditCovers ? (
                <div>
                  <input value={insCustomCovers} onChange={e => u({ insCustomCovers: e.target.value })} placeholder="π.χ. Πυρκαγιά, Κλοπή, Σεισμός..."
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--accent)', borderRadius: T.radius.inner, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: T.font.sans, marginBottom: 10 }}/>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <Toggle on={insCustomEarthquake} onChange={v => u({ insCustomEarthquake: v })} label="Σεισμός" labelOff="Χωρίς Σεισμό"/>
                    <Toggle on={insCustomFlood}      onChange={v => u({ insCustomFlood: v })}      label="Πλημμύρα" labelOff="Χωρίς Πλημμύρα"/>
                    <Toggle on={insCustomNatural}    onChange={v => u({ insCustomNatural: v })}    label="Φυσ. Καταστροφές" labelOff="Χωρίς"/>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: T.font.sans }}>
                  {effectiveCovers.join(' · ') || 'Δεν έχουν οριστεί καλύψεις'}
                </div>
              )}
              {effectiveEarthquake && effectiveFloodState && (
                <div style={{ marginTop: 10, background: 'rgba(52,168,83,0.08)', border: '1px solid rgba(52,168,83,0.3)', borderRadius: T.radius.badge, padding: '8px 14px', fontSize: 11, color: 'var(--positive)', fontFamily: T.font.sans }}>
                  Δικαιούσαι μείωση ΕΝΦΙΑ 10-20% βάσει Α.1005/2026 — ρύθμισε στο tab Υπηρεσίες → ΕΝΦΙΑ
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Streaming & Ψυχαγωγία ────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Streaming & Ψυχαγωγία')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
          {STREAMING.map(svc => {
            const active  = (activeStreaming || []).find(a => a.service === svc.value);
            const plan    = svc.plans.find(p => p.id === active?.planId);
            const cost    = parseFloat(active?.customPrice || '') || plan?.price || 0;
            const myShare = active?.splitActive && (active?.splitPeople || 2) > 1 ? cost / (active.splitPeople || 2) : cost;
            return (
              <div key={svc.value} style={{ background: active ? 'var(--bg-surface)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: 14, transition: 'all 0.15s', minHeight: 68, display: 'flex', flexDirection: 'column' as const }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: active ? 10 : 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? svc.color : 'var(--border-default)', flexShrink: 0, cursor: 'pointer' }} onClick={() => toggleStreaming(svc.value)}/>
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: T.font.sans, flex: 1, cursor: 'pointer' }} onClick={() => toggleStreaming(svc.value)}>{svc.label}</span>
                  {active && <a href={svc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: 'var(--text-tertiary)', textDecoration: 'none', padding: '2px 4px' }}>↗</a>}
                  {active ? (
                    <button onClick={() => toggleStreaming(svc.value)} style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 9, color: 'var(--text-tertiary)', flexShrink: 0, padding: 0 }}>✕</button>
                  ) : (
                    <span style={{ fontSize: 9, color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: T.font.sans }} onClick={() => toggleStreaming(svc.value)}>+ Προσθήκη</span>
                  )}
                </div>
                {!active && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, paddingLeft: 15, cursor: 'pointer' }} onClick={() => toggleStreaming(svc.value)}>από {fe(svc.plans[0].price)} / μήνα</div>}
                {active && (
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, flex: 1 }}>
                    <select value={active.planId} onChange={e => updateS(svc.value, 'planId', e.target.value)} style={miniSelectStyle}>
                      {svc.plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)', borderRadius: T.radius.badge, padding: '6px 10px' }}>
                      <div onClick={() => updateS(svc.value, 'splitActive', !active.splitActive)}
                        style={{ width: 30, height: 17, borderRadius: T.radius.pill, background: active.splitActive ? 'var(--accent)' : 'var(--border-default)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                        <div style={{ position: 'absolute', top: 2.5, left: active.splitActive ? 14 : 2.5, width: 12, height: 12, borderRadius: '50%', background: active.splitActive ? '#000' : '#fff', transition: 'left 0.2s' }}/>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans, flex: 1 }}>Διαμοιρασμός κόστους</span>
                      {active.splitActive && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="number" min="2" max="10" value={active.splitPeople || 2} onChange={e => updateS(svc.value, 'splitPeople', Math.max(2, parseInt(e.target.value) || 2))}
                            style={{ width: 44, background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: T.radius.badge, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.mono, outline: 'none', textAlign: 'center' }}/>
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>άτομα</span>
                        </div>
                      )}
                    </div>
                    <NumberInput label="Τιμή αν διαφέρει (€)" value={active.customPrice} onChange={v => updateS(svc.value, 'customPrice', v)} suffix="€" step={0.5}/>
                    <DatePicker label="Ημερομηνία ανανέωσης" value={active.renewalDate} onChange={v => updateS(svc.value, 'renewalDate', v)}/>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border-subtle)', marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{active.splitActive && (active.splitPeople || 2) > 1 ? `Μερίδιό σου (÷${active.splitPeople})` : 'Μηνιαίο κόστος'}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(myShare)} / μήνα</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {(activeStreaming || []).length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4, fontFamily: T.font.sans }}>{(activeStreaming || []).length} υπηρεσίες ενεργές</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{(activeStreaming || []).map(a => STREAMING.find(s => s.value === a.service)?.label).join(' · ')}</div>
            </div>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, lineHeight: 1 }}>{fe(streamingCost)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 3 }}>ανά μήνα</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Cloud & Λογισμικό ────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Cloud & Λογισμικό')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 14 }}>
          {CLOUD.map(svc => {
            const active  = (activeCloud || []).find(a => a.service === svc.value);
            const plan    = svc.plans.find(p => p.id === active?.planId);
            const cost    = parseFloat(active?.customPrice || '') || plan?.price || 0;
            const myShare = active?.splitActive && (active?.splitPeople || 2) > 1 ? cost / (active.splitPeople || 2) : cost;
            return (
              <div key={svc.value} onClick={() => toggleCloud(svc.value)}
                style={{ background: active ? 'var(--bg-surface)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: 10, cursor: 'pointer', transition: 'all 0.2s', minHeight: 56, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--border-default)', flexShrink: 0 }}/>
                  <span style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: T.font.sans, flex: 1 }}>{svc.label}</span>
                  {active && <a href={svc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 9, color: 'var(--text-tertiary)', textDecoration: 'none' }}>↗</a>}
                </div>
                {active ? (
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                    <select value={active.planId} onChange={e => updateC(svc.value, 'planId', e.target.value)} style={{ ...miniSelectStyle, fontSize: 9, padding: '4px 6px' }}>
                      {svc.plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 11, fontFamily: T.font.mono }}>{fe(myShare)} / μήνα</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>από {fe(svc.plans[0].price)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Άλλες Πάγιες Συνδρομές ───────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Άλλες Πάγιες Συνδρομές')}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 16, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <TextInput   label="Ονομασία"         value={newSubName}    onChange={setNewSubName}    placeholder="π.χ. Canva Pro, Adobe, Antivirus..."/>
            <NumberInput label="Κόστος / μήνα (€)" value={newSubPrice}  onChange={setNewSubPrice}   suffix="€" step={1}/>
            <DatePicker  label="Ημ. Ανανέωσης"    value={newSubRenewal} onChange={setNewSubRenewal}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => { if (newSubName && newSubPrice) { u({ otherSubs: [...(otherSubs || []), { name: newSubName, price: newSubPrice, renewalDate: newSubRenewal }] }); setNewSubName(''); setNewSubPrice(''); setNewSubRenewal(''); } }}
              style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: T.radius.btn, padding: '0 24px', height: 40, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
              + Προσθήκη
            </button>
          </div>
        </div>
        {(otherSubs || []).map((s, i) => {
          const daysLeft = s.renewalDate ? Math.ceil((new Date(s.renewalDate).getTime() - Date.now()) / 86400000) : null;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{s.name}</span>
                {s.renewalDate && <span style={{ fontSize: 10, color: daysLeft !== null && daysLeft <= 7 ? 'var(--warning)' : 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.sans }}>{new Date(s.renewalDate).toLocaleDateString('el-GR')}{daysLeft !== null && daysLeft <= 7 ? ` — σε ${daysLeft} ημέρες` : ''}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(parseFloat(s.price))} / μήνα</span>
                <button onClick={() => u({ otherSubs: (otherSubs || []).filter((_: any, j: number) => j !== i) })}
                  style={{ width: 26, height: 26, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>
          );
        })}
        {total > 0 && (
          <div style={{ marginTop: 16, background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Σύνολο — ασφάλεια + streaming + cloud + άλλα</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 2 }}>
                {[insCost > 0 && `Ασφάλεια ${fe(insCost)}`, streamingCost > 0 && `Streaming ${fe(streamingCost)}`, cloudCost > 0 && `Cloud ${fe(cloudCost)}`, otherCost > 0 && `Άλλα ${fe(otherCost)}`].filter(Boolean).join(' + ')}
              </div>
            </div>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono, lineHeight: 1 }}>{fe(total)} / μήνα</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono, marginTop: 3 }}>{fe(total * 12)} / έτος</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}