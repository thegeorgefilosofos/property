'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';

const INSURANCE_COMPANIES = [
  {
    value: 'hellas_direct', label: 'Hellas Direct',
    url: 'https://www.hellasdirect.gr', agent_label: 'Ψηφιακή — χωρίς ασφαλιστή',
    plans: [
      { id: 'hd_basic',    name: 'Basic',   monthly: 8.90,  annual: 89,  covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],                                         earthquake: false, flood: false, natural: false },
      { id: 'hd_plus',     name: 'Plus',    monthly: 14.90, annual: 149, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Πλημμύρα','Θύελλα'],                      earthquake: false, flood: true,  natural: true  },
      { id: 'hd_premium',  name: 'Premium', monthly: 22.90, annual: 219, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'],      earthquake: true,  flood: true,  natural: true  },
    ]
  },
  {
    value: 'interamerican', label: 'Interamerican',
    url: 'https://www.interamerican.gr', agent_label: 'Ασφαλιστής Interamerican',
    plans: [
      { id: 'ia_basic',    name: 'Oikia Basic',   monthly: 12.50, annual: 125, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις'],                        earthquake: false, flood: false, natural: false },
      { id: 'ia_comfort',  name: 'Oikia Comfort', monthly: 18.00, annual: 180, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις','Θεομηνία'],            earthquake: false, flood: true,  natural: true  },
      { id: 'ia_full',     name: 'Oikia Full',    monthly: 26.00, annual: 250, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις','Σεισμός','Πλημμύρα'], earthquake: true,  flood: true,  natural: true  },
    ]
  },
  {
    value: 'eurolife', label: 'Eurolife FFH',
    url: 'https://www.eurolife.gr', agent_label: 'Σύμβουλος Eurolife FFH',
    plans: [
      { id: 'el_first_std',  name: 'My Home First Standard', monthly: 12.00, annual: 120, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικές Καταστροφές','Σωληνώσεις'],                              earthquake: true,  flood: true,  natural: true  },
      { id: 'el_first_plus', name: 'My Home First Plus',     monthly: 20.00, annual: 195, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικές Καταστροφές','Βραχυκύκλωμα','Ενοίκιο Αντικατάστασης'], earthquake: true,  flood: true,  natural: true  },
      { id: 'el_luxury',     name: 'My Home Luxury',         monthly: 30.00, annual: 290, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Ηλεκτρ. Βλάβες','Καθίζηση'],              earthquake: true,  flood: true,  natural: true  },
    ]
  },
  {
    value: 'generali', label: 'Generali',
    url: 'https://www.generali.gr', agent_label: 'Σύμβουλος Generali',
    plans: [
      { id: 'gen_basic',   name: 'MyHome Basic',   monthly: 11.00, annual: 110, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],                          earthquake: false, flood: false, natural: false },
      { id: 'gen_plus',    name: 'MyHome Plus',    monthly: 16.00, annual: 155, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'],              earthquake: false, flood: true,  natural: true  },
      { id: 'gen_premium', name: 'MyHome Premium', monthly: 24.00, annual: 230, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'], earthquake: true, flood: true, natural: true },
    ]
  },
  {
    value: 'axa', label: 'AXA Ασφαλιστική',
    url: 'https://www.axa.gr', agent_label: 'Σύμβουλος AXA',
    plans: [
      { id: 'axa_basic',    name: 'Home Basic',    monthly: 9.50,  annual: 95,  covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],              earthquake: false, flood: false, natural: false },
      { id: 'axa_comfort',  name: 'Home Comfort',  monthly: 15.00, annual: 148, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'], earthquake: false, flood: true,  natural: true  },
      { id: 'axa_premium',  name: 'Home Premium',  monthly: 23.00, annual: 225, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα'], earthquake: true, flood: true, natural: true },
    ]
  },
  {
    value: 'ethniki', label: 'Εθνική Ασφαλιστική',
    url: 'https://www.ethniki-asfalistiki.gr', agent_label: 'Σύμβουλος Εθνικής Ασφαλιστικής',
    plans: [
      { id: 'eth_oikos', name: 'Οίκος',     monthly: 13.00, annual: 126, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σωληνώσεις'], earthquake: false, flood: false, natural: false },
      { id: 'eth_mega',  name: 'MegaHome',  monthly: 20.00, annual: 195, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'],  earthquake: false, flood: true,  natural: true  },
      { id: 'eth_ultra', name: 'UltraHome', monthly: 28.00, annual: 270, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'], earthquake: true, flood: true, natural: true },
    ]
  },
  {
    value: 'nn_hellas', label: 'NN Hellas',
    url: 'https://www.nnhellas.gr', agent_label: 'Σύμβουλος NN Hellas',
    plans: [
      { id: 'nn_home_basic',    name: 'NN Home Basic',    monthly: 10.00, annual: 99,  covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],                         earthquake: false, flood: false, natural: false },
      { id: 'nn_home_plus',     name: 'NN Home Plus',     monthly: 17.00, annual: 165, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικά Φαινόμενα'],     earthquake: false, flood: true,  natural: true  },
      { id: 'nn_home_premium',  name: 'NN Home Premium',  monthly: 25.00, annual: 240, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Ηλεκτρ. Βλάβες'], earthquake: true, flood: true, natural: true },
    ]
  },
  {
    value: 'groupama', label: 'Groupama Ασφαλιστική',
    url: 'https://www.groupama.gr', agent_label: 'Σύμβουλος Groupama',
    plans: [
      { id: 'grp_habitat',      name: 'Habitat Basic', monthly: 11.50, annual: 112, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],                       earthquake: false, flood: false, natural: false },
      { id: 'grp_habitat_plus', name: 'Habitat Plus',  monthly: 18.50, annual: 178, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικά Φαινόμενα'],   earthquake: false, flood: true,  natural: true  },
      { id: 'grp_habitat_full', name: 'Habitat Full',  monthly: 26.00, annual: 248, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα','Βανδαλισμός'], earthquake: true, flood: true, natural: true },
    ]
  },
  {
    value: 'allianz', label: 'Allianz Hellas',
    url: 'https://www.allianz.gr', agent_label: 'Σύμβουλος Allianz',
    plans: [
      { id: 'alz_home',    name: 'Allianz Home Basic',    monthly: 12.00, annual: 115, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],                      earthquake: false, flood: false, natural: false },
      { id: 'alz_comfort', name: 'Allianz Home Comfort',  monthly: 19.00, annual: 182, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Φυσικά Φαινόμενα'], earthquake: false, flood: true,  natural: true  },
      { id: 'alz_premium', name: 'Allianz Home Premium',  monthly: 27.00, annual: 258, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Σεισμός','Πλημμύρα'], earthquake: true, flood: true, natural: true },
    ]
  },
  {
    value: 'minetta', label: 'Ασφάλειαι Μινέττα',
    url: 'https://www.minetta.gr', agent_label: 'Σύμβουλος Μινέττα',
    plans: [
      { id: 'min_basic', name: 'Κατοικία Basic', monthly: 9.00,  annual: 88,  covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'],              earthquake: false, flood: false, natural: false },
      { id: 'min_plus',  name: 'Κατοικία Plus',  monthly: 15.50, annual: 148, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θεομηνία'], earthquake: false, flood: true,  natural: true  },
    ]
  },
  {
    value: 'other', label: 'Άλλη Ασφαλιστική',
    url: '', agent_label: 'Ασφαλιστής',
    plans: [
      { id: 'other_custom', name: 'Προσαρμοσμένο', monthly: 0, annual: 0, covers: [], earthquake: false, flood: false, natural: false },
    ]
  },
];

const STREAMING = [
  { value: 'netflix',    label: 'Netflix',             color: '#e50914', url: 'https://www.netflix.com/gr',             plans: [{ id: 'n_basic', name: 'Βασικό', price: 8.99, screens: 1 },{ id: 'n_standard', name: 'Standard', price: 12.49, screens: 2 },{ id: 'n_premium', name: 'Premium 4K', price: 15.99, screens: 4 }] },
  { value: 'disney',     label: 'Disney+',             color: '#0063e5', url: 'https://www.disneyplus.com/el-gr',        plans: [{ id: 'd_standard', name: 'Standard', price: 8.99, screens: 2 },{ id: 'd_premium', name: 'Premium', price: 13.99, screens: 4 }] },
  { value: 'apple_tv',   label: 'Apple TV+',           color: '#555555', url: 'https://www.apple.com/gr/apple-tv-plus', plans: [{ id: 'a_std', name: 'Apple TV+', price: 9.99, screens: 6 }] },
  { value: 'amazon',     label: 'Amazon Prime Video',  color: '#00a8e1', url: 'https://www.primevideo.com',              plans: [{ id: 'am_std', name: 'Prime Video', price: 8.99, screens: 3 }] },
  { value: 'max',        label: 'Max (HBO)',            color: '#0d1ce5', url: 'https://www.max.com/gr/el',              plans: [{ id: 'max_basic', name: 'Basic με Διαφ.', price: 5.99, screens: 2 },{ id: 'max_std', name: 'Standard', price: 9.99, screens: 2 },{ id: 'max_ult', name: 'Ultimate 4K', price: 15.99, screens: 4 }] },
  { value: 'spotify',    label: 'Spotify',             color: '#1db954', url: 'https://www.spotify.com/gr',             plans: [{ id: 's_individual', name: 'Individual', price: 10.99, screens: 1 },{ id: 's_duo', name: 'Duo', price: 14.99, screens: 2 },{ id: 's_family', name: 'Family', price: 17.99, screens: 6 },{ id: 's_student', name: 'Student', price: 5.99, screens: 1 }] },
  { value: 'youtube',    label: 'YouTube Premium',     color: '#ff0000', url: 'https://www.youtube.com/premium',        plans: [{ id: 'y_individual', name: 'Individual', price: 13.99, screens: 1 },{ id: 'y_family', name: 'Family', price: 22.99, screens: 6 }] },
  { value: 'ant1plus',   label: 'ANT1+',               color: '#1a56db', url: 'https://www.ant1plus.gr',                plans: [{ id: 'ant_monthly', name: 'Μηνιαία', price: 2.99, screens: 3 },{ id: 'ant_annual', name: 'Ετήσια', price: 1.66, screens: 3 }] },
  { value: 'cosmote_tv', label: 'Cosmote TV',          color: '#00adef', url: 'https://www.cosmote.gr',                 plans: [{ id: 'cos_start', name: 'Start', price: 6.00, screens: 2 },{ id: 'cos_full', name: 'Full', price: 30.00, screens: 4 }] },
];

const CLOUD = [
  { value: 'icloud',       label: 'iCloud+',       url: 'https://www.icloud.com',             plans: [{ id: 'ic_50', name: '50GB', price: 0.99 },{ id: 'ic_200', name: '200GB', price: 2.99 },{ id: 'ic_2t', name: '2TB', price: 9.99 },{ id: 'ic_6t', name: '6TB (Family)', price: 29.99 }] },
  { value: 'google_one',   label: 'Google One',    url: 'https://one.google.com',             plans: [{ id: 'g_100', name: '100GB', price: 1.99 },{ id: 'g_200', name: '200GB', price: 2.99 },{ id: 'g_2t', name: '2TB', price: 9.99 }] },
  { value: 'microsoft365', label: 'Microsoft 365', url: 'https://www.microsoft.com/el-gr',    plans: [{ id: 'ms_pers', name: 'Personal', price: 6.99 },{ id: 'ms_fam', name: 'Family (6 άτομα)', price: 9.99 }] },
  { value: 'dropbox',      label: 'Dropbox',       url: 'https://www.dropbox.com',            plans: [{ id: 'db_plus', name: 'Plus 2TB', price: 9.99 },{ id: 'db_pro', name: 'Professional', price: 16.58 }] },
  { value: 'adobe',        label: 'Adobe CC',      url: 'https://www.adobe.com/gr',           plans: [{ id: 'ad_photo', name: 'Photography', price: 12.29 },{ id: 'ad_all', name: 'All Apps', price: 54.99 }] },
];

const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
const T = { font: { sans: "Inter,'Google Sans',sans-serif", mono: "'JetBrains Mono',monospace" } };

interface StreamingEntry { service: string; planId: string; customPrice: string; splitPeople: number; splitActive: boolean; renewalDate: string; }
interface CloudEntry     { service: string; planId: string; customPrice: string; splitPeople: number; splitActive: boolean; renewalDate: string; }
interface OtherSub       { name: string; price: string; renewalDate: string; }

export default function BillsInsurance({ propertyId, userId = '' }: { propertyId: string; userId?: string }) {
  const supabase = createClient();
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 };
  const g3: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 };
  const g4: React.CSSProperties  = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 };

  // ── Cross-tab: checklist insurance renewal ──
  const [checklistRenewal, setChecklistRenewal] = useState<{ daysLeft: number | null } | null>(null);
  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        const { data } = await supabase.from('checklist_items')
          .select('status,due_date,description')
          .eq('property_id', propertyId)
          .ilike('description', '%ασφαλιστήριο%')
          .limit(1);
        if (data?.[0]) {
          const d = data[0].due_date;
          const days = d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null;
          setChecklistRenewal({ daysLeft: days });
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
    activeStreaming: [] as StreamingEntry[],
    activeCloud: [] as CloudEntry[],
    otherSubs: [] as OtherSub[],
  });

  const { insProvider, insPlanId, insCustomPrice, insCustomPlanName, insAgentName, insAgentPhone,
    insRenewalDate, insPropValue, insContentValue, insCustomCovers, insEditCovers,
    insCustomEarthquake, insCustomFlood, insCustomNatural,
    activeStreaming, activeCloud, otherSubs } = ps;

  const setInsProvider         = (v: string)  => updPs({ insProvider: v });
  const setInsPlanId           = (v: string)  => updPs({ insPlanId: v });
  const setInsCustomPrice      = (v: string)  => updPs({ insCustomPrice: v });
  const setInsCustomPlanName   = (v: string)  => updPs({ insCustomPlanName: v });
  const setInsAgentName        = (v: string)  => updPs({ insAgentName: v });
  const setInsAgentPhone       = (v: string)  => updPs({ insAgentPhone: v });
  const setInsRenewalDate      = (v: string)  => updPs({ insRenewalDate: v });
  const setInsPropValue        = (v: string)  => updPs({ insPropValue: v });
  const setInsContentValue     = (v: string)  => updPs({ insContentValue: v });
  const setInsCustomCovers     = (v: string)  => updPs({ insCustomCovers: v });
  const setInsEditCovers       = (v: boolean | ((p: boolean) => boolean)) => updPs({ insEditCovers: typeof v === 'function' ? v(ps.insEditCovers) : v });
  const setInsCustomEarthquake = (v: boolean) => updPs({ insCustomEarthquake: v });
  const setInsCustomFlood      = (v: boolean) => updPs({ insCustomFlood: v });
  const setInsCustomNatural    = (v: boolean) => updPs({ insCustomNatural: v });
  const setActiveStreaming = (v: StreamingEntry[] | ((p: StreamingEntry[]) => StreamingEntry[])) => updPs({ activeStreaming: typeof v === 'function' ? v(ps.activeStreaming || []) : v });
  const setActiveCloud     = (v: CloudEntry[]     | ((p: CloudEntry[])     => CloudEntry[]))     => updPs({ activeCloud:     typeof v === 'function' ? v(ps.activeCloud || [])     : v });
  const setOtherSubs       = (v: OtherSub[]        | ((p: OtherSub[])        => OtherSub[]))        => updPs({ otherSubs:       typeof v === 'function' ? v(ps.otherSubs || [])       : v });

  const [newSubName, setNewSubName]       = useState('');
  const [newSubPrice, setNewSubPrice]     = useState('');
  const [newSubRenewal, setNewSubRenewal] = useState('');

  const insCompany  = INSURANCE_COMPANIES.find(c => c.value === insProvider);
  const insPlan     = insCompany?.plans.find(p => p.id === insPlanId) as any;
  const insCost     = parseFloat(insCustomPrice) || insPlan?.monthly || 0;
  const effectiveCovers    = insEditCovers && insCustomCovers ? insCustomCovers.split(',').map(s => s.trim()).filter(Boolean) : (insPlan?.covers || []);
  const effectiveEarthquake = insEditCovers ? insCustomEarthquake : (insPlan?.earthquake || false);
  const effectiveFlood      = insEditCovers ? insCustomFlood      : (insPlan?.flood      || false);
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
  const renewalAlerts: { name: string; daysLeft: number; type: 'danger' | 'warning' | 'info' }[] = [];
  const checkRenewal = (name: string, dateStr: string, warningDays: number) => {
    if (!dateStr) return;
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    if (diff >= 0 && diff <= warningDays)
      renewalAlerts.push({ name, daysLeft: diff, type: diff <= 3 ? 'danger' : diff <= 7 ? 'warning' : 'info' });
  };
  if (insRenewalDate) checkRenewal(`Ασφάλεια κατοικίας (${insCompany?.label})`, insRenewalDate, 60);
  (activeStreaming || []).forEach(a => { const svc = STREAMING.find(x => x.value === a.service); if (a.renewalDate) checkRenewal(svc?.label || a.service, a.renewalDate, 5); });
  (activeCloud     || []).forEach(a => { const svc = CLOUD.find(x => x.value === a.service);     if (a.renewalDate) checkRenewal(svc?.label || a.service, a.renewalDate, 7); });
  (otherSubs       || []).forEach(s => { if (s.renewalDate) checkRenewal(s.name, s.renewalDate, 7); });

  const insOptions     = INSURANCE_COMPANIES.map(c => ({ value: c.value, label: c.label }));
  const insPlanOptions = (insCompany?.plans || []).map(p => ({ value: p.id, label: `${(p as any).name} — ${(p as any).monthly > 0 ? `~${(p as any).monthly.toFixed(2)}€` : 'Χειροκίνητο'}` }));

  const toggleStreaming = (svc: string) => {
    if ((activeStreaming || []).find(a => a.service === svc)) setActiveStreaming(prev => prev.filter(a => a.service !== svc));
    else { const s = STREAMING.find(x => x.value === svc); setActiveStreaming(prev => [...prev, { service: svc, planId: s?.plans[0].id || '', customPrice: '', splitPeople: 1, splitActive: false, renewalDate: '' }]); }
  };
  const updateS = (svc: string, field: string, val: any) => setActiveStreaming(prev => prev.map(a => a.service === svc ? { ...a, [field]: val } : a));
  const toggleCloud = (svc: string) => {
    if ((activeCloud || []).find(a => a.service === svc)) setActiveCloud(prev => prev.filter(a => a.service !== svc));
    else { const s = CLOUD.find(x => x.value === svc); setActiveCloud(prev => [...prev, { service: svc, planId: s?.plans[0].id || '', customPrice: '', splitPeople: 1, splitActive: false, renewalDate: '' }]); }
  };
  const updateC = (svc: string, field: string, val: any) => setActiveCloud(prev => prev.map(a => a.service === svc ? { ...a, [field]: val } : a));

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{label}</span>
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* ── Cross-tab: Checklist insurance renewal ── */}
      {checklistRenewal && checklistRenewal.daysLeft !== null && checklistRenewal.daysLeft <= 60 && (
        <div style={{ background: checklistRenewal.daysLeft <= 7 ? 'rgba(197,34,31,0.07)' : 'rgba(242,153,0,0.07)', border: `1px solid ${checklistRenewal.daysLeft <= 7 ? 'rgba(197,34,31,0.25)' : 'rgba(242,153,0,0.25)'}`, borderRadius: 10, padding: '11px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontFamily: T.font.sans }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: checklistRenewal.daysLeft <= 7 ? 'var(--negative)' : 'var(--warning)', flexShrink: 0 }}/>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, color: checklistRenewal.daysLeft <= 7 ? 'var(--negative)' : 'var(--warning)' }}>Ανανέωση ασφαλιστηρίου </span>
            <span style={{ color: 'var(--text-secondary)' }}>{checklistRenewal.daysLeft <= 0 ? 'έχει λήξει — καταγεγραμμένο στο Checklist' : `σε ${checklistRenewal.daysLeft} ημέρες — από Checklist`}</span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: 20, whiteSpace: 'nowrap' }}>Checklist</span>
        </div>
      )}

      {/* ── Renewal Alerts ── */}
      {renewalAlerts.map((a, i) => (
        <div key={i} style={{ background: a.type === 'danger' ? 'rgba(197,34,31,0.08)' : a.type === 'warning' ? 'rgba(242,153,0,0.08)' : 'rgba(26,115,232,0.06)', border: `1px solid ${a.type === 'danger' ? 'var(--negative)' : a.type === 'warning' ? 'var(--warning)' : 'var(--info)'}`, borderRadius: 10, padding: '10px 16px', marginBottom: 10, fontSize: 11, color: a.type === 'danger' ? 'var(--negative)' : a.type === 'warning' ? 'var(--warning)' : 'var(--info)', display: 'flex', alignItems: 'center', gap: 10, fontFamily: T.font.sans }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }}/>
          <strong>{a.name}</strong>: {a.daysLeft === 0 ? 'Λήγει ΣΗΜΕΡΑ' : `Λήγει σε ${a.daysLeft} ημέρες`}
        </div>
      ))}

      {/* ── KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Ασφάλεια Κατοικίας',  value: fe(insCost),        color: 'var(--text-primary)' },
          { label: 'Streaming & Media',    value: fe(streamingCost),  color: 'var(--text-primary)' },
          { label: 'Cloud & Λογισμικό',    value: fe(cloudCost),      color: 'var(--text-primary)' },
          { label: 'Σύνολο / μήνα',        value: fe(total),          color: total > 0 ? 'var(--accent)' : 'var(--text-primary)' },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, fontFamily: T.font.mono }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Ασφάλεια Κατοικίας ── */}
      <div style={card}>
        {secHdr('Ασφάλεια Κατοικίας')}
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 14, fontFamily: T.font.sans }}>Ενδεικτικές τιμές για κατοικία ~100τ.μ., αντικ. αξία ~150.000€ — επαλήθευσε με τον ασφαλιστή σου</div>

        <div style={g3}>
          <CustomSelect label="Ασφαλιστική Εταιρεία" value={insProvider} onChange={v => { setInsProvider(v); const c = INSURANCE_COMPANIES.find(x => x.value === v); if (c) setInsPlanId(c.plans[0].id); setInsEditCovers(false); setInsCustomCovers(''); }} options={insOptions}/>
          <CustomSelect label="Πρόγραμμα Ασφάλισης" value={insPlanId} onChange={v => { setInsPlanId(v); setInsEditCovers(false); setInsCustomCovers(''); }} options={insPlanOptions}/>
          <NumberInput label="Πραγματικό Κόστος / μήνα (€)" value={insCustomPrice} onChange={setInsCustomPrice} suffix="€" step={1}/>
        </div>

        {insProvider === 'other' && (
          <div style={{ marginBottom: 12 }}>
            <TextInput label="Ονομασία Προγράμματος" value={insCustomPlanName} onChange={setInsCustomPlanName} placeholder="π.χ. Ergo Home Basic, Interlife Standard..."/>
          </div>
        )}

        <div style={g4}>
          <TextInput label={insCompany?.agent_label || 'Ασφαλιστής'} value={insAgentName} onChange={setInsAgentName} placeholder="Ονοματεπώνυμο"/>
          <TextInput label="Τηλέφωνο Ασφαλιστή" value={insAgentPhone} onChange={setInsAgentPhone} placeholder="69xxxxxxxx"/>
          <NumberInput label="Αξία Κτηρίου (€)" value={insPropValue} onChange={setInsPropValue} suffix="€" step={5000}/>
          <NumberInput label="Αξία Περιεχομένου (€)" value={insContentValue} onChange={setInsContentValue} suffix="€" step={1000}/>
        </div>

        <div style={g2}>
          <DatePicker label="Ημερομηνία Ανανέωσης Ασφαλιστηρίου" value={insRenewalDate} onChange={setInsRenewalDate}/>
          {insCompany?.url && (
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <a href={insCompany.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '9px 14px', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans }}>
                Επίσημη σελίδα {insCompany.label}
              </a>
            </div>
          )}
        </div>

        {/* Plan details + editable covers */}
        {insPlan && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 14, border: '1px solid var(--border-subtle)', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                {[
                  { label: 'Σεισμός',             ok: effectiveEarthquake },
                  { label: 'Πλημμύρα',             ok: effectiveFlood },
                  { label: 'Φυσικές Καταστροφές',  ok: effectiveNatural },
                ].map((r, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: r.ok ? 'var(--positive)' : 'var(--negative)' }}>{r.ok ? '✓' : '✗'}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', fontFamily: T.font.sans }}>{r.label}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setInsEditCovers((v: boolean) => !v); if (!insEditCovers) { setInsCustomCovers(effectiveCovers.join(', ')); setInsCustomEarthquake(effectiveEarthquake); setInsCustomFlood(effectiveFlood); setInsCustomNatural(effectiveNatural); } }}
                style={{ fontSize: 10, color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontFamily: T.font.sans }}>
                {insEditCovers ? 'Αποθήκευση' : 'Επεξεργασία Καλύψεων'}
              </button>
            </div>

            {insEditCovers ? (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4, fontFamily: T.font.sans }}>Καλύψεις (χωρισμένες με κόμμα)</label>
                  <input value={insCustomCovers} onChange={e => setInsCustomCovers(e.target.value)} placeholder="π.χ. Πυρκαγιά, Κλοπή, Σεισμός, Πλημμύρα..."
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--accent)', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: T.font.sans }}/>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Καλύπτει Σεισμό',              state: insCustomEarthquake, set: setInsCustomEarthquake },
                    { label: 'Καλύπτει Πλημμύρα',             state: insCustomFlood,      set: setInsCustomFlood },
                    { label: 'Καλύπτει Φυσικές Καταστροφές',  state: insCustomNatural,    set: setInsCustomNatural },
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input type="checkbox" checked={r.state} onChange={e => r.set(e.target.checked)} style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }}/>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{r.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: T.font.sans }}>
                {effectiveCovers.join(' · ') || 'Δεν έχουν οριστεί καλύψεις'}
              </div>
            )}

            {effectiveEarthquake && effectiveFlood && (
              <div style={{ marginTop: 10, background: 'rgba(52,168,83,0.08)', border: '1px solid rgba(52,168,83,0.3)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: 'var(--positive)', fontFamily: T.font.sans }}>
                Δικαιούσαι μείωση ΕΝΦΙΑ 10-20% (Α.1005/2026) — ρύθμισε στο tab Υπηρεσίες → ΕΝΦΙΑ.
              </div>
            )}
          </div>
        )}

        {/* Insurance comparison table */}
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>Σύγκριση Ασφαλιστικών — Ενδεικτικές τιμές</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 700 }}>
            <thead>
              <tr>
                {['Εταιρεία','Πρόγραμμα','Σεισμός','Πλημμύρα','Φυσ. Καταστροφές','Μηνιαίο*','Ετήσιο*'].map((h, i) => (
                  <th key={i} style={{ fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 600, fontFamily: T.font.sans, background: 'var(--bg-elevated)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {INSURANCE_COMPANIES.filter(c => c.value !== 'other').flatMap(c => c.plans.map(plan => {
                const isCur = plan.id === insPlanId;
                const p = plan as any;
                return (
                  <tr key={plan.id} onClick={() => { setInsProvider(c.value); setInsPlanId(plan.id); setInsEditCovers(false); }}
                    style={{ cursor: 'pointer', background: isCur ? 'rgba(212,175,66,0.08)' : 'transparent', transition: 'background 0.15s' }}>
                    <td style={{ padding: '7px 8px', fontWeight: isCur ? 700 : 400, color: isCur ? 'var(--accent)' : 'var(--text-primary)', whiteSpace: 'nowrap', fontFamily: T.font.sans }}>{c.label}{isCur ? ' ✓' : ''}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{p.name}</td>
                    <td style={{ padding: '7px 8px', color: p.earthquake ? 'var(--positive)' : 'var(--text-tertiary)', fontWeight: 700, textAlign: 'center' }}>{p.earthquake ? '✓' : '—'}</td>
                    <td style={{ padding: '7px 8px', color: p.flood     ? 'var(--positive)' : 'var(--text-tertiary)', fontWeight: 700, textAlign: 'center' }}>{p.flood     ? '✓' : '—'}</td>
                    <td style={{ padding: '7px 8px', color: p.natural   ? 'var(--positive)' : 'var(--text-tertiary)', fontWeight: 700, textAlign: 'center' }}>{p.natural   ? '✓' : '—'}</td>
                    <td style={{ padding: '7px 8px', fontWeight: 600, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono }}>{p.monthly > 0 ? fe(p.monthly) : '—'}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{p.annual > 0 ? fe(p.annual) : '—'}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 8, padding: '8px 12px', background: 'var(--bg-elevated)', borderRadius: 6, fontFamily: T.font.sans }}>
          *Ενδεικτικές τιμές για κατοικία ~100τ.μ., αντικ. αξία ~150.000€. Χρησιμοποίησε{' '}
          <a href="https://www.insurancemarket.gr/katoikia/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>insurancemarket.gr</a>{' '}
          για ακριβή σύγκριση. Πάτα γραμμή για επιλογή.
        </div>
      </div>

      {/* ── Streaming ── */}
      <div style={card}>
        {secHdr('Streaming & Ψυχαγωγία')}
        <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginBottom: 14, fontFamily: T.font.sans }}>Τιμές Ελλάδα — επαλήθευσε στον πάροχο</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
          {STREAMING.map(svc => {
            const active = (activeStreaming || []).find(a => a.service === svc.value);
            const plan   = svc.plans.find(p => p.id === active?.planId);
            const cost   = parseFloat(active?.customPrice || '') || plan?.price || 0;
            const myShare = active?.splitActive && (active?.splitPeople || 1) > 1 ? cost / (active.splitPeople || 1) : cost;
            return (
              <div key={svc.value} onClick={() => toggleStreaming(svc.value)}
                style={{ background: active ? `${svc.color}12` : 'var(--bg-elevated)', border: `1px solid ${active ? svc.color : 'var(--border-subtle)'}`, borderRadius: 10, padding: 12, cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: svc.color, flexShrink: 0 }}/>
                  <span style={{ fontSize: 12, fontWeight: 600, color: active ? svc.color : 'var(--text-primary)', fontFamily: T.font.sans }}>{svc.label}</span>
                  <a href={svc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 9, color: 'var(--accent)', textDecoration: 'none', marginLeft: 'auto', opacity: active ? 1 : 0.4, fontFamily: T.font.sans }}>↗</a>
                </div>
                {!active && <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>από {fe(svc.plans[0].price)}/μήνα</div>}
                {active && (
                  <div onClick={e => e.stopPropagation()}>
                    <select value={active.planId} onChange={e => updateS(svc.value, 'planId', e.target.value)}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 6px', color: 'var(--text-primary)', fontSize: 10, outline: 'none', marginBottom: 5, fontFamily: T.font.sans }}>
                      {svc.plans.map(p => <option key={p.id} value={p.id}>{p.name} — {fe(p.price)}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                      <input type="checkbox" checked={active.splitActive} onChange={e => updateS(svc.value, 'splitActive', e.target.checked)} style={{ width: 12, height: 12, accentColor: svc.color, cursor: 'pointer' }}/>
                      <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Διαμοιρασμός</span>
                      {active.splitActive && (
                        <input type="number" min="2" value={active.splitPeople} onChange={e => updateS(svc.value, 'splitPeople', Math.max(2, parseInt(e.target.value) || 2))}
                          style={{ width: 44, background: 'var(--bg-base)', border: `1px solid ${svc.color}`, borderRadius: 6, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.mono, outline: 'none', textAlign: 'center' }}/>
                      )}
                    </div>
                    <input type="number" placeholder="Τιμή αν διαφέρει" value={active.customPrice} onChange={e => updateS(svc.value, 'customPrice', e.target.value)}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '4px 6px', color: 'var(--text-primary)', fontSize: 10, outline: 'none', marginBottom: 4, boxSizing: 'border-box' as const, fontFamily: T.font.mono }}/>
                    <div style={{ marginBottom: 5 }}>
                      <DatePicker label="Ημ. Ανανέωσης" value={active.renewalDate} onChange={v => updateS(svc.value, 'renewalDate', v)}/>
                    </div>
                    <div style={{ fontWeight: 700, color: svc.color, fontSize: 13, fontFamily: T.font.mono }}>
                      {fe(myShare)}/μήνα
                      {active.splitActive && (active.splitPeople || 1) > 1 && <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 4 }}>μερίδιό σου</span>}
                    </div>
                  </div>
                )}
                {active && <div style={{ position: 'absolute', top: 6, right: 8, fontSize: 11, color: svc.color }}>✓</div>}
              </div>
            );
          })}
        </div>
        {(activeStreaming || []).length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{(activeStreaming || []).length} υπηρεσίες streaming</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(streamingCost)}/μήνα</span>
          </div>
        )}
      </div>

      {/* ── Cloud ── */}
      <div style={card}>
        {secHdr('Cloud & Λογισμικό')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 12 }}>
          {CLOUD.map(svc => {
            const active = (activeCloud || []).find(a => a.service === svc.value);
            const plan   = svc.plans.find(p => p.id === active?.planId);
            const cost   = parseFloat(active?.customPrice || '') || plan?.price || 0;
            const myShare = active?.splitActive && (active?.splitPeople || 1) > 1 ? cost / (active.splitPeople || 1) : cost;
            return (
              <div key={svc.value} onClick={() => toggleCloud(svc.value)}
                style={{ background: active ? 'rgba(26,115,232,0.1)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--info)' : 'var(--border-subtle)'}`, borderRadius: 10, padding: 10, cursor: 'pointer', transition: 'all 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--info)', flexShrink: 0 }}/>
                  <span style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--info)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{svc.label}</span>
                  {active && <a href={svc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 8, color: 'var(--accent)', textDecoration: 'none', marginLeft: 'auto' }}>↗</a>}
                </div>
                {active ? (
                  <div onClick={e => e.stopPropagation()}>
                    <select value={active.planId} onChange={e => updateC(svc.value, 'planId', e.target.value)}
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '3px 4px', color: 'var(--text-primary)', fontSize: 9, outline: 'none', marginBottom: 4, fontFamily: T.font.sans }}>
                      {svc.plans.map(p => <option key={p.id} value={p.id}>{p.name} {fe(p.price)}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, background: 'var(--bg-base)', borderRadius: 6, padding: '3px 5px' }}>
                      <input type="checkbox" checked={active.splitActive || false} onChange={e => updateC(svc.value, 'splitActive', e.target.checked)} style={{ width: 11, height: 11, accentColor: 'var(--info)', cursor: 'pointer' }}/>
                      <span style={{ fontSize: 8, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>÷</span>
                      {active.splitActive && (
                        <input type="number" min="2" max="99" value={active.splitPeople || 2} onChange={e => updateC(svc.value, 'splitPeople', Math.max(2, parseInt(e.target.value)||2))}
                          style={{ width: 40, background: 'var(--bg-elevated)', border: '1px solid var(--info)', borderRadius: 5, padding: '2px 4px', color: 'var(--text-primary)', fontSize: 11, outline: 'none', textAlign: 'center', fontFamily: T.font.mono }}/>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--info)', fontSize: 11, fontFamily: T.font.mono }}>{fe(myShare)}/μήνα</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>από {fe(svc.plans[0].price)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Άλλες Συνδρομές ── */}
      <div style={card}>
        {secHdr('Άλλες Πάγιες Συνδρομές')}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
          <TextInput    label="Ονομασία"          value={newSubName}    onChange={setNewSubName}    placeholder="π.χ. Canva Pro, Adobe, Antivirus..."/>
          <NumberInput  label="Κόστος / μήνα (€)" value={newSubPrice}   onChange={setNewSubPrice}   suffix="€" step={1}/>
          <DatePicker   label="Ημ. Ανανέωσης"     value={newSubRenewal} onChange={setNewSubRenewal}/>
          <button onClick={() => { if (newSubName && newSubPrice) { setOtherSubs((prev: OtherSub[]) => [...prev, { name: newSubName, price: newSubPrice, renewalDate: newSubRenewal }]); setNewSubName(''); setNewSubPrice(''); setNewSubRenewal(''); } }}
            style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 10, padding: '0 18px', height: 38, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans, marginBottom: 12, whiteSpace: 'nowrap' }}>
            + Προσθήκη
          </button>
        </div>
        {(otherSubs || []).map((s, i) => {
          const daysLeft = s.renewalDate ? Math.ceil((new Date(s.renewalDate).getTime() - Date.now()) / 86400000) : null;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{s.name}</span>
                {s.renewalDate && <span style={{ fontSize: 10, color: daysLeft !== null && daysLeft <= 7 ? 'var(--warning)' : 'var(--text-tertiary)', marginLeft: 10, fontFamily: T.font.sans }}>
                  {new Date(s.renewalDate).toLocaleDateString('el-GR')} {daysLeft !== null && daysLeft <= 7 ? `(${daysLeft} ημέρες)` : ''}
                </span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(parseFloat(s.price))}</span>
                <button onClick={() => setOtherSubs((prev: OtherSub[]) => prev.filter((_, j) => j !== i))}
                  style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            </div>
          );
        })}

        {/* Summary */}
        {total > 0 && (
          <div style={{ marginTop: 16, background: 'var(--bg-elevated)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Σύνολο ασφάλεια + streaming + cloud + άλλα</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono }}>{fe(total)}/μήνα</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>{fe(total * 12)}/έτος</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}