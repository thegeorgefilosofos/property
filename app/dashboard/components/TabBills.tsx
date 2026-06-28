'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import BillsDashboard   from './BillsDashboard';
import BillsElectricity from './BillsElectricity';
import BillsCommon      from './BillsCommon';
import BillsProviders   from './BillsProviders';
import BillsInsurance   from './BillsInsurance';
import BillsServices    from './BillsServices';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  propertyId:       string;
  userId:           string;
  propertyName?:    string;
  propertyAddress?: string;
}

type TabId =
  | 'dashboard' | 'electricity' | 'common' | 'providers' | 'insurance' | 'services'
  | 'notifications' | 'budget' | 'bank_import' | 'ai_scan' | 'multi_property';

interface TabDef {
  id:    TabId;
  label: string;
  icon:  string;
  desc:  string;
}

interface TabGroup {
  label: string;
  tabs:  TabDef[];
}

interface StripData {
  totalMonthly: number;
  overdueCount: number;
  tenantName:   string;
  notifCount:   number;
  lastUpdate:   number;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font:   { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};

// ─── SVG icon paths ───────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  dashboard:  'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5zM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4zm10-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6z',
  bolt:       'M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z',
  building:   'M3 21h18M5 21V7l8-4 8 4v14M9 21V15h6v6M9 11h1m4 0h1M9 7h1m4 0h1',
  wifi:       'M12 18h.01M8.5 14.5A5.5 5.5 0 0 1 12 13a5.5 5.5 0 0 1 3.5 1.5M5 11a9 9 0 0 1 14 0M1.5 7.5a14 14 0 0 1 21 0',
  shield:     'M12 3l8 4v5c0 5-3.5 9.7-8 11-4.5-1.3-8-6-8-11V7l8-4z',
  wrench:     'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  bell:       'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  chart:      'M18 20V10M12 20V4M6 20v-6',
  bank:       'M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3',
  camera:     'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  buildings:  'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20M10 10h4M10 14h4M10 18h4M10 6h4',
  spinner:    'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',
  file:       'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
};

const TabIcon = ({ name, size = 13 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={ICONS[name] ?? ICONS.dashboard}/>
  </svg>
);

// ─── Tab definitions — καθαρά ελληνικά, χωρίς badge ──────────────────────────
const TAB_GROUPS: TabGroup[] = [
  {
    label: 'Λογαριασμοί',
    tabs: [
      { id: 'dashboard',     label: 'Επισκόπηση',          icon: 'dashboard', desc: 'Σύνοψη, ανάλυση, γραφήματα, ημερολόγιο πληρωμών' },
      { id: 'electricity',   label: 'Ρεύμα',                icon: 'bolt',      desc: 'Πάροχος, κατανάλωση kWh, τιμολόγιο, σύγκριση παρόχων' },
      { id: 'common',        label: 'Κοινόχρηστα',          icon: 'building',  desc: 'Διαχείριση κτηρίου, ταμείο, ιστορικό' },
      { id: 'providers',     label: 'Πάροχοι',              icon: 'wifi',      desc: 'Internet, Νερό, Θέρμανση, Φυσικό Αέριο, Security' },
      { id: 'insurance',     label: 'Ασφάλεια & Συνδρομές', icon: 'shield',    desc: 'Ασφάλεια κατοικίας, streaming, cloud — live σύγκριση' },
      { id: 'services',      label: 'Υπηρεσίες',            icon: 'wrench',    desc: 'ΕΝΦΙΑ, Δημοτικά, καθαρισμός, κηπουρός, πισίνα' },
    ],
  },
  {
    label: 'Εργαλεία',
    tabs: [
      { id: 'notifications', label: 'Ειδοποιήσεις',        icon: 'bell',      desc: 'Έξυπνες ειδοποιήσεις βάσει δεδομένων — ΕΝΦΙΑ, λήξεις, budget' },
      { id: 'budget',        label: 'Προϋπολογισμός',       icon: 'chart',     desc: 'Στόχοι vs πραγματικό κόστος — ανά κατηγορία με live ενημέρωση' },
      { id: 'bank_import',   label: 'Εισαγωγή CSV',         icon: 'bank',      desc: 'Αναγνώριση ΔΕΗ, ΕΥΔΑΠ, COSMOTE, ΑΑΔΕ από τραπεζικό αρχείο' },
      { id: 'ai_scan',       label: 'Σάρωση Λογαριασμού',  icon: 'camera',    desc: 'Φωτογράφισε λογαριασμό — αυτόματη εξαγωγή δεδομένων με AI' },
      { id: 'multi_property',label: 'Σύγκριση Ακινήτων',   icon: 'buildings', desc: 'Συγκριτικό κόστος πολλαπλών ακινήτων' },
    ],
  },
];

const ALL_TABS: TabDef[] = TAB_GROUPS.flatMap(g => g.tabs);

// ─── Dynamic component loader (safe — δεν κάνει crash αν το αρχείο δεν υπάρχει)
const useDynamicComponent = (name: string) => {
  const [Comp, setComp] = useState<React.ComponentType<Record<string, unknown>> | null | undefined>(undefined);
  useEffect(() => {
    import(`./${name}`)
      .then(m => setComp(() => m.default as React.ComponentType<Record<string, unknown>>))
      .catch(() => setComp(null));
  }, [name]);
  return Comp;
};

const PanelLoading = () => (
  <div style={{ padding: '60px 0', textAlign: 'center', fontFamily: T.font.sans }}>
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
      <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)"
        strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
        <path d={ICONS.spinner}/>
      </svg>
    </div>
    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Φόρτωση...</div>
    <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
  </div>
);

const PanelMissing = ({ name }: { name: string }) => (
  <div style={{ padding: '48px 0', textAlign: 'center', fontFamily: T.font.sans }}>
    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><path d={ICONS.file}/></svg>
    </div>
    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{name}</div>
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
      Μετονόμασε το αρχείο σε{' '}
      <code style={{ background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontFamily: T.font.mono }}>.tsx</code>
    </div>
  </div>
);

function DynamicPanel({ componentName, displayName, props }: {
  componentName: string;
  displayName:   string;
  props:         Record<string, unknown>;
}) {
  const Comp = useDynamicComponent(componentName);
  if (Comp === undefined) return <PanelLoading/>;
  if (Comp === null)      return <PanelMissing name={displayName}/>;
  return <Comp {...props}/>;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TabBills({
  propertyId,
  userId,
  propertyName    = 'Ακίνητό μου',
  propertyAddress = '',
}: Props) {
  const supabase   = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [strip, setStrip] = useState<StripData>({ totalMonthly: 0, overdueCount: 0, tenantName: '', notifCount: 0, lastUpdate: 0 });
  const [realtimeOk, setRealtimeOk] = useState(false);

  // ── Live data load ─────────────────────────────────────────────────────────
  const loadStrip = useCallback(async () => {
    if (!propertyId) return;
    try {
      const now = new Date();
      const [{ data: bills }, { data: contacts }, { data: setts }] = await Promise.all([
        supabase.from('bills').select('amount,paid,due_date,recurring').eq('property_id', propertyId),
        supabase.from('contacts').select('full_name').eq('property_id', propertyId).eq('role', 'tenant').limit(1),
        supabase.from('bills_settings').select('section,data').eq('property_id', propertyId).in('section', ['services','insurance']),
      ]);

      const totalMonthly = (bills ?? []).filter(b => b.recurring).reduce((s, b) => s + (b.amount ?? 0), 0);
      const overdueCount = (bills ?? []).filter(b => !b.paid && b.due_date && new Date(b.due_date) < now).length;

      let notifCount = overdueCount;
      // ΕΝΦΙΑ deadlines
      const ENFIA = ['2026-05-31','2026-06-30','2026-07-31','2026-08-31','2026-09-30','2026-10-30'];
      if (ENFIA.some(d => { const diff = Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000); return diff >= 0 && diff <= 30; })) notifCount++;
      // Insurance renewal
      const ins = (setts ?? []).find(x => x.section === 'insurance')?.data as Record<string, unknown> | undefined;
      if (ins?.insRenewalDate) {
        const diff = Math.ceil((new Date(String(ins.insRenewalDate)).getTime() - now.getTime()) / 86400000);
        if (diff >= 0 && diff <= 60) notifCount++;
      }

      setStrip({ totalMonthly, overdueCount, tenantName: contacts?.[0]?.full_name ?? '', notifCount, lastUpdate: Date.now() });
    } catch (_) {}
  }, [propertyId]);

  // ── Supabase Realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!propertyId) return;
    let mounted = true;
    loadStrip();
    const ch = supabase
      .channel(`tabbills_${propertyId}`)
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'bills', filter: `property_id=eq.${propertyId}` }, () => { if (mounted) loadStrip(); })
      .subscribe(s => { if (mounted) setRealtimeOk(s === 'SUBSCRIBED'); });
    channelRef.current = ch;
    return () => { mounted = false; supabase.removeChannel(ch); channelRef.current = null; };
  }, [propertyId, loadStrip]);

  const navigateTo = useCallback((tab: string) => {
    const found = ALL_TABS.find(t => t.id === tab);
    if (found) setActiveTab(found.id);
  }, []);

  const fe = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

  const timeSince = () => {
    if (!strip.lastUpdate) return '';
    const sec = Math.floor((Date.now() - strip.lastUpdate) / 1000);
    if (sec < 60)  return 'μόλις τώρα';
    if (sec < 120) return '1 λεπτό πριν';
    return `${Math.floor(sec / 60)} λεπτά πριν`;
  };

  const activeTabDef = ALL_TABS.find(t => t.id === activeTab) ?? ALL_TABS[0];

  const newCompProps: Record<string, unknown> = {
    propertyId, userId,
    onNavigateTab:     navigateTo,
    onImported:        () => setActiveTab('dashboard'),
    onSaved:           () => setActiveTab('dashboard'),
    onNavigate:        (_id: string) => {},
    currentPropertyId: propertyId,
  };

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* Pulse animation για live dot */}
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 3, fontFamily: T.font.sans }}>
            Λογαριασμοί & Πάγιες Δαπάνες
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            {activeTabDef.desc}
          </div>
        </div>

        {/* Live strip */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Realtime indicator */}
          <span
            title={realtimeOk ? `Live · Ενημερώθηκε ${timeSince()}` : 'Εκτός σύνδεσης'}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: realtimeOk ? 'var(--positive)' : 'var(--text-tertiary)', cursor: 'default', fontFamily: T.font.sans }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: realtimeOk ? 'var(--positive)' : 'var(--border-default)', display: 'inline-block', animation: realtimeOk ? 'pulse 2s infinite' : 'none' }}/>
            Live
          </span>

          {strip.tenantName && (
            <span style={{ padding: '4px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
              {strip.tenantName}
            </span>
          )}
          {strip.totalMonthly > 0 && (
            <span style={{ padding: '4px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono }}>
              {fe(strip.totalMonthly)} / μήνα
            </span>
          )}
          {strip.overdueCount > 0 && (
            <button onClick={() => setActiveTab('dashboard')}
              style={{ padding: '4px 12px', background: 'rgba(197,34,31,0.08)', border: '1px solid rgba(197,34,31,0.3)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--negative)', cursor: 'pointer', fontFamily: T.font.sans }}>
              {strip.overdueCount} ληξιπρόθεσμα
            </button>
          )}
          {strip.notifCount > 0 && (
            <button onClick={() => setActiveTab('notifications')}
              style={{ padding: '4px 12px', background: 'rgba(242,153,0,0.08)', border: '1px solid rgba(242,153,0,0.3)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--warning)', cursor: 'pointer', fontFamily: T.font.sans }}>
              {strip.notifCount} ειδοποιήσεις
            </button>
          )}
        </div>
      </div>

      {/* ── Tab navigation — 2 rows ───────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
        {TAB_GROUPS.map(group => (
          <div key={group.label}>
            <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, paddingLeft: 2, fontFamily: T.font.sans }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 4 }}>
              {group.tabs.map((tab: TabDef) => {
                const isActive = activeTab === tab.id;
                const hasBadge = tab.id === 'notifications' && strip.notifCount > 0 && !isActive;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: T.radius.inner, border: 'none', cursor: 'pointer', position: 'relative', fontSize: 11, fontWeight: isActive ? 700 : 500, fontFamily: T.font.sans, whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s', background: isActive ? 'var(--accent)' : 'transparent', color: isActive ? '#000' : 'var(--text-secondary)' }}
                    onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                    onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}>
                    <TabIcon name={tab.icon} size={12}/>
                    {tab.label}
                    {hasBadge && (
                      <span style={{ position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: '50%', background: 'var(--warning)', border: '1.5px solid var(--bg-surface)' }}/>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Static tabs ──────────────────────────────────────────────────── */}
      {activeTab === 'dashboard'   && <BillsDashboard   propertyId={propertyId} userId={userId} propertyName={propertyName} propertyAddress={propertyAddress}/>}
      {activeTab === 'electricity' && <BillsElectricity propertyId={propertyId} userId={userId}/>}
      {activeTab === 'common'      && <BillsCommon      propertyId={propertyId} userId={userId}/>}
      {activeTab === 'providers'   && <BillsProviders   propertyId={propertyId} userId={userId}/>}
      {activeTab === 'insurance'   && <BillsInsurance   propertyId={propertyId} userId={userId}/>}
      {activeTab === 'services'    && <BillsServices    propertyId={propertyId} userId={userId}/>}

      {/* ── Dynamic tabs ──────────────────────────────────────────────────── */}
      {activeTab === 'notifications'  && <DynamicPanel componentName="BillsNotifications" displayName="Ειδοποιήσεις"       props={{ propertyId, userId, onNavigateTab: navigateTo }}/>}
      {activeTab === 'budget'         && <DynamicPanel componentName="BillsBudget"        displayName="Προϋπολογισμός"      props={{ propertyId, userId }}/>}
      {activeTab === 'bank_import'    && <DynamicPanel componentName="BillsBankImport"    displayName="Εισαγωγή CSV"        props={{ propertyId, userId, onImported: () => setActiveTab('dashboard') }}/>}
      {activeTab === 'ai_scan'        && <DynamicPanel componentName="BillsAIScan"        displayName="Σάρωση Λογαριασμού" props={{ propertyId, userId, onSaved: () => setActiveTab('dashboard') }}/>}
      {activeTab === 'multi_property' && <DynamicPanel componentName="BillsMultiProperty" displayName="Σύγκριση Ακινήτων"  props={{ userId, currentPropertyId: propertyId, onNavigate: (_id: string) => {} }}/>}
    </div>
  );
}