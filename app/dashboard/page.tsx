'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ThemeToggle } from './components/ThemeToggle';
import TabExpenses  from './components/TabExpenses';
import TabBills     from './components/TabBills';
import TabCalendar  from './components/TabCalendar';
import TabRentROI   from './components/TabRentROI';
import TabSettings  from './components/TabSettings';
import TabTenant    from './components/TabTenant';
import TabLoan      from './components/TabLoan';
import TabInventory from './components/TabInventory';
import TabContacts  from './components/TabContacts';
import TabChecklist from './components/TabChecklist';
import TabDocuments from './components/TabDocuments';
import TabComparison from './components/TabComparison';
import AddPropertyWizard from './components/AddPropertyWizard';
import { useAppPreferences } from './components/useAppPreferences';
import { CommandPalette, type CommandItem } from './components/CommandPalette';
import { SkeletonKPIs, Skeleton } from '@/components/Theme';
import AIInsights from './components/AIInsights';
import PaymentLinks from './components/PaymentLinks';
import { printPropertyStatement } from './components/statement';

interface Property {
  id: string; user_id: string; name: string; prop_type: string | null;
  address: string | null; sqm: number | null; ownership: string | null;
  value: number | null; obj_value: number | null; purchase_price: number | null;
  purchase_date: string | null; target_rent: number | null; enfia: number | null;
  insurance_amount: number | null; insurance_company: string | null;
  insurance_expiry: string | null; pea_class: string | null; year_built: number | null;
  atak: string | null; floor: number | null; heating: string | null;
  notes: string | null; status_detail: string | null; created_at: string;
}
interface Expense  { id:string; amount:number; date:string; category:string; description:string; }
interface Bill     { id:string; type:string; amount:number; avg_amount:number|null; paid:boolean; }
interface Task     { id:string; title:string; due_date:string|null; priority:string; completed:boolean; }
interface Tenant   { monthly_rent:number|null; lease_end:string|null; }

const STATUS_COLORS: Record<string,string> = {
  rented:'var(--positive)', vacant:'var(--warning)', own_use:'var(--info)',
  renovation:'var(--accent)', for_sale:'var(--negative)', seasonal:'var(--info)', disputed:'var(--negative)',
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

const NAV_ITEMS = [
  { id:'overview',   label:'Επισκόπηση' },
  { id:'comparison', label:'Σύγκριση' },
  { id:'bills',      label:'Λογαριασμοί' },
  { id:'expenses',   label:'Δαπάνες' },
  { id:'calendar',   label:'Ημερολόγιο' },
  { id:'tenant',     label:'Ενοικιαστής' },
  { id:'roi',        label:'Αποδόσεις' },
  { id:'loan',       label:'Δάνειο' },
  { id:'inventory',  label:'Απογραφή' },
  { id:'checklist',  label:'Checklist' },
  { id:'contacts',   label:'Επαφές' },
  { id:'documents',  label:'Αρχείο' },
  { id:'settings',   label:'Ρυθμίσεις' },
];

// Κάτω μπάρα κινητού — 5 βασικοί προορισμοί (το «more» ανοίγει το πλήρες μενού)
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
  color:'var(--text-primary)', fontSize:14, fontFamily:"'Google Sans',sans-serif",
  letterSpacing:'0.25px', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s',
};
const mdLabel: React.CSSProperties = {
  display:'block', fontFamily:"'Google Sans',sans-serif", fontSize:12, fontWeight:500,
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

// Add Property Modal — MD3 Dialog
function AddPropertyModal({ userId, onClose, onSaved }: { userId: string; onClose: ()=>void; onSaved: ()=>void; }) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name:'', prop_type:'apartment', address:'', sqm:'', value:'', purchase_price:'', target_rent:'', floor:'', year_built:'', ownership:'100', status_detail:'vacant' });
  const sf = (k:string, v:string) => setForm(f => ({ ...f, [k]: v }));
  const mdSel: React.CSSProperties = { ...mdInput, cursor:'pointer', paddingRight:36, appearance:'none' as any, backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='%235f6368'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E\")", backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center' };

  const save = async () => {
    if (!form.name.trim()) return; setSaving(true);
    await supabase.from('user_properties').insert({
      user_id: userId, name: form.name.trim(), prop_type: form.prop_type||null, address: form.address||null,
      sqm: form.sqm ? parseFloat(form.sqm) : null, value: form.value ? parseFloat(form.value) : null,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
      target_rent: form.target_rent ? parseFloat(form.target_rent) : null,
      floor: form.floor ? parseInt(form.floor) : null, year_built: form.year_built ? parseInt(form.year_built) : null,
      ownership: form.ownership ? parseFloat(form.ownership) : 100, status_detail: form.status_detail||'vacant',
    });
    setSaving(false); onSaved();
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.32)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:24}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--bg-surface)',borderRadius:28,padding:28,width:'100%',maxWidth:520,boxShadow:'var(--shadow-xl)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
          <div>
            <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:24,fontWeight:400,color:'var(--text-primary)',lineHeight:'32px'}}>Νέο Ακίνητο</div>
            <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:14,color:'var(--text-secondary)',marginTop:4,letterSpacing:'0.25px'}}>Βήμα {step} από 2 — {step===1?'Βασικά Στοιχεία':'Οικονομικά'}</div>
          </div>
          <button onClick={onClose} style={{width:40,height:40,borderRadius:20,border:'none',background:'transparent',cursor:'pointer',color:'var(--text-secondary)',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>✕</button>
        </div>
        <div style={{height:4,background:'var(--bg-overlay)',borderRadius:2,marginBottom:24,overflow:'hidden'}}>
          <div style={{height:'100%',width:step===1?'50%':'100%',background:'var(--accent)',borderRadius:2,transition:'width 0.3s'}}/>
        </div>
        {step === 1 ? (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div><label style={mdLabel}>Ονομασία Ακινήτου *</label><input style={mdInput} value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="Παράδειγμα: Αράββου 45" onFocus={focusInput} onBlur={blurInput}/></div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:16}}>
              <div><label style={mdLabel}>Τύπος Ακινήτου</label><select style={mdSel} value={form.prop_type} onChange={e=>sf('prop_type',e.target.value)}>{PROP_TYPES.map(t=><option key={t} value={t}>{PROP_TYPE_LABELS[t]}</option>)}</select></div>
              <div><label style={mdLabel}>Κατάσταση</label><select style={mdSel} value={form.status_detail} onChange={e=>sf('status_detail',e.target.value)}>{Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div><label style={mdLabel}>Διεύθυνση</label><input style={mdInput} value={form.address} onChange={e=>sf('address',e.target.value)} placeholder="Παράδειγμα: Αράββου 45, Βύρωνας" onFocus={focusInput} onBlur={blurInput}/></div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))',gap:16}}>
              <div><label style={mdLabel}>Εμβαδόν (τετραγωνικά μέτρα)</label><input style={mdInput} type="number" value={form.sqm} onChange={e=>sf('sqm',e.target.value)} placeholder="35" onFocus={focusInput} onBlur={blurInput}/></div>
              <div><label style={mdLabel}>Όροφος</label><input style={mdInput} type="number" value={form.floor} onChange={e=>sf('floor',e.target.value)} placeholder="2" onFocus={focusInput} onBlur={blurInput}/></div>
              <div><label style={mdLabel}>Έτος Κατασκευής</label><input style={mdInput} type="number" value={form.year_built} onChange={e=>sf('year_built',e.target.value)} placeholder="1995" onFocus={focusInput} onBlur={blurInput}/></div>
            </div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:16}}>
              <div><label style={mdLabel}>Εμπορική Αξία (€)</label><input style={mdInput} type="number" value={form.value} onChange={e=>sf('value',e.target.value)} placeholder="145.000" onFocus={focusInput} onBlur={blurInput}/></div>
              <div><label style={mdLabel}>Τιμή Αγοράς (€)</label><input style={mdInput} type="number" value={form.purchase_price} onChange={e=>sf('purchase_price',e.target.value)} placeholder="120.000" onFocus={focusInput} onBlur={blurInput}/></div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',gap:16}}>
              <div><label style={mdLabel}>Στόχος Ενοικίου (€/μήνα)</label><input style={mdInput} type="number" value={form.target_rent} onChange={e=>sf('target_rent',e.target.value)} placeholder="820" onFocus={focusInput} onBlur={blurInput}/></div>
              <div><label style={mdLabel}>Ποσοστό Ιδιοκτησίας (%)</label><input style={mdInput} type="number" value={form.ownership} onChange={e=>sf('ownership',e.target.value)} placeholder="100" onFocus={focusInput} onBlur={blurInput}/></div>
            </div>
            {form.value && form.target_rent && (
              <div style={{background:'var(--md-primary-container)',borderRadius:12,padding:'14px 18px'}}>
                <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:12,color:'var(--md-on-primary-container)',marginBottom:4}}>Εκτιμώμενη Μεικτή Απόδοση</div>
                <div style={{fontFamily:"'Roboto Mono',monospace",fontSize:24,fontWeight:400,color:'var(--md-on-primary-container)',fontVariantNumeric:'tabular-nums'}}>{((parseFloat(form.target_rent)*12/parseFloat(form.value))*100).toFixed(1)}%</div>
              </div>
            )}
          </div>
        )}
        <div style={{display:'flex',gap:8,marginTop:24,justifyContent:'flex-end'}}>
          {step === 2 && <button onClick={()=>setStep(1)} style={{height:40,padding:'0 24px',borderRadius:20,border:'none',background:'transparent',color:'var(--accent)',fontFamily:"'Google Sans',sans-serif",fontSize:14,fontWeight:500,cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='var(--accent-dim)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Πίσω</button>}
          <button onClick={step===1?(()=>setStep(2)):save} disabled={saving||!form.name.trim()} style={{height:40,padding:'0 24px',borderRadius:20,border:'none',background:!form.name.trim()?'var(--bg-overlay)':'var(--accent)',color:!form.name.trim()?'var(--text-tertiary)':'var(--accent-text)',fontFamily:"'Google Sans',sans-serif",fontSize:14,fontWeight:500,cursor:!form.name.trim()?'not-allowed':'pointer'}}>
            {step===1?'Συνέχεια':saving?'Αποθήκευση...':'Προσθήκη Ακινήτου'}
          </button>
        </div>
      </div>
    </div>
  );
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
            <p style={{fontFamily:"'Google Sans',sans-serif",fontSize:22,fontWeight:400,color:'var(--text-primary)',marginBottom:4}}>Αντιγραφή Απογραφής</p>
            <p style={{fontFamily:"'Google Sans',sans-serif",fontSize:14,color:'var(--text-secondary)',letterSpacing:'0.25px'}}>Χρησιμοποίησε απογραφή άλλου ακινήτου ως βάση</p>
          </div>
          <button onClick={onClose} style={{width:40,height:40,borderRadius:20,border:'none',background:'transparent',cursor:'pointer',color:'var(--text-secondary)',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>✕</button>
        </div>
        {otherProperties.length === 0 ? (
          <div style={{padding:'32px',textAlign:'center',color:'var(--text-secondary)'}}>
            <p style={{fontSize:32,marginBottom:12}}></p>
            <p style={{fontFamily:"'Google Sans',sans-serif",fontSize:14}}>Δεν υπάρχουν άλλα ακίνητα</p>
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
                      <p style={{fontFamily:"'Google Sans',sans-serif",fontSize:14,fontWeight:500,color:'var(--text-primary)'}}>{p.name}</p>
                      <p style={{fontFamily:"'Google Sans',sans-serif",fontSize:12,color:'var(--text-secondary)'}}>{PROP_TYPE_LABELS[p.prop_type||'']||p.prop_type}{p.address?` · ${p.address}`:''}</p>
                    </div>
                    {sourceId===p.id&&<span style={{marginLeft:'auto',color:'var(--accent)',fontSize:16}}>✓</span>}
                  </div>
                ))}
              </div>
            </div>
            {preview.length > 0 && (
              <div style={{padding:'12px 16px',background:'var(--bg-elevated)',borderRadius:12}}>
                <p style={{...mdLabel,marginBottom:8}}>Προεπισκόπηση ({preview.length}+ αντικείμενα)</p>
                {preview.map((item,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',fontFamily:"'Google Sans',sans-serif",fontSize:13,color:'var(--text-secondary)',marginBottom:4}}><span>{item.name}</span><span style={{color:'var(--text-tertiary)'}}>{item.category}</span></div>)}
              </div>
            )}
            <div style={{padding:'12px 16px',background:'var(--warning-dim)',borderRadius:12}}>
              <p style={{fontFamily:"'Google Sans',sans-serif",fontSize:13,color:'var(--warning)'}}>Τα αντικείμενα θα αντιγραφούν χωρίς ιστορικά επισκευών.</p>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={onClose} style={{height:40,padding:'0 24px',borderRadius:20,border:'none',background:'transparent',color:'var(--accent)',fontFamily:"'Google Sans',sans-serif",fontSize:14,fontWeight:500,cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='var(--accent-dim)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>Ακύρωση</button>
              <button onClick={handleCopy} disabled={!sourceId||copying} style={{height:40,padding:'0 24px',borderRadius:20,border:'none',background:!sourceId||copying?'var(--bg-overlay)':'var(--accent)',color:!sourceId||copying?'var(--text-tertiary)':'var(--accent-text)',fontFamily:"'Google Sans',sans-serif",fontSize:14,fontWeight:500,cursor:!sourceId||copying?'not-allowed':'pointer'}}>{copying?'Αντιγραφή...':'Αντιγραφή'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Overview Tab
function OverviewTab({ prop, userId }: { prop: Property; userId: string }) {
  const supabase = createClient();
  const { prefs } = useAppPreferences(prop.id);
  const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [chk, setChk] = useState<{ due_date:string|null; status:string; priority:string }[]>([]);
  const [inv, setInv] = useState<{ warranty_expiry:string|null; condition:string|null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data:exp },{ data:bil },{ data:tsk },{ data:ten },{ data:ci },{ data:iv }] = await Promise.all([
      supabase.from('expenses').select('*').eq('property_id',prop.id).eq('user_id',userId).gte('date',`${year}-01-01`),
      supabase.from('bills').select('*').eq('property_id',prop.id).eq('user_id',userId),
      supabase.from('maintenance_tasks').select('*').eq('property_id',prop.id).eq('user_id',userId).eq('completed',false).order('due_date').limit(5),
      supabase.from('tenants').select('monthly_rent,lease_end').eq('property_id',prop.id).eq('user_id',userId).limit(1),
      supabase.from('checklist_items').select('due_date,status,priority').eq('property_id',prop.id).neq('status','done').neq('status','skipped'),
      supabase.from('inventory_items').select('warranty_expiry,condition').eq('property_id',prop.id),
    ]);
    setExpenses(exp||[]); setBills(bil||[]); setTasks(tsk||[]); setTenant(ten?.[0]||null);
    setChk(ci||[]); setInv(iv||[]); setLoading(false);
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
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prop.id, load]);

  const totalExpYTD = expenses.reduce((s,e)=>s+e.amount,0);
  const rent = tenant?.monthly_rent || prop.target_rent || 0;
  const annualRent = rent * 12; const propValue = prop.value || 0;
  const grossYield = propValue > 0 ? (annualRent/propValue)*100 : 0;
  const netYield = propValue > 0 ? ((annualRent-totalExpYTD)/propValue)*100 : 0;
  const daysToExpiry = tenant?.lease_end ? Math.ceil((new Date(tenant.lease_end).getTime()-Date.now())/86400000) : null;
  const MONTHS = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
  const monthlyExp = Array(12).fill(0);
  expenses.forEach(e => { monthlyExp[new Date(e.date).getMonth()] += e.amount; });
  const maxExp = Math.max(...monthlyExp, 1);
  const catMap: Record<string,number> = {};
  expenses.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + e.amount; });
  const catEntries = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const catColors = ['var(--accent)','var(--positive)','var(--info)','var(--warning)','var(--negative)'];

  // ── Cross-tab live alerts — επερχόμενα γεγονότα & εκκρεμότητες ──────────────
  const daysUntil = (d: string | null | undefined) => d ? Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000) : null;
  const alerts: { tone: 'negative' | 'warning' | 'info' | 'positive'; label: string; sub?: string }[] = [];
  if (daysToExpiry != null) {
    if (daysToExpiry < 0) alerts.push({ tone:'negative', label:'Η σύμβαση ενοικίασης έχει λήξει', sub:`Έληξε πριν ${Math.abs(daysToExpiry)} ημέρες — απαιτείται ανανέωση` });
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
  const badCond      = inv.filter(i => i.condition === 'Κακή' || i.condition === 'Εκτός Λειτουργίας');
  if (warrantySoon.length) alerts.push({ tone:'info', label:`${warrantySoon.length} εγγυήσεις λήγουν σύντομα`, sub:'Εντός 90 ημερών — δες την Απογραφή' });
  if (badCond.length) alerts.push({ tone:'warning', label:`${badCond.length} αντικείμενα σε κακή κατάσταση`, sub:'Χρειάζονται επισκευή ή αντικατάσταση' });
  if (alerts.length === 0 && !loading) alerts.push({ tone:'positive', label:'Όλα σε τάξη — δεν υπάρχουν εκκρεμότητες', sub:'Καμία επείγουσα ειδοποίηση για αυτό το ακίνητο' });

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
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
        <button onClick={()=>printPropertyStatement({
          propName: prop.name, address: prop.address||undefined,
          propType: PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type||'Ακίνητο',
          status: STATUS_LABELS[prop.status_detail||'']||undefined, year, propValue: propValue||undefined,
          sqm: prop.sqm||undefined, monthlyRent: rent, annualRent, grossYield, netYield,
          expensesYTD: totalExpYTD, categories: catEntries,
        })}
          style={{display:'inline-flex',alignItems:'center',gap:8,height:36,padding:'0 16px',borderRadius:100,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',fontFamily:"'Google Sans',sans-serif",fontSize:12,fontWeight:700,cursor:'pointer'}}
          onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)';}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-secondary)';}}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
          Αναφορά (PDF)
        </button>
      </div>
      <div className="kpi-grid kpi-grid-5" style={{marginBottom:24}}>
        {[
          { label:'Μηνιαίο Ενοίκιο', value:fmtEur(rent), color:'var(--accent)' },
          { label:'Μεικτή Απόδοση', value:`${grossYield.toFixed(1)}%`, color:'var(--positive)' },
          { label:'Καθαρή Απόδοση', value:`${netYield.toFixed(1)}%`, color:'var(--positive)' },
          { label:'Δαπάνες Έτους', value:fmtEur(totalExpYTD), color:'var(--negative)' },
          { label: daysToExpiry!=null?'Λήξη Σύμβασης':'Αξία Ακινήτου', value: daysToExpiry!=null?(daysToExpiry<0?'Έληξε':`${daysToExpiry} ημ.`):fmtEur(propValue), color: daysToExpiry!=null?(daysToExpiry<0?'var(--negative)':daysToExpiry<60?'var(--warning)':'var(--text-primary)'):'var(--text-primary)' },
        ].map((k,i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-value" style={{color:k.color,fontFamily:"'Roboto Mono',monospace",fontVariantNumeric:'tabular-nums'}}>{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Ζωντανές ειδοποιήσεις — ελέγχονται από τις Προτιμήσεις (Ρυθμίσεις) */}
      {prefs.liveNotifications && (
      <div className="card" style={{marginBottom:16}}>
        <div className="section-label"><span className="section-dot"/> Επερχόμενα & Ειδοποιήσεις</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {alerts.map((a,i) => (
            <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,background:`var(--${a.tone}-soft)`,border:`1px solid var(--${a.tone}-border)`,borderRadius:10,padding:'10px 14px'}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:`var(--${a.tone})`,marginTop:6,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:13,fontWeight:500,color:'var(--text-primary)'}}>{a.label}</div>
                {a.sub && <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:11,color:'var(--text-tertiary)',marginTop:2}}>{a.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {prefs.showSmartTips && (
        <AIInsights ctx={{
          propName: prop.name, propType: PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type||'Ακίνητο',
          address: prop.address||undefined, value: propValue||undefined, sqm: prop.sqm||undefined,
          monthlyRent: rent, grossYield, netYield, expensesYTD: totalExpYTD, annualRent,
          daysToLeaseEnd: daysToExpiry, status: STATUS_LABELS[prop.status_detail||'']||undefined,
        }}/>
      )}

      <PaymentLinks />

      <div className="grid-main">
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Δαπάνες {year} ανά μήνα</div>
          <div style={{display:'flex',alignItems:'flex-end',gap:6,height:120}}>
            {monthlyExp.map((v,i) => (
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                <div style={{width:'100%',height:`${(v/maxExp)*100}%`,background:i===month-1?'var(--accent)':'var(--md-surface-container)',borderRadius:'4px 4px 0 0',minHeight:v>0?4:0,transition:'height 0.3s'}}/>
                <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:10,color:'var(--text-tertiary)'}}>{MONTHS[i]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Κατηγορίες Δαπανών</div>
          {catEntries.length===0
            ? <div style={{fontFamily:"'Google Sans',sans-serif",color:'var(--text-tertiary)',fontSize:14,textAlign:'center',padding:'30px 0'}}>Δεν υπάρχουν δαπάνες</div>
            : <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {catEntries.map(([cat,amt],i) => (
                  <div key={cat} style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:8,height:8,borderRadius:2,background:catColors[i],flexShrink:0}}/>
                    <div style={{flex:1,fontFamily:"'Google Sans',sans-serif",fontSize:13,color:'var(--text-secondary)',letterSpacing:'0.25px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{cat}</div>
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
              {[['Τύπος',PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type],['Εμβαδόν',prop.sqm?`${prop.sqm} τετραγωνικά`:null],['Διεύθυνση',prop.address],['Αντικειμενική Αξία',fmtEur(prop.obj_value)],['ΕΠΑ Κλάση',prop.pea_class]].filter(([,v])=>v).map(([k,v],i) => (
                <tr key={i}>
                  <td style={{padding:'8px 0',fontFamily:"'Google Sans',sans-serif",color:'var(--text-secondary)',width:110,fontSize:13,letterSpacing:'0.25px',borderBottom:'1px solid var(--border-subtle)'}}>{k}</td>
                  <td style={{padding:'8px 0',fontFamily:"'Google Sans',sans-serif",color:'var(--text-primary)',fontSize:13,textAlign:'right',letterSpacing:'0.25px',borderBottom:'1px solid var(--border-subtle)'}}>{v as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Επόμενες Εργασίες</div>
          {tasks.length===0
            ? <div style={{fontFamily:"'Google Sans',sans-serif",color:'var(--text-tertiary)',fontSize:14,textAlign:'center',padding:'20px 0'}}>Δεν υπάρχουν εκκρεμείς εργασίες</div>
            : <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {tasks.map(t => { const pc=t.priority==='high'?'var(--negative)':t.priority==='medium'?'var(--warning)':'var(--text-tertiary)'; return (
                  <div key={t.id} style={{display:'flex',alignItems:'flex-start',gap:10}}>
                    <div style={{width:6,height:6,borderRadius:'50%',background:pc,marginTop:6,flexShrink:0}}/>
                    <div>
                      <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:13,color:'var(--text-primary)',lineHeight:'20px'}}>{t.title}</div>
                      {t.due_date&&<div style={{fontFamily:"'Google Sans',sans-serif",fontSize:12,color:'var(--text-tertiary)',marginTop:2}}>{new Date(t.due_date).toLocaleDateString('el-GR')}</div>}
                    </div>
                  </div>
                );})}
              </div>
          }
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Μέσοι Λογαριασμοί</div>
          {bills.length===0
            ? <div style={{fontFamily:"'Google Sans',sans-serif",color:'var(--text-tertiary)',fontSize:14,textAlign:'center',padding:'20px 0'}}>Δεν υπάρχουν λογαριασμοί</div>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {bills.slice(0,5).map(b => (
                  <div key={b.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:13,color:'var(--text-secondary)',letterSpacing:'0.25px'}}>{b.type}</div>
                    <div style={{fontFamily:"'Roboto Mono',monospace",fontSize:13,color:'var(--text-primary)',fontVariantNumeric:'tabular-nums'}}>{fmtEur(b.avg_amount||b.amount)}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      <div className="card">
        <div className="section-label"><span className="section-dot"/> Ετήσιος Απολογισμός {year}</div>
        <div className="grid-5">
          {[
            { label:'Ακαθάριστα Έσοδα', value:fmtEur(annualRent), color:'var(--positive)' },
            { label:'Συνολικές Δαπάνες', value:fmtEur(totalExpYTD), color:'var(--negative)' },
            { label:'Εκτ. Φόρος (15%)', value:fmtEur(annualRent*0.15), color:'var(--warning)' },
            { label:'Καθαρό Αποτέλεσμα', value:fmtEur(annualRent-totalExpYTD-annualRent*0.15), color:'var(--text-primary)' },
            { label:'Καθαρή Απόδοση', value:`${netYield.toFixed(1)}%`, color:'var(--accent)', accent:true },
          ].map((k,i) => { const acc=(k as any).accent; return (
            <div key={i} style={{textAlign:'center',padding:'16px 14px',background:acc?'var(--accent-soft)':'var(--bg-elevated)',border:`1px solid ${acc?'var(--accent-border)':'var(--border-subtle)'}`,borderRadius:14}}>
              <div style={{fontFamily:"'Roboto Mono',monospace",fontSize:20,fontWeight:700,color:acc?'var(--accent)':k.color,marginBottom:8,fontVariantNumeric:'tabular-nums',lineHeight:1}}>{k.value}</div>
              <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:10,fontWeight:600,color:'var(--text-tertiary)',letterSpacing:'0.06em',textTransform:'uppercase'}}>{k.label}</div>
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}

// Main Dashboard
export default function Dashboard() {
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selected, setSelected] = useState<Property | null>(null);
  const [nav, setNav] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCopyInventory, setShowCopyInventory] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);  // συρόμενο μενού σε κινητό/tablet
  const [cmdkOpen, setCmdkOpen] = useState(false);        // command palette (⌘K)

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
      await fetchProperties(user.id);
      setLoading(false);
    };
    init();
  }, []);

  const updateStatus = async (status: string) => {
    if (!selected||!user) return;
    await supabase.from('user_properties').update({ status_detail: status }).eq('id', selected.id);
    setStatusDropdown(false);
    await fetchProperties(user.id);
  };

  const signOut = async () => { await supabase.auth.signOut(); window.location.href = '/login'; };

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg-base)',flexDirection:'column',gap:16}}>
      <div style={{width:48,height:48,borderRadius:'50%',border:'4px solid var(--md-primary-container)',borderTopColor:'var(--accent)',animation:'spin 1s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{fontFamily:"'Google Sans',sans-serif",fontSize:14,color:'var(--text-secondary)',letterSpacing:'0.1px'}}>Φόρτωση...</span>
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
    { id: 'act-add', label: 'Προσθήκη ακινήτου', hint: 'Ενέργεια', keywords: 'new property add', action: () => setShowAddModal(true) },
    { id: 'act-signout', label: 'Αποσύνδεση', hint: 'Ενέργεια', keywords: 'logout sign out exit', action: () => signOut() },
  ];

  return (
    <div className="app-shell">
      {/* Σκίαση πίσω από το συρόμενο μενού (μόνο κινητό/tablet) */}
      <div className={`app-scrim ${sidebarOpen?'open':''}`} onClick={()=>setSidebarOpen(false)}/>
      {/* Sidebar */}
      <aside className={`app-sidebar ${sidebarOpen?'open':''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">P</div>
          <span className="sidebar-logo-text">Property OS</span>
          <span className="sidebar-logo-badge">Beta</span>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-section-label">Ακίνητά μου</div>
          {properties.map(p => (
            <div key={p.id} className={`prop-item ${selected?.id===p.id?'active':''}`} onClick={()=>{setSelected(p);setNav('overview');setSidebarOpen(false);}}>
              <div className="prop-item-dot" style={{background:STATUS_COLORS[p.status_detail||'']||'var(--text-tertiary)'}}/>
              <span className="prop-item-name">{p.name}</span>
            </div>
          ))}
          <button onClick={()=>setShowAddModal(true)}
            style={{display:'flex',alignItems:'center',gap:12,padding:'0 16px',height:40,borderRadius:20,border:'none',background:'transparent',cursor:'pointer',width:'calc(100% - 16px)',margin:'2px 8px',fontFamily:"'Google Sans',sans-serif",fontSize:14,color:'var(--accent)',textAlign:'left'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--accent-dim)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <span style={{fontSize:18,lineHeight:1}}>+</span> Προσθήκη ακινήτου
          </button>
        </div>
        <div className="sidebar-section" style={{flex:1}}>
          <div className="sidebar-section-label">Πλοήγηση</div>
          {NAV_ITEMS.map(item => { const badge=getBadge(item.id); return (
            <button key={item.id} className={`sidebar-item ${nav===item.id?'active':''}`} onClick={()=>{setNav(item.id);setSidebarOpen(false);}} disabled={!selected}>
              <span className="sidebar-item-label">{item.label}</span>
              {badge>0&&<span style={{marginLeft:'auto',minWidth:20,height:20,borderRadius:10,background:'var(--negative)',color:'#fff',fontFamily:"'Google Sans',sans-serif",fontSize:11,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 6px'}}>{badge>9?'9+':badge}</span>}
            </button>
          );})}
        </div>
        <div className="sidebar-footer">
          <div className="user-row" onClick={signOut} title="Αποσύνδεση">
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
                  <span style={{fontFamily:"'Google Sans',sans-serif",fontSize:16,fontWeight:400,color:'var(--text-primary)'}}>{selected.name}</span>
                  <div style={{position:'relative'}}>
                    <button onClick={()=>setStatusDropdown(v=>!v)} style={{display:'flex',alignItems:'center',gap:6,height:32,padding:'0 12px',borderRadius:8,border:`1px solid ${statusColor}44`,background:'transparent',cursor:'pointer',fontFamily:"'Google Sans',sans-serif",fontSize:12,fontWeight:500,color:statusColor}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:statusColor}}/>{statusLabel}<span style={{fontSize:10,opacity:0.7}}>▾</span>
                    </button>
                    {statusDropdown && (
                      <div style={{position:'absolute',top:'calc(100% + 8px)',left:0,background:'var(--bg-surface)',borderRadius:4,padding:'8px 0',zIndex:100,minWidth:180,boxShadow:'var(--shadow-lg)'}}>
                        {Object.entries(STATUS_LABELS).map(([k,v]) => (
                          <button key={k} onClick={()=>updateStatus(k)} style={{display:'flex',alignItems:'center',gap:12,width:'100%',padding:'10px 16px',border:'none',background:'transparent',cursor:'pointer',fontFamily:"'Google Sans',sans-serif",fontSize:14,color:'var(--text-primary)',textAlign:'left'}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <div style={{width:8,height:8,borderRadius:'50%',background:STATUS_COLORS[k]||'var(--text-secondary)',flexShrink:0}}/>{v}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:12,color:'var(--text-secondary)',marginTop:2,letterSpacing:'0.4px'}}>
                  {[PROP_TYPE_LABELS[selected.prop_type||'']||selected.prop_type,selected.sqm?`${selected.sqm} τετραγωνικά`:null,selected.address].filter(Boolean).join(' · ')}
                </div>
              </div>
              {nav==='inventory'&&properties.length>1&&(
                <button onClick={()=>setShowCopyInventory(true)} style={{height:36,padding:'0 16px',borderRadius:18,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',fontFamily:"'Google Sans',sans-serif",fontSize:13,fontWeight:500,cursor:'pointer',marginRight:8}} onMouseEnter={e=>{e.currentTarget.style.background='var(--bg-hover)';e.currentTarget.style.color='var(--text-primary)'}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-secondary)'}}>Αντιγραφή Απογραφής</button>
              )}
              <button onClick={()=>setCmdkOpen(true)} title="Αναζήτηση (⌘K)" aria-label="Αναζήτηση" style={{display:'flex',alignItems:'center',gap:8,height:36,padding:'0 10px 0 12px',borderRadius:18,border:'1px solid var(--border-default)',background:'transparent',color:'var(--text-secondary)',cursor:'pointer',marginRight:4}} onMouseEnter={e=>e.currentTarget.style.background='var(--bg-hover)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <span className="desktop-only" style={{fontSize:11,fontFamily:"'Roboto Mono',monospace",color:'var(--text-tertiary)',border:'1px solid var(--border-subtle)',borderRadius:5,padding:'1px 5px'}}>⌘K</span>
              </button>
              <ThemeToggle />
            </>
          ) : (
            <><div style={{flex:1,fontFamily:"'Google Sans',sans-serif",fontSize:14,color:'var(--text-secondary)'}}>Δεν έχεις προσθέσει ακίνητο ακόμα</div><ThemeToggle /></>
          )}
        </header>

        {!selected ? (
          <div className="app-content" style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
            <div style={{maxWidth:560,width:'100%',textAlign:'center'}}>
              <div style={{width:64,height:64,borderRadius:18,background:'var(--accent-dim)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}>
                <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>
              </div>
              <h1 style={{fontFamily:"'Google Sans',sans-serif",fontSize:26,fontWeight:800,letterSpacing:'-0.02em',color:'var(--text-primary)',margin:'0 0 8px'}}>Καλωσήρθες στο Property OS</h1>
              <p style={{fontFamily:"'Google Sans',sans-serif",fontSize:14,color:'var(--text-secondary)',lineHeight:1.6,margin:'0 auto 24px',maxWidth:420}}>Πρόσθεσε το πρώτο σου ακίνητο και ξεκλείδωσε αποδόσεις, δαπάνες, λογαριασμούς, φορολογία και διαχείριση ενοικιαστή — όλα σε ένα σημείο.</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,150px),1fr))',gap:12,marginBottom:28,textAlign:'left'}}>
                {[
                  {t:'Αποδόσεις & Φόρος 2026',d:'Μεικτή/καθαρή απόδοση, φόρος βάσει κλίμακας'},
                  {t:'Λογαριασμοί & Ενέργεια',d:'Σύγκριση 11 παρόχων ρεύματος/αερίου'},
                  {t:'Ενοικιαστής & Συμβόλαιο',d:'Πληρωμές, λήξεις, εγγύηση, ιστορικό'},
                ].map((f,i)=>(
                  <div key={i} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:'14px 16px'}}>
                    <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:4}}>{f.t}</div>
                    <div style={{fontFamily:"'Google Sans',sans-serif",fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5}}>{f.d}</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={()=>setShowAddModal(true)} style={{fontSize:14,height:44,padding:'0 28px'}}>+ Προσθήκη πρώτου ακινήτου</button>
            </div>
          </div>
        ) : (
          <>
            <nav className="app-tabs">
              {NAV_ITEMS.map(item => { const badge=getBadge(item.id); return (
                <button key={item.id} className={`app-tab ${nav===item.id?'active':''}`} onClick={()=>setNav(item.id)} style={{position:'relative'}}>
                  {item.label}
                  {badge>0&&nav!==item.id&&<span style={{position:'absolute',top:8,right:4,width:8,height:8,borderRadius:'50%',background:'var(--negative)'}}/>}
                </button>
              );})}
            </nav>
            <div className="app-content">
              {nav==='overview'  && <OverviewTab prop={selected} userId={user.id}/>}
              {nav==='comparison'&& <TabComparison properties={properties} userId={user.id}/>}
              {nav==='expenses'  && <TabExpenses propertyId={selected.id} userId={user.id}/>}
              {nav==='bills'     && <TabBills propertyId={selected.id} userId={user.id} propertyName={selected.name} propertyAddress={selected.address||''}/>}
              {nav==='calendar'  && <TabCalendar propertyId={selected.id} userId={user.id}/>}
              {nav==='tenant'    && <TabTenant propertyId={selected.id} userId={user.id}/>}
              {nav==='roi'       && <TabRentROI propertyId={selected.id} userId={user.id} propertyValue={selected.value??undefined}/>}
              {nav==='loan'      && <TabLoan propertyId={selected.id} userId={user.id}/>}
              {nav==='inventory' && <TabInventory propertyId={selected.id} userId={user.id}/>}
              {nav==='checklist' && <TabChecklist propertyId={selected.id} userId={user.id}/>}
              {nav==='contacts'  && <TabContacts propertyId={selected.id} userId={user.id}/>}
              {nav==='documents' && <TabDocuments propertyId={selected.id} userId={user.id}/>}
              {nav==='settings'  && <TabSettings propertyId={selected.id} userId={user.id}/>}
            </div>
          </>
        )}
      </main>

      {/* Κάτω μπάρα πλοήγησης — μόνο σε κινητό (≤768px, μέσω CSS) */}
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

      <CommandPalette open={cmdkOpen} onClose={()=>setCmdkOpen(false)} items={cmdItems} />

      {showAddModal&&user&&<AddPropertyWizard userId={user.id} onClose={()=>setShowAddModal(false)} onSaved={async()=>{setShowAddModal(false);await fetchProperties(user.id);}}/>}
      {showCopyInventory&&user&&selected&&<CopyInventoryModal properties={properties} currentPropertyId={selected.id} userId={user.id} onClose={()=>setShowCopyInventory(false)} onCopied={()=>setShowCopyInventory(false)}/>}
    </div>
  );
}