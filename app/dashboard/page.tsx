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
  id: string;
  user_id: string;
  name: string;
  prop_type: string | null;
  address: string | null;
  sqm: number | null;
  ownership: string | null;
  value: number | null;
  obj_value: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  target_rent: number | null;
  enfia: number | null;
  insurance_amount: number | null;
  insurance_company: string | null;
  insurance_expiry: string | null;
  pea_class: string | null;
  year_built: number | null;
  atak: string | null;
  floor: number | null;
  heating: string | null;
  notes: string | null;
  status_detail: string | null;
  created_at: string;
}

interface Expense  { id:string; amount:number; date:string; category:string; description:string; }
interface Bill     { id:string; type:string; amount:number; avg_amount:number|null; paid:boolean; }
interface Task     { id:string; title:string; due_date:string|null; priority:string; completed:boolean; }
interface Tenant   { monthly_rent:number|null; lease_end:string|null; }

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string,string> = {
  rented:     'var(--positive)',
  vacant:     'var(--warning)',
  own_use:    'var(--info)',
  renovation: 'var(--accent)',
  for_sale:   'var(--negative)',
  seasonal:   'var(--info)',
  disputed:   'var(--negative)',
};
const STATUS_LABELS: Record<string,string> = {
  rented:     'Ενοικιάζεται',
  vacant:     'Κενό',
  own_use:    'Ιδιοχρησία',
  renovation: 'Ανακαίνιση',
  for_sale:   'Προς Πώληση',
  seasonal:   'Εποχιακό',
  disputed:   'Αμφισβητούμενο',
};
const PROP_TYPE_LABELS: Record<string,string> = {
  apartment:'Διαμέρισμα', house:'Μονοκατοικία', studio:'Στούντιο',
  maisonette:'Μεζονέτα', office:'Γραφείο', shop:'Κατάστημα',
  warehouse:'Αποθήκη', land:'Οικόπεδο', parking:'Parking',
  storage:'Αποθήκη Κτ.', villa:'Βίλα', other:'Άλλο'
};
const PROP_TYPES = [
  'apartment','house','studio','maisonette','office',
  'shop','warehouse','land','parking','storage','villa','other'
];
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
  n == null ? '—' : n.toLocaleString('el-GR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtEur = (n:number|null|undefined) =>
  n == null ? '—' : `${fmt(n)} €`;

// ─── Add Property Modal ───────────────────────────────────────────────────────
function AddPropertyModal({ userId, onClose, onSaved }: {
  userId: string; onClose: ()=>void; onSaved: ()=>void;
}) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', prop_type: 'apartment', address: '', sqm: '',
    value: '', purchase_price: '', target_rent: '', floor: '',
    year_built: '', ownership: '100', status_detail: 'vacant',
  });
  const sf = (k:string, v:string) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from('user_properties').insert({
      user_id: userId,
      name: form.name.trim(),
      prop_type: form.prop_type || null,
      address: form.address || null,
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

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const modal: React.CSSProperties = {
    background: 'var(--bg-surface)', border: '1px solid var(--border-accent)',
    borderRadius: '16px', padding: '28px', width: '520px', maxWidth: '90vw',
    boxShadow: 'var(--shadow-lg)',
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modal}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'24px' }}>
          <div>
            <div style={{ fontSize:'18px', fontFamily:"'Playfair Display',serif", color:'var(--text-primary)', marginBottom:'4px' }}>Δώσε τα βασικά στοιχεία</div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="form-label">Ονομασία Ακινήτου *</label>
            <input className="form-input" value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="π.χ. Αράββου 45" />
          </div>
          <div>
            <label className="form-label">Τύπος</label>
            <select className="form-select" value={form.prop_type} onChange={e=>sf('prop_type',e.target.value)}>
              {PROP_TYPES.map(t => <option key={t} value={t}>{PROP_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Κατάσταση</label>
            <select className="form-select" value={form.status_detail} onChange={e=>sf('status_detail',e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label className="form-label">Διεύθυνση</label>
            <input className="form-input" value={form.address} onChange={e=>sf('address',e.target.value)} placeholder="π.χ. Αράββου 45, Αθήνα" />
          </div>
          <div>
            <label className="form-label">Εμβαδόν (τ.μ.)</label>
            <input className="form-input" type="number" min="0" value={form.sqm} onChange={e=>sf('sqm',e.target.value)} placeholder="35" />
          </div>
          <div>
            <label className="form-label">Όροφος</label>
            <input className="form-input" type="number" value={form.floor} onChange={e=>sf('floor',e.target.value)} placeholder="2" />
          </div>
          <div>
            <label className="form-label">Εμπορική Αξία (€)</label>
            <input className="form-input" type="number" min="0" value={form.value} onChange={e=>sf('value',e.target.value)} placeholder="145000" />
          </div>
          <div>
            <label className="form-label">Τιμή Αγοράς (€)</label>
            <input className="form-input" type="number" min="0" value={form.purchase_price} onChange={e=>sf('purchase_price',e.target.value)} placeholder="120000" />
          </div>
          <div>
            <label className="form-label">Στόχος Ενοικίου (€)</label>
            <input className="form-input" type="number" min="0" value={form.target_rent} onChange={e=>sf('target_rent',e.target.value)} placeholder="820" />
          </div>
          <div>
            <label className="form-label">Ποσοστό Ιδιοκτησίας (%)</label>
            <input className="form-input" type="number" min="0" max="100" value={form.ownership} onChange={e=>sf('ownership',e.target.value)} placeholder="100" />
          </div>
        </div>

        <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end', marginTop:'20px' }}>
          <button className="btn btn-ghost" onClick={onClose}>Ακύρωση</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
            {saving ? 'Αποθήκευση...' : 'Προσθήκη Ακινήτου'}
          </button>
        </div>
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
      const [
        { data: exp },
        { data: bil },
        { data: tsk },
        { data: ten },
      ] = await Promise.all([
        supabase.from('expenses').select('*').eq('property_id', prop.id).eq('user_id', userId).gte('date', `${year}-01-01`),
        supabase.from('bills').select('*').eq('property_id', prop.id).eq('user_id', userId),
        supabase.from('maintenance_tasks').select('*').eq('property_id', prop.id).eq('user_id', userId).eq('completed', false).order('due_date').limit(5),
        supabase.from('tenants').select('monthly_rent,lease_end').eq('property_id', prop.id).eq('user_id', userId).limit(1),
      ]);
      setExpenses(exp || []);
      setBills(bil || []);
      setTasks(tsk || []);
      setTenant(ten?.[0] || null);
      setLoading(false);
    };
    fetch();
  }, [prop.id]);

  const totalExpYTD = expenses.reduce((s, e) => s + e.amount, 0);
  const rent = tenant?.monthly_rent || prop.target_rent || 0;
  const annualRent = rent * 12;
  const propValue = prop.value || 0;
  const grossYield = propValue > 0 ? (annualRent / propValue) * 100 : 0;
  const netYield = propValue > 0 ? ((annualRent - totalExpYTD) / propValue) * 100 : 0;
  const daysToExpiry = tenant?.lease_end ? Math.ceil((new Date(tenant.lease_end).getTime() - Date.now()) / 86400000) : null;

  const MONTHS = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
  const monthlyExp = Array(12).fill(0);
  expenses.forEach(e => {
    const m = new Date(e.date).getMonth();
    monthlyExp[m] += e.amount;
  });
  const maxExp = Math.max(...monthlyExp, 1);

  const catMap: Record<string,number> = {};
  expenses.forEach(e => { catMap[e.category] = (catMap[e.category]||0) + e.amount; });
  const catEntries = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const catColors = ['var(--accent)','var(--positive)','var(--info)','var(--warning)','var(--negative)'];

  if (loading) return <div style={{ color:'var(--text-tertiary)', fontSize:'12px', textAlign:'center', padding:'40px' }}>Φόρτωση...</div>;

  return (
    <div>
      <div className="kpi-grid kpi-grid-5" style={{ marginBottom:'20px' }}>
        {[
          { label:'Μηνιαίο Ενοίκιο', value: fmtEur(rent), color:'var(--accent)' },
          { label:'Μεικτή Απόδοση', value: `${grossYield.toFixed(1)}%`, color:'var(--positive)' },
          { label:'Καθαρή Απόδοση', value: `${netYield.toFixed(1)}%`, color:'var(--positive)' },
          { label:'Δαπάνες Έτους', value: fmtEur(totalExpYTD), color:'var(--negative)' },
          {
            label: daysToExpiry != null ? 'Λήξη Σύμβασης' : 'Αξία Ακινήτου',
            value: daysToExpiry != null
              ? (daysToExpiry < 0 ? 'Έληξε' : `${daysToExpiry} ημ.`)
              : fmtEur(propValue),
            color: daysToExpiry != null
              ? (daysToExpiry < 0 ? 'var(--negative)' : daysToExpiry < 60 ? 'var(--warning)' : 'var(--text-primary)')
              : 'var(--text-primary)',
          },
        ].map((k,i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'16px', marginBottom:'16px' }}>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Δαπάνες {year} ανά μήνα</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:'6px', height:'120px' }}>
            {monthlyExp.map((v, i) => (
              <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px' }}>
                <div style={{ width:'100%', height:`${(v/maxExp)*100}%`, background: i===month-1?'var(--accent)':'var(--bg-overlay)', borderRadius:'4px 4px 0 0', minHeight: v>0?'4px':'0', transition:'height 0.3s' }}/>
                <div style={{ fontSize:'9px', color:'var(--text-tertiary)', letterSpacing:'0.04em' }}>{MONTHS[i]}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="section-label"><span className="section-dot"/> Κατηγορίες Δαπανών</div>
          {catEntries.length === 0 ? (
            <div style={{ color:'var(--text-tertiary)', fontSize:'12px', textAlign:'center', padding:'30px 0' }}>Δεν υπάρχουν δαπάνες</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {catEntries.map(([cat, amt], i) => (
                <div key={cat} style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <div style={{ width:'8px', height:'8px', borderRadius:'2px', background:catColors[i], flexShrink:0 }}/>
                  <div style={{ flex:1, fontSize:'11px', color:'var(--text-secondary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cat}</div>
                  <div style={{ fontSize:'11px', color:'var(--text-primary)', fontFamily:"'JetBrains Mono',monospace", flexShrink:0 }}>{fmtEur(amt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', marginBottom:'16px' }}>
        <div className="card">
          <div className="section-label"><span className="section-dot"/> Στοιχεία Ακινήτου</div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
            <tbody>
              {[
                ['Τύπος', PROP_TYPE_LABELS[prop.prop_type||''] || prop.prop_type],
                ['Εμβαδόν', prop.sqm ? `${prop.sqm} τ.μ.` : null],
                ['Διεύθυνση', prop.address],
                ['Αντικ. Αξία', fmtEur(prop.obj_value)],
                ['ΕΠΑ Κλάση', prop.pea_class],
              ].filter(([,v])=>v).map(([k,v],i) => (
                <tr key={i}>
                  <td style={{ padding:'6px 0', color:'var(--text-secondary)', width:'110px', fontSize:'11px' }}>{k}</td>
                  <td style={{ padding:'6px 0', color:'var(--text-primary)', fontSize:'11px', textAlign:'right' }}>{v as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="section-label"><span className="section-dot"/> Επόμενες Εργασίες</div>
          {tasks.length === 0 ? (
            <div style={{ color:'var(--text-tertiary)', fontSize:'12px', textAlign:'center', padding:'20px 0' }}>Δεν υπάρχουν εκκρεμείς εργασίες</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {tasks.map(t => {
                const priorityColor = t.priority==='high'?'var(--negative)':t.priority==='medium'?'var(--warning)':'var(--text-tertiary)';
                return (
                  <div key={t.id} style={{ display:'flex', alignItems:'flex-start', gap:'10px' }}>
                    <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:priorityColor, marginTop:'5px', flexShrink:0 }}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:'12px', color:'var(--text-primary)', lineHeight:1.3 }}>{t.title}</div>
                      {t.due_date && <div style={{ fontSize:'10px', color:'var(--text-tertiary)', marginTop:'2px' }}>{new Date(t.due_date).toLocaleDateString('el-GR')}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-label"><span className="section-dot"/> Μέσοι Λογαριασμοί</div>
          {bills.length === 0 ? (
            <div style={{ color:'var(--text-tertiary)', fontSize:'12px', textAlign:'center', padding:'20px 0' }}>Δεν υπάρχουν λογαριασμοί</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
              {bills.slice(0,5).map(b => (
                <div key={b.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:'12px', color:'var(--text-secondary)' }}>{b.type}</div>
                  <div style={{ fontSize:'12px', color:'var(--text-primary)', fontFamily:"'JetBrains Mono',monospace" }}>{fmtEur(b.avg_amount || b.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="section-label"><span className="section-dot"/> Ετήσιος Απολογισμός {year}</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'10px' }}>
          {[
            { label:'Ακαθάριστα Έσοδα', value: fmtEur(annualRent), color:'var(--positive)' },
            { label:'Συνολικές Δαπάνες', value: fmtEur(totalExpYTD), color:'var(--negative)' },
            { label:'Εκτ. Φόρος (15%)', value: fmtEur(annualRent * 0.15), color:'var(--warning)' },
            { label:'Καθαρό Αποτέλεσμα', value: fmtEur(annualRent - totalExpYTD - annualRent*0.15), color:'var(--text-primary)' },
            { label:'Καθαρή Απόδοση', value: `${netYield.toFixed(1)}%`, color:'var(--accent)', accent: true },
          ].map((k,i) => (
            <div key={i} style={{ textAlign:'center', padding:'14px', background: (k as any).accent ? 'var(--accent-dim)' : 'var(--bg-elevated)', borderRadius:'10px', border: (k as any).accent ? '1px solid var(--border-accent)' : '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize:'18px', fontWeight:700, color:k.color, fontFamily:"'JetBrains Mono',monospace", letterSpacing:'-0.5px', marginBottom:'6px' }}>{k.value}</div>
              <div style={{ fontSize:'10px', color:'var(--text-secondary)', letterSpacing:'0.06em', textTransform:'uppercase' }}>{k.label}</div>
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
  const [statusDropdown, setStatusDropdown] = useState(false);

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
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg-base)', color:'var(--text-tertiary)', fontSize:'12px', letterSpacing:'0.14em' }}>
      ΦΟΡΤΩΣΗ...
    </div>
  );

  const userInitials = user?.email?.substring(0,2).toUpperCase() || 'GF';
  const statusColor = selected ? (STATUS_COLORS[selected.status_detail||''] || 'var(--text-secondary)') : 'var(--text-secondary)';
  const statusLabel = selected ? (STATUS_LABELS[selected.status_detail||''] || selected.status_detail) : '';

  return (
    <div className="app-shell">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
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
              <div className="prop-item-dot" style={{ background: STATUS_COLORS[p.status_detail||''] || 'var(--text-tertiary)' }}/>
              <span className="prop-item-name">{p.name}</span>
            </div>
          ))}
          <div
            className="prop-item"
            onClick={() => setShowAddModal(true)}
            style={{ opacity: 0.5, marginTop:'4px' }}
          >
            <div style={{ width:'8px', height:'8px', borderRadius:'2px', border:'1.5px dashed var(--text-tertiary)', flexShrink:0 }}/>
            <span style={{ fontSize:'12px', color:'var(--text-tertiary)' }}>Προσθήκη ακινήτου</span>
          </div>
        </div>

        <div className="sidebar-section" style={{ flex:1 }}>
          <div className="sidebar-section-label">Πλοήγηση</div>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`sidebar-item ${nav === item.id ? 'active' : ''}`}
              onClick={() => setNav(item.id)}
              disabled={!selected}
            >
              <span className="sidebar-item-label">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-row" onClick={signOut} title="Αποσύνδεση">
            <div className="user-avatar">{userInitials}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="user-name" style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {user?.email?.split('@')[0]}
              </div>
              <div className="user-email">Αποσύνδεση</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="app-main">
        <header className="app-topbar">
          {selected ? (
            <>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <span style={{ fontSize:'16px', fontFamily:"'Playfair Display',serif", fontWeight:500, color:'var(--text-primary)' }}>
                    {selected.name}
                  </span>
                  <div style={{ position:'relative' }}>
                    <button
                      onClick={() => setStatusDropdown(v => !v)}
                      style={{ display:'flex', alignItems:'center', gap:'6px', padding:'4px 10px', borderRadius:'20px', border:`1px solid ${statusColor}44`, background:'transparent', cursor:'pointer', fontSize:'11px', fontWeight:600, color:statusColor, fontFamily:'Inter,sans-serif' }}
                    >
                      <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:statusColor }}/>
                      {statusLabel}
                      <span style={{ fontSize:'9px' }}>▾</span>
                    </button>
                    {statusDropdown && (
                      <div style={{ position:'absolute', top:'calc(100% + 6px)', left:0, background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:'10px', padding:'6px', zIndex:100, minWidth:'160px', boxShadow:'var(--shadow-md)' }}>
                        {Object.entries(STATUS_LABELS).map(([k,v]) => (
                          <button
                            key={k}
                            onClick={() => updateStatus(k)}
                            style={{ display:'flex', alignItems:'center', gap:'8px', width:'100%', padding:'7px 10px', borderRadius:'6px', border:'none', background:'transparent', cursor:'pointer', fontSize:'12px', color:'var(--text-primary)', fontFamily:'Inter,sans-serif', textAlign:'left' }}
                            onMouseEnter={e => (e.currentTarget.style.background='var(--bg-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                          >
                            <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:STATUS_COLORS[k]||'var(--text-secondary)', flexShrink:0 }}/>
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize:'11px', color:'var(--text-secondary)', marginTop:'2px' }}>
                  {[PROP_TYPE_LABELS[selected.prop_type||'']||selected.prop_type, selected.sqm?`${selected.sqm} τ.μ.`:null, selected.address].filter(Boolean).join(' · ')}
                </div>
              </div>
              <ThemeSwitcher />
            </>
          ) : (
            <>
              <div style={{ flex:1, fontSize:'14px', color:'var(--text-secondary)' }}>Δεν έχεις προσθέσει ακίνητο ακόμα</div>
              <ThemeSwitcher />
            </>
          )}
        </header>

        {!selected ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'20px' }}>
            <div style={{ fontSize:'40px', opacity:0.1 }}>🏠</div>
            <div style={{ fontSize:'14px', color:'var(--text-secondary)' }}>Πρόσθεσε το πρώτο σου ακίνητο για να ξεκινήσεις</div>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Προσθήκη Ακινήτου</button>
          </div>
        ) : (
          <>
            <nav className="app-tabs">
              {NAV_ITEMS.map(item => (
                <button
                  key={item.id}
                  className={`app-tab ${nav === item.id ? 'active' : ''}`}
                  onClick={() => setNav(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="app-content">
              {nav === 'overview'   && <OverviewTab prop={selected} userId={user.id} />}
              {nav === 'expenses'   && <TabExpenses  propertyId={selected.id} userId={user.id} />}
              {nav === 'bills'      && <TabBills
                                          propertyId={selected.id}
                                          userId={user.id}
                                          propertyName={selected.name}
                                          propertyAddress={selected.address || ''}
                                        />}
              {nav === 'calendar'   && <TabCalendar  propertyId={selected.id} userId={user.id} />}
              {nav === 'tenant'     && <TabTenant    propertyId={selected.id} userId={user.id} />}
              {nav === 'roi'        && <TabRentROI   propertyId={selected.id} userId={user.id} propertyValue={selected.value ?? undefined} />}
              {nav === 'loan'       && <TabLoan      propertyId={selected.id} userId={user.id} />}
              {nav === 'inventory'  && <TabInventory propertyId={selected.id} userId={user.id} />}
              {nav === 'settings'   && <TabSettings  propertyId={selected.id} userId={user.id} />}
            </div>
          </>
        )}
      </main>

      {showAddModal && user && (
        <AddPropertyModal
          userId={user.id}
          onClose={() => setShowAddModal(false)}
          onSaved={async () => { setShowAddModal(false); await fetchProperties(user.id); }}
        />
      )}
    </div>
  );
}