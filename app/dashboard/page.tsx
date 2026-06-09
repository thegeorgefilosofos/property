'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ThemeSwitcher } from '../ThemeProvider';
import TabExpenses  from './components/TabExpenses';
import TabBills     from './components/TabBills';
import TabCalendar  from './components/TabCalendar';
import TabRentROI   from './components/TabRentROI';
import TabSettings  from './components/TabSettings';
import TabTenant    from './components/TabTenant';
import TabLoan      from './components/TabLoan';
import TabInventory from './components/TabInventory';

// ─── Types ────────────────────────────────────────────────────────────────────
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

// ─── Constants ────────────────────────────────────────────────────────────────
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
  storage:'Αποθήκη Κτ.', villa:'Βίλα', other:'Άλλο',
};
const PROP_TYPES = ['apartment','house','studio','maisonette','office','shop','warehouse','land','parking','storage','villa','other'];
const NAV_ITEMS = [
  { id:'overview',   label:'Επισκόπηση' },
  { id:'bills',      label:'Λογαριασμοί' },
  { id:'calendar',   label:'Ημερολόγιο' },
  { id:'tenant',     label:'Ενοικιαστής' },
  { id:'roi',        label:'Αποδόσεις' },
  { id:'loan',       label:'Δάνειο' },
  { id:'inventory',  label:'Απογραφή' },
  { id:'settings',   label:'Ρυθμίσεις' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n:number|null|undefined, decimals=0) =>
  n == null ? '—' : n.toLocaleString('el-GR', { minimumFractionDigits:decimals, maximumFractionDigits:decimals });
const fmtEur = (n:number|null|undefined) => n == null ? '—' : `${fmt(n)} €`;

// ─── Inventory Alert Hook ─────────────────────────────────────────────────────
function useInventoryAlerts(propertyId: string | null, userId: string | null) {
  const [alertCount, setAlertCount] = useState(0);
  const supabase = createClient();

  useEffect(() => {
    if (!propertyId || !userId) return;
    const check = async () => {
      const { data: items } = await supabase
        .from('inventory_items')
        .select('warranty_expiry, condition, purchase_date')
        .eq('property_id', propertyId);
      const { data: schedules } = await supabase
        .from('inventory_maintenance')
        .select('next_due')
        .eq('property_id', propertyId);
      if (!items) return;
      let count = 0;
      const now = Date.now();
      items.forEach(item => {
        if (item.condition === 'Κακή' || item.condition === 'Εκτός Λειτουργίας') count++;
        if (item.warranty_expiry) {
          const days = Math.ceil((new Date(item.warranty_expiry).getTime() - now) / 86400000);
          if (days >= 0 && days <= 90) count++;
        }
        if (item.purchase_date) {
          const years = (now - new Date(item.purchase_date).getTime()) / (1000*60*60*24*365);
          if (years >= 10) count++; // rough depreciation check
        }
      });
      (schedules||[]).forEach(s => {
        const days = Math.ceil((new Date(s.next_due).getTime() - now) / 86400000);
        if (days < 0) count++;
      });
      setAlertCount(count);
    };
    check();
  }, [propertyId]);

  return alertCount;
}

// ─── Add Property Modal ───────────────────────────────────────────────────────
function AddPropertyModal({ userId, onClose, onSaved }: {
  userId: string; onClose: ()=>void; onSaved: ()=>void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name:'', prop_type:'apartment', address:'', sqm:'',
    value:'', purchase_price:'', target_rent:'', floor:'',
    year_built:'', ownership:'100', status_detail:'vacant',
  });
  const sf = (k:string, v:string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from('user_properties').insert({
      user_id: userId, name: form.name.trim(),
      prop_type: form.prop_type || null, address: form.address || null,
      sqm: form.sqm ? parseFloat(form.sqm) : null,
      value: form.value ? parseFloat(form.value) : null,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
      target_rent: form.target_rent ? parseFloat(form.target_rent) : null,
      floor: form.floor ? parseInt(form.floor) : null,
      year_built: form.year_built ? parseInt(form.year_built) : null,
      ownership: form.ownership ? parseFloat(form.ownership) : 100,
      status_detail: form.status_detail || 'vacant',
    });
    setSaving(false);
    onSaved();
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-accent)',borderRadius:16,padding:28,width:520,maxWidth:'90vw',boxShadow:'var(--shadow-lg)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <div style={{fontSize:18,fontFamily:"'Playfair Display',serif",color:'var(--text-primary)'}}>Νέο Ακίνητο</div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div style={{gridColumn:'1/-1'}}>
            <label className="form-label">Ονομασία Ακινήτου *</label>
            <input className="form-input" value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="π.χ. Αράββου 45"/>
          </div>
          <div>
            <label className="form-label">Τύπος</label>
            <select className="form-select" value={form.prop_type} onChange={e=>sf('prop_type',e.target.value)}>
              {PROP_TYPES.map(t=><option key={t} value={t}>{PROP_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Κατάσταση</label>
            <select className="form-select" value={form.status_detail} onChange={e=>sf('status_detail',e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{gridColumn:'1/-1'}}>
            <label className="form-label">Διεύθυνση</label>
            <input className="form-input" value={form.address} onChange={e=>sf('address',e.target.value)} placeholder="π.χ. Αράββου 45, Αθήνα"/>
          </div>
          <div>
            <label className="form-label">Εμβαδόν (τ.μ.)</label>
            <input className="form-input" type="number" min="0" value={form.sqm} onChange={e=>sf('sqm',e.target.value)} placeholder="35"/>
          </div>
          <div>
            <label className="form-label">Όροφος</label>
            <input className="form-input" type="number" value={form.floor} onChange={e=>sf('floor',e.target.value)} placeholder="2"/>
          </div>
          <div>
            <label className="form-label">Εμπορική Αξία (€)</label>
            <input className="form-input" type="number" min="0" value={form.value} onChange={e=>sf('value',e.target.value)} placeholder="145000"/>
          </div>
          <div>
            <label className="form-label">Τιμή Αγοράς (€)</label>
            <input className="form-input" type="number" min="0" value={form.purchase_price} onChange={e=>sf('purchase_price',e.target.value)} placeholder="120000"/>
          </div>
          <div>
            <label className="form-label">Στόχος Ενοικίου (€)</label>
            <input className="form-input" type="number" min="0" value={form.target_rent} onChange={e=>sf('target_rent',e.target.value)} placeholder="820"/>
          </div>
          <div>
            <label className="form-label">Ποσοστό Ιδιοκτησίας (%)</label>
            <input className="form-input" type="number" min="0" max="100" value={form.ownership} onChange={e=>sf('ownership',e.target.value)} placeholder="100"/>
          </div>
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
          <button className="btn btn-ghost" onClick={onClose}>Ακύρωση</button>
          <button className="btn btn-primary" onClick={save} disabled={saving||!form.name.trim()}>
            {saving?'Αποθήκευση...':'Προσθήκη Ακινήτου'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Copy Inventory Modal ─────────────────────────────────────────────────────
function CopyInventoryModal({properties, currentPropertyId, userId, onClose, onCopied}: {
  properties: Property[]; currentPropertyId: string; userId: string;
  onClose: ()=>void; onCopied: ()=>void;
}) {
  const supabase = createClient();
  const [sourceId, setSourceId] = useState('');
  const [copying, setCopying] = useState(false);
  const [preview, setPreview] = useState<{name:string;category:string}[]>([]);

  const otherProperties = properties.filter(p => p.id !== currentPropertyId);

  useEffect(() => {
    if (!sourceId) { setPreview([]); return; }
    const load = async () => {
      const { data } = await supabase.from('inventory_items').select('name,category').eq('property_id', sourceId).limit(5);
      setPreview(data || []);
    };
    load();
  }, [sourceId]);

  const handleCopy = async () => {
    if (!sourceId) return;
    setCopying(true);
    const { data: sourceItems } = await supabase.from('inventory_items').select('*').eq('property_id', sourceId);
    if (sourceItems && sourceItems.length > 0) {
      const newItems = sourceItems.map(item => ({
        ...item,
        id: undefined,
        property_id: currentPropertyId,
        user_id: userId,
        created_at: undefined,
        updated_at: undefined,
      }));
      await supabase.from('inventory_items').insert(newItems);
    }
    setCopying(false);
    onCopied();
  };

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
      onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:16,padding:24,width:'100%',maxWidth:480,display:'flex',flexDirection:'column',gap:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <p style={{fontSize:15,fontWeight:700,color:'var(--text-primary)',marginBottom:3}}>Αντιγραφή Απογραφής</p>
            <p style={{fontSize:11,color:'var(--text-tertiary)'}}>Χρησιμοποίησε απογραφή άλλου ακινήτου ως βάση</p>
          </div>
          <button onClick={onClose} style={{background:'none',border:'1px solid var(--border-subtle)',borderRadius:8,padding:'4px 10px',cursor:'pointer',color:'var(--text-secondary)',fontSize:12}}>Κλείσιμο</button>
        </div>

        {otherProperties.length === 0 ? (
          <div style={{padding:'20px',textAlign:'center',color:'var(--text-tertiary)'}}>
            <p style={{fontSize:24,marginBottom:8}}>🏠</p>
            <p style={{fontSize:12}}>Δεν υπάρχουν άλλα ακίνητα για αντιγραφή</p>
          </div>
        ) : (
          <>
            <div>
              <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.12em',marginBottom:8,fontWeight:600}}>Πηγή Απογραφής</p>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {otherProperties.map(p => (
                  <div key={p.id} onClick={()=>setSourceId(p.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',borderRadius:10,border:`1px solid ${sourceId===p.id?'var(--accent)':'var(--border-subtle)'}`,background:sourceId===p.id?'var(--accent-dim)':'var(--bg-elevated)',cursor:'pointer',transition:'all 0.15s'}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:STATUS_COLORS[p.status_detail||'']||'var(--text-tertiary)',flexShrink:0}}/>
                    <div>
                      <p style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{p.name}</p>
                      <p style={{fontSize:10,color:'var(--text-tertiary)'}}>{PROP_TYPE_LABELS[p.prop_type||'']||p.prop_type}{p.address?` · ${p.address}`:''}</p>
                    </div>
                    {sourceId===p.id&&<span style={{marginLeft:'auto',fontSize:10,color:'var(--accent)',fontWeight:700}}>✓ Επιλέχθηκε</span>}
                  </div>
                ))}
              </div>
            </div>

            {preview.length > 0 && (
              <div style={{padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:10,border:'1px solid var(--border-subtle)'}}>
                <p style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8,fontWeight:600}}>Προεπισκόπηση ({preview.length}+ αντικείμενα)</p>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {preview.map((item,i) => (
                    <div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-secondary)'}}>
                      <span>{item.name}</span>
                      <span style={{color:'var(--text-tertiary)'}}>{item.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{padding:'10px 14px',background:'rgba(251,146,60,0.08)',borderRadius:10,border:'1px solid var(--warning)25'}}>
              <p style={{fontSize:11,color:'var(--warning)'}}>⚠️ Τα αντικείμενα θα αντιγραφούν χωρίς τα ιστορικά επισκευών και τα πρωτόκολλα παράδοσης. Μπορείτε να επεξεργαστείτε κάθε αντικείμενο μετά την αντιγραφή.</p>
            </div>

            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button onClick={onClose} style={{padding:'9px 18px',borderRadius:10,border:'1px solid var(--border-subtle)',background:'none',color:'var(--text-secondary)',fontSize:12,cursor:'pointer'}}>Ακύρωση</button>
              <button onClick={handleCopy} disabled={!sourceId||copying} style={{padding:'9px 22px',borderRadius:10,background:!sourceId||copying?'var(--border-subtle)':'var(--accent)',border:'none',color:'var(--bg-base)',fontSize:12,fontWeight:700,cursor:!sourceId||copying?'not-allowed':'pointer'}}>
                {copying?'Αντιγραφή...':'📋 Αντιγραφή Απογραφής'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ prop, userId }: { prop: Property; userId: string }) {
  const supabase = createClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [{ data:exp },{ data:bil },{ data:tsk },{ data:ten }] = await Promise.all([
        supabase.from('expenses').select('*').eq('property_id',prop.id).eq('user_id',userId).gte('date',`${year}-01-01`),
        supabase.from('bills').select('*').eq('property_id',prop.id).eq('user_id',userId),
        supabase.from('maintenance_tasks').select('*').eq('property_id',prop.id).eq('user_id',userId).eq('completed',false).order('due_date').limit(5),
        supabase.from('tenants').select('monthly_rent,lease_end').eq('property_id',prop.id).eq('user_id',userId).limit(1),
      ]);
      setExpenses(exp||[]); setBills(bil||[]); setTasks(tsk||[]); setTenant(ten?.[0]||null); setLoading(false);
    };
    fetch();
  }, [prop.id]);

  const totalExpYTD = expenses.reduce((s,e)=>s+e.amount,0);
  const rent = tenant?.monthly_rent || prop.target_rent || 0;
  const annualRent = rent * 12;
  const propValue = prop.value || 0;
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

  if (loading) return <div style={{color:'var(--text-tertiary)',fontSize:12,textAlign:'center',padding:40}}>Φόρτωση...</div>;

  return (
    <div>
      <div className="kpi-grid kpi-grid-5" style={{marginBottom:20}}>
        {[
          { label:'Μηνιαίο Ενοίκιο', value:fmtEur(rent), color:'var(--accent)' },
          { label:'Μεικτή Απόδοση', value:`${grossYield.toFixed(1)}%`, color:'var(--positive)' },
          { label:'Καθαρή Απόδοση', value:`${netYield.toFixed(1)}%`, color:'var(--positive)' },
          { label:'Δαπάνες Έτους', value:fmtEur(totalExpYTD), color:'var(--negative)' },
          {
            label: daysToExpiry!=null ? 'Λήξη Σύμβασης' : 'Αξία Ακινήτου',
            value: daysToExpiry!=null ? (daysToExpiry<0?'Έληξε':`${daysToExpiry} ημ.`) : fmtEur(propValue),
            color: daysToExpiry!=null ? (daysToExpiry<0?'var(--negative)':daysToExpiry<60?'var(--warning)':'var(--text-primary)') : 'var(--text-primary)',
          },
        ].map((k,i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-value" style={{color:k.color}}>{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:16}}>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Δαπάνες {year} ανά μήνα</div>
          <div style={{display:'flex',alignItems:'flex-end',gap:6,height:120}}>
            {monthlyExp.map((v,i) => (
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                <div style={{width:'100%',height:`${(v/maxExp)*100}%`,background:i===month-1?'var(--accent)':'var(--bg-overlay)',borderRadius:'4px 4px 0 0',minHeight:v>0?4:0,transition:'height 0.3s'}}/>
                <div style={{fontSize:9,color:'var(--text-tertiary)',letterSpacing:'0.04em'}}>{MONTHS[i]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Κατηγορίες Δαπανών</div>
          {catEntries.length===0
            ? <div style={{color:'var(--text-tertiary)',fontSize:12,textAlign:'center',padding:'30px 0'}}>Δεν υπάρχουν δαπάνες</div>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {catEntries.map(([cat,amt],i) => (
                  <div key={cat} style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:8,height:8,borderRadius:2,background:catColors[i],flexShrink:0}}/>
                    <div style={{flex:1,fontSize:11,color:'var(--text-secondary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{cat}</div>
                    <div style={{fontSize:11,color:'var(--text-primary)',fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{fmtEur(amt)}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,marginBottom:16}}>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Στοιχεία Ακινήτου</div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <tbody>
              {[
                ['Τύπος', PROP_TYPE_LABELS[prop.prop_type||'']||prop.prop_type],
                ['Εμβαδόν', prop.sqm?`${prop.sqm} τ.μ.`:null],
                ['Διεύθυνση', prop.address],
                ['Αντικ. Αξία', fmtEur(prop.obj_value)],
                ['ΕΠΑ Κλάση', prop.pea_class],
              ].filter(([,v])=>v).map(([k,v],i) => (
                <tr key={i}>
                  <td style={{padding:'6px 0',color:'var(--text-secondary)',width:110,fontSize:11}}>{k}</td>
                  <td style={{padding:'6px 0',color:'var(--text-primary)',fontSize:11,textAlign:'right'}}>{v as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Επόμενες Εργασίες</div>
          {tasks.length===0
            ? <div style={{color:'var(--text-tertiary)',fontSize:12,textAlign:'center',padding:'20px 0'}}>Δεν υπάρχουν εκκρεμείς εργασίες</div>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {tasks.map(t => {
                  const pc = t.priority==='high'?'var(--negative)':t.priority==='medium'?'var(--warning)':'var(--text-tertiary)';
                  return (
                    <div key={t.id} style={{display:'flex',alignItems:'flex-start',gap:10}}>
                      <div style={{width:6,height:6,borderRadius:'50%',background:pc,marginTop:5,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:12,color:'var(--text-primary)',lineHeight:1.3}}>{t.title}</div>
                        {t.due_date&&<div style={{fontSize:10,color:'var(--text-tertiary)',marginTop:2}}>{new Date(t.due_date).toLocaleDateString('el-GR')}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
          }
        </div>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Μέσοι Λογαριασμοί</div>
          {bills.length===0
            ? <div style={{color:'var(--text-tertiary)',fontSize:12,textAlign:'center',padding:'20px 0'}}>Δεν υπάρχουν λογαριασμοί</div>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {bills.slice(0,5).map(b => (
                  <div key={b.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{fontSize:12,color:'var(--text-secondary)'}}>{b.type}</div>
                    <div style={{fontSize:12,color:'var(--text-primary)',fontFamily:"'JetBrains Mono',monospace"}}>{fmtEur(b.avg_amount||b.amount)}</div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      <div className="card">
        <div className="section-label"><span className="section-dot"/> Ετήσιος Απολογισμός {year}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10}}>
          {[
            { label:'Ακαθάριστα Έσοδα', value:fmtEur(annualRent), color:'var(--positive)' },
            { label:'Συνολικές Δαπάνες', value:fmtEur(totalExpYTD), color:'var(--negative)' },
            { label:'Εκτ. Φόρος (15%)', value:fmtEur(annualRent*0.15), color:'var(--warning)' },
            { label:'Καθαρό Αποτέλεσμα', value:fmtEur(annualRent-totalExpYTD-annualRent*0.15), color:'var(--text-primary)' },
            { label:'Καθαρή Απόδοση', value:`${netYield.toFixed(1)}%`, color:'var(--accent)', accent:true },
          ].map((k,i) => (
            <div key={i} style={{textAlign:'center',padding:14,background:(k as any).accent?'var(--accent-dim)':'var(--bg-elevated)',borderRadius:10,border:(k as any).accent?'1px solid var(--border-accent)':'1px solid var(--border-subtle)'}}>
              <div style={{fontSize:18,fontWeight:700,color:k.color,fontFamily:"'JetBrains Mono',monospace",letterSpacing:'-0.5px',marginBottom:6}}>{k.value}</div>
              <div style={{fontSize:10,color:'var(--text-secondary)',letterSpacing:'0.06em',textTransform:'uppercase'}}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
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

  const inventoryAlerts = useInventoryAlerts(selected?.id || null, user?.id || null);

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
    if (!selected || !user) return;
    await supabase.from('user_properties').update({ status_detail: status }).eq('id', selected.id);
    setStatusDropdown(false);
    await fetchProperties(user.id);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg-base)',color:'var(--text-tertiary)',fontSize:12,letterSpacing:'0.14em'}}>
      ΦΟΡΤΩΣΗ...
    </div>
  );

  const userInitials = user?.email?.substring(0,2).toUpperCase() || 'GF';
  const statusColor = selected ? (STATUS_COLORS[selected.status_detail||''] || 'var(--text-secondary)') : 'var(--text-secondary)';
  const statusLabel = selected ? (STATUS_LABELS[selected.status_detail||''] || selected.status_detail) : '';

  return (
    <div className="app-shell">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="app-sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">P</div>
          <span className="sidebar-logo-text">Property OS</span>
          <span className="sidebar-logo-badge">Beta</span>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Ακίνητά μου</div>
          {properties.map(p => (
            <div
              key={p.id}
              className={`prop-item ${selected?.id === p.id ? 'active' : ''}`}
              onClick={() => { setSelected(p); setNav('overview'); }}
            >
              <div className="prop-item-dot" style={{background:STATUS_COLORS[p.status_detail||'']||'var(--text-tertiary)'}}/>
              <span className="prop-item-name">{p.name}</span>
            </div>
          ))}
          <div className="prop-item" onClick={()=>setShowAddModal(true)} style={{opacity:0.5,marginTop:4}}>
            <div style={{width:8,height:8,borderRadius:2,border:'1.5px dashed var(--text-tertiary)',flexShrink:0}}/>
            <span style={{fontSize:12,color:'var(--text-tertiary)'}}>Προσθήκη ακινήτου</span>
          </div>
        </div>

        <div className="sidebar-section" style={{flex:1}}>
          <div className="sidebar-section-label">Πλοήγηση</div>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`sidebar-item ${nav === item.id ? 'active' : ''}`}
              onClick={() => setNav(item.id)}
              disabled={!selected}
              style={{position:'relative'}}
            >
              <span className="sidebar-item-label">{item.label}</span>
              {/* Notification dot για Απογραφή */}
              {item.id === 'inventory' && inventoryAlerts > 0 && (
                <span style={{
                  position:'absolute', top:6, right:8,
                  minWidth:16, height:16, borderRadius:8,
                  background:'var(--negative)', color:'#fff',
                  fontSize:9, fontWeight:700, fontFamily:'Inter,sans-serif',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  padding:'0 4px', letterSpacing:0,
                }}>
                  {inventoryAlerts > 9 ? '9+' : inventoryAlerts}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-row" onClick={signOut} title="Αποσύνδεση">
            <div className="user-avatar">{userInitials}</div>
            <div style={{flex:1,minWidth:0}}>
              <div className="user-name" style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {user?.email?.split('@')[0]}
              </div>
              <div className="user-email">Αποσύνδεση</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="app-main">
        <header className="app-topbar">
          {selected ? (
            <>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:16,fontFamily:"'Playfair Display',serif",fontWeight:500,color:'var(--text-primary)'}}>
                    {selected.name}
                  </span>
                  <div style={{position:'relative'}}>
                    <button
                      onClick={()=>setStatusDropdown(v=>!v)}
                      style={{display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:20,border:`1px solid ${statusColor}44`,background:'transparent',cursor:'pointer',fontSize:11,fontWeight:600,color:statusColor,fontFamily:'Inter,sans-serif'}}
                    >
                      <div style={{width:6,height:6,borderRadius:'50%',background:statusColor}}/>
                      {statusLabel}
                      <span style={{fontSize:9}}>▾</span>
                    </button>
                    {statusDropdown && (
                      <div style={{position:'absolute',top:'calc(100% + 6px)',left:0,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:10,padding:6,zIndex:100,minWidth:160,boxShadow:'var(--shadow-md)'}}>
                        {Object.entries(STATUS_LABELS).map(([k,v]) => (
                          <button key={k} onClick={()=>updateStatus(k)}
                            style={{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'7px 10px',borderRadius:6,border:'none',background:'transparent',cursor:'pointer',fontSize:12,color:'var(--text-primary)',fontFamily:'Inter,sans-serif',textAlign:'left'}}
                            onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-hover)')}
                            onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                          >
                            <div style={{width:7,height:7,borderRadius:'50%',background:STATUS_COLORS[k]||'var(--text-secondary)',flexShrink:0}}/>
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>
                  {[PROP_TYPE_LABELS[selected.prop_type||'']||selected.prop_type, selected.sqm?`${selected.sqm} τ.μ.`:null, selected.address].filter(Boolean).join(' · ')}
                </div>
              </div>
              {/* Copy Inventory button — εμφανίζεται μόνο στο inventory tab */}
              {nav === 'inventory' && properties.length > 1 && (
                <button
                  onClick={()=>setShowCopyInventory(true)}
                  style={{display:'flex',alignItems:'center',gap:6,padding:'6px 12px',borderRadius:8,border:'1px solid var(--border-subtle)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:11,fontWeight:600,cursor:'pointer',marginRight:8}}
                >
                  📋 Αντιγραφή Απογραφής
                </button>
              )}
              <ThemeSwitcher />
            </>
          ) : (
            <>
              <div style={{flex:1,fontSize:14,color:'var(--text-secondary)'}}>Δεν έχεις προσθέσει ακίνητο ακόμα</div>
              <ThemeSwitcher />
            </>
          )}
        </header>

        {!selected ? (
          <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:20}}>
            <div style={{fontSize:40,opacity:0.1}}>🏠</div>
            <div style={{fontSize:14,color:'var(--text-secondary)'}}>Πρόσθεσε το πρώτο σου ακίνητο για να ξεκινήσεις</div>
            <button className="btn btn-primary" onClick={()=>setShowAddModal(true)}>+ Προσθήκη Ακινήτου</button>
          </div>
        ) : (
          <>
            <nav className="app-tabs">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.id}
                  className={`app-tab ${nav === item.id ? 'active' : ''}`}
                  onClick={() => setNav(item.id)}
                  style={{position:'relative'}}
                >
                  {item.label}
                  {item.id === 'inventory' && inventoryAlerts > 0 && nav !== 'inventory' && (
                    <span style={{
                      position:'absolute', top:4, right:2,
                      width:6, height:6, borderRadius:'50%',
                      background:'var(--negative)',
                    }}/>
                  )}
                </button>
              ))}
            </nav>

            <div className="app-content">
              {nav === 'overview'  && <OverviewTab prop={selected} userId={user.id}/>}
              {nav === 'expenses'  && <TabExpenses propertyId={selected.id} userId={user.id}/>}
              {nav === 'bills'     && <TabBills propertyId={selected.id} userId={user.id} propertyName={selected.name} propertyAddress={selected.address||''}/>}
              {nav === 'calendar'  && <TabCalendar propertyId={selected.id} userId={user.id}/>}
              {nav === 'tenant'    && <TabTenant propertyId={selected.id} userId={user.id}/>}
              {nav === 'roi'       && <TabRentROI propertyId={selected.id} userId={user.id} propertyValue={selected.value??undefined}/>}
              {nav === 'loan'      && <TabLoan propertyId={selected.id} userId={user.id}/>}
              {nav === 'inventory' && <TabInventory propertyId={selected.id} userId={user.id}/>}
              {nav === 'settings'  && <TabSettings propertyId={selected.id} userId={user.id}/>}
            </div>
          </>
        )}
      </main>

      {showAddModal && user && (
        <AddPropertyModal userId={user.id} onClose={()=>setShowAddModal(false)} onSaved={async()=>{setShowAddModal(false);await fetchProperties(user.id);}}/>
      )}
      {showCopyInventory && user && selected && (
        <CopyInventoryModal
          properties={properties}
          currentPropertyId={selected.id}
          userId={user.id}
          onClose={()=>setShowCopyInventory(false)}
          onCopied={()=>{setShowCopyInventory(false);}}
        />
      )}
    </div>
  );
}