'use client';

import { useState } from 'react';
import {
  NumberInput, CustomSelect, DatePicker as UIDatePicker,
  Toggle, TextInput, Textarea, ServiceBySelect as UIServiceBySelect,
  SegmentControl, FREQ_OPTIONS,
} from './UIComponents';
import { T } from '@/components/Theme';
import { createClient } from '@/lib/supabase/client';

// ─── Re-exports for TabTenant ─────────────────────────────────────────────────
export { Toggle, NumberInput, TextInput, Textarea, FREQ_OPTIONS };
export { CustomSelect as SelectField };
export { UIDatePicker as DateField };
export { UIServiceBySelect as ServiceBySelect };
export { SegmentControl };

// ─── Colors (shared) ─────────────────────────────────────────────────────────
export const C = {
  bg:'var(--bg-base)', card:'var(--bg-surface)', card2:'var(--bg-elevated)',
  border:'var(--border-subtle)', border2:'var(--border-default)',
  gold:'var(--accent)', goldBg:'var(--accent-dim)',
  green:'var(--positive)', red:'var(--negative)', amber:'var(--warning)',
  text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)',
};

// ─── Types ────────────────────────────────────────────────────────────────────
export type ServiceBy = 'owner' | 'tenant' | 'split';
export type CleaningPkg = 'none' | '2x2h' | '2x3h' | 'custom';
export type LeaseType = 'monthly' | 'biannual' | 'annual' | '18months' | '24months' | '36months' | 'custom';
export type LeaseCategory = 'residential' | 'commercial';
export type PaymentFreq = 'monthly' | 'bimonthly' | 'quarterly';
export type IdDocType = 'Αστυνομική Ταυτότητα' | 'Διαβατήριο' | 'Στρατιωτική Ταυτότητα' | 'Φοιτητικό Πάσο' | 'Άλλο';
export interface StreamingSvc { name: string; cost_owner: number; charged_tenant: number; included: boolean; }
export interface CleaningCfg { package: CleaningPkg; times: number; hours: number; price_per_hour: number; total_owner: number; total_tenant: number; }

// ─── Constants ────────────────────────────────────────────────────────────────
export const LEASE_LABELS: Record<LeaseType, string> = {
  monthly:'Μηνιαίο', biannual:'Εξάμηνο', annual:'Ετήσιο',
  '18months':'18 Μήνες', '24months':'24 Μήνες', '36months':'36 Μήνες', custom:'Προσαρμοσμένο',
};
export const LEASE_MONTHS: Record<LeaseType, number | null> = {
  monthly:1, biannual:6, annual:12, '18months':18, '24months':24, '36months':36, custom:null,
};
export const LEASE_CATEGORY_LABELS: Record<LeaseCategory, string> = {
  residential:'Κατοικία', commercial:'Επαγγελματική',
};
// Τέλος χαρτοσήμου επαγγελματικής μίσθωσης (3,6% επί του μισθώματος).
export const COMMERCIAL_STAMP_DUTY = 0.036;
// Ελάχιστη νόμιμη διάρκεια μίσθωσης (μήνες) ανά τύπο.
export const MIN_LEASE_MONTHS: Record<LeaseCategory, number> = {
  residential:36, commercial:36,
};
export const SERVICE_BY_LABELS: Record<ServiceBy, string> = {
  owner:'Ιδιοκτήτης', tenant:'Ενοικιαστής', split:'50/50',
};
export const ID_DOCS: IdDocType[] = [
  'Αστυνομική Ταυτότητα', 'Διαβατήριο', 'Στρατιωτική Ταυτότητα', 'Φοιτητικό Πάσο', 'Άλλο',
];
export const MONTHS_FULL = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
export const MONTHS_S = ['Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
export const EXTRA_CATS = ['Πρόωρη Αποχώρηση','Φθορά Συσκευής','Φθορά Επίπλου','Καθυστέρηση','Ρεύμα/Νερό','Άλλο'];
export const DEFAULT_STREAMING: StreamingSvc[] = [
  { name:'Netflix', cost_owner:13.99, charged_tenant:13.99, included:false },
  { name:'HBO Max', cost_owner:8.99, charged_tenant:8.99, included:false },
  { name:'Amazon Prime', cost_owner:4.99, charged_tenant:4.99, included:false },
  { name:'Spotify', cost_owner:10.99, charged_tenant:10.99, included:false },
  { name:'YouTube Premium', cost_owner:6.99, charged_tenant:6.99, included:false },
  { name:'Nova / Cosmote TV', cost_owner:19.99, charged_tenant:19.99, included:false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
export const fmt = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toLocaleString('el-GR', { minimumFractionDigits:0, maximumFractionDigits:2 })} €`;
export const fmtD = (d: string | null) =>
  !d ? '—' : new Date(d).toLocaleDateString('el-GR', { day:'2-digit', month:'2-digit', year:'numeric' });
export const daysLeft = (end: string | null) =>
  !end ? null : Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
export const leaseSt = (d: number | null) => {
  if (d == null) return null;
  if (d < 0)   return { label:'Έληξε',    color:'var(--negative)', bg:'var(--negative-dim)' };
  if (d <= 30) return { label:`${d} ημ.`, color:'var(--warning)',  bg:'var(--warning-dim)'  };
  if (d <= 90) return { label:`${d} ημ.`, color:'var(--accent)',   bg:'var(--accent-dim)'   };
  return                { label:'Ενεργό',  color:'var(--positive)', bg:'var(--positive-dim)' };
};
export const calcEnd = (start: string, type: LeaseType, days: number): string => {
  if (!start) return '';
  const d = new Date(start);
  if (type === 'custom') { d.setDate(d.getDate() + days); }
  else { d.setMonth(d.getMonth() + (LEASE_MONTHS[type] || 1)); }
  return d.toISOString().split('T')[0];
};

// ─── Shared styles ────────────────────────────────────────────────────────────
export const s = {
  card:     { background:'var(--bg-surface)',  border:'1px solid var(--border-subtle)',  borderRadius:'12px', padding:'20px', marginBottom:'16px' } as React.CSSProperties,
  cardGold: { background:'var(--bg-surface)',  border:'1px solid var(--border-accent)',  borderRadius:'12px', padding:'20px', marginBottom:'16px' } as React.CSSProperties,
  sec:      { fontSize:'9px', letterSpacing:'0.18em', textTransform:'uppercase' as const, color:'var(--text-secondary)', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' },
  dot:      (c='var(--accent)') => ({ width:'4px', height:'4px', borderRadius:'50%', background:c, flexShrink:0 } as React.CSSProperties),
  divider:  { borderTop:'1px solid var(--border-subtle)', margin:'18px 0' } as React.CSSProperties,
  g2:       { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:'14px' } as React.CSSProperties,
  g3:       { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:'14px' } as React.CSSProperties,
  g4:       { display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:'14px' } as React.CSSProperties,
  badge:    (color: string, bg: string) => ({ display:'inline-flex', alignItems:'center', padding:'3px 9px', borderRadius:'5px', fontSize:'10px', letterSpacing:'0.08em', textTransform:'uppercase' as const, color, background:bg, border:`1px solid ${color}33` } as React.CSSProperties),
  tabBtn:   (a: boolean) => ({ padding:'9px 18px', fontSize:'11px', fontWeight: a ? 600 : 400, letterSpacing:'0.04em', cursor:'pointer', border:'none', background:'transparent', color: a ? 'var(--accent)' : 'var(--text-secondary)', borderBottom:`2px solid ${a ? 'var(--accent)' : 'transparent'}`, fontFamily:T.font.sans, transition:'all 0.15s', whiteSpace:'nowrap' as const } as React.CSSProperties),
  kpi:      { background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'10px', padding:'14px 16px', textAlign:'center' as const } as React.CSSProperties,
  kpiV:     { fontSize:'20px', fontWeight:700, letterSpacing:'-0.5px', lineHeight:1, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' } as React.CSSProperties,
  kpiL:     { fontSize:'9px', letterSpacing:'0.1em', textTransform:'uppercase' as const, color:'var(--text-secondary)', marginTop:'5px' } as React.CSSProperties,
  th:       { fontSize:'9px', letterSpacing:'0.12em', textTransform:'uppercase' as const, color:'var(--text-secondary)', padding:'8px 12px', borderBottom:'1px solid var(--border-subtle)', textAlign:'left' as const, fontWeight:400 } as React.CSSProperties,
  td:       { padding:'10px 12px', borderBottom:'1px solid var(--border-subtle)', color:'var(--text-primary)', fontSize:'12px', verticalAlign:'middle' as const } as React.CSSProperties,
  tdM:      { padding:'10px 12px', borderBottom:'1px solid var(--border-subtle)', color:'var(--text-secondary)', fontSize:'12px', verticalAlign:'middle' as const } as React.CSSProperties,
  btnGold:  { background:'var(--accent)', color:'var(--accent-text)', border:'none', borderRadius:'8px', padding:'9px 18px', fontSize:'12px', letterSpacing:'0.04em', fontFamily:T.font.sans, cursor:'pointer', fontWeight:700 } as React.CSSProperties,
  btnGhost: { background:'transparent', color:'var(--text-secondary)', border:'1px solid var(--border-default)', borderRadius:'8px', padding:'8px 14px', fontSize:'11px', fontFamily:T.font.sans, cursor:'pointer' } as React.CSSProperties,
  btnSm:    { background:'var(--bg-elevated)', color:'var(--accent)', border:'1px solid var(--border-accent)', borderRadius:'7px', padding:'6px 12px', fontSize:'10px', fontFamily:T.font.sans, cursor:'pointer', fontWeight:600 } as React.CSSProperties,
  btnDng:   { background:'transparent', color:'var(--negative)', border:'1px solid var(--negative-dim)', borderRadius:'7px', padding:'6px 12px', fontSize:'10px', fontFamily:T.font.sans, cursor:'pointer' } as React.CSSProperties,
};

// ─── Streaming Configurator ───────────────────────────────────────────────────
export function StreamingConfig({ value, onChange }: { value: StreamingSvc[] | null; onChange: (v: StreamingSvc[]) => void }) {
  const svcs = value || DEFAULT_STREAMING.map(s => ({ ...s }));
  const toggle = (i: number) => onChange(svcs.map((s, idx) => idx === i ? { ...s, included: !s.included } : s));
  const upd = (i: number, field: 'cost_owner' | 'charged_tenant', val: number) =>
    onChange(svcs.map((s, idx) => idx === i ? { ...s, [field]: Math.max(0, val) } : s));

  const inc = svcs.filter(s => s.included);
  const totalOwner = inc.reduce((sum, s) => sum + s.cost_owner, 0);
  const totalTenant = inc.reduce((sum, s) => sum + s.charged_tenant, 0);
  const profit = totalTenant - totalOwner;

  return (
    <div>
      <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'12px' }}>
        {svcs.map((svc, i) => (
          <div key={svc.name} className="svc-cost-row" style={{
            display:'grid', gridTemplateColumns:'auto minmax(0,1fr) 120px 120px',
            alignItems:'center', gap:'12px', padding:'10px 14px',
            background: svc.included ? 'var(--accent-dim)' : 'var(--bg-elevated)',
            border: `1px solid ${svc.included ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
            borderRadius:'10px', transition:'all 0.15s',
          }}>
            <Toggle on={svc.included} onChange={() => toggle(i)} />
            <span style={{ fontSize:'13px', color: svc.included ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{svc.name}</span>
            <NumberInput
              label="Κόστος ιδιοκτήτη"
              value={svc.cost_owner.toString()}
              onChange={v => upd(i, 'cost_owner', parseFloat(v)||0)}
              suffix="€" step={0.01}
            />
            <NumberInput
              label="Χρέωση ενοικιαστή"
              value={svc.charged_tenant.toString()}
              onChange={v => upd(i, 'charged_tenant', parseFloat(v)||0)}
              suffix="€" step={0.01}
            />
          </div>
        ))}
      </div>
      <div style={{ fontSize:'11px', color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.5, marginBottom:'12px' }}>
        το γενικό κόστος και πόσο το χρεώνεις στον ενοικιαστή
      </div>
      {inc.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:'8px', padding:'12px', background:'var(--bg-elevated)', borderRadius:'10px', border:'1px solid var(--border-subtle)' }}>
          {[
            { label:'Κόστος ιδιοκτήτη / μήνα', val:fmt(totalOwner), color:'var(--negative)' },
            { label:'Χρέωση ενοικιαστή / μήνα', val:fmt(totalTenant), color:'var(--accent)' },
            { label:'Αποτέλεσμα / μήνα', val:(profit>=0?'+':'')+fmt(profit), color:profit>=0?'var(--positive)':'var(--negative)' },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ textAlign:'center' }}>
              <div style={{ fontSize:'14px', fontWeight:700, color, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{val}</div>
              <div style={{ fontSize:'9px', color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase', marginTop:'3px' }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cleaning Configurator ────────────────────────────────────────────────────
export function CleaningConfig({ value, onChange }: { value: CleaningCfg | null; onChange: (v: CleaningCfg | null) => void }) {
  const pkg = value?.package || 'none';
  const presets: Record<string, CleaningCfg> = {
    '2x2h': { package:'2x2h', times:2, hours:2, price_per_hour:15, total_owner:60,  total_tenant:60  },
    '2x3h': { package:'2x3h', times:2, hours:3, price_per_hour:15, total_owner:90,  total_tenant:90  },
    'custom':{ package:'custom',times:1,hours:2, price_per_hour:15, total_owner:30,  total_tenant:30  },
  };
  const sel = (p: string) => { if (p === 'none') { onChange(null); return; } onChange({ ...presets[p] }); };
  const upd = (field: keyof CleaningCfg, val: number) => {
    if (!value) return;
    const u = { ...value, [field]: Math.max(0, val) };
    if (field !== 'total_owner' && field !== 'total_tenant') u.total_owner = u.times * u.hours * u.price_per_hour;
    onChange(u);
  };
  const profit = value ? (value.total_tenant - value.total_owner) : 0;

  return (
    <div>
      <div style={{ display:'flex', gap:'6px', marginBottom:'14px', flexWrap:'wrap' }}>
        {[['none','Χωρίς'],['2x2h','Δύο φορές × δύο ώρες / μήνα'],['2x3h','Δύο φορές × τρεις ώρες / μήνα'],['custom','Προσαρμοσμένο']].map(([v,l]) => (
          <button
            key={v}
            onClick={() => sel(v)}
            style={{
              padding:'8px 14px', fontSize:'11px', fontFamily:T.font.sans,
              cursor:'pointer', borderRadius:'8px',
              border:`1px solid ${pkg===v ? 'var(--accent)' : 'var(--border-default)'}`,
              background: pkg===v ? 'var(--accent-dim)' : 'transparent',
              color: pkg===v ? 'var(--accent)' : 'var(--text-secondary)',
              transition:'all 0.15s', fontWeight: pkg===v ? 600 : 400,
            }}
          >{l}</button>
        ))}
      </div>
      {value && value.package !== 'none' && (
        <div style={{ background:'var(--bg-elevated)', padding:'16px', borderRadius:'10px', border:'1px solid var(--border-subtle)' }}>
          <div style={{ ...s.g4, marginBottom:'12px' }}>
            <NumberInput label="Φορές τον μήνα"     value={value.times.toString()}            onChange={v=>upd('times',parseFloat(v)||0)}/>
            <NumberInput label="Ώρες ανά επίσκεψη"  value={value.hours.toString()}            onChange={v=>upd('hours',parseFloat(v)||0)}/>
            <NumberInput label="Τιμή ανά ώρα"       value={value.price_per_hour.toString()}   onChange={v=>upd('price_per_hour',parseFloat(v)||0)} suffix="€" step={0.5}/>
            <NumberInput label="Κόστος ιδιοκτήτη"   value={value.total_owner.toString()}      onChange={v=>upd('total_owner',parseFloat(v)||0)} suffix="€"/>
          </div>
          <div style={s.g2}>
            <NumberInput label="Χρέωση ενοικιαστή" value={value.total_tenant.toString()} onChange={v=>upd('total_tenant',parseFloat(v)||0)} suffix="€"/>
            <div style={{ display:'flex', alignItems:'center', paddingTop:'18px' }}>
              <div style={{ textAlign:'center', flex:1 }}>
                <div style={{ fontSize:'16px', fontWeight:700, color:profit>=0?'var(--positive)':'var(--negative)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>
                  {profit>=0?'+':''}{fmt(profit)}
                </div>
                <div style={{ fontSize:'9px', color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase', marginTop:'3px' }}>Αποτέλεσμα / μήνα</div>
              </div>
            </div>
          </div>
          <div style={{ fontSize:'11px', color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.5, marginTop:'12px' }}>
            το γενικό κόστος και πόσο το χρεώνεις στον ενοικιαστή
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Investment Calculator ────────────────────────────────────────────────────
export function InvestmentCalc({ title, amount }: { title: string; amount: number | null }) {
  const [rate, setRate]   = useState('4');
  const [years, setYears] = useState('1');
  if (!amount || amount <= 0) return null;
  const r = parseFloat(rate) / 100 || 0;
  const y = parseFloat(years) || 1;
  const future = amount * Math.pow(1 + r, y);
  const gain = future - amount;

  return (
    <div style={{ background:'var(--bg-base)', border:'1px solid var(--border-accent)', borderRadius:'10px', padding:'16px', marginTop:'12px' }}>
      <div style={{ fontSize:'9px', letterSpacing:'0.16em', textTransform:'uppercase', color:'var(--accent)', marginBottom:'14px' }}>{title}</div>
      <div style={{ ...s.g2, marginBottom:'12px' }}>
        <NumberInput label="Απόδοση %/έτος" value={rate} onChange={setRate} suffix="%" step={0.1} max={100}/>
        <NumberInput label="Περίοδος (έτη)" value={years} onChange={setYears} suffix="έτη" step={0.5}/>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:'8px', padding:'12px', background:'var(--bg-surface)', borderRadius:'8px', border:'1px solid var(--border-subtle)' }}>
        <div style={{ textAlign:'center' }}><div style={{ fontSize:'14px', fontWeight:700, color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(amount)}</div><div style={{ fontSize:'9px', color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase', marginTop:'3px' }}>Αρχικό Ποσό</div></div>
        <div style={{ textAlign:'center' }}><div style={{ fontSize:'14px', fontWeight:700, color:'var(--positive)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>+{fmt(gain)}</div><div style={{ fontSize:'9px', color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase', marginTop:'3px' }}>Κέρδος ({years} έτη)</div></div>
        <div style={{ textAlign:'center' }}><div style={{ fontSize:'14px', fontWeight:700, color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(future)}</div><div style={{ fontSize:'9px', color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase', marginTop:'3px' }}>Τελικό Ποσό</div></div>
      </div>
    </div>
  );
}

// ─── Prepay Calculator ────────────────────────────────────────────────────────
export function PrepayCalc({ monthlyRent }: { monthlyRent: number | null }) {
  const [months, setMonths] = useState('3');
  const [discount, setDiscount] = useState('3');
  const [invest, setInvest] = useState(false);
  const [rate, setRate]     = useState('4');
  const [years, setYears]   = useState('1');
  if (!monthlyRent || monthlyRent <= 0) return null;

  const m = parseInt(months) || 3;
  const d = parseFloat(discount) / 100 || 0;
  const full = monthlyRent * m;
  const discounted = full * (1 - d);
  const ownerLoss = full - discounted;
  const future = invest ? discounted * Math.pow(1 + (parseFloat(rate)/100||0), parseFloat(years)||1) : discounted;
  const investGain = future - discounted;

  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-accent)', borderRadius:'10px', padding:'16px' }}>
      <div style={{ fontSize:'9px', letterSpacing:'0.16em', textTransform:'uppercase', color:'var(--accent)', marginBottom:'14px' }}>Αναλυτής Προπληρωμής</div>
      <div style={{ ...s.g4, marginBottom:'12px' }}>
        <CustomSelect
          label="Μήνες προπληρωμής"
          value={months}
          onChange={setMonths}
          options={[3,6,12,18,24,36].map(n=>({ value:String(n), label:`${n} μήνες` }))}
        />
        <NumberInput label="Έκπτωση %" value={discount} onChange={setDiscount} suffix="%" step={0.5} max={100}/>
        <div><div style={{ fontSize:'9px', letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom:'5px' }}>Πλήρης Αξία</div><div style={{ fontSize:'16px', fontWeight:700, color:'var(--text-primary)', padding:'9px 0', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(full)}</div></div>
        <div><div style={{ fontSize:'9px', letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-secondary)', marginBottom:'5px' }}>Τελικό Ποσό</div><div style={{ fontSize:'16px', fontWeight:700, color:'var(--accent)', padding:'9px 0', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(discounted)}</div></div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:'8px', padding:'12px', background:'var(--bg-surface)', borderRadius:'8px', border:'1px solid var(--border-subtle)', marginBottom:'14px' }}>
        <div style={{ textAlign:'center' }}><div style={{ fontSize:'14px', fontWeight:700, color:'var(--positive)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(ownerLoss)}</div><div style={{ fontSize:'9px', color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase', marginTop:'3px' }}>Κέρδος Ενοικιαστή</div></div>
        <div style={{ textAlign:'center' }}><div style={{ fontSize:'14px', fontWeight:700, color:'var(--negative)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(ownerLoss)}</div><div style={{ fontSize:'9px', color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase', marginTop:'3px' }}>Χασούρα Ιδιοκτήτη</div></div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:invest?'14px':0 }}>
        <Toggle on={invest} onChange={setInvest} label="Επένδυση του ποσού" />
      </div>
      {invest && (
        <div style={{ ...s.g3 }}>
          <NumberInput label="Απόδοση %/έτος" value={rate} onChange={setRate} suffix="%" step={0.1} max={100}/>
          <NumberInput label="Περίοδος (έτη)" value={years} onChange={setYears} suffix="έτη" step={0.5}/>
          <div style={{ textAlign:'center', paddingTop:'18px' }}>
            <div style={{ fontSize:'16px', fontWeight:700, color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(future)}</div>
            <div style={{ fontSize:'9px', color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase', marginTop:'3px' }}>Τελική Αξία +{fmt(investGain)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CustomSelect re-export (named for TabTenant compatibility) ───────────────
export { CustomSelect };

// ═══════════════════════════════════════════════════════════════════════════
// ΧΡΟΝΟΔΙΑΓΡΑΜΜΑ ΜΙΣΘΩΣΗΣ, συγχρονισμός με Ημερολόγιο + Λίστα Εργασιών
// ---------------------------------------------------------------------------
// Idempotent upsert σε calendar_events + checklist_items με ΣΤΑΘΕΡΟ κλειδί
// ανά εγγραφή, ώστε κανένα διπλότυπο σε επαναλαμβανόμενα ανοίγματα του tab.
//   • calendar_events → κλειδί στη στήλη `source`  (π.χ. tenant:<id>:rent_due)
//   • checklist_items → κλειδί στη στήλη `template_id` (ίδια σύμβαση)
// Το σχήμα insert ταιριάζει ακριβώς με BillsGas/BillsInsurance/TabChecklist.
// ═══════════════════════════════════════════════════════════════════════════
type SupaClient = ReturnType<typeof createClient>;

export interface TenantScheduleInput {
  id: string;
  full_name?: string | null;
  lease_start?: string | null;
  lease_end?: string | null;
  monthly_rent?: number | null;
  deposit_amount?: number | null;
  ac_service_frequency?: string | null;
  solar_service_frequency?: string | null;
  heat_pump_service_frequency?: string | null;
  solar_panels_service_frequency?: string | null;
  pest_control_frequency?: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Μετατόπιση ISO ημερομηνίας κατά n ημέρες (θετικό/αρνητικό). */
export const shiftISO = (iso: string, days: number): string => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoOf(d);
};

/** Επόμενη ετήσια επέτειος (μήνας/ημέρα) του anchor, από σήμερα και μετά. */
export const nextAnniversaryISO = (anchor: string): string => {
  const a = new Date(anchor + 'T00:00:00');
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let y = now.getFullYear();
  let cand = new Date(y, a.getMonth(), a.getDate());
  if (cand < now) { y += 1; cand = new Date(y, a.getMonth(), a.getDate()); }
  return isoOf(cand);
};

/** Επόμενη ημέρα-λήξης ενοικίου (dueDay του μήνα) από σήμερα. */
export const nextRentDueISO = (dueDay: number): string => {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const day = Math.min(Math.max(1, dueDay || 1), 28);
  let cand = new Date(now.getFullYear(), now.getMonth(), day);
  if (cand < now) cand = new Date(now.getFullYear(), now.getMonth() + 1, day);
  return isoOf(cand);
};

const FREQ_TO_INTERVAL: Record<string, string> = {
  monthly: 'monthly', quarterly: 'quarterly', biannual: 'biannual', annual: 'yearly',
};

/**
 * Παράγει τις επιθυμητές εγγραφές ημερολογίου/εργασιών για τη μίσθωση.
 * Καθαρή συνάρτηση (χωρίς I/O) ώστε να είναι εύκολα ελέγξιμη.
 */
export function tenantScheduleRows(
  t: TenantScheduleInput, propertyId: string, userId: string,
  opts: { rentDueDay?: number } = {},
) {
  const name = (t.full_name || 'ενοικιαστή').trim();
  const key = (suffix: string) => `tenant:${t.id}:${suffix}`;
  const events: Record<string, unknown>[] = [];
  const tasks: Record<string, unknown>[] = [];

  const evBase = { property_id: propertyId, user_id: userId, status: 'pending' as const };
  const ckBase = {
    property_id: propertyId, user_id: userId, status: 'pending' as const, completed: false,
    note: null as string | null, estimated_cost: 0, actual_cost: 0, sort_order: 0,
  };

  // 1) Μηνιαία λήξη πληρωμής ενοικίου (επαναλαμβανόμενο, με υπενθύμιση).
  if (t.monthly_rent && t.monthly_rent > 0) {
    events.push({
      ...evBase, source: key('rent_due'), category: 'rent_due',
      title: `Λήξη πληρωμής ενοικίου, ${name}`,
      event_date: nextRentDueISO(opts.rentDueDay ?? 1),
      amount: t.monthly_rent, priority: 'medium', recurring: true, recurring_interval: 'monthly',
      notes: 'Μηνιαία υπενθύμιση είσπραξης ενοικίου. Κατέγραψε την πληρωμή στην καρτέλα «Ενοικιαστής → Πληρωμές».',
    });
  }

  // 2) Λήξη μίσθωσης + ειδοποιήσεις 60/30 ημέρες πριν.
  if (t.lease_end) {
    events.push({
      ...evBase, source: key('lease_end'), category: 'lease_end',
      title: `Λήξη μίσθωσης, ${name}`, event_date: t.lease_end,
      amount: null, priority: 'high', recurring: false, recurring_interval: null,
      notes: 'Λήξη συμβολαίου μίσθωσης. Ανανέωση ή διαδικασία αποχώρησης.',
    });
    events.push({
      ...evBase, source: key('lease_end_60'), category: 'lease_end',
      title: `Λήξη μίσθωσης σε 60 ημέρες, ${name}`, event_date: shiftISO(t.lease_end, -60),
      amount: null, priority: 'medium', recurring: false, recurring_interval: null,
      notes: 'Ξεκίνα διαπραγμάτευση ανανέωσης μίσθωσης εγκαίρως.',
    });
    events.push({
      ...evBase, source: key('lease_end_30'), category: 'lease_end',
      title: `Λήξη μίσθωσης σε 30 ημέρες, ${name}`, event_date: shiftISO(t.lease_end, -30),
      amount: null, priority: 'high', recurring: false, recurring_interval: null,
      notes: 'Κρίσιμο: απόφαση ανανέωσης ή αποχώρησης εντός 30 ημερών.',
    });
    // 3) Επιστροφή εγγύησης στη λήξη.
    if (t.deposit_amount && t.deposit_amount > 0) {
      events.push({
        ...evBase, source: key('deposit_return'), category: 'deposit',
        title: `Επιστροφή εγγύησης, ${name}`, event_date: t.lease_end,
        amount: t.deposit_amount, priority: 'medium', recurring: false, recurring_interval: null,
        notes: 'Επιστροφή εγγύησης στη λήξη, μετά από έλεγχο για φθορές.',
      });
    }
  }

  // 4) Επέτειος αναπροσαρμογής ΔΤΚ (ετήσια, από lease_start).
  if (t.lease_start && t.monthly_rent && t.monthly_rent > 0) {
    events.push({
      ...evBase, source: key('rent_adjust'), category: 'rent_adjustment',
      title: `Αναπροσαρμογή ενοικίου (ΔΤΚ), ${name}`, event_date: nextAnniversaryISO(t.lease_start),
      amount: null, priority: 'low', recurring: true, recurring_interval: 'yearly',
      notes: 'Ετήσια αναπροσαρμογή μισθώματος βάσει ΔΤΚ (ΕΛΣΤΑΤ). Δες «Αναπροσαρμογή Ενοικίου».',
    });
  }

  // 5) Ετήσιες συντηρήσεις βάσει *_service_frequency.
  const services: { keySuffix: string; label: string; freq?: string | null }[] = [
    { keySuffix: 'svc_ac', label: 'κλιματιστικών', freq: t.ac_service_frequency },
    { keySuffix: 'svc_solar', label: 'ηλιακού θερμοσίφωνα', freq: t.solar_service_frequency },
    { keySuffix: 'svc_heatpump', label: 'αντλίας θερμότητας', freq: t.heat_pump_service_frequency },
    { keySuffix: 'svc_pv', label: 'φωτοβολταϊκών', freq: t.solar_panels_service_frequency },
    { keySuffix: 'svc_pest', label: 'απεντόμωσης/μυοκτονίας', freq: t.pest_control_frequency },
  ];
  const anchor = t.lease_start || isoOf(new Date());
  for (const s of services) {
    if (!s.freq) continue;
    const interval = FREQ_TO_INTERVAL[s.freq] || 'yearly';
    events.push({
      ...evBase, source: key(s.keySuffix), category: 'maintenance',
      title: `Συντήρηση ${s.label}`, event_date: nextAnniversaryISO(anchor),
      amount: null, priority: 'low', recurring: true, recurring_interval: interval,
      notes: 'Προγραμματισμένη συντήρηση βάσει των όρων μίσθωσης.',
    });
  }

  // 6) ΑΑΔΕ «Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης» (μία εκκρεμότητα).
  if (t.lease_start) {
    tasks.push({
      ...ckBase, template_id: key('aade_lease_decl'), category: 'legal', priority: 'high',
      recurring: 'none', due_date: shiftISO(t.lease_start, 30),
      description: `ΑΑΔΕ, Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης για ${name}`,
    });
  }
  // 7) Υπενθύμιση ανανέωσης/αποχώρησης ως εργασία (legal).
  if (t.lease_end) {
    tasks.push({
      ...ckBase, template_id: key('lease_renew'), category: 'legal', priority: 'normal',
      recurring: 'none', due_date: shiftISO(t.lease_end, -45),
      description: `Απόφαση ανανέωσης ή αποχώρησης μίσθωσης, ${name}`,
    });
  }

  return { events, tasks };
}

/**
 * Συγχρονισμός μίσθωσης σε Ημερολόγιο + Εργασίες, idempotent.
 * mode='save' → ενημερώνει και ημερομηνίες/ποσά υπαρχόντων events (π.χ. αν άλλαξε
 * η λήξη). mode='open' → μόνο εισάγει ό,τι λείπει. Σφάλματα καταπίνονται (best-effort).
 */
export async function syncTenantSchedule(
  supabase: SupaClient, t: TenantScheduleInput, propertyId: string, userId: string,
  mode: 'save' | 'open' = 'open', opts: { rentDueDay?: number } = {},
): Promise<void> {
  if (!t?.id) return;
  try {
    const { events, tasks } = tenantScheduleRows(t, propertyId, userId, opts);
    const prefix = `tenant:${t.id}:`;

    // ── calendar_events ──
    const { data: exEv } = await supabase
      .from('calendar_events').select('id,source')
      .eq('property_id', propertyId).like('source', `${prefix}%`);
    const evById = new Map<string, string>();
    (exEv || []).forEach((r: { id: string; source: string | null }) => { if (r.source) evById.set(r.source, r.id); });
    const evInsert = events.filter(e => !evById.has(e.source as string));
    if (evInsert.length) await supabase.from('calendar_events').insert(evInsert);
    if (mode === 'save') {
      for (const e of events) {
        const id = evById.get(e.source as string);
        if (!id) continue;
        await supabase.from('calendar_events').update({
          event_date: e.event_date, amount: e.amount, title: e.title, notes: e.notes,
        }).eq('id', id);
      }
    }

    // ── checklist_items (dedup μέσω template_id) ──
    const { data: exCk } = await supabase
      .from('checklist_items').select('template_id')
      .eq('property_id', propertyId).like('template_id', `${prefix}%`);
    const haveCk = new Set((exCk || []).map((r: { template_id: string | null }) => r.template_id));
    const ckInsert = tasks.filter(tk => !haveCk.has(tk.template_id as string));
    if (ckInsert.length) await supabase.from('checklist_items').insert(ckInsert);
  } catch {
    /* best-effort: ο συγχρονισμός δεν πρέπει ποτέ να μπλοκάρει την αποθήκευση */
  }
}