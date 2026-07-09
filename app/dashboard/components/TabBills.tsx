'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe } from '@/components/Theme';

// ── Static imports, all components must be static for Next.js App Router ────
import BillsDashboard    from './BillsDashboard';
import BillsElectricity  from './BillsElectricity';
import BillsGas          from './BillsGas';
import BillsCommon       from './BillsCommon';
import BillsProviders    from './BillsProviders';
import BillsInsurance    from './BillsInsurance';
import BillsServices     from './BillsServices';
import BillsNotifications from './BillsNotification';
import BillsBudget       from './BillsBudget';
import BillsBankImport   from './BillsBankImport';
import BillsAIScan       from './BillsAIScan';
import BillsMultiProperty from './BillsMultiProperty';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  propertyId:       string;
  userId:           string;
  propertyName?:    string;
  propertyAddress?: string;
}

type TabId =
  | 'dashboard' | 'electricity' | 'gas' | 'common' | 'providers' | 'insurance' | 'services'
  | 'notifications' | 'budget' | 'bank_import' | 'ai_scan' | 'multi_property';

interface TabDef {
  id:    TabId;
  label: string;
  icon:  string;
  desc:  string;
}
interface TabGroup { label: string; tabs: TabDef[]; }

interface StripData {
  totalMonthly: number;
  overdueCount: number;
  tenantName:   string;
  notifCount:   number;
  lastUpdate:   number;
}

// ─── SVG icons ────────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  dashboard:  'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5zM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4zm10-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6z',
  bolt:       'M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z',
  flame:      'M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-1.5-.5-2.5-1.5-4 .5 2-.5 3-1.5 2.5.5-2-.5-4-2-5.5z M12 13a2 2 0 1 1-2-2c.5 0 1 .5 1 1.5 0 1-.5.5-.5 1.5a1.5 1.5 0 0 0 1.5 1.5z',
  building:   'M3 21h18M5 21V7l8-4 8 4v14M9 21V15h6v6M9 11h1m4 0h1M9 7h1m4 0h1',
  wifi:       'M12 18h.01M8.5 14.5A5.5 5.5 0 0 1 12 13a5.5 5.5 0 0 1 3.5 1.5M5 11a9 9 0 0 1 14 0M1.5 7.5a14 14 0 0 1 21 0',
  shield:     'M12 3l8 4v5c0 5-3.5 9.7-8 11-4.5-1.3-8-6-8-11V7l8-4z',
  wrench:     'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
  bell:       'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  chart:      'M18 20V10M12 20V4M6 20v-6',
  bank:       'M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3',
  camera:     'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  buildings:  'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20M10 10h4M10 14h4M10 18h4M10 6h4',
};

const TabIcon = ({ name, size = 13 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={ICONS[name] ?? ICONS.dashboard}/>
  </svg>
);

// ─── Tab definitions ──────────────────────────────────────────────────────────
const TAB_GROUPS: TabGroup[] = [
  {
    label: 'Λογαριασμοί',
    tabs: [
      { id: 'dashboard',     label: 'Επισκόπηση',          icon: 'dashboard', desc: 'Σύνοψη, ανάλυση, γραφήματα, ημερολόγιο πληρωμών' },
      { id: 'electricity',   label: 'Ρεύμα',                icon: 'bolt',      desc: 'Πάροχος, κατανάλωση kWh, τιμολόγιο, σύγκριση παρόχων' },
      { id: 'gas',           label: 'Φυσικό Αέριο',         icon: 'flame',     desc: 'Πάροχος αερίου, διαχειριστής δικτύου, σύγκριση τιμολογίων' },
      { id: 'common',        label: 'Κοινόχρηστα',          icon: 'building',  desc: 'Διαχείριση κτηρίου, ταμείο, ιστορικό' },
      { id: 'providers',     label: 'Πάροχοι',              icon: 'wifi',      desc: 'Internet, Νερό, Θέρμανση, Φυσικό Αέριο, Security' },
      { id: 'insurance',     label: 'Ασφάλεια & Συνδρομές', icon: 'shield',    desc: 'Ασφάλεια κατοικίας, streaming, cloud, live σύγκριση' },
      { id: 'services',      label: 'Υπηρεσίες',            icon: 'wrench',    desc: 'ΕΝΦΙΑ, Δημοτικά Τέλη, καθαρισμός, κηπουρός, πισίνα' },
    ],
  },
  {
    label: 'Εργαλεία',
    tabs: [
      { id: 'notifications', label: 'Ειδοποιήσεις',        icon: 'bell',      desc: 'Έξυπνες ειδοποιήσεις βάσει δεδομένων: ΕΝΦΙΑ, λήξεις, προϋπολογισμός' },
      { id: 'bank_import',   label: 'Εισαγωγή',             icon: 'bank',      desc: 'Αναγνώριση ΔΕΗ, ΕΥΔΑΠ, COSMOTE, ΑΑΔΕ από τραπεζικό αρχείο' },
      { id: 'ai_scan',       label: 'Σάρωση Λογαριασμού',  icon: 'camera',    desc: 'Φωτογράφισε λογαριασμό, αυτόματη εξαγωγή δεδομένων με AI' },
      { id: 'multi_property',label: 'Σύγκριση Ακινήτων',   icon: 'buildings', desc: 'Συγκριτικό κόστος πολλαπλών ακινήτων' },
    ],
  },
];

const ALL_TABS: TabDef[] = TAB_GROUPS.flatMap(g => g.tabs);

// ─── Main component ───────────────────────────────────────────────────────────
export default function TabBills({
  propertyId, userId, propertyName = 'Ακίνητό μου', propertyAddress = '',
}: Props) {
  const supabase   = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const [activeTab,  setActiveTab]  = useState<TabId>('dashboard');
  const [strip,      setStrip]      = useState<StripData>({ totalMonthly: 0, overdueCount: 0, tenantName: '', notifCount: 0, lastUpdate: 0 });
  const [liveNotifCount, setLiveNotifCount] = useState(0);
  const [realtimeOk, setRealtimeOk] = useState(false);

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

      setStrip({ totalMonthly, overdueCount, tenantName: contacts?.[0]?.full_name ?? '', notifCount: 0, lastUpdate: Date.now() });
    } catch (_) {}
  }, [propertyId]);

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

  const timeSince = () => {
    if (!strip.lastUpdate) return '';
    const sec = Math.floor((Date.now() - strip.lastUpdate) / 1000);
    if (sec < 60) return 'μόλις τώρα';
    if (sec < 120) return '1 λεπτό πριν';
    return `${Math.floor(sec / 60)} λεπτά πριν`;
  };

  const activeTabDef = ALL_TABS.find(t => t.id === activeTab) ?? ALL_TABS[0];

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>

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
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span title={realtimeOk ? `Live · ${timeSince()}` : 'Εκτός σύνδεσης'}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: realtimeOk ? 'var(--positive)' : 'var(--text-tertiary)', cursor: 'default', fontFamily: T.font.sans }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: realtimeOk ? 'var(--positive)' : 'var(--border-default)', display: 'inline-block', animation: realtimeOk ? 'pulse 2s infinite' : 'none' }}/>
            Live
          </span>
          {strip.tenantName && <span style={{ padding: '4px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{strip.tenantName}</span>}
          {strip.totalMonthly > 0 && <span style={{ padding: '4px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(strip.totalMonthly, 0)} / μήνα</span>}
          {strip.overdueCount > 0 && (
            <button onClick={() => setActiveTab('dashboard')}
              style={{ padding: '4px 12px', background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--negative)', cursor: 'pointer', fontFamily: T.font.sans }}>
              {strip.overdueCount} ληξιπρόθεσμα
            </button>
          )}
          {liveNotifCount > 0 && (
            <button onClick={() => setActiveTab('notifications')}
              style={{ padding: '4px 12px', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--warning)', cursor: 'pointer', fontFamily: T.font.sans }}>
              {liveNotifCount} {liveNotifCount === 1 ? 'ειδοποίηση' : 'ειδοποιήσεις'}
            </button>
          )}
        </div>
      </div>

      {/* ── Tab navigation, unified single container ──────────────────── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '6px 6px 6px 6px', marginBottom: 20 }}>
        {TAB_GROUPS.map((group, gIdx) => (
          <div key={group.label} style={{ marginBottom: gIdx < TAB_GROUPS.length - 1 ? 4 : 0 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3, paddingLeft: 4, paddingTop: gIdx === 0 ? 0 : 2, fontFamily: T.font.sans }}>
              {group.label}
            </div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {group.tabs.map((tab: TabDef) => {
                const isActive = activeTab === tab.id;
                const hasBadge = tab.id === 'notifications' && liveNotifCount > 0 && !isActive;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: T.radius.inner, border: 'none', cursor: 'pointer', position: 'relative', fontSize: 11, fontWeight: isActive ? 700 : 500, fontFamily: T.font.sans, whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s', background: isActive ? 'var(--accent)' : 'transparent', color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)' }}
                    onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                    onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}>
                    <TabIcon name={tab.icon} size={12}/>
                    {tab.label}
                    {hasBadge && <span style={{ position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: '50%', background: 'var(--warning)', border: '1.5px solid var(--bg-surface)' }}/>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      {activeTab === 'dashboard'      && <BillsDashboard    propertyId={propertyId} userId={userId} propertyName={propertyName} propertyAddress={propertyAddress}/>}
      {activeTab === 'electricity'    && <BillsElectricity  propertyId={propertyId} userId={userId} onNavigateTab={navigateTo}/>}
      {activeTab === 'gas'            && <BillsGas          propertyId={propertyId} userId={userId} onNavigateTab={navigateTo}/>}
      {activeTab === 'common'         && <BillsCommon       propertyId={propertyId} userId={userId}/>}
      {activeTab === 'providers'      && <BillsProviders    propertyId={propertyId} userId={userId}/>}
      {activeTab === 'insurance'      && <BillsInsurance    propertyId={propertyId} userId={userId}/>}
      {activeTab === 'services'       && <BillsServices     propertyId={propertyId} userId={userId}/>}
      {activeTab === 'notifications'  && <BillsNotifications propertyId={propertyId} userId={userId} onNavigateTab={navigateTo} onCountChange={setLiveNotifCount}/>}
      {activeTab === 'budget'         && <BillsBudget       propertyId={propertyId} userId={userId}/>}
      {activeTab === 'bank_import'    && <BillsBankImport   propertyId={propertyId} userId={userId} onImported={() => setActiveTab('dashboard')}/>}
      {activeTab === 'ai_scan'        && <BillsAIScan       propertyId={propertyId} userId={userId} onSaved={() => setActiveTab('dashboard')}/>}
      {activeTab === 'multi_property' && <BillsMultiProperty userId={userId} currentPropertyId={propertyId} onNavigate={(_id: string) => {}}/>}
    </div>
  );
}