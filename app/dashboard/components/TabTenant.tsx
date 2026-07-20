'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  s, fmt, fmtD, daysLeft, leaseSt, calcEnd,
  StreamingConfig, CleaningConfig, InvestmentCalc,
  LEASE_LABELS, LEASE_CATEGORY_LABELS, COMMERCIAL_STAMP_DUTY, MIN_LEASE_MONTHS, ID_DOCS,
  MONTHS_FULL, MONTHS_S, FREQ_OPTIONS, EXTRA_CATS,
  syncTenantSchedule, setRentDueOccurrencePaid, type TenantScheduleInput,
} from './TabTenantHelpers';
import {
  Toggle, NumberInput, TextInput, Textarea,
  CustomSelect as SelectField,
  DatePicker as DateField,
} from './UIComponents';
import type { ServiceBy, LeaseType, LeaseCategory, PaymentFreq, IdDocType, StreamingSvc, CleaningCfg } from './TabTenantHelpers';
import { T, PageTitle, KPIGrid, InfoBanner, Badge, Btn, EmptyState, SecHdr, fe, fn, fd, Spinner, ExportButton, type KPIItem } from '@/components/Theme';
import { downloadCsv, csvEur, csvDate } from './exportCsv';
import { brandName, brandContactLine, useReportBranding, brandLogoImg } from '@/lib/reportBranding';
import { rentalIncomeTax, effectiveRentalRate, RENTAL_TAX_ROWS_2026 } from '@/lib/billing/greekTax';
import { whatsappLink, viberLink } from '@/lib/clients/messages';
import { normalizePhone } from '@/lib/clients/clients';
import { SYSTEM_PROMPT } from './DocumentScan';
import { classifyDocType, type ScannedDoc } from '@/lib/billing/documents';

// ─── Design tokens, shared source of truth (components/Theme) ────────────────
const labelStyle = { fontSize:'11px', letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, fontWeight:600, marginBottom:7 };

// ─── HTML escaping for values interpolated into document.write() templates ────
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));

// ─── Types ────────────────────────────────────────────────────────────────────
interface Tenant {
  id:string; property_id:string; user_id:string;
  full_name:string; email:string|null; phone:string|null; phone_work:string|null;
  nationality:string|null; profession:string|null; employer:string|null;
  afm:string|null; id_doc_type:IdDocType|null; id_doc_number:string|null; iban:string|null; notes:string|null;
  lease_type:LeaseType|null; lease_category:LeaseCategory|null; lease_start:string|null; lease_end:string|null; custom_lease_days:number|null;
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
  ac_service_by:ServiceBy|null; ac_service_frequency:string|null; ac_service_owner_pct:number|null;
  solar_service_by:ServiceBy|null; solar_service_frequency:string|null; solar_service_owner_pct:number|null;
  heat_pump_service_by:ServiceBy|null; heat_pump_service_frequency:string|null; heat_pump_service_owner_pct:number|null;
  solar_panels_service_by:ServiceBy|null; solar_panels_service_frequency:string|null; solar_panels_service_owner_pct:number|null;
  pest_control_by:ServiceBy|null; pest_control_frequency:string|null; pest_control_owner_pct:number|null; annual_services_notes:string|null;
  prepay_option:boolean; prepay_months:number|null; prepay_discount_pct:number|null;
  prepay_invested:boolean; prepay_invest_rate:number|null; prepay_invest_type:string|null; prepay_invest_term:string|null;
  lease_doc_url:string|null; lease_doc_name:string|null; lease_doc_external_url:string|null;
  status:'active'|'past'|null; rent_due_day:number|null;
  deposit_method:string|null; deposit_paid_on:string|null; move_out_date:string|null;
  furnishing:string|null; rent_iban:string|null;
  created_at:string;
}
interface RentPayment { id:string; tenant_id:string; property_id:string; user_id:string; period_month:number; period_year:number; amount:number; base_rent:number|null; services_charge:number|null; paid:boolean; paid_date:string|null; days_late:number|null; notes:string|null; method:string|null; receipt_url:string|null; receipt_doc_id:string|null; due_date:string|null; tenant_declared:boolean|null; tenant_declared_at:string|null; tenant_note:string|null; created_at:string; }
// Φθορές & επισκευές ανά ενοικιαστή (πίνακας tenant_damages).
interface TenantDamage { id:string; tenant_id:string; property_id:string; user_id:string; occurred_on:string|null; description:string; cost:number|null; charged_to_tenant:boolean; repaired:boolean; repaired_on:string|null; notes:string|null; created_at:string; }
// Συγκρίσιμα αγοράς (rent_comparables) — μόνο τα πεδία που χρειάζεται η πρόταση.
interface RentComp { id:string; property_id:string; title:string; area:string|null; sqm:number|null; rent:number|null; rent_per_sqm:number|null; listing_type:string|null; source:string|null; url:string|null; }
// Αιτήματα βλάβης (maintenance_requests) — από την πύλη ενοικιαστή προς τον ιδιοκτήτη.
interface MaintenanceReq { id:string; property_id:string; user_id:string|null; tenant_id:string|null; title:string; description:string|null; contact:string|null; category:string|null; status:string|null; resolved_at:string|null; photos:string[]|null; assignee_name:string|null; assignee_contact:string|null; created_at:string; }
// Τρόποι καταβολής εγγύησης (ελληνικά, σταθερή σειρά).
const DEPOSIT_METHODS = ['Μετρητά','Τραπεζική κατάθεση','Ηλεκτρονική πληρωμή'] as const;
// Παράγωγη κατάσταση: «προηγούμενος» αν σημειώθηκε αποχώρηση ή status='past'.
const isPastTenant = (t:{status?:string|null;move_out_date?:string|null}) => t.status==='past' || !!t.move_out_date;

// Τρόποι πληρωμής ενοικίου (ελληνικά, σταθερή σειρά).
const PAY_METHODS = ['Μετρητά','Τραπεζική κατάθεση','Ηλεκτρονική πληρωμή','Κάρτα'] as const;
type PayMethod = typeof PAY_METHODS[number];
const todayISO = () => new Date().toISOString().slice(0,10);
// Τελευταία ημέρα του ΕΠΟΜΕΝΟΥ μήνα από μια ημερομηνία (προθεσμία δήλωσης ΑΑΔΕ).
const lastDayNextMonth = (iso:string) => {
  const d = new Date(iso+'T00:00:00'); if(isNaN(d.getTime())) return '—';
  const last = new Date(d.getFullYear(), d.getMonth()+2, 0);
  return last.toLocaleDateString('el-GR', { day:'2-digit', month:'long', year:'numeric' });
};
interface CommLog { id:string; tenant_id:string; type:'call'|'email'|'sms'|'meeting'|'note'; summary:string; date:string; outcome:string|null; }
interface TabTenantProps { propertyId:string; userId:string; onStartHandover?:(tenantName:string,tenantPhone:string,type:'check_in'|'check_out')=>void; }

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];
// ─── Owner-share helpers (ποσοστό ιδιοκτήτη 0–100 ⇄ enum *_service_by) ──────────
// Στη φόρτωση: αν η στήλη ποσοστού είναι null, παράγουμε την αρχική τιμή από το
// υπάρχον enum (owner→100, tenant→0, split→50) ώστε τα παλιά δεδομένα να δείχνουν σωστά.
const ownerPctFromBy = (pct:number|null|undefined, by:ServiceBy|null|undefined):number =>
  pct != null ? Math.max(0, Math.min(100, Math.round(pct))) : by === 'tenant' ? 0 : by === 'split' ? 50 : 100;
// Στην αποθήκευση: κρατάμε το enum συγχρονισμένο με το ποσοστό (100→owner, 0→tenant, αλλιώς split).
const byFromOwnerPct = (pct:number):ServiceBy => { const p = Math.round(pct); return p >= 100 ? 'owner' : p <= 0 ? 'tenant' : 'split'; };

// ─── Τύπος επίπλωσης — καθορίζει ποιες ενότητες υπηρεσιών ισχύουν ────────────────
type Furnishing = 'empty' | 'furnished' | 'turnkey';
const FURNISHING_LABELS: Record<Furnishing,string> = {
  empty:'Κενό', furnished:'Επιπλωμένο', turnkey:'Turn Key (All Inclusive)',
};
// Ορατότητα ενοτήτων υπηρεσιών ανά τύπο επίπλωσης: ο «κενός» δεν βλέπει streaming
// ούτε καθαρισμό· ο «επιπλωμένος» βλέπει καθαρισμό· ο turn-key τα πάντα. Όταν δεν
// έχει οριστεί τύπος (παλαιά δεδομένα) εμφανίζονται όλα, ώστε να μη χαθεί χρέωση.
function svcVisible(furnishing:string|null|undefined):{streaming:boolean;cleaning:boolean}{
  if(furnishing==='empty')     return { streaming:false, cleaning:false };
  if(furnishing==='furnished') return { streaming:false, cleaning:true  };
  return { streaming:true, cleaning:true }; // 'turnkey' ή μη ορισμένο
}
// ─── Ανάλυση δόσης: βασικό ενοίκιο + χρέωση υπηρεσιών (σέβεται τον τύπο επίπλωσης) ─
type SvcInput = { furnishing?:string|null; monthly_rent?:number|null; cleaning?:CleaningCfg|null; streaming?:StreamingSvc[]|null; parking_extra?:boolean; parking_extra_price?:number|null };
const tenantBaseRent = (t:SvcInput):number => Math.max(0, t.monthly_rent||0);
function tenantServicesCharge(t:SvcInput):number{
  const vis=svcVisible(t.furnishing);
  const clean =vis.cleaning ?(t.cleaning?.total_tenant||0):0;
  const stream=vis.streaming?(t.streaming||[]).filter(sv=>sv.included).reduce((a,sv)=>a+(sv.charged_tenant||0),0):0;
  const park  =t.parking_extra?(t.parking_extra_price||0):0;
  return Math.max(0, clean+stream+park);
}
// Ανάλυση γραμμών υπηρεσιών (για μηνιαία κατάσταση προς τον μισθωτή).
function tenantServiceLines(t:SvcInput):{label:string;amount:number}[]{
  const vis=svcVisible(t.furnishing); const out:{label:string;amount:number}[]=[];
  if(vis.streaming) (t.streaming||[]).filter(sv=>sv.included).forEach(sv=>out.push({label:sv.name,amount:sv.charged_tenant||0}));
  if(vis.cleaning && (t.cleaning?.total_tenant||0)>0) out.push({label:'Καθαρισμός',amount:t.cleaning!.total_tenant});
  if(t.parking_extra && (t.parking_extra_price||0)>0) out.push({label:'Χώρος στάθμευσης',amount:t.parking_extra_price||0});
  return out.filter(l=>l.amount>0);
}

// ─── Micro components ─────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <div style={labelStyle}>{children}</div>;
}

// Κεφαλίδα ενότητας: ίδια οπτική με το κοινό SecHdr (χωρίς διακοσμητική τελεία),
// για ομοιομορφία με όλο το app.
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
      <span style={{ fontSize:'10px', letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, fontWeight:700 }}>{children}</span>
    </div>
  );
}

// Διακριτική ενότητα υπηρεσίας με προοδευτική αποκάλυψη (quiet toggle → λεπτομέρεια).
function SvcSection({ title, hint, open, onToggle, children }: { title:string; hint?:string; open:boolean; onToggle:()=>void; children:React.ReactNode }) {
  return (
    <div style={{ border:`1px solid ${open?'var(--border-default)':'var(--border-subtle)'}`, borderRadius:T.radius.inner, marginBottom:10, background:'var(--bg-elevated)', overflow:open?'visible':'hidden', transition:'border-color 0.15s' }}>
      <div onClick={onToggle} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding:'12px 16px', cursor:'pointer', userSelect:'none' as const }}>
        <div style={{ minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', fontFamily:T.font.sans }}>{title}</div>
          {hint&&<div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:2, lineHeight:1.4 }}>{hint}</div>}
        </div>
        <div style={{ pointerEvents:'none' as const, flexShrink:0 }}><Toggle on={open} onChange={()=>{}} size="sm"/></div>
      </div>
      {open&&<div style={{ padding:'2px 16px 18px' }}>{children}</div>}
    </div>
  );
}

// ─── SplitBar ─────────────────────────────────────────────────────────────────
// Premium έλεγχος κατανομής κόστους ιδιοκτήτη/ενοικιαστή (0–100). Τρία γρήγορα
// presets σε pills + συρόμενη μπάρα για οποιονδήποτε διαμοιρασμό. Πλήρως
// προσβάσιμο με πληκτρολόγιο (βέλη / PageUp-Down / Home / End).
function SplitBar({ owner, onChange }: { owner:number; onChange:(v:number)=>void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const clamp = (n:number) => Math.max(0, Math.min(100, Math.round(n)));
  const fromClientX = (clientX:number) => {
    const el = trackRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    onChange(clamp(((clientX - r.left) / r.width) * 100));
  };
  const onDown = (e:React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    setDragging(true); fromClientX(e.clientX);
  };
  const onMove = (e:React.PointerEvent<HTMLDivElement>) => { if (dragging) fromClientX(e.clientX); };
  const onUp = (e:React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };
  const onKey = (e:React.KeyboardEvent<HTMLDivElement>) => {
    const steps:Record<string,number> = { ArrowLeft:-1, ArrowDown:-1, ArrowRight:1, ArrowUp:1, PageDown:-10, PageUp:10 };
    let next:number|undefined;
    if (e.key in steps) next = owner + steps[e.key];
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    if (next === undefined) return;
    e.preventDefault(); onChange(clamp(next));
  };
  const tenant = 100 - owner;
  const presets:[string,number][] = [['Ιδιοκτήτης',100],['Μοιρασμένο',50],['Ενοικιαστής',0]];
  return (
    <div>
      {/* Ζωντανή ένδειξη */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12, marginBottom:11 }}>
        <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans }}>
          Ιδιοκτήτης <strong style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontSize:13, fontWeight:700 }}>{owner}%</strong>
        </span>
        <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans }}>
          Ενοικιαστής <strong style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontSize:13, fontWeight:700 }}>{tenant}%</strong>
        </span>
      </div>
      {/* Μπάρα, σύρσιμο ή πληκτρολόγιο */}
      <div
        ref={trackRef}
        role="slider"
        aria-label="Κατανομή κόστους ιδιοκτήτη προς ενοικιαστή"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={owner}
        aria-valuetext={`Ιδιοκτήτης ${owner}%, Ενοικιαστής ${tenant}%`}
        tabIndex={0}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onKeyDown={onKey}
        style={{
          position:'relative', height:14, borderRadius:999,
          background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)',
          cursor:'pointer', touchAction:'none', outline:'none',
        }}
      >
        <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${owner}%`, background:'var(--accent)', borderRadius:999, transition: dragging ? 'none' : 'width 0.18s cubic-bezier(0.2,0,0,1)' }}/>
        <div style={{
          position:'absolute', top:'50%', left:`${owner}%`, transform:'translate(-50%,-50%)',
          width:22, height:22, borderRadius:'50%',
          background:'var(--bg-surface)', border:'2px solid var(--accent)',
          boxShadow: dragging ? 'var(--elev-3)' : 'var(--elev-2)',
          transition: dragging ? 'none' : 'left 0.18s cubic-bezier(0.2,0,0,1), box-shadow 0.15s',
          display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none',
        }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--text-tertiary)' }}/>
        </div>
      </div>
      {/* Γρήγορα presets */}
      <div style={{ display:'flex', gap:6, marginTop:12 }}>
        {presets.map(([label,val])=>{
          const active = owner === val;
          return (
            <button key={label} type="button" onClick={()=>onChange(val)}
              style={{
                flex:1, height:30, borderRadius:999, cursor:'pointer',
                fontFamily:T.font.sans, fontSize:11, fontWeight: active ? 600 : 500,
                border:`1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
                background: active ? 'var(--accent-dim)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                transition:'all 0.15s',
              }}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color='var(--text-primary)', sub }: { label:string; value:string; color?:string; sub?:string }) {
  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'16px 14px', display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ fontSize:'18px', fontWeight:700, color, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.5px', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:'10px', color:'var(--text-secondary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{sub}</div>}
      <div style={{ fontSize:'9px', letterSpacing:'0.12em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{label}</div>
    </div>
  );
}

function StatusBadge({ label, color, bg }: { label:string; color:string; bg:string }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:T.radius.badge, fontSize:'10px', letterSpacing:'0.08em', textTransform:'uppercase' as const, color, background:bg, border:`1px solid color-mix(in srgb, ${color} 20%, transparent)`, fontFamily:T.font.sans, fontWeight:600 }}>
      {label}
    </span>
  );
}

function DataRow({ label, value, mono=false }: { label:string; value:React.ReactNode; mono?:boolean }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid var(--border-subtle)' }}>
      <span style={{ fontSize:'12px', color:'var(--text-secondary)', fontFamily:T.font.sans }}>{label}</span>
      <span style={{ fontSize:'12px', color:'var(--text-primary)', fontFamily:mono?T.font.mono:T.font.sans, fontVariantNumeric:(mono?'tabular-nums':'normal') as 'tabular-nums'|'normal', fontWeight:mono?600:400, textAlign:'right' as const, maxWidth:'55%' }}>{value}</span>
    </div>
  );
}

function AlertBar({ text, level='warning' }: { text:string; level?:'critical'|'warning'|'info' }) {
  const color = level==='critical' ? 'var(--negative)' : level==='warning' ? 'var(--warning)' : 'var(--accent)';
  const bg    = level==='critical' ? 'var(--negative-dim)' : level==='warning' ? 'var(--warning-dim)' : 'var(--accent-dim)';
  return (
    <div style={{ background:bg, border:`1px solid ${color}44`, borderLeft:`3px solid ${color}`, borderRadius:T.radius.inner, padding:'10px 16px', marginBottom:8, fontSize:'12px', color, fontFamily:T.font.sans, fontWeight:500, lineHeight:1.5 }}>
      {text}
    </div>
  );
}

// ─── Score Engine ─────────────────────────────────────────────────────────────
function calcScore(payments:RentPayment[], tenant:Tenant|null) {
  if (!payments.length||!tenant) return { score:0, label:'Ανεπαρκή στοιχεία', color:'var(--text-tertiary)', breakdown:[] };
  const paid=payments.filter(p=>p.paid);
  const unpaid=payments.filter(p=>!p.paid);
  const late=paid.filter(p=>(p.days_late||0)>0);
  const avgLate=late.length?late.reduce((a,p)=>a+(p.days_late||0),0)/late.length:0;
  const payRate=paid.length/payments.length;
  const profilePts=[tenant.email,tenant.phone,tenant.afm,tenant.iban,tenant.id_doc_number].filter(Boolean).length/5;
  let score=100;
  score-=unpaid.length*8; score-=late.length*4; score-=Math.min(avgLate*0.5,15); score+=profilePts*10;
  score=Math.max(0,Math.min(100,Math.round(score)));
  const label=score>=85?'Άριστος':score>=70?'Καλός':score>=50?'Μέτριος':'Προβληματικός';
  const color=score>=85?'var(--positive)':score>=70?'var(--accent)':score>=50?'var(--warning)':'var(--negative)';
  return { score, label, color, breakdown:[
    {label:'Ποσοστό πληρωμών',value:`${(payRate*100).toFixed(0)}%`,ok:payRate>=0.9},
    {label:'Εκκρεμείς πληρωμές',value:String(unpaid.length),ok:unpaid.length===0},
    {label:'Μέση καθυστέρηση',value:avgLate>0?`${avgLate.toFixed(0)} ημέρες`:'—',ok:avgLate<=5},
    {label:'Πληρότητα προφίλ',value:`${(profilePts*100).toFixed(0)}%`,ok:profilePts>=0.8},
  ]};
}

// ─── Predictive Alerts ────────────────────────────────────────────────────────
function predictAlerts(payments:RentPayment[], tenant:Tenant|null):{text:string;level:'critical'|'warning'|'info'}[] {
  if (!payments.length||!tenant) return [];
  const alerts:{text:string;level:'critical'|'warning'|'info'}[]=[];
  const lateMonths:Record<number,number>={};
  payments.filter(p=>(p.days_late||0)>5).forEach(p=>{lateMonths[p.period_month]=(lateMonths[p.period_month]||0)+1;});
  const nextM=(new Date().getMonth()+2)%12||12;
  if((lateMonths[nextM]||0)>=2) alerts.push({text:`Βάσει ιστορικού: συχνές καθυστερήσεις τον ${MONTHS_GR[nextM-1]}, προετοιμάσου εγκαίρως`,level:'warning'});
  if((lateMonths[7]||0)+(lateMonths[8]||0)>=2) alerts.push({text:'Πρότυπο καλοκαιριού: ιστορικά αυξημένες καθυστερήσεις Ιούλιο/Αύγουστο',level:'warning'});
  const d=daysLeft(tenant.lease_end);
  if(d!==null){
    if(d<0) alerts.push({text:'Το μισθωτήριο έχει λήξει, ανανέωσε ή ξεκίνα διαδικασία αποχώρησης',level:'critical'});
    else if(d<=30) alerts.push({text:`Κρίσιμο: Λήξη μισθωτηρίου σε ${d} ημέρες, απαιτείται άμεση ενέργεια`,level:'critical'});
    else if(d<=60) alerts.push({text:`Λήξη μισθωτηρίου σε ${d} ημέρες, ξεκίνα διαπραγματεύσεις ανανέωσης`,level:'warning'});
    else if(d<=90) alerts.push({text:`Λήξη μισθωτηρίου σε ${d} ημέρες`,level:'info'});
  }
  const unpaid=payments.filter(p=>!p.paid);
  if(unpaid.length>=2) alerts.push({text:`${unpaid.length} εκκρεμείς πληρωμές, απαιτείται άμεση ενέργεια`,level:'critical'});
  return alerts;
}

// ─── Payment Bar Chart ────────────────────────────────────────────────────────
function PaymentBars({ payments }:{payments:RentPayment[]}) {
  if(!payments.length) return (
    <div style={{ textAlign:'center', padding:'32px 0', color:'var(--text-tertiary)', fontSize:12, fontFamily:T.font.sans }}>
      Δεν υπάρχουν δεδομένα πληρωμών
    </div>
  );
  const last12=[...payments].sort((a,b)=>b.period_year-a.period_year||b.period_month-a.period_month).slice(0,12).reverse();
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:5, height:72, marginBottom:6 }}>
        {last12.map((p)=>{
          const late=p.days_late||0;
          const color=!p.paid?'var(--negative)':late>14?'var(--warning)':late>0?'var(--info)':'var(--positive)';
          return (
            <div key={p.id} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center' }}
              title={`${MONTHS_GR[p.period_month-1]} ${p.period_year}: ${p.paid?'Εξοφλήθη':'Εκκρεμεί'}${late>0?` (${late} ημ. καθυστέρηση)`:''}`}>
              <div style={{ width:'100%', height:p.paid?72:36, background:color, borderRadius:'3px 3px 0 0', opacity:0.8, transition:'height 0.4s ease' }}/>
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', gap:5 }}>
        {last12.map((p,i)=>(
          <div key={i} style={{ flex:1, fontSize:7, color:'var(--text-tertiary)', textAlign:'center' as const, fontFamily:T.font.sans }}>
            {MONTHS_GR[p.period_month-1]}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexWrap:'wrap' as const, gap:'10px 16px', marginTop:12 }}>
        {[['var(--positive)','Εμπρόθεσμη'],['var(--info)','Μικρή καθυστέρηση'],['var(--warning)','Μεγάλη καθυστέρηση'],['var(--negative)','Εκκρεμεί']].map(([c,l])=>(
          <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:c, flexShrink:0 }}/>
            <span style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard View ────────────────────────────────────────────────────────────
function DashboardView({ tenant, payments }:{ tenant:Tenant; payments:RentPayment[] }) {
  const score=useMemo(()=>calcScore(payments,tenant),[payments,tenant]);
  const alerts=useMemo(()=>predictAlerts(payments,tenant),[payments,tenant]);
  const d=daysLeft(tenant.lease_end); const st=leaseSt(d);
  const streaming=tenant.streaming||[];
  const vis=svcVisible(tenant.furnishing);
  const servicesCharge=tenantServicesCharge(tenant);
  const totalTenant=tenantBaseRent(tenant)+servicesCharge;
  const ownerCosts=(vis.cleaning?(tenant.cleaning?.total_owner||0):0)+(vis.streaming?streaming.filter(sv=>sv.included).reduce((a,sv)=>a+sv.cost_owner,0):0);
  const paidPay=payments.filter(p=>p.paid);
  const unpaidAmt=payments.filter(p=>!p.paid).reduce((a,p)=>a+p.amount,0);
  const late=paidPay.filter(p=>(p.days_late||0)>0);
  const avgLate=late.length?late.reduce((a,p)=>a+(p.days_late||0),0)/late.length:0;
  const annualRent=(tenant.monthly_rent||0)*12;
  const streamOwnerCost=(vis.streaming?streaming.filter(sv=>sv.included).reduce((a,sv)=>a+sv.cost_owner,0):0)*12;
  const cleanOwnerCost=(vis.cleaning?(tenant.cleaning?.total_owner||0):0)*12;
  const totalCosts=streamOwnerCost+cleanOwnerCost;
  const netIncome=annualRent-totalCosts;
  const totalReceived=paidPay.reduce((a,p)=>a+p.amount,0);
  const profileFields=[tenant.full_name,tenant.email,tenant.phone,tenant.afm,tenant.iban,tenant.id_doc_number,tenant.nationality,tenant.profession,tenant.lease_start,tenant.monthly_rent,tenant.deposit_amount];
  const completePct=Math.round(profileFields.filter(Boolean).length/profileFields.length*100);

  return (
    <div>
      {/* Predictive Alerts */}
      {alerts.length>0&&(
        <div style={{ marginBottom:20 }}>
          {alerts.map((a,i)=><AlertBar key={i} text={a.text} level={a.level}/>)}
        </div>
      )}

      {/* KPI Strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 90px), 1fr))', gap:10, marginBottom:20 }}>
        <KpiCard label="Βασικό Ενοίκιο" value={fmt(tenant.monthly_rent)} color="var(--text-primary)"/>
        <KpiCard label="Σύνολο Μηνιαίως" value={fmt(totalTenant)} color="var(--text-primary)"/>
        <KpiCard label="Κόστη Ιδιοκτήτη" value={fmt(ownerCosts)} color="var(--text-primary)"/>
        <KpiCard label="Λήξη Μίσθωσης" value={d==null?'—':d<0?'Έληξε':`${d} ημέρες`} color={st?.color||'var(--text-primary)'}/>
        <KpiCard label="Εκκρεμή Ποσά" value={fmt(unpaidAmt)} color={unpaidAmt>0?'var(--negative)':'var(--positive)'}/>
        <KpiCard label="Εγγύηση" value={fmt(tenant.deposit_amount)} color={tenant.deposit_returned?'var(--positive)':'var(--accent)'}/>
      </div>

      {/* Score + Profile */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:16, marginBottom:16 }}>
        {/* Βαθμολογία Αξιοπιστίας */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle><span title="Βαθμολογία αξιοπιστίας ενοικιαστή, βάσει ιστορικού πληρωμών, καθυστερήσεων και πληρότητας προφίλ">Βαθμολογία Αξιοπιστίας</span></SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:24 }}>
            <div style={{ position:'relative', width:96, height:96, flexShrink:0 }}>
              <svg width="96" height="96" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="40" fill="none" stroke="var(--bg-overlay)" strokeWidth="8"/>
                <circle cx="48" cy="48" r="40" fill="none" stroke={score.color} strokeWidth="8"
                  strokeDasharray={`${(score.score/100)*251.2} 251.2`}
                  strokeLinecap="round" transform="rotate(-90 48 48)"
                  style={{ transition:'stroke-dasharray 1s ease' }}/>
              </svg>
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <div style={{ fontSize:24, fontWeight:700, color:score.color, fontFamily:T.font.num, fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{score.score}</div>
                <div style={{ fontSize:8, color:'var(--text-tertiary)', letterSpacing:'0.5px', textTransform:'uppercase' as const }}>/100</div>
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:18, fontWeight:600, color:score.color, fontFamily:T.font.sans, marginBottom:12 }}>{score.label}</div>
              {score.breakdown.map((b:any,i:number)=>(
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{b.label}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:b.ok?'var(--positive)':'var(--warning)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{b.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Profile Completeness */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Πληρότητα Προφίλ</SectionTitle>
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans }}>Ολοκλήρωση</span>
              <span style={{ fontSize:16, fontWeight:700, color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{completePct}%</span>
            </div>
            <div style={{ height:6, background:'var(--bg-overlay)', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${completePct}%`, background:completePct>=80?'var(--positive)':completePct>=50?'var(--accent)':'var(--warning)', borderRadius:3, transition:'width 0.8s ease' }}/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:'2px 16px' }}>
            {[['Ονοματεπώνυμο',!!tenant.full_name],['Email',!!tenant.email],['Τηλέφωνο',!!tenant.phone],['ΑΦΜ',!!tenant.afm],['IBAN',!!tenant.iban],['Εγγύηση',!!tenant.deposit_amount],['Έναρξη Μίσθωσης',!!tenant.lease_start],['Ενοίκιο',!!tenant.monthly_rent]].map(([lbl,ok],i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid var(--border-subtle)' }}>
                <span style={{ fontSize:11, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{lbl as string}</span>
                <span style={{ fontSize:12, color:ok?'var(--positive)':'var(--text-tertiary)', display:'flex', alignItems:'center' }}>{ok?<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>:'—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment History Chart */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Ιστορικό Πληρωμών, Τελευταίοι 12 Μήνες</SectionTitle>
        <PaymentBars payments={payments}/>
        {payments.length>0&&(
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:10, marginTop:20 }}>
            <KpiCard label="Πληρωμές" value={`${paidPay.length}/${payments.length}`} color="var(--text-primary)"/>
            <KpiCard label="Ποσοστό Εξόφλησης" value={`${((paidPay.length/payments.length)*100).toFixed(0)}%`} color="var(--text-primary)"/>
            <KpiCard label="Μέση Καθυστέρηση" value={avgLate>0?`${avgLate.toFixed(0)} ημέρες`:'Χωρίς'} color={avgLate>7?'var(--warning)':'var(--positive)'}/>
            <KpiCard label="Εισπραχθέντα Σύνολο" value={fmt(totalReceived)} color="var(--text-primary)"/>
          </div>
        )}
      </div>

      {/* Financial Analysis */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Οικονομική Ανάλυση Ενοικιαστή</SectionTitle>
        <DataRow label="Ακαθάριστα Ενοίκια ανά Έτος" value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(annualRent)}</span>}/>
        <DataRow label="Κόστη Ιδιοκτήτη ανά Έτος" value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>-{fmt(totalCosts)}</span>}/>
        <DataRow label="Καθαρό Εισόδημα ανά Έτος" value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:15 }}>{fmt(netIncome)}</span>}/>
        <DataRow label="Εισπραχθέντα Σύνολο" value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(totalReceived)}</span>}/>
        <DataRow label="Εκκρεμή Σύνολο" value={<span style={{ color:unpaidAmt>0?'var(--negative)':'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(unpaidAmt)}</span>}/>
      </div>
    </div>
  );
}

// Μέση ετήσια μεταβολή ΔΤΚ (ΕΛΣΤΑΤ) — ΜΙΑ πηγή, χρησιμοποιείται και στην
// Αναπροσαρμογή και στην πρόταση Ανανέωσης, ώστε να μη διαφωνούν ποτέ.
const CPI_BY_YEAR:Record<number,number>={2015:0.0,2016:0.0,2017:1.1,2018:0.8,2019:0.5,2020:-1.3,2021:0.6,2022:9.3,2023:4.2,2024:2.8,2025:2.5};
const LATEST_CPI_YEAR=Math.max(...Object.keys(CPI_BY_YEAR).map(Number));
const LATEST_CPI_PCT=CPI_BY_YEAR[LATEST_CPI_YEAR];

// ─── Αναπροσαρμογή Ενοικίου (ΔΤΚ) ────────────────────────────────────────────
function RentAdjustView({ tenant, userId }:{ tenant:Tenant; userId:string }) {
  const branding = useReportBranding(userId);
  const TDE=CPI_BY_YEAR;
  const fmtE = fe;
  const fmtDate=(d:string|null)=>d?new Date(d+'T00:00:00').toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'}):'—';
  const rent=tenant.monthly_rent||0;
  const daysExp=tenant.lease_end?Math.ceil((new Date(tenant.lease_end+'T00:00:00').getTime()-Date.now())/86400000):null;
  // Προεπιλογή το πιο πρόσφατο έτος με πραγματικό δείκτη (όχι το τρέχον που δεν έχει ακόμη μέσο όρο).
  const [yr,setYr]=useState(String(Math.max(...Object.keys(TDE).map(Number))));
  const [useCustom,setUseCustom]=useState(false);
  const [customPct,setCustomPct]=useState('');
  const tde=TDE[parseInt(yr)]??2.8;
  const pct=useCustom?(parseFloat(customPct)||0):tde;
  const newRent=rent*(1+pct/100);
  const diff=newRent-rent;
  const isExpired=daysExp!==null&&daysExp<0;
  const isExpiring=daysExp!==null&&daysExp>=0&&daysExp<=60;

  const selectStyle:React.CSSProperties={width:'100%',height:42,background:'var(--bg-elevated)',border:'1px solid var(--border-default)',borderRadius:T.radius.inner,padding:'0 14px',color:'var(--text-primary)',fontSize:14,letterSpacing:0,fontFamily:T.font.sans,outline:'none',cursor:'pointer'};

  const genLetter=()=>{
    const today_str=new Date().toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'});
    const w=window.open('','_blank','width=820,height=760');
    if(!w){alert('Επίτρεψε τα popups');return;}
    w.document.write(`<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8"><title>Αναπροσαρμογή Μισθώματος</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Inter',system-ui,sans-serif;max-width:740px;margin:0 auto;padding:40px;color:#111;background:#fff;font-size:13px;line-height:1.8;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:28px}
      .brand{display:flex;align-items:center;gap:11px}
      .mark{width:34px;height:34px;border-radius:8px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px}
      h1{font-size:18px;font-weight:700;color:#111;letter-spacing:-.01em}
      .sub{font-size:11px;color:#6b7280;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{padding:12px 16px;border:1px solid #d1d5db;font-size:13px;color:#374151}
      th{background:#f8f9fa;font-weight:600;text-align:left;color:#111}
      td.r{text-align:right;font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;color:#111;white-space:nowrap}
      tr.highlight td{background:#f8f9fa;font-weight:700;color:#111}
      .signatures{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:72px}
      .sig{border-top:1px solid #d1d5db;padding-top:10px;font-size:11px;color:#6b7280}
      .footer{margin-top:40px;font-size:10px;color:#6b7280;text-align:center;border-top:1px solid #d1d5db;padding-top:12px}
      @media print{body{margin:0;padding:24px}@page{margin:16mm}}
    </style></head><body>
    <div class="header">
      <div class="brand">
        ${brandLogoImg(branding,34)||`<div class="mark">P</div>`}
        <div>
          <h1>Ειδοποίηση Αναπροσαρμογής Μισθώματος</h1>
          <div class="sub">Βάσει Δείκτη Τιμών Καταναλωτή (ΔΤΚ) ${esc(yr)}${branding?.companyName ? ' · '+brandName(branding) : ' · Property OS'}</div>
        </div>
      </div>
      <div class="sub" style="text-align:right;white-space:nowrap">${esc(today_str)}</div>
    </div>
    <p style="margin-bottom:8px"><strong>Ημερομηνία:</strong> ${esc(today_str)}</p>
    <p style="margin-bottom:20px">Προς: <strong>${esc(tenant.full_name)}</strong>${tenant.afm?'&nbsp;&nbsp;|&nbsp;&nbsp;ΑΦΜ: <strong>'+esc(tenant.afm)+'</strong>':''}</p>
    <p style="margin-bottom:16px;line-height:1.7">Σας γνωστοποιούμε ότι, βάσει του Δείκτη Τιμών Καταναλωτή (ΔΤΚ) έτους <strong>${esc(yr)}</strong>, όπως ανακοινώθηκε από την ΕΛΣΤΑΤ, το μηνιαίο μίσθωμα αναπροσαρμόζεται ως εξής:</p>
    <table>
      <tr><th>Στοιχείο</th><th style="text-align:right">Αξία</th></tr>
      <tr><td>Τρέχον Μηνιαίο Μίσθωμα</td><td class="r">${esc(fmtE(rent))}</td></tr>
      <tr><td>ΔΤΚ ${esc(yr)} (ΕΛΣΤΑΤ)</td><td class="r">+${esc(pct.toFixed(2))}%</td></tr>
      <tr><td>Αύξηση Μισθώματος</td><td class="r">+${esc(fmtE(diff))}</td></tr>
      <tr class="highlight"><td><strong>Νέο Μηνιαίο Μίσθωμα</strong></td><td class="r"><strong>${esc(fmtE(newRent))}</strong></td></tr>
    </table>
    <p style="font-size:12px;color:#6b7280;margin-top:16px">Η αναπροσαρμογή ισχύει από την επόμενη μισθωτική περίοδο μετά την κοινοποίηση της παρούσας ειδοποίησης.</p>
    <div class="signatures">
      <div class="sig"><p style="font-weight:600;margin-bottom:4px;color:#111">Ο Εκμισθωτής</p><p style="height:40px"></p><p>Υπογραφή / Σφραγίδα</p></div>
      <div class="sig"><p style="font-weight:600;margin-bottom:4px;color:#111">Ο Μισθωτής</p><p style="margin-bottom:2px">${esc(tenant.full_name)}</p>${tenant.afm?'<p>ΑΦΜ: '+esc(tenant.afm)+'</p>':''}</div>
    </div>
    <div class="footer">Έγγραφο δημιουργήθηκε μέσω ${branding?.companyName ? brandName(branding) : 'Property OS'}${brandContactLine(branding) ? ' · '+brandContactLine(branding) : ''}, Για νομικές υποθέσεις συμβουλευτείτε δικηγόρο</div>
    </body></html>`);
    w.document.close();setTimeout(()=>w.print(),800);
  };

  return (
    <div>
      {/* Εξήγηση ΔΤΚ */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Τι είναι ο Δείκτης Τιμών Καταναλωτή (ΔΤΚ)</SectionTitle>
        <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.8, fontFamily:T.font.sans, marginBottom:14 }}>
          Ο <strong style={{ color:'var(--text-primary)' }}>Δείκτης Τιμών Καταναλωτή (ΔΤΚ)</strong> είναι ο επίσημος δείκτης που χρησιμοποιεί η ΕΛΣΤΑΤ για να μετρήσει τη μεταβολή του κόστους ζωής σε ετήσια βάση. Βάσει του Αστικού Κώδικα (άρθρο 288 ΑΚ), ο εκμισθωτής έχει δικαίωμα να αναπροσαρμόσει το μίσθωμα μία φορά τον χρόνο, εφόσον αυτό προβλέπεται στη σύμβαση.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:10 }}>
          {[{label:'Νομική Βάση',value:'Αρ. 288 ΑΚ'},{label:'Συχνότητα',value:'Μία φορά/έτος'},{label:'Πηγή',value:'ΕΛΣΤΑΤ'}].map((item,i)=>(
            <div key={i} style={{ background:'var(--bg-elevated)', borderRadius:T.radius.inner, padding:'12px 14px', textAlign:'center' as const }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', marginBottom:4 }}>{item.value}</div>
              <div style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase' as const, letterSpacing:'0.1em', fontFamily:T.font.sans }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Status strip */}
      {(isExpired||isExpiring)&&(
        <AlertBar
          text={isExpired?`Το μισθωτήριο έληξε στις ${fmtDate(tenant.lease_end)}, ανανέωσε άμεσα πριν οποιαδήποτε αναπροσαρμογή`:`Λήγει σε ${daysExp} ημέρες (${fmtDate(tenant.lease_end)}), προετοίμασε ανανέωση εγκαίρως`}
          level={isExpired?'critical':'warning'}
        />
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:16 }}>
        {/* Calculator */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Υπολογιστής Αναπροσαρμογής</SectionTitle>

          {/* Current rent display */}
          <div style={{ background:'var(--bg-elevated)', borderRadius:T.radius.inner, padding:'16px 18px', marginBottom:18 }}>
            <div style={{ fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:6 }}>Τρέχον Μηνιαίο Μίσθωμα</div>
            <div style={{ fontSize:28, fontWeight:700, color:'var(--text-primary)', fontFamily:T.font.num, fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{fmtE(rent)}</div>
            {tenant.lease_end&&<div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:4 }}>Λήξη: {fmtDate(tenant.lease_end)}</div>}
          </div>

          {/* Year selector */}
          <div style={{ marginBottom:16 }}>
            <div style={{ ...labelStyle, marginBottom:8 }}>Έτος Αναπροσαρμογής</div>
            <select value={yr} onChange={e=>setYr(e.target.value)} style={selectStyle}>
              {Object.keys(TDE).sort((a,b)=>parseInt(b)-parseInt(a)).map(y=>(
                <option key={y} value={y}>{y}, ΔΤΚ: {TDE[parseInt(y)]>=0?'+':''}{TDE[parseInt(y)].toFixed(1)}%</option>
              ))}
            </select>
          </div>

          {/* Custom toggle */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, padding:'12px 14px', background:'var(--bg-elevated)', borderRadius:T.radius.inner }}>
            <Toggle on={useCustom} onChange={setUseCustom} size="sm"/>
            <span style={{ fontSize:12, color:'var(--text-primary)', fontFamily:T.font.sans }}>Προσαρμοσμένο ποσοστό</span>
          </div>
          {useCustom&&(
            <div style={{ marginBottom:16 }}>
              <div style={{ ...labelStyle, marginBottom:8 }}>Ποσοστό Αναπροσαρμογής (%)</div>
              <input type="number" value={customPct} onChange={e=>setCustomPct(e.target.value)} placeholder="π.χ. 3.5" step="0.1"
                style={{ ...selectStyle, border:'1px solid var(--border-default)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontSize:14 }}/>
            </div>
          )}

          {/* TDE History Grid */}
          <div title="ΔΤΚ: Δείκτης Τιμών Καταναλωτή (βάση αναπροσαρμογής ενοικίου), ΕΛΣΤΑΤ: Ελληνική Στατιστική Αρχή" style={{ ...labelStyle, marginBottom:10 }}>Ιστορικό ΔΤΚ (ΕΛΣΤΑΤ)</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 105px), 1fr))', gap:5 }}>
            {Object.entries(TDE).sort(([a],[b])=>parseInt(b)-parseInt(a)).map(([year,rate])=>{
              const active=parseInt(year)===parseInt(yr);
              return (
                <div key={year} onClick={()=>{setYr(year);setUseCustom(false);}}
                  style={{ background:active?'var(--accent-dim)':'var(--bg-elevated)', border:`1px solid ${active?'var(--accent)':'var(--border-subtle)'}`, borderRadius:T.radius.badge, padding:'7px 4px', textAlign:'center' as const, cursor:'pointer', transition:'all 0.15s' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:active?'var(--accent)':'var(--text-secondary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{rate>=0?'+':''}{rate.toFixed(1)}%</div>
                  <div style={{ fontSize:8, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:2 }}>{year}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Results + Actions */}
        <div>
          {rent>0&&(
            <>
              {/* Result Cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:10, marginBottom:14 }}>
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'18px 16px' }}>
                  <div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:6 }}>Τρέχον Μίσθωμα</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)', fontFamily:T.font.num, fontVariantNumeric:'tabular-nums' }}>{fmtE(rent)}</div>
                </div>
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'18px 16px' }}>
                  <div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:6 }}>Νέο Μίσθωμα</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'var(--accent)', fontFamily:T.font.num, fontVariantNumeric:'tabular-nums' }}>{fmtE(newRent)}</div>
                </div>
              </div>

              {/* Breakdown */}
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:18, marginBottom:14 }}>
                {[{label:`Τιμάριθμος ${yr}`,value:`+${pct.toFixed(1)}%`,color:'var(--text-primary)'},
                  {label:'Αύξηση ανά Μήνα',value:`+${fmtE(diff)}`,color:'var(--text-primary)'},
                  {label:'Αύξηση ανά Έτος',value:`+${fmtE(diff*12)}`,color:'var(--text-primary)'}
                ].map((row,i)=>(
                  <DataRow key={i} label={row.label} value={<span style={{ color:row.color, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{row.value}</span>}/>
                ))}
              </div>

              {/* Print Button */}
              <button onClick={genLetter} style={{ width:'100%', height:40, borderRadius:T.radius.btn, border:'none', background:'var(--accent)', color:'var(--accent-text)', cursor:'pointer', fontSize:13, fontFamily:T.font.sans, fontWeight:700, letterSpacing:'0.04em', marginBottom:12 }}>
                Εκτύπωση Ειδοποίησης Αναπροσαρμογής
              </button>
            </>
          )}

          {/* Legal Links */}
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:18 }}>
            <SectionTitle>Υποχρεώσεις και Σύνδεσμοι</SectionTitle>
            {[
              {label:'Καταχώρηση Μισθωτηρίου στην ΑΑΑΔΕ',desc:'Εντός 30 ημερών από υπογραφή',url:'https://www.aade.gr/polites/foroi/misthotiria',urgent:true},
              {label:'Ε2, Δήλωση Εισοδήματος Ακινήτων',desc:'Έως 30 Ιουνίου κάθε έτους',url:'https://www.aade.gr/polites/eisodima/misthotiria-akiniton',urgent:false},
              {label:'Πρότυπο Σύμβασης Μίσθωσης',desc:'Επίσημο πρότυπο ΑΑΑΔΕ',url:'https://www.aade.gr/polites/foroi/misthotiria',urgent:false},
            ].map((link,i)=>(
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', marginBottom:8, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderLeft:'3px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:2 }}>{link.label}</div>
                  <div style={{ fontSize:10, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>{link.desc}</div>
                </div>
                <span style={{ fontSize:14, color:'var(--accent)' }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Communication View ────────────────────────────────────────────────────────
function CommView({ tenant, propertyId, userId }:{ tenant:Tenant; propertyId:string; userId:string }) {
  const supabase=createClient();
  const [logs,setLogs]=useState<CommLog[]>([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({type:'call' as CommLog['type'],summary:'',date:new Date().toISOString().split('T')[0],outcome:''});
  const [saving,setSaving]=useState(false);
  const TYPE_LABELS:Record<string,string>={call:'Τηλεφωνική Κλήση',email:'Ηλεκτρονικό Ταχυδρομείο',sms:'Μήνυμα',meeting:'Συνάντηση',note:'Σημείωση'};
  const TYPE_SHORT:Record<string,string>={call:'Κλήση',email:'Email',sms:'Μήνυμα',meeting:'Συνάντηση',note:'Σημείωση'};

  useEffect(()=>{loadLogs();},[tenant.id]);
  const loadLogs=async()=>{
    setLoading(true);
    const{data}=await supabase.from('tenant_comm_log').select('*').eq('tenant_id',tenant.id).order('date',{ascending:false});
    setLogs(data||[]);setLoading(false);
  };
  const saveLog=async()=>{
    if(!form.summary.trim())return;setSaving(true);
    await supabase.from('tenant_comm_log').insert({tenant_id:tenant.id,property_id:propertyId,user_id:userId,type:form.type,summary:form.summary.trim(),date:form.date,outcome:form.outcome||null});
    setSaving(false);setShowAdd(false);setForm({type:'call',summary:'',date:new Date().toISOString().split('T')[0],outcome:''});loadLogs();
  };

  const d=daysLeft(tenant.lease_end);
  const reminders=[];
  if(d!==null){
    if(d<=30&&d>=0) reminders.push({label:`Λήξη σε ${d} ημέρες, ζήτα άμεσα απόφαση ανανέωσης`,urgent:true});
    else if(d<=60&&d>=31) reminders.push({label:`Λήξη σε ${d} ημέρες, ενημέρωσε τον ενοικιαστή`,urgent:false});
    else if(d<=90&&d>=61) reminders.push({label:`Λήξη σε ${d} ημέρες, ξεκίνα συζήτηση ανανέωσης`,urgent:false});
  }
  const inputStyle:React.CSSProperties={width:'100%',height:42,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.inner,padding:'0 14px',color:'var(--text-primary)',fontSize:14,letterSpacing:0,fontFamily:T.font.sans,outline:'none',boxSizing:'border-box'};

  return (
    <div>
      {/* Quick Actions */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Γρήγορη Επικοινωνία</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:10, marginBottom:14 }}>
          {tenant.phone&&(
            <a href={`tel:${tenant.phone}`} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)', transition:'border-color 0.15s' }}>
              <div style={{ width:36, height:36, borderRadius:18, background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans, color:'var(--text-primary)' }}>Κλήση</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{tenant.phone}</div></div>
            </a>
          )}
          {tenant.email&&(
            <a href={`mailto:${tenant.email}`} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)' }}>
              <div style={{ width:36, height:36, borderRadius:18, background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans }}>Email</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const, maxWidth:120 }}>{tenant.email}</div></div>
            </a>
          )}
          {tenant.phone&&(
            <a href={whatsappLink(msgDigits(tenant.phone),'')} target="_blank" rel="noopener noreferrer" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)' }}>
              <div style={{ width:36, height:36, borderRadius:18, background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans }}>WhatsApp</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{tenant.phone}</div></div>
            </a>
          )}
          {tenant.phone&&(
            <a href={viberLink('')} target="_blank" rel="noopener noreferrer" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)' }}>
              <div style={{ width:36, height:36, borderRadius:18, background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans }}>Viber</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{tenant.phone}</div></div>
            </a>
          )}
        </div>
        {reminders.map((r,i)=><AlertBar key={i} text={`Υπενθύμιση: ${r.label}`} level={r.urgent?'critical':'warning'}/>)}
      </div>

      {/* Communication Log */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <SectionTitle>Ιστορικό Επικοινωνίας</SectionTitle>
          <button style={s.btnSm} onClick={()=>setShowAdd(v=>!v)}>{showAdd?'Κλείσιμο':'+ Νέα Καταχώρηση'}</button>
        </div>

        {showAdd&&(
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20, marginBottom:20 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:12, marginBottom:12 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom:8 }}>Τύπος Επικοινωνίας</div>
                <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value as any}))} style={inputStyle}>
                  {Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom:8 }}>Ημερομηνία</div>
                <DateField value={form.date} onChange={v=>setForm(f=>({...f,date:v}))}/>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom:8 }}>Αποτέλεσμα</div>
                <input type="text" value={form.outcome} onChange={e=>setForm(f=>({...f,outcome:e.target.value}))} placeholder="π.χ. Θετικό, αρνητικό..." style={inputStyle}/>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ ...labelStyle, marginBottom:8 }}>Σύνοψη Επικοινωνίας *</div>
              <textarea value={form.summary} onChange={e=>setForm(f=>({...f,summary:e.target.value}))} placeholder="Περιγραφή επικοινωνίας..." rows={3}
                style={{ width:'100%', background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:T.radius.inner, padding:'10px 14px', color:'var(--text-primary)', fontSize:14, letterSpacing:0, fontFamily:T.font.sans, outline:'none', boxSizing:'border-box' as const, resize:'vertical' as const, lineHeight:1.6 }}/>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button style={s.btnGhost} onClick={()=>setShowAdd(false)}>Ακύρωση</button>
              <button style={s.btnGold} onClick={saveLog} disabled={saving}>{saving?'Αποθήκευση...':'Αποθήκευση'}</button>
            </div>
          </div>
        )}

        {loading&&<Spinner label="Φόρτωση…" />}
        {!loading&&logs.length===0&&<div style={{ textAlign:'center', padding:40, color:'var(--text-tertiary)', fontSize:13, fontFamily:T.font.sans }}>Δεν υπάρχουν καταχωρήσεις επικοινωνίας</div>}
        {!loading&&logs.map(log=>(
          <div key={log.id} style={{ display:'flex', gap:14, alignItems:'flex-start', padding:'14px 0', borderBottom:'1px solid var(--border-subtle)' }}>
            <div style={{ width:38, height:38, borderRadius:19, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 }}>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{TYPE_SHORT[log.type]}</span>
                <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>{new Date(log.date).toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'})}</span>
                {log.outcome&&<StatusBadge label={log.outcome} color="var(--accent)" bg="var(--accent-dim)"/>}
              </div>
              <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.6 }}>{log.summary}</div>
            </div>
            <button style={s.btnDng} onClick={async()=>{if(!confirm('Διαγραφή;'))return;await supabase.from('tenant_comm_log').delete().eq('id',log.id);loadLogs();}}>Διαγραφή</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Rent Ledger helpers ──────────────────────────────────────────────────────
// Αναμενόμενες μηνιαίες δόσεις από lease_start έως min(αποχώρηση, λήξη, τρέχων μήνας).
// Ο ενοικιαστής που έχει αποχωρήσει ΔΕΝ συσσωρεύει νέες δόσεις μετά την αποχώρηση.
function expectedPeriods(tenant:Tenant, rentDueDay:number):{year:number;month:number;due_date:string}[] {
  if(!tenant.lease_start||!tenant.monthly_rent||tenant.monthly_rent<=0) return [];
  const start=new Date(tenant.lease_start+'T00:00:00');
  if(isNaN(start.getTime())) return [];
  const now=new Date(); now.setHours(0,0,0,0);
  // Όριο δημιουργίας: το νωρίτερο από αποχώρηση, λήξη μίσθωσης, ή τρέχων μήνας.
  const caps=[now];
  if(tenant.move_out_date){ const d=new Date(tenant.move_out_date+'T00:00:00'); if(!isNaN(d.getTime())) caps.push(d); }
  if(tenant.lease_end){ const d=new Date(tenant.lease_end+'T00:00:00'); if(!isNaN(d.getTime())) caps.push(d); }
  const last=caps.reduce((a,b)=>b<a?b:a);
  const out:{year:number;month:number;due_date:string}[]=[];
  let y=start.getFullYear(), m=start.getMonth();
  const lastKey=last.getFullYear()*12+last.getMonth();
  const dueDay=Math.min(Math.max(1,rentDueDay||1),28);
  let guard=0;
  while(y*12+m<=lastKey && guard++<600){
    out.push({year:y,month:m+1,due_date:`${y}-${String(m+1).padStart(2,'0')}-${String(dueDay).padStart(2,'0')}`});
    m++; if(m>11){m=0;y++;}
  }
  return out;
}

type PayStatus='paid'|'overdue'|'pending';
function payStatus(p:RentPayment):PayStatus {
  if(p.paid) return 'paid';
  if(p.due_date && p.due_date<todayISO()) return 'overdue';
  return 'pending';
}

// Ανθεκτική μετατροπή αριθμού από OCR (χειρίζεται «1.200,50», «€», κενά).
const numify=(v:unknown):number|undefined=>{
  if(typeof v==='number') return isFinite(v)?v:undefined;
  if(typeof v!=='string') return undefined;
  const raw=v.replace(/[€\s]/g,'');
  if(!/\d/.test(raw)) return undefined;
  const clean=/,\d{1,2}$/.test(raw)?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');
  const n=parseFloat(clean.replace(/[^0-9.\-]/g,''));
  return isFinite(n)?n:undefined;
};

// Διεθνής μορφή αριθμού για wa.me/viber (προσθέτει 30 σε 10ψήφιο ελληνικό κινητό).
const msgDigits=(p?:string|null)=>{const d=normalizePhone(p);return d.length===10?'30'+d:d;};

// ─── Payments View (Rent Ledger) ───────────────────────────────────────────────
function PaymentsView({ tenant, propertyId, userId, payments, onRefresh, notify }:{
  tenant:Tenant; propertyId:string; userId:string; payments:RentPayment[]; onRefresh:()=>void; notify:(m:string)=>void;
}) {
  const supabase=createClient();
  const branding=useReportBranding(userId);
  const [rentDueDay,setRentDueDay]=useState(Math.min(Math.max(1,tenant.rent_due_day||1),28));
  const [busy,setBusy]=useState(false);
  const [addOpen,setAddOpen]=useState(false);
  const [payF,setPayF]=useState({period_month:new Date().getMonth()+1,period_year:new Date().getFullYear(),amount:'',method:'Τραπεζική κατάθεση' as PayMethod,paid:true,paid_date:todayISO(),notes:''});
  const [mark,setMark]=useState<{p:RentPayment;method:PayMethod;receipt:string}|null>(null);
  const [req,setReq]=useState<RentPayment|null>(null); // αίτημα πληρωμής (IBAN/QR/κοινοποίηση)
  const [copied,setCopied]=useState(false);
  const [prop,setProp]=useState<Record<string,any>|null>(null);
  const [scan,setScan]=useState<{stage:'scanning'|'match'|'error';msg?:string;doc?:ScannedDoc;periodId?:string;method?:PayMethod;docId?:string|null}|null>(null);
  const fileRef=React.useRef<HTMLInputElement>(null);

  useEffect(()=>{ supabase.from('properties').select('*').eq('id',propertyId).maybeSingle().then(({data})=>setProp(data||null)); },[propertyId]);

  const expected=useMemo(()=>expectedPeriods(tenant,rentDueDay),[tenant,rentDueDay]);
  const existingKeys=useMemo(()=>new Set(payments.map(p=>`${p.period_year}-${p.period_month}`)),[payments]);
  const missing=useMemo(()=>expected.filter(e=>!existingKeys.has(`${e.year}-${e.month}`)),[expected,existingKeys]);

  const genForRows=useCallback(async(rows:{year:number;month:number;due_date:string}[])=>{
    if(!rows.length) return;
    // Ανάλυση δόσης: βασικό ενοίκιο + χρέωση υπηρεσιών (streaming/καθαρισμός/στάθμευση,
    // σύμφωνα με τον τύπο επίπλωσης). Το «amount» είναι το συνολικό μηνιαίο ποσό.
    const base=tenantBaseRent(tenant);
    const services=tenantServicesCharge(tenant);
    const amt=base+services;
    const payload=rows.map(r=>({tenant_id:tenant.id,property_id:propertyId,user_id:userId,period_year:r.year,period_month:r.month,amount:amt,base_rent:base,services_charge:services,paid:false,due_date:r.due_date}));
    // UNIQUE(tenant_id,period_year,period_month) προστατεύει· αγνόησε διπλότυπα.
    const{error}=await supabase.from('rent_payments').upsert(payload,{onConflict:'tenant_id,period_year,period_month',ignoreDuplicates:true});
    if(error && !/duplicate|unique/i.test(error.message)) { /* swallow */ }
  },[tenant,propertyId,userId]);

  // Lazy: όταν ανοίγει η προβολή και λείπουν δόσεις, δημιούργησέ τες μία φορά.
  const didLazy=React.useRef(false);
  useEffect(()=>{
    if(didLazy.current) return;
    if(missing.length>0){ didLazy.current=true; (async()=>{ await genForRows(missing); onRefresh(); })(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[missing.length]);

  const generateNow=async()=>{ setBusy(true); await genForRows(missing); setBusy(false); onRefresh(); notify(missing.length?`Δημιουργήθηκαν ${missing.length} δόσεις`:'Οι δόσεις είναι ενημερωμένες'); };

  const sorted=useMemo(()=>[...payments].sort((a,b)=>b.period_year-a.period_year||b.period_month-a.period_month),[payments]);
  const open=useMemo(()=>payments.filter(p=>!p.paid),[payments]);
  const overdue=useMemo(()=>payments.filter(p=>payStatus(p)==='overdue'),[payments]);
  const arrearsTotal=overdue.reduce((a,p)=>a+p.amount,0);
  const received=payments.filter(p=>p.paid).reduce((a,p)=>a+p.amount,0);

  // Τρέχουσα ανάλυση δόσης βάσει προφίλ μισθωτή (ενοίκιο + υπηρεσίες).
  const baseRent=tenantBaseRent(tenant);
  const svcCharge=tenantServicesCharge(tenant);
  const targetAmt=baseRent+svcCharge;
  // Εκκρεμείς δόσεις με ποσό διαφορετικό από το τρέχον (π.χ. άλλαξε ενοίκιο ή υπηρεσίες).
  // Εξαιρούνται όσες δήλωσε ο μισθωτής — έχει δεσμευτεί σε εκείνο το ποσό.
  const staleUnpaid=useMemo(()=>open.filter(p=>!p.tenant_declared && Math.round((p.amount||0)*100)!==Math.round(targetAmt*100)),[open,targetAmt]);
  // Δόσεις που ο μισθωτής δήλωσε ως πληρωμένες μέσω πύλης — αναμένουν επιβεβαίωση είσπραξης.
  const declaredPending=useMemo(()=>open.filter(p=>p.tenant_declared),[open]);
  const syncUnpaidToTarget=async()=>{
    const ids=staleUnpaid.map(p=>p.id); if(!ids.length) return;
    setBusy(true);
    // Ενημερώνει μόνο τις συγκεκριμένες εκκρεμείς δόσεις (όχι δηλωμένες/χειροκίνητες εκτός λίστας).
    await supabase.from('rent_payments').update({amount:targetAmt,base_rent:baseRent,services_charge:svcCharge}).in('id',ids);
    setBusy(false); onRefresh(); notify('Οι εκκρεμείς δόσεις ενημερώθηκαν');
  };

  const doMarkPaid=async(p:RentPayment,method:PayMethod,receipt:string,paidDate:string,docId?:string|null)=>{
    const daysLate=p.due_date && paidDate>p.due_date ? Math.ceil((new Date(paidDate).getTime()-new Date(p.due_date).getTime())/86400000) : 0;
    await supabase.from('rent_payments').update({paid:true,paid_date:paidDate,method,receipt_url:receipt||null,receipt_doc_id:docId??p.receipt_doc_id??null,days_late:daysLate}).eq('id',p.id);
    await setRentDueOccurrencePaid(supabase,tenant.id,propertyId,p.period_year,p.period_month,true);
    onRefresh(); notify('Καταχωρήθηκε ως πληρωμένο');
  };
  const doUnpay=async(p:RentPayment)=>{ await supabase.from('rent_payments').update({paid:false,paid_date:null,days_late:null}).eq('id',p.id); await setRentDueOccurrencePaid(supabase,tenant.id,propertyId,p.period_year,p.period_month,false); onRefresh(); };

  const savePay=async()=>{
    if(!payF.amount){notify('Συμπλήρωσε ποσό');return;}
    setBusy(true);
    const paidDate=payF.paid?payF.paid_date:null;
    const due=`${payF.period_year}-${String(payF.period_month).padStart(2,'0')}-${String(Math.min(Math.max(1,rentDueDay),28)).padStart(2,'0')}`;
    const daysLate=payF.paid&&paidDate&&paidDate>due?Math.ceil((new Date(paidDate).getTime()-new Date(due).getTime())/86400000):0;
    await supabase.from('rent_payments').upsert({tenant_id:tenant.id,property_id:propertyId,user_id:userId,period_month:payF.period_month,period_year:payF.period_year,amount:Math.max(0,parseFloat(payF.amount)),paid:payF.paid,paid_date:paidDate,method:payF.paid?payF.method:null,days_late:daysLate,due_date:due,notes:payF.notes||null},{onConflict:'tenant_id,period_year,period_month'});
    await setRentDueOccurrencePaid(supabase,tenant.id,propertyId,payF.period_year,payF.period_month,payF.paid);
    setBusy(false);setAddOpen(false);setPayF({period_month:new Date().getMonth()+1,period_year:new Date().getFullYear(),amount:'',method:'Τραπεζική κατάθεση',paid:true,paid_date:todayISO(),notes:''});
    onRefresh();notify('Πληρωμή καταχωρήθηκε');
  };

  const propLabel=()=> (prop?.address||prop?.title||prop?.name||prop?.label||'') as string;
  const monthLabel=(p:RentPayment)=>`${MONTHS_FULL[p.period_month-1]} ${p.period_year}`;

  const printReceipt=(p:RentPayment)=>{
    const w=window.open('','_blank','width=820,height=760'); if(!w){alert('Επίτρεψε τα popups');return;}
    const paidDate=p.paid_date?new Date(p.paid_date+'T00:00:00').toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'}):'—';
    const landlord=branding?.companyName?brandName(branding):'Property OS';
    const num=`${p.period_year}-${String(p.period_month).padStart(2,'0')}`;
    w.document.write(`<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8"><title>Απόδειξη Ενοικίου ${esc(num)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Inter',system-ui,sans-serif;max-width:720px;margin:0 auto;padding:40px;color:#111;background:#fff;font-size:13px;line-height:1.7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .header{border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end}
      .brand{display:flex;align-items:center;gap:11px}
      .mark{width:34px;height:34px;border-radius:8px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;flex-shrink:0}
      h1{font-size:19px;font-weight:700;color:#111;letter-spacing:-.01em}
      .sub{font-size:11px;color:#6b7280;margin-top:2px}
      .num{font-size:11px;color:#6b7280;text-align:right;white-space:nowrap}
      table{width:100%;border-collapse:collapse;margin:18px 0}
      th,td{padding:11px 14px;border:1px solid #d1d5db;font-size:13px;text-align:left;color:#374151}
      th{background:#f8f9fa;font-weight:600;width:42%;color:#111}
      tr.amount th,tr.amount td{background:#f8f9fa;font-weight:700;color:#111;font-size:15px}
      tr.amount td{font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
      .sign{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:64px}
      .sig{border-top:1px solid #d1d5db;padding-top:10px;font-size:11px;color:#6b7280}
      .footer{margin-top:36px;font-size:10px;color:#6b7280;text-align:center;border-top:1px solid #d1d5db;padding-top:12px}
      @media print{body{margin:0;padding:24px}@page{margin:16mm}}
    </style></head><body>
    <div class="header"><div class="brand">${brandLogoImg(branding,34)||`<div class="mark">P</div>`}<div><h1>Απόδειξη Είσπραξης Ενοικίου</h1><div class="sub">${esc(landlord)}</div></div></div><div class="num">Αρ. ${esc(num)}<br>Έκδοση: ${esc(new Date().toLocaleDateString('el-GR'))}</div></div>
    <table>
      <tr><th>Εκμισθωτής</th><td>${esc(landlord)}</td></tr>
      <tr><th>Μισθωτής</th><td>${esc(p.tenant_id?tenant.full_name:'')}${tenant.afm?' &nbsp;·&nbsp; ΑΦΜ '+esc(tenant.afm):''}</td></tr>
      ${propLabel()?`<tr><th>Ακίνητο</th><td>${esc(propLabel())}</td></tr>`:''}
      <tr><th>Περίοδος</th><td>${esc(monthLabel(p))}</td></tr>
      <tr><th>Τρόπος πληρωμής</th><td>${esc(p.method||'—')}</td></tr>
      <tr><th>Ημερομηνία πληρωμής</th><td>${esc(paidDate)}</td></tr>
      <tr class="amount"><th>Ποσό</th><td>${esc(p.amount.toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2}))} €</td></tr>
    </table>
    <p style="font-size:12px;color:#6b7280;margin-top:12px">Η παρούσα βεβαιώνει την είσπραξη του ανωτέρω ποσού για το μηνιαίο μίσθωμα της αναφερόμενης περιόδου.</p>
    <div class="sign"><div class="sig"><p style="font-weight:600;margin-bottom:4px;color:#111">Ο Εκμισθωτής</p><p style="height:36px"></p><p>Υπογραφή</p></div><div class="sig"><p style="font-weight:600;margin-bottom:4px;color:#111">Ο Μισθωτής</p><p style="margin-bottom:2px">${esc(tenant.full_name)}</p></div></div>
    <div class="footer">Έγγραφο μέσω ${esc(landlord)}${brandContactLine(branding)?' · '+esc(brandContactLine(branding)):''}</div>
    </body></html>`);
    w.document.close();setTimeout(()=>w.print(),700);
  };

  const reminderText=(p:RentPayment)=>`Υπενθύμιση ενοικίου, ${propLabel()||'ακίνητο'}: μίσθωμα ${p.amount.toLocaleString('el-GR')} € για ${monthLabel(p)}${p.due_date?`, λήξη ${new Date(p.due_date+'T00:00:00').toLocaleDateString('el-GR')}`:''}. Ευχαριστώ.`;
  const receiptText=(p:RentPayment)=>`Εξοφλήθη το ενοίκιο ${monthLabel(p)} (${p.amount.toLocaleString('el-GR')} €)${p.method?`, ${p.method}`:''}. Ευχαριστώ.`;

  // ── Αίτημα πληρωμής (IBAN / QR / κοινοποίηση) ──
  const landlordName=branding?.companyName?brandName(branding):'Ιδιοκτήτης';
  // Πρότυπο EPC (SEPA Credit Transfer / GiroCode) — αναγνωρίζεται από τραπεζικές
  // εφαρμογές. Δεν είναι είσπραξη — απλώς προσυμπληρώνει τη μεταφορά για τον μισθωτή.
  const epcPayload=(iban:string,name:string,amount:number,ref:string)=>
    `BCD\n002\n1\nSCT\n\n${name.slice(0,70)}\n${iban.replace(/\s/g,'').toUpperCase()}\nEUR${amount.toFixed(2)}\n\n\n${ref.slice(0,140)}`;
  const qrSrc=(data:string)=>`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(data)}`;
  const reqRef=(p:RentPayment)=>`Ενοίκιο ${monthLabel(p)}${tenant.full_name?` · ${tenant.full_name}`:''}`;
  const paymentRequestText=(p:RentPayment)=>{
    const br=(p.services_charge&&p.services_charge>0)?` (ενοίκιο ${(p.base_rent||0).toLocaleString('el-GR')} € + υπηρεσίες ${(p.services_charge||0).toLocaleString('el-GR')} €)`:'';
    const ibanPart=tenant.rent_iban?` Πληρωμή σε IBAN ${tenant.rent_iban} (${landlordName}).`:'';
    return `Αίτημα πληρωμής, ${propLabel()||'ακίνητο'}: ${p.amount.toLocaleString('el-GR')} € για ${monthLabel(p)}${br}.${ibanPart}${p.due_date?` Λήξη ${new Date(p.due_date+'T00:00:00').toLocaleDateString('el-GR')}.`:''}`;
  };

  // ── Μηνιαία κατάσταση προς τον μισθωτή: «Τι περιλαμβάνει / τι χρεώνεται» ──
  const printStatement=(p:RentPayment)=>{
    const w=window.open('','_blank','width=820,height=760'); if(!w){alert('Επίτρεψε τα popups');return;}
    const landlord=branding?.companyName?brandName(branding):'Property OS';
    const num=`${p.period_year}-${String(p.period_month).padStart(2,'0')}`;
    const base=p.base_rent!=null?p.base_rent:tenantBaseRent(tenant);
    const lines=tenantServiceLines(tenant);
    const svcTotal=lines.reduce((a,l)=>a+l.amount,0);
    const total=p.amount!=null?p.amount:base+svcTotal;
    const money=(n:number)=>`${(n||0).toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
    const svcRows=lines.length?lines.map(l=>`<tr><td>${esc(l.label)}</td><td class="r">${esc(money(l.amount))}</td></tr>`).join(''):`<tr><td colspan="2" style="color:#6b7280">Καμία επιπλέον υπηρεσία</td></tr>`;
    w.document.write(`<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8"><title>Μηνιαία Κατάσταση ${esc(num)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Inter',system-ui,sans-serif;max-width:720px;margin:0 auto;padding:40px;color:#111;background:#fff;font-size:13px;line-height:1.7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      .header{border-bottom:2px solid #111;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end}
      .brand{display:flex;align-items:center;gap:11px}
      .mark{width:34px;height:34px;border-radius:8px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:17px;flex-shrink:0}
      h1{font-size:19px;font-weight:700;color:#111;letter-spacing:-.01em}
      .sub{font-size:11px;color:#6b7280;margin-top:2px}
      .num{font-size:11px;color:#6b7280;text-align:right;white-space:nowrap}
      h2{font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;margin:22px 0 8px;font-weight:700;padding-bottom:7px;border-bottom:1px solid #111}
      table{width:100%;border-collapse:collapse;margin:6px 0}
      td{padding:10px 14px;border:1px solid #d1d5db;font-size:13px;color:#374151}
      td.r{text-align:right;font-family:'Roboto Mono',monospace;font-variant-numeric:tabular-nums;width:38%;color:#111;white-space:nowrap}
      tr.base td{background:#f8f9fa;color:#111}
      tr.total td{background:#f8f9fa;font-weight:700;color:#111;font-size:15px}
      .meta td:first-child{font-weight:600;width:42%;background:#f8f9fa;color:#111}
      .footer{margin-top:36px;font-size:10px;color:#6b7280;text-align:center;border-top:1px solid #d1d5db;padding-top:12px}
      @media print{body{margin:0;padding:24px}@page{margin:16mm}}
    </style></head><body>
    <div class="header"><div class="brand">${brandLogoImg(branding,34)||`<div class="mark">P</div>`}<div><h1>Μηνιαία Κατάσταση Ενοικίου</h1><div class="sub">${esc(landlord)}</div></div></div><div class="num">Περίοδος ${esc(monthLabel(p))}<br>Έκδοση: ${esc(new Date().toLocaleDateString('el-GR'))}</div></div>
    <table class="meta">
      <tr><td>Μισθωτής</td><td>${esc(tenant.full_name||'—')}${tenant.afm?' &nbsp;·&nbsp; ΑΦΜ '+esc(tenant.afm):''}</td></tr>
      ${propLabel()?`<tr><td>Ακίνητο</td><td>${esc(propLabel())}</td></tr>`:''}
      ${p.due_date?`<tr><td>Ημερομηνία λήξης</td><td>${esc(new Date(p.due_date+'T00:00:00').toLocaleDateString('el-GR'))}</td></tr>`:''}
    </table>
    <h2>Τι περιλαμβάνει / τι χρεώνεται</h2>
    <table>
      <tr class="base"><td>Βασικό ενοίκιο</td><td class="r">${esc(money(base))}</td></tr>
      ${svcRows}
      <tr class="total"><td>Σύνολο μηνός</td><td class="r">${esc(money(total))}</td></tr>
    </table>
    ${tenant.rent_iban?`<p style="font-size:12px;color:#6b7280;margin-top:16px">Πληρωμή σε IBAN <strong>${esc(tenant.rent_iban)}</strong> (${esc(landlordName)}).</p>`:''}
    <p style="font-size:11px;color:#6b7280;margin-top:8px">Η παρούσα κατάσταση είναι ενημερωτική και αναλύει το μηνιαίο ποσό της δόσης σε βασικό ενοίκιο και υπηρεσίες.</p>
    <div class="footer">Έγγραφο μέσω ${esc(landlord)}${brandContactLine(branding)?' · '+esc(brandContactLine(branding)):''}</div>
    </body></html>`);
    w.document.close();setTimeout(()=>w.print(),700);
  };

  // ── Scan → payment matching ──
  const runScan=async(file:File)=>{
    setScan({stage:'scanning'});
    try{
      const dataUrl:string=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result as string);r.onerror=rej;r.readAsDataURL(file);});
      const base64=dataUrl.split(',')[1]; const mime=file.type||'image/jpeg'; const isPdf=mime==='application/pdf';
      const contentPart=isPdf?{type:'document',source:{type:'base64',media_type:'application/pdf',data:base64}}:{type:'image',source:{type:'base64',media_type:mime,data:base64}};
      const res=await fetch('/api/anthropic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-5',max_tokens:1500,system:SYSTEM_PROMPT,messages:[{role:'user',content:[contentPart,{type:'text',text:'Αναγνώρισε και ανάλυσε αυτό το έγγραφο. Διάβασε κάθε στοιχείο με ακρίβεια.'}]}]})});
      const data=await res.json();
      if(!res.ok||data?.error){ setScan({stage:'error',msg:'Η υπηρεσία σάρωσης δεν είναι διαθέσιμη αυτή τη στιγμή.'}); return; }
      const text=(data.content||[]).find((c:{type:string})=>c.type==='text')?.text||'{}';
      let doc:ScannedDoc; try{ doc=JSON.parse(text.replace(/```json?|```/g,'').trim()); }catch{ setScan({stage:'error',msg:'Δεν ήταν δυνατή η ανάγνωση του εγγράφου.'}); return; }
      if(doc.amount!=null) doc.amount=numify(doc.amount as unknown);
      doc.doc_type=classifyDocType(doc);
      // Best-effort αρχειοθέτηση του πρωτότυπου (property_documents) για τεκμηρίωση.
      let docId:string|null=null;
      try{
        const safe=file.name.replace(/[^\w.\-]+/g,'_'); const path=`${userId}/${propertyId}/document/${Date.now()}_${safe}`;
        const{error:upErr}=await supabase.storage.from('property-files').upload(path,file,{upsert:false,contentType:file.type||undefined});
        if(!upErr){ const{data:ins}=await supabase.from('property_documents').insert({property_id:propertyId,user_id:userId,kind:'document',category:'tenant',title:(doc.title||file.name).slice(0,200),doc_date:doc.issue_date||todayISO(),file_path:path,file_name:file.name,mime:file.type||null,size_bytes:file.size}).select('id').single(); docId=ins?.id||null; }
      }catch{ /* archive optional */ }
      const amount=typeof doc.amount==='number'?doc.amount:0;
      const dateISO=doc.issue_date||doc.due_date||todayISO();
      const method:PayMethod=doc.doc_type==='payment'?'Τραπεζική κατάθεση':'Τραπεζική κατάθεση';
      if(doc.doc_type!=='payment'){
        setScan({stage:'match',doc,method,docId,periodId: open[0]?.id});
        return;
      }
      // Match στην πλησιέστερη ανοιχτή δόση κατά μήνα + ποσό (±1%).
      const [y,m]=[Number(dateISO.slice(0,4)),Number(dateISO.slice(5,7))];
      const scored=open.map(p=>({p,amtOk:amount>0&&p.amount>0?Math.abs(p.amount-amount)/p.amount<=0.01:false,dist:Math.abs((p.period_year*12+p.period_month)-(y*12+m))}));
      const amt=scored.filter(x=>x.amtOk).sort((a,b)=>a.dist-b.dist);
      const best=amt[0]||[...scored].sort((a,b)=>a.dist-b.dist)[0];
      setScan({stage:'match',doc,method,docId,periodId:best?.p.id});
    }catch{ setScan({stage:'error',msg:'Παρουσιάστηκε σφάλμα κατά τη σάρωση.'}); }
  };
  const confirmScan=async()=>{
    if(!scan?.periodId||!scan.doc){ setScan(null); return; }
    const p=payments.find(x=>x.id===scan.periodId); if(!p){ setScan(null); return; }
    const dateISO=scan.doc.issue_date||scan.doc.due_date||todayISO();
    await doMarkPaid(p,scan.method||'Τραπεζική κατάθεση','',dateISO,scan.docId);
    setScan(null);
  };

  const inputStyle:React.CSSProperties={width:'100%',height:42,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.inner,padding:'0 14px',color:'var(--text-primary)',fontSize:14,fontFamily:T.font.sans,outline:'none',boxSizing:'border-box'};

  const StatusPill=({p}:{p:RentPayment})=>{
    const st=payStatus(p);
    const cfg=st==='paid'?{c:'var(--positive)',bg:'var(--positive-dim)',l:'Πληρώθηκε'}:st==='overdue'?{c:'var(--negative)',bg:'var(--negative-dim)',l:'Ληξιπρόθεσμο'}:{c:'var(--text-secondary)',bg:'var(--bg-overlay)',l:'Εκκρεμεί'};
    return <span style={{ ...s.badge(cfg.c,cfg.bg), border:`1px solid ${cfg.c}33`, fontFamily:T.font.sans }}>{cfg.l}</span>;
  };

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:10, marginBottom:16 }}>
        <KpiCard label="Εισπραχθέντα" value={fmt(received)} color="var(--text-primary)"/>
        <KpiCard label="Ληξιπρόθεσμα" value={fmt(arrearsTotal)} sub={`${overdue.length} δόσεις`} color={arrearsTotal>0?'var(--negative)':'var(--positive)'}/>
        <KpiCard label="Εκκρεμείς" value={String(open.length)} color={open.length>0?'var(--warning)':'var(--positive)'}/>
        <KpiCard label="Δόσεις" value={`${payments.filter(p=>p.paid).length}/${payments.length}`} color="var(--text-primary)"/>
      </div>

      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:12, flexWrap:'wrap' as const }}>
          <SectionTitle>Καρτέλα Ενοικίου</SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' as const }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>Ημέρα λήξης</span>
              <select value={rentDueDay} onChange={e=>setRentDueDay(+e.target.value)} style={{ height:32, background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:T.radius.inner, color:'var(--text-primary)', fontSize:12, fontFamily:T.font.mono, padding:'0 8px', cursor:'pointer' }}>
                {Array.from({length:28},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <button style={s.btnSm} onClick={()=>fileRef.current?.click()}>Σάρωσε απόδειξη</button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)runScan(f);e.target.value='';}}/>
            <button style={s.btnSm} onClick={generateNow} disabled={busy}>{busy?'…':'Δημιουργία δόσεων'}</button>
            <ExportButton disabled={payments.length===0} onClick={()=>downloadCsv(
              `enoikio_${todayISO()}`,
              ['Περίοδος','Ποσό (€)','Κατάσταση','Τρόπος','Ημ. Πληρωμής','Λήξη','Καθυστέρηση (ημέρες)','Σημειώσεις'],
              sorted.map(p=>[`${MONTHS_FULL[p.period_month-1]} ${p.period_year}`,csvEur(p.amount),payStatus(p)==='paid'?'Πληρώθηκε':payStatus(p)==='overdue'?'Ληξιπρόθεσμο':'Εκκρεμεί',p.method||'',csvDate(p.paid_date),csvDate(p.due_date),p.days_late||0,(p.notes||'').replace(/\n/g,' ')])
            )}/>
            <button style={s.btnSm} onClick={()=>setAddOpen(v=>!v)}>{addOpen?'Κλείσιμο':'+ Καταχώρηση'}</button>
          </div>
        </div>

        {missing.length>0&&<InfoBanner tone="info">Λείπουν {fn(missing.length)} μηνιαίες δόσεις βάσει της μίσθωσης. Πάτησε «Δημιουργία δόσεων» για αυτόματη συμπλήρωση.</InfoBanner>}

        {declaredPending.length>0&&(
          <div style={{ background:'var(--accent-soft)', border:'1px solid var(--accent-border)', borderRadius:T.radius.inner, padding:'14px 16px', margin:'4px 0 8px' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:2 }}>
              {fn(declaredPending.length)} {declaredPending.length===1?'πληρωμή δηλώθηκε':'πληρωμές δηλώθηκαν'} από τον μισθωτή
            </div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:12, lineHeight:1.5 }}>
              Ο μισθωτής δήλωσε πληρωμή μέσω της πύλης. Επιβεβαίωσε την είσπραξη για να καταχωρηθεί ως πληρωμένη.
            </div>
            <div style={{ display:'flex', flexDirection:'column' as const, gap:8 }}>
              {declaredPending.map(p=>(
                <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' as const, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'10px 14px' }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{monthLabel(p)} · <span style={{ fontFamily:T.font.mono }}>{fmt(p.amount)}</span></div>
                    {p.tenant_note&&<div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:2, whiteSpace:'pre-wrap' as const }}>{p.tenant_note}</div>}
                  </div>
                  <button style={s.btnSm} onClick={()=>setMark({p,method:'Τραπεζική κατάθεση',receipt:''})}>Επιβεβαίωση είσπραξης</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {staleUnpaid.length>0&&(
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' as const, background:'var(--warning-soft)', border:'1px solid var(--warning-border)', borderRadius:T.radius.inner, padding:'11px 16px', margin:'4px 0' }}>
            <span style={{ fontSize:12.5, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.5 }}>
              {fn(staleUnpaid.length)} εκκρεμείς δόσεις δεν αντιστοιχούν στο τρέχον ποσό ({fmt(targetAmt)}{svcCharge>0?`: ενοίκιο ${fmt(baseRent)} + υπηρεσίες ${fmt(svcCharge)}`:''}).
            </span>
            <button style={s.btnSm} onClick={syncUnpaidToTarget} disabled={busy}>{busy?'…':'Ενημέρωση εκκρεμών'}</button>
          </div>
        )}

        {addOpen&&(
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20, margin:'12px 0 4px' }}>
            <div style={{ ...s.g4, marginBottom:14 }}>
              <SelectField label="Μήνας" value={String(payF.period_month)} onChange={v=>setPayF(f=>({...f,period_month:+v}))} options={MONTHS_FULL.map((m,i)=>({value:String(i+1),label:m}))}/>
              <NumberInput label="Έτος" value={String(payF.period_year)} onChange={v=>setPayF(f=>({...f,period_year:+v}))} min={2000}/>
              <NumberInput label="Ποσό" value={payF.amount} onChange={v=>setPayF(f=>({...f,amount:v}))} suffix="€" placeholder={tenant.monthly_rent?.toString()}/>
              <SelectField label="Τρόπος Πληρωμής" value={payF.method} onChange={v=>setPayF(f=>({...f,method:v as PayMethod}))} options={PAY_METHODS.map(m=>({value:m,label:m}))}/>
            </div>
            <div style={{ ...s.g3, marginBottom:14 }}>
              <div><div style={{ ...labelStyle, marginBottom:8 }}>Εξοφλήθη</div><Toggle on={payF.paid} onChange={v=>setPayF(f=>({...f,paid:v}))} label="Ναι" labelOff="Όχι"/></div>
              {payF.paid&&<DateField label="Ημερομηνία Πληρωμής" value={payF.paid_date} onChange={v=>setPayF(f=>({...f,paid_date:v}))}/>}
              <TextInput label="Σημείωση" value={payF.notes} onChange={v=>setPayF(f=>({...f,notes:v}))} placeholder="προαιρετικό"/>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button style={s.btnGhost} onClick={()=>setAddOpen(false)}>Ακύρωση</button>
              <button style={s.btnGold} onClick={savePay} disabled={busy}>{busy?'Αποθήκευση...':'Καταχώρηση'}</button>
            </div>
          </div>
        )}

        {payments.length===0?(
          <div style={{ textAlign:'center', padding:'48px 0', color:'var(--text-tertiary)', fontSize:13, fontFamily:T.font.sans }}>
            Δεν υπάρχουν δόσεις. {tenant.lease_start&&tenant.monthly_rent?'Πάτησε «Δημιουργία δόσεων» για αυτόματη συμπλήρωση από τη μίσθωση.':'Όρισε έναρξη μίσθωσης και ενοίκιο για αυτόματη δημιουργία.'}
          </div>
        ):(
          <div className="table-wrap" style={{ marginTop:14 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Περίοδος','Ποσό','Κατάσταση','Τρόπος','Ημ. Πληρωμής','Λήξη','Ενέργειες'].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {sorted.map(p=>(
                <tr key={p.id}>
                  <td style={s.td}><strong style={{ fontFamily:T.font.sans }}>{MONTHS_S[p.period_month-1]}</strong> <span style={{ color:'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{p.period_year}</span></td>
                  <td style={{ ...s.td, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(p.amount)}
                    {p.services_charge&&p.services_charge>0?<span style={{ display:'block', fontSize:10, fontWeight:400, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>ενοίκιο {fmt(p.base_rent)} + υπηρεσίες {fmt(p.services_charge)}</span>:null}
                  </td>
                  <td style={s.td}><StatusPill p={p}/>{p.tenant_declared&&!p.paid?<span style={{ display:'block', marginTop:4, fontSize:9.5, color:'var(--warning)', fontFamily:T.font.sans, fontWeight:600 }}>Δηλώθηκε από μισθωτή</span>:null}</td>
                  <td style={s.tdM}>{p.method||'—'}</td>
                  <td style={s.tdM}>{fmtD(p.paid_date)}</td>
                  <td style={s.tdM}>{fmtD(p.due_date)}{p.days_late&&p.days_late>0?<span style={{ display:'block', fontSize:10, color:p.days_late>14?'var(--negative)':'var(--warning)' }}>+{p.days_late} ημ.</span>:null}</td>
                  <td style={s.td}>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                      {!p.paid
                        ?<button style={s.btnSm} onClick={()=>setMark({p,method:'Τραπεζική κατάθεση',receipt:''})}>Πληρωμένο</button>
                        :<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>doUnpay(p)}>Αναίρεση</button>}
                      {!p.paid&&<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>{setCopied(false);setReq(p);}}>Αίτημα πληρωμής</button>}
                      <button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>printStatement(p)}>Κατάσταση</button>
                      {p.paid&&<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>printReceipt(p)}>Απόδειξη</button>}
                      {tenant.phone&&<a href={p.paid?whatsappLink(msgDigits(tenant.phone),receiptText(p)):whatsappLink(msgDigits(tenant.phone),reminderText(p))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>WhatsApp</a>}
                      {tenant.phone&&<a href={viberLink(p.paid?receiptText(p):reminderText(p))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>Viber</a>}
                      <button style={s.btnDng} onClick={async()=>{if(!confirm('Διαγραφή;'))return;await supabase.from('rent_payments').delete().eq('id',p.id);onRefresh();}}>Διαγραφή</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Mark-as-paid modal */}
      {mark&&(
        <div onClick={()=>setMark(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:T.radius.card, padding:24, width:'min(100%, 420px)' }}>
            <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:4 }}>Σήμανση ως πληρωμένο</div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:16 }}>{monthLabel(mark.p)} · {fmt(mark.p.amount)}</div>
            <div style={{ marginBottom:14 }}>
              <SelectField label="Τρόπος Πληρωμής" value={mark.method} onChange={v=>setMark(m=>m?{...m,method:v as PayMethod}:m)} options={PAY_METHODS.map(m=>({value:m,label:m}))}/>
            </div>
            <div style={{ marginBottom:18 }}>
              <TextInput label="Σύνδεσμος Απόδειξης (προαιρετικό)" value={mark.receipt} onChange={v=>setMark(m=>m?{...m,receipt:v}:m)} placeholder="https://..."/>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button style={s.btnGhost} onClick={()=>setMark(null)}>Ακύρωση</button>
              <button style={s.btnGold} onClick={async()=>{const mm=mark;setMark(null);await doMarkPaid(mm.p,mm.method,mm.receipt,todayISO());}}>Καταχώρηση</button>
            </div>
          </div>
        </div>
      )}

      {/* Αίτημα πληρωμής modal (IBAN / QR / κοινοποίηση) */}
      {req&&(
        <div onClick={()=>setReq(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:T.radius.card, padding:24, width:'min(100%, 460px)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:4 }}>Αίτημα πληρωμής</div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:16 }}>{monthLabel(req)} · {fmt(req.amount)}{req.services_charge&&req.services_charge>0?<span style={{ color:'var(--text-tertiary)' }}> (ενοίκιο {fmt(req.base_rent)} + υπηρεσίες {fmt(req.services_charge)})</span>:null}</div>

            {tenant.rent_iban?(
              <>
                <div style={{ display:'flex', flexDirection:'column' as const, alignItems:'center', marginBottom:16 }}>
                  <img src={qrSrc(epcPayload(tenant.rent_iban,landlordName,req.amount,reqRef(req)))} alt="QR πληρωμής" width={200} height={200} style={{ borderRadius:12, border:'1px solid var(--border-subtle)', background:'#fff', padding:8 }}/>
                  <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:8, textAlign:'center' as const }}>Σάρωση από την τραπεζική εφαρμογή (SEPA/IRIS) για προσυμπλήρωση της μεταφοράς.</div>
                </div>
                <div style={{ ...labelStyle, marginBottom:6 }}>IBAN πληρωμής</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                  <div style={{ flex:1, fontFamily:T.font.mono, fontSize:13, color:'var(--text-primary)', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:T.radius.inner, padding:'10px 12px', wordBreak:'break-all' as const }}>{tenant.rent_iban}</div>
                  <button style={s.btnSm} onClick={()=>{ try{ navigator.clipboard.writeText(tenant.rent_iban||''); setCopied(true); }catch{} }}>{copied?'Αντιγράφηκε':'Αντιγραφή'}</button>
                </div>
              </>
            ):(
              <InfoBanner tone="info">Πρόσθεσε IBAN πληρωμής στα στοιχεία του μισθωτή για δημιουργία QR και προσυμπλήρωση της μεταφοράς.</InfoBanner>
            )}

            <div style={{ ...labelStyle, marginBottom:8, marginTop:4 }}>Κοινοποίηση αιτήματος</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const, marginBottom:18 }}>
              {tenant.phone&&<a href={whatsappLink(msgDigits(tenant.phone),paymentRequestText(req))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, textDecoration:'none' }}>WhatsApp</a>}
              {tenant.phone&&<a href={viberLink(paymentRequestText(req))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, textDecoration:'none' }}>Viber</a>}
              {tenant.email&&<a href={`mailto:${tenant.email}?subject=${encodeURIComponent('Αίτημα πληρωμής ενοικίου '+monthLabel(req))}&body=${encodeURIComponent(paymentRequestText(req))}`} style={{ ...s.btnGhost, textDecoration:'none' }}>Email</a>}
              <button style={s.btnGhost} onClick={()=>{ try{ navigator.clipboard.writeText(paymentRequestText(req)); notify('Το κείμενο αντιγράφηκε'); }catch{} }}>Αντιγραφή κειμένου</button>
            </div>

            <div style={{ display:'flex', gap:8, justifyContent:'space-between', alignItems:'center', flexWrap:'wrap' as const }}>
              <button style={{ ...s.btnGhost, fontSize:11 }} onClick={()=>{const rp=req;setReq(null);setMark({p:rp,method:'Τραπεζική κατάθεση',receipt:''});}}>Σήμανση εξόφλησης</button>
              <button style={s.btnGold} onClick={()=>setReq(null)}>Κλείσιμο</button>
            </div>
          </div>
        </div>
      )}

      {/* Scan → match modal */}
      {scan&&(
        <div onClick={()=>scan.stage!=='scanning'&&setScan(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:T.radius.card, padding:24, width:'min(100%, 460px)' }}>
            <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:12 }}>Σάρωση απόδειξης</div>
            {scan.stage==='scanning'&&<div style={{ padding:'20px 0' }}><Spinner label="Ανάλυση εγγράφου…"/></div>}
            {scan.stage==='error'&&<><InfoBanner tone="warning">{scan.msg}</InfoBanner><div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}><button style={s.btnGhost} onClick={()=>setScan(null)}>Κλείσιμο</button></div></>}
            {scan.stage==='match'&&scan.doc&&(
              <>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const, marginBottom:12 }}>
                  <Badge tone={scan.doc.doc_type==='payment'?'positive':'warning'}>{scan.doc.doc_type==='payment'?'Απόδειξη πληρωμής':'Τύπος: '+scan.doc.doc_type}</Badge>
                  {typeof scan.doc.amount==='number'&&<Badge tone="accent">{fmt(scan.doc.amount)}</Badge>}
                  {(scan.doc.issue_date||scan.doc.due_date)&&<Badge tone="neutral">{scan.doc.issue_date||scan.doc.due_date}</Badge>}
                </div>
                {scan.doc.doc_type!=='payment'&&<InfoBanner tone="warning">Το έγγραφο δεν αναγνωρίστηκε ως απόδειξη πληρωμής. Επίλεξε δόση χειροκίνητα πριν τη σήμανση.</InfoBanner>}
                {open.length===0?(
                  <InfoBanner tone="info">Δεν υπάρχουν ανοιχτές δόσεις για αντιστοίχιση.</InfoBanner>
                ):(
                  <div style={{ marginBottom:16 }}>
                    <div style={{ ...labelStyle, marginBottom:8 }}>Αντιστοίχιση σε δόση</div>
                    <select value={scan.periodId||''} onChange={e=>setScan(sc=>sc?{...sc,periodId:e.target.value}:sc)} style={inputStyle}>
                      {open.map(p=><option key={p.id} value={p.id}>{monthLabel(p)} · {fmt(p.amount)}</option>)}
                    </select>
                    <div style={{ marginTop:12 }}>
                      <SelectField label="Τρόπος Πληρωμής" value={scan.method||'Τραπεζική κατάθεση'} onChange={v=>setScan(sc=>sc?{...sc,method:v as PayMethod}:sc)} options={PAY_METHODS.map(m=>({value:m,label:m}))}/>
                    </div>
                  </div>
                )}
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button style={s.btnGhost} onClick={()=>setScan(null)}>Ακύρωση</button>
                  <button style={s.btnGold} onClick={confirmScan} disabled={open.length===0||!scan.periodId}>Σήμανση ως πληρωμένο</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Legal & Tax View (Νομικά & Φόρος) ──────────────────────────────────────────
function LegalTaxView({ tenant }:{ tenant:Tenant }) {
  const annualRent=Math.max(0,(tenant.monthly_rent||0)*12);
  const tax=annualRent>0?rentalIncomeTax(annualRent):0;
  const effRate=annualRent>0?effectiveRentalRate(annualRent):0;
  const isCommercial=tenant.lease_category==='commercial';
  const stampDuty=isCommercial?annualRent*COMMERCIAL_STAMP_DUTY:0;   // 3,6% επί του μισθώματος
  const net=annualRent-tax-stampDuty;

  const kpis:KPIItem[]=[
    { label:'Ετήσιο Ακαθάριστο Ενοίκιο', value:fe(annualRent), tone:'accent' },
    { label:'Φόρος Εισοδήματος από Ενοίκια', value:fe(tax), tone:'warning', sub:annualRent>0?`πραγματικός συντελεστής ${(effRate*100).toFixed(1)}%`:undefined },
    ...(isCommercial?[{ label:'Τέλος Χαρτοσήμου (3,6%)', value:fe(stampDuty), tone:'warning' as const }]:[]),
    { label:'Καθαρό μετά Φόρο & Τέλη', value:fe(net), tone:'positive' },
  ];

  const linkCard=(label:string,desc:string,url:string,urgent=false)=>(
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', marginBottom:8, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderLeft:`3px solid ${urgent?'var(--warning)':'var(--border-default)'}`, borderRadius:T.radius.inner, textDecoration:'none' }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:2 }}>{label}</div>
        <div style={{ fontSize:10, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>{desc}</div>
      </div>
      <span style={{ fontSize:14, color:'var(--accent)' }}>→</span>
    </a>
  );

  const InfoBlock=({title,children,tone}:{title:string;children:React.ReactNode;tone?:string})=>(
    <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border-subtle)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <div style={{ width:5, height:5, borderRadius:'50%', background:tone||'var(--accent)' }}/>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{title}</span>
      </div>
      <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.7, paddingLeft:13 }}>{children}</div>
    </div>
  );

  return (
    <div>
      <KPIGrid items={kpis}/>
      <InfoBanner tone="info">Οι υπολογισμοί βασίζονται στα στοιχεία που έχεις καταχωρήσει: ενοίκιο {fe(tenant.monthly_rent||0)}/μήνα και τύπος μίσθωσης «{tenant.lease_category?LEASE_CATEGORY_LABELS[tenant.lease_category]:'—'}». Για την οριστική δήλωση Ε1/Ε2 και τυχόν εκπτώσεις που ισχύουν στην περίπτωσή σου, επιβεβαίωσε με λογιστή ή την ΑΑΔΕ.</InfoBanner>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap:16, marginTop:16 }}>
        {/* Φόρος εισοδήματος από ενοίκια */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Φόρος Εισοδήματος από Ενοίκια (2026)</SectionTitle>
          <div className="table-wrap">
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Κλιμάκιο Εισοδήματος','Συντελεστής'].map((h,i)=><th key={i} style={{ ...s.th, textAlign:i?'right' as const:'left' as const }}>{h}</th>)}</tr></thead>
            <tbody>
              {RENTAL_TAX_ROWS_2026.map((r,i)=>{
                const active=annualRent>r.from&&(r.to===Infinity||annualRent<=r.to);
                return (
                  <tr key={i} style={{ background:active?'var(--accent-soft)':'transparent' }}>
                    <td style={{ ...s.td, display:'flex', alignItems:'center', gap:8 }}>{r.range}{active&&<Badge tone="accent">εδώ</Badge>}</td>
                    <td style={{ ...s.td, textAlign:'right' as const, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:active?700:400 }}>{r.rate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div style={{ marginTop:12, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>Ο φόρος υπολογίζεται προοδευτικά ανά κλιμάκιο επί του ετήσιου ακαθάριστου ενοικίου σου ({fe(annualRent)}), σύνολο {fe(tax)}. Επιβεβαίωσε την τελική δήλωση με λογιστή ή την ΑΑΔΕ.</div>
        </div>

        {/* Νομικές υποχρεώσεις */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Υποχρεώσεις & Πλαίσιο</SectionTitle>
          <InfoBlock title="ΑΑΔΕ, Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης" tone="var(--warning)">
            Κάθε νέα μίσθωση, καθώς και κάθε τροποποίηση ή λύση, δηλώνεται ηλεκτρονικά στην ΑΑΔΕ έως το τέλος του επόμενου μήνα από την έναρξη ή τη μεταβολή.{tenant.lease_start?` Για έναρξη ${fmtD(tenant.lease_start)}, προθεσμία δήλωσης έως ${lastDayNextMonth(tenant.lease_start)}.`:''} Χωρίς τη δήλωση δεν αναγνωρίζεται φορολογικά η μίσθωση. Επιβεβαίωσε την ακριβή προθεσμία στην ΑΑΔΕ (σύνδεσμος πιο κάτω).
          </InfoBlock>
          <InfoBlock title="Ηλεκτρονική πληρωμή ενοικίου" tone={tenant.e_payment?'var(--positive)':'var(--negative)'}>
            {tenant.e_payment
              ?'Το ενοίκιο εισπράττεται ηλεκτρονικά, προϋπόθεση για τη φορολογική αναγνώριση της δαπάνης/εσόδου κατά τις ισχύουσες διατάξεις.'
              :'Προσοχή: το ενοίκιο δηλώνεται ως μη ηλεκτρονική πληρωμή. Η ηλεκτρονική εξόφληση αποτελεί προϋπόθεση φορολογικής αναγνώρισης, ενημέρωσε τα στοιχεία μίσθωσης.'}
          </InfoBlock>
          <InfoBlock title="Αναπροσαρμογή ΔΤΚ">
            Η αναπροσαρμογή μισθώματος γίνεται μία φορά τον χρόνο, βάσει Δείκτη Τιμών Καταναλωτή (ΕΛΣΤΑΤ), εφόσον προβλέπεται στη σύμβαση. Χρησιμοποίησε την καρτέλα «Αναπροσαρμογή Ενοικίου».
          </InfoBlock>
          <InfoBlock title="Ελάχιστη διάρκεια & εγγύηση">
            {isCommercial
              ?'Για επαγγελματική μίσθωση ισχύει η ελάχιστη νόμιμη διάρκεια των τριών ετών.'
              :'Για μίσθωση κατοικίας ισχύει η τριετής ελάχιστη προστασία διάρκειας, ακόμη κι αν συμφωνηθεί μικρότερος χρόνος.'} Η εγγύηση{tenant.deposit_amount?` (${fe(tenant.deposit_amount)})`:''} επιστρέφεται στη λήξη, μετά από έλεγχο για φθορές.
          </InfoBlock>
          <InfoBlock title="Τέλος χαρτοσήμου" tone={isCommercial?'var(--warning)':'var(--positive)'}>
            {isCommercial
              ?`Επαγγελματική μίσθωση: τέλος χαρτοσήμου 3,6% επί του μισθώματος. Για ετήσιο ενοίκιο ${fe(annualRent)}, το τέλος ανέρχεται σε ${fe(stampDuty)} τον χρόνο (${fe(stampDuty/12)} τον μήνα), που κατανέμεται συνήθως 50/50 μεταξύ εκμισθωτή και μισθωτή.`
              :'Μίσθωση κατοικίας: δεν επιβάλλεται τέλος χαρτοσήμου.'}
          </InfoBlock>
          <div style={{ marginTop:16 }}>
            {linkCard('ΑΑΔΕ, Δηλώσεις Μίσθωσης Ακινήτων','Ηλεκτρονική υποβολή & πληροφορίες','https://www.aade.gr/polites/misthoseis-akiniton-dilosi-plirophoriakon-stoicheion',true)}
            {linkCard('ΑΑΔΕ, Φορολογία Εισοδήματος Ακινήτων','Ε2 & κλίμακα φόρου ενοικίων','https://www.aade.gr/polites/eisodima/misthotiria-akiniton')}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Blank form ────────────────────────────────────────────────────────────────
const blank=()=>({
  full_name:'',email:'',phone:'',phone_work:'',nationality:'',profession:'',employer:'',afm:'',
  id_doc_type:'' as IdDocType|'',id_doc_number:'',iban:'',notes:'',
  lease_type:'annual' as LeaseType,lease_category:'' as LeaseCategory|'',lease_start:'',lease_end:'',custom_lease_days:365,
  monthly_rent:'',payment_frequency:'monthly' as PaymentFreq,rent_due_day:'1',rent_iban:'',
  furnishing:'' as Furnishing|'',
  deposit_amount:'',deposit_method:'',deposit_paid_on:'',deposit_invested:false,deposit_returned:false,deposit_return_date:'',
  deposit_invest_rate:'',deposit_invest_type:'',deposit_invest_term:'',
  all_inclusive:false,kwh_limit:'',kwh_price:'',electricity_provider:'',electricity_tariff:'',electricity_monthly_limit:'',
  water_monthly_limit:'',internet_provider:'',internet_plan:'',internet_cost:'',
  e_payment:true,streaming:null as StreamingSvc[]|null,cleaning:null as CleaningCfg|null,extra_perks:'',
  welcome_basket:false,welcome_basket_amount:'',welcome_basket_contents:'',
  parking_included:false,parking_extra:false,parking_extra_price:'',parking_type:'',parking_has_electricity:false,parking_notes:'',
  ac_service_by:'owner' as ServiceBy,ac_service_frequency:'annual',ac_service_owner_pct:100,
  solar_service_by:'owner' as ServiceBy,solar_service_frequency:'annual',solar_service_owner_pct:100,
  heat_pump_service_by:'owner' as ServiceBy,heat_pump_service_frequency:'annual',heat_pump_service_owner_pct:100,
  solar_panels_service_by:'owner' as ServiceBy,solar_panels_service_frequency:'annual',solar_panels_service_owner_pct:100,
  pest_control_by:'owner' as ServiceBy,pest_control_frequency:'',pest_control_owner_pct:100,annual_services_notes:'',
  prepay_option:false,prepay_months:3,prepay_discount_pct:'',
  prepay_invested:false,prepay_invest_rate:'',prepay_invest_type:'',prepay_invest_term:'',
  lease_doc_external_url:'',
});

// Αρχική κατάσταση προοδευτικής αποκάλυψης του βήματος «Υπηρεσίες» βάσει δεδομένων.
const svcUIFrom = (f:ReturnType<typeof blank>) => ({
  stream: !!(f.streaming && f.streaming.some(sv=>sv.included)),
  clean:  !!(f.cleaning && f.cleaning.package && f.cleaning.package!=='none'),
  maint:  [f.ac_service_frequency,f.solar_service_frequency,f.heat_pump_service_frequency,f.solar_panels_service_frequency,f.pest_control_frequency].some(Boolean),
  park:   !!(f.parking_included||f.parking_extra||f.parking_type||f.parking_notes||f.parking_has_electricity),
  extra:  !!f.extra_perks,
});
const SVC_UI_CLOSED = { stream:false, clean:false, maint:false, park:false, extra:false };

// ─── Εγγύηση (Deposit View) ─────────────────────────────────────────────────────
// Δείχνει ποσό, τρόπο/ημ. καταβολής, επένδυση και ΠΟΤΕ + ΥΠΟ ΠΟΙΟΥΣ ΟΡΟΥΣ
// επιστρέφεται — υπολογισμένο από τα δεδομένα του ενοικιαστή (λήξη/αποχώρηση,
// εκκρεμή ενοίκια, χρεώσιμες φθορές).
function DepositView({ tenant, payments, damages, onReturned }:{ tenant:Tenant; payments:RentPayment[]; damages:TenantDamage[]; onReturned:()=>void }) {
  const supabase=createClient();
  const deposit=tenant.deposit_amount||0;
  const unpaid=payments.filter(p=>!p.paid).reduce((a,p)=>a+p.amount,0);
  const chargeable=damages.filter(d=>d.charged_to_tenant).reduce((a,d)=>a+(d.cost||0),0);
  const netReturn=Math.max(0,deposit-unpaid-chargeable);
  const dueDate=tenant.move_out_date||tenant.lease_end||null;
  const methodLabel=tenant.deposit_method||'—';
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap:16 }}>
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Στοιχεία Εγγύησης</SectionTitle>
        <DataRow label="Ποσό Εγγύησης" value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:15 }}>{fmt(deposit)}</span>}/>
        <DataRow label="Τρόπος Καταβολής" value={methodLabel}/>
        <DataRow label="Ημ. Καταβολής" value={fmtD(tenant.deposit_paid_on)}/>
        <DataRow label="Κατάσταση" value={tenant.deposit_returned?<StatusBadge label="Επεστράφη" color="var(--positive)" bg="var(--positive-dim)"/>:<StatusBadge label="Σε κατοχή" color="var(--accent)" bg="var(--accent-dim)"/>}/>
        <DataRow label="Επένδυση" value={tenant.deposit_invested?<StatusBadge label="Επενδύεται" color="var(--positive)" bg="var(--positive-dim)"/>:<StatusBadge label="Όχι" color="var(--text-secondary)" bg="var(--bg-overlay)"/>}/>
        {tenant.deposit_invest_type&&<DataRow label="Τύπος Επένδυσης" value={tenant.deposit_invest_type}/>}
        {tenant.deposit_invest_term&&<DataRow label="Πού Επενδύεται" value={tenant.deposit_invest_term}/>}
        {tenant.deposit_returned&&tenant.deposit_return_date&&<DataRow label="Ημ. Επιστροφής" value={fmtD(tenant.deposit_return_date)}/>}
        {!tenant.deposit_returned&&deposit>0&&(
          <button style={{ ...s.btnSm, marginTop:14, width:'100%', textAlign:'center' as const }}
            onClick={async()=>{await supabase.from('tenants').update({deposit_returned:true,deposit_return_date:todayISO()}).eq('id',tenant.id);onReturned();}}>
            Σήμανση ως Επεστράφη
          </button>
        )}
        <InvestmentCalc title="Απόδοση Εγγύησης" amount={deposit||null}/>
      </div>

      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Πότε & Υπό Ποιους Όρους Επιστρέφεται</SectionTitle>
        <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.8, marginBottom:14 }}>
          Η εγγύηση επιστρέφεται στη λήξη της μίσθωσης {dueDate?<>(<strong style={{ color:'var(--text-primary)' }}>{fmtD(dueDate)}</strong>){tenant.move_out_date?', βάσει της ημερομηνίας αποχώρησης':''}</>:'(δεν έχει οριστεί ημερομηνία λήξης/αποχώρησης)'}, μετά από <strong style={{ color:'var(--text-primary)' }}>έλεγχο για φθορές</strong> και <strong style={{ color:'var(--text-primary)' }}>εξόφληση τυχόν εκκρεμών οφειλών</strong>.
        </div>
        <DataRow label="Εγγύηση σε κατοχή" value={<span style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(deposit)}</span>}/>
        <DataRow label="Εκκρεμή ενοίκια" value={<span style={{ color:unpaid>0?'var(--negative)':'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{unpaid>0?`-${fmt(unpaid)}`:'—'}</span>}/>
        <DataRow label="Χρεώσιμες φθορές" value={<span style={{ color:chargeable>0?'var(--negative)':'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{chargeable>0?`-${fmt(chargeable)}`:'—'}</span>}/>
        <DataRow label="Καθαρό επιστρεπτέο (εκτίμηση)" value={<span style={{ color:'var(--positive)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:15 }}>{fmt(netReturn)}</span>}/>
        <div style={{ marginTop:12, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
          Ενδεικτικός υπολογισμός βάσει των εκκρεμών ενοικίων και των φθορών που έχεις σημειώσει ως χρεώσιμες στον ενοικιαστή. Ο τελικός συμψηφισμός γίνεται κατά την παράδοση.
        </div>
      </div>
    </div>
  );
}

// ─── Φθορές & Επισκευές (Damages View) ──────────────────────────────────────────
function DamagesView({ tenant, propertyId, userId, damages, onRefresh }:{ tenant:Tenant; propertyId:string; userId:string; damages:TenantDamage[]; onRefresh:()=>void }) {
  const supabase=createClient();
  const [addOpen,setAddOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const blankF=()=>({ occurred_on:todayISO(), description:'', cost:'', charged_to_tenant:false, repaired:false, repaired_on:'', notes:'' });
  const [f,setF]=useState(blankF());
  const [editId,setEditId]=useState<string|null>(null);

  const openNew=()=>{ setEditId(null); setF(blankF()); setAddOpen(true); };
  const openEdit=(d:TenantDamage)=>{ setEditId(d.id); setF({ occurred_on:d.occurred_on||todayISO(), description:d.description||'', cost:d.cost!=null?String(d.cost):'', charged_to_tenant:!!d.charged_to_tenant, repaired:!!d.repaired, repaired_on:d.repaired_on||'', notes:d.notes||'' }); setAddOpen(true); };

  const save=async()=>{
    if(!f.description.trim()) return;
    setBusy(true);
    const payload={ tenant_id:tenant.id, property_id:propertyId, user_id:userId, occurred_on:f.occurred_on||null, description:f.description.trim(), cost:f.cost?Math.max(0,parseFloat(f.cost)):null, charged_to_tenant:f.charged_to_tenant, repaired:f.repaired, repaired_on:f.repaired?(f.repaired_on||todayISO()):null, notes:f.notes.trim()||null };
    if(editId) await supabase.from('tenant_damages').update(payload).eq('id',editId);
    else await supabase.from('tenant_damages').insert(payload);
    setBusy(false); setAddOpen(false); setF(blankF()); setEditId(null); onRefresh();
  };
  const del=async(d:TenantDamage)=>{ if(!confirm('Διαγραφή φθοράς;')) return; await supabase.from('tenant_damages').delete().eq('id',d.id); onRefresh(); };

  // Ομαδοποίηση ανά έτος μίσθωσης (από lease_start· αλλιώς ανά ημερολογιακό έτος).
  const bucketOf=(occurred:string|null):{key:string;label:string;sort:number}=>{
    if(!occurred) return { key:'—', label:'Χωρίς ημερομηνία', sort:-1 };
    const oy=new Date(occurred+'T00:00:00');
    if(tenant.lease_start){
      const ls=new Date(tenant.lease_start+'T00:00:00');
      if(!isNaN(ls.getTime())&&!isNaN(oy.getTime())){
        const yr=Math.max(1,Math.floor((oy.getTime()-ls.getTime())/(365*86400000))+1);
        return { key:`y${yr}`, label:`Έτος μίσθωσης ${yr}`, sort:yr };
      }
    }
    const y=occurred.slice(0,4);
    return { key:y, label:y, sort:parseInt(y)||0 };
  };
  const groups=useMemo(()=>{
    const m=new Map<string,{label:string;sort:number;items:TenantDamage[]}>();
    [...damages].sort((a,b)=>(b.occurred_on||'').localeCompare(a.occurred_on||'')).forEach(d=>{
      const b=bucketOf(d.occurred_on);
      const g=m.get(b.key)||{label:b.label,sort:b.sort,items:[]}; g.items.push(d); m.set(b.key,g);
    });
    return [...m.values()].sort((a,b)=>b.sort-a.sort);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[damages,tenant.lease_start]);

  const totalCost=damages.reduce((a,d)=>a+(d.cost||0),0);
  const chargedTotal=damages.filter(d=>d.charged_to_tenant).reduce((a,d)=>a+(d.cost||0),0);
  const openRepairs=damages.filter(d=>!d.repaired).length;

  return (
    <div>
      {damages.length>0&&(
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:10, marginBottom:16 }}>
          <KpiCard label="Συνολικό Κόστος" value={fmt(totalCost)} color="var(--text-primary)"/>
          <KpiCard label="Χρέωση Ενοικιαστή" value={fmt(chargedTotal)} color={chargedTotal>0?'var(--warning)':'var(--positive)'}/>
          <KpiCard label="Εκκρεμείς Επισκευές" value={String(openRepairs)} color={openRepairs>0?'var(--warning)':'var(--positive)'}/>
        </div>
      )}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:12, flexWrap:'wrap' as const }}>
          <SectionTitle>Φθορές & Επισκευές</SectionTitle>
          <button style={s.btnSm} onClick={()=>addOpen?setAddOpen(false):openNew()}>{addOpen?'Κλείσιμο':'+ Νέα καταγραφή'}</button>
        </div>

        {addOpen&&(
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20, marginBottom:20 }}>
            <div style={{ ...s.g3, marginBottom:14 }}>
              <DateField label="Ημερομηνία" value={f.occurred_on} onChange={v=>setF(x=>({...x,occurred_on:v}))}/>
              <NumberInput label="Κόστος" value={f.cost} onChange={v=>setF(x=>({...x,cost:v}))} suffix="€"/>
              <div><div style={{ ...labelStyle, marginBottom:8 }}>Χρέωση στον ενοικιαστή</div><Toggle on={f.charged_to_tenant} onChange={v=>setF(x=>({...x,charged_to_tenant:v}))} label="Ναι" labelOff="Όχι"/></div>
            </div>
            <div style={{ marginBottom:14 }}>
              <TextInput label="Περιγραφή *" value={f.description} onChange={v=>setF(x=>({...x,description:v}))} placeholder="π.χ. Φθορά πάγκου κουζίνας"/>
            </div>
            <div style={{ ...s.g3, marginBottom:14 }}>
              <div><div style={{ ...labelStyle, marginBottom:8 }}>Επισκευάστηκε</div><Toggle on={f.repaired} onChange={v=>setF(x=>({...x,repaired:v}))} label="Ναι" labelOff="Όχι"/></div>
              {f.repaired&&<DateField label="Ημ. Επισκευής" value={f.repaired_on} onChange={v=>setF(x=>({...x,repaired_on:v}))}/>}
              <TextInput label="Σημείωση" value={f.notes} onChange={v=>setF(x=>({...x,notes:v}))} placeholder="προαιρετικό"/>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button style={s.btnGhost} onClick={()=>{setAddOpen(false);setEditId(null);}}>Ακύρωση</button>
              <button style={s.btnGold} onClick={save} disabled={busy}>{busy?'Αποθήκευση...':editId?'Αποθήκευση':'Καταχώρηση'}</button>
            </div>
          </div>
        )}

        {damages.length===0?(
          <div style={{ textAlign:'center', padding:'48px 0', color:'var(--text-tertiary)', fontSize:13, fontFamily:T.font.sans }}>Δεν έχουν καταγραφεί φθορές ή επισκευές.</div>
        ):groups.map(g=>(
          <div key={g.label} style={{ marginBottom:18 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{g.label}</span>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(g.items.reduce((a,d)=>a+(d.cost||0),0))}</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {g.items.map(d=>(
                <div key={d.id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'12px 14px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap' as const, alignItems:'flex-start' }}>
                    <div style={{ minWidth:0, flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{d.description}</div>
                      <div style={{ fontSize:12, color:'var(--text-secondary)', marginTop:3, display:'flex', gap:8, flexWrap:'wrap' as const, alignItems:'center' }}>
                        {d.occurred_on&&<span>{fmtD(d.occurred_on)}</span>}
                        {d.repaired?<Badge tone="positive">Επισκευάστηκε{d.repaired_on?` ${fmtD(d.repaired_on)}`:''}</Badge>:<Badge tone="warning">Εκκρεμεί</Badge>}
                        {d.charged_to_tenant&&<Badge tone="accent">Χρέωση ενοικιαστή</Badge>}
                      </div>
                      {d.notes&&<div style={{ fontSize:12, color:'var(--text-tertiary)', marginTop:6, fontFamily:T.font.sans, lineHeight:1.5 }}>{d.notes}</div>}
                    </div>
                    <div style={{ textAlign:'right' as const, flexShrink:0 }}>
                      <div style={{ fontSize:14, fontWeight:700, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', color:'var(--text-primary)' }}>{fmt(d.cost)}</div>
                      <div style={{ display:'flex', gap:6, marginTop:6, justifyContent:'flex-end' }}>
                        <button onClick={()=>openEdit(d)} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:12, fontFamily:T.font.sans, padding:0 }}>Επεξεργασία</button>
                        <button onClick={()=>del(d)} style={{ background:'none', border:'none', color:'var(--text-tertiary)', cursor:'pointer', fontSize:12, fontFamily:T.font.sans, padding:0 }}>Διαγραφή</button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Αιτήματα Βλάβης (Maintenance View) ─────────────────────────────────────────
// Αιτήματα από την πύλη ενοικιαστή → ιδιοκτήτης → επίλυση, δεμένα με φθορές/απογραφή.
const MAINT_STATUS:Record<string,{label:string;c:string;bg:string}>={
  new:{label:'Νέο',c:'var(--accent)',bg:'var(--accent-dim)'},
  in_progress:{label:'Σε εξέλιξη',c:'var(--warning)',bg:'var(--warning-soft)'},
  done:{label:'Ολοκληρώθηκε',c:'var(--positive)',bg:'var(--positive-dim)'},
};
function MaintenanceView({ tenant, propertyId, userId, requests, onRefresh, notify }:{ tenant:Tenant; propertyId:string; userId:string; requests:MaintenanceReq[]; onRefresh:()=>void; notify:(m:string)=>void }) {
  const supabase=createClient();
  const [busy,setBusy]=useState(false);
  const [assignFor,setAssignFor]=useState<string|null>(null);   // ποιο αίτημα αναθέτει σε συνεργείο
  const [af,setAf]=useState({name:'',contact:''});
  const list=[...requests].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  const setStatus=async(m:MaintenanceReq,status:string)=>{
    setBusy(true);
    await supabase.from('maintenance_requests').update({ status, resolved_at: status==='done'?new Date().toISOString():null }).eq('id',m.id);
    setBusy(false); onRefresh(); notify('Το αίτημα ενημερώθηκε');
  };
  const toDamage=async(m:MaintenanceReq)=>{
    setBusy(true);
    await supabase.from('tenant_damages').insert({ tenant_id:tenant.id, property_id:propertyId, user_id:userId, occurred_on:todayISO(), description:[m.title,m.description].filter(Boolean).join(': ').slice(0,500), cost:null, charged_to_tenant:false, repaired:false, notes:'Από αίτημα βλάβης ενοικιαστή' });
    setBusy(false); onRefresh(); notify('Καταγράφηκε στις φθορές');
  };
  const del=async(m:MaintenanceReq)=>{ if(!confirm('Διαγραφή αιτήματος;')) return; await supabase.from('maintenance_requests').delete().eq('id',m.id); onRefresh(); };
  const gdt=(d:string|null)=>d?new Date(d).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'}):'—';
  const openAssign=(m:MaintenanceReq)=>{ setAssignFor(m.id); setAf({name:m.assignee_name||'',contact:m.assignee_contact||''}); };
  const saveAssign=async(m:MaintenanceReq)=>{
    setBusy(true);
    await supabase.from('maintenance_requests').update({ assignee_name:af.name.trim()||null, assignee_contact:af.contact.trim()||null, status:m.status==='new'?'in_progress':m.status }).eq('id',m.id);
    setBusy(false); setAssignFor(null); onRefresh(); notify('Η ανάθεση αποθηκεύτηκε');
  };
  // Μήνυμα προς συνεργείο (τίτλος, περιγραφή, ακίνητο, σύνδεσμοι φωτογραφιών).
  const contractorText=(m:MaintenanceReq)=>[
    `Εργασία: ${m.title}`, m.description?`Περιγραφή: ${m.description}`:'',
    tenant.full_name?`Ενοικιαστής: ${tenant.full_name}`:'', m.contact?`Επικοινωνία ενοικιαστή: ${m.contact}`:'',
    (Array.isArray(m.photos)&&m.photos.length)?`Φωτογραφίες: ${m.photos.join(' ')}`:'',
  ].filter(Boolean).join('\n');

  return (
    <div>
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Αιτήματα Βλάβης</SectionTitle>
        <div style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6, margin:'6px 0 18px' }}>
          Αιτήματα που στέλνει ο ενοικιαστής μέσω της πύλης. Διαχειρίσου την κατάστασή τους και, αν πρόκειται για φθορά, κατέγραψέ τα στο ιστορικό φθορών.
        </div>
        {list.length===0?(
          <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-tertiary)', fontSize:13, fontFamily:T.font.sans }}>
            Δεν υπάρχουν αιτήματα βλάβης. Όταν ο ενοικιαστής στείλει αίτημα από την πύλη, θα εμφανιστεί εδώ.
          </div>
        ):(
          <div style={{ display:'flex', flexDirection:'column' as const, gap:12 }}>
            {list.map(m=>{
              const st=MAINT_STATUS[m.status||'new']||MAINT_STATUS.new;
              return (
                <div key={m.id} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'16px 18px' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' as const, marginBottom:8 }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{m.title}</div>
                      <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:2 }}>{gdt(m.created_at)}{m.contact?` · ${m.contact}`:''}{m.resolved_at?` · επιλύθηκε ${gdt(m.resolved_at)}`:''}</div>
                    </div>
                    <span style={{ ...s.badge(st.c,st.bg), border:`1px solid ${st.c}33`, fontFamily:T.font.sans, whiteSpace:'nowrap' as const }}>{st.label}</span>
                  </div>
                  {m.description&&<div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.6, marginBottom:12, whiteSpace:'pre-wrap' as const }}>{m.description}</div>}
                  {Array.isArray(m.photos)&&m.photos.length>0&&(
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const, marginBottom:12 }}>
                      {m.photos.map((ph,pi)=>(
                        <a key={pi} href={ph} target="_blank" rel="noopener noreferrer" style={{ display:'block', width:64, height:64, borderRadius:8, overflow:'hidden', border:'1px solid var(--border-subtle)' }}>
                          <img src={ph} alt="Φωτογραφία βλάβης" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                        </a>
                      ))}
                    </div>
                  )}
                  {(m.assignee_name||m.assignee_contact)&&assignFor!==m.id&&(
                    <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:10 }}>
                      Ανατέθηκε σε: <strong style={{ color:'var(--text-primary)' }}>{m.assignee_name||'—'}</strong>{m.assignee_contact?` · ${m.assignee_contact}`:''}
                    </div>
                  )}
                  {assignFor===m.id&&(
                    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:14, marginBottom:10 }}>
                      <div style={{ ...s.g2, marginBottom:10 }}>
                        <TextInput label="Συνεργείο / Τεχνικός" value={af.name} onChange={v=>setAf(a=>({...a,name:v}))} placeholder="π.χ. Υδραυλικός Παπαδόπουλος"/>
                        <TextInput label="Τηλέφωνο / Email" value={af.contact} onChange={v=>setAf(a=>({...a,contact:v}))} placeholder="69XXXXXXXX"/>
                      </div>
                      <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                        <button style={s.btnGhost} onClick={()=>setAssignFor(null)}>Ακύρωση</button>
                        <button style={s.btnGold} disabled={busy} onClick={()=>saveAssign(m)}>Αποθήκευση</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                    {m.status!=='new'&&<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} disabled={busy} onClick={()=>setStatus(m,'new')}>Νέο</button>}
                    {m.status!=='in_progress'&&<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} disabled={busy} onClick={()=>setStatus(m,'in_progress')}>Σε εξέλιξη</button>}
                    {m.status!=='done'&&<button style={s.btnSm} disabled={busy} onClick={()=>setStatus(m,'done')}>Ολοκληρώθηκε</button>}
                    <button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} disabled={busy} onClick={()=>openAssign(m)}>{(m.assignee_name||m.assignee_contact)?'Ανάθεση':'Ανάθεση σε συνεργείο'}</button>
                    {m.assignee_contact&&normalizePhone(m.assignee_contact).length>=10&&<a href={whatsappLink(msgDigits(m.assignee_contact),contractorText(m))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>WhatsApp συνεργείου</a>}
                    {m.assignee_contact&&m.assignee_contact.includes('@')&&<a href={`mailto:${m.assignee_contact}?subject=${encodeURIComponent('Εργασία: '+m.title)}&body=${encodeURIComponent(contractorText(m))}`} style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>Email συνεργείου</a>}
                    <button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} disabled={busy} onClick={()=>toDamage(m)}>Καταγραφή ως φθορά</button>
                    <button style={s.btnDng} disabled={busy} onClick={()=>del(m)}>Διαγραφή</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ανανέωση & Αναπροσαρμογή (Renewal View) ────────────────────────────────────
// Νόμος (ΔΤΚ) μέσω RentAdjustView + πρόταση βάσει αγοράς/περιοχής από rent_comparables.
function RenewalView({ tenant, userId, comps }:{ tenant:Tenant; userId:string; comps:RentComp[] }) {
  const rent=tenant.monthly_rent||0;
  const rentComps=comps.filter(c=>(c.listing_type||'rent')==='rent'&&(c.rent||0)>0);
  const avgMarket=rentComps.length?rentComps.reduce((a,c)=>a+(c.rent||0),0)/rentComps.length:0;
  const perSqmComps=rentComps.filter(c=>(c.rent_per_sqm||0)>0);
  const avgPerSqm=perSqmComps.length?perSqmComps.reduce((a,c)=>a+(c.rent_per_sqm||0),0)/perSqmComps.length:0;
  const legalNew=rent*(1+LATEST_CPI_PCT/100);
  const marketDiff=avgMarket>0?rent-avgMarket:0;
  const marketDiffPct=avgMarket>0?(marketDiff/avgMarket)*100:0;
  const suggested=rentComps.length?Math.round(avgMarket):Math.round(legalNew);
  const phoneDigits=msgDigits(tenant.phone);
  const proposalText=`Πρόταση ανανέωσης μίσθωσης. Τρέχον μηνιαίο μίσθωμα ${fmt(rent)}. Προτεινόμενο νέο μίσθωμα ${fmt(suggested)}${rentComps.length?', βάσει του μέσου ενοικίου της περιοχής':', βάσει της ετήσιας αναπροσαρμογής ΔΤΚ'}. Παραμένω στη διάθεσή σας για συζήτηση.`;

  return (
    <div>
      {/* Δύο βάσεις πρότασης: νόμος (ΔΤΚ) και αγορά/περιοχή */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap:16, marginBottom:16 }}>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Με βάση τον νόμο (ΔΤΚ)</SectionTitle>
          <DataRow label="Τρέχον μίσθωμα" value={<span style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(rent)}</span>}/>
          <DataRow label={`Ανώτατο ΔΤΚ (+${LATEST_CPI_PCT.toFixed(1)}%)`} value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(legalNew)}</span>}/>
          <div style={{ marginTop:10, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
            Ετήσια αναπροσαρμογή βάσει Δείκτη Τιμών Καταναλωτή (ΕΛΣΤΑΤ), εφόσον προβλέπεται στη σύμβαση. Για τον ακριβή υπολογισμό ανά έτος και την εκτύπωση ειδοποίησης, δες τον υπολογιστή πιο κάτω.
          </div>
        </div>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Με βάση την αγορά / περιοχή</SectionTitle>
          {rentComps.length>0?(
            <>
              <DataRow label={`Μέσο ενοίκιο περιοχής (${rentComps.length} συγκρίσιμα)`} value={<span style={{ color:'var(--positive)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(avgMarket)}</span>}/>
              {avgPerSqm>0&&<DataRow label="Μέση τιμή ανά m²" value={<span style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(avgPerSqm)}</span>}/>}
              <DataRow label="Απόκλιση τρέχοντος" value={<span style={{ color:marketDiff>0?'var(--positive)':marketDiff<0?'var(--warning)':'var(--text-secondary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{marketDiff>0?'+':''}{fmt(marketDiff)} ({marketDiffPct.toFixed(1)}%)</span>}/>
              <div style={{ marginTop:10, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
                {marketDiff<0?'Το τρέχον μίσθωμα είναι κάτω από τον μέσο όρο της περιοχής, υπάρχει περιθώριο αναπροσαρμογής προς τα πάνω (εντός των ορίων του νόμου).':'Το τρέχον μίσθωμα είναι στο ή πάνω από τον μέσο όρο της περιοχής.'}
              </div>
            </>
          ):(
            <InfoBanner tone="info">Δεν υπάρχουν καταχωρημένα συγκρίσιμα ενοίκια για την περιοχή αυτού του ακινήτου. Πρόσθεσε αγγελίες στην καρτέλα «Ενοίκιο/Αγορά» για πρόταση βάσει αγοράς. Έως τότε, χρησιμοποίησε την πρόταση με βάση τον νόμο (ΔΤΚ).</InfoBanner>
          )}
        </div>
      </div>

      {/* Πρόταση ανανέωσης προς αποστολή */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Πρόταση Ανανέωσης προς Αποστολή</SectionTitle>
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'14px 16px', fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.7, marginBottom:14 }}>{proposalText}</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
          {tenant.phone&&<a href={whatsappLink(phoneDigits,proposalText)} target="_blank" rel="noopener noreferrer" style={{ ...s.btnSm, textDecoration:'none' }}>WhatsApp</a>}
          {tenant.phone&&<a href={viberLink(proposalText)} target="_blank" rel="noopener noreferrer" style={{ ...s.btnSm, textDecoration:'none' }}>Viber</a>}
          <button style={s.btnSm} onClick={()=>navigator.clipboard?.writeText(proposalText)}>Αντιγραφή</button>
          {tenant.email&&<a href={`mailto:${tenant.email}?subject=${encodeURIComponent('Πρόταση ανανέωσης μίσθωσης')}&body=${encodeURIComponent(proposalText)}`} style={{ ...s.btnSm, textDecoration:'none' }}>Email</a>}
        </div>
      </div>

      {/* Πλήρης υπολογιστής ΔΤΚ + εκτύπωση ειδοποίησης */}
      <RentAdjustView tenant={tenant} userId={userId}/>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
type DossierTab='overview'|'lease'|'condition'|'legal'|'comm'|'docs';

export default function TabTenant({ propertyId, userId, onStartHandover }:TabTenantProps) {
  const supabase=createClient();
  const [tenants,setTenants]=useState<Tenant[]>([]);
  const [payments,setPayments]=useState<RentPayment[]>([]);
  const [damages,setDamages]=useState<TenantDamage[]>([]);
  const [comps,setComps]=useState<RentComp[]>([]);
  const [maint,setMaint]=useState<MaintenanceReq[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [ok,setOk]=useState<string|null>(null);

  const [search,setSearch]=useState('');
  const [segment,setSegment]=useState<'current'|'past'|'overdue'|'all'>('current');

  // Φόρμα (modal)
  const [isForm,setIsForm]=useState(false);
  const [editId,setEditId]=useState<string|null>(null);
  const [formTab,setFormTab]=useState<'profile'|'services'>('profile');
  const [form,setForm]=useState(blank());
  const sf=(k:string,v:any)=>setForm(f=>({...f,[k]:v}));
  // Έγγραφα που ανέβηκαν μέσα από τη φόρμα (property-files + property_documents).
  const [formDocs,setFormDocs]=useState<{id:string;file_name:string;tag:'id'|'lease'}[]>([]);
  const [docBusy,setDocBusy]=useState(false);
  // Προοδευτική αποκάλυψη ενοτήτων υπηρεσιών (μόνο εμφάνιση — δεν αλλάζει δεδομένα).
  const [svcUI,setSvcUI]=useState<{stream:boolean;clean:boolean;maint:boolean;park:boolean;extra:boolean}>(SVC_UI_CLOSED);

  // Ντοσιέ (drawer)
  const [openId,setOpenId]=useState<string|null>(null);
  const [dossierTab,setDossierTab]=useState<DossierTab>('overview');

  useEffect(()=>{
    if(form.lease_start&&form.lease_type&&form.lease_type!=='custom')
      sf('lease_end',calcEnd(form.lease_start,form.lease_type as LeaseType,form.custom_lease_days));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[form.lease_start,form.lease_type]);

  const fetch_=useCallback(async()=>{
    setLoading(true);
    const{data:td}=await supabase.from('tenants').select('*').eq('property_id',propertyId).eq('user_id',userId).order('created_at',{ascending:false});
    const list=(td||[]) as Tenant[];
    const[{data:pd},{data:dd},{data:cd},{data:md}]=await Promise.all([
      supabase.from('rent_payments').select('*').eq('property_id',propertyId).eq('user_id',userId).order('period_year',{ascending:false}).order('period_month',{ascending:false}),
      supabase.from('tenant_damages').select('*').eq('property_id',propertyId).eq('user_id',userId).order('occurred_on',{ascending:false}),
      supabase.from('rent_comparables').select('id,property_id,title,area,sqm,rent,rent_per_sqm,listing_type,source,url').eq('property_id',propertyId),
      supabase.from('maintenance_requests').select('*').eq('user_id',userId).eq('property_id',propertyId).order('created_at',{ascending:false}),
    ]);
    setTenants(list); setPayments((pd||[]) as RentPayment[]); setDamages((dd||[]) as TenantDamage[]); setComps((cd||[]) as RentComp[]); setMaint((md||[]) as MaintenanceReq[]);
    setLoading(false);
  },[propertyId,userId]);

  useEffect(()=>{fetch_();},[fetch_]);

  // Συγχρονισμός ημερολογίου/εργασιών για τους τρέχοντες ενοικιαστές (idempotent).
  const syncedRef=React.useRef(false);
  useEffect(()=>{
    if(syncedRef.current||loading) return;
    syncedRef.current=true;
    tenants.filter(t=>!isPastTenant(t)&&t.id).forEach(t=>{
      syncTenantSchedule(supabase,t as unknown as TenantScheduleInput,propertyId,userId,'open',{rentDueDay:t.rent_due_day??1});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[loading]);

  const notify=(msg:string)=>{setOk(msg);setTimeout(()=>setOk(null),3000);};

  // ── Παράγωγα ────────────────────────────────────────────────────────────────
  const todayS=todayISO();
  const overdueByTenant=useMemo(()=>{
    const m=new Map<string,{count:number;amount:number}>();
    payments.filter(p=>!p.paid&&p.due_date&&p.due_date<todayS).forEach(p=>{
      const e=m.get(p.tenant_id)||{count:0,amount:0}; e.count++; e.amount+=p.amount; m.set(p.tenant_id,e);
    });
    return m;
  },[payments,todayS]);
  // Δηλωμένες-από-μισθωτή πληρωμές ανά ενοικιαστή (αναμένουν επιβεβαίωση είσπραξης).
  const declaredByTenant=useMemo(()=>{
    const m=new Map<string,number>();
    payments.filter(p=>!p.paid&&p.tenant_declared).forEach(p=>m.set(p.tenant_id,(m.get(p.tenant_id)||0)+1));
    return m;
  },[payments]);

  const currentTenants=useMemo(()=>tenants.filter(t=>!isPastTenant(t)),[tenants]);
  const pastTenants=useMemo(()=>tenants.filter(isPastTenant),[tenants]);

  const kpis=useMemo<KPIItem[]>(()=>{
    const currentRent=currentTenants.reduce((a,t)=>a+(t.monthly_rent||0),0);
    const arrears=[...overdueByTenant.values()].reduce((a,e)=>a+e.amount,0);
    const arrearsCount=[...overdueByTenant.values()].reduce((a,e)=>a+e.count,0);
    const depositHeld=currentTenants.filter(t=>!t.deposit_returned).reduce((a,t)=>a+(t.deposit_amount||0),0);
    return [
      { label:'Τρέχον Μηνιαίο Ενοίκιο', value:fe(currentRent), tone:'neutral' },
      { label:'Ληξιπρόθεσμη Οφειλή', value:fe(arrears), tone:arrears>0?'negative':'neutral', sub:arrearsCount>0?`${fn(arrearsCount)} δόσεις`:'καμία οφειλή' },
      { label:'Εγγύηση σε Κατοχή', value:fe(depositHeld), tone:'neutral' },
      { label:'Προηγούμενοι Ενοικιαστές', value:fn(pastTenants.length), tone:'neutral' },
    ];
  },[currentTenants,pastTenants,overdueByTenant]);

  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return tenants.filter(t=>{
      if(segment==='current'&&isPastTenant(t)) return false;
      if(segment==='past'&&!isPastTenant(t)) return false;
      if(segment==='overdue'&&!overdueByTenant.has(t.id)) return false;
      if(q){
        const hay=`${t.full_name} ${t.afm||''} ${t.phone||''}`.toLowerCase();
        if(!hay.includes(q)) return false;
      }
      return true;
    });
  },[tenants,search,segment,overdueByTenant]);

  // ── Φόρμα ────────────────────────────────────────────────────────────────────
  const openAdd=()=>{ setForm(blank()); setEditId(null); setFormDocs([]); setSvcUI(SVC_UI_CLOSED); setFormTab('profile'); setIsForm(true); };
  const openEditForm=(t:Tenant)=>{
    const n=(v:number|null)=>v?.toString()||'';
    const f:ReturnType<typeof blank>={
      full_name:t.full_name||'',email:t.email||'',phone:t.phone||'',phone_work:t.phone_work||'',
      nationality:t.nationality||'',profession:t.profession||'',employer:t.employer||'',afm:t.afm||'',
      id_doc_type:(t.id_doc_type as IdDocType)||'',id_doc_number:t.id_doc_number||'',iban:t.iban||'',notes:t.notes||'',
      lease_type:t.lease_type||'annual',lease_category:t.lease_category||'',lease_start:t.lease_start?.split('T')[0]||'',lease_end:t.lease_end?.split('T')[0]||'',custom_lease_days:t.custom_lease_days||365,
      monthly_rent:n(t.monthly_rent),payment_frequency:t.payment_frequency||'monthly',rent_due_day:String(Math.min(Math.max(1,t.rent_due_day||1),28)),rent_iban:t.rent_iban||'',
      furnishing:(t.furnishing as Furnishing)||'',
      deposit_amount:n(t.deposit_amount),deposit_method:t.deposit_method||'',deposit_paid_on:t.deposit_paid_on?.split('T')[0]||'',deposit_invested:t.deposit_invested||false,deposit_returned:t.deposit_returned||false,deposit_return_date:t.deposit_return_date?.split('T')[0]||'',
      deposit_invest_rate:n(t.deposit_invest_rate),deposit_invest_type:t.deposit_invest_type||'',deposit_invest_term:t.deposit_invest_term||'',
      all_inclusive:t.all_inclusive||false,kwh_limit:n(t.kwh_limit),kwh_price:n(t.kwh_price),
      electricity_provider:t.electricity_provider||'',electricity_tariff:t.electricity_tariff||'',electricity_monthly_limit:n(t.electricity_monthly_limit),
      water_monthly_limit:n(t.water_monthly_limit),internet_provider:t.internet_provider||'',internet_plan:t.internet_plan||'',internet_cost:n(t.internet_cost),
      e_payment:t.e_payment??true,streaming:t.streaming||null,cleaning:t.cleaning||null,extra_perks:t.extra_perks||'',
      welcome_basket:t.welcome_basket||false,welcome_basket_amount:n(t.welcome_basket_amount),welcome_basket_contents:t.welcome_basket_contents||'',
      parking_included:t.parking_included||false,parking_extra:t.parking_extra||false,parking_extra_price:n(t.parking_extra_price),
      parking_type:t.parking_type||'',parking_has_electricity:t.parking_has_electricity||false,parking_notes:t.parking_notes||'',
      ac_service_by:t.ac_service_by||'owner',ac_service_frequency:t.ac_service_frequency||'annual',ac_service_owner_pct:ownerPctFromBy(t.ac_service_owner_pct,t.ac_service_by),
      solar_service_by:t.solar_service_by||'owner',solar_service_frequency:t.solar_service_frequency||'annual',solar_service_owner_pct:ownerPctFromBy(t.solar_service_owner_pct,t.solar_service_by),
      heat_pump_service_by:t.heat_pump_service_by||'owner',heat_pump_service_frequency:t.heat_pump_service_frequency||'annual',heat_pump_service_owner_pct:ownerPctFromBy(t.heat_pump_service_owner_pct,t.heat_pump_service_by),
      solar_panels_service_by:t.solar_panels_service_by||'owner',solar_panels_service_frequency:t.solar_panels_service_frequency||'annual',solar_panels_service_owner_pct:ownerPctFromBy(t.solar_panels_service_owner_pct,t.solar_panels_service_by),
      pest_control_by:t.pest_control_by||'owner',pest_control_frequency:t.pest_control_frequency||'',pest_control_owner_pct:ownerPctFromBy(t.pest_control_owner_pct,t.pest_control_by),annual_services_notes:t.annual_services_notes||'',
      prepay_option:t.prepay_option||false,prepay_months:t.prepay_months||3,prepay_discount_pct:n(t.prepay_discount_pct),
      prepay_invested:t.prepay_invested||false,prepay_invest_rate:n(t.prepay_invest_rate),prepay_invest_type:t.prepay_invest_type||'',prepay_invest_term:t.prepay_invest_term||'',
      lease_doc_external_url:t.lease_doc_external_url||'',
    };
    setForm(f); setFormDocs([]); setSvcUI(svcUIFrom(f));
    setEditId(t.id); setFormTab('profile'); setIsForm(true);
    // Επαναφόρτωση των εγγράφων που έχουν ήδη ανέβει για ΑΥΤΟΝ τον ενοικιαστή
    // (ταυτότητα, μισθωτήρια — και προηγούμενα με τον ίδιο ενοικιαστή).
    supabase.from('property_documents').select('id,file_name,title').eq('property_id',propertyId).eq('user_id',userId).eq('supplier','tenant:'+t.id)
      .then(({data})=>{ setFormDocs((data||[]).map((d:{id:string;file_name:string|null;title:string|null})=>({ id:d.id, file_name:d.file_name||'έγγραφο', tag:(d.title||'').startsWith('Έγγραφο ταυτοποίησης')?'id':'lease' as 'id'|'lease' }))); });
  };

  // Ανέβασμα εγγράφου φόρμας (ταυτοποίηση ή μισθωτήριο) — ίδιο μοτίβο με το
  // property-files/property_documents που χρησιμοποιείται στη σάρωση/αρχειοθέτηση.
  const uploadFormDoc=async(file:File,tag:'id'|'lease')=>{
    setDocBusy(true); setError(null);
    try{
      const safe=file.name.replace(/[^\w.\-]+/g,'_');
      const path=`${userId}/${propertyId}/document/${Date.now()}_${safe}`;
      const{error:upErr}=await supabase.storage.from('property-files').upload(path,file,{upsert:false,contentType:file.type||undefined});
      if(upErr){ setError(upErr.message); setDocBusy(false); return; }
      const label=tag==='id'?'Έγγραφο ταυτοποίησης':'Μισθωτήριο / έγγραφο';
      const title=`${label} · ${form.full_name.trim()||file.name}`.slice(0,200);
      const{data:ins,error:insErr}=await supabase.from('property_documents').insert({property_id:propertyId,user_id:userId,kind:'document',category:'tenant',supplier:editId?('tenant:'+editId):null,title,doc_date:todayISO(),file_path:path,file_name:file.name,mime:file.type||null,size_bytes:file.size}).select('id,file_name').single();
      if(insErr){ setError(insErr.message); setDocBusy(false); return; }
      if(ins) setFormDocs(prev=>[...prev,{id:ins.id as string,file_name:ins.file_name as string,tag}]);
      notify('Το έγγραφο ανέβηκε');
    }catch{ setError('Σφάλμα ανεβάσματος εγγράφου'); }
    setDocBusy(false);
  };

  const save=async()=>{
    if(!form.full_name.trim()){setError('Το ονοματεπώνυμο είναι υποχρεωτικό');setFormTab('profile');return;}
    if(!form.lease_category){setError('Ο τύπος μίσθωσης (κατοικία ή επαγγελματική) είναι υποχρεωτικός');setFormTab('profile');return;}
    setSaving(true);setError(null);
    const n=(v:string)=>v?Math.max(0,parseFloat(v)):null;
    const dueDay=Math.min(Math.max(1,parseInt(form.rent_due_day)||1),28);
    const payload={
      property_id:propertyId,user_id:userId,full_name:form.full_name.trim(),
      email:form.email||null,phone:form.phone||null,phone_work:form.phone_work||null,
      nationality:form.nationality||null,profession:form.profession||null,employer:form.employer||null,afm:form.afm||null,
      id_doc_type:form.id_doc_type||null,id_doc_number:form.id_doc_number||null,iban:form.iban||null,notes:form.notes||null,
      lease_type:form.lease_type||null,lease_category:form.lease_category||null,lease_start:form.lease_start||null,lease_end:form.lease_end||null,custom_lease_days:form.custom_lease_days||null,
      monthly_rent:n(form.monthly_rent),payment_frequency:form.payment_frequency||null,rent_due_day:dueDay,rent_iban:form.rent_iban?.trim()||null,
      furnishing:form.furnishing||null,
      deposit_amount:n(form.deposit_amount),deposit_method:form.deposit_method||null,deposit_paid_on:form.deposit_paid_on||null,deposit_invested:form.deposit_invested,deposit_returned:form.deposit_returned,deposit_return_date:form.deposit_return_date||null,
      deposit_invest_rate:n(form.deposit_invest_rate),deposit_invest_type:form.deposit_invest_type||null,deposit_invest_term:form.deposit_invest_term||null,
      all_inclusive:form.all_inclusive,kwh_limit:n(form.kwh_limit),kwh_price:n(form.kwh_price),
      electricity_provider:form.electricity_provider||null,electricity_tariff:form.electricity_tariff||null,electricity_monthly_limit:n(form.electricity_monthly_limit),
      water_monthly_limit:n(form.water_monthly_limit),internet_provider:form.internet_provider||null,internet_plan:form.internet_plan||null,internet_cost:n(form.internet_cost),
      e_payment:form.e_payment,streaming:form.streaming,cleaning:form.cleaning,extra_perks:form.extra_perks||null,
      welcome_basket:form.welcome_basket,welcome_basket_amount:n(form.welcome_basket_amount),welcome_basket_contents:form.welcome_basket_contents||null,
      parking_included:form.parking_included,parking_extra:form.parking_extra,parking_extra_price:n(form.parking_extra_price),
      parking_type:form.parking_type||null,parking_has_electricity:form.parking_has_electricity,parking_notes:form.parking_notes||null,
      ac_service_by:byFromOwnerPct(form.ac_service_owner_pct),ac_service_owner_pct:form.ac_service_owner_pct,ac_service_frequency:form.ac_service_frequency||null,
      solar_service_by:byFromOwnerPct(form.solar_service_owner_pct),solar_service_owner_pct:form.solar_service_owner_pct,solar_service_frequency:form.solar_service_frequency||null,
      heat_pump_service_by:byFromOwnerPct(form.heat_pump_service_owner_pct),heat_pump_service_owner_pct:form.heat_pump_service_owner_pct,heat_pump_service_frequency:form.heat_pump_service_frequency||null,
      solar_panels_service_by:byFromOwnerPct(form.solar_panels_service_owner_pct),solar_panels_service_owner_pct:form.solar_panels_service_owner_pct,solar_panels_service_frequency:form.solar_panels_service_frequency||null,
      pest_control_by:byFromOwnerPct(form.pest_control_owner_pct),pest_control_owner_pct:form.pest_control_owner_pct,pest_control_frequency:form.pest_control_frequency||null,annual_services_notes:form.annual_services_notes||null,
      prepay_option:form.prepay_option,prepay_months:form.prepay_months||null,prepay_discount_pct:n(form.prepay_discount_pct),
      prepay_invested:form.prepay_invested,prepay_invest_rate:n(form.prepay_invest_rate),prepay_invest_type:form.prepay_invest_type||null,prepay_invest_term:form.prepay_invest_term||null,
      lease_doc_external_url:form.lease_doc_external_url||null,
    };
    const q=editId
      ?supabase.from('tenants').update(payload).eq('id',editId).select('*').single()
      :supabase.from('tenants').insert(payload).select('*').single();
    const{data:savedRow,error:err}=await q;
    if(err){setError(err.message);setSaving(false);return;}
    const savedTenant=(savedRow||null) as (TenantScheduleInput&{rent_due_day?:number|null})|null;
    // Έγγραφα που ανέβηκαν κατά την ΠΡΟΣΘΗΚΗ (πριν υπάρξει id) συνδέονται τώρα με τον ενοικιαστή.
    if(savedTenant?.id && !editId && formDocs.length){
      await supabase.from('property_documents').update({supplier:'tenant:'+savedTenant.id}).in('id',formDocs.map(d=>d.id));
    }
    if(savedTenant?.id) await syncTenantSchedule(supabase,savedTenant,propertyId,userId,'save',{rentDueDay:dueDay});
    setSaving(false);setIsForm(false);
    notify(editId?'Αποθηκεύτηκε':'Ενοικιαστής προστέθηκε');
    await fetch_();
  };

  const markMovedOut=async(t:Tenant)=>{
    if(!confirm(`Σήμανση αποχώρησης για «${t.full_name}»; Θα μεταφερθεί στους προηγούμενους ενοικιαστές.`)) return;
    await supabase.from('tenants').update({status:'past',move_out_date:todayISO()}).eq('id',t.id);
    notify('Ο ενοικιαστής μεταφέρθηκε στο ιστορικό'); fetch_();
  };
  const delTenant=async(t:Tenant)=>{
    if(!confirm(`Οριστική διαγραφή «${t.full_name}»; Θα διαγραφούν και οι πληρωμές/φθορές του.`)) return;
    await supabase.from('rent_payments').delete().eq('tenant_id',t.id);
    await supabase.from('tenant_damages').delete().eq('tenant_id',t.id);
    await supabase.from('tenants').delete().eq('id',t.id);
    if(openId===t.id) setOpenId(null);
    notify('Διαγράφηκε'); fetch_();
  };

  // ── Έγγραφο μισθωτηρίου (PDF) ────────────────────────────────────────────────
  const uploadPDF=async(t:Tenant,file:File)=>{
    setUploading(true);
    const path=`${userId}/${t.id}/${file.name}`;
    const{error:upErr}=await supabase.storage.from('lease-documents').upload(path,file,{upsert:true});
    if(upErr){setError(upErr.message);setUploading(false);return;}
    await supabase.from('tenants').update({lease_doc_name:file.name}).eq('id',t.id);
    setUploading(false);notify('Το PDF ανέβηκε');fetch_();
  };
  const openLeaseDoc=async(t:Tenant)=>{
    if(!t.lease_doc_name) return;
    const path=`${userId}/${t.id}/${t.lease_doc_name}`;
    const{data,error:e}=await supabase.storage.from('lease-documents').createSignedUrl(path,60*60);
    if(e||!data?.signedUrl){setError('Δεν ήταν δυνατό το άνοιγμα του PDF.');return;}
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  };

  // ── Εξαγωγή CSV μητρώου ──────────────────────────────────────────────────────
  const exportRoster=()=>{
    downloadCsv(`enoikiastes_${todayISO()}`,
      ['Ονοματεπώνυμο','Κατάσταση','ΑΦΜ','Τηλέφωνο','Email','Είδος μίσθωσης','Έναρξη','Λήξη','Αποχώρηση','Ημέρα πληρωμής','Μηνιαίο ενοίκιο (€)','Εγγύηση (€)','Τρόπος εγγύησης','Ημ. καταβολής εγγύησης','Επεστράφη'],
      [...tenants].map(t=>[
        t.full_name, isPastTenant(t)?'Προηγούμενος':'Τρέχων', t.afm||'', t.phone||'', t.email||'',
        t.lease_category?LEASE_CATEGORY_LABELS[t.lease_category]:'', csvDate(t.lease_start), csvDate(t.lease_end), csvDate(t.move_out_date),
        t.rent_due_day||'', csvEur(t.monthly_rent), csvEur(t.deposit_amount), t.deposit_method||'', csvDate(t.deposit_paid_on), t.deposit_returned?'ΝΑΙ':'',
      ]),
    );
  };

  if(loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:400 }}><Spinner label="Φόρτωση…" /></div>
  );

  const dc=openId?tenants.find(t=>t.id===openId)||null:null;
  const dcPayments=dc?payments.filter(p=>p.tenant_id===dc.id):[];
  const dcDamages=dc?damages.filter(d=>d.tenant_id===dc.id):[];
  const dcMaint=dc?maint.filter(m=>m.tenant_id===dc.id):[];
  const dcOverdue=dc?(overdueByTenant.get(dc.id)||{count:0,amount:0}):{count:0,amount:0};

  // Ιστορικό ενοικιαστών: πορεία ενοικίου στον χρόνο (χρονολογικά).
  const rentHistory=[...tenants].filter(t=>t.monthly_rent).sort((a,b)=>(a.lease_start||'').localeCompare(b.lease_start||''));

  const statusBadge=(t:Tenant)=>{
    if(overdueByTenant.has(t.id)) return <Badge tone="negative">Ληξιπρόθεσμο</Badge>;
    if(isPastTenant(t)) return <Badge tone="neutral">Προηγούμενος</Badge>;
    const d=daysLeft(t.lease_end);
    if(d!=null&&d<0) return <Badge tone="warning">Έληξε</Badge>;
    return <Badge tone="positive">Τρέχων</Badge>;
  };

  const FTABS:[string,typeof formTab][]=[['Στοιχεία Μισθωτή','profile'],['Παρεχόμενες Υπηρεσίες σε Μισθωτή','services']];
  const DTABS:{id:DossierTab;label:string;badge?:number}[]=dc?[
    {id:'overview',label:'Επισκόπηση'},
    {id:'lease',label:'Μίσθωση & Εγγύηση',badge:(dcOverdue.count+(declaredByTenant.get(dc.id)||0))||undefined},
    {id:'condition',label:'Φθορές & Βλάβες',badge:(dcDamages.filter(d=>!d.repaired).length+dcMaint.filter(m=>m.status!=='done').length)||undefined},
    {id:'legal',label:'Νομικά & Φόρος'},
    {id:'comm',label:'Επικοινωνία'},
    {id:'docs',label:'Έγγραφα'},
  ]:[];

  return (
    <div style={{ fontFamily:T.font.sans, color:'var(--text-primary)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {ok&&<div style={{ background:'var(--positive-dim)', border:'1px solid var(--positive-border)', borderLeft:'3px solid var(--positive)', borderRadius:T.radius.inner, padding:'11px 18px', marginBottom:14, color:'var(--positive)', fontSize:13, fontFamily:T.font.sans, fontWeight:500 }}>{ok}</div>}
      {error&&<div style={{ background:'var(--negative-dim)', border:'1px solid var(--negative-border)', borderLeft:'3px solid var(--negative)', borderRadius:T.radius.inner, padding:'11px 18px', marginBottom:14, color:'var(--negative)', fontSize:13, fontFamily:T.font.sans, fontWeight:500, display:'flex', justifyContent:'space-between', alignItems:'center' }}><span>{error}</span><button onClick={()=>setError(null)} style={{ background:'none', border:'none', color:'var(--negative)', cursor:'pointer', fontSize:18, lineHeight:1, padding:0 }}>×</button></div>}

      <PageTitle title="Ενοικιαστής" sub="Μητρώο ενοικιαστών του ακινήτου: τρέχων και ιστορικοί, με πλήρες ντοσιέ ανά μίσθωση."
        right={tenants.length>0?<div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
          <ExportButton onClick={exportRoster}/>
          <Btn variant="primary" onClick={openAdd}>Νέος ενοικιαστής</Btn>
        </div>:undefined}/>

      <KPIGrid items={kpis}/>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const, alignItems:'center', marginBottom:16 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Αναζήτηση ονόματος, ΑΦΜ, τηλεφώνου…"
          style={{ background:'var(--bg-base)', border:'1px solid var(--border-default)', borderRadius:10, padding:'10px 14px', color:'var(--text-primary)', fontSize:14, height:42, maxWidth:280, flex:'1 1 220px', outline:'none', boxSizing:'border-box', fontFamily:T.font.sans }}/>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
          {([['all','Όλοι'],['current','Τρέχων'],['past','Προηγούμενοι']] as [typeof segment,string][]).map(([v,l])=>(
            <button key={v} onClick={()=>setSegment(v)} style={{ padding:'7px 14px', borderRadius:20, border:`1px solid ${segment===v?'var(--accent)':'var(--border-subtle)'}`, background:segment===v?'var(--accent-soft)':'transparent', color:segment===v?'var(--accent)':'var(--text-secondary)', cursor:'pointer', fontSize:12, fontFamily:T.font.sans, fontWeight:500, whiteSpace:'nowrap' as const }}>{l}</button>
          ))}
        </div>
      </div>

      {tenants.length===0?(
        <EmptyState title="Κανένας ενοικιαστής ακόμη" hint="Πρόσθεσε τον ενοικιαστή του ακινήτου για πλήρη παρακολούθηση μίσθωσης, ενοικίων, εγγύησης, φθορών και ανανέωσης." action={<Btn variant="primary" onClick={openAdd}>Νέος ενοικιαστής</Btn>}/>
      ):(
        <>
          {filtered.length===0?(
            <EmptyState title="Δεν βρέθηκαν ενοικιαστές" hint="Άλλαξε φίλτρο ή αναζήτηση."/>
          ):(
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap:14 }}>
              {filtered.map(t=>{
                const od=overdueByTenant.get(t.id);
                const d=daysLeft(t.lease_end);
                return (
                  <div key={t.id} role="button" tabIndex={0}
                    onClick={()=>{setOpenId(t.id);setDossierTab('overview');}}
                    onKeyDown={e=>{ if((e.key==='Enter'||e.key===' ')&&e.target===e.currentTarget){e.preventDefault();setOpenId(t.id);setDossierTab('overview');} }}
                    style={{ background:'var(--bg-surface)', border:`1px solid ${od?'var(--negative-border)':'var(--border-subtle)'}`, borderRadius:T.radius.card, padding:16, display:'flex', flexDirection:'column', gap:12, cursor:'pointer', outline:'none' }}>
                    <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                      <div style={{ minWidth:0, flex:1 }}>
                        <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{t.full_name}</div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3, flexWrap:'wrap' as const }}>
                          <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>{t.lease_start||t.lease_end?`${fmtD(t.lease_start)} έως ${fmtD(t.lease_end)}`:'χωρίς περίοδο μίσθωσης'}</span>
                          {t.afm&&<span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.mono }}>ΑΦΜ {t.afm}</span>}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8, flexShrink:0 }}>
                        {statusBadge(t)}
                        {(declaredByTenant.get(t.id)||0)>0&&<Badge tone="accent">Δηλωμένη πληρωμή</Badge>}
                        <button title="Διαγραφή" onClick={e=>{e.stopPropagation();delTenant(t);}}
                          style={{ background:'none', border:'none', borderRadius:8, width:26, height:26, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'var(--text-tertiary)', padding:0 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>
                    <div style={{ background:'var(--bg-base)', boxShadow:'var(--well-inset)', borderRadius:12, padding:12, display:'flex' }}>
                      {([
                        { l:'Μην. ενοίκιο', v:fmt(t.monthly_rent), strong:true },
                        { l:'Εγγύηση', v:fmt(t.deposit_amount) },
                        { l:'Ληξιπρόθεσμη οφειλή', v:od?fmt(od.amount):'—', neg:!!od },
                      ] as {l:string;v:string;strong?:boolean;neg?:boolean}[]).map((m,i)=>(
                        <div key={i} style={{ flex:1, minWidth:0, paddingLeft:i?12:0, borderLeft:i?'1px solid var(--border-subtle)':'none' }}>
                          <div style={{ fontSize:10, fontWeight:600, textTransform:'uppercase' as const, letterSpacing:'0.05em', color:'var(--text-tertiary)', marginBottom:4, whiteSpace:'nowrap' as const, overflow:'hidden', textOverflow:'ellipsis' }}>{m.l}</div>
                          <div style={{ fontSize:13, fontWeight:700, fontFamily:T.font.num, fontVariantNumeric:'tabular-nums', color:m.neg?'var(--negative)':m.strong?'var(--text-primary)':'var(--text-secondary)' }}>{m.v}</div>
                        </div>
                      ))}
                    </div>
                    {!isPastTenant(t)&&d!=null&&d>=0&&d<=60&&<div style={{ fontSize:11, color:'var(--warning)', fontFamily:T.font.sans }}>Λήξη μίσθωσης σε {fn(d)} ημέρες</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Ιστορικό ενοικιαστών: πορεία ενοικίου ανά μίσθωση */}
          {(segment==='past'||segment==='all')&&rentHistory.length>=2&&(
            <div style={{ marginTop:24 }}>
              <SecHdr label="Ιστορικό ενοικιαστών" sub="Πορεία μηνιαίου ενοικίου ανά μίσθωση"/>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {rentHistory.map((t,i)=>{
                  const prev=i>0?rentHistory[i-1].monthly_rent||0:0;
                  const cur=t.monthly_rent||0;
                  const diff=prev>0?cur-prev:0;
                  return (
                    <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'10px 14px', flexWrap:'wrap' as const }}>
                      <div style={{ minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{t.full_name}</div>
                        <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>{fmtD(t.lease_start)} έως {fmtD(t.move_out_date||t.lease_end)}</div>
                      </div>
                      <div style={{ textAlign:'right' as const }}>
                        <span style={{ fontSize:14, fontWeight:700, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', color:'var(--text-primary)' }}>{fmt(cur)}</span>
                        {diff!==0&&<span style={{ marginLeft:8, fontSize:11, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', color:diff>0?'var(--positive)':'var(--negative)' }}>{diff>0?'+':''}{fmt(diff)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Ντοσιέ (drawer) ─────────────────────────────────────────────────── */}
      {dc&&(
        <div onClick={()=>setOpenId(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:900, display:'flex', justifyContent:'flex-end' }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-surface)', borderLeft:'1px solid var(--border-subtle)', width:'min(980px, 100%)', height:'100%', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'var(--elev-3)' }}>
            {/* Sticky header */}
            <div style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'18px 24px', borderBottom:'1px solid var(--border-subtle)', flexShrink:0 }}>
              <button onClick={()=>setOpenId(null)} title="Πίσω" style={{ background:'none', border:'1px solid var(--border-default)', borderRadius:10, width:38, height:38, cursor:'pointer', color:'var(--text-secondary)', fontSize:18, flexShrink:0 }}>‹</button>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' as const }}>
                  <span style={{ fontSize:20, fontWeight:700, color:'var(--text-primary)' }}>{dc.full_name}</span>
                  {statusBadge(dc)}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:5, flexWrap:'wrap' as const }}>
                  {dc.profession&&<span style={{ fontSize:12, color:'var(--text-tertiary)' }}>{dc.profession}</span>}
                  {dc.email&&<span style={{ fontSize:12, color:'var(--text-secondary)' }}>{dc.email}</span>}
                  {dc.phone&&<span style={{ fontSize:12, color:'var(--text-secondary)' }}>{dc.phone}</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0, flexWrap:'wrap' as const, justifyContent:'flex-end' }}>
                <Btn variant="secondary" onClick={()=>openEditForm(dc)}>Επεξεργασία</Btn>
                {onStartHandover&&<Btn variant="secondary" onClick={()=>onStartHandover(dc.full_name||'', dc.phone||'', isPastTenant(dc)?'check_out':'check_in')}>Πρωτόκολλο παράδοσης</Btn>}
                {!isPastTenant(dc)&&<Btn variant="secondary" onClick={()=>markMovedOut(dc)}>Αποχώρησε</Btn>}
              </div>
            </div>

            {/* Section tabs */}
            <div style={{ display:'flex', borderBottom:'1px solid var(--border-subtle)', padding:'0 16px', overflowX:'auto' as const, scrollbarWidth:'none' as const, flexShrink:0 }}>
              {DTABS.map(tb=>(
                <button key={tb.id} onClick={()=>setDossierTab(tb.id)} style={{ ...s.tabBtn(dossierTab===tb.id), display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                  {tb.label}
                  {tb.badge&&tb.badge>0&&<span style={{ minWidth:18, height:18, borderRadius:9, background:'var(--negative)', color:'#fff', fontSize:9, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{tb.badge}</span>}
                </button>
              ))}
            </div>

            {/* Body */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px 32px' }}>
              {dossierTab==='overview'&&(
                <>
                  {isPastTenant(dc)&&<InfoBanner tone="neutral">Προηγούμενος ενοικιαστής{dc.move_out_date?`: αποχώρηση ${fmtD(dc.move_out_date)}`:''}. Το ντοσιέ διατηρείται για το ιστορικό του ακινήτου.</InfoBanner>}
                  <DashboardView tenant={dc} payments={dcPayments}/>
                </>
              )}
              {dossierTab==='lease'&&(
                <div style={{ display:'flex', flexDirection:'column' }}>
                  <div>
                    <InfoBanner tone="info">Περιμένεις το ενοίκιο κάθε μήνα την <strong>{fn(Math.min(Math.max(1,dc.rent_due_day||1),28))}η</strong> ημέρα. Οι μηνιαίες δόσεις δημιουργούνται αυτόματα από την έναρξη της μίσθωσης.</InfoBanner>
                    <PaymentsView tenant={dc} propertyId={propertyId} userId={userId} payments={dcPayments} onRefresh={fetch_} notify={notify}/>
                  </div>
                  <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:28, paddingTop:28 }}><DepositView tenant={dc} payments={dcPayments} damages={dcDamages} onReturned={fetch_}/></div>
                  <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:28, paddingTop:28 }}><RenewalView tenant={dc} userId={userId} comps={comps}/></div>
                </div>
              )}
              {dossierTab==='condition'&&(
                <div style={{ display:'flex', flexDirection:'column' }}>
                  <DamagesView tenant={dc} propertyId={propertyId} userId={userId} damages={dcDamages} onRefresh={fetch_}/>
                  <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:28, paddingTop:28 }}><MaintenanceView tenant={dc} propertyId={propertyId} userId={userId} requests={dcMaint} onRefresh={fetch_} notify={notify}/></div>
                </div>
              )}
              {dossierTab==='legal'&&<LegalTaxView tenant={dc}/>}
              {dossierTab==='comm'&&<CommView tenant={dc} propertyId={propertyId} userId={userId}/>}
              {dossierTab==='docs'&&(
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap:16 }}>
                  <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                    <SectionTitle>Μισθωτήριο (PDF)</SectionTitle>
                    {dc.lease_doc_name?(
                      <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-accent)', borderRadius:T.radius.inner, padding:20 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, gap:10 }}>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, overflow:'hidden', textOverflow:'ellipsis' }}>{dc.lease_doc_name}</div>
                            <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>Ανεβασμένο συμβόλαιο</div>
                          </div>
                          <button style={s.btnDng} onClick={async()=>{if(!dc.lease_doc_name)return;await supabase.storage.from('lease-documents').remove([`${userId}/${dc.id}/${dc.lease_doc_name}`]);await supabase.from('tenants').update({lease_doc_url:null,lease_doc_name:null}).eq('id',dc.id);notify('PDF διαγράφηκε');fetch_();}}>Διαγραφή</button>
                        </div>
                        <button onClick={()=>openLeaseDoc(dc)} style={{ ...s.btnGold, display:'inline-block', marginBottom:10 }}>Άνοιγμα PDF</button>
                        <div style={{ marginTop:10 }}>
                          <label style={{ ...s.btnSm, cursor:'pointer', display:'inline-block' }}>
                            {uploading?'Ανέβασμα...':'Αντικατάσταση PDF'}
                            <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPDF(dc,f);}} disabled={uploading}/>
                          </label>
                        </div>
                      </div>
                    ):(
                      <div style={{ border:'2px dashed var(--border-default)', borderRadius:T.radius.inner, padding:'40px 28px', textAlign:'center' as const }}>
                        <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:18 }}>Ανέβασε το μισθωτήριο σε μορφή PDF</div>
                        <label style={{ ...s.btnGold, cursor:'pointer', display:'inline-block', padding:'11px 28px' }}>
                          {uploading?'Ανέβασμα...':'Επιλογή PDF'}
                          <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPDF(dc,f);}} disabled={uploading}/>
                        </label>
                      </div>
                    )}
                  </div>
                  <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                    <SectionTitle>Εξωτερικός Σύνδεσμος</SectionTitle>
                    {dc.lease_doc_external_url?(
                      <div>
                        <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:14, wordBreak:'break-all' as const, lineHeight:1.6 }}>{dc.lease_doc_external_url}</div>
                        <a href={dc.lease_doc_external_url} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGold, display:'inline-block', textDecoration:'none' }}>Άνοιγμα Συνδέσμου</a>
                      </div>
                    ):(
                      <div style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.7 }}>Δεν έχει οριστεί εξωτερικός σύνδεσμος. Πρόσθεσέ τον από την «Επεξεργασία → Έγγραφα» (Google Drive, Dropbox κ.ά.).</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Φόρμα (modal) ────────────────────────────────────────────────────── */}
      {isForm&&(
        <div onClick={()=>setIsForm(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:950, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 16px', overflowY:'auto' as const }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-accent)', borderRadius:T.radius.card, padding:28, width:'min(860px, 100%)', margin:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:4 }}>{editId?'Επεξεργασία Ενοικιαστή':'Νέος Ενοικιαστής'}</div>
                <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans }}>Συμπλήρωσε τα στοιχεία βήμα βήμα</div>
              </div>
              <button style={s.btnGhost} onClick={()=>setIsForm(false)}>Ακύρωση</button>
            </div>

            <div style={{ height:3, background:'var(--bg-overlay)', borderRadius:2, marginBottom:24, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(FTABS.findIndex(([,t])=>t===formTab)+1)/FTABS.length*100}%`, background:'var(--accent)', borderRadius:2, transition:'width 0.3s ease' }}/>
            </div>

            <div style={{ display:'flex', borderBottom:'1px solid var(--border-subtle)', marginBottom:24 }}>
              {FTABS.map(([l,t])=><button key={t} onClick={()=>setFormTab(t)} style={s.tabBtn(formTab===t)}>{l}</button>)}
            </div>

            {formTab==='profile'&&(
              <>
                {/* Ταυτότητα μισθωτή */}
                <SectionTitle>Προσωπικά Στοιχεία</SectionTitle>
                <div style={{ ...s.g3, marginBottom:16 }}>
                  <TextInput label="Ονοματεπώνυμο *" value={form.full_name} onChange={v=>sf('full_name',v)}/>
                  <TextInput label="Ηλεκτρονικό Ταχυδρομείο" value={form.email} onChange={v=>sf('email',v)} type="email"/>
                  <TextInput label="Κινητό Τηλέφωνο" value={form.phone} onChange={v=>sf('phone',v)}/>
                </div>
                <div style={{ ...s.g3, marginBottom:16 }}>
                  <TextInput label="Τηλέφωνο Εργασίας" value={form.phone_work} onChange={v=>sf('phone_work',v)}/>
                  <TextInput label="Εθνικότητα" value={form.nationality} onChange={v=>sf('nationality',v)} placeholder="π.χ. Ελληνική"/>
                  <TextInput label="Επάγγελμα" value={form.profession} onChange={v=>sf('profession',v)} placeholder="π.χ. Μηχανικός"/>
                </div>
                <div style={{ ...s.g3, marginBottom:16 }}>
                  <TextInput label="Εργοδότης" value={form.employer} onChange={v=>sf('employer',v)}/>
                  <TextInput label="ΑΦΜ" value={form.afm} onChange={v=>sf('afm',v)}/>
                  <TextInput label="IBAN" value={form.iban} onChange={v=>sf('iban',v)} placeholder="GR00 0000 0000 0000..."/>
                </div>
                <div style={{ ...s.g2, marginBottom:16 }}>
                  <SelectField label="Τύπος Εγγράφου Ταυτοποίησης" value={form.id_doc_type} onChange={v=>sf('id_doc_type',v)} options={ID_DOCS.map(d=>({value:d,label:d}))} placeholder="Επιλογή..."/>
                  <TextInput label="Αριθμός Εγγράφου" value={form.id_doc_number} onChange={v=>sf('id_doc_number',v)}/>
                </div>
                {/* Ανέβασμα σαρωμένου εγγράφου ταυτοποίησης */}
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'14px 16px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' as const }}>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', fontFamily:T.font.sans }}>Έγγραφο Ταυτοποίησης</div>
                      <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:2, lineHeight:1.4 }}>Ανέβασε σαρωμένη ταυτότητα, διαβατήριο ή άλλο έγγραφο (PDF ή εικόνα).</div>
                    </div>
                    <label style={{ ...s.btnSm, cursor:docBusy?'default':'pointer', display:'inline-block', opacity:docBusy?0.6:1, whiteSpace:'nowrap' as const }}>
                      {docBusy?'Ανέβασμα...':'Επιλογή αρχείου'}
                      <input type="file" accept=".pdf,image/*" style={{ display:'none' }} disabled={docBusy} onChange={e=>{const f=e.target.files?.[0]; if(f)uploadFormDoc(f,'id'); e.currentTarget.value='';}}/>
                    </label>
                  </div>
                  {formDocs.filter(d=>d.tag==='id').length>0&&(
                    <div style={{ marginTop:12, display:'flex', flexDirection:'column' as const, gap:6 }}>
                      {formDocs.filter(d=>d.tag==='id').map(d=>(
                        <div key={d.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, minWidth:0 }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--positive)', flexShrink:0 }}/>
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{esc(d.file_name)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={s.divider}/>
                {/* Τύπος & διάρκεια μίσθωσης */}
                <SectionTitle>Τύπος Μίσθωσης <span style={{ color:'var(--negative)' }}>*</span></SectionTitle>
                <div style={{ display:'flex', gap:6, marginBottom:6, flexWrap:'wrap' as const }}>
                  {(Object.keys(LEASE_CATEGORY_LABELS) as LeaseCategory[]).map(lc=>(
                    <button key={lc} onClick={()=>sf('lease_category',lc)} style={{ padding:'8px 18px', fontSize:'12px', fontFamily:T.font.sans, cursor:'pointer', borderRadius:T.radius.btn, border:`1px solid ${form.lease_category===lc?'var(--accent)':'var(--border-default)'}`, background:form.lease_category===lc?'var(--accent-dim)':'transparent', color:form.lease_category===lc?'var(--accent)':'var(--text-secondary)', fontWeight:form.lease_category===lc?700:400 }}>{LEASE_CATEGORY_LABELS[lc]}</button>
                  ))}
                </div>
                <div style={{ fontSize:'11px', color:'var(--text-tertiary)', fontFamily:T.font.sans, marginBottom:18, lineHeight:1.5 }}>
                  Καθορίζει τη φορολογική μεταχείριση. Στην επαγγελματική μίσθωση προστίθεται τέλος χαρτοσήμου 3,6% επί του μισθώματος.
                </div>
                <SectionTitle>Διάρκεια Μίσθωσης</SectionTitle>
                <div style={{ display:'flex', gap:6, marginBottom:18, flexWrap:'wrap' as const }}>
                  {(Object.keys(LEASE_LABELS) as LeaseType[]).map(lt=>(
                    <button key={lt} onClick={()=>sf('lease_type',lt)} style={{ padding:'8px 16px', fontSize:'11px', fontFamily:T.font.sans, cursor:'pointer', borderRadius:T.radius.btn, border:`1px solid ${form.lease_type===lt?'var(--accent)':'var(--border-default)'}`, background:form.lease_type===lt?'var(--accent-dim)':'transparent', color:form.lease_type===lt?'var(--accent)':'var(--text-secondary)', fontWeight:form.lease_type===lt?600:400 }}>{LEASE_LABELS[lt]}</button>
                  ))}
                </div>
                <div style={{ ...s.g3, marginBottom:16 }}>
                  <DateField label="Έναρξη Μίσθωσης" value={form.lease_start} onChange={v=>sf('lease_start',v)}/>
                  <DateField label="Λήξη Μίσθωσης" value={form.lease_end} onChange={v=>sf('lease_end',v)}/>
                  {form.lease_type==='custom'&&<NumberInput label="Ημέρες" value={String(form.custom_lease_days)} onChange={v=>sf('custom_lease_days',parseInt(v)||0)} suffix="ημ."/>}
                </div>

                <div style={s.divider}/>
                {/* Ενοίκιο & πληρωμή */}
                <SectionTitle>Ενοίκιο και Τρόπος Πληρωμής</SectionTitle>
                <div style={{ ...s.g4, marginBottom:16 }}>
                  <NumberInput label="Μηνιαίο Ενοίκιο" value={form.monthly_rent} onChange={v=>sf('monthly_rent',v)} suffix="€"/>
                  <SelectField label="Ημέρα Πληρωμής" value={form.rent_due_day} onChange={v=>sf('rent_due_day',v)} options={Array.from({length:28},(_,i)=>({value:String(i+1),label:`${i+1}η`}))}/>
                  <SelectField label="Συχνότητα Εξόφλησης" value={form.payment_frequency} onChange={v=>sf('payment_frequency',v)} options={[{value:'monthly',label:'Μηνιαία'},{value:'bimonthly',label:'Διμηνιαία'},{value:'quarterly',label:'Τριμηνιαία'}]}/>
                  <div><div style={{ ...labelStyle, marginBottom:8 }}>Ηλεκτρονική Πληρωμή</div><Toggle on={form.e_payment} onChange={v=>sf('e_payment',v)} label="Ενεργή" labelOff="Ανενεργή"/></div>
                </div>
                <div style={{ ...s.g2, marginBottom:16 }}>
                  <TextInput label="IBAN Πληρωμής Ενοικίου" value={form.rent_iban} onChange={v=>sf('rent_iban',v)} placeholder="GR..: για αίτημα πληρωμής και QR"/>
                </div>

                <div style={s.divider}/>
                {/* Κατάσταση επίπλωσης — καθορίζει ποιες υπηρεσίες εμφανίζονται */}
                <SectionTitle><span title="Καθορίζει ποιες ενότητες υπηρεσιών εμφανίζονται. Το «Κενό» δεν εμφανίζει streaming ή καθαρισμό.">Κατάσταση Επίπλωσης</span></SectionTitle>
                <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' as const }}>
                  {(Object.keys(FURNISHING_LABELS) as Furnishing[]).map(fv=>(
                    <button key={fv} onClick={()=>sf('furnishing',form.furnishing===fv?'':fv)} style={{ padding:'8px 16px', fontSize:'12px', fontFamily:T.font.sans, cursor:'pointer', borderRadius:T.radius.btn, border:`1px solid ${form.furnishing===fv?'var(--accent)':'var(--border-default)'}`, background:form.furnishing===fv?'var(--accent-dim)':'transparent', color:form.furnishing===fv?'var(--accent)':'var(--text-secondary)', fontWeight:form.furnishing===fv?700:400 }}>{FURNISHING_LABELS[fv]}</button>
                  ))}
                </div>
                <div style={{ fontSize:'11px', color:'var(--text-tertiary)', fontFamily:T.font.sans, marginBottom:18, lineHeight:1.5 }}>
                  Καθορίζει ποιες υπηρεσίες προσφέρονται στον μισθωτή. Στο «Κενό» δεν εμφανίζονται ψηφιακές συνδρομές ούτε καθαρισμός· στο «Επιπλωμένο» προστίθεται ο καθαρισμός· στο «Turn Key» τα πάντα.
                </div>

                <div style={s.divider}/>
                {/* Turn Key */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:form.all_inclusive?16:0 }}>
                  <SectionTitle>Turn Key (All Inclusive)</SectionTitle>
                  <Toggle on={form.all_inclusive} onChange={v=>sf('all_inclusive',v)} label="Ναι" labelOff="Όχι"/>
                </div>
                {form.all_inclusive&&(
                  <>
                    <div style={{ ...s.g3, marginBottom:16 }}>
                      <TextInput label="Πάροχος Ρεύματος" value={form.electricity_provider} onChange={v=>sf('electricity_provider',v)} placeholder="π.χ. ΔΕΗ, Heron"/>
                      <TextInput label="Είδος Τιμολογίου" value={form.electricity_tariff} onChange={v=>sf('electricity_tariff',v)} placeholder="π.χ. G1, Νυχτερινό"/>
                      <NumberInput label="Τιμή kWh" value={form.kwh_price} onChange={v=>sf('kwh_price',v)} suffix="€" step={0.001}/>
                    </div>
                    <div style={{ ...s.g3, marginBottom:16 }}>
                      <NumberInput label="Όριο kWh / Μήνα" value={form.kwh_limit} onChange={v=>sf('kwh_limit',v)} suffix="kWh"/>
                      <NumberInput label="Όριο Νερού / Μήνα" value={form.water_monthly_limit} onChange={v=>sf('water_monthly_limit',v)} suffix="m³"/>
                      <NumberInput label="Κόστος Internet / Μήνα" value={form.internet_cost} onChange={v=>sf('internet_cost',v)} suffix="€"/>
                    </div>
                    <div style={{ ...s.g2, marginBottom:16 }}>
                      <TextInput label="Πάροχος Internet" value={form.internet_provider} onChange={v=>sf('internet_provider',v)} placeholder="π.χ. Cosmote, Wind"/>
                      <TextInput label="Πρόγραμμα Internet" value={form.internet_plan} onChange={v=>sf('internet_plan',v)} placeholder="π.χ. 300Mbps Fiber"/>
                    </div>
                  </>
                )}

                <div style={s.divider}/>
                {/* Εγγύηση */}
                <SectionTitle>Εγγύηση</SectionTitle>
                <div style={{ ...s.g3, marginBottom:16 }}>
                  <NumberInput label="Ποσό Εγγύησης" value={form.deposit_amount} onChange={v=>sf('deposit_amount',v)} suffix="€"/>
                  <SelectField label="Τρόπος Καταβολής" value={form.deposit_method} onChange={v=>sf('deposit_method',v)} options={DEPOSIT_METHODS.map(m=>({value:m,label:m}))} placeholder="Επιλογή..."/>
                  <DateField label="Ημ. Καταβολής Εγγύησης" value={form.deposit_paid_on} onChange={v=>sf('deposit_paid_on',v)}/>
                </div>
                <div style={{ ...s.g3, marginBottom:16 }}>
                  <div><div style={{ ...labelStyle, marginBottom:8 }}>Επενδύεται</div><Toggle on={form.deposit_invested} onChange={v=>sf('deposit_invested',v)} label="Ναι" labelOff="Όχι"/></div>
                  <div><div style={{ ...labelStyle, marginBottom:8 }}>Επεστράφη</div><Toggle on={form.deposit_returned} onChange={v=>sf('deposit_returned',v)} label="Ναι" labelOff="Όχι"/></div>
                  {form.deposit_returned&&<DateField label="Ημερομηνία Επιστροφής" value={form.deposit_return_date} onChange={v=>sf('deposit_return_date',v)}/>}
                </div>
                {form.deposit_invested&&(
                  <div style={{ ...s.g3, marginBottom:16 }}>
                    <NumberInput label="Απόδοση % / Έτος" value={form.deposit_invest_rate} onChange={v=>sf('deposit_invest_rate',v)} suffix="%" step={0.1} max={100}/>
                    <SelectField label="Τύπος Επένδυσης" value={form.deposit_invest_type} onChange={v=>sf('deposit_invest_type',v)} options={['Σταθερή Διάρκεια','Ελεύθερη','ETF','Δανεισμός P2P','Άλλο'].map(v=>({value:v,label:v}))} placeholder="Επιλογή..."/>
                    <TextInput label="Πού Επενδύεται" value={form.deposit_invest_term} onChange={v=>sf('deposit_invest_term',v)} placeholder="π.χ. VWCE..."/>
                  </div>
                )}
                <InvestmentCalc title="Αναλυτής Απόδοσης Εγγύησης" amount={form.deposit_amount?Math.max(0,parseFloat(form.deposit_amount)):null}/>

                <div style={s.divider}/>
                <Textarea label="Σημειώσεις" value={form.notes} onChange={v=>sf('notes',v)}/>

                <div style={s.divider}/>
                {/* Έγγραφα — στο κάτω μέρος των Στοιχείων */}
                <SectionTitle>Μισθωτήριο συμβόλαιο και λοιπά έγγραφα</SectionTitle>
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20 }}>
                  <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:14, lineHeight:1.6 }}>
                    Πρόσθεσε σύνδεσμο κοινόχρηστου φακέλου (Google Drive, Dropbox) ή ανέβασε τα αρχεία (PDF ή εικόνα) απευθείας. Εδώ μπορούν να συνυπάρχουν και προηγούμενα μισθωτήρια με τον ίδιο μισθωτή.
                  </div>
                  <TextInput label="Εξωτερικός Σύνδεσμος" value={form.lease_doc_external_url} onChange={v=>sf('lease_doc_external_url',v)} placeholder="https://drive.google.com/..."/>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:14, flexWrap:'wrap' as const }}>
                    <label style={{ ...s.btnSm, cursor:docBusy?'default':'pointer', display:'inline-block', opacity:docBusy?0.6:1, whiteSpace:'nowrap' as const }}>
                      {docBusy?'Ανέβασμα...':'Ανέβασμα αρχείου'}
                      <input type="file" accept=".pdf,image/*" style={{ display:'none' }} disabled={docBusy} onChange={e=>{const f=e.target.files?.[0]; if(f)uploadFormDoc(f,'lease'); e.currentTarget.value='';}}/>
                    </label>
                    <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>PDF ή εικόνα, αποθηκεύεται στον χώρο εγγράφων του ακινήτου</span>
                  </div>
                  {formDocs.filter(d=>d.tag==='lease').length>0&&(
                    <div style={{ marginTop:14, display:'flex', flexDirection:'column' as const, gap:6 }}>
                      {formDocs.filter(d=>d.tag==='lease').map(d=>(
                        <div key={d.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, minWidth:0 }}>
                          <span style={{ width:5, height:5, borderRadius:'50%', background:'var(--positive)', flexShrink:0 }}/>
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{esc(d.file_name)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {formTab==='services'&&(
              <>
                <div style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6, marginBottom:16 }}>
                  Ενεργοποίησε μόνο τις υπηρεσίες που ισχύουν για αυτόν τον μισθωτή. Κάθε ενότητα ανοίγει με τις λεπτομέρειες: τι περιλαμβάνεται και ποιος επιβαρύνεται, είτε πρόκειται για Turn Key είτε για χωριστές χρεώσεις.
                </div>

                {form.furnishing==='empty'&&(
                  <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.5, marginBottom:16, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'11px 14px' }}>
                    Επιλέχθηκε «Κενό»: οι ψηφιακές συνδρομές και ο καθαρισμός δεν εμφανίζονται, καθώς δεν παρέχονται σε κενή κατοικία. Άλλαξε την «Κατάσταση Επίπλωσης» στα Στοιχεία για να τις προσθέσεις.
                  </div>
                )}

                {svcVisible(form.furnishing).streaming&&(
                <SvcSection title="Ψηφιακές Συνδρομές" hint="Streaming και συνδρομές που παρέχεις ή χρεώνεις στον μισθωτή." open={svcUI.stream} onToggle={()=>setSvcUI(u=>({...u,stream:!u.stream}))}>
                  <StreamingConfig value={form.streaming} onChange={v=>sf('streaming',v)}/>
                </SvcSection>
                )}

                {svcVisible(form.furnishing).cleaning&&(
                <SvcSection title="Καθαρισμός" hint="Τακτικός καθαρισμός: συχνότητα, κόστος και χρέωση." open={svcUI.clean} onToggle={()=>setSvcUI(u=>({...u,clean:!u.clean}))}>
                  <CleaningConfig value={form.cleaning} onChange={v=>sf('cleaning',v)}/>
                </SvcSection>
                )}

                <SvcSection title="Ετήσιες Συντηρήσεις" hint="Πώς μοιράζεται το κόστος κάθε συντήρησης ανάμεσα σε ιδιοκτήτη και ενοικιαστή, και πόσο συχνά επαναλαμβάνεται." open={svcUI.maint} onToggle={()=>setSvcUI(u=>({...u,maint:!u.maint}))}>
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    {[{label:'Κλιματιστικό',pctKey:'ac_service_owner_pct',freqKey:'ac_service_frequency'},{label:'Ηλιακός Θερμοσίφωνας',pctKey:'solar_service_owner_pct',freqKey:'solar_service_frequency'},{label:'Αντλία Θερμότητας',pctKey:'heat_pump_service_owner_pct',freqKey:'heat_pump_service_frequency'},{label:'Φωτοβολταϊκά',pctKey:'solar_panels_service_owner_pct',freqKey:'solar_panels_service_frequency'},{label:'Απεντόμωση / Μυοκτονία',pctKey:'pest_control_owner_pct',freqKey:'pest_control_frequency'}].map(({label,pctKey,freqKey})=>(
                      <div key={pctKey} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, boxShadow:'var(--elev-1)', padding:'16px 18px' }}>
                        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:14, flexWrap:'wrap' as const, marginBottom:16 }}>
                          <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{label}</div>
                          <div style={{ width:184, maxWidth:'100%' }}>
                            <SelectField label="Συχνότητα Συντήρησης" value={(form as any)[freqKey]} onChange={v=>sf(freqKey,v)} options={FREQ_OPTIONS} placeholder="Χωρίς"/>
                          </div>
                        </div>
                        <SplitBar owner={(form as any)[pctKey]} onChange={v=>sf(pctKey,v)}/>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:16 }}>
                    <Textarea label="Σημειώσεις Συντηρήσεων" value={form.annual_services_notes} onChange={v=>sf('annual_services_notes',v)}/>
                  </div>
                </SvcSection>

                <SvcSection title="Χώρος Στάθμευσης" hint="Αν περιλαμβάνεται, χρεώνεται ξεχωριστά ή διαθέτει υποδομή φόρτισης." open={svcUI.park} onToggle={()=>setSvcUI(u=>({...u,park:!u.park}))}>
                  <div style={{ ...s.g3, marginBottom:16 }}>
                    <div><div style={{ ...labelStyle, marginBottom:8 }}>Περιλαμβάνεται στην Τιμή</div><Toggle on={form.parking_included} onChange={v=>sf('parking_included',v)} label="Ναι" labelOff="Όχι"/></div>
                    <div><div style={{ ...labelStyle, marginBottom:8 }}>Νοικιάζεται Ξεχωριστά</div><Toggle on={form.parking_extra} onChange={v=>sf('parking_extra',v)} label="Ναι" labelOff="Όχι"/></div>
                    {form.parking_extra&&<NumberInput label="Μηνιαία Τιμή Στάθμευσης" value={form.parking_extra_price} onChange={v=>sf('parking_extra_price',v)} suffix="€"/>}
                  </div>
                  <div style={{ ...s.g3, marginBottom:16 }}>
                    <SelectField label="Τύπος Χώρου" value={form.parking_type} onChange={v=>sf('parking_type',v)} options={[{value:'outdoor',label:'Υπαίθριος'},{value:'indoor',label:'Κλειστός / Υπόγειος'},{value:'garage',label:'Γκαράζ'},{value:'street',label:'Δρόμος'}]} placeholder="Επιλογή..."/>
                    <div><div title="Υποδομή φόρτισης για ηλεκτρικό όχημα" style={{ ...labelStyle, marginBottom:8 }}>Υποδομή Φόρτισης Ηλεκτρικού Οχήματος</div><Toggle on={form.parking_has_electricity} onChange={v=>sf('parking_has_electricity',v)} label="Ναι" labelOff="Όχι"/></div>
                  </div>
                  <Textarea label="Σημειώσεις Στάθμευσης" value={form.parking_notes} onChange={v=>sf('parking_notes',v)} placeholder="π.χ. Θέση Νο. 12, υπόγειο Β..."/>
                </SvcSection>

                <SvcSection title="Επιπλέον Παροχές" hint="Αποθήκη, κήπος, κοινόχρηστες παροχές και ό,τι άλλο προσφέρεις." open={svcUI.extra} onToggle={()=>setSvcUI(u=>({...u,extra:!u.extra}))}>
                  <Textarea label="Επιπλέον Παροχές" value={form.extra_perks} onChange={v=>sf('extra_perks',v)} placeholder="π.χ. Αποθήκη, κήπος, κοινόχρηστο πλυντήριο..."/>
                </SvcSection>
              </>
            )}

            <div style={{ display:'flex', justifyContent:'space-between', marginTop:28, paddingTop:20, borderTop:'1px solid var(--border-subtle)' }}>
              <div>
                {formTab!=='profile'&&<button style={s.btnGhost} onClick={()=>setFormTab(FTABS[FTABS.findIndex(([,t])=>t===formTab)-1][1] as typeof formTab)}>‹ Πίσω</button>}
              </div>
              <div style={{ display:'flex', gap:10 }}>
                {formTab!=='services'&&<button style={{ ...s.btnGold, padding:'10px 24px' }} onClick={()=>setFormTab(FTABS[FTABS.findIndex(([,t])=>t===formTab)+1][1] as typeof formTab)}>Επόμενο ›</button>}
                {/* Νέος ενοικιαστής: αποθήκευση μόνο στην τελευταία καρτέλα (αφού περάσει από όλα τα βήματα). Σε επεξεργασία, διαθέσιμη παντού. */}
                {(editId||formTab==='services')&&<button style={{ ...s.btnGold, padding:'10px 24px' }} onClick={save} disabled={saving}>{saving?'Αποθήκευση...':editId?'Αποθήκευση Αλλαγών':'Προσθήκη Ενοικιαστή'}</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
