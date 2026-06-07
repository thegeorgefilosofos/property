'use client';
import { createClient } from '@/lib/supabase/client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

// ─── Ασφαλιστικές — πραγματικά δεδομένα 2026 ────────────────────────────────
// Σημ: Οι ακριβείς τιμές εξαρτώνται από αξία ακινήτου & καλύψεις.
// Οι τιμές είναι ενδεικτικές για κατοικία ~100τ.μ., αντικ. αξία ~150.000€
const INSURANCE_COMPANIES = [
  {
    value: 'hellas_direct', label: 'Hellas Direct',
    url: 'https://www.hellasdirect.gr',
    agent_label: 'Ψηφιακή — χωρίς ασφαλιστή',
    plans: [
      { id: 'hd_basic', name: 'Basic', monthly: 8.90, annual: 89,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],
        earthquake: false, flood: false, natural: false, editable_covers: true },
      { id: 'hd_plus', name: 'Plus', monthly: 14.90, annual: 149,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Πλημμύρα','Θύελλα'],
        earthquake: false, flood: true, natural: true, editable_covers: true },
      { id: 'hd_premium', name: 'Premium', monthly: 22.90, annual: 219,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
    ]
  },
  {
    value: 'interamerican', label: 'Interamerican',
    url: 'https://www.interamerican.gr',
    agent_label: 'Ασφαλιστής Interamerican',
    plans: [
      { id: 'ia_basic', name: 'Oikia Basic', monthly: 12.50, annual: 125,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις'],
        earthquake: false, flood: false, natural: false, editable_covers: true },
      { id: 'ia_comfort', name: 'Oikia Comfort', monthly: 18.00, annual: 180,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις','Θεομηνία'],
        earthquake: false, flood: true, natural: true, editable_covers: true },
      { id: 'ia_full', name: 'Oikia Full', monthly: 26.00, annual: 250,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις','Σεισμός','Πλημμύρα'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
    ]
  },
  {
    value: 'eurolife', label: 'Eurolife FFH',
    url: 'https://www.eurolife.gr',
    agent_label: 'Σύμβουλος Eurolife FFH',
    plans: [
      { id: 'el_first_std', name: 'My Home First Standard', monthly: 12.00, annual: 120,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικές Καταστροφές','Σωληνώσεις'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
      { id: 'el_first_plus', name: 'My Home First Plus', monthly: 20.00, annual: 195,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικές Καταστροφές','Βραχυκύκλωμα','Ενοίκιο Αντικατάστασης'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
      { id: 'el_luxury', name: 'My Home Luxury', monthly: 30.00, annual: 290,
        covers: ['Πυρκαγιά','Κλοπή','ΑΕ','Σεισμός','Πλημμύρα','Ηλεκτρ. Βλάβες','Καθίζηση'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
    ]
  },
  {
    value: 'generali', label: 'Generali',
    url: 'https://www.generali.gr',
    agent_label: 'Σύμβουλος Generali',
    plans: [
      { id: 'gen_basic', name: 'MyHome Basic', monthly: 11.00, annual: 110,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],
        earthquake: false, flood: false, natural: false, editable_covers: true },
      { id: 'gen_plus', name: 'MyHome Plus', monthly: 16.00, annual: 155,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'],
        earthquake: false, flood: true, natural: true, editable_covers: true },
      { id: 'gen_premium', name: 'MyHome Premium', monthly: 24.00, annual: 230,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
    ]
  },
  {
    value: 'axa', label: 'AXA Ασφαλιστική',
    url: 'https://www.axa.gr',
    agent_label: 'Σύμβουλος AXA',
    plans: [
      { id: 'axa_basic', name: 'Home Basic', monthly: 9.50, annual: 95,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],
        earthquake: false, flood: false, natural: false, editable_covers: true },
      { id: 'axa_comfort', name: 'Home Comfort', monthly: 15.00, annual: 148,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'],
        earthquake: false, flood: true, natural: true, editable_covers: true },
      { id: 'axa_premium', name: 'Home Premium', monthly: 23.00, annual: 225,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
    ]
  },
  {
    value: 'ethniki', label: 'Εθνική Ασφαλιστική',
    url: 'https://www.ethniki-asfalistiki.gr',
    agent_label: 'Σύμβουλος Εθνικής Ασφαλιστικής',
    plans: [
      { id: 'eth_oikos', name: 'Οίκος', monthly: 13.00, annual: 126,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις'],
        earthquake: false, flood: false, natural: false, editable_covers: true },
      { id: 'eth_mega', name: 'MegaHome', monthly: 20.00, annual: 195,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'],
        earthquake: false, flood: true, natural: true, editable_covers: true },
      { id: 'eth_ultra', name: 'UltraHome', monthly: 28.00, annual: 270,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
    ]
  },
  {
    value: 'nn_hellas', label: 'NN Hellas',
    url: 'https://www.nnhellas.gr',
    agent_label: 'Σύμβουλος NN Hellas',
    plans: [
      { id: 'nn_home_basic', name: 'NN Home Basic', monthly: 10.00, annual: 99,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],
        earthquake: false, flood: false, natural: false, editable_covers: true },
      { id: 'nn_home_plus', name: 'NN Home Plus', monthly: 17.00, annual: 165,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικά Φαινόμενα'],
        earthquake: false, flood: true, natural: true, editable_covers: true },
      { id: 'nn_home_premium', name: 'NN Home Premium', monthly: 25.00, annual: 240,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Ηλεκτρ. Βλάβες'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
    ]
  },
  {
    value: 'groupama', label: 'Groupama Ασφαλιστική',
    url: 'https://www.groupama.gr',
    agent_label: 'Σύμβουλος Groupama',
    plans: [
      { id: 'grp_habitat', name: 'Habitat Basic', monthly: 11.50, annual: 112,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],
        earthquake: false, flood: false, natural: false, editable_covers: true },
      { id: 'grp_habitat_plus', name: 'Habitat Plus', monthly: 18.50, annual: 178,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικά Φαινόμενα'],
        earthquake: false, flood: true, natural: true, editable_covers: true },
      { id: 'grp_habitat_full', name: 'Habitat Full', monthly: 26.00, annual: 248,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
    ]
  },
  {
    value: 'allianz', label: 'Allianz Hellas',
    url: 'https://www.allianz.gr',
    agent_label: 'Σύμβουλος Allianz',
    plans: [
      { id: 'alz_home', name: 'Allianz Home Basic', monthly: 12.00, annual: 115,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],
        earthquake: false, flood: false, natural: false, editable_covers: true },
      { id: 'alz_comfort', name: 'Allianz Home Comfort', monthly: 19.00, annual: 182,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικά Φαινόμενα'],
        earthquake: false, flood: true, natural: true, editable_covers: true },
      { id: 'alz_premium', name: 'Allianz Home Premium', monthly: 27.00, annual: 258,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα'],
        earthquake: true, flood: true, natural: true, editable_covers: true },
    ]
  },
  {
    value: 'minetta', label: 'Ασφάλειαι Μινέττα',
    url: 'https://www.minetta.gr',
    agent_label: 'Σύμβουλος Μινέττα',
    plans: [
      { id: 'min_basic', name: 'Κατοικία Basic', monthly: 9.00, annual: 88,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],
        earthquake: false, flood: false, natural: false, editable_covers: true },
      { id: 'min_plus', name: 'Κατοικία Plus', monthly: 15.50, annual: 148,
        covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'],
        earthquake: false, flood: true, natural: true, editable_covers: true },
    ]
  },
  {
    value: 'other', label: 'Άλλη Ασφαλιστική',
    url: '',
    agent_label: 'Ασφαλιστής',
    plans: [
      { id: 'other_custom', name: 'Προσαρμοσμένο', monthly: 0, annual: 0,
        covers: [],
        earthquake: false, flood: false, natural: false, editable_covers: true },
    ]
  },
];

const STREAMING = [
  { value: 'netflix', label: 'Netflix', icon: '🎬', color: '#e50914', url: 'https://www.netflix.com/gr',
    plans: [
      { id: 'n_basic', name: 'Βασικό', price: 8.99, screens: 1 },
      { id: 'n_standard', name: 'Standard', price: 12.49, screens: 2 },
      { id: 'n_premium', name: 'Premium (4K)', price: 15.99, screens: 4 },
    ]},
  { value: 'disney', label: 'Disney+', icon: '🏰', color: '#0063e5', url: 'https://www.disneyplus.com/el-gr',
    plans: [
      { id: 'd_standard', name: 'Standard', price: 8.99, screens: 2 },
      { id: 'd_premium', name: 'Premium', price: 13.99, screens: 4 },
    ]},
  { value: 'apple_tv', label: 'Apple TV+', icon: '🍎', color: '#555', url: 'https://www.apple.com/gr/apple-tv-plus',
    plans: [{ id: 'a_std', name: 'Apple TV+', price: 9.99, screens: 6 }]},
  { value: 'amazon', label: 'Amazon Prime Video', icon: '📦', color: '#00a8e1', url: 'https://www.primevideo.com',
    plans: [{ id: 'am_std', name: 'Prime Video', price: 8.99, screens: 3 }]},
  { value: 'max', label: 'Max (HBO)', icon: '🎭', color: '#0d1ce5', url: 'https://www.max.com/gr/el',
    plans: [
      { id: 'max_basic', name: 'Basic με Διαφ.', price: 5.99, screens: 2 },
      { id: 'max_std', name: 'Standard', price: 9.99, screens: 2 },
      { id: 'max_ult', name: 'Ultimate 4K', price: 15.99, screens: 4 },
    ]},
  { value: 'spotify', label: 'Spotify', icon: '🎵', color: '#1db954', url: 'https://www.spotify.com/gr',
    plans: [
      { id: 's_individual', name: 'Individual', price: 10.99, screens: 1 },
      { id: 's_duo', name: 'Duo', price: 14.99, screens: 2 },
      { id: 's_family', name: 'Family', price: 17.99, screens: 6 },
      { id: 's_student', name: 'Student', price: 5.99, screens: 1 },
    ]},
  { value: 'youtube', label: 'YouTube Premium', icon: '▶️', color: '#ff0000', url: 'https://www.youtube.com/premium',
    plans: [
      { id: 'y_individual', name: 'Individual', price: 13.99, screens: 1 },
      { id: 'y_family', name: 'Family', price: 22.99, screens: 6 },
    ]},
  { value: 'ant1plus', label: 'ANT1+', icon: '📡', color: '#1a56db', url: 'https://www.ant1plus.gr',
    plans: [
      { id: 'ant_monthly', name: 'Μηνιαία', price: 2.99, screens: 3 },
      { id: 'ant_annual', name: 'Ετήσια (÷12)', price: 1.66, screens: 3 },
    ]},
  { value: 'cosmote_tv', label: 'Cosmote TV', icon: '📺', color: '#00adef', url: 'https://www.cosmote.gr',
    plans: [
      { id: 'cos_start', name: 'Start', price: 6.00, screens: 2 },
      { id: 'cos_full', name: 'Full', price: 30.00, screens: 4 },
    ]},
];

const CLOUD = [
  { value: 'icloud', label: 'iCloud+', icon: '☁️', url: 'https://www.icloud.com', plans: [
    { id: 'ic_50', name: '50GB', price: 0.99 },
    { id: 'ic_200', name: '200GB', price: 2.99 },
    { id: 'ic_2t', name: '2TB', price: 9.99 },
    { id: 'ic_6t', name: '6TB (Family)', price: 29.99 },
  ]},
  { value: 'google_one', label: 'Google One', icon: '🔵', url: 'https://one.google.com', plans: [
    { id: 'g_100', name: '100GB', price: 1.99 },
    { id: 'g_200', name: '200GB', price: 2.99 },
    { id: 'g_2t', name: '2TB', price: 9.99 },
  ]},
  { value: 'microsoft365', label: 'Microsoft 365', icon: '🪟', url: 'https://www.microsoft.com/el-gr', plans: [
    { id: 'ms_pers', name: 'Personal', price: 6.99 },
    { id: 'ms_fam', name: 'Family (6 άτομα)', price: 9.99 },
  ]},
  { value: 'dropbox', label: 'Dropbox', icon: '📁', url: 'https://www.dropbox.com', plans: [
    { id: 'db_plus', name: 'Plus (2TB)', price: 9.99 },
    { id: 'db_pro', name: 'Professional', price: 16.58 },
  ]},
  { value: 'adobe', label: 'Adobe CC', icon: '🎨', url: 'https://www.adobe.com/gr', plans: [
    { id: 'ad_photo', name: 'Photography', price: 12.29 },
    { id: 'ad_all', name: 'All Apps', price: 54.99 },
  ]},
];

const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const today = new Date().toLocaleDateString('el-GR');

interface StreamingEntry { service: string; planId: string; customPrice: string; splitPeople: number; splitActive: boolean; renewalDate: string; }
interface CloudEntry { service: string; planId: string; customPrice: string; splitPeople: number; splitActive: boolean; renewalDate: string; }
interface OtherSub { name: string; price: string; renewalDate: string; }

export default function BillsInsurance({ propertyId, userId = '' }: { propertyId: string; userId?: string }) {
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '16px' };
  const g2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' };
  const g3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' };
  const g4: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' };

  // ── Persistent settings ────────────────────────────────────────────────────
  const [ps, updPs] = useBillsSettings(propertyId, userId, 'insurance', {
    insProvider: 'hellas_direct', insPlanId: 'hd_basic',
    insCustomPrice: '', insCustomPlanName: '',
    insAgentName: '', insAgentPhone: '', insRenewalDate: '',
    insPropValue: '', insContentValue: '',
    insCustomCovers: '', insEditCovers: false,
    insCustomEarthquake: false, insCustomFlood: false, insCustomNatural: false,
    activeStreaming: [] as StreamingEntry[],
    activeCloud: [] as CloudEntry[],
    otherSubs: [] as OtherSub[],
  });

  // Aliases for convenience
  const insProvider = ps.insProvider;
  const insPlanId = ps.insPlanId;
  const insCustomPrice = ps.insCustomPrice;
  const insCustomPlanName = ps.insCustomPlanName;
  const insAgentName = ps.insAgentName;
  const insAgentPhone = ps.insAgentPhone;
  const insRenewalDate = ps.insRenewalDate;
  const insPropValue = ps.insPropValue;
  const insContentValue = ps.insContentValue;
  const insCustomCovers = ps.insCustomCovers;
  const insEditCovers = ps.insEditCovers;
  const insCustomEarthquake = ps.insCustomEarthquake;
  const insCustomFlood = ps.insCustomFlood;
  const insCustomNatural = ps.insCustomNatural;
  const activeStreaming = ps.activeStreaming || [];
  const activeCloud = ps.activeCloud || [];
  const otherSubs = ps.otherSubs || [];

  const setInsProvider = (v: string) => updPs({ insProvider: v });
  const setInsPlanId = (v: string) => updPs({ insPlanId: v });
  const setInsCustomPrice = (v: string) => updPs({ insCustomPrice: v });
  const setInsCustomPlanName = (v: string) => updPs({ insCustomPlanName: v });
  const setInsAgentName = (v: string) => updPs({ insAgentName: v });
  const setInsAgentPhone = (v: string) => updPs({ insAgentPhone: v });
  const setInsRenewalDate = (v: string) => updPs({ insRenewalDate: v });
  const setInsPropValue = (v: string) => updPs({ insPropValue: v });
  const setInsContentValue = (v: string) => updPs({ insContentValue: v });
  const setInsCustomCovers = (v: string) => updPs({ insCustomCovers: v });
  const setInsEditCovers = (v: boolean | ((p: boolean) => boolean)) => updPs({ insEditCovers: typeof v === 'function' ? v(ps.insEditCovers) : v });
  const setInsCustomEarthquake = (v: boolean) => updPs({ insCustomEarthquake: v });
  const setInsCustomFlood = (v: boolean) => updPs({ insCustomFlood: v });
  const setInsCustomNatural = (v: boolean) => updPs({ insCustomNatural: v });
  const setActiveStreaming = (v: StreamingEntry[] | ((p: StreamingEntry[]) => StreamingEntry[])) => updPs({ activeStreaming: typeof v === 'function' ? v(ps.activeStreaming || []) : v });
  const setActiveCloud = (v: CloudEntry[] | ((p: CloudEntry[]) => CloudEntry[])) => updPs({ activeCloud: typeof v === 'function' ? v(ps.activeCloud || []) : v });
  const setOtherSubs = (v: OtherSub[] | ((p: OtherSub[]) => OtherSub[])) => updPs({ otherSubs: typeof v === 'function' ? v(ps.otherSubs || []) : v });

  const [newSubName, setNewSubName] = useState('');
  const [newSubPrice, setNewSubPrice] = useState('');
  const [newSubRenewal, setNewSubRenewal] = useState('');

  const insCompany = INSURANCE_COMPANIES.find(c => c.value === insProvider);
  const insPlan = insCompany?.plans.find(p => p.id === insPlanId) as any;
  const insCost = parseFloat(insCustomPrice) || insPlan?.monthly || 0;
  const effectiveCovers = insEditCovers && insCustomCovers ? insCustomCovers.split(',').map(s => s.trim()).filter(Boolean) : (insPlan?.covers || []);
  const effectiveEarthquake = insEditCovers ? insCustomEarthquake : (insPlan?.earthquake || false);
  const effectiveFlood = insEditCovers ? insCustomFlood : (insPlan?.flood || false);
  const effectiveNatural = insEditCovers ? insCustomNatural : (insPlan?.natural || false);

  const streamingCost = activeStreaming.reduce((s, a) => {
    const svc = STREAMING.find(x => x.value === a.service);
    const plan = svc?.plans.find(p => p.id === a.planId);
    const base = parseFloat(a.customPrice) || plan?.price || 0;
    return s + (a.splitActive && a.splitPeople > 1 ? base / a.splitPeople : base);
  }, 0);

  const cloudCost = activeCloud.reduce((s, a) => {
    const svc = CLOUD.find(x => x.value === a.service);
    const plan = svc?.plans.find(p => p.id === a.planId);
    const base = parseFloat(a.customPrice) || plan?.price || 0;
    return s + (a.splitActive && a.splitPeople > 1 ? base / a.splitPeople : base);
  }, 0);

  const otherCost = otherSubs.reduce((s, o) => s + (parseFloat(o.price) || 0), 0);
  const total = insCost + streamingCost + cloudCost + otherCost;

  // Renewal alerts
  const renewalAlerts: { name: string; daysLeft: number; type: 'danger' | 'warning' | 'info' }[] = [];
  const checkRenewal = (name: string, dateStr: string, warningDays: number) => {
    if (!dateStr) return;
    const d = new Date(dateStr);
    const diff = Math.ceil((d.getTime() - new Date().getTime()) / 86400000);
    if (diff >= 0 && diff <= warningDays) {
      renewalAlerts.push({ name, daysLeft: diff, type: diff <= 3 ? 'danger' : diff <= 7 ? 'warning' : 'info' });
    }
  };
  if (insRenewalDate) checkRenewal(`Ασφάλεια κατοικίας (${insCompany?.label})`, insRenewalDate, 60);
  activeStreaming.forEach(a => {
    const svc = STREAMING.find(x => x.value === a.service);
    if (a.renewalDate) checkRenewal(svc?.label || a.service, a.renewalDate, 5);
  });
  activeCloud.forEach(a => {
    const svc = CLOUD.find(x => x.value === a.service);
    if (a.renewalDate) checkRenewal(svc?.label || a.service, a.renewalDate, 7);
  });
  otherSubs.forEach(s => { if (s.renewalDate) checkRenewal(s.name, s.renewalDate, 7); });

  const insOptions = INSURANCE_COMPANIES.map(c => ({ value: c.value, label: c.label }));
  const insPlanOptions = (insCompany?.plans || []).map(p => ({ value: p.id, label: `${(p as any).name} — ${(p as any).monthly > 0 ? `~${(p as any).monthly.toFixed(2)}€` : 'Χειροκίνητο'}` }));

  const toggleStreaming = (svc: string) => {
    if (activeStreaming.find(a => a.service === svc)) {
      setActiveStreaming(prev => prev.filter(a => a.service !== svc));
    } else {
      const s = STREAMING.find(x => x.value === svc);
      setActiveStreaming(prev => [...prev, { service: svc, planId: s?.plans[0].id || '', customPrice: '', splitPeople: 1, splitActive: false, renewalDate: '' }]);
    }
  };

  const updateS = (svc: string, field: string, val: any) => setActiveStreaming(prev => prev.map(a => a.service === svc ? { ...a, [field]: val } : a));

  const toggleCloud = (svc: string) => {
    if (activeCloud.find(a => a.service === svc)) {
      setActiveCloud(prev => prev.filter(a => a.service !== svc));
    } else {
      const s = CLOUD.find(x => x.value === svc);
      setActiveCloud(prev => [...prev, { service: svc, planId: s?.plans[0].id || '', customPrice: '', splitPeople: 1, splitActive: false, renewalDate: '' }]);
    }
  };

  const updateC = (svc: string, field: string, val: any) => setActiveCloud(prev => prev.map(a => a.service === svc ? { ...a, [field]: val } : a));

  return (
    <div style={{ fontFamily: 'Inter,sans-serif' }}>

      {/* Renewal Alerts */}
      {renewalAlerts.map((a, i) => (
        <div key={i} style={{
          background: a.type === 'danger' ? 'rgba(239,68,68,0.08)' : a.type === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.06)',
          border: `1px solid ${a.type === 'danger' ? 'var(--negative)' : a.type === 'warning' ? 'var(--warning)' : 'var(--info)'}`,
          borderRadius: '10px', padding: '10px 16px', marginBottom: '10px', fontSize: '11px',
          color: a.type === 'danger' ? 'var(--negative)' : a.type === 'warning' ? 'var(--warning)' : 'var(--info)',
        }}>
          {a.type === 'danger' ? '🚨' : '⚠️'} <strong>{a.name}</strong>: {a.daysLeft === 0 ? 'Λήγει ΣΗΜΕΡΑ!' : `Λήγει σε ${a.daysLeft} ημέρες`}
        </div>
      ))}

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
        {[
          { label: 'Ασφάλεια Κατοικίας', value: fe(insCost), color: 'var(--positive)' },
          { label: 'Streaming & Media', value: fe(streamingCost), color: 'var(--info)' },
          { label: 'Cloud & Λογισμικό', value: fe(cloudCost), color: 'var(--accent)' },
          { label: 'Σύνολο/μήνα', value: fe(total), color: 'var(--warning)' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: k.color, fontFamily: "'JetBrains Mono',monospace", marginBottom: '4px' }}>{k.value}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Insurance */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>🛡️</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ασφάλεια Κατοικίας</span>
          <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>Ενδεικτικές τιμές — επαλήθευσε με τον ασφαλιστή σου</div>
        </div>

        <div style={g3}>
          <CustomSelect label="Ασφαλιστική Εταιρεία" value={insProvider} onChange={v => { setInsProvider(v); const c = INSURANCE_COMPANIES.find(x => x.value === v); if (c) setInsPlanId(c.plans[0].id); setInsEditCovers(false); setInsCustomCovers(''); }} options={insOptions} />
          <CustomSelect label="Πρόγραμμα" value={insPlanId} onChange={v => { setInsPlanId(v); setInsEditCovers(false); setInsCustomCovers(''); }} options={insPlanOptions} />
          <NumberInput label="Πραγματικό Κόστος/μήνα (€)" value={insCustomPrice} onChange={setInsCustomPrice} suffix="€" step={1} />
        </div>

        {/* Custom plan name for "other" */}
        {insProvider === 'other' && (
          <div style={{ marginBottom: '12px' }}>
            <TextInput label="Ονομασία Προγράμματος" value={insCustomPlanName} onChange={setInsCustomPlanName} placeholder="π.χ. Ergo Home Basic, Interlife Standard..." />
          </div>
        )}

        <div style={g4}>
          <TextInput label={insCompany?.agent_label || 'Ασφαλιστής'} value={insAgentName} onChange={setInsAgentName} placeholder="Ονοματεπώνυμο" />
          <TextInput label="Τηλέφωνο Ασφαλιστή" value={insAgentPhone} onChange={setInsAgentPhone} placeholder="69xxxxxxxx" />
          <NumberInput label="Αξία Κτηρίου (€)" value={insPropValue} onChange={setInsPropValue} suffix="€" step={5000} />
          <NumberInput label="Αξία Περιεχομένου (€)" value={insContentValue} onChange={setInsContentValue} suffix="€" step={1000} />
        </div>

        <div style={g2}>
          <DatePicker label="Ημ. Ανανέωσης Ασφαλιστηρίου" value={insRenewalDate} onChange={setInsRenewalDate} />
          {insCompany?.url && (
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
              <a href={insCompany.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '9px 14px', fontSize: '11px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
                ↗ Επίσημη σελίδα {insCompany.label}
              </a>
            </div>
          )}
        </div>

        {/* Plan details + editable covers */}
        {insPlan && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '14px', border: '1px solid var(--border-subtle)', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {[
                  { label: 'Σεισμός', ok: effectiveEarthquake },
                  { label: 'Πλημμύρα', ok: effectiveFlood },
                  { label: 'Φυσικές Καταστροφές', ok: effectiveNatural },
                ].map((r, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: r.ok ? 'var(--positive)' : 'var(--negative)' }}>{r.ok ? '✓' : '✗'}</div>
                    <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{r.label}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setInsEditCovers(v => !v); if (!insEditCovers) { setInsCustomCovers(effectiveCovers.join(', ')); setInsCustomEarthquake(effectiveEarthquake); setInsCustomFlood(effectiveFlood); setInsCustomNatural(effectiveNatural); } }}
                style={{ fontSize: '10px', color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
                {insEditCovers ? '✓ Αποθήκευση' : '✏️ Επεξεργασία Καλύψεων'}
              </button>
            </div>

            {insEditCovers ? (
              <div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '4px' }}>Καλύψεις (χωρισμένες με κόμμα)</label>
                  <input value={insCustomCovers} onChange={e => setInsCustomCovers(e.target.value)}
                    placeholder="π.χ. Πυρκαγιά, Κλοπή, Σεισμός, Πλημμύρα..."
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--accent)', borderRadius: '8px', padding: '8px 12px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Καλύπτει Σεισμό', state: insCustomEarthquake, set: setInsCustomEarthquake },
                    { label: 'Καλύπτει Πλημμύρα', state: insCustomFlood, set: setInsCustomFlood },
                    { label: 'Καλύπτει Φυσ. Καταστροφές', state: insCustomNatural, set: setInsCustomNatural },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="checkbox" checked={r.state} onChange={e => r.set(e.target.checked)} style={{ width: '14px', height: '14px', accentColor: 'var(--accent)' }} />
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{r.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {effectiveCovers.join(' · ') || 'Δεν έχουν οριστεί καλύψεις'}
              </div>
            )}

            {effectiveEarthquake && effectiveFlood && (
              <div style={{ marginTop: '10px', background: 'rgba(52,217,123,0.08)', border: '1px solid rgba(52,217,123,0.3)', borderRadius: '6px', padding: '8px 10px', fontSize: '10px', color: 'var(--positive)' }}>
                ✅ Δικαιούσαι μείωση ΕΝΦΙΑ 10-20% (Α.1005/2026) — ρύθμισε στο tab Αποδόσεις → Overview.
              </div>
            )}
          </div>
        )}

        {/* Insurance comparison table */}
        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '10px' }}>
          Σύγκριση Ασφαλιστικών — Ενδεικτικές τιμές
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', minWidth: '700px' }}>
            <thead>
              <tr>
                {['Εταιρεία', 'Πρόγραμμα', 'Σεισμός', 'Πλημμύρα', 'Φυσ. Καταστρ.', 'Μηνιαίο*', 'Ετήσιο*'].map((h, i) => (
                  <th key={i} style={{ fontSize: '8px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {INSURANCE_COMPANIES.filter(c => c.value !== 'other').flatMap(c => c.plans.map(plan => {
                const isCur = plan.id === insPlanId;
                const p = plan as any;
                return (
                  <tr key={plan.id} onClick={() => { setInsProvider(c.value); setInsPlanId(plan.id); setInsEditCovers(false); }}
                    style={{ cursor: 'pointer', background: isCur ? 'rgba(212,175,66,0.08)' : 'transparent' }}>
                    <td style={{ padding: '6px 8px', fontWeight: isCur ? 700 : 400, color: isCur ? 'var(--accent)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {c.label}{isCur ? ' ✓' : ''}
                    </td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontSize: '10px' }}>{p.name}</td>
                    <td style={{ padding: '6px 8px', color: p.earthquake ? 'var(--positive)' : 'var(--text-tertiary)', fontWeight: 700, textAlign: 'center' }}>{p.earthquake ? '✓' : '—'}</td>
                    <td style={{ padding: '6px 8px', color: p.flood ? 'var(--positive)' : 'var(--text-tertiary)', fontWeight: 700, textAlign: 'center' }}>{p.flood ? '✓' : '—'}</td>
                    <td style={{ padding: '6px 8px', color: p.natural ? 'var(--positive)' : 'var(--text-tertiary)', fontWeight: 700, textAlign: 'center' }}>{p.natural ? '✓' : '—'}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: "'JetBrains Mono',monospace" }}>{p.monthly > 0 ? fe(p.monthly) : '—'}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono',monospace", fontSize: '10px' }}>{p.annual > 0 ? fe(p.annual) : '—'}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginTop: '8px', padding: '8px', background: 'var(--bg-elevated)', borderRadius: '6px' }}>
          *Ενδεικτικές τιμές για κατοικία ~100τ.μ., αντικ. αξία ~150.000€. Η πραγματική τιμή εξαρτάται από χαρακτηριστικά ακινήτου. Χρησιμοποίησε{' '}
          <a href="https://www.insurancemarket.gr/katoikia/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>insurancemarket.gr</a>{' '}
          για ακριβή σύγκριση. Πάτα γραμμή για επιλογή.
        </div>
      </div>

      {/* Streaming */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '16px' }}>🎬</span>
            <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Streaming & Ψυχαγωγία</span>
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>Τιμές Ελλάδα — επαλήθευσε στον πάροχο</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '16px' }}>
          {STREAMING.map(svc => {
            const active = activeStreaming.find(a => a.service === svc.value);
            const plan = svc.plans.find(p => p.id === active?.planId);
            const cost = parseFloat(active?.customPrice || '') || plan?.price || 0;
            const myShare = active?.splitActive && (active?.splitPeople || 1) > 1 ? cost / (active.splitPeople || 1) : cost;
            const daysLeft = active?.renewalDate ? Math.ceil((new Date(active.renewalDate).getTime() - new Date().getTime()) / 86400000) : null;
            return (
              <div key={svc.value} onClick={() => toggleStreaming(svc.value)}
                style={{ background: active ? `${svc.color}12` : 'var(--bg-elevated)', border: `1px solid ${active ? svc.color : 'var(--border-subtle)'}`, borderRadius: '10px', padding: '12px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '14px' }}>{svc.icon}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: active ? svc.color : 'var(--text-primary)' }}>{svc.label}</span>
                  <a href={svc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: '9px', color: 'var(--accent)', textDecoration: 'none', marginLeft: 'auto', opacity: active ? 1 : 0.4 }}>↗</a>
                </div>
                <div style={{ fontSize: '9px', color: 'var(--text-secondary)', marginBottom: active ? '8px' : '0' }}>
                  {!active && `από ${fe(svc.plans[0].price)}/μήνα`}
                </div>
                {active && (
                  <div onClick={e => e.stopPropagation()}>
                    <select value={active.planId} onChange={e => updateS(svc.value, 'planId', e.target.value)}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '4px 6px', color: 'var(--text-primary)', fontSize: '10px', outline: 'none', marginBottom: '5px' }}>
                      {svc.plans.map(p => <option key={p.id} value={p.id}>{p.name} — {fe(p.price)}</option>)}
                    </select>
                    {/* Split */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                      <input type="checkbox" checked={active.splitActive} onChange={e => updateS(svc.value, 'splitActive', e.target.checked)} style={{ width: '12px', height: '12px', accentColor: svc.color, cursor: 'pointer' }} />
                      <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>÷</span>
                      {active.splitActive && (
                        <input
                          type="number" min="2"
                          value={active.splitPeople}
                          onChange={e => updateS(svc.value, 'splitPeople', Math.max(2, parseInt(e.target.value) || 2))}
                          onFocus={e => e.target.select()}
                          style={{ width: '44px', background: 'var(--bg-base)', border: `1px solid ${svc.color}`, borderRadius: '6px', padding: '3px 6px', color: 'var(--text-primary)', fontSize: '12px', fontFamily: "'JetBrains Mono',monospace", outline: 'none', textAlign: 'center' }} />
                      )}
                      {active.splitActive && <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>άτομα</span>}
                    </div>
                    {/* Custom price */}
                    <input type="number" placeholder="Τιμή αν διαφέρει" value={active.customPrice} onChange={e => updateS(svc.value, 'customPrice', e.target.value)}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '4px 6px', color: 'var(--text-primary)', fontSize: '10px', outline: 'none', marginBottom: '4px', boxSizing: 'border-box' }} />
                    {/* Renewal */}
                    <div style={{marginBottom:'5px'}}>
                      <DatePicker label="Ημ. Ανανέωσης" value={active.renewalDate} onChange={v => updateS(svc.value, 'renewalDate', v)} />
                    </div>
                    <div style={{ fontWeight: 700, color: svc.color, fontSize: '13px', fontFamily: "'JetBrains Mono',monospace" }}>
                      {fe(myShare)}/μήνα
                      {active.splitActive && (active.splitPeople || 1) > 1 && <span style={{ fontSize: '9px', color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '4px' }}>μερίδιό σου</span>}
                    </div>
                  </div>
                )}
                {active && <div style={{ position: 'absolute', top: '6px', right: '8px', fontSize: '12px', color: svc.color }}>✓</div>}
              </div>
            );
          })}
        </div>
        {activeStreaming.length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{activeStreaming.length} υπηρεσίες streaming</span>
            <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--info)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(streamingCost)}/μήνα</span>
          </div>
        )}
      </div>

      {/* Cloud */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>☁️</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cloud & Λογισμικό</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '8px', marginBottom: '12px' }}>
          {CLOUD.map(svc => {
            const active = activeCloud.find(a => a.service === svc.value);
            const plan = svc.plans.find(p => p.id === active?.planId);
            const cost = parseFloat(active?.customPrice || '') || plan?.price || 0;
            const myShare = active?.splitActive && (active?.splitPeople || 1) > 1 ? cost / (active.splitPeople || 1) : cost;
            return (
              <div key={svc.value} onClick={() => toggleCloud(svc.value)}
                style={{ background: active ? 'rgba(59,130,246,0.1)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--info)' : 'var(--border-subtle)'}`, borderRadius: '10px', padding: '10px', cursor: 'pointer', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '12px' }}>{svc.icon}</span>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: active ? 'var(--info)' : 'var(--text-primary)' }}>{svc.label}</span>
                  {active && <a href={svc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: '8px', color: 'var(--accent)', textDecoration: 'none', marginLeft: 'auto' }}>↗</a>}
                </div>
                {active ? (
                  <div onClick={e => e.stopPropagation()}>
                    <select value={active.planId} onChange={e => updateC(svc.value, 'planId', e.target.value)}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '3px 4px', color: 'var(--text-primary)', fontSize: '9px', outline: 'none', marginBottom: '4px' }}>
                      {svc.plans.map(p => <option key={p.id} value={p.id}>{p.name} {fe(p.price)}</option>)}
                    </select>
                    {/* Split */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px', background: 'var(--bg-base)', borderRadius: '6px', padding: '4px 6px' }}>
                      <input type="checkbox" checked={active.splitActive || false} onChange={e => updateC(svc.value, 'splitActive', e.target.checked)} style={{ width: '12px', height: '12px', accentColor: 'var(--info)', cursor: 'pointer' }} />
                      <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Διαμοιρασμός ÷</span>
                      {active.splitActive && <>
                        <input
                          type="number" min="2" max="99"
                          value={active.splitPeople === undefined ? '' : active.splitPeople}
                          onChange={e => {
                            const v = e.target.value === '' ? 2 : parseInt(e.target.value);
                            updateC(svc.value, 'splitPeople', isNaN(v) ? 2 : Math.max(2, v));
                          }}
                          onFocus={e => e.target.select()}
                          style={{ width: '50px', background: 'var(--bg-elevated)', border: '1px solid var(--info)', borderRadius: '5px', padding: '3px 6px', color: 'var(--text-primary)', fontSize: '12px', outline: 'none', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace" }} />
                        <span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>άτομα</span>
                      </>}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--info)', fontSize: '11px', fontFamily: "'JetBrains Mono',monospace" }}>{fe(myShare)}/μήνα</div>
                  </div>
                ) : (
                  <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>από {fe(svc.plans[0].price)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Other subs */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '16px' }}>➕</span>
          <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Άλλες Πάγιες Συνδρομές</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '8px', alignItems: 'flex-end', marginBottom: '12px' }}>
          <TextInput label="Ονομασία" value={newSubName} onChange={setNewSubName} placeholder="π.χ. Canva Pro, Adobe, Antivirus..." />
          <NumberInput label="€/μήνα" value={newSubPrice} onChange={setNewSubPrice} suffix="€" step={1} />
          <DatePicker label="Ημ. Ανανέωσης" value={newSubRenewal} onChange={setNewSubRenewal} />
          <button onClick={() => { if (newSubName && newSubPrice) { setOtherSubs(prev => [...prev, { name: newSubName, price: newSubPrice, renewalDate: newSubRenewal }]); setNewSubName(''); setNewSubPrice(''); setNewSubRenewal(''); } }}
            style={{ background: 'var(--accent)', color: 'var(--bg-base)', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif', marginBottom: '12px', whiteSpace: 'nowrap' }}>
            + Προσθήκη
          </button>
        </div>
        {otherSubs.map((s, i) => {
          const daysLeft = s.renewalDate ? Math.ceil((new Date(s.renewalDate).getTime() - new Date().getTime()) / 86400000) : null;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
                {s.renewalDate && <span style={{ fontSize: '9px', color: daysLeft !== null && daysLeft <= 7 ? 'var(--warning)' : 'var(--text-tertiary)', marginLeft: '8px' }}>
                  📅 {new Date(s.renewalDate).toLocaleDateString('el-GR')} {daysLeft !== null && daysLeft <= 7 ? `(${daysLeft} ημέρες)` : ''}
                </span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(parseFloat(s.price))}</span>
                <button onClick={() => setOtherSubs(prev => prev.filter((_, j) => j !== i))}
                  style={{ width: '22px', height: '22px', borderRadius: '5px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '11px' }}>✕</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}