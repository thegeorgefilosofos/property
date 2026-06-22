'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  C, s, fmt, fmtD, daysLeft, leaseSt, calcEnd,
  StreamingConfig, CleaningConfig, InvestmentCalc, PrepayCalc,
  LEASE_LABELS, LEASE_MONTHS, SERVICE_BY_LABELS, ID_DOCS,
  MONTHS_FULL, MONTHS_S, FREQ_OPTIONS, EXTRA_CATS, DEFAULT_STREAMING,
} from './TabTenantHelpers';
import {
  Toggle, NumberInput, TextInput, Textarea,
  CustomSelect as SelectField,
  DatePicker as DateField,
  ServiceBySelect, SegmentControl,
} from './UIComponents';
import type {
  ServiceBy, CleaningPkg, LeaseType, PaymentFreq, IdDocType,
  StreamingSvc, CleaningCfg,
} from './TabTenantHelpers';

interface Tenant {
  id:string; property_id:string; user_id:string;
  full_name:string; email:string|null; phone:string|null; phone_work:string|null;
  afm:string|null; id_doc_type:IdDocType|null; id_doc_number:string|null; iban:string|null; notes:string|null;
  lease_type:LeaseType|null; lease_start:string|null; lease_end:string|null; custom_lease_days:number|null;
  monthly_rent:number|null; payment_frequency:PaymentFreq|null;
  deposit_amount:number|null; deposit_invested:boolean; deposit_returned:boolean; deposit_return_date:string|null;
  deposit_invest_rate:number|null; deposit_invest_type:string|null; deposit_invest_term:string|null;
  all_inclusive:boolean; kwh_limit:number|null; kwh_price:number|null;
  electricity_provider:string|null; electricity_tariff:string|null; electricity_monthly_limit:number|null;
  water_monthly_limit:number|null; internet_provider:string|null; internet_plan:string|null; internet_cost:number|null;
  e_payment:boolean; streaming:StreamingSvc[]|null; cleaning:CleaningCfg|null; extra_perks:string|null;
  welcome_basket:boolean; welcome_basket_amount:number|null; welcome_basket_contents:string|null;
  parking_included:boolean; parking_extra:boolean; parking_extra_price:number|null;
  parking_type:string|null; parking_has_electricity:boolean; parking_notes:string|null;
  ac_service_by:ServiceBy|null; ac_service_frequency:string|null;
  solar_service_by:ServiceBy|null; solar_service_frequency:string|null;
  heat_pump_service_by:ServiceBy|null; heat_pump_service_frequency:string|null;
  solar_panels_service_by:ServiceBy|null; solar_panels_service_frequency:string|null;
  pest_control_by:ServiceBy|null; pest_control_frequency:string|null; annual_services_notes:string|null;
  prepay_option:boolean; prepay_months:number|null; prepay_discount_pct:number|null;
  prepay_invested:boolean; prepay_invest_rate:number|null; prepay_invest_type:string|null; prepay_invest_term:string|null;
  lease_doc_url:string|null; lease_doc_name:string|null; lease_doc_external_url:string|null;
  created_at:string;
}
interface RentPayment { id:string; tenant_id:string; property_id:string; user_id:string; period_month:number; period_year:number; amount:number; paid:boolean; paid_date:string|null; days_late:number|null; notes:string|null; created_at:string; }
interface ExtraCharge { id:string; property_id:string; user_id:string; description:string; amount:number; date:string; paid:boolean; category:string; notes:string|null; created_at:string; }
interface TabTenantProps { propertyId:string; userId:string; }

const blank = () => ({
  full_name:'', email:'', phone:'', phone_work:'', afm:'',
  id_doc_type:'' as IdDocType|'', id_doc_number:'', iban:'', notes:'',
  lease_type:'annual' as LeaseType, lease_start:'', lease_end:'', custom_lease_days:365,
  monthly_rent:'', payment_frequency:'monthly' as PaymentFreq,
  deposit_amount:'', deposit_invested:false, deposit_returned:false, deposit_return_date:'',
  deposit_invest_rate:'', deposit_invest_type:'', deposit_invest_term:'',
  all_inclusive:false, kwh_limit:'', kwh_price:'',
  electricity_provider:'', electricity_tariff:'', electricity_monthly_limit:'',
  water_monthly_limit:'', internet_provider:'', internet_plan:'', internet_cost:'',
  e_payment:true, streaming:null as StreamingSvc[]|null, cleaning:null as CleaningCfg|null, extra_perks:'',
  welcome_basket:false, welcome_basket_amount:'', welcome_basket_contents:'',
  parking_included:false, parking_extra:false, parking_extra_price:'',
  parking_type:'', parking_has_electricity:false, parking_notes:'',
  ac_service_by:'owner' as ServiceBy, ac_service_frequency:'annual',
  solar_service_by:'owner' as ServiceBy, solar_service_frequency:'annual',
  heat_pump_service_by:'owner' as ServiceBy, heat_pump_service_frequency:'annual',
  solar_panels_service_by:'owner' as ServiceBy, solar_panels_service_frequency:'annual',
  pest_control_by:'owner' as ServiceBy, pest_control_frequency:'', annual_services_notes:'',
  prepay_option:false, prepay_months:3, prepay_discount_pct:'',
  prepay_invested:false, prepay_invest_rate:'', prepay_invest_type:'', prepay_invest_term:'',
  lease_doc_external_url:'',
});

function KPIs({ tenant, payments, extras }: { tenant:Tenant; payments:RentPayment[]; extras:ExtraCharge[] }) {
  const d = daysLeft(tenant.lease_end);
  const st = leaseSt(d);
  const streaming = tenant.streaming || [];
  const totalTenant = (tenant.monthly_rent||0) + (tenant.cleaning?.total_tenant||0) + streaming.filter(sv=>sv.included).reduce((sum,sv)=>sum+sv.charged_tenant,0) + (tenant.parking_extra?(tenant.parking_extra_price||0):0);
  const ownerCosts = (tenant.cleaning?.total_owner||0) + streaming.filter(sv=>sv.included).reduce((sum,sv)=>sum+sv.cost_owner,0);
  const unpaid = payments.filter(p=>!p.paid).reduce((a,p)=>a+p.amount,0) + extras.filter(e=>!e.paid).reduce((a,e)=>a+e.amount,0);
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:'10px', marginBottom:'20px' }}>
      {[
        { label:'Βασικό Ενοίκιο', value:fmt(tenant.monthly_rent), color:'var(--accent)' },
        { label:'Σύνολο/μήνα', value:fmt(totalTenant), color:'var(--positive)' },
        { label:'Κόστη Ιδιοκτ.', value:fmt(ownerCosts), color:'var(--negative)' },
        { label:'Λήξη Μίσθωσης', value:d==null?'—':d<0?'Έληξε':`${d} ημ.`, color:st?.color||'var(--text-primary)' },
        { label:'Εκκρεμή Σύνολο', value:fmt(unpaid), color:unpaid>0?'var(--negative)':'var(--positive)' },
        { label:`Εγγύηση${tenant.deposit_invested?' (Επενδ.)':''}`, value:fmt(tenant.deposit_amount), color:tenant.deposit_returned?'var(--positive)':'var(--accent)' },
      ].map((k,i) => (
        <div key={i} style={s.kpi}>
          <div style={{ ...s.kpiV, color:k.color }}>{k.value}</div>
          <div style={s.kpiL}>{k.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── TDE Rent Adjustment View ─────────────────────────────────────────────────
function RentAdjustView({ tenant }: { tenant: Tenant }) {
  const TDE: Record<number,number> = {
    2015:0.0,2016:0.0,2017:1.1,2018:0.8,2019:0.5,
    2020:-1.3,2021:0.6,2022:9.3,2023:4.2,2024:2.8,
  };
  const fmtE = (n:number) => `${n.toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
  const fmtDate = (d:string|null) => d ? new Date(d+'T00:00:00').toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
  const rent = tenant.monthly_rent || 0;
  const leaseEnd = tenant.lease_end;
  const daysExp = leaseEnd ? Math.ceil((new Date(leaseEnd+'T00:00:00').getTime()-Date.now())/86400000) : null;
  const [yr, setYr] = useState(String(new Date().getFullYear()));
  const [useCustom, setUseCustom] = useState(false);
  const [customPct, setCustomPct] = useState('');
  const tde = TDE[parseInt(yr)] ?? 2.8;
  const pct = useCustom ? (parseFloat(customPct)||0) : tde;
  const newRent = rent * (1+pct/100);
  const diff = newRent - rent;
  const isExpired  = daysExp !== null && daysExp < 0;
  const isExpiring = daysExp !== null && daysExp >= 0 && daysExp <= 60;

  const genLetter = () => {
    const today_str = new Date().toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'});
    const w = window.open('','_blank','width=800,height=700');
    if (!w) { alert('Επίτρεψε τα popups'); return; }
    w.document.write(`<!DOCTYPE html><html lang="el"><head>
    <meta charset="UTF-8"><title>Αναπροσαρμογή Μισθώματος</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Google+Sans:wght@400;500;700&display=swap" rel="stylesheet">
    <style>body{font-family:'Roboto',sans-serif;max-width:700px;margin:40px auto;padding:40px;color:#1a1a2e;font-size:13px;line-height:1.8}h1{font-family:'Google Sans',sans-serif;font-size:20px;font-weight:500;color:#1a73e8;margin-bottom:4px}.sub{font-size:11px;color:#5f6368;margin-bottom:32px}table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:10px;border:1px solid #e8eaed}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px}.sign{border-top:1px solid #e8eaed;padding-top:8px;font-size:11px;color:#5f6368}@media print{body{margin:20px;padding:20px}}</style></head><body>
    <h1>Ειδοποίηση Αναπροσαρμογής Μισθώματος</h1>
    <div class="sub">Βάσει ΤΔΕ ${yr} (+${pct.toFixed(1)}%) — Property OS</div>
    <p><strong>Ημερομηνία:</strong> ${today_str}</p>
    <p>Προς: <strong>${tenant.full_name}</strong>${tenant.afm ? '<br>ΑΦΜ: '+tenant.afm : ''}</p>
    <p style="margin-top:16px">Βάσει ΤΔΕ <strong>${yr}</strong>, το μηνιαίο μίσθωμα αναπροσαρμόζεται:</p>
    <table>
      <tr style="background:#f8f9fa"><td><strong>Τρέχον μίσθωμα</strong></td><td style="text-align:right;font-family:monospace">${fmtE(rent)}/μήνα</td></tr>
      <tr><td>ΤΔΕ ${yr}</td><td style="text-align:right">+${pct.toFixed(1)}%</td></tr>
      <tr style="background:#e6f4ea"><td><strong>Νέο μίσθωμα</strong></td><td style="text-align:right;font-family:monospace;color:#137333;font-weight:700">${fmtE(newRent)}/μήνα</td></tr>
    </table>
    <div class="grid2">
      <div class="sign"><p><strong>Ο Εκμισθωτής</strong></p><p>________________</p></div>
      <div class="sign"><p><strong>Ο Μισθωτής</strong></p><p>${tenant.full_name}</p>${tenant.afm?'<p>ΑΦΜ: '+tenant.afm+'</p>':''}</div>
    </div>
    <div style="margin-top:40px;font-size:10px;color:#9aa0a6;text-align:center">Property OS — Εκτίμηση, συμβουλευτείτε νομικό</div>
    </body></html>`);
    w.document.close(); setTimeout(()=>w.print(),700);
  };

  return (
    <div>
      {(isExpired||isExpiring) && (
        <div style={{ background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',
          borderLeft:`3px solid ${isExpired?'var(--negative)':'var(--warning)'}`,
          borderRadius:8,padding:'10px 16px',marginBottom:14,fontSize:12,
          color:isExpired?'var(--negative)':'var(--warning)',
          fontFamily:"'Google Sans',sans-serif",fontWeight:500 }}>
          {isExpired
            ? `Το μισθωτήριο έληξε στις ${fmtDate(leaseEnd)} — ανανέωσε άμεσα`
            : `Λήγει σε ${daysExp} μέρες (${fmtDate(leaseEnd)}) — προετοίμασε ανανέωση`}
        </div>
      )}

      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16 }}>
        {/* Left: Calculator */}
        <div style={s.card}>
          <div style={s.sec}><span style={s.dot()}/>Υπολογιστής ΤΔΕ</div>

          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10,letterSpacing:'0.5px',textTransform:'uppercase' as const,color:'var(--text-secondary)',fontFamily:"'Google Sans',sans-serif",marginBottom:6,fontWeight:500 }}>Τρέχον Ενοίκιο</div>
            <div style={{ fontSize:26,fontWeight:700,color:'var(--text-primary)',fontFamily:"'JetBrains Mono',monospace",marginBottom:2 }}>{fmtE(rent)}</div>
            <div style={{ fontSize:11,color:'var(--text-tertiary)',fontFamily:"Inter,sans-serif" }}>Λήξη: {fmtDate(leaseEnd)}</div>
          </div>

          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',fontFamily:"Inter,sans-serif",marginBottom:8 }}>Έτος Αναπροσαρμογής</div>
            <select value={yr} onChange={e=>setYr(e.target.value)}
              style={{ width:'100%',height:40,background:'var(--bg-elevated)',border:'1px solid var(--border-default)',
                borderRadius:6,padding:'0 12px',color:'var(--text-primary)',fontSize:12,
                fontFamily:"Inter,sans-serif",outline:'none' }}>
              {Object.keys(TDE).sort((a,b)=>parseInt(b)-parseInt(a)).map(y=>(
                <option key={y} value={y}>{y} — ΤΔΕ: {TDE[parseInt(y)]>=0?'+':''}{TDE[parseInt(y)]}%</option>
              ))}
            </select>
          </div>

          <div style={{ display:'flex',alignItems:'center',gap:10,marginBottom:12 }}>
            <span style={{ fontSize:12,color:'var(--text-primary)',fontFamily:"Inter,sans-serif" }}>Προσαρμοσμένο ποσοστό</span>
            <Toggle on={useCustom} onChange={setUseCustom} size="sm"/>
          </div>
          {useCustom && (
            <div style={{ marginBottom:14 }}>
              <input type="number" value={customPct} onChange={e=>setCustomPct(e.target.value)}
                placeholder="π.χ. 3.5" step="0.1"
                style={{ width:'100%',height:40,background:'var(--bg-elevated)',border:'1px solid var(--accent)',
                  borderRadius:6,padding:'0 12px',color:'var(--text-primary)',fontSize:14,
                  fontFamily:"'JetBrains Mono',monospace",outline:'none',boxSizing:'border-box' as const }}/>
            </div>
          )}

          <div style={{ fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',fontFamily:"Inter,sans-serif",marginBottom:8 }}>
            Ιστορικό ΤΔΕ (ΕΛΣΤΑΤ)
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4 }}>
            {Object.entries(TDE).sort(([a],[b])=>parseInt(b)-parseInt(a)).slice(0,10).map(([year,rate])=>(
              <div key={year} onClick={()=>{setYr(year);setUseCustom(false);}}
                style={{ background:parseInt(year)===parseInt(yr)?'var(--accent-dim)':'var(--bg-elevated)',
                  border:`1px solid ${parseInt(year)===parseInt(yr)?'var(--accent)':'var(--border-subtle)'}`,
                  borderRadius:6,padding:'5px 4px',textAlign:'center' as const,cursor:'pointer' }}>
                <div style={{ fontSize:10,fontWeight:600,
                  color:parseInt(year)===parseInt(yr)?'var(--accent)':'var(--text-primary)',
                  fontFamily:"'JetBrains Mono',monospace" }}>
                  {rate>=0?'+':''}{rate}%
                </div>
                <div style={{ fontSize:8,color:'var(--text-tertiary)',fontFamily:"Inter,sans-serif" }}>{year}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Results */}
        <div>
          {rent > 0 ? (
            <>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14 }}>
                <div style={{ background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'14px 16px' }}>
                  <div style={{ fontSize:10,color:'var(--text-secondary)',fontFamily:"Inter,sans-serif",marginBottom:4 }}>Τρέχον</div>
                  <div style={{ fontSize:16,fontWeight:700,color:'var(--text-primary)',fontFamily:"'JetBrains Mono',monospace" }}>{fmtE(rent)}</div>
                </div>
                <div style={{ background:'var(--positive-dim)',border:'1px solid var(--positive)',borderRadius:10,padding:'14px 16px' }}>
                  <div style={{ fontSize:10,color:'var(--text-secondary)',fontFamily:"Inter,sans-serif",marginBottom:4 }}>Νέο Ενοίκιο</div>
                  <div style={{ fontSize:16,fontWeight:700,color:'var(--positive)',fontFamily:"'JetBrains Mono',monospace" }}>{fmtE(newRent)}</div>
                </div>
              </div>

              <div style={s.card}>
                {[
                  {label:`ΤΔΕ ${yr}`,value:`+${pct.toFixed(1)}%`,color:'var(--info)'},
                  {label:'Αύξηση/μήνα',value:`+${fmtE(diff)}`,color:'var(--positive)'},
                  {label:'Αύξηση/έτος',value:`+${fmtE(diff*12)}`,color:'var(--positive)'},
                ].map((row,i)=>(
                  <div key={i} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize:12,color:'var(--text-secondary)',fontFamily:"Inter,sans-serif" }}>{row.label}</span>
                    <span style={{ fontSize:13,fontWeight:600,color:row.color,fontFamily:"'JetBrains Mono',monospace" }}>{row.value}</span>
                  </div>
                ))}
              </div>

              <button onClick={genLetter}
                style={{ width:'100%',height:44,borderRadius:22,border:'none',
                  background:'var(--accent)',color:'var(--accent-text)',cursor:'pointer',fontSize:12,
                  fontFamily:"Inter,sans-serif",fontWeight:700,letterSpacing:'0.04em',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:8,marginBottom:10 }}>
                Εκτύπωση Ειδοποίησης Αναπροσαρμογής
              </button>
            </>
          ) : (
            <div style={{ ...s.card,textAlign:'center' as const,padding:48 }}>
              <div style={{ fontSize:12,color:'var(--text-tertiary)',fontFamily:"Inter,sans-serif" }}>
                Καταχώρησε ενοίκιο για να υπολογίσεις αναπροσαρμογή
              </div>
            </div>
          )}

          {/* AADE Links */}
          <div style={s.card}>
            <div style={s.sec}><span style={s.dot()}/>Υποχρεώσεις & Σύνδεσμοι</div>
            {[
              {label:'Καταχώρηση Μισθωτηρίου AADE',desc:'Εντός 30 ημερών από υπογραφή',url:'https://www.aade.gr/polites/foroi/misthotiria',urgent:true},
              {label:'Ε2 — Δήλωση Εισοδήματος',desc:'30 Ιουνίου κάθε χρόνο',url:'https://www.aade.gr',urgent:false},
              {label:'Πρότυπο Σύμβασης ΑΕΠΠ',desc:'Επίσημο πρότυπο μισθωτηρίου',url:'https://www.aade.gr/polites/foroi/misthotiria/protypo',urgent:false},
            ].map((link,i)=>(
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                style={{ display:'flex',alignItems:'center',gap:10,padding:'9px 10px',marginBottom:6,
                  background:link.urgent?'var(--negative-dim)':'var(--bg-elevated)',
                  border:`1px solid ${link.urgent?'var(--negative)':'var(--border-subtle)'}`,
                  borderRadius:8,textDecoration:'none' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12,fontWeight:600,color:link.urgent?'var(--negative)':'var(--text-primary)',fontFamily:"Inter,sans-serif" }}>{link.label}</div>
                  <div style={{ fontSize:10,color:'var(--text-tertiary)',fontFamily:"Inter,sans-serif" }}>{link.desc}</div>
                </div>
                <span style={{ fontSize:11,color:'var(--accent)' }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TabTenant({ propertyId, userId }: TabTenantProps) {
  const supabase = createClient();
  const [tenant,   setTenant]   = useState<Tenant|null>(null);
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [extras,   setExtras]   = useState<ExtraCharge[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [uploading,setUploading]= useState(false);
  const [isForm,   setIsForm]   = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formTab,  setFormTab]  = useState<'profile'|'lease'|'services'|'parking'|'docs'>('profile');
  const [viewTab,  setViewTab]  = useState<'profile'|'lease'|'services'|'rentadjust'|'payments'|'extras'|'docs'>('profile');
  const [addPay,   setAddPay]   = useState(false);
  const [addExtra, setAddExtra] = useState(false);
  const [error,    setError]    = useState<string|null>(null);
  const [ok,       setOk]       = useState<string|null>(null);
  const [form,     setForm]     = useState(blank());
  const [payF, setPayF] = useState({ period_month:new Date().getMonth()+1, period_year:new Date().getFullYear(), amount:'', paid:true, paid_date:new Date().toISOString().split('T')[0], days_late:'', notes:'' });
  const [exF,  setExF]  = useState({ description:'', amount:'', category:'Άλλο', date:new Date().toISOString().split('T')[0], paid:false, notes:'' });

  const sf = (k:string, v:any) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (form.lease_start && form.lease_type && form.lease_type !== 'custom') {
      sf('lease_end', calcEnd(form.lease_start, form.lease_type as LeaseType, form.custom_lease_days));
    }
  }, [form.lease_start, form.lease_type]);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    const { data:td } = await supabase.from('tenants').select('*').eq('property_id',propertyId).eq('user_id',userId).order('created_at',{ascending:false}).limit(1);
    const t = td?.[0] || null;
    setTenant(t);
    if (t) {
      const [{ data:pd }, { data:ed }] = await Promise.all([
        supabase.from('rent_payments').select('*').eq('property_id',propertyId).eq('user_id',userId).order('period_year',{ascending:false}).order('period_month',{ascending:false}),
        supabase.from('expenses').select('*').eq('property_id',propertyId).eq('user_id',userId).eq('category','tenant_extra').order('created_at',{ascending:false}),
      ]);
      setPayments(pd||[]); setExtras(ed||[]);
    }
    setLoading(false);
  }, [propertyId, userId]);

  useEffect(() => { fetch_(); }, [fetch_]);
  const notify = (msg:string) => { setOk(msg); setTimeout(() => setOk(null), 3000); };

  const openAdd = () => { setForm(blank()); setEditMode(false); setIsForm(true); setFormTab('profile'); };
  const openEdit = () => {
    if (!tenant) return;
    const n = (v:number|null) => v?.toString()||'';
    setForm({
      full_name:tenant.full_name||'', email:tenant.email||'', phone:tenant.phone||'', phone_work:tenant.phone_work||'', afm:tenant.afm||'',
      id_doc_type:(tenant.id_doc_type as IdDocType)||'', id_doc_number:tenant.id_doc_number||'', iban:tenant.iban||'', notes:tenant.notes||'',
      lease_type:tenant.lease_type||'annual', lease_start:tenant.lease_start?.split('T')[0]||'', lease_end:tenant.lease_end?.split('T')[0]||'', custom_lease_days:tenant.custom_lease_days||365,
      monthly_rent:n(tenant.monthly_rent), payment_frequency:tenant.payment_frequency||'monthly',
      deposit_amount:n(tenant.deposit_amount), deposit_invested:tenant.deposit_invested||false, deposit_returned:tenant.deposit_returned||false, deposit_return_date:tenant.deposit_return_date?.split('T')[0]||'',
      deposit_invest_rate:n(tenant.deposit_invest_rate), deposit_invest_type:tenant.deposit_invest_type||'', deposit_invest_term:tenant.deposit_invest_term||'',
      all_inclusive:tenant.all_inclusive||false, kwh_limit:n(tenant.kwh_limit), kwh_price:n(tenant.kwh_price),
      electricity_provider:tenant.electricity_provider||'', electricity_tariff:tenant.electricity_tariff||'', electricity_monthly_limit:n(tenant.electricity_monthly_limit),
      water_monthly_limit:n(tenant.water_monthly_limit), internet_provider:tenant.internet_provider||'', internet_plan:tenant.internet_plan||'', internet_cost:n(tenant.internet_cost),
      e_payment:tenant.e_payment??true, streaming:tenant.streaming||null, cleaning:tenant.cleaning||null, extra_perks:tenant.extra_perks||'',
      welcome_basket:tenant.welcome_basket||false, welcome_basket_amount:n(tenant.welcome_basket_amount), welcome_basket_contents:tenant.welcome_basket_contents||'',
      parking_included:tenant.parking_included||false, parking_extra:tenant.parking_extra||false, parking_extra_price:n(tenant.parking_extra_price),
      parking_type:tenant.parking_type||'', parking_has_electricity:tenant.parking_has_electricity||false, parking_notes:tenant.parking_notes||'',
      ac_service_by:tenant.ac_service_by||'owner', ac_service_frequency:tenant.ac_service_frequency||'annual',
      solar_service_by:tenant.solar_service_by||'owner', solar_service_frequency:tenant.solar_service_frequency||'annual',
      heat_pump_service_by:tenant.heat_pump_service_by||'owner', heat_pump_service_frequency:tenant.heat_pump_service_frequency||'annual',
      solar_panels_service_by:tenant.solar_panels_service_by||'owner', solar_panels_service_frequency:tenant.solar_panels_service_frequency||'annual',
      pest_control_by:tenant.pest_control_by||'owner', pest_control_frequency:tenant.pest_control_frequency||'', annual_services_notes:tenant.annual_services_notes||'',
      prepay_option:tenant.prepay_option||false, prepay_months:tenant.prepay_months||3, prepay_discount_pct:n(tenant.prepay_discount_pct),
      prepay_invested:tenant.prepay_invested||false, prepay_invest_rate:n(tenant.prepay_invest_rate), prepay_invest_type:tenant.prepay_invest_type||'', prepay_invest_term:tenant.prepay_invest_term||'',
      lease_doc_external_url:tenant.lease_doc_external_url||'',
    });
    setEditMode(true); setIsForm(true); setFormTab('profile');
  };

  const save = async () => {
    if (!form.full_name.trim()) { setError('Το ονοματεπώνυμο είναι υποχρεωτικό'); return; }
    setSaving(true); setError(null);
    const n = (v:string) => v ? Math.max(0, parseFloat(v)) : null;
    const payload = {
      property_id:propertyId, user_id:userId, full_name:form.full_name.trim(),
      email:form.email||null, phone:form.phone||null, phone_work:form.phone_work||null, afm:form.afm||null,
      id_doc_type:form.id_doc_type||null, id_doc_number:form.id_doc_number||null, iban:form.iban||null, notes:form.notes||null,
      lease_type:form.lease_type||null, lease_start:form.lease_start||null, lease_end:form.lease_end||null, custom_lease_days:form.custom_lease_days||null,
      monthly_rent:n(form.monthly_rent), payment_frequency:form.payment_frequency||null,
      deposit_amount:n(form.deposit_amount), deposit_invested:form.deposit_invested, deposit_returned:form.deposit_returned, deposit_return_date:form.deposit_return_date||null,
      deposit_invest_rate:n(form.deposit_invest_rate), deposit_invest_type:form.deposit_invest_type||null, deposit_invest_term:form.deposit_invest_term||null,
      all_inclusive:form.all_inclusive, kwh_limit:n(form.kwh_limit), kwh_price:n(form.kwh_price),
      electricity_provider:form.electricity_provider||null, electricity_tariff:form.electricity_tariff||null, electricity_monthly_limit:n(form.electricity_monthly_limit),
      water_monthly_limit:n(form.water_monthly_limit), internet_provider:form.internet_provider||null, internet_plan:form.internet_plan||null, internet_cost:n(form.internet_cost),
      e_payment:form.e_payment, streaming:form.streaming, cleaning:form.cleaning, extra_perks:form.extra_perks||null,
      welcome_basket:form.welcome_basket, welcome_basket_amount:n(form.welcome_basket_amount), welcome_basket_contents:form.welcome_basket_contents||null,
      parking_included:form.parking_included, parking_extra:form.parking_extra, parking_extra_price:n(form.parking_extra_price),
      parking_type:form.parking_type||null, parking_has_electricity:form.parking_has_electricity, parking_notes:form.parking_notes||null,
      ac_service_by:form.ac_service_by||null, ac_service_frequency:form.ac_service_frequency||null,
      solar_service_by:form.solar_service_by||null, solar_service_frequency:form.solar_service_frequency||null,
      heat_pump_service_by:form.heat_pump_service_by||null, heat_pump_service_frequency:form.heat_pump_service_frequency||null,
      solar_panels_service_by:form.solar_panels_service_by||null, solar_panels_service_frequency:form.solar_panels_service_frequency||null,
      pest_control_by:form.pest_control_by||null, pest_control_frequency:form.pest_control_frequency||null, annual_services_notes:form.annual_services_notes||null,
      prepay_option:form.prepay_option, prepay_months:form.prepay_months||null, prepay_discount_pct:n(form.prepay_discount_pct),
      prepay_invested:form.prepay_invested, prepay_invest_rate:n(form.prepay_invest_rate), prepay_invest_type:form.prepay_invest_type||null, prepay_invest_term:form.prepay_invest_term||null,
      lease_doc_external_url:form.lease_doc_external_url||null,
    };
    const q = editMode && tenant ? supabase.from('tenants').update(payload).eq('id',tenant.id) : supabase.from('tenants').insert(payload);
    const { error:err } = await q;
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false); setIsForm(false); setEditMode(false);
    notify(editMode ? 'Αποθηκεύτηκε' : 'Ενοικιαστής προστέθηκε'); fetch_();
  };

  const uploadPDF = async (file:File) => {
    if (!tenant) return; setUploading(true);
    const path = `${userId}/${tenant.id}/${file.name}`;
    const { error:upErr } = await supabase.storage.from('lease-documents').upload(path, file, { upsert:true });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data:urlData } = await supabase.storage.from('lease-documents').createSignedUrl(path, 60*60*24*365);
    await supabase.from('tenants').update({ lease_doc_url:urlData?.signedUrl||null, lease_doc_name:file.name }).eq('id',tenant.id);
    setUploading(false); notify('PDF ανέβηκε'); fetch_();
  };

  const deletePDF = async () => {
    if (!tenant?.lease_doc_name) return;
    await supabase.storage.from('lease-documents').remove([`${userId}/${tenant.id}/${tenant.lease_doc_name}`]);
    await supabase.from('tenants').update({ lease_doc_url:null, lease_doc_name:null }).eq('id',tenant.id);
    notify('PDF διαγράφηκε'); fetch_();
  };

  const savePay = async () => {
    if (!tenant || !payF.amount) { setError('Συμπλήρωσε ποσό'); return; }
    setSaving(true);
    await supabase.from('rent_payments').insert({ tenant_id:tenant.id, property_id:propertyId, user_id:userId, period_month:payF.period_month, period_year:payF.period_year, amount:Math.max(0,parseFloat(payF.amount)), paid:payF.paid, paid_date:payF.paid?payF.paid_date:null, days_late:payF.days_late?parseInt(payF.days_late):null, notes:payF.notes||null });
    setSaving(false); setAddPay(false);
    setPayF({ period_month:new Date().getMonth()+1, period_year:new Date().getFullYear(), amount:'', paid:true, paid_date:new Date().toISOString().split('T')[0], days_late:'', notes:'' });
    notify('Πληρωμή καταχωρήθηκε'); fetch_();
  };

  const saveExtra = async () => {
    if (!tenant || !exF.description || !exF.amount) { setError('Συμπλήρωσε περιγραφή και ποσό'); return; }
    setSaving(true);
    await supabase.from('expenses').insert({ property_id:propertyId, user_id:userId, description:exF.description, amount:Math.max(0,parseFloat(exF.amount)), category:'tenant_extra', date:exF.date, paid:exF.paid, notes:exF.notes||null });
    setSaving(false); setAddExtra(false);
    setExF({ description:'', amount:'', category:'Άλλο', date:new Date().toISOString().split('T')[0], paid:false, notes:'' });
    notify('Χρέωση καταχωρήθηκε'); fetch_();
  };

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'400px', color:'var(--text-tertiary)', fontSize:'12px', letterSpacing:'0.14em' }}>ΦΟΡΤΩΣΗ...</div>;

  const FTABS: [string, typeof formTab][] = [['Στοιχεία','profile'],['Μίσθωση','lease'],['Υπηρεσίες','services'],['Parking','parking'],['Έγγραφα','docs']];
  const VTABS: [string, typeof viewTab][] = [['Προφίλ','profile'],['Μίσθωση','lease'],['Υπηρεσίες','services'],['Αναπροσαρμογή','rentadjust'],[`Πληρωμές (${payments.length})`,'payments'],[`Έκτακτα (${extras.length})`,'extras'],['Συμβόλαιο','docs']];

  return (
    <div style={{ fontFamily:'Inter,sans-serif', color:'var(--text-primary)' }}>
      {ok    && <div style={{ background:'var(--positive-dim)', border:'1px solid var(--positive)', borderRadius:'8px', padding:'10px 16px', marginBottom:'14px', color:'var(--positive)', fontSize:'12px' }}>✓ {ok}</div>}
      {error && <div style={{ background:'var(--negative-dim)', border:'1px solid var(--negative)', borderRadius:'8px', padding:'10px 16px', marginBottom:'14px', color:'var(--negative)', fontSize:'12px', display:'flex', justifyContent:'space-between' }}><span>✕ {error}</span><button onClick={()=>setError(null)} style={{ background:'none', border:'none', color:'var(--negative)', cursor:'pointer', fontSize:'16px' }}>×</button></div>}

      {!tenant && !isForm && (
        <div style={{ ...s.card, textAlign:'center', padding:'80px 32px' }}>
          <div style={{ fontSize:'40px', opacity:.1, marginBottom:'18px' }}>◫</div>
          <div style={{ fontSize:'13px', color:'var(--text-secondary)', marginBottom:'8px' }}>Κανένας ενοικιαστής</div>
          <div style={{ fontSize:'12px', color:'var(--text-tertiary)', marginBottom:'28px' }}>Προσθέστε ενοικιαστή για πλήρη παρακολούθηση μίσθωσης</div>
          <button style={s.btnGold} onClick={openAdd}>+ Νέος Ενοικιαστής</button>
        </div>
      )}

      {isForm && (
        <div style={s.cardGold}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'18px' }}>
            <div style={s.sec}><span style={s.dot()}/>{editMode?'Επεξεργασία Ενοικιαστή':'Νέος Ενοικιαστής'}</div>
            <button style={s.btnGhost} onClick={()=>{setIsForm(false);setEditMode(false);}}>Ακύρωση</button>
          </div>
          <div style={{ display:'flex', borderBottom:'1px solid var(--border-subtle)', marginBottom:'22px', gap:'2px' }}>
            {FTABS.map(([l,t])=><button key={t} onClick={()=>setFormTab(t)} style={s.tabBtn(formTab===t)}>{l}</button>)}
          </div>

          {formTab==='profile' && (
            <>
              <div style={s.sec}><span style={s.dot()}/>Προσωπικά Στοιχεία</div>
              <div style={{ ...s.g3, marginBottom:'14px' }}>
                <TextInput label="Ονοματεπώνυμο *" value={form.full_name} onChange={v=>sf('full_name',v)}/>
                <TextInput label="Email" value={form.email} onChange={v=>sf('email',v)} type="email"/>
                <TextInput label="Κινητό" value={form.phone} onChange={v=>sf('phone',v)}/>
              </div>
              <div style={{ ...s.g3, marginBottom:'14px' }}>
                <TextInput label="Τηλ. Εργασίας" value={form.phone_work} onChange={v=>sf('phone_work',v)}/>
                <TextInput label="ΑΦΜ" value={form.afm} onChange={v=>sf('afm',v)}/>
                <TextInput label="IBAN" value={form.iban} onChange={v=>sf('iban',v)} placeholder="GR00 0000..."/>
              </div>
              <div style={{ ...s.g2, marginBottom:'14px' }}>
                <SelectField label="Τύπος Εγγράφου Ταυτοποίησης" value={form.id_doc_type} onChange={v=>sf('id_doc_type',v)} options={ID_DOCS.map(d=>({value:d,label:d}))} placeholder="Επιλογή..."/>
                <TextInput label="Αριθμός Εγγράφου" value={form.id_doc_number} onChange={v=>sf('id_doc_number',v)}/>
              </div>
              <div style={s.divider}/>
              <div style={s.sec}><span style={s.dot()}/>Εγγύηση</div>
              <div style={{ ...s.g3, marginBottom:'14px' }}>
                <NumberInput label="Ποσό Εγγύησης" value={form.deposit_amount} onChange={v=>sf('deposit_amount',v)} suffix="€"/>
                <div><label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'8px' }}>Επενδύεται</label><Toggle on={form.deposit_invested} onChange={v=>sf('deposit_invested',v)} label="Ναι" labelOff="Όχι"/></div>
                <div><label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'8px' }}>Επεστράφη</label><Toggle on={form.deposit_returned} onChange={v=>sf('deposit_returned',v)} label="Ναι" labelOff="Όχι"/></div>
              </div>
              {form.deposit_returned && <div style={{ marginBottom:'14px' }}><DateField label="Ημ/νία Επιστροφής" value={form.deposit_return_date} onChange={v=>sf('deposit_return_date',v)}/></div>}
              {form.deposit_invested && (
                <div style={{ ...s.g3, marginBottom:'14px' }}>
                  <NumberInput label="Απόδοση %/έτος" value={form.deposit_invest_rate} onChange={v=>sf('deposit_invest_rate',v)} suffix="%" step={0.1} max={100}/>
                  <SelectField label="Τύπος Επένδυσης" value={form.deposit_invest_type} onChange={v=>sf('deposit_invest_type',v)} options={['Fixed Term','Flexible','ETF','P2P Lending','Άλλο'].map(v=>({value:v,label:v}))} placeholder="Επιλογή..."/>
                  <TextInput label="Πού επενδύεται" value={form.deposit_invest_term} onChange={v=>sf('deposit_invest_term',v)} placeholder="π.χ. Scramble, VWCE..."/>
                </div>
              )}
              <InvestmentCalc title="Αναλυτής Απόδοσης Εγγύησης" amount={form.deposit_amount?Math.max(0,parseFloat(form.deposit_amount)):null}/>
              <div style={s.divider}/>
              <div style={s.sec}><span style={s.dot()}/>Welcome Basket</div>
              <div style={{ ...s.g3, marginBottom:'14px' }}>
                <div><label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'8px' }}>Παρέχεται</label><Toggle on={form.welcome_basket} onChange={v=>sf('welcome_basket',v)} label="Ναι" labelOff="Όχι"/></div>
                {form.welcome_basket && <>
                  <NumberInput label="Αξία" value={form.welcome_basket_amount} onChange={v=>sf('welcome_basket_amount',v)} suffix="€" placeholder="20"/>
                  <TextInput label="Περιεχόμενα" value={form.welcome_basket_contents} onChange={v=>sf('welcome_basket_contents',v)} placeholder="π.χ. Κρασί, ελαιόλαδο..."/>
                </>}
              </div>
              <Textarea label="Σημειώσεις" value={form.notes} onChange={v=>sf('notes',v)}/>
            </>
          )}

          {formTab==='lease' && (
            <>
              <div style={s.sec}><span style={s.dot()}/>Διάρκεια Μίσθωσης</div>
              <div style={{ display:'flex', gap:'6px', marginBottom:'16px', flexWrap:'wrap' }}>
                {(Object.keys(LEASE_LABELS) as LeaseType[]).map(lt => (
                  <button key={lt} onClick={()=>sf('lease_type',lt)} style={{ padding:'8px 14px', fontSize:'11px', fontFamily:'Inter,sans-serif', cursor:'pointer', borderRadius:'8px', border:`1px solid ${form.lease_type===lt?'var(--accent)':'var(--border-default)'}`, background:form.lease_type===lt?'var(--accent-dim)':'transparent', color:form.lease_type===lt?'var(--accent)':'var(--text-secondary)', transition:'all 0.15s', fontWeight:form.lease_type===lt?600:400 }}>{LEASE_LABELS[lt]}</button>
                ))}
              </div>
              <div style={{ ...s.g3, marginBottom:'14px' }}>
                <DateField label="Έναρξη Μίσθωσης" value={form.lease_start} onChange={v=>sf('lease_start',v)}/>
                <DateField label="Λήξη Μίσθωσης" value={form.lease_end} onChange={v=>sf('lease_end',v)}/>
                {form.lease_type==='custom' && <NumberInput label="Ημέρες" value={String(form.custom_lease_days)} onChange={v=>sf('custom_lease_days',parseInt(v)||0)} suffix="ημ"/>}
              </div>
              <div style={s.divider}/>
              <div style={s.sec}><span style={s.dot()}/>Ενοίκιο & Πληρωμή</div>
              <div style={{ ...s.g3, marginBottom:'14px' }}>
                <NumberInput label="Μηνιαίο Ενοίκιο" value={form.monthly_rent} onChange={v=>sf('monthly_rent',v)} suffix="€"/>
                <SelectField label="Συχνότητα Εξόφλησης" value={form.payment_frequency} onChange={v=>sf('payment_frequency',v)} options={[{value:'monthly',label:'Μηνιαία'},{value:'bimonthly',label:'Διμηνιαία'},{value:'quarterly',label:'Τριμηνιαία'}]}/>
                <div><label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'8px' }}>Ηλεκτρονική Πληρωμή</label><Toggle on={form.e_payment} onChange={v=>sf('e_payment',v)} label="Ενεργή" labelOff="Ανενεργή"/></div>
              </div>
              <div style={s.divider}/>
              <div style={{ ...s.sec }}>
                <span style={s.dot()}/>Προπληρωμή & Έκπτωση
                <div style={{ marginLeft:'auto' }}><Toggle on={form.prepay_option} onChange={v=>sf('prepay_option',v)} label="Ενεργή" labelOff="Ανενεργή"/></div>
              </div>
              {form.prepay_option && <PrepayCalc monthlyRent={form.monthly_rent?Math.max(0,parseFloat(form.monthly_rent)):null}/>}
              <div style={s.divider}/>
              <div style={{ ...s.sec }}>
                <span style={s.dot()}/>All-Inclusive
                <div style={{ marginLeft:'auto' }}><Toggle on={form.all_inclusive} onChange={v=>sf('all_inclusive',v)} label="Ναι" labelOff="Όχι"/></div>
              </div>
              {form.all_inclusive && (
                <>
                  <div style={{ ...s.g3, marginBottom:'14px' }}>
                    <TextInput label="Πάροχος Ρεύματος" value={form.electricity_provider} onChange={v=>sf('electricity_provider',v)} placeholder="π.χ. ΔΕΗ, Heron"/>
                    <TextInput label="Είδος Τιμολογίου" value={form.electricity_tariff} onChange={v=>sf('electricity_tariff',v)} placeholder="π.χ. Νυχτερινό, G1"/>
                    <NumberInput label="Τιμή kWh" value={form.kwh_price} onChange={v=>sf('kwh_price',v)} suffix="€" step={0.001}/>
                  </div>
                  <div style={{ ...s.g3, marginBottom:'14px' }}>
                    <NumberInput label="Όριο kWh/μήνα" value={form.kwh_limit} onChange={v=>sf('kwh_limit',v)} suffix="kWh"/>
                    <NumberInput label="Όριο νερού/μήνα" value={form.water_monthly_limit} onChange={v=>sf('water_monthly_limit',v)} suffix="m³"/>
                    <NumberInput label="Κόστος Internet/μήνα" value={form.internet_cost} onChange={v=>sf('internet_cost',v)} suffix="€"/>
                  </div>
                  <div style={{ ...s.g2, marginBottom:'14px' }}>
                    <TextInput label="Πάροχος Internet" value={form.internet_provider} onChange={v=>sf('internet_provider',v)} placeholder="π.χ. Cosmote, Wind"/>
                    <TextInput label="Πρόγραμμα Internet" value={form.internet_plan} onChange={v=>sf('internet_plan',v)} placeholder="π.χ. 300Mbps Fiber"/>
                  </div>
                </>
              )}
            </>
          )}

          {formTab==='services' && (
            <>
              <div style={s.sec}><span style={s.dot()}/>Streaming & Συνδρομές</div>
              <StreamingConfig value={form.streaming} onChange={v=>sf('streaming',v)}/>
              <div style={s.divider}/>
              <div style={s.sec}><span style={s.dot()}/>Καθαρισμός</div>
              <CleaningConfig value={form.cleaning} onChange={v=>sf('cleaning',v)}/>
              <div style={s.divider}/>
              <div style={s.sec}><span style={s.dot()}/>Ετήσιες Συντηρήσεις — Ποιος Πληρώνει</div>
              {[
                { label:'Κλιματιστικό', byKey:'ac_service_by', freqKey:'ac_service_frequency' },
                { label:'Ηλιακός Θερμοσίφωνας', byKey:'solar_service_by', freqKey:'solar_service_frequency' },
                { label:'Αντλία Θερμότητας', byKey:'heat_pump_service_by', freqKey:'heat_pump_service_frequency' },
                { label:'Φωτοβολταϊκά', byKey:'solar_panels_service_by', freqKey:'solar_panels_service_frequency' },
                { label:'Απεντόμωση/Μυοκτονία', byKey:'pest_control_by', freqKey:'pest_control_frequency' },
              ].map(({ label, byKey, freqKey }) => (
                <div key={byKey} style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'12px', marginBottom:'10px', padding:'12px', background:'var(--bg-elevated)', borderRadius:'10px', border:'1px solid var(--border-subtle)' }}>
                  <ServiceBySelect label={label} value={(form as any)[byKey] as ServiceBy} onChange={v=>sf(byKey,v)}/>
                  <SelectField label="Συχνότητα" value={(form as any)[freqKey]} onChange={v=>sf(freqKey,v)} options={FREQ_OPTIONS} placeholder="Χωρίς"/>
                </div>
              ))}
              <Textarea label="Σημειώσεις Συντηρήσεων" value={form.annual_services_notes} onChange={v=>sf('annual_services_notes',v)} placeholder="π.χ. Καθαρισμός φίλτρων κλιματιστικού κάθε Απρίλιο..."/>
              <div style={s.divider}/>
              <Textarea label="Extra Perks" value={form.extra_perks} onChange={v=>sf('extra_perks',v)} placeholder="π.χ. Αποθήκη, χρήση πλυντηρίου, κήπος..."/>
            </>
          )}

          {formTab==='parking' && (
            <>
              <div style={s.sec}><span style={s.dot()}/>Χώρος Στάθμευσης</div>
              <div style={{ ...s.g3, marginBottom:'14px' }}>
                <div><label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'8px' }}>Περιλαμβάνεται στην τιμή</label><Toggle on={form.parking_included} onChange={v=>sf('parking_included',v)} label="Ναι" labelOff="Όχι"/></div>
                <div><label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'8px' }}>Νοικιάζεται Extra</label><Toggle on={form.parking_extra} onChange={v=>sf('parking_extra',v)} label="Ναι" labelOff="Όχι"/></div>
                {form.parking_extra && <NumberInput label="Μηνιαία Τιμή Parking" value={form.parking_extra_price} onChange={v=>sf('parking_extra_price',v)} suffix="€"/>}
              </div>
              <div style={{ ...s.g3, marginBottom:'14px' }}>
                <SelectField label="Τύπος" value={form.parking_type} onChange={v=>sf('parking_type',v)} options={[{value:'outdoor',label:'Υπαίθριο'},{value:'indoor',label:'Κλειστό/Υπόγειο'},{value:'garage',label:'Γκαράζ'},{value:'street',label:'Δρόμος'}]} placeholder="Επιλογή..."/>
                <div><label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'8px' }}>Έχει Ρεύμα (EV)</label><Toggle on={form.parking_has_electricity} onChange={v=>sf('parking_has_electricity',v)} label="Ναι" labelOff="Όχι"/></div>
              </div>
              <Textarea label="Σημειώσεις Parking" value={form.parking_notes} onChange={v=>sf('parking_notes',v)} placeholder="π.χ. Θέση Νο. 12..."/>
            </>
          )}

          {formTab==='docs' && (
            <>
              <div style={s.sec}><span style={s.dot()}/>Ενοικιαστήριο Συμβόλαιο</div>
              <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'10px', padding:'16px', marginBottom:'14px' }}>
                <div style={{ fontSize:'12px', color:'var(--text-secondary)', marginBottom:'12px' }}>Αποθήκευσε το συμβόλαιο ως PDF upload ή ως link (Google Drive, Dropbox κλπ).</div>
                <TextInput label="Εξωτερικό Link" value={form.lease_doc_external_url} onChange={v=>sf('lease_doc_external_url',v)} placeholder="https://drive.google.com/..."/>
                <div style={{ marginTop:'10px', fontSize:'11px', color:'var(--text-tertiary)' }}>Το PDF upload είναι διαθέσιμο αφού αποθηκευτεί ο ενοικιαστής.</div>
              </div>
            </>
          )}

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:'22px' }}>
            <div style={{ display:'flex', gap:'8px' }}>
              {formTab!=='profile' && <button style={s.btnGhost} onClick={()=>setFormTab(FTABS[FTABS.findIndex(([,t])=>t===formTab)-1][1] as typeof formTab)}>‹ Πίσω</button>}
              {formTab==='profile' && <button style={s.btnGhost} onClick={()=>{setIsForm(false);setEditMode(false);}}>Ακύρωση</button>}
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              {formTab!=='docs' && <button style={s.btnGold} onClick={()=>setFormTab(FTABS[FTABS.findIndex(([,t])=>t===formTab)+1][1] as typeof formTab)}>Επόμενο ›</button>}
              {formTab==='docs' && <button style={s.btnGold} onClick={save} disabled={saving}>{saving?'Αποθήκευση...':editMode?'Αποθήκευση':'Προσθήκη Ενοικιαστή'}</button>}
            </div>
          </div>
        </div>
      )}

      {tenant && !isForm && (
        <>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'20px' }}>
            <div>
              <div style={{ fontSize:'22px', fontFamily:"'Playfair Display',serif", fontWeight:500, color:'var(--text-primary)', marginBottom:'4px' }}>{tenant.full_name}</div>
              <div style={{ display:'flex', gap:'14px', flexWrap:'wrap' }}>
                {tenant.email     && <span style={{ fontSize:'12px', color:'var(--text-secondary)' }}>{tenant.email}</span>}
                {tenant.phone     && <span style={{ fontSize:'12px', color:'var(--text-secondary)' }}>· {tenant.phone}</span>}
                {tenant.phone_work&& <span style={{ fontSize:'12px', color:'var(--text-tertiary)' }}>· Εργ: {tenant.phone_work}</span>}
                {tenant.afm       && <span style={{ fontSize:'11px', color:'var(--text-tertiary)' }}>· ΑΦΜ {tenant.afm}</span>}
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button style={s.btnGhost} onClick={openEdit}>Επεξεργασία</button>
              <button style={s.btnDng} onClick={async()=>{ if(!confirm(`Διαγραφή "${tenant.full_name}";`))return; await supabase.from('rent_payments').delete().eq('property_id',propertyId).eq('user_id',userId); await supabase.from('tenants').delete().eq('id',tenant.id); setTenant(null); setPayments([]); setExtras([]); }}>Διαγραφή</button>
            </div>
          </div>

          <KPIs tenant={tenant} payments={payments} extras={extras}/>

          <div style={{ display:'flex', borderBottom:'1px solid var(--border-subtle)', marginBottom:'20px' }}>
            {VTABS.map(([l,t])=><button key={t} onClick={()=>setViewTab(t as typeof viewTab)} style={s.tabBtn(viewTab===t)}>{l}</button>)}
          </div>

          {viewTab==='profile' && (
            <div style={s.g2}>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Στοιχεία</div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <tbody>
                    {([['Email',tenant.email],['Κινητό',tenant.phone],['Τηλ. Εργασίας',tenant.phone_work],['ΑΦΜ',tenant.afm],['Έγγραφο',tenant.id_doc_type],['Αρ. Εγγράφου',tenant.id_doc_number],['IBAN',tenant.iban]] as [string,string|null][]).filter(([,v])=>v).map(([k,v],i)=>(
                      <tr key={i}><td style={s.tdM}>{k}</td><td style={s.td}>{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div style={s.card}>
                  <div style={s.sec}><span style={s.dot('var(--accent)')}/>Εγγύηση</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                    <tbody>
                      {([
                        ['Ποσό', <span style={{ color:'var(--accent)', fontWeight:700 }}>{fmt(tenant.deposit_amount)}</span>],
                        ['Κατάσταση', tenant.deposit_returned?<span style={s.badge('var(--positive)','var(--positive-dim)')}>Επεστράφη</span>:<span style={s.badge('var(--accent)','var(--accent-dim)')}>Εκκρεμεί</span>],
                        ['Επένδυση', tenant.deposit_invested?<span style={s.badge('var(--positive)','var(--positive-dim)')}>Επενδύεται</span>:<span style={s.badge('var(--text-secondary)','var(--bg-overlay)')}>Όχι</span>],
                        ...(tenant.deposit_invest_type?[['Τύπος',tenant.deposit_invest_type]]:[] as any),
                        ...(tenant.deposit_invest_term?[['Πού',tenant.deposit_invest_term]]:[] as any),
                      ] as [string,React.ReactNode][]).map(([k,v],i)=>(
                        <tr key={i}><td style={s.tdM}>{k}</td><td style={s.td}>{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {!tenant.deposit_returned && <button style={{ ...s.btnSm, marginTop:'12px', width:'100%', textAlign:'center' }} onClick={async()=>{ await supabase.from('tenants').update({deposit_returned:true,deposit_return_date:new Date().toISOString().split('T')[0]}).eq('id',tenant.id); fetch_(); notify('Εγγύηση επεστράφη'); }}>✓ Σήμανση ως Επεστράφη</button>}
                  <InvestmentCalc title="Απόδοση Εγγύησης" amount={tenant.deposit_amount}/>
                </div>
                {tenant.welcome_basket && (
                  <div style={{ ...s.card, border:'1px solid var(--border-accent)' }}>
                    <div style={s.sec}><span style={s.dot()}/>Welcome Basket</div>
                    <div style={{ fontSize:'18px', fontWeight:700, color:'var(--accent)', marginBottom:'4px', fontFamily:"'JetBrains Mono',monospace" }}>{fmt(tenant.welcome_basket_amount)}</div>
                    {tenant.welcome_basket_contents && <div style={{ fontSize:'12px', color:'var(--text-secondary)' }}>{tenant.welcome_basket_contents}</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {viewTab==='lease' && (
            <div style={s.g2}>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Συμβόλαιο</div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                  <tbody>
                    {([
                      ['Τύπος', tenant.lease_type?LEASE_LABELS[tenant.lease_type]:'—'],
                      ['Έναρξη', fmtD(tenant.lease_start)],
                      ['Λήξη', ()=>{ const d=daysLeft(tenant.lease_end); const st=leaseSt(d); return <span>{fmtD(tenant.lease_end)}{st&&<span style={{...s.badge(st.color,st.bg),marginLeft:'8px'}}>{st.label}</span>}</span>; }],
                      ['Ενοίκιο', <span style={{ color:'var(--accent)', fontWeight:700, fontSize:'14px' }}>{fmt(tenant.monthly_rent)}</span>],
                      ['Εξόφληση', {monthly:'Μηνιαία',bimonthly:'Διμηνιαία',quarterly:'Τριμηνιαία'}[tenant.payment_frequency||'monthly']||'—'],
                      ['Πληρωμή', tenant.e_payment?<span style={s.badge('var(--positive)','var(--positive-dim)')}>Ηλεκτρονική</span>:<span style={s.badge('var(--text-secondary)','var(--bg-overlay)')}>Μετρητά</span>],
                      ['All-Inclusive', tenant.all_inclusive?<span style={s.badge('var(--accent)','var(--accent-dim)')}>Ναι</span>:<span style={s.badge('var(--text-secondary)','var(--bg-overlay)')}>Όχι</span>],
                      ...(tenant.all_inclusive&&tenant.electricity_provider?[['Πάροχος Ρεύμ.',tenant.electricity_provider]]:[] as any),
                      ...(tenant.all_inclusive&&tenant.kwh_limit?[['Όριο kWh',`${tenant.kwh_limit} kWh/μήνα`]]:[] as any),
                      ...(tenant.all_inclusive&&tenant.internet_provider?[['Internet',`${tenant.internet_provider}${tenant.internet_plan?' — '+tenant.internet_plan:''}`]]:[] as any),
                    ] as [string,React.ReactNode|Function][]).map(([k,v],i)=>(
                      <tr key={i}><td style={s.tdM}>{k as string}</td><td style={s.td}>{typeof v==='function'?v():v as React.ReactNode}</td></tr>
                    ))}
                  </tbody>
                </table>
                {tenant.prepay_option && <div style={{ marginTop:'14px', paddingTop:'14px', borderTop:'1px solid var(--border-subtle)' }}><PrepayCalc monthlyRent={tenant.monthly_rent}/></div>}
              </div>
              <div>
                <div style={s.card}>
                  <div style={s.sec}><span style={s.dot()}/>Ετήσιες Συντηρήσεις</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                    <tbody>
                      {[
                        ['Κλιματιστικό',tenant.ac_service_by,tenant.ac_service_frequency],
                        ['Ηλιακός',tenant.solar_service_by,tenant.solar_service_frequency],
                        ['Αντλία Θερμ.',tenant.heat_pump_service_by,tenant.heat_pump_service_frequency],
                        ['Φωτοβολταϊκά',tenant.solar_panels_service_by,tenant.solar_panels_service_frequency],
                        ['Απεντόμωση',tenant.pest_control_by,tenant.pest_control_frequency],
                      ].map(([k,v,f],i)=>{
                        if(!v)return null;
                        const col=(v as ServiceBy)==='owner'?'var(--warning)':(v as ServiceBy)==='tenant'?'var(--positive)':'var(--accent)';
                        const dim=(v as ServiceBy)==='owner'?'var(--warning-dim)':(v as ServiceBy)==='tenant'?'var(--positive-dim)':'var(--accent-dim)';
                        const fl=FREQ_OPTIONS.find(o=>o.value===f)?.label||'';
                        return <tr key={i}><td style={s.tdM}>{k as string}</td><td style={s.td}><span style={s.badge(col,dim)}>{SERVICE_BY_LABELS[v as ServiceBy]}</span>{fl&&<span style={{ fontSize:'11px', color:'var(--text-tertiary)', marginLeft:'8px' }}>{fl}</span>}</td></tr>;
                      })}
                    </tbody>
                  </table>
                  {tenant.annual_services_notes && <div style={{ marginTop:'10px', fontSize:'12px', color:'var(--text-secondary)', lineHeight:1.6, borderTop:'1px solid var(--border-subtle)', paddingTop:'10px' }}>{tenant.annual_services_notes}</div>}
                </div>
                {(tenant.parking_included||tenant.parking_extra) && (
                  <div style={s.card}>
                    <div style={s.sec}><span style={s.dot()}/>Parking</div>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                      <tbody>
                        {([
                          ['Τύπος',{outdoor:'Υπαίθριο',indoor:'Κλειστό',garage:'Γκαράζ',street:'Δρόμος'}[tenant.parking_type||'']||tenant.parking_type],
                          ['Στην τιμή',tenant.parking_included?<span style={s.badge('var(--positive)','var(--positive-dim)')}>Ναι</span>:<span style={s.badge('var(--text-secondary)','var(--bg-overlay)')}>Όχι</span>],
                          ...(tenant.parking_extra?[['Extra χρέωση',fmt(tenant.parking_extra_price)+'/μήνα']]:[] as any),
                          ['Ρεύμα',tenant.parking_has_electricity?<span style={s.badge('var(--accent)','var(--accent-dim)')}>Ναι</span>:<span style={s.badge('var(--text-secondary)','var(--bg-overlay)')}>Όχι</span>],
                        ]).filter(([,v])=>v).map(([k,v],i)=>(
                          <tr key={i}><td style={s.tdM}>{k as string}</td><td style={s.td}>{v as React.ReactNode}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {tenant.parking_notes && <div style={{ marginTop:'8px', fontSize:'12px', color:'var(--text-secondary)' }}>{tenant.parking_notes}</div>}
                  </div>
                )}
              </div>
            </div>
          )}

          {viewTab==='services' && (
            <div style={s.g2}>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Streaming & Συνδρομές</div>
                {!(tenant.streaming?.some(sv=>sv.included)) && <div style={{ color:'var(--text-tertiary)', fontSize:'12px' }}>Καμία συνδρομή</div>}
                {tenant.streaming?.filter(sv=>sv.included).map((svc,i)=>(
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:'14px', alignItems:'center', padding:'10px 12px', marginBottom:'6px', background:'var(--bg-elevated)', borderRadius:'10px', border:'1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize:'13px', color:'var(--text-primary)' }}>{svc.name}</span>
                    <div style={{ textAlign:'right' }}><div style={{ fontSize:'10px', color:'var(--text-secondary)', letterSpacing:'0.06em' }}>ΚΟΣΤΟΣ</div><div style={{ fontSize:'13px', color:'var(--negative)', fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{fmt(svc.cost_owner)}</div></div>
                    <div style={{ textAlign:'right' }}><div style={{ fontSize:'10px', color:'var(--text-secondary)', letterSpacing:'0.06em' }}>ΧΡΕΩΣΗ</div><div style={{ fontSize:'13px', color:'var(--accent)', fontWeight:700, fontFamily:"'JetBrains Mono',monospace" }}>{fmt(svc.charged_tenant)}</div></div>
                  </div>
                ))}
              </div>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Καθαρισμός</div>
                {!tenant.cleaning||tenant.cleaning.package==='none'?<div style={{ color:'var(--text-tertiary)', fontSize:'12px' }}>Δεν περιλαμβάνεται</div>:(
                  <div style={{ background:'var(--bg-elevated)', padding:'14px', borderRadius:'10px', border:'1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize:'13px', color:'var(--text-primary)', marginBottom:'10px' }}>{tenant.cleaning.times}× {tenant.cleaning.hours}ώρ/μήνα</div>
                  </div>
                )}
                {tenant.extra_perks && <div style={{ marginTop:'14px', paddingTop:'14px', borderTop:'1px solid var(--border-subtle)', fontSize:'12px', color:'var(--text-secondary)', lineHeight:1.7 }}>{tenant.extra_perks}</div>}
              </div>
            </div>
          )}

          {/* ── ΑΝΑΠΡΟΣΑΡΜΟΓΗ ΤΔΕ ── */}
          {viewTab==='rentadjust' && <RentAdjustView tenant={tenant}/>}

          {viewTab==='payments' && (
            <div style={s.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                <div style={s.sec}><span style={s.dot()}/>Ιστορικό Πληρωμών</div>
                <button style={s.btnSm} onClick={()=>setAddPay(v=>!v)}>{addPay?'✕ Κλείσιμο':'+ Νέα Πληρωμή'}</button>
              </div>
              {addPay && (
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'10px', padding:'16px', marginBottom:'16px' }}>
                  <div style={{ ...s.g4, marginBottom:'12px' }}>
                    <SelectField label="Μήνας" value={String(payF.period_month)} onChange={v=>setPayF(f=>({...f,period_month:+v}))} options={MONTHS_FULL.map((m,i)=>({value:String(i+1),label:m}))}/>
                    <NumberInput label="Έτος" value={String(payF.period_year)} onChange={v=>setPayF(f=>({...f,period_year:+v}))} min={2000}/>
                    <NumberInput label="Ποσό" value={payF.amount} onChange={v=>setPayF(f=>({...f,amount:v}))} suffix="€" placeholder={tenant.monthly_rent?.toString()}/>
                    <NumberInput label="Μέρες Καθ/σης" value={payF.days_late} onChange={v=>setPayF(f=>({...f,days_late:v}))} suffix="δ" placeholder="0"/>
                  </div>
                  <div style={{ ...s.g3, marginBottom:'12px' }}>
                    <div><label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'8px' }}>Εξοφλήθη</label><Toggle on={payF.paid} onChange={v=>setPayF(f=>({...f,paid:v}))} label="Ναι" labelOff="Όχι"/></div>
                    {payF.paid && <DateField label="Ημ/νία Πληρωμής" value={payF.paid_date} onChange={v=>setPayF(f=>({...f,paid_date:v}))}/>}
                    <TextInput label="Σημείωση" value={payF.notes} onChange={v=>setPayF(f=>({...f,notes:v}))} placeholder="π.χ. Μερική πληρωμή"/>
                  </div>
                  <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                    <button style={s.btnGhost} onClick={()=>setAddPay(false)}>Ακύρωση</button>
                    <button style={s.btnGold} onClick={savePay} disabled={saving}>{saving?'...':'Καταχώρηση'}</button>
                  </div>
                </div>
              )}
              {payments.length===0 ? <div style={{ textAlign:'center', padding:'48px', color:'var(--text-tertiary)', fontSize:'12px' }}>Δεν υπάρχουν πληρωμές</div> : (
                <>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead><tr>{['Περίοδος','Ποσό','Κατάσταση','Ημ/νία','Καθ/ση','Σημ.',''].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {payments.map(p=>(
                        <tr key={p.id}>
                          <td style={s.td}><strong>{MONTHS_S[p.period_month-1]}</strong> <span style={{ color:'var(--text-tertiary)' }}>{p.period_year}</span></td>
                          <td style={s.td}>{fmt(p.amount)}</td>
                          <td style={s.td}><button onClick={async()=>{ await supabase.from('rent_payments').update({paid:!p.paid,paid_date:!p.paid?new Date().toISOString().split('T')[0]:null}).eq('id',p.id); fetch_(); }} style={{ ...s.badge(p.paid?'var(--positive)':'var(--negative)',p.paid?'var(--positive-dim)':'var(--negative-dim)'), cursor:'pointer', border:'none', fontFamily:'Inter,sans-serif' }}>{p.paid?'✓ Εξοφλήθη':'✕ Εκκρεμεί'}</button></td>
                          <td style={s.tdM}>{fmtD(p.paid_date)}</td>
                          <td style={s.td}>{p.days_late&&p.days_late>0?<span style={s.badge(p.days_late>14?'var(--negative)':'var(--warning)',p.days_late>14?'var(--negative-dim)':'var(--warning-dim)')}>{p.days_late}δ</span>:<span style={{ color:'var(--text-tertiary)' }}>—</span>}</td>
                          <td style={s.tdM}>{p.notes||'—'}</td>
                          <td style={s.td}><button style={s.btnDng} onClick={async()=>{ if(!confirm('Διαγραφή;'))return; await supabase.from('rent_payments').delete().eq('id',p.id); fetch_(); }}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:'12px', paddingTop:'12px', display:'flex', gap:'20px' }}>
                    <span style={{ fontSize:'11px', color:'var(--positive)' }}>Εισπραχθέντα: <strong>{fmt(payments.filter(p=>p.paid).reduce((a,p)=>a+p.amount,0))}</strong></span>
                    {payments.some(p=>!p.paid) && <span style={{ fontSize:'11px', color:'var(--negative)' }}>Εκκρεμή: <strong>{fmt(payments.filter(p=>!p.paid).reduce((a,p)=>a+p.amount,0))}</strong></span>}
                    <span style={{ fontSize:'11px', color:'var(--text-secondary)' }}>{payments.filter(p=>p.paid).length}/{payments.length} πληρωμές</span>
                  </div>
                </>
              )}
            </div>
          )}

          {viewTab==='extras' && (
            <div style={s.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
                <div style={s.sec}><span style={s.dot('var(--warning)')}/>Έκτακτες Χρεώσεις</div>
                <button style={s.btnSm} onClick={()=>setAddExtra(v=>!v)}>{addExtra?'✕ Κλείσιμο':'+ Νέα Χρέωση'}</button>
              </div>
              {addExtra && (
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'10px', padding:'16px', marginBottom:'16px' }}>
                  <div style={{ ...s.g3, marginBottom:'12px' }}>
                    <div style={{ gridColumn:'1/3' }}><TextInput label="Περιγραφή" value={exF.description} onChange={v=>setExF(f=>({...f,description:v}))} placeholder="π.χ. Φθορά ψυγείου"/></div>
                    <NumberInput label="Ποσό" value={exF.amount} onChange={v=>setExF(f=>({...f,amount:v}))} suffix="€"/>
                  </div>
                  <div style={{ ...s.g3, marginBottom:'12px' }}>
                    <SelectField label="Κατηγορία" value={exF.category} onChange={v=>setExF(f=>({...f,category:v}))} options={EXTRA_CATS.map(c=>({value:c,label:c}))}/>
                    <DateField label="Ημ/νία" value={exF.date} onChange={v=>setExF(f=>({...f,date:v}))}/>
                    <div><label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'8px' }}>Εξοφλήθη</label><Toggle on={exF.paid} onChange={v=>setExF(f=>({...f,paid:v}))} label="Ναι" labelOff="Όχι"/></div>
                  </div>
                  <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
                    <button style={s.btnGhost} onClick={()=>setAddExtra(false)}>Ακύρωση</button>
                    <button style={s.btnGold} onClick={saveExtra} disabled={saving}>{saving?'...':'Καταχώρηση'}</button>
                  </div>
                </div>
              )}
              {extras.length===0 ? <div style={{ textAlign:'center', padding:'48px', color:'var(--text-tertiary)', fontSize:'12px' }}>Δεν υπάρχουν έκτακτες χρεώσεις</div> : (
                <>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead><tr>{['Ημ/νία','Περιγραφή','Κατηγορία','Ποσό','Κατάσταση',''].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {extras.map(e=>(
                        <tr key={e.id}>
                          <td style={s.tdM}>{fmtD(e.date)}</td>
                          <td style={s.td}>{e.description}</td>
                          <td style={s.tdM}>{e.category}</td>
                          <td style={{ ...s.td, color:'var(--warning)', fontWeight:700 }}>{fmt(e.amount)}</td>
                          <td style={s.td}><button onClick={async()=>{ await supabase.from('expenses').update({paid:!e.paid}).eq('id',e.id); fetch_(); }} style={{ ...s.badge(e.paid?'var(--positive)':'var(--warning)',e.paid?'var(--positive-dim)':'var(--warning-dim)'), cursor:'pointer', border:'none', fontFamily:'Inter,sans-serif' }}>{e.paid?'✓ Εξοφλήθη':'✕ Εκκρεμεί'}</button></td>
                          <td style={s.td}><button style={s.btnDng} onClick={async()=>{ if(!confirm('Διαγραφή;'))return; await supabase.from('expenses').delete().eq('id',e.id); fetch_(); }}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:'12px', paddingTop:'12px', display:'flex', gap:'20px' }}>
                    <span style={{ fontSize:'11px', color:'var(--warning)' }}>Σύνολο: <strong>{fmt(extras.reduce((a,e)=>a+e.amount,0))}</strong></span>
                    {extras.some(e=>!e.paid) && <span style={{ fontSize:'11px', color:'var(--negative)' }}>Εκκρεμή: <strong>{fmt(extras.filter(e=>!e.paid).reduce((a,e)=>a+e.amount,0))}</strong></span>}
                  </div>
                </>
              )}
            </div>
          )}

          {viewTab==='docs' && (
            <div style={s.g2}>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>PDF Συμβολαίου</div>
                {tenant.lease_doc_name ? (
                  <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-accent)', borderRadius:'10px', padding:'16px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
                      <div><div style={{ fontSize:'13px', color:'var(--text-primary)', marginBottom:'3px' }}>📄 {tenant.lease_doc_name}</div></div>
                      <button style={s.btnDng} onClick={deletePDF}>Διαγραφή</button>
                    </div>
                    {tenant.lease_doc_url && <a href={tenant.lease_doc_url} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGold, display:'inline-block', textDecoration:'none', textAlign:'center' }}>Άνοιγμα PDF</a>}
                    <div style={{ marginTop:'12px' }}>
                      <label style={{ ...s.btnSm, cursor:'pointer', display:'inline-block' }}>
                        {uploading?'Ανέβασμα...':'Αντικατάσταση PDF'}
                        <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f)uploadPDF(f); }} disabled={uploading}/>
                      </label>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'var(--bg-elevated)', border:`2px dashed var(--border-default)`, borderRadius:'10px', padding:'40px', textAlign:'center' }}>
                    <div style={{ fontSize:'32px', opacity:.2, marginBottom:'12px' }}>📄</div>
                    <div style={{ fontSize:'12px', color:'var(--text-secondary)', marginBottom:'16px' }}>Ανέβασε το ενοικιαστήριο συμβόλαιο (PDF)</div>
                    <label style={{ ...s.btnGold, cursor:'pointer', display:'inline-block' }}>
                      {uploading?'Ανέβασμα...':'Επιλογή PDF'}
                      <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f)uploadPDF(f); }} disabled={uploading}/>
                    </label>
                  </div>
                )}
              </div>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Εξωτερικό Link</div>
                {tenant.lease_doc_external_url ? (
                  <div>
                    <div style={{ fontSize:'12px', color:'var(--text-secondary)', marginBottom:'12px', wordBreak:'break-all' }}>{tenant.lease_doc_external_url}</div>
                    <a href={tenant.lease_doc_external_url} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGold, display:'inline-block', textDecoration:'none' }}>Άνοιγμα Link</a>
                  </div>
                ) : (
                  <div style={{ color:'var(--text-tertiary)', fontSize:'12px', lineHeight:1.7 }}>Δεν έχει οριστεί εξωτερικό link.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}