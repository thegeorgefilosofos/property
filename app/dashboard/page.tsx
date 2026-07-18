'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ThemeToggle } from './components/ThemeToggle';
import TabFinances  from './components/TabFinances';
import TabCalendar  from './components/TabCalendar';
import TabRentROI   from './components/TabRentROI';
import TabPricing   from './components/TabPricing';
import TabSettings  from './components/TabSettings';
import TabReferral  from './components/TabReferral';
import TabTenant    from './components/TabTenant';
import TabLoan      from './components/TabLoan';
import TabAccounting from './components/TabAccounting';
import TabInventory from './components/TabInventory';
import TabContacts  from './components/TabContacts';
import TabChecklist from './components/TabChecklist';
import TabDocuments from './components/TabDocuments';
import TabComparison from './components/TabComparison';
import TabClients from './components/TabClients';
import PortfolioTab from './components/PortfolioTab';
import AddPropertyWizard from './components/AddPropertyWizard';
import DocumentScan from './components/DocumentScan';
import WelcomeOnboarding from './components/WelcomeOnboarding';
import { useAppPreferences } from './components/useAppPreferences';
import { CommandPalette, type CommandItem } from './components/CommandPalette';
import { SkeletonKPIs, Skeleton, TierBadge } from '@/components/Theme';
import AIInsights from './components/AIInsights';
import PropertyAssistant from './components/PropertyAssistant';
import { resolveRent, resolveValue, computeYields, propertyDetailsComplete } from '@/lib/billing/propertyFacts';
import PaymentLinks from './components/PaymentLinks';
import { printPropertyStatement } from './components/statement';
import { useReportBranding } from '@/lib/reportBranding';
import InsightsBoard from './components/InsightsBoard';
import { computeInsights } from '@/lib/insights/engine';
import { annuityMonthly } from '@/lib/loans/recommend';
import { stayTotal } from '@/lib/clients/clients';
import { clearHistory as clearAssistantHistory } from './components/assistantPersona';
import { rentalIncomeTax } from '@/lib/billing/greekTax';
import UpgradeModal from './components/UpgradeModal';
import { canAddProperty } from '@/lib/billing/plans';
import OnboardingChecklist, { type SetupStep } from './components/OnboardingChecklist';
import ObligationsPanel from './components/ObligationsPanel';
import PortalShare from './components/PortalShare';
import OccupancyPanel from './components/OccupancyPanel';

interface Property {
  id: string; user_id: string; name: string; prop_type: string | null;
  address: string | null; postal_code: string | null; sqm: number | null; ownership: string | null;
  value: number | null; obj_value: number | null; purchase_price: number | null;
  purchase_date: string | null; target_rent: number | null; enfia: number | null;
  insurance_amount: number | null; insurance_company: string | null;
  insurance_expiry: string | null; pea_class: string | null; year_built: number | null;
  atak: string | null; floor: number | string | null; heating: string | null;
  parking_spaces: number | null; storage_sqm: number | null; bedrooms: number | null;
  rental_mode: string | null; client_id: string | null;
  notes: string | null; status_detail: string | null; created_at: string;
}
interface Expense  { id:string; amount:number; date:string; category:string; description:string; }
interface Bill     { id:string; type:string; amount:number; avg_amount:number|null; paid:boolean; }
interface Task     { id:string; title:string; due_date:string|null; priority:string; completed:boolean; }
interface Tenant   { monthly_rent:number|null; lease_end:string|null; }

const STATUS_COLORS: Record<string,string> = {
  rented:'var(--accent)', vacant:'var(--warning)', own_use:'var(--accent)',
  renovation:'var(--accent)', for_sale:'var(--accent)', seasonal:'var(--accent)', disputed:'var(--negative)',
};
const STATUS_LABELS: Record<string,string> = {
  rented:'Ενοικιάζεται', vacant:'Κενό', own_use:'Ιδιοχρησία',
  renovation:'Ανακαίνιση', for_sale:'Προς Πώληση', seasonal:'Εποχιακό', disputed:'Αμφισβητούμενο',
};
const PROP_TYPE_LABELS: Record<string,string> = {
  apartment:'Διαμέρισμα', house:'Μονοκατοικία', studio:'Στούντιο',
  maisonette:'Μεζονέτα', office:'Γραφείο', shop:'Κατάστημα',
  warehouse:'Αποθήκη', land:'Οικόπεδο', parking:'Parking',
  storage:'Αποθήκη Κτιρίου', villa:'Βίλα', other:'Άλλο',
};
const PROP_TYPES = ['apartment','house','studio','maisonette','office','shop','warehouse','land','parking','storage','villa','other'];
const FLOOR_OPTS = ['Υπόγειο','Ημιυπόγειο','Ισόγειο','Υπερυψωμένο ισόγειο','Ημιώροφος','1ος','2ος','3ος','4ος','5ος','6ος','7ος και άνω','Δώμα / Ρετιρέ'];

const HEATING_LABELS: Record<string,string> = {
  central_gas:'Κεντρική (αέριο)', autonomous_gas:'Αυτόνομη (αέριο)', oil:'Πετρέλαιο',
  heat_pump:'Αντλία θερμότητας', electric:'Ηλεκτρική', pellet:'Pellet / Ξύλο',
  ac_only:'Κλιματιστικά', none:'Χωρίς θέρμανση', other:'Άλλο',
};

const NAV_ITEMS = [
  { id:'portfolio',  label:'Χαρτοφυλάκιο' },
  { id:'overview',   label:'Επισκόπηση' },
  { id:'calendar',   label:'Ημερολόγιο' },
  { id:'finances',   label:'Δαπάνες' },
  { id:'accounting', label:'Λογιστική' },
  { id:'loan',       label:'Δάνειο' },
  { id:'tenant',     label:'Ενοικιαστής' },
  { id:'clients',    label:'Πελάτης' },
  { id:'pricing',    label:'Τιμολόγηση' },
  { id:'inventory',  label:'Έπιπλα / Εξοπλισμός' },
  { id:'documents',  label:'Αρχείο' },
  { id:'checklist',  label:'Εκκρεμότητες' },
  { id:'contacts',   label:'Επαφές' },
  { id:'roi',        label:'Αποδόσεις' },
  { id:'comparison', label:'Σύγκριση ακινήτων' },
  { id:'referral',   label:'Πρόγραμμα Πρόσκλησης' },
  { id:'settings',   label:'Ρυθμίσεις' },
];
const NAV_LABEL: Record<string,string> = NAV_ITEMS.reduce((a,i)=>{a[i.id]=i.label;return a;},{} as Record<string,string>);

// Εικονίδια πλοήγησης, καθαρή, γρήγορη οπτική αναγνώριση (ακόμη κι από άπειρο μάτι).
const NAV_ICON: Record<string,string> = {
  portfolio: 'M4 5h6v6H4z|M14 5h6v6h-6z|M4 15h6v4H4z|M14 13h6v6h-6z',
  overview:  'M3 9.5 12 3l9 6.5|M5 10v10h14V10',
  comparison:'M4 20V10|M10 20V4|M16 20v-7|M20 20H2',
  bills:     'M5 3h14v18l-3-2-2 2-2-2-2 2-3-2V3|M9 8h6|M9 12h6',
  expenses:  'M3 12h4l3 8 4-16 3 8h4',
  finances:  'M3 12h4l3 8 4-16 3 8h4',
  accounting:'M4 3h16v18H4z|M8 7h8|M8 11h8|M8 15h5|M16 19l1.5 1.5L21 17',
  calendar:  'M3 5h18v16H3z|M3 9h18|M8 3v4|M16 3v4',
  tenant:    'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  roi:       'M3 17l6-6 4 4 8-8|M21 7v6h-6',
  pricing:   'M20 12V7H4v10h10|M4 11h16|M16 19l2 2 4-4',
  loan:      'M3 21h18|M5 21V10l7-5 7 5v11|M9 21v-6h6v6',
  inventory: 'M21 16V8l-9-5-9 5v8l9 5 9-5z|M3.3 7 12 12l8.7-5|M12 22V12',
  checklist: 'M9 11l3 3L22 4|M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  contacts:  'M4 4h16v16H4z|M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z|M6 16c0-2 4-2 4-2s4 0 4 2|M15 8h3|M15 12h3',
  documents: 'M4 4h6l2 3h8v13H4z',
  clients:   'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 11a4 4 0 0 0 0-8 4 4 0 0 0 0 8z|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
  settings:  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z|M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 2h-5l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L3 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2.4h5l.3-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z',
  referral:  'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M19 8v6|M22 11h-6',
};

// Ομαδοποιημένη πλοήγηση, λιγότερο «σουπερμάρκετ», πιο ξεκάθαρη λογική.
// Επαφές/Αρχείο/Εκκρεμότητες/Απογραφή ενσωματώθηκαν στην Επισκόπηση. Η Σύγκριση
// και οι Ρυθμίσεις μένουν αυτόνομες. Καμία ομάδα «Το ακίνητο»/«Σύστημα».
// Δομή πλοήγησης (ίδια για ιδιώτη/επαγγελματία· αλλάζει μόνο η κεφαλίδα «Ακίνητά
// μου» / «Χαρτοφυλάκιό μου» και το πότε ενεργοποιείται η «Σύγκριση ακινήτων»).
const NAV_GROUPS: { label: string; ids: string[] }[] = [
  { label: '',                    ids: ['calendar'] },
  { label: 'Οικονομικά',          ids: ['finances','accounting','loan'] },
  { label: 'Μίσθωση',             ids: ['tenant','clients','pricing'] },
  { label: 'Εργαλεία',            ids: ['inventory','documents','checklist','contacts'] },
  { label: 'Συγκριτική Ανάλυση',  ids: ['roi','comparison'] },
  { label: '',                    ids: ['referral'] },
  { label: '',                    ids: ['settings'] },
];

// Κάτω μπάρα κινητού, 5 βασικοί προορισμοί (το «more» ανοίγει το πλήρες μενού)
const ic = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d.split('|').map((p,i)=><path key={i} d={p}/>)}</svg>;
const BOTTOM_NAV = [
  { id:'overview', label:'Επισκόπηση', icon: ic('M3 9.5 12 3l9 6.5|M5 10v10h14V10') },
  { id:'bills',    label:'Λογαριασμοί', icon: ic('M4 3h16v18l-3-2-3 2-3-2-3 2V3|M8 8h8|M8 12h8') },
  { id:'expenses', label:'Δαπάνες',    icon: ic('M3 12h4l3 8 4-16 3 8h4') },
  { id:'calendar', label:'Ημερολόγιο', icon: ic('M3 5h18v16H3z|M3 9h18|M8 3v4|M16 3v4') },
  { id:'more',     label:'Μενού',      icon: ic('M4 6h16|M4 12h16|M4 18h16') },
];

const fmt = (n:number|null|undefined, decimals=0) =>
  n == null ? '—' : n.toLocaleString('el-GR', { minimumFractionDigits:decimals, maximumFractionDigits:decimals });
const fmtEur = (n:number|null|undefined) => n == null ? '—' : `${fmt(n)} €`;

// MD3 form styles
const mdInput: React.CSSProperties = {
  width:'100%', padding:'10px 16px', height:40, borderRadius:4,
  border:'1px solid var(--border-default)', background:'var(--bg-surface)',
  color:'var(--text-primary)', fontSize:14, fontFamily:"'Inter',sans-serif",
  letterSpacing:'0.25px', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s',
};
const mdLabel: React.CSSProperties = {
  display:'block', fontFamily:"'Inter',sans-serif", fontSize:12, fontWeight:500,
  letterSpacing:'0.5px', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom:6,
};
const focusInput = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => {
  e.target.style.borderColor = 'var(--accent)'; e.target.style.borderWidth = '2px'; e.target.style.padding = '9px 15px';
};
const blurInput = (e: React.FocusEvent<HTMLInputElement|HTMLSelectElement>) => {
  e.target.style.borderColor = 'var(--border-default)'; e.target.style.borderWidth = '1px'; e.target.style.padding = '10px 16px';
};

// Alert hooks
function useInventoryAlerts(propertyId: string | null, userId: string | null) {
  const [alertCount, setAlertCount] = useState(0);
  const supabase = createClient();
  useEffect(() => {
    if (!propertyId || !userId) return;
    const check = async () => {
      const { data: items } = await supabase.from('inventory_items').select('warranty_expiry, condition, purchase_date').eq('property_id', propertyId);
      const { data: schedules } = await supabase.from('inventory_maintenance').select('next_due').eq('property_id', propertyId);
      if (!items) return;
      let count = 0; const now = Date.now();
      items.forEach(item => {
        if (item.condition === 'Κακή' || item.condition === 'Εκτός Λειτουργίας') count++;
        if (item.warranty_expiry) { const days = Math.ceil((new Date(item.warranty_expiry).getTime() - now) / 86400000); if (days >= 0 && days <= 90) count++; }
        if (item.purchase_date) { const years = (now - new Date(item.purchase_date).getTime()) / (1000*60*60*24*365); if (years >= 10) count++; }
      });
      (schedules||[]).forEach(s => { const days = Math.ceil((new Date(s.next_due).getTime() - now) / 86400000); if (days < 0) count++; });
      setAlertCount(count);
    };
    check();
  }, [propertyId]);
  return alertCount;
}

function useChecklistAlerts(propertyId: string | null) {
  const [alertCount, setAlertCount] = useState(0);
  const supabase = createClient();
  useEffect(() => {
    if (!propertyId) return;
    const check = async () => {
      const { data } = await supabase.from('checklist_items').select('due_date, status, priority').eq('property_id', propertyId).neq('status', 'done').neq('status', 'skipped');
      if (!data) return;
      const now = new Date(); let count = 0;
      data.forEach(item => {
        if (item.due_date && new Date(item.due_date) < now) count++;
        else if (item.priority === 'critical' && item.status === 'pending') count++;
      });
      setAlertCount(count);
    };
    check();
  }, [propertyId]);
  return alertCount;
}

// Copy Inventory Modal
function CopyInventoryModal({properties, currentPropertyId, userId, onClose, onCopied}: {
  properties: Property[]; currentPropertyId: string; userId: string; onClose: ()=>void; onCopied: ()=>void;
}) {
  const supabase = createClient();
  const [sourceId, setSourceId] = useState('');
  const [copying, setCopying] = useState(false);
  const [preview, setPreview] = useState<{name:string;category:string}[]>([]);
  const otherProperties = properties.filter(p => p.id !== currentPropertyId);
  useEffect(() => {
    if (!sourceId) { setPreview([]); return; }
    supabase.from('inventory_items').select('name,category').eq('property_id', sourceId).limit(5).then(({data})=>setPreview(data||[]));
  }, [sourceId]);
  const handleCopy = async () => {
    if (!sourceId) return; setCopying(true);
    const { data: sourceItems } = await supabase.from('inventory_items').select('*').eq('property_id', sourceId);
    if (sourceItems?.length) {
      const newItems = sourceItems.map(item => ({ ...item, id: undefined, property_id: currentPropertyId, user_id: userId, created_at: undefined, updated_at: undefined }));
      await supabase.from('inventory_items').insert(newItems);
    }
    setCopying(false); onCopied();
  };
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.32)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--bg-surface)',borderRadius:28,padding:24,width:'100%',maxWidth:480,display:'flex',flexDirection:'column',gap:16,boxShadow:'var(--shadow-xl)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <p style={{fontFamily:"'Inter',sans-serif",fontSize:22,fontWeight:400,color:'var(--text-primary)',marginBottom:4}}>Αντιγραφή Απογραφής</p>
            <p style={{fontFamily:"'Inter',sans-serif",fontSize:14,color:'var(--text-secondary)',letterSpacing:'0.25px'}}>Χρησιμοποίησε απογραφή άλλου ακινήτου ως βάση</p>
          </div>
          <button onClick={onClose} style={{width:40,height:40,borderRadius:20,border:'none',background:'transparent',cursor:'pointer',color:'var(--text-secondary)',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
        {otherProperties.length === 0 ? (
          <div style={{padding:'32px',textAlign:'center',color:'var(--text-secondary)'}}>
            <p style={{fontSize:32,marginBottom:12}}></p>
            <p style={{fontFamily:"'Inter',sans-serif",fontSize:14}}>Δεν υπάρχουν άλλα ακίνητα</p>
          </div>
        ) : (
          <>
            <div>
              <p style={mdLabel}>Πηγή Απογραφής</p>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {otherProperties.map(p => (
                  <div key={p.id} onClick={()=>setSourceId(p.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',borderRadius:12,border:`1px solid ${sourceId===p.id?'var(--accent)':'var(--border-default)'}`,background:sourceId===p.id?'var(--accent-dim)':'transparent',cursor:'pointer',transition:'all 0.2s'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:STATUS_COLORS[p.status_detail||'']||'var(--text-tertiary)',flexShrink:0}}/>
                    <div>
                      <p style={{fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:500,color:'var(--text-primary)'}}>{p.name}</p>
                      <p style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-secondary)'}}>{PROP_TYPE_LABELS[p.prop_type||'']||p.prop_type}{p.address?` · ${p.address}`:''}</p>
                    </div>
                    {sourceId===p.id&&<span style={{marginLeft:'auto',display:'inline-flex',color:'var(--accent)'}}><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>}
                  </div>
                ))}
              </div>
            </div>
            {preview.length > 0 && (
              <div style={{padding:'12px 16px',background:'var(--bg-elevated)',borderRadius:12}}>
                <p style={{...mdLabel,marginBottom:8}}>Προεπισκόπηση ({preview.length}+ αντικείμενα)</p>
                {preview.map((item,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',fontFamily:"'Inter',sans-serif",fontSize:13,color:'var(--text-secondary)',marginBottom:4}}><span>{item.name}</span><span style={{color:'var(--text-tertiary)'}}>{item.category}</span></div>)}
              </div>
            )}
            <div style={{padding:'12px 16px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:12}}>
              <p style={{fontFamily:"'Inter',sans-serif",fontSize:13,color:'var(--text-secondary)'}}>Τα αντικείμενα θα αντιγραφούν χωρίς ιστορικά επισκευών.</p>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={onClose} style={{height:40,padding:'0 24px',borderRadius:20,border:'none',background:'transparent',color:'var(--accent)',fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:500,cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='var(--accent-dim)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Ακύρωση</button>
              <button onClick={handleCopy} disabled={!sourceId||copying} style={{height:40,padding:'0 24px',borderRadius:20,border:'none',background:!sourceId||copying?'var(--bg-overlay)':'var(--accent)',color:!sourceId||copying?'var(--text-tertiary)':'var(--accent-text)',fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:500,cursor:!sourceId||copying?'not-allowed':'pointer'}}>{copying?'Αντιγραφή...':'Αντιγραφή'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Overview Tab
function OverviewTab({ prop, userId, ownerName, onSaveOwnerName, onNavigate, onCleanDemo, profileType }: { prop: Property; userId: string; ownerName?: string; onSaveOwnerName?: (n: string) => void | Promise<void>; onNavigate: (tab: string) => void; onCleanDemo?: () => void; profileType: 'individual'|'professional' }) {
  const isDemo = (prop.name || '').startsWith('Demo —');
  const supabase = createClient();
  const branding = useReportBranding(userId);
  const { prefs } = useAppPreferences(prop.id);
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
  const [selMonth, setSelMonth] = useState(now.getMonth()); // 0-indexed, επιλεγμένος μήνας στο γράφημα δαπανών
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<{ amount:number; date:string; category:string; is_recurring?:boolean; recurring_frequency?:string|null }[]>([]);
  const [chartYear, setChartYear] = useState(now.getFullYear()); // έτος γραφήματος δαπανών (προηγ./επόμενο)
  const [yearMenu, setYearMenu] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [chk, setChk] = useState<{ due_date:string|null; status:string; priority:string }[]>([]);
  const [inv, setInv] = useState<{ name?:string|null; warranty_expiry:string|null; condition:string|null }[]>([]);
  const [loans, setLoans] = useState<{ amount:number; rate:number; years:number }[]>([]);
  const [hostStays, setHostStays] = useState<{ check_in:string|null; check_out:string|null; total:number|null; nights:number|null; nightly_rate:number|null }[]>([]);
  const [contactCount, setContactCount] = useState(0);   // πλήθος επαφών (για το πλακίδιο-σύνοψη)
  const [docCount, setDocCount] = useState(0);           // πλήθος εγγράφων στο αρχείο
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data:exp },{ data:bil },{ data:tsk },{ data:ten },{ data:ci },{ data:iv },{ data:ln },{ data:hs },{ data:allExp },{ count:cCount },{ count:dCount }] = await Promise.all([
      supabase.from('expenses').select('*').eq('property_id',prop.id).eq('user_id',userId).gte('date',`${year}-01-01`),
      supabase.from('bills').select('*').eq('property_id',prop.id).eq('user_id',userId),
      supabase.from('maintenance_tasks').select('*').eq('property_id',prop.id).eq('user_id',userId).eq('completed',false).order('due_date').limit(5),
      supabase.from('tenants').select('monthly_rent,lease_end').eq('property_id',prop.id).eq('user_id',userId).order('updated_at',{ascending:false}).limit(1),
      supabase.from('checklist_items').select('due_date,status,priority').eq('property_id',prop.id).neq('status','done').neq('status','skipped'),
      supabase.from('inventory_items').select('name,warranty_expiry,condition').eq('property_id',prop.id),
      supabase.from('loans').select('amount,rate,years').eq('property_id',prop.id).eq('user_id',userId),
      supabase.from('client_stays').select('check_in,check_out,total,nights,nightly_rate').eq('property_id',prop.id).eq('user_id',userId),
      // Χωριστά: ΟΛΕΣ οι δαπάνες (κάθε έτους) για το γράφημα με επιλογή έτους.
      // Οι επαναλαμβανόμενες (πάγιες) προβάλλονται στους επόμενους μήνες/έτη.
      supabase.from('expenses').select('amount,date,category,is_recurring,recurring_frequency').eq('property_id',prop.id).eq('user_id',userId),
      // Μόνο πλήθη (head) για τα πλακίδια-σύνοψη Επαφές / Αρχείο.
      supabase.from('contacts').select('id',{count:'exact',head:true}).eq('property_id',prop.id),
      supabase.from('property_documents').select('id',{count:'exact',head:true}).eq('property_id',prop.id),
    ]);
    setExpenses(exp||[]); setBills(bil||[]); setTasks(tsk||[]); setTenant(ten?.[0]||null);
    setChk(ci||[]); setInv(iv||[]); setLoans(ln||[]); setHostStays(hs||[]); setAllExpenses(allExp||[]);
    setContactCount(cCount||0); setDocCount(dCount||0); setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop.id, userId, year]);

  useEffect(() => {
    setLoading(true); load();
    // Real-time: κάθε αλλαγή σε άλλα tabs ενημερώνει ζωντανά την Επισκόπηση
    const ch = supabase.channel(`overview_${prop.id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'bills',             filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'expenses',          filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'tenants',           filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'maintenance_tasks', filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'checklist_items',   filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'loans',             filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'client_stays',       filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'inventory_items',     filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'contacts',            filter:`property_id=eq.${prop.id}` }, () => load())
      .on('postgres_changes', { event:'*', schema:'public', table:'property_documents',  filter:`property_id=eq.${prop.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop.id, load]);

  const totalExpYTD = expenses.reduce((s,e)=>s+e.amount,0);
  // Τάση δαπανών σε σχέση με πέρσι (από όλο το ιστορικό), για ένδειξη στο KPI.
  const expThisY = allExpenses.filter(e => new Date(e.date).getFullYear() === year).reduce((s,e)=>s+e.amount,0);
  const expPrevY = allExpenses.filter(e => new Date(e.date).getFullYear() === year-1).reduce((s,e)=>s+e.amount,0);
  const expDeltaPct = expPrevY > 0 ? Math.round((expThisY - expPrevY)/expPrevY*100) : null;
  // Διαχωρισμός πληρωμένων/εκκρεμών: το σύνολο (accrual) οδηγεί την απόδοση, αλλά
  // δείχνουμε ξεχωριστά τι έχει πληρωθεί και τι εκκρεμεί (π.χ. σαρωμένοι λογαριασμοί).
  const paidExpYTD = expenses.filter(e => (e as any).paid !== false).reduce((s,e)=>s+e.amount,0);
  const pendingExpYTD = totalExpYTD - paidExpYTD;
  // Single source of truth: ίδιος υπολογισμός ενοικίου/αξίας/απόδοσης παντού.
  const rent = resolveRent({ tenantRent: tenant?.monthly_rent, targetRent: prop.target_rent }).value;
  const propValue = resolveValue(prop.value, prop.obj_value).value;
  const { annualRent, grossYield, netYield } = computeYields(rent, propValue, totalExpYTD);
  const daysToExpiry = tenant?.lease_end ? Math.ceil((new Date(tenant.lease_end).getTime()-Date.now())/86400000) : null;
  // Δάνεια: εκτιμώμενη μηνιαία δόση και δείκτης δανείου προς αξία (η Επισκόπηση «ξέρει» πλέον τα δάνεια).
  const monthlyDebt = loans.reduce((s,l)=>s+annuityMonthly(l.amount||0,l.rate||0,l.years||0),0);
  const totalDebt = loans.reduce((s,l)=>s+(l.amount||0),0);
  const debtLtv = propValue>0 && totalDebt>0 ? (totalDebt/propValue)*100 : 0;
  // Έσοδα φιλοξενίας από το Πελατολόγιο (διαμονές συνδεδεμένες σε αυτό το ακίνητο): η
  // Επισκόπηση «ξέρει» πλέον τα πραγματικά έσοδα βραχυχρόνιας, όχι μόνο τον στόχο ενοικίου.
  const todayIso = new Date().toISOString().slice(0,10);
  const hostingYTD = hostStays.filter(s=>((s.check_in||s.check_out||'').slice(0,4))===String(year)).reduce((sum,s)=>sum+stayTotal(s),0);
  const hostingNights = hostStays.filter(s=>((s.check_in||s.check_out||'').slice(0,4))===String(year)).reduce((sum,s)=>sum+(s.nights ?? 0),0);
  const nextArrival = hostStays.map(s=>s.check_in).filter((d): d is string => !!d && d>=todayIso).sort()[0] || null;
  const MONTHS = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
  const MONTHS_LONG = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
  // Γράφημα: δαπάνες του ΕΠΙΛΕΓΜΕΝΟΥ έτους (chartYear). Οι μη επαναλαμβανόμενες
  // μετρούν στον μήνα της ημερομηνίας τους· οι επαναλαμβανόμενες (πάγιες, μόνο
  // εφόσον ο χρήστης τις έχει σημάνει) προβάλλονται από την έναρξή τους και μετά,
  // ανάλογα με τη συχνότητα. Καμία εφεύρεση, μόνο ό,τι έχει καταχωρήσει ο χρήστης.
  const occMonths = (e: { date:string; is_recurring?:boolean; recurring_frequency?:string|null }, y: number): number[] => {
    const d = new Date(e.date); const sy = d.getFullYear(); const sm = d.getMonth();
    if (!e.is_recurring) return sy === y ? [sm] : [];
    if (y < sy) return [];
    const step = e.recurring_frequency === 'annual' ? 12 : e.recurring_frequency === 'biannual' ? 6 : e.recurring_frequency === 'quarterly' ? 3 : 1;
    const out: number[] = [];
    for (let m = 0; m < 12; m++) { const abs = (y - sy) * 12 + m - sm; if (abs >= 0 && abs % step === 0) out.push(m); }
    return out;
  };
  const monthlyExp = Array(12).fill(0);
  allExpenses.forEach(e => { occMonths(e, chartYear).forEach(m => { monthlyExp[m] += e.amount; }); });
  const maxExp = Math.max(...monthlyExp, 1);
  // Κατηγορίες τρέχοντος έτους (για την αναφορά PDF)
  const catMap: Record<string,number> = {};
  expenses.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + e.amount; });
  const catEntries = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  // Κατηγορίες για τον επιλεγμένο μήνα του chartYear (πίνακας δεξιά από το γράφημα)
  const selCatMap: Record<string,number> = {};
  allExpenses.forEach(e => { if (occMonths(e, chartYear).includes(selMonth)) selCatMap[e.category] = (selCatMap[e.category]||0) + e.amount; });
  const selCatEntries = Object.entries(selCatMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const selMonthTotal = monthlyExp[selMonth] || 0;
  // Έτη για το dropdown: όσα έχουν δαπάνες + προηγούμενο/τρέχον/επόμενο, φθίνουσα.
  const chartYears = Array.from(new Set<number>([
    ...allExpenses.map(e => new Date(e.date).getFullYear()),
    now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1,
  ])).sort((a,b) => b - a);
  const catColors = ['var(--border-subtle)','var(--border-subtle)','var(--border-subtle)','var(--border-subtle)','var(--border-subtle)'];

  // ── Cross-tab live alerts, επερχόμενα γεγονότα & εκκρεμότητες ──────────────
  const daysUntil = (d: string | null | undefined) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000) : null;
  const alerts: { tone: 'negative' | 'warning' | 'info' | 'positive'; label: string; sub?: string }[] = [];
  if (daysToExpiry != null) {
    if (daysToExpiry < 0) alerts.push({ tone:'negative', label:'Η σύμβαση ενοικίασης έχει λήξει', sub:`Έληξε πριν ${Math.abs(daysToExpiry)} ημέρες, απαιτείται ανανέωση` });
    else if (daysToExpiry <= 60) alerts.push({ tone:'warning', label:'Λήξη σύμβασης ενοικίασης', sub:`Σε ${daysToExpiry} ημέρες` });
  }
  const unpaid  = bills.filter(b => !b.paid);
  const overdue = unpaid.filter(b => { const x = daysUntil((b as any).due_date); return x != null && x < 0; });
  if (overdue.length) alerts.push({ tone:'negative', label:`${overdue.length} ληξιπρόθεσμοι λογαριασμοί`, sub:'Εκκρεμεί πληρωμή' });
  else if (unpaid.length) alerts.push({ tone:'warning', label:`${unpaid.length} εκκρεμείς λογαριασμοί`, sub:'Προς πληρωμή' });
  const tasksOverdue = tasks.filter(t => { const x = daysUntil(t.due_date); return x != null && x < 0; });
  const tasksSoon    = tasks.filter(t => { const x = daysUntil(t.due_date); return x != null && x >= 0 && x <= 15; });
  if (tasksOverdue.length) alerts.push({ tone:'negative', label:`${tasksOverdue.length} εκπρόθεσμες εργασίες συντήρησης` });
  else if (tasksSoon.length) alerts.push({ tone:'warning', label:`${tasksSoon.length} εργασίες συντήρησης σύντομα`, sub:'Εντός 15 ημερών' });
  const chkOverdue  = chk.filter(c => { const x = daysUntil(c.due_date); return x != null && x < 0; });
  const chkCritical = chk.filter(c => c.priority === 'critical' && c.status === 'pending');
  if (chkOverdue.length) alerts.push({ tone:'negative', label:`${chkOverdue.length} εκπρόθεσμα στοιχεία στο Checklist` });
  else if (chkCritical.length) alerts.push({ tone:'warning', label:`${chkCritical.length} κρίσιμα στοιχεία στο Checklist`, sub:'Απαιτούν προσοχή' });
  const warrantySoon = inv.filter(i => { const x = daysUntil(i.warranty_expiry); return x != null && x >= 0 && x <= 90; });
  // Σύνοψη εκκρεμοτήτων για το πλακίδιο: πλήθος ανοιχτών + όσα χρήζουν προσοχής.
  const openChk = chk.length;
  const chkAttention = new Set([...chkOverdue, ...chkCritical]).size;
  const badCond      = inv.filter(i => i.condition === 'Κακή' || i.condition === 'Εκτός Λειτουργίας');
  if (warrantySoon.length) alerts.push({ tone:'info', label:`${warrantySoon.length} εγγυήσεις λήγουν σύντομα`, sub:'Εντός 90 ημερών, δες την Απογραφή' });
  if (badCond.length) alerts.push({ tone:'warning', label:`${badCond.length} αντικείμενα σε κακή κατάσταση`, sub:'Χρειάζονται επισκευή ή αντικατάσταση' });
  if (alerts.length === 0 && !loading) alerts.push({ tone:'positive', label:'Όλα σε τάξη, δεν υπάρχουν εκκρεμότητες', sub:'Καμία επείγουσα ειδοποίηση για αυτό το ακίνητο' });

  // ── Έξυπνα insights: ο «σύμβουλος» διαβάζει τα δεδομένα και προτεραιοποιεί ──
  const insights = computeInsights({
    now: now.getTime(),
    property: prop, tenant, rent, propValue, grossYield, netYield,
    expensesYTD: totalExpYTD,
    expenses: expenses as { category?:string; amount:number; date?:string; paid?:boolean; expense_group?:string|null; payment_method?:string|null }[],
    bills: bills.map(b => ({ type:(b as any).type, amount:(b as any).amount, paid:(b as any).paid, due_date:(b as any).due_date })),
    tasks: tasks.map(t => ({ due_date: t.due_date })),
    checklist: chk,
    inventory: inv,
    loanPayment: 0,
  });

  if (loading) return (
    <div>
      <SkeletonKPIs n={5} />
      <div className="grid-main">
        <div className="card"><Skeleton w={140} h={11} style={{marginBottom:16}}/><Skeleton h={120} r={10}/></div>
        <div className="card"><Skeleton w={120} h={11} style={{marginBottom:16}}/><Skeleton h={120} r={10}/></div>
      </div>
      <div className="grid-3" style={{marginBottom:16}}>
        {[0,1,2].map(i=><div key={i} className="card"><Skeleton w={110} h={11} style={{marginBottom:16}}/><Skeleton h={90} r={10}/></div>)}
      </div>
    </div>
  );

  return (
    <div>
      {/* Task-first hero: το πρώτο πράγμα που βλέπει ο χρήστης είναι ο χαιρετισμός
          και οι πιο σημαντικές ενέργειες που χρειάζονται τώρα (ελέγχεται από Προτιμήσεις). */}
      {prefs.liveNotifications && (
        <InsightsBoard insights={insights} name={ownerName} onSaveName={onSaveOwnerName} onNavigate={onNavigate} maxVisible={4} />
      )}

      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
        <button onClick={()=>printPropertyStatement({
          propName: prop.name, address: prop.address||undefined,
          propType: PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type||'Ακίνητο',
          status: STATUS_LABELS[prop.status_detail||'']||undefined, year, propValue: propValue||undefined,
          sqm: prop.sqm||undefined, monthlyRent: rent, annualRent, grossYield, netYield,
          expensesYTD: totalExpYTD, categories: catEntries, branding,
        })}
          style={{display:'inline-flex',alignItems:'center',gap:8,height:36,padding:'0 16px',borderRadius:100,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:700,cursor:'pointer'}}
          onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-secondary)';}}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
          Αναφορά (PDF)
        </button>
      </div>

      {isDemo && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:16, padding:'12px 16px', borderRadius:12, background:'var(--accent-soft)', border:'1px solid var(--accent-border)' }}>
          <div style={{ fontSize:13, color:'var(--text-secondary)' }}>
            <strong style={{ color:'var(--text-primary)' }}>Δείγμα (demo).</strong> Περιήγησε τα εργαλεία με έτοιμα δεδομένα. Όταν είσαι έτοιμος, καθάρισέ το και πρόσθεσε το δικό σου ακίνητο.
          </div>
          {onCleanDemo && <button onClick={onCleanDemo} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:20, padding:'7px 16px', fontSize:13, fontWeight:600, fontFamily:"'Inter',sans-serif", color:'var(--accent)', cursor:'pointer', whiteSpace:'nowrap' }}>Καθάρισε το demo</button>}
        </div>
      )}

      <OnboardingChecklist propertyId={prop.id} onNavigate={onNavigate} steps={[
        { key:'details', label:'Συμπλήρωσε αξία & ενοίκιο', hint:'Εμπορική ή αντικειμενική αξία και μηνιαίο ενοίκιο, για σωστές αποδόσεις', done: propertyDetailsComplete(prop, !!tenant), nav:'settings' },
        { key:'pricing', label:'Δες την προτεινόμενη τιμή σου', hint:'Δυναμική τιμή ανά νύχτα και φορολογική εικόνα βραχυχρόνιας μίσθωσης', done: hostStays.length>0, nav:'pricing' },
        { key:'tenant',  label:'Πρόσθεσε ενοικιαστή & ενοίκιο', hint:'Ξεκλείδωσε αποδόσεις και υπενθυμίσεις λήξης', done: !!tenant, nav:'tenant' },
        { key:'expense', label:'Κατέγραψε την πρώτη δαπάνη', hint:'Παρακολούθησε κόστη και έκπτωση φόρου', done: expenses.length>0, nav:'finances' },
        { key:'bills',   label:'Ρύθμισε ρεύμα & αέριο', hint:'Σύγκρινε παρόχους και βρες φθηνότερο τιμολόγιο', done: bills.length>0, nav:'finances' },
        { key:'inv',     label:'Ξεκίνα την απογραφή', hint:'Εξοπλισμός, εγγυήσεις και αποσβέσεις', done: inv.length>0, nav:'inventory' },
      ] as SetupStep[]}/>

      <div className="kpi-grid kpi-grid-5" style={{marginBottom:24}}>
        {[
          { label:'Μηνιαίο Ενοίκιο', value:fmtEur(rent) },
          { label:'Μεικτή Απόδοση', value:`${grossYield.toFixed(1)}%`, title:'Απόδοση (yield): ετήσιο ενοίκιο ως ποσοστό της αξίας του ακινήτου, προ δαπανών' },
          { label:'Καθαρή Απόδοση', value:`${netYield.toFixed(1)}%`, title:'Απόδοση (yield): ετήσιο ενοίκιο μείον δαπάνες, ως ποσοστό της αξίας του ακινήτου' },
          { label:'Δαπάνες Έτους', value:fmtEur(totalExpYTD),
            sub: expDeltaPct!=null ? { text:`${expDeltaPct>0?'+':expDeltaPct<0?'−':''}${Math.abs(expDeltaPct)}% σε σχέση με πέρσι`, color: expDeltaPct>0?'var(--negative)':expDeltaPct<0?'var(--positive)':'var(--text-tertiary)' } : undefined },
          { label: daysToExpiry!=null?'Λήξη Σύμβασης':'Αξία Ακινήτου', value: daysToExpiry!=null?(daysToExpiry<0?'Έληξε':`${daysToExpiry} ${daysToExpiry===1?'ημέρα':'ημέρες'}`):fmtEur(propValue),
            color: daysToExpiry!=null&&daysToExpiry<60 ? (daysToExpiry<0?'var(--negative)':'var(--warning)') : undefined },
        ].map((k,i) => (
          <div key={i} className="kpi-card" title={(k as any).title}>
            <div className="kpi-value" style={{color:k.color||'var(--text-primary)',fontFamily:"'Inter',sans-serif",fontVariantNumeric:'tabular-nums'}}>{k.value}</div>
            <div className="kpi-label">{k.label}</div>
            {(k as any).sub && <div style={{fontSize:11,fontWeight:600,marginTop:4,color:(k as any).sub.color,fontFamily:"'Inter',sans-serif"}}>{(k as any).sub.text}</div>}
          </div>
        ))}
      </div>

      <ObligationsPanel propertyId={prop.id} userId={userId} prop={prop} onNavigate={onNavigate} />

      {prefs.showSmartTips && (
        <AIInsights ctx={{
          propName: prop.name, propType: PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type||'Ακίνητο',
          address: prop.address||undefined, value: propValue||undefined, sqm: prop.sqm||undefined,
          monthlyRent: rent, grossYield, netYield, expensesYTD: totalExpYTD, annualRent,
          daysToLeaseEnd: daysToExpiry, status: STATUS_LABELS[prop.status_detail||'']||undefined,
        }}/>
      )}

      <div className="grid-main">
        <div className="card">
          <div className="section-label" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <span><span className="section-dot"/> Δαπάνες {chartYear} ανά μήνα</span>
            <div style={{position:'relative'}}>
              <button type="button" onClick={()=>setYearMenu(m=>!m)} title="Άλλαξε έτος"
                style={{display:'inline-flex',alignItems:'center',gap:5,height:26,padding:'0 8px 0 10px',borderRadius:8,border:'1px solid var(--border-default)',background:'var(--bg-surface)',color:'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace",fontSize:12,fontWeight:700,cursor:'pointer'}}>
                {chartYear}
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{transform:yearMenu?'rotate(180deg)':'none',transition:'transform 0.2s',opacity:0.8}}><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {yearMenu && (
                <>
                  <div onClick={()=>setYearMenu(false)} style={{position:'fixed',inset:0,zIndex:40}}/>
                  <div style={{position:'absolute',top:'calc(100% + 4px)',right:0,zIndex:50,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:10,boxShadow:'var(--elev-3)',padding:6,minWidth:120,maxHeight:220,overflowY:'auto'}}>
                    {chartYears.map(y => {
                      const sel = y===chartYear; const future = y>now.getFullYear();
                      return (
                        <button key={y} type="button" onClick={()=>{setChartYear(y);setYearMenu(false);}}
                          style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,width:'100%',padding:'8px 10px',borderRadius:7,border:'none',background:sel?'var(--accent-dim)':'transparent',color:sel?'var(--accent)':'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",fontSize:13,fontWeight:sel?700:500,cursor:'pointer',textAlign:'left'}}
                          onMouseEnter={e=>{if(!sel)e.currentTarget.style.background='var(--bg-hover)';}}
                          onMouseLeave={e=>{if(!sel)e.currentTarget.style.background='transparent';}}>
                          {y}
                          {future && <span style={{fontFamily:"'Inter',sans-serif",fontSize:9,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>μελλοντικό</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'flex-end',gap:6,height:120}}>
            {monthlyExp.map((v,i) => {
              const active = i===selMonth;
              return (
              <button key={i} type="button" onClick={()=>setSelMonth(i)} title={`${MONTHS[i]}: ${fmtEur(v)}`} aria-pressed={active}
                style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,cursor:'pointer',background:'transparent',border:'none',padding:0,height:'100%',justifyContent:'flex-end'}}>
                <div style={{width:'100%',height:`${maxExp>0?(v/maxExp)*100:0}%`,background:active?'linear-gradient(180deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 76%, #6ea8ff) 100%)':'var(--bg-hover)',borderRadius:'6px 6px 2px 2px',minHeight:v>0?4:0,transition:'height 0.45s cubic-bezier(.2,0,0,1)',boxShadow:active?'0 4px 10px -4px rgba(26,115,232,.4)':'none'}}/>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,fontWeight:active?700:400,color:active?'var(--accent)':'var(--text-tertiary)'}}>{MONTHS[i]}</div>
              </button>
            );})}
          </div>
          {chartYear > now.getFullYear() && (
            <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:'var(--text-tertiary)',marginTop:10,lineHeight:1.5}}>
              Προβολή βάσει των επαναλαμβανόμενων (πάγιων) δαπανών που έχεις καταχωρήσει. Πρόσθεσε ή σήμανε πάγιες δαπάνες στις «Δαπάνες».
            </div>
          )}
        </div>
        <div className="card">
          <div className="section-label" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
            <span><span className="section-dot"/> Κατηγορίες Δαπανών · {MONTHS_LONG[selMonth]} {chartYear}</span>
            {selMonthTotal>0 && <span style={{fontFamily:"'Roboto Mono',monospace",fontSize:12,color:'var(--text-secondary)',fontVariantNumeric:'tabular-nums'}}>{fmtEur(selMonthTotal)}</span>}
          </div>
          {selCatEntries.length===0
            ? <div style={{fontFamily:"'Inter',sans-serif",color:'var(--text-tertiary)',fontSize:14,textAlign:'center',padding:'30px 0'}}>Δεν υπάρχουν δαπάνες για {MONTHS_LONG[selMonth]} {chartYear}</div>
            : <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {selCatEntries.map(([cat,amt],i) => (
                  <div key={cat} style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:8,height:8,borderRadius:2,background:catColors[i],flexShrink:0}}/>
                    <div style={{flex:1,fontFamily:"'Inter',sans-serif",fontSize:13,color:'var(--text-secondary)',letterSpacing:'0.25px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{cat}</div>
                    <div style={{fontFamily:"'Roboto Mono',monospace",fontSize:13,color:'var(--text-primary)',flexShrink:0,fontVariantNumeric:'tabular-nums'}}>{fmtEur(amt)}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      <div className="grid-3" style={{marginBottom:16}}>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Στοιχεία Ακινήτου</div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <tbody>
              {[['Τύπος',PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type],['Εμβαδόν',prop.sqm?`${prop.sqm} τετραγωνικά`:null],['Υπνοδωμάτια',prop.bedrooms?String(prop.bedrooms):null],['Διεύθυνση',prop.address],['ΑΤΑΚ',prop.atak],['Έτος Κατασκευής',prop.year_built?String(prop.year_built):null],['Όροφος',prop.floor!=null?String(prop.floor):null],['Θέρμανση',prop.heating?HEATING_LABELS[prop.heating]||prop.heating:null],['Ενεργειακή Κλάση',prop.pea_class],['Θέσεις Στάθμευσης',prop.parking_spaces?String(prop.parking_spaces):null],['Αποθήκη',prop.storage_sqm?`${prop.storage_sqm} τ.μ.`:null],['Αντικειμενική Αξία',prop.obj_value?fmtEur(prop.obj_value):null],['Εκτιμώμενος ΕΝΦΙΑ',prop.enfia?fmtEur(prop.enfia):null]].filter(([,v])=>v).map(([k,v],i) => (
                <tr key={i}>
                  <td title={k==='ΑΤΑΚ'?'Αριθμός Ταυτότητας Ακινήτου (από το Ε9)':k==='Εκτιμώμενος ΕΝΦΙΑ'?'Ενιαίος Φόρος Ιδιοκτησίας Ακινήτων — ετήσιος φόρος περιουσίας':undefined} style={{padding:'8px 0',fontFamily:"'Inter',sans-serif",color:'var(--text-secondary)',width:110,fontSize:13,letterSpacing:'0.25px',borderBottom:'1px solid var(--border-subtle)'}}>{k}</td>
                  <td style={{padding:'8px 0',fontFamily:"'Inter',sans-serif",color:'var(--text-primary)',fontSize:13,textAlign:'right',letterSpacing:'0.25px',borderBottom:'1px solid var(--border-subtle)'}}>{v as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Επόμενες Εργασίες</div>
          {tasks.length===0
            ? <div style={{fontFamily:"'Inter',sans-serif",color:'var(--text-tertiary)',fontSize:14,textAlign:'center',padding:'20px 0'}}>Δεν υπάρχουν εκκρεμείς εργασίες</div>
            : <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {tasks.map(t => { const pc=t.priority==='high'?'var(--border-subtle)':t.priority==='medium'?'var(--border-subtle)':'var(--border-subtle)'; return (
                  <div key={t.id} style={{display:'flex',alignItems:'flex-start',gap:10}}>
                    <div style={{width:6,height:6,borderRadius:'50%',background:pc,marginTop:6,flexShrink:0}}/>
                    <div>
                      <div style={{fontFamily:"'Inter',sans-serif",fontSize:13,color:'var(--text-primary)',lineHeight:'20px'}}>{t.title}</div>
                      {t.due_date&&<div style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-tertiary)',marginTop:2}}>{new Date(t.due_date).toLocaleDateString('el-GR')}</div>}
                    </div>
                  </div>
                );})}
              </div>
          }
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Μέσοι Λογαριασμοί</div>
          {bills.length===0
            ? <div style={{fontFamily:"'Inter',sans-serif",color:'var(--text-tertiary)',fontSize:14,textAlign:'center',padding:'20px 0'}}>Δεν υπάρχουν λογαριασμοί</div>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {bills.slice(0,5).map(b => (
                  <div key={b.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:13,color:'var(--text-secondary)',letterSpacing:'0.25px'}}>{b.type}</div>
                    <div style={{fontFamily:"'Roboto Mono',monospace",fontSize:13,color:'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>{fmtEur(b.avg_amount||b.amount)}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      <div className="card">
        <div className="section-label"><span className="section-dot"/> Ετήσια Προβολή {year}</div>
        <div className="grid-5">
          {(() => {
            // Ετήσια προβολή: ετησιοποιούμε τις δαπάνες YTD ώστε να ταιριάζουν με το
            // ετήσιο ενοίκιο, και ο φόρος είναι προοδευτικός (κλίμακα 2026), όχι flat 15%.
            const annualizedExp = month > 0 ? Math.round(totalExpYTD / month * 12) : totalExpYTD;
            const estTax = Math.round(rentalIncomeTax(annualRent));
            const net = annualRent - annualizedExp - estTax;
            return [
            { label:'Ακαθάριστα Έσοδα', value:fmtEur(annualRent), color:'var(--text-primary)' },
            { label:'Δαπάνες (προβολή)', value:fmtEur(annualizedExp), color:'var(--text-primary)' },
            { label:'Εκτιμώμενος Φόρος Ενοικίου', value:fmtEur(estTax), color:'var(--text-primary)' },
            { label:'Καθαρό Αποτέλεσμα', value:fmtEur(net), color:net>=0?'var(--positive)':'var(--negative)' },
            { label:'Καθαρή Απόδοση', value:`${netYield.toFixed(1)}%`, color:'var(--accent)', accent:true, title:'Απόδοση (yield): καθαρό ετήσιο έσοδο ως ποσοστό της αξίας του ακινήτου' },
          ]; })().map((k,i) => { const acc=(k as any).accent; return (
            <div key={i} title={(k as any).title} style={{textAlign:'center',padding:'16px 14px',background:acc?'var(--accent-soft)':'var(--bg-elevated)',border:`1px solid ${acc?'var(--accent-border)':'var(--border-subtle)'}`,borderRadius:14}}>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:20,fontWeight:700,color:acc?'var(--accent)':k.color,marginBottom:8,fontVariantNumeric:'tabular-nums',lineHeight:1,letterSpacing:'-0.02em'}}>{k.value}</div>
              <div style={{fontFamily:"'Inter',sans-serif",fontSize:10,fontWeight:600,color:'var(--text-tertiary)',letterSpacing:'0.06em',textTransform:'uppercase'}}>{k.label}</div>
            </div>
          );})}
        </div>
        {loans.length > 0 && (
          <div style={{display:'flex',justifyContent:'center',gap:24,marginTop:14,paddingTop:14,borderTop:'1px solid var(--border-subtle)',flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-secondary)'}}>Δόση δανείου / μήνα</span>
              <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{fmtEur(Math.round(monthlyDebt))}</span>
            </div>
            {debtLtv > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span title="Δείκτης δανείου προς αξία ακινήτου (Loan to Value)" style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-secondary)'}}>Δάνειο προς αξία</span>
                <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{debtLtv.toFixed(0)}%</span>
              </div>
            )}
          </div>
        )}
        {hostStays.length > 0 && (
          <div style={{display:'flex',justifyContent:'center',gap:24,marginTop:14,paddingTop:14,borderTop:'1px solid var(--border-subtle)',flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span title="Πραγματικά έσοδα από διαμονές επισκεπτών, από την καρτέλα Πελάτης" style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-secondary)'}}>Έσοδα φιλοξενίας {year}</span>
              <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{fmtEur(Math.round(hostingYTD))}</span>
            </div>
            {hostingNights > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-secondary)'}}>Διανυκτερεύσεις</span>
                <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{hostingNights}</span>
              </div>
            )}
            {nextArrival && (
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-secondary)'}}>Επόμενη άφιξη</span>
                <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:700,color:'var(--accent)'}}>{new Date(nextArrival).toLocaleDateString('el-GR')}</span>
              </div>
            )}
          </div>
        )}
        {pendingExpYTD > 0 && (
          <div style={{display:'flex',justifyContent:'center',gap:24,marginTop:14,paddingTop:14,borderTop:'1px solid var(--border-subtle)',flexWrap:'wrap'}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:'var(--border-subtle)',display:'inline-block'}}/>
              <span style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-secondary)'}}>Πληρωμένα</span>
              <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{fmtEur(paidExpYTD)}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:'var(--border-subtle)',display:'inline-block'}}/>
              <span style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-secondary)'}}>Εκκρεμή</span>
              <span style={{fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums',fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{fmtEur(pendingExpYTD)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Διαχείριση & Εργαλεία, δευτερεύουσες ενέργειες, κάτω από την οικονομική εικόνα */}
      <div style={{marginTop:8,marginBottom:12,fontFamily:"'Inter',sans-serif",fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--text-tertiary)'}}>Διαχείριση & Εργαλεία</div>
      <PortalShare propertyId={prop.id} userId={userId} />
      <OccupancyPanel propertyId={prop.id} userId={userId} longTermMonthly={rent} />
      <PaymentLinks />

      {/* Εργαλεία ακινήτου: ελαφριά πλακίδια-σύνοψη που ανοίγουν την εστιασμένη
          προβολή. Στο προφίλ «Ιδιώτης» ζουν ΕΔΩ (κάτω από Είσπραξη & Πληρωμές)·
          στο «Επαγγελματίας» ζουν στην πλαϊνή μπάρα (ομάδα «Εργαλεία»). Έτσι δεν
          υπάρχουν διπλότυπα — σε κάθε προφίλ εμφανίζονται σε ένα μόνο σημείο. */}
      {profileType==='individual' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <ToolTile title="Εκκρεμότητες" metric={openChk ? `${openChk} ανοιχτές` : 'Καμία εκκρεμότητα'} sub="Εργασίες, προθεσμίες, παραδόσεις" badge={chkAttention} onOpen={() => onNavigate('checklist')} />
        <ToolTile title="Επαφές" metric={contactCount ? `${contactCount} ${contactCount === 1 ? 'επαφή' : 'επαφές'}` : 'Πρόσθεσε επαφές'} sub="Πάροχοι, τράπεζες, τεχνικοί" onOpen={() => onNavigate('contacts')} />
        <ToolTile title="Αρχείο" metric={docCount ? `${docCount} ${docCount === 1 ? 'έγγραφο' : 'έγγραφα'}` : 'Ανέβασε έγγραφα'} sub="Συμβόλαια, λογαριασμοί, φωτογραφίες" onOpen={() => onNavigate('documents')} />
        <ToolTile title="Απογραφή" metric={inv.length ? `${inv.length} ${inv.length === 1 ? 'αντικείμενο' : 'αντικείμενα'}` : 'Κατέγραψε εξοπλισμό'} sub="Εξοπλισμός, εγγυήσεις, αποσβέσεις" badge={warrantySoon.length} onOpen={() => onNavigate('inventory')} />
      </div>
      )}
    </div>
  );
}

// Πλακίδιο-σύνοψη εργαλείου στην Επισκόπηση: ζωντανός αριθμός + ένα κλικ ανοίγει
// την πλήρη, εστιασμένη καρτέλα (αντί να φορτώνει βαρύ περιεχόμενο εδώ).
function ToolTile({ title, metric, sub, badge, onOpen }: { title: string; metric: string; sub: string; badge?: number; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="card tool-card" style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {badge ? <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: 'var(--negative)', color: '#fff', fontFamily: "'Inter',sans-serif", fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{badge > 9 ? '9+' : badge}</span> : null}
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
      </div>
      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{metric}</span>
      <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11, color: 'var(--text-tertiary)' }}>{sub}</span>
    </button>
  );
}

// Main Dashboard
export default function Dashboard() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selected, setSelected] = useState<Property | null>(null);
  const [nav, setNav] = useState('overview');
  // Deep-link καρτέλα ενοικιαστή → Απογραφή/Παράδοση με προ-συμπληρωμένα στοιχεία.
  const [handoverIntent, setHandoverIntent] = useState<{tenantName?:string;tenantPhone?:string;type?:'check_in'|'check_out'}|null>(null);
  // Ομαδοποιημένη πλοήγηση (accordion): ανοιχτή μένει η ομάδα του ενεργού tab.
  const [openGroup, setOpenGroup] = useState('Οικονομικά');
  useEffect(() => { const g = NAV_GROUPS.find(gr => gr.ids.includes(nav)); if (g?.label) setOpenGroup(g.label); }, [nav]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCopyInventory, setShowCopyInventory] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);  // συρόμενο μενού σε κινητό/tablet
  const [cmdkOpen, setCmdkOpen] = useState(false);        // command palette (⌘K)
  const [quickAddOpen, setQuickAddOpen] = useState(false);// γρήγορη προσθήκη με φωτογραφία/σάρωση
  const [showWelcome, setShowWelcome] = useState(false);// καλωσόρισμα πρώτης χρήσης
  const [scanDraftId, setScanDraftId] = useState<string|null>(null);// προσχέδιο από scan-to-create
  const [plan, setPlan] = useState<string>('free');       // τρέχον πλάνο συνδρομής (billing_profiles)
  const [ownerName, setOwnerName] = useState('');         // όνομα ιδιοκτήτη για προσφώνηση (billing_profiles.owner_name)
  const [profileType, setProfileType] = useState<'individual'|'professional'>('individual'); // τύπος προφίλ → οδηγεί το interface
  const [isPartner, setIsPartner] = useState(false);      // ιδιότητα Συνεργάτη (referral_partners)
  const [showUpgrade, setShowUpgrade] = useState(false);  // modal ορίου ακινήτων
  const [kbdHint, setKbdHint] = useState('Ctrl K');       // ένδειξη συντόμευσης ανά πλατφόρμα (Mac → ⌘K)
  useEffect(() => {
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || '');
    setKbdHint(mac ? '⌘K' : 'Ctrl K');
  }, []);

  // Καθολικό ⌘K / Ctrl+K για άνοιγμα του command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setCmdkOpen(v => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const inventoryAlerts = useInventoryAlerts(selected?.id||null, user?.id||null);
  const checklistAlerts = useChecklistAlerts(selected?.id||null);

  const fetchProperties = useCallback(async (uid: string) => {
    const { data } = await supabase.from('user_properties').select('*').eq('user_id', uid).order('created_at');
    const props = data || [];
    setProperties(props);
    if (props.length > 0 && !selected) setSelected(props[0]);
    else if (selected) setSelected(props.find(p => p.id === selected.id) || props[0] || null);
  }, [selected]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login'; return; }
      setUser(user);
      // Καταγραφή παραπομπής (referral) στην πρώτη σύνδεση, idempotent. Η RPC
      // αναλύει τον κωδικό στον κάτοχο, μπλοκάρει την αυτο-παραπομπή και γράφει
      // τον referrer, ώστε η σύσταση να προσμετράται σωστά στον συστήνοντα.
      const refBy = (user.user_metadata as any)?.referred_by;
      if (refBy) { supabase.rpc('redeem_referral', { p_code: String(refBy) }).then(() => {}); }
      // Ιδιότητα Συνεργάτη (για το έμβλημα στο header), αν έχει κερδηθεί.
      supabase.from('referral_partners').select('user_id').eq('user_id', user.id).maybeSingle().then(({ data }) => setIsPartner(!!data));
      // Τρέχον πλάνο (για το όριο ακινήτων). Αν δεν υπάρχει προφίλ, δωρεάν.
      supabase.from('billing_profiles').select('plan, owner_name, profile_type').eq('user_id', user.id).maybeSingle().then(({ data }) => { setPlan(data?.plan || 'free'); setOwnerName(data?.owner_name || ''); setProfileType(data?.profile_type === 'professional' ? 'professional' : 'individual'); });
      await fetchProperties(user.id);
      // Καλωσόρισμα πρώτης χρήσης: μόνο για νέο χρήστη (χωρίς ακίνητα) που δεν
      // έχει ξαναδεί το onboarding (πρόοδος στη βάση, όχι μόνο τοπικά).
      try {
        const [{ data: ob }, { count }, { count: docCount }] = await Promise.all([
          supabase.from('onboarding_progress').select('welcomed').eq('user_id', user.id).maybeSingle(),
          supabase.from('user_properties').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('property_documents').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        ]);
        if (!ob?.welcomed && (count || 0) === 0) setShowWelcome(true);
        // Ενεργοποίηση σύστασης: ο νέος χρήστης έχει ≥1 ακίνητο & ≥1 σαρωμένο
        // έγγραφο → η σύστασή του «κλειδώνει» (idempotent, μόνο τη δική του γραμμή).
        if ((count || 0) >= 1 && (docCount || 0) >= 1) supabase.rpc('mark_referral_activated').then(() => {});
      } catch {}
      setLoading(false);
    };
    init();
  }, []);

  // Προσθήκη ακινήτου με έλεγχο ορίου πλάνου: αν έφτασες το όριο, δείξε αναβάθμιση.
  const tryAddProperty = () => {
    if (canAddProperty(plan, properties.length)) setShowAddModal(true);
    else setShowUpgrade(true);
  };

  const updateStatus = async (status: string) => {
    if (!selected||!user) return;
    await supabase.from('user_properties').update({ status_detail: status }).eq('id', selected.id);
    setStatusDropdown(false);
    await fetchProperties(user.id);
  };

  // Οριστική διαγραφή του τρέχοντος ακινήτου μαζί με τα συνδεδεμένα δεδομένα του.
  // Αν ήταν το τελευταίο ακίνητο, ανοίγει αυτόματα η νέα καταχώρηση (ξεκινάς από την αρχή).
  const deletePropertyById = async (pid: string, name: string) => {
    if (!user) return;
    const ok = window.confirm(
      `Οριστική διαγραφή του ακινήτου «${name}»;\n\n`+
      `Θα διαγραφούν όλα τα συνδεδεμένα στοιχεία του (έσοδα, δαπάνες, λογαριασμοί, `+
      `ενοικιαστής, δάνεια, απογραφή, έγγραφα, διαμονές) και οι συνομιλίες και αναμνήσεις `+
      `του βοηθού γι' αυτό. Η ενέργεια δεν αναιρείται.`
    );
    if (!ok) return;
    setStatusDropdown(false);
    const wasLast = properties.length <= 1;
    // Καθαρισμός συνδεδεμένων εγγραφών (best-effort· η RLS περιορίζει στα δικά σου).
    const childTables = ['expenses','calendar_events','bills','bills_history','bills_settings','checklist_items','tenants','tenant_comm_log','contacts','inventory_items','inventory_maintenance','inventory_handovers','loans','property_settings','rent_payments','rent_config','rent_comparables','property_documents','maintenance_tasks','maintenance_requests','portal_links','notification_preferences','client_stays','pricing_settings','ical_feeds'];
    await Promise.allSettled(childTables.map(t => supabase.from(t).delete().eq('property_id', pid)));
    await supabase.from('user_properties').delete().eq('id', pid).eq('user_id', user.id);
    // Σβήσε τη συνομιλία/μνήμη του βοηθού για το συγκεκριμένο ακίνητο (τοπικά στον browser).
    try { clearAssistantHistory(pid); } catch {}
    if (selected?.id === pid) setSelected(null);
    await fetchProperties(user.id);
    if (wasLast) { setNav('overview'); setShowAddModal(true); }
  };
  const deleteProperty = () => { if (selected) deletePropertyById(selected.id, selected.name); };

  // Καθάρισμα demo με ένα κλικ: σβήνει τα δείγματα ακίνητα/πελάτες/διαμονές.
  const cleanupDemo = async () => {
    if (!user) return;
    if (!window.confirm('Να αφαιρεθούν τα δείγματα (demo) δεδομένα;')) return;
    const demoProps = properties.filter(p => (p.name || '').startsWith('Demo —'));
    const childTables = ['expenses','calendar_events','bills','tenants','inventory_items','loans','property_settings','rent_comparables','property_documents','client_stays','pricing_settings','ical_feeds'];
    for (const p of demoProps) {
      await Promise.allSettled(childTables.map(t => supabase.from(t).delete().eq('property_id', p.id)));
      await supabase.from('user_properties').delete().eq('id', p.id).eq('user_id', user.id);
      try { clearAssistantHistory(p.id); } catch {}
    }
    // Σβήσε και τους demo πελάτες (και τις διαμονές τους μέσω cascade στη βάση).
    await supabase.from('clients').delete().eq('user_id', user.id).like('full_name', 'Demo —%');
    setSelected(null);
    await fetchProperties(user.id);
    setNav('overview');
  };

  // Κλείσιμο σάρωσης: αν ήταν προσχέδιο από scan-to-create και δεν αποθηκεύτηκε
  // τίποτα (κανένα έγγραφο), σβήσε το κενό ακίνητο ώστε να μη μένουν σκουπίδια.
  const closeQuickAdd = async () => {
    setQuickAddOpen(false);
    const draft = scanDraftId; setScanDraftId(null);
    if (draft && user) {
      const { count } = await supabase.from('property_documents').select('id', { count: 'exact', head: true }).eq('property_id', draft);
      if ((count || 0) === 0) {
        await supabase.from('user_properties').delete().eq('id', draft).eq('user_id', user.id);
        if (selected?.id === draft) setSelected(null);
        await fetchProperties(user.id);
      }
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); window.location.href = '/login'; };

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg-base)',flexDirection:'column',gap:16}}>
      <div style={{width:48,height:48,borderRadius:'50%',border:'4px solid var(--md-primary-container)',borderTopColor:'var(--accent)',animation:'spin 1s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{fontFamily:"'Inter',sans-serif",fontSize:14,color:'var(--text-secondary)',letterSpacing:'0.1px'}}>Φόρτωση...</span>
    </div>
  );

  const userInitials = user?.email?.substring(0,2).toUpperCase() || 'GF';
  const statusColor = selected ? (STATUS_COLORS[selected.status_detail||'']||'var(--text-secondary)') : 'var(--text-secondary)';
  const statusLabel = selected ? (STATUS_LABELS[selected.status_detail||'']||selected.status_detail) : '';
  const getBadge = (id: string) => { if (id==='inventory'&&inventoryAlerts>0) return inventoryAlerts; if (id==='checklist'&&checklistAlerts>0) return checklistAlerts; return 0; };

  // Εντολές command palette: μετάβαση σε tab, εναλλαγή ακινήτου, γρήγορες ενέργειες
  const cmdItems: CommandItem[] = [
    ...NAV_ITEMS.map(item => ({
      id: `nav-${item.id}`, label: item.label, hint: 'Μετάβαση', group: 'Πλοήγηση',
      keywords: item.id, action: () => { if (selected) setNav(item.id); },
    })),
    ...properties.map(p => ({
      id: `prop-${p.id}`, label: p.name, hint: 'Ακίνητο', group: 'Ακίνητα',
      keywords: `${p.address||''} ${PROP_TYPE_LABELS[p.prop_type||'']||''}`,
      action: () => { setSelected(p); setNav('overview'); },
    })),
    { id: 'act-add', label: 'Προσθήκη ακινήτου', hint: 'Ενέργεια', keywords: 'new property add', action: () => tryAddProperty() },
    { id: 'act-signout', label: 'Αποσύνδεση', hint: 'Ενέργεια', keywords: 'logout sign out exit', action: () => signOut() },
  ];

  return (
    <div className="app-shell">
      {/* Σκίαση πίσω από το συρόμενο μενού (μόνο κινητό/tablet) */}
      <div className={`app-scrim ${sidebarOpen?'open':''}`} onClick={()=>setSidebarOpen(false)}/>
      {/* Sidebar */}
      <aside className={`app-sidebar ${sidebarOpen?'open':''}`}>
        <div className="sidebar-logo" role="button" tabIndex={0}
          onClick={()=>{ setNav('overview'); setSidebarOpen(false); }}
          onKeyDown={e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); setNav('overview'); setSidebarOpen(false); } }}
          title="Αρχική, Επισκόπηση">
          <div className="sidebar-logo-mark">P</div>
          <span className="sidebar-logo-text">Property OS</span>
          <span className="sidebar-logo-badge">Beta</span>
        </div>

        {/* Κεντρικό κουμπί: μια φωτογραφία → αυτόματη καταχώρηση παντού.
            Η ορατότητα είναι εγγυημένη από το .quick-add-btn (αδιαφανές
            background-color που βάφεται πάντα, ανεξάρτητα από τη διαβάθμιση). */}
        <button
          onClick={()=>{ setQuickAddOpen(true); setSidebarOpen(false); }}
          className="quick-add-btn"
          disabled={!selected}
          title={selected ? 'Φωτογράφισε ή ανέβασε λογαριασμό, πληρωμή, μισθωτήριο, ασφάλεια, έγγραφο, οτιδήποτε' : 'Πρόσθεσε πρώτα ένα ακίνητο'}>
          <span className="quick-add-icon" aria-hidden>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </span>
          <span className="quick-add-label">Σκάναρε έγγραφο</span>
        </button>
        <div className="quick-add-hint">Μία φωτογραφία, λογαριασμός, συμβόλαιο, ασφάλεια, οτιδήποτε. Το AI το βάζει στη θέση του.</div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">{profileType==='professional' ? 'Χαρτοφυλάκιό μου' : 'Ακίνητά μου'}</div>
          {properties.map(p => (
            <div key={p.id} role="button" tabIndex={0} aria-pressed={selected?.id===p.id} className={`prop-item ${selected?.id===p.id?'active':''}`} onClick={()=>{setSelected(p);setNav('overview');setSidebarOpen(false);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(p);setNav('overview');setSidebarOpen(false);}}}>
              <div className="prop-item-dot" style={{background:STATUS_COLORS[p.status_detail||'']||'var(--text-tertiary)'}}/>
              <span className="prop-item-name">{p.name}</span>
              <button className="prop-item-del" title="Διαγραφή ακινήτου και όλων των δεδομένων του" aria-label={`Διαγραφή ακινήτου ${p.name}`}
                onClick={e=>{ e.stopPropagation(); deletePropertyById(p.id, p.name); }}
                onKeyDown={e=>{ e.stopPropagation(); }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          ))}
          <button onClick={()=>tryAddProperty()}
            style={{display:'flex',alignItems:'center',gap:12,padding:'0 16px',height:40,borderRadius:20,border:'none',background:'transparent',cursor:'pointer',width:'calc(100% - 16px)',margin:'2px 8px',fontFamily:"'Inter',sans-serif",fontSize:14,color:'var(--accent)',textAlign:'left'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--accent-dim)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <span style={{fontSize:18,lineHeight:1}}>+</span> Προσθήκη ακινήτου
          </button>
        </div>
        <div className="sidebar-nav" style={{flex:1}}>
          {NAV_GROUPS.map((group,gi) => {
            // Χωρίς διπλότυπα: η ομάδα «Εργαλεία» εμφανίζεται στην μπάρα ΜΟΝΟ στον
            // Επαγγελματία. Στον Ιδιώτη τα ίδια εργαλεία ζουν στην Επισκόπηση,
            // κάτω από «Είσπραξη & Πληρωμές».
            if (group.label==='Εργαλεία' && profileType!=='professional') return null;
            const hasHeader = !!group.label;
            const open = !hasHeader || openGroup===group.label;
            const groupBadge = group.ids.reduce((s,id)=>s+getBadge(id),0);
            return (
            <div className="sidebar-section" key={gi}>
              {hasHeader && (
                <button type="button" className={`sidebar-section-header ${open?'open':''}`} aria-expanded={open}
                  onClick={()=>setOpenGroup(cur=>cur===group.label?'':group.label)}>
                  <span>{group.label}</span>
                  {!open && groupBadge>0 && <span className="sidebar-section-badge">{groupBadge>9?'9+':groupBadge}</span>}
                  <span className="sidebar-section-chevron" aria-hidden style={{display:'inline-flex',transform:open?'rotate(90deg)':'none',transition:'transform .15s'}}><svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg></span>
                </button>
              )}
              {open && group.ids.filter(id => (id!=='comparison' || properties.length>=2) && (id!=='portfolio' || profileType==='professional')).map(id => { const badge=getBadge(id); return (
                <button key={id} className={`sidebar-item ${nav===id?'active':''}`} onClick={()=>{setNav(id);setSidebarOpen(false);}} disabled={!selected}>
                  <span className="sidebar-item-icon" aria-hidden>{ic(NAV_ICON[id]||'')}</span>
                  <span className="sidebar-item-label">{id==='referral' && profileType==='professional' ? 'Πρόγραμμα Συνεργατών' : NAV_LABEL[id]}</span>
                  {badge>0&&<span style={{marginLeft:'auto',minWidth:20,height:20,borderRadius:10,background:'var(--negative)',color:'#fff',fontFamily:"'Inter',sans-serif",fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 6px'}}>{badge>9?'9+':badge}</span>}
                </button>
              );})}
            </div>
          );})}
        </div>
        <div className="sidebar-footer">
          <div className="user-row" role="button" tabIndex={0} aria-label="Αποσύνδεση" onClick={signOut} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();signOut();}}} title="Αποσύνδεση">
            <div className="user-avatar">{userInitials}</div>
            <div style={{flex:1,minWidth:0}}>
              <div className="user-name" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{user?.email?.split('@')[0]}</div>
              <div className="user-email">Αποσύνδεση</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="app-main">
        <header className="app-topbar">
          <button className="nav-toggle" onClick={()=>setSidebarOpen(v=>!v)} aria-label="Μενού">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          {selected ? (
            <>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontFamily:"'Inter',sans-serif",fontSize:17,fontWeight:600,letterSpacing:'-0.01em',color:'var(--text-primary)'}}>{selected.name}</span>
                  {/* Ένα κουμπί: κατάσταση ακινήτου + εργαλεία (επεξεργασία, διαγραφή) στο ίδιο μενού. */}
                  <div style={{position:'relative'}}>
                    <button onClick={()=>setStatusDropdown(v=>!v)} title="Κατάσταση ακινήτου και εργαλεία (επεξεργασία, διαγραφή)" aria-haspopup="menu" aria-expanded={statusDropdown} style={{display:'flex',alignItems:'center',gap:7,height:32,padding:'0 10px 0 12px',borderRadius:8,border:`1px solid ${statusColor}44`,background:statusDropdown?'var(--bg-hover)':'transparent',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:12,fontWeight:500,color:statusColor,transition:'background 0.15s'}} onMouseEnter={e=>{if(!statusDropdown)e.currentTarget.style.background='var(--bg-hover)'}} onMouseLeave={e=>{if(!statusDropdown)e.currentTarget.style.background='transparent'}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:statusColor}}/>{statusLabel}
                      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.65,marginLeft:1,transform:statusDropdown?'rotate(180deg)':'none',transition:'transform 0.15s'}}><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    {statusDropdown && (
                      <>
                      {/* Κλείσιμο με κλικ οπουδήποτε αλλού */}
                      <div onClick={()=>setStatusDropdown(false)} style={{position:'fixed',inset:0,zIndex:99}}/>
                      <div role="menu" style={{position:'absolute',top:'calc(100% + 8px)',left:0,background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:'6px 0',zIndex:100,minWidth:224,boxShadow:'var(--shadow-lg)'}}>
                        <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-tertiary)',padding:'6px 16px 4px'}}>Κατάσταση</div>
                        {Object.entries(STATUS_LABELS).map(([k,v]) => {
                          const active = (selected.status_detail||'')===k;
                          return (
                            <button key={k} role="menuitem" onClick={()=>updateStatus(k)} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'9px 16px',border:'none',background:'transparent',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:active?600:400,color:'var(--text-primary)',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <div style={{width:8,height:8,borderRadius:'50%',background:STATUS_COLORS[k]||'var(--text-secondary)',flexShrink:0}}/>
                              <span style={{flex:1}}>{v}</span>
                              {active && <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                            </button>
                          );
                        })}
                        <div style={{height:1,background:'var(--border-subtle)',margin:'6px 12px'}}/>
                        <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase',color:'var(--text-tertiary)',padding:'6px 16px 4px'}}>Εργαλεία ακινήτου</div>
                        <button role="menuitem" onClick={()=>{setStatusDropdown(false);setEditProperty(selected);}} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'9px 16px',border:'none',background:'transparent',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:14,color:'var(--text-primary)',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                          Επεξεργασία στοιχείων
                        </button>
                        <button role="menuitem" onClick={deleteProperty} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'9px 16px',border:'none',background:'transparent',cursor:'pointer',fontFamily:"'Inter',sans-serif",fontSize:14,color:'var(--negative)',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.background='var(--negative-dim)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></svg>
                          Διαγραφή ακινήτου
                        </button>
                      </div>
                      </>
                    )}
                  </div>
                </div>
                <div style={{fontFamily:"'Inter',sans-serif",fontSize:12,color:'var(--text-secondary)',marginTop:2,letterSpacing:'0.4px'}}>
                  {[PROP_TYPE_LABELS[selected.prop_type||'']||selected.prop_type,selected.sqm?`${selected.sqm} τετραγωνικά`:null,selected.address,selected.postal_code?`ΤΚ ${selected.postal_code}`:null].filter(Boolean).join(' · ')}
                </div>
              </div>
              {nav==='inventory'&&properties.length>1&&(
                <button onClick={()=>setShowCopyInventory(true)} style={{height:36,padding:'0 16px',borderRadius:18,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:500,cursor:'pointer',marginRight:8}} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-secondary)'}}>Αντιγραφή Απογραφής</button>
              )}
              <button onClick={()=>setNav('referral')} title={isPartner?'Είσαι Συνεργάτης Property OS · Πρόγραμμα Συνεργατών':`Ιδιότητα: ${profileType==='professional'?'Επαγγελματίας':'Ιδιώτης'} · Πρόγραμμα ${profileType==='professional'?'Συνεργατών':'Πρόσκλησης'}`} aria-label="Η ιδιότητά μου και το πρόγραμμα πρόσκλησης" style={{display:'flex',alignItems:'center',height:36,padding:0,border:'none',background:'transparent',cursor:'pointer',marginRight:8,borderRadius:'50%',transition:'transform .15s'}} onMouseEnter={e=>e.currentTarget.style.transform='translateY(-1px)'} onMouseLeave={e=>e.currentTarget.style.transform='none'}>
                <TierBadge tier={isPartner?'partner':(profileType==='professional'?'agency':'owner')} showLabel={false} size={30} />
              </button>
              <button onClick={()=>setCmdkOpen(true)} title={`Αναζήτηση & γρήγορες ενέργειες (${kbdHint})`} aria-label="Αναζήτηση" style={{display:'flex',alignItems:'center',gap:8,height:36,padding:'0 10px 0 12px',borderRadius:18,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',cursor:'pointer',marginRight:4}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <span className="desktop-only" style={{fontSize:11,fontFamily:"'Roboto Mono',monospace",color:'var(--text-tertiary)',border:'1px solid var(--border-subtle)',borderRadius:5,padding:'1px 5px'}}>{kbdHint}</span>
              </button>
              <ThemeToggle />
            </>
          ) : (
            <><div style={{flex:1,fontFamily:"'Inter',sans-serif",fontSize:14,color:'var(--text-secondary)'}}>Δεν έχεις προσθέσει ακίνητο ακόμα</div><ThemeToggle /></>
          )}
        </header>

        {!selected ? (
          <div className="app-content" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{maxWidth:560,width:'100%',textAlign:'center'}}>
              <div style={{width:64,height:64,borderRadius:18,background:'var(--accent-dim)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}>
                <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
              </div>
              <h1 style={{fontFamily:"'Inter',sans-serif",fontSize:26,fontWeight:800,letterSpacing:'-0.02em',color:'var(--text-primary)',margin:'0 0 8px'}}>Καλωσήρθες στο Property OS</h1>
              <p style={{fontFamily:"'Inter',sans-serif",fontSize:14,color:'var(--text-secondary)',lineHeight:1.6,margin:'0 auto 24px',maxWidth:420}}>Πρόσθεσε το πρώτο σου ακίνητο και ξεκλείδωσε αποδόσεις, δαπάνες, λογαριασμούς, φορολογία και διαχείριση ενοικιαστή, όλα σε ένα σημείο.</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,150px),1fr))',gap:12,marginBottom:28,textAlign:'left'}}>
                {[
                  {t:'Αποδόσεις & Φόρος 2026',d:'Μεικτή/καθαρή απόδοση, φόρος βάσει κλίμακας'},
                  {t:'Λογαριασμοί & Ενέργεια',d:'Σύγκριση 11 παρόχων ρεύματος/αερίου'},
                  {t:'Ενοικιαστής & Συμβόλαιο',d:'Πληρωμές, λήξεις, εγγύηση, ιστορικό'},
                ].map((f,i)=>(
                  <div key={i} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:'14px 16px'}}>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>{f.t}</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5}}>{f.d}</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={()=>tryAddProperty()} style={{fontSize:14,height:44,padding:'0 28px'}}>+ Προσθήκη πρώτου ακινήτου</button>
            </div>
          </div>
        ) : (
          <>
            <div className="app-content">
              {['contacts','documents','checklist','inventory'].includes(nav) && (
                <button onClick={()=>setNav('overview')} title="Πίσω στην Επισκόπηση" aria-label="Πίσω στην Επισκόπηση"
                  style={{display:'inline-flex',alignItems:'center',gap:6,marginBottom:14,padding:'4px 4px 4px 0',border:'none',background:'transparent',color:'var(--text-tertiary)',fontFamily:"'Inter',sans-serif",fontSize:13,fontWeight:600,cursor:'pointer'}}
                  onMouseEnter={e=>e.currentTarget.style.color='var(--text-primary)'} onMouseLeave={e=>e.currentTarget.style.color='var(--text-tertiary)'}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                  Επισκόπηση
                </button>
              )}
              {nav==='portfolio' && <PortfolioTab properties={properties} userId={user.id} onSelectProperty={(id)=>{ const p=properties.find(x=>x.id===id); if(p){ setSelected(p); setNav('overview'); } }}/>}
              {nav==='overview'  && <OverviewTab prop={selected} userId={user.id} ownerName={ownerName} onSaveOwnerName={async (n)=>{ setOwnerName(n); await supabase.from('billing_profiles').upsert({ user_id: user.id, owner_name: n.trim() || null }, { onConflict: 'user_id' }); }} onNavigate={(t)=> t==='scan' ? setQuickAddOpen(true) : setNav(t)} onCleanDemo={cleanupDemo} profileType={profileType}/>}
              {nav==='comparison'&& <TabComparison properties={properties} userId={user.id}/>}
              {nav==='finances'  && <TabFinances propertyId={selected.id} userId={user.id} propertyName={selected.name} propertyAddress={selected.address||''} profileType={profileType}/>}
              {nav==='calendar'  && <TabCalendar propertyId={selected.id} userId={user.id}/>}
              {nav==='tenant'    && <TabTenant propertyId={selected.id} userId={user.id} onStartHandover={(tenantName,tenantPhone,type)=>{ setHandoverIntent({tenantName,tenantPhone,type}); setNav('inventory'); }}/>}
              {nav==='roi'       && <TabRentROI propertyId={selected.id} userId={user.id} propertyValue={selected.value??undefined} profileType={profileType}/>}
              {nav==='pricing'   && <TabPricing propertyId={selected.id} userId={user.id} propertyRent={(selected.target_rent??undefined)} propertySqm={selected.sqm??undefined}/>}
              {nav==='loan'      && <TabLoan propertyId={selected.id} userId={user.id} propertyValue={selected.value??undefined} propertyRent={(selected.target_rent??undefined)} propertySqm={selected.sqm??undefined} propertyYearBuilt={selected.year_built??undefined} profileType={profileType}/>}
              {nav==='accounting'&& <TabAccounting propertyId={selected.id} userId={user.id} profileType={profileType}/>}
              {nav==='inventory' && <TabInventory propertyId={selected.id} userId={user.id} profileType={profileType} handoverIntent={handoverIntent} onIntentConsumed={()=>setHandoverIntent(null)} properties={properties}/>}
              {nav==='checklist' && <TabChecklist propertyId={selected.id} userId={user.id} profileType={profileType}/>}
              {nav==='contacts'  && <TabContacts propertyId={selected.id} userId={user.id} profileType={profileType} properties={properties}/>}
              {nav==='clients'   && <TabClients userId={user.id} onSelectProperty={(id)=>{ const p=properties.find(x=>x.id===id); if(p){ setSelected(p); setNav('overview'); } }}/>}
              {nav==='documents' && <TabDocuments propertyId={selected.id} userId={user.id} profileType={profileType}/>}
              {nav==='referral'  && <TabReferral userId={user.id} plan={plan} profileType={profileType}/>}
              {nav==='settings'  && <TabSettings propertyId={selected.id} userId={user.id} profileType={profileType} onProfileChange={setProfileType}/>}
            </div>
          </>
        )}
      </main>

      {/* Κάτω μπάρα πλοήγησης, μόνο σε κινητό (≤768px, μέσω CSS) */}
      {selected && (
        <nav className="bottom-nav">
          {BOTTOM_NAV.map(item => {
            const isActive = item.id !== 'more' && nav === item.id;
            const onTap = item.id === 'more' ? () => setSidebarOpen(true) : () => setNav(item.id);
            const badge = item.id === 'more' && (inventoryAlerts + checklistAlerts) > 0;
            return (
              <button key={item.id} className={`bottom-nav-item ${isActive?'active':''}`} onClick={onTap} style={{position:'relative'}}>
                {badge && <span className="bottom-nav-badge"/>}
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Βοηθός ακινήτου, ορατός σε ΚΑΘΕ καρτέλα, πλωτό κουμπί κάτω δεξιά */}
      {selected&&user&&(
        <PropertyAssistant
          propertyId={selected.id} userId={user.id}
          propContext={{
            name: selected.name,
            propType: PROP_TYPE_LABELS[selected.prop_type||'']||selected.prop_type||undefined,
            address: selected.address||undefined, value: selected.value||undefined,
            sqm: selected.sqm||undefined, status: STATUS_LABELS[selected.status_detail||'']||undefined,
            targetRent: selected.target_rent||undefined,
          }}
          allProperties={properties.map(p=>({
            name: p.name, propType: PROP_TYPE_LABELS[p.prop_type||'']||p.prop_type||undefined,
            value: p.value||undefined, targetRent: p.target_rent||undefined,
            sqm: p.sqm||undefined, status: STATUS_LABELS[p.status_detail||'']||undefined,
          }))}
          onNavigate={(tab)=>setNav(tab)}
          onScan={()=>setQuickAddOpen(true)}
        />
      )}

      <CommandPalette open={cmdkOpen} onClose={()=>setCmdkOpen(false)} items={cmdItems} />

      {quickAddOpen&&user&&selected&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.44)',zIndex:1000,display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'24px 16px',overflowY:'auto'}}
          onClick={e=>{if(e.target===e.currentTarget)closeQuickAdd();}}>
          <div style={{background:'var(--bg-surface)',borderRadius:16,boxShadow:'var(--shadow-lg)',width:'100%',maxWidth:820,margin:'auto',padding:'28px 28px 32px',position:'relative'}}>
            <button onClick={()=>closeQuickAdd()} aria-label="Κλείσιμο"
              style={{position:'absolute',top:16,right:16,width:34,height:34,borderRadius:'50%',border:'none',background:'var(--bg-hover)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-secondary)'}}
              onMouseEnter={e=>e.currentTarget.style.background='var(--bg-elevated)'}
              onMouseLeave={e=>e.currentTarget.style.background='var(--bg-hover)'}>
              <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
            <DocumentScan propertyId={selected.id} userId={user.id} onSaved={async()=>{setScanDraftId(null);await fetchProperties(user.id);}}/>
          </div>
        </div>
      )}

      {showWelcome&&user&&<WelcomeOnboarding userId={user.id}
        onAddProperty={()=>{ setShowWelcome(false); setShowAddModal(true); }}
        onScanCreate={async()=>{
          setShowWelcome(false);
          const { data } = await supabase.from('user_properties').insert({ user_id:user.id, name:'Νέο ακίνητο', prop_type:'apartment', status_detail:'vacant' }).select('*').single();
          await fetchProperties(user.id);
          if (data) { setSelected(data); setScanDraftId(data.id); }
          setNav('overview'); setQuickAddOpen(true);
        }}
        onProfile={setProfileType}
        onDemoReady={async()=>{ setShowWelcome(false); await fetchProperties(user.id); setNav('pricing'); }}
        onClose={()=>setShowWelcome(false)} />}
      {showAddModal&&user&&<AddPropertyWizard userId={user.id} onClose={()=>setShowAddModal(false)} onSaved={async()=>{setShowAddModal(false);await fetchProperties(user.id);}}/>}
      {editProperty&&user&&<AddPropertyWizard userId={user.id} existing={editProperty} onClose={()=>setEditProperty(null)} onSaved={async()=>{setEditProperty(null);await fetchProperties(user.id);}}/>}
      {showCopyInventory&&user&&selected&&<CopyInventoryModal properties={properties} currentPropertyId={selected.id} userId={user.id} onClose={()=>setShowCopyInventory(false)} onCopied={()=>setShowCopyInventory(false)}/>}
      {showUpgrade&&<UpgradeModal currentCount={properties.length} planId={plan} onClose={()=>setShowUpgrade(false)} onManage={()=>{setShowUpgrade(false);setNav('settings');}}/>}
    </div>
  );
}