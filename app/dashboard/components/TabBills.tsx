'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import BillsDashboard from './BillsDashboard';
import BillsElectricity from './BillsElectricity';
import BillsCommon from './BillsCommon';
import BillsProviders from './BillsProviders';
import BillsInsurance from './BillsInsurance';
import BillsServices from './BillsServices';

interface Props {
  propertyId: string;
  userId: string;
  propertyName?: string;
  propertyAddress?: string;
}

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font: { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};

const TabIconPath: Record<string, string> = {
  dashboard:   'M4 5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5zm10 0a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5zM4 15a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4zm10-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-6z',
  bolt:        'M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z',
  building:    'M3 21h18M5 21V7l8-4 8 4v14M9 21V15h6v6M9 11h1m4 0h1M9 7h1m4 0h1',
  wifi:        'M12 18h.01M8.5 14.5A5.5 5.5 0 0 1 12 13a5.5 5.5 0 0 1 3.5 1.5M5 11a9 9 0 0 1 14 0M1.5 7.5a14 14 0 0 1 21 0',
  shield:      'M12 3l8 4v5c0 5-3.5 9.7-8 11-4.5-1.3-8-6-8-11V7l8-4z',
  wrench:      'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
};

const TabIcon = ({ name, size = 14 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={TabIconPath[name] || TabIconPath.dashboard}/>
  </svg>
);

const TABS = [
  { id: 'dashboard',   label: 'Επισκόπηση',          icon: 'dashboard', desc: 'Σύνοψη, ανάλυση, γραφήματα, ημερολόγιο πληρωμών, σύγκριση αγοράς' },
  { id: 'electricity', label: 'Ρεύμα',                icon: 'bolt',      desc: 'Πάροχος, kWh, τιμολόγιο, σύγκριση παρόχων, Virtual Net Metering, ανάλυση λογαριασμού' },
  { id: 'common',      label: 'Κοινόχρηστα',          icon: 'building',  desc: 'Διαχείριση κτηρίου, ταμείο, ιστορικό, έκτακτες εισφορές' },
  { id: 'providers',   label: 'Πάροχοι',              icon: 'wifi',      desc: 'Internet, Νερό, Θέρμανση, Αέριο, Security — με επίσημες πηγές και συγκρίσεις' },
  { id: 'insurance',   label: 'Ασφάλεια & Συνδρομές', icon: 'shield',    desc: 'Ασφάλεια κατοικίας, streaming, cloud, πάγιες συνδρομές — με συγκρίσεις ασφαλιστικών' },
  { id: 'services',    label: 'Υπηρεσίες',            icon: 'wrench',    desc: 'ΕΝΦΙΑ, Δημοτικά, καθαρισμός, κηπουρός, πισίνα, κλιματιστικά, απεντόμωση' },
] as const;

export default function TabBills({ propertyId, userId, propertyName = 'Ακίνητό μου', propertyAddress = '' }: Props) {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('dashboard');
  const [crossTabData, setCrossTabData] = useState<{totalMonthly:number; overdueCount:number; tenantName?:string}>({ totalMonthly:0, overdueCount:0 });
  const supabase = createClient();

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        const [{ data: bills }, { data: tenant }] = await Promise.all([
          supabase.from('bills').select('amount,paid,due_date,recurring').eq('property_id', propertyId),
          supabase.from('contacts').select('full_name').eq('property_id', propertyId).eq('role', 'tenant').limit(1),
        ]);
        const totalMonthly = (bills||[]).filter(b=>b.recurring).reduce((s:number,b:any)=>s+b.amount,0);
        const overdueCount = (bills||[]).filter((b:any)=>!b.paid&&b.due_date&&new Date(b.due_date)<new Date()).length;
        setCrossTabData({ totalMonthly, overdueCount, tenantName: tenant?.[0]?.full_name });
      } catch(_) {}
    })();
  }, [propertyId]);

  const active = TABS.find(t => t.id === activeTab)!;
  const fe = (n: number) => n.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* Header with cross-tab summary */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4, fontFamily: T.font.sans }}>
            Λογαριασμοί & Πάγιες Δαπάνες
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            Πλήρης καταγραφή, ανάλυση και παρακολούθηση όλων των σταθερών εξόδων
          </div>
        </div>
        {/* Cross-tab live strip */}
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
          {crossTabData.tenantName && (
            <div style={{ padding:'4px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:20, fontSize:11, color:'var(--text-secondary)', fontFamily:T.font.sans }}>
              {crossTabData.tenantName}
            </div>
          )}
          {crossTabData.totalMonthly > 0 && (
            <div style={{ padding:'4px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:20, fontSize:11, fontWeight:700, color:'var(--text-primary)', fontFamily:T.font.mono }}>
              {fe(crossTabData.totalMonthly)}/μήνα
            </div>
          )}
          {crossTabData.overdueCount > 0 && (
            <div style={{ padding:'4px 12px', background:'rgba(197,34,31,0.08)', border:'1px solid rgba(197,34,31,0.25)', borderRadius:20, fontSize:11, fontWeight:700, color:'var(--negative)', fontFamily:T.font.sans }}>
              {crossTabData.overdueCount} ληξιπρόθεσμα
            </div>
          )}
        </div>
      </div>

      {/* Tab navigation — Google MD3 pill style */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 4, flexWrap: 'wrap', background: 'var(--bg-surface)', borderRadius: 14, padding: 5, border: '1px solid var(--border-subtle)' }}>
        {TABS.map(t => {
          const isActive = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 13px', borderRadius:10, border:'none', cursor:'pointer', fontSize:12, fontWeight:isActive?700:500, fontFamily:T.font.sans, whiteSpace:'nowrap', transition:'all 0.18s', background:isActive?'var(--accent)':'transparent', color:isActive?'#000':'var(--text-secondary)' }}
              onMouseEnter={e=>{if(!isActive){e.currentTarget.style.background='var(--bg-elevated)';e.currentTarget.style.color='var(--text-primary)';}}}
              onMouseLeave={e=>{if(!isActive){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-secondary)';}}}
            >
              <TabIcon name={t.icon} size={13}/>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Active tab description */}
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 18, paddingLeft: 4, minHeight: 16, fontFamily: T.font.sans }}>
        {active.desc}
      </div>

      {/* Content */}
      {activeTab === 'dashboard'   && <BillsDashboard  propertyId={propertyId} userId={userId} propertyName={propertyName} propertyAddress={propertyAddress} />}
      {activeTab === 'electricity' && <BillsElectricity propertyId={propertyId} userId={userId} />}
      {activeTab === 'common'      && <BillsCommon      propertyId={propertyId} userId={userId} />}
      {activeTab === 'providers'   && <BillsProviders   propertyId={propertyId} userId={userId} />}
      {activeTab === 'insurance'   && <BillsInsurance   propertyId={propertyId} userId={userId} />}
      {activeTab === 'services'    && <BillsServices    propertyId={propertyId} userId={userId} />}
    </div>
  );
}