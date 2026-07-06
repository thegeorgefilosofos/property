'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  s, fmt, fmtD, daysLeft, leaseSt, calcEnd,
  StreamingConfig, CleaningConfig, InvestmentCalc, PrepayCalc,
  LEASE_LABELS, SERVICE_BY_LABELS, ID_DOCS,
  MONTHS_FULL, MONTHS_S, FREQ_OPTIONS, EXTRA_CATS,
} from './TabTenantHelpers';
import {
  Toggle, NumberInput, TextInput, Textarea,
  CustomSelect as SelectField,
  DatePicker as DateField,
  ServiceBySelect,
} from './UIComponents';
import type { ServiceBy, LeaseType, PaymentFreq, IdDocType, StreamingSvc, CleaningCfg } from './TabTenantHelpers';
import { T, PageTitle, KPIGrid, InfoBanner, fe, fn, fd, Spinner, ExportButton, type KPIItem } from '@/components/Theme';
import { downloadCsv, csvEur, csvDate } from './exportCsv';

// ─── Design tokens, shared source of truth (components/Theme) ────────────────
const labelStyle = { fontSize:'9px', letterSpacing:'0.16em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, fontWeight:500 };

// ─── HTML escaping for values interpolated into document.write() templates ────
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] as string));

// ─── Types ────────────────────────────────────────────────────────────────────
interface Tenant {
  id:string; property_id:string; user_id:string;
  full_name:string; email:string|null; phone:string|null; phone_work:string|null;
  nationality:string|null; profession:string|null; employer:string|null;
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
interface CommLog { id:string; tenant_id:string; type:'call'|'email'|'sms'|'meeting'|'note'; summary:string; date:string; outcome:string|null; }
interface TabTenantProps { propertyId:string; userId:string; }

const MONTHS_GR = ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'];

// ─── Micro components ─────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return <div style={labelStyle}>{children}</div>;
}

function SectionTitle({ children, dot='var(--accent)' }: { children: React.ReactNode; dot?: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:dot, flexShrink:0 }}/>
      <span style={{ fontSize:'10px', letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, fontWeight:700 }}>{children}</span>
    </div>
  );
}

function KpiCard({ label, value, color='var(--text-primary)', sub }: { label:string; value:string; color?:string; sub?:string }) {
  return (
    <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'16px 14px', display:'flex', flexDirection:'column', gap:4 }}>
      <div style={{ fontSize:'18px', fontWeight:700, color, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.5px', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:'10px', color:'var(--positive)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{sub}</div>}
      <div style={{ fontSize:'9px', letterSpacing:'0.12em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{label}</div>
    </div>
  );
}

function StatusBadge({ label, color, bg }: { label:string; color:string; bg:string }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 10px', borderRadius:T.radius.badge, fontSize:'10px', letterSpacing:'0.08em', textTransform:'uppercase' as const, color, background:bg, border:`1px solid ${color}33`, fontFamily:T.font.sans, fontWeight:600 }}>
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
  const color = level==='critical' ? 'var(--negative)' : level==='warning' ? 'var(--warning)' : 'var(--info)';
  const bg    = level==='critical' ? 'var(--negative-dim)' : level==='warning' ? 'var(--warning-dim)' : 'var(--info-dim)';
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
  const color=score>=85?'var(--positive)':score>=70?'var(--info)':score>=50?'var(--warning)':'var(--negative)';
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
  const totalTenant=(tenant.monthly_rent||0)+(tenant.cleaning?.total_tenant||0)
    +streaming.filter(sv=>sv.included).reduce((a,sv)=>a+sv.charged_tenant,0)
    +(tenant.parking_extra?(tenant.parking_extra_price||0):0);
  const ownerCosts=(tenant.cleaning?.total_owner||0)+streaming.filter(sv=>sv.included).reduce((a,sv)=>a+sv.cost_owner,0);
  const paidPay=payments.filter(p=>p.paid);
  const unpaidAmt=payments.filter(p=>!p.paid).reduce((a,p)=>a+p.amount,0);
  const late=paidPay.filter(p=>(p.days_late||0)>0);
  const avgLate=late.length?late.reduce((a,p)=>a+(p.days_late||0),0)/late.length:0;
  const annualRent=(tenant.monthly_rent||0)*12;
  const streamOwnerCost=streaming.filter(sv=>sv.included).reduce((a,sv)=>a+sv.cost_owner,0)*12;
  const cleanOwnerCost=(tenant.cleaning?.total_owner||0)*12;
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
        <KpiCard label="Σύνολο Μηνιαίως" value={fmt(totalTenant)} color="var(--positive)"/>
        <KpiCard label="Κόστη Ιδιοκτήτη" value={fmt(ownerCosts)} color="var(--text-primary)"/>
        <KpiCard label="Λήξη Μίσθωσης" value={d==null?'—':d<0?'Έληξε':`${d} ημέρες`} color={st?.color||'var(--text-primary)'}/>
        <KpiCard label="Εκκρεμή Ποσά" value={fmt(unpaidAmt)} color={unpaidAmt>0?'var(--negative)':'var(--positive)'}/>
        <KpiCard label="Εγγύηση" value={fmt(tenant.deposit_amount)} color={tenant.deposit_returned?'var(--positive)':'var(--accent)'}/>
      </div>

      {/* Score + Profile */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:16, marginBottom:16 }}>
        {/* Tenant Score */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Tenant Score</SectionTitle>
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
                <span style={{ fontSize:12, color:ok?'var(--positive)':'var(--text-tertiary)', fontWeight:ok?700:400 }}>{ok?'✓':'—'}</span>
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
            <KpiCard label="Πληρωμές" value={`${paidPay.length}/${payments.length}`} color="var(--positive)"/>
            <KpiCard label="Ποσοστό Εξόφλησης" value={`${((paidPay.length/payments.length)*100).toFixed(0)}%`} color="var(--text-primary)"/>
            <KpiCard label="Μέση Καθυστέρηση" value={avgLate>0?`${avgLate.toFixed(0)} ημέρες`:'Χωρίς'} color={avgLate>7?'var(--warning)':'var(--positive)'}/>
            <KpiCard label="Εισπραχθέντα Σύνολο" value={fmt(totalReceived)} color="var(--text-primary)"/>
          </div>
        )}
      </div>

      {/* Financial Analysis */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Οικονομική Ανάλυση Ενοικιαστή</SectionTitle>
        <DataRow label="Ακαθάριστα Ενοίκια ανά Έτος" value={<span style={{ color:'var(--positive)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(annualRent)}</span>}/>
        <DataRow label="Κόστη Ιδιοκτήτη ανά Έτος" value={<span style={{ color:'var(--negative)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>-{fmt(totalCosts)}</span>}/>
        <DataRow label="Καθαρό Εισόδημα ανά Έτος" value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:15 }}>{fmt(netIncome)}</span>}/>
        <DataRow label="Εισπραχθέντα Σύνολο" value={<span style={{ color:'var(--positive)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(totalReceived)}</span>}/>
        <DataRow label="Εκκρεμή Σύνολο" value={<span style={{ color:unpaidAmt>0?'var(--negative)':'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(unpaidAmt)}</span>}/>
      </div>
    </div>
  );
}

// ─── Αναπροσαρμογή Ενοικίου (ΤΔΕ) ────────────────────────────────────────────
function RentAdjustView({ tenant }:{ tenant:Tenant }) {
  const TDE:Record<number,number>={2015:0.0,2016:0.0,2017:1.1,2018:0.8,2019:0.5,2020:-1.3,2021:0.6,2022:9.3,2023:4.2,2024:2.8};
  const fmtE=(n:number)=>`${n.toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
  const fmtDate=(d:string|null)=>d?new Date(d+'T00:00:00').toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'}):'—';
  const rent=tenant.monthly_rent||0;
  const daysExp=tenant.lease_end?Math.ceil((new Date(tenant.lease_end+'T00:00:00').getTime()-Date.now())/86400000):null;
  const [yr,setYr]=useState(String(new Date().getFullYear()));
  const [useCustom,setUseCustom]=useState(false);
  const [customPct,setCustomPct]=useState('');
  const tde=TDE[parseInt(yr)]??2.8;
  const pct=useCustom?(parseFloat(customPct)||0):tde;
  const newRent=rent*(1+pct/100);
  const diff=newRent-rent;
  const isExpired=daysExp!==null&&daysExp<0;
  const isExpiring=daysExp!==null&&daysExp>=0&&daysExp<=60;

  const selectStyle:React.CSSProperties={width:'100%',height:42,background:'var(--bg-elevated)',border:'1px solid var(--border-default)',borderRadius:T.radius.inner,padding:'0 14px',color:'var(--text-primary)',fontSize:13,fontFamily:T.font.sans,outline:'none',cursor:'pointer'};

  const genLetter=()=>{
    const today_str=new Date().toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'});
    const w=window.open('','_blank','width=820,height=760');
    if(!w){alert('Επίτρεψε τα popups');return;}
    w.document.write(`<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8"><title>Αναπροσαρμογή Μισθώματος</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Inter',sans-serif;max-width:740px;margin:48px auto;padding:40px;color:#1c1c1e;font-size:13px;line-height:1.8}
      .header{border-bottom:2px solid #1a73e8;padding-bottom:16px;margin-bottom:28px}
      h1{font-size:22px;font-weight:500;color:#1a73e8;margin-bottom:4px}
      .sub{font-size:11px;color:#5f6368}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      th,td{padding:12px 16px;border:1px solid #e8eaed;font-size:13px}
      th{background:#f8f9fa;font-weight:500;text-align:left}
      .highlight{background:#e6f4ea;font-weight:700;color:#137333}
      .signatures{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:72px}
      .sig{border-top:1px solid #dadce0;padding-top:10px;font-size:11px;color:#5f6368}
      .footer{margin-top:40px;font-size:10px;color:#9aa0a6;text-align:center;border-top:1px solid #f0f0f0;padding-top:12px}
      @media print{body{margin:20px;padding:24px}}
    </style></head><body>
    <div class="header"><h1>Ειδοποίηση Αναπροσαρμογής Μισθώματος</h1>
    <div class="sub">Βάσει Τιμαρίθμου Δαπανών Εκπαίδευσης (ΤΔΕ) ${esc(yr)}, Property OS</div></div>
    <p style="margin-bottom:8px"><strong>Ημερομηνία:</strong> ${esc(today_str)}</p>
    <p style="margin-bottom:20px">Προς: <strong>${esc(tenant.full_name)}</strong>${tenant.afm?'&nbsp;&nbsp;|&nbsp;&nbsp;ΑΦΜ: <strong>'+esc(tenant.afm)+'</strong>':''}</p>
    <p style="margin-bottom:16px;line-height:1.7">Σας γνωστοποιούμε ότι, βάσει του Τιμαρίθμου Δαπανών Εκπαίδευσης (ΤΔΕ) έτους <strong>${esc(yr)}</strong>, όπως ανακοινώθηκε από την ΕΛΣΤΑΤ, το μηνιαίο μίσθωμα αναπροσαρμόζεται ως εξής:</p>
    <table>
      <tr><th>Στοιχείο</th><th>Αξία</th></tr>
      <tr><td>Τρέχον Μηνιαίο Μίσθωμα</td><td>${esc(fmtE(rent))}</td></tr>
      <tr><td>ΤΔΕ ${esc(yr)} (ΕΛΣΤΑΤ)</td><td>+${esc(pct.toFixed(1))}%</td></tr>
      <tr><td>Αύξηση Μισθώματος</td><td>+${esc(fmtE(diff))}</td></tr>
      <tr class="highlight"><td><strong>Νέο Μηνιαίο Μίσθωμα</strong></td><td><strong>${esc(fmtE(newRent))}</strong></td></tr>
    </table>
    <p style="font-size:12px;color:#5f6368;margin-top:16px">Η αναπροσαρμογή ισχύει από την επόμενη μισθωτική περίοδο μετά την κοινοποίηση της παρούσας ειδοποίησης.</p>
    <div class="signatures">
      <div class="sig"><p style="font-weight:500;margin-bottom:4px">Ο Εκμισθωτής</p><p style="height:40px"></p><p>Υπογραφή / Σφραγίδα</p></div>
      <div class="sig"><p style="font-weight:500;margin-bottom:4px">Ο Μισθωτής</p><p style="margin-bottom:2px">${esc(tenant.full_name)}</p>${tenant.afm?'<p>ΑΦΜ: '+esc(tenant.afm)+'</p>':''}</div>
    </div>
    <div class="footer">Έγγραφο δημιουργήθηκε μέσω Property OS, Για νομικές υποθέσεις συμβουλευτείτε δικηγόρο</div>
    </body></html>`);
    w.document.close();setTimeout(()=>w.print(),800);
  };

  return (
    <div>
      {/* Εξήγηση ΤΔΕ */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Τι είναι ο Τιμάριθμος Δαπανών Εκπαίδευσης (ΤΔΕ)</SectionTitle>
        <p style={{ fontSize:13, color:'var(--text-secondary)', lineHeight:1.8, fontFamily:T.font.sans, marginBottom:14 }}>
          Ο <strong style={{ color:'var(--text-primary)' }}>Τιμάριθμος Δαπανών Εκπαίδευσης (ΤΔΕ)</strong> είναι ο επίσημος δείκτης που χρησιμοποιεί η ΕΛΣΤΑΤ για να μετρήσει τη μεταβολή του κόστους ζωής σε ετήσια βάση. Βάσει του Αστικού Κώδικα (άρθρο 288 ΑΚ), ο εκμισθωτής έχει δικαίωμα να αναπροσαρμόσει το μίσθωμα μία φορά τον χρόνο, εφόσον αυτό προβλέπεται στη σύμβαση.
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
                <option key={y} value={y}>{y}, ΤΔΕ: {TDE[parseInt(y)]>=0?'+':''}{TDE[parseInt(y)].toFixed(1)}%</option>
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
              <input type="number" value={customPct} onChange={e=>setCustomPct(e.target.value)} placeholder="για παράδειγμα 3.5" step="0.1"
                style={{ ...selectStyle, border:'1px solid var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontSize:16 }}/>
            </div>
          )}

          {/* TDE History Grid */}
          <div style={{ ...labelStyle, marginBottom:10 }}>Ιστορικό ΤΔΕ (ΕΛΣΤΑΤ)</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 105px), 1fr))', gap:5 }}>
            {Object.entries(TDE).sort(([a],[b])=>parseInt(b)-parseInt(a)).map(([year,rate])=>{
              const active=parseInt(year)===parseInt(yr);
              return (
                <div key={year} onClick={()=>{setYr(year);setUseCustom(false);}}
                  style={{ background:active?'var(--accent-dim)':'var(--bg-elevated)', border:`1px solid ${active?'var(--accent)':'var(--border-subtle)'}`, borderRadius:T.radius.badge, padding:'7px 4px', textAlign:'center' as const, cursor:'pointer', transition:'all 0.15s' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:active?'var(--accent)':rate>=0?'var(--positive)':'var(--negative)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{rate>=0?'+':''}{rate.toFixed(1)}%</div>
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
                <div style={{ background:'var(--positive-dim)', border:'1px solid var(--positive)', borderRadius:T.radius.inner, padding:'18px 16px' }}>
                  <div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:6 }}>Νέο Μίσθωμα</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'var(--positive)', fontFamily:T.font.num, fontVariantNumeric:'tabular-nums' }}>{fmtE(newRent)}</div>
                </div>
              </div>

              {/* Breakdown */}
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:18, marginBottom:14 }}>
                {[{label:`Τιμάριθμος ${yr}`,value:`+${pct.toFixed(1)}%`,color:'var(--info)'},
                  {label:'Αύξηση ανά Μήνα',value:`+${fmtE(diff)}`,color:'var(--positive)'},
                  {label:'Αύξηση ανά Έτος',value:`+${fmtE(diff*12)}`,color:'var(--positive)'}
                ].map((row,i)=>(
                  <DataRow key={i} label={row.label} value={<span style={{ color:row.color, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{row.value}</span>}/>
                ))}
              </div>

              {/* Print Button */}
              <button onClick={genLetter} style={{ width:'100%', height:46, borderRadius:T.radius.pill, border:'none', background:'var(--accent)', color:'var(--accent-text)', cursor:'pointer', fontSize:13, fontFamily:T.font.sans, fontWeight:600, letterSpacing:'0.04em', marginBottom:12 }}>
                Εκτύπωση Ειδοποίησης Αναπροσαρμογής
              </button>
            </>
          )}

          {/* Legal Links */}
          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:18 }}>
            <SectionTitle>Υποχρεώσεις και Σύνδεσμοι</SectionTitle>
            {[
              {label:'Καταχώρηση Μισθωτηρίου στην ΑΑΑΔΕ',desc:'Εντός 30 ημερών από υπογραφή',url:'https://www.aade.gr/polites/foroi/misthotiria',urgent:true},
              {label:'Ε2, Δήλωση Εισοδήματος Ακινήτων',desc:'Έως 30 Ιουνίου κάθε έτους',url:'https://www.aade.gr',urgent:false},
              {label:'Πρότυπο Σύμβασης Μίσθωσης',desc:'Επίσημο πρότυπο ΑΑΑΔΕ',url:'https://www.aade.gr/polites/foroi/misthotiria',urgent:false},
            ].map((link,i)=>(
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', marginBottom:8, background:link.urgent?'var(--negative-dim)':'var(--bg-elevated)', border:`1px solid ${link.urgent?'var(--negative)44':'var(--border-subtle)'}`, borderLeft:`3px solid ${link.urgent?'var(--negative)':'var(--border-subtle)'}`, borderRadius:T.radius.inner, textDecoration:'none' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:link.urgent?'var(--negative)':'var(--text-primary)', fontFamily:T.font.sans, marginBottom:2 }}>{link.label}</div>
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
  const TYPE_LABELS:Record<string,string>={call:'Τηλεφωνική Κλήση',email:'Ηλεκτρονικό Ταχυδρομείο',sms:'Γραπτό Μήνυμα',meeting:'Συνάντηση',note:'Σημείωση'};
  const TYPE_SHORT:Record<string,string>={call:'Κλήση',email:'Email',sms:'SMS',meeting:'Συνάντηση',note:'Σημείωση'};

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
  const inputStyle:React.CSSProperties={width:'100%',height:40,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.inner,padding:'0 14px',color:'var(--text-primary)',fontSize:13,fontFamily:T.font.sans,outline:'none',boxSizing:'border-box'};

  return (
    <div>
      {/* Quick Actions */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Γρήγορη Επικοινωνία</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:10, marginBottom:14 }}>
          {tenant.phone&&(
            <a href={`tel:${tenant.phone}`} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)', transition:'border-color 0.15s' }}>
              <div style={{ width:36, height:36, borderRadius:18, background:'var(--positive-dim)', border:'1px solid var(--positive)33', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans, color:'var(--text-primary)' }}>Κλήση</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{tenant.phone}</div></div>
            </a>
          )}
          {tenant.email&&(
            <a href={`mailto:${tenant.email}`} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)' }}>
              <div style={{ width:36, height:36, borderRadius:18, background:'var(--info-dim)', border:'1px solid var(--info)33', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans }}>Email</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const, maxWidth:120 }}>{tenant.email}</div></div>
            </a>
          )}
          {tenant.phone&&(
            <a href={`sms:${tenant.phone}`} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)' }}>
              <div style={{ width:36, height:36, borderRadius:18, background:'var(--accent-dim)', border:'1px solid var(--accent)33', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans }}>Γραπτό Μήνυμα</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{tenant.phone}</div></div>
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
                <input type="text" value={form.outcome} onChange={e=>setForm(f=>({...f,outcome:e.target.value}))} placeholder="για παράδειγμα Θετικό, αρνητικό..." style={inputStyle}/>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ ...labelStyle, marginBottom:8 }}>Σύνοψη Επικοινωνίας *</div>
              <textarea value={form.summary} onChange={e=>setForm(f=>({...f,summary:e.target.value}))} placeholder="Περιγραφή επικοινωνίας..." rows={3}
                style={{ width:'100%', background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:T.radius.inner, padding:'12px 14px', color:'var(--text-primary)', fontSize:13, fontFamily:T.font.sans, outline:'none', boxSizing:'border-box' as const, resize:'vertical' as const, lineHeight:1.6 }}/>
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

// ─── Market View ──────────────────────────────────────────────────────────────
function MarketView({ tenant, propertyId, userId }:{ tenant:Tenant; propertyId:string; userId:string }) {
  const supabase=createClient();
  const [comparables,setComparables]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({address:'',rent:'',sqm:'',source:'Spitogatos',link:''});
  const [adding,setAdding]=useState(false);

  const load=useCallback(async()=>{
    const{data}=await supabase.from('rent_comparables').select('*').eq('property_id',propertyId).order('created_at',{ascending:false});
    setComparables(data||[]);setLoading(false);
  },[propertyId]);
  useEffect(()=>{load();},[load]);

  const addComp=async()=>{
    if(!form.address||!form.rent)return;setAdding(true);
    await supabase.from('rent_comparables').insert({property_id:propertyId,user_id:userId,address:form.address,rent:parseFloat(form.rent)||0,sqm:form.sqm?parseFloat(form.sqm):null,source:form.source,link:form.link||null});
    setAdding(false);setShowAdd(false);setForm({address:'',rent:'',sqm:'',source:'Spitogatos',link:''});load();
  };

  const rent=tenant.monthly_rent||0;
  const avgMarket=comparables.length?comparables.reduce((a,c)=>a+c.rent,0)/comparables.length:0;
  const rentDiff=avgMarket>0?rent-avgMarket:0;
  const rentDiffPct=avgMarket>0?(rentDiff/avgMarket)*100:0;
  const inputStyle:React.CSSProperties={width:'100%',height:40,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:T.radius.inner,padding:'0 14px',color:'var(--text-primary)',fontSize:13,fontFamily:T.font.sans,outline:'none',boxSizing:'border-box'};

  return (
    <div>
      {comparables.length>0&&(
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:12, marginBottom:16 }}>
          <KpiCard label="Τρέχον Ενοίκιο" value={fmt(rent)} color="var(--text-primary)"/>
          <KpiCard label="Μέσος Όρος Αγοράς" value={`${Math.round(avgMarket).toLocaleString('el-GR')} €`} color="var(--text-primary)"/>
          <KpiCard label={rentDiff>0?'Πάνω από Αγορά':'Κάτω από Αγορά'} value={`${rentDiff>0?'+':''}${Math.round(rentDiff).toLocaleString('el-GR')} € (${rentDiffPct.toFixed(1)}%)`} color={rentDiff>0?'var(--positive)':rentDiff<0?'var(--warning)':'var(--text-secondary)'}/>
        </div>
      )}

      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <SectionTitle>Συγκρίσιμα Ενοίκια Αγοράς</SectionTitle>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <a href="https://www.spitogatos.gr" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:'var(--accent)', fontFamily:T.font.sans, fontWeight:600, textDecoration:'none' }}>Spitogatos →</a>
            <a href="https://www.xe.gr" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:'var(--accent)', fontFamily:T.font.sans, fontWeight:600, textDecoration:'none' }}>XE.gr →</a>
            <button style={s.btnSm} onClick={()=>setShowAdd(v=>!v)}>+ Προσθήκη</button>
          </div>
        </div>

        {showAdd&&(
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20, marginBottom:20 }}>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:12, marginBottom:12 }}>
              {[['Διεύθυνση','address','για παράδειγμα Ερμού 12, Αθήνα','text'],['Ενοίκιο (€)','rent','750','number'],['Εμβαδόν (τετραγωνικά μέτρα)','sqm','50','number']].map(([lbl,key,ph,type])=>(
                <div key={key as string}>
                  <div style={{ ...labelStyle, marginBottom:8 }}>{lbl as string}</div>
                  <input type={type as string} value={(form as any)[key as string]} onChange={e=>setForm(f=>({...f,[key as string]:e.target.value}))} placeholder={ph as string} style={inputStyle}/>
                </div>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:12, marginBottom:14 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom:8 }}>Πηγή</div>
                <select value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))} style={inputStyle}>
                  {['Spitogatos','XE.gr','Airbnb','Ιδιώτης','Μεσίτης','Άλλο'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom:8 }}>Σύνδεσμος Αγγελίας</div>
                <input type="url" value={form.link} onChange={e=>setForm(f=>({...f,link:e.target.value}))} placeholder="https://..." style={inputStyle}/>
              </div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button style={s.btnGhost} onClick={()=>setShowAdd(false)}>Ακύρωση</button>
              <button style={s.btnGold} onClick={addComp} disabled={adding}>{adding?'Αποθήκευση...':'Προσθήκη'}</button>
            </div>
          </div>
        )}

        {loading&&<Spinner label="Φόρτωση…" />}
        {!loading&&comparables.length===0&&(
          <div style={{ textAlign:'center', padding:48 }}>
            <div style={{ fontSize:36, marginBottom:14, opacity:0.15 }}>◫</div>
            <div style={{ fontSize:14, color:'var(--text-secondary)', fontFamily:T.font.sans, fontWeight:500, marginBottom:6 }}>Δεν υπάρχουν συγκρίσιμα ενοίκια</div>
            <div style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>Πρόσθεσε ενοίκια από Spitogatos ή XE.gr για να συγκρίνεις</div>
          </div>
        )}
        {!loading&&comparables.length>0&&(
          <div className="table-wrap">
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>{['Διεύθυνση','Εμβαδόν','Ενοίκιο','Τιμή ανά τετραγωνικό','Πηγή','Διαφορά',''].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {comparables.map((c:any)=>{
                const perSqm=c.sqm&&c.sqm>0?c.rent/c.sqm:null;
                const diff=c.rent-rent;
                return (
                  <tr key={c.id}>
                    <td style={s.td}>{c.address}</td>
                    <td style={s.tdM}>{c.sqm?`${c.sqm} τετραγωνικά μέτρα`:'—'}</td>
                    <td style={{ ...s.td, fontWeight:700, color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{c.rent.toLocaleString('el-GR')} €</td>
                    <td style={s.tdM}>{perSqm?`${perSqm.toFixed(0)} € ανά τετραγωνικό`:'—'}</td>
                    <td style={s.tdM}>{c.link?<a href={c.link} target="_blank" rel="noopener noreferrer" style={{ color:'var(--accent)', textDecoration:'none' }}>{c.source} →</a>:c.source}</td>
                    <td style={{ ...s.td, textAlign:'right' as const }}>
                      <span style={{ fontSize:12, fontWeight:700, color:diff>0?'var(--negative)':diff<0?'var(--positive)':'var(--text-secondary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>
                        {diff>0?'+':''}{Math.round(diff).toLocaleString('el-GR')} €
                      </span>
                    </td>
                    <td style={s.td}><button style={s.btnDng} onClick={async()=>{if(!confirm('Διαγραφή;'))return;await supabase.from('rent_comparables').delete().eq('id',c.id);load();}}>Διαγραφή</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Blank form ────────────────────────────────────────────────────────────────
const blank=()=>({
  full_name:'',email:'',phone:'',phone_work:'',nationality:'',profession:'',employer:'',afm:'',
  id_doc_type:'' as IdDocType|'',id_doc_number:'',iban:'',notes:'',
  lease_type:'annual' as LeaseType,lease_start:'',lease_end:'',custom_lease_days:365,
  monthly_rent:'',payment_frequency:'monthly' as PaymentFreq,
  deposit_amount:'',deposit_invested:false,deposit_returned:false,deposit_return_date:'',
  deposit_invest_rate:'',deposit_invest_type:'',deposit_invest_term:'',
  all_inclusive:false,kwh_limit:'',kwh_price:'',electricity_provider:'',electricity_tariff:'',electricity_monthly_limit:'',
  water_monthly_limit:'',internet_provider:'',internet_plan:'',internet_cost:'',
  e_payment:true,streaming:null as StreamingSvc[]|null,cleaning:null as CleaningCfg|null,extra_perks:'',
  welcome_basket:false,welcome_basket_amount:'',welcome_basket_contents:'',
  parking_included:false,parking_extra:false,parking_extra_price:'',parking_type:'',parking_has_electricity:false,parking_notes:'',
  ac_service_by:'owner' as ServiceBy,ac_service_frequency:'annual',
  solar_service_by:'owner' as ServiceBy,solar_service_frequency:'annual',
  heat_pump_service_by:'owner' as ServiceBy,heat_pump_service_frequency:'annual',
  solar_panels_service_by:'owner' as ServiceBy,solar_panels_service_frequency:'annual',
  pest_control_by:'owner' as ServiceBy,pest_control_frequency:'',annual_services_notes:'',
  prepay_option:false,prepay_months:3,prepay_discount_pct:'',
  prepay_invested:false,prepay_invest_rate:'',prepay_invest_type:'',prepay_invest_term:'',
  lease_doc_external_url:'',
});

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function TabTenant({ propertyId, userId }:TabTenantProps) {
  const supabase=createClient();
  const [tenant,setTenant]=useState<Tenant|null>(null);
  const [payments,setPayments]=useState<RentPayment[]>([]);
  const [extras,setExtras]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [isForm,setIsForm]=useState(false);
  const [editMode,setEditMode]=useState(false);
  const [formTab,setFormTab]=useState<'profile'|'lease'|'services'|'parking'|'docs'>('profile');
  const [viewTab,setViewTab]=useState<'dashboard'|'profile'|'lease'|'services'|'rentadjust'|'payments'|'extras'|'comm'|'market'|'docs'>('dashboard');
  const [addPay,setAddPay]=useState(false);
  const [addExtra,setAddExtra]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [ok,setOk]=useState<string|null>(null);
  const [form,setForm]=useState(blank());
  const [payF,setPayF]=useState({period_month:new Date().getMonth()+1,period_year:new Date().getFullYear(),amount:'',paid:true,paid_date:new Date().toISOString().split('T')[0],days_late:'',notes:''});
  const [exF,setExF]=useState({description:'',amount:'',category:'Άλλο',date:new Date().toISOString().split('T')[0],paid:false,notes:''});
  const sf=(k:string,v:any)=>setForm(f=>({...f,[k]:v}));

  useEffect(()=>{
    if(form.lease_start&&form.lease_type&&form.lease_type!=='custom')
      sf('lease_end',calcEnd(form.lease_start,form.lease_type as LeaseType,form.custom_lease_days));
  },[form.lease_start,form.lease_type]);

  const fetch_=useCallback(async()=>{
    setLoading(true);
    const{data:td}=await supabase.from('tenants').select('*').eq('property_id',propertyId).eq('user_id',userId).order('updated_at',{ascending:false}).limit(1);
    const t=td?.[0]||null; setTenant(t);
    if(t){
      const[{data:pd},{data:ed}]=await Promise.all([
        supabase.from('rent_payments').select('*').eq('property_id',propertyId).eq('user_id',userId).order('period_year',{ascending:false}).order('period_month',{ascending:false}),
        supabase.from('expenses').select('*').eq('property_id',propertyId).eq('user_id',userId).eq('category','tenant_extra').order('updated_at',{ascending:false}),
      ]);
      setPayments(pd||[]); setExtras(ed||[]);
    }
    setLoading(false);
  },[propertyId,userId]);

  useEffect(()=>{fetch_();},[fetch_]);
  const notify=(msg:string)=>{setOk(msg);setTimeout(()=>setOk(null),3000);};

  const openAdd=()=>{setForm(blank());setEditMode(false);setIsForm(true);setFormTab('profile');};
  const openEdit=()=>{
    if(!tenant)return;
    const n=(v:number|null)=>v?.toString()||'';
    setForm({
      full_name:tenant.full_name||'',email:tenant.email||'',phone:tenant.phone||'',phone_work:tenant.phone_work||'',
      nationality:tenant.nationality||'',profession:tenant.profession||'',employer:tenant.employer||'',afm:tenant.afm||'',
      id_doc_type:(tenant.id_doc_type as IdDocType)||'',id_doc_number:tenant.id_doc_number||'',iban:tenant.iban||'',notes:tenant.notes||'',
      lease_type:tenant.lease_type||'annual',lease_start:tenant.lease_start?.split('T')[0]||'',lease_end:tenant.lease_end?.split('T')[0]||'',custom_lease_days:tenant.custom_lease_days||365,
      monthly_rent:n(tenant.monthly_rent),payment_frequency:tenant.payment_frequency||'monthly',
      deposit_amount:n(tenant.deposit_amount),deposit_invested:tenant.deposit_invested||false,deposit_returned:tenant.deposit_returned||false,deposit_return_date:tenant.deposit_return_date?.split('T')[0]||'',
      deposit_invest_rate:n(tenant.deposit_invest_rate),deposit_invest_type:tenant.deposit_invest_type||'',deposit_invest_term:tenant.deposit_invest_term||'',
      all_inclusive:tenant.all_inclusive||false,kwh_limit:n(tenant.kwh_limit),kwh_price:n(tenant.kwh_price),
      electricity_provider:tenant.electricity_provider||'',electricity_tariff:tenant.electricity_tariff||'',electricity_monthly_limit:n(tenant.electricity_monthly_limit),
      water_monthly_limit:n(tenant.water_monthly_limit),internet_provider:tenant.internet_provider||'',internet_plan:tenant.internet_plan||'',internet_cost:n(tenant.internet_cost),
      e_payment:tenant.e_payment??true,streaming:tenant.streaming||null,cleaning:tenant.cleaning||null,extra_perks:tenant.extra_perks||'',
      welcome_basket:tenant.welcome_basket||false,welcome_basket_amount:n(tenant.welcome_basket_amount),welcome_basket_contents:tenant.welcome_basket_contents||'',
      parking_included:tenant.parking_included||false,parking_extra:tenant.parking_extra||false,parking_extra_price:n(tenant.parking_extra_price),
      parking_type:tenant.parking_type||'',parking_has_electricity:tenant.parking_has_electricity||false,parking_notes:tenant.parking_notes||'',
      ac_service_by:tenant.ac_service_by||'owner',ac_service_frequency:tenant.ac_service_frequency||'annual',
      solar_service_by:tenant.solar_service_by||'owner',solar_service_frequency:tenant.solar_service_frequency||'annual',
      heat_pump_service_by:tenant.heat_pump_service_by||'owner',heat_pump_service_frequency:tenant.heat_pump_service_frequency||'annual',
      solar_panels_service_by:tenant.solar_panels_service_by||'owner',solar_panels_service_frequency:tenant.solar_panels_service_frequency||'annual',
      pest_control_by:tenant.pest_control_by||'owner',pest_control_frequency:tenant.pest_control_frequency||'',annual_services_notes:tenant.annual_services_notes||'',
      prepay_option:tenant.prepay_option||false,prepay_months:tenant.prepay_months||3,prepay_discount_pct:n(tenant.prepay_discount_pct),
      prepay_invested:tenant.prepay_invested||false,prepay_invest_rate:n(tenant.prepay_invest_rate),prepay_invest_type:tenant.prepay_invest_type||'',prepay_invest_term:tenant.prepay_invest_term||'',
      lease_doc_external_url:tenant.lease_doc_external_url||'',
    });
    setEditMode(true);setIsForm(true);setFormTab('profile');
  };

  const save=async()=>{
    if(!form.full_name.trim()){setError('Το ονοματεπώνυμο είναι υποχρεωτικό');return;}
    setSaving(true);setError(null);
    const n=(v:string)=>v?Math.max(0,parseFloat(v)):null;
    const payload={
      property_id:propertyId,user_id:userId,full_name:form.full_name.trim(),
      email:form.email||null,phone:form.phone||null,phone_work:form.phone_work||null,
      nationality:form.nationality||null,profession:form.profession||null,employer:form.employer||null,afm:form.afm||null,
      id_doc_type:form.id_doc_type||null,id_doc_number:form.id_doc_number||null,iban:form.iban||null,notes:form.notes||null,
      lease_type:form.lease_type||null,lease_start:form.lease_start||null,lease_end:form.lease_end||null,custom_lease_days:form.custom_lease_days||null,
      monthly_rent:n(form.monthly_rent),payment_frequency:form.payment_frequency||null,
      deposit_amount:n(form.deposit_amount),deposit_invested:form.deposit_invested,deposit_returned:form.deposit_returned,deposit_return_date:form.deposit_return_date||null,
      deposit_invest_rate:n(form.deposit_invest_rate),deposit_invest_type:form.deposit_invest_type||null,deposit_invest_term:form.deposit_invest_term||null,
      all_inclusive:form.all_inclusive,kwh_limit:n(form.kwh_limit),kwh_price:n(form.kwh_price),
      electricity_provider:form.electricity_provider||null,electricity_tariff:form.electricity_tariff||null,electricity_monthly_limit:n(form.electricity_monthly_limit),
      water_monthly_limit:n(form.water_monthly_limit),internet_provider:form.internet_provider||null,internet_plan:form.internet_plan||null,internet_cost:n(form.internet_cost),
      e_payment:form.e_payment,streaming:form.streaming,cleaning:form.cleaning,extra_perks:form.extra_perks||null,
      welcome_basket:form.welcome_basket,welcome_basket_amount:n(form.welcome_basket_amount),welcome_basket_contents:form.welcome_basket_contents||null,
      parking_included:form.parking_included,parking_extra:form.parking_extra,parking_extra_price:n(form.parking_extra_price),
      parking_type:form.parking_type||null,parking_has_electricity:form.parking_has_electricity,parking_notes:form.parking_notes||null,
      ac_service_by:form.ac_service_by||null,ac_service_frequency:form.ac_service_frequency||null,
      solar_service_by:form.solar_service_by||null,solar_service_frequency:form.solar_service_frequency||null,
      heat_pump_service_by:form.heat_pump_service_by||null,heat_pump_service_frequency:form.heat_pump_service_frequency||null,
      solar_panels_service_by:form.solar_panels_service_by||null,solar_panels_service_frequency:form.solar_panels_service_frequency||null,
      pest_control_by:form.pest_control_by||null,pest_control_frequency:form.pest_control_frequency||null,annual_services_notes:form.annual_services_notes||null,
      prepay_option:form.prepay_option,prepay_months:form.prepay_months||null,prepay_discount_pct:n(form.prepay_discount_pct),
      prepay_invested:form.prepay_invested,prepay_invest_rate:n(form.prepay_invest_rate),prepay_invest_type:form.prepay_invest_type||null,prepay_invest_term:form.prepay_invest_term||null,
      lease_doc_external_url:form.lease_doc_external_url||null,
    };
    const q=editMode&&tenant?supabase.from('tenants').update(payload).eq('id',tenant.id):supabase.from('tenants').insert(payload);
    const{error:err}=await q;
    if(err){setError(err.message);setSaving(false);return;}
    setSaving(false);setIsForm(false);setEditMode(false);
    notify(editMode?'Αποθηκεύτηκε':'Ενοικιαστής προστέθηκε');fetch_();
  };

  const uploadPDF=async(file:File)=>{
    if(!tenant)return;setUploading(true);
    const path=`${userId}/${tenant.id}/${file.name}`;
    const{error:upErr}=await supabase.storage.from('lease-documents').upload(path,file,{upsert:true});
    if(upErr){setError(upErr.message);setUploading(false);return;}
    // Ασφάλεια: ΔΕΝ αποθηκεύουμε μακρόβιο signed URL (θα ήταν bearer token 1 έτους).
    // Κρατάμε μόνο το όνομα· το URL προσπέλασης παράγεται on-demand, βραχύβιο, στο άνοιγμα.
    await supabase.from('tenants').update({lease_doc_name:file.name}).eq('id',tenant.id);
    setUploading(false);notify('PDF ανέβηκε');fetch_();
  };

  const savePay=async()=>{
    if(!tenant||!payF.amount){setError('Συμπλήρωσε ποσό');return;}setSaving(true);
    await supabase.from('rent_payments').insert({tenant_id:tenant.id,property_id:propertyId,user_id:userId,period_month:payF.period_month,period_year:payF.period_year,amount:Math.max(0,parseFloat(payF.amount)),paid:payF.paid,paid_date:payF.paid?payF.paid_date:null,days_late:payF.days_late?parseInt(payF.days_late):null,notes:payF.notes||null});
    setSaving(false);setAddPay(false);setPayF({period_month:new Date().getMonth()+1,period_year:new Date().getFullYear(),amount:'',paid:true,paid_date:new Date().toISOString().split('T')[0],days_late:'',notes:''});
    notify('Πληρωμή καταχωρήθηκε');fetch_();
  };

  const saveExtra=async()=>{
    if(!tenant||!exF.description||!exF.amount){setError('Συμπλήρωσε περιγραφή και ποσό');return;}setSaving(true);
    await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:exF.description,amount:Math.max(0,parseFloat(exF.amount)),category:'tenant_extra',date:exF.date,paid:exF.paid,notes:exF.notes||null});
    setSaving(false);setAddExtra(false);setExF({description:'',amount:'',category:'Άλλο',date:new Date().toISOString().split('T')[0],paid:false,notes:''});
    notify('Χρέωση καταχωρήθηκε');fetch_();
  };

  if(loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:400 }}>
      <Spinner label="Φόρτωση…" />
    </div>
  );

  const FTABS:[string,typeof formTab][]=[['Στοιχεία','profile'],['Μίσθωση','lease'],['Υπηρεσίες','services'],['Parking','parking'],['Έγγραφα','docs']];
  const VTABS:{id:typeof viewTab;label:string;badge?:number}[]=[
    {id:'dashboard',label:'Dashboard'},
    {id:'profile',label:'Προφίλ'},
    {id:'lease',label:'Μίσθωση'},
    {id:'services',label:'Υπηρεσίες'},
    {id:'rentadjust',label:'Αναπροσαρμογή Ενοικίου'},
    {id:'payments',label:'Πληρωμές',badge:payments.filter(p=>!p.paid).length||undefined},
    {id:'extras',label:'Έκτακτες Χρεώσεις',badge:extras.filter((e:any)=>!e.paid).length||undefined},
    {id:'comm',label:'Επικοινωνία'},
    {id:'market',label:'Αγορά'},
    {id:'docs',label:'Συμβόλαιο'},
  ];

  // ── Σύνοψη κορυφής (KPIs + ειδοποιήσεις), μόνο παρουσίαση, χωρίς νέα λογική ──
  const leaseDaysLeft = tenant ? daysLeft(tenant.lease_end) : null;
  const unpaidPayments = payments.filter(p=>!p.paid);
  const unpaidTotal = unpaidPayments.reduce((a,p)=>a+p.amount,0);
  const hasLeaseDoc = !!(tenant?.lease_doc_name || tenant?.lease_doc_url || tenant?.lease_doc_external_url);
  // Παράγει βραχύβιο (1 ώρα) signed URL μόνο τη στιγμή του ανοίγματος, κανένα
  // μακρόβιο bearer token δεν αποθηκεύεται στη βάση.
  const openLeaseDoc = async () => {
    if (!tenant?.lease_doc_name) return;
    const path = `${userId}/${tenant.id}/${tenant.lease_doc_name}`;
    const { data, error } = await supabase.storage.from('lease-documents').createSignedUrl(path, 60 * 60);
    if (error || !data?.signedUrl) { setError('Δεν ήταν δυνατό το άνοιγμα του PDF.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };
  const tenantKPIs:KPIItem[] = tenant ? [
    { label:'Μηνιαίο Ενοίκιο', value:fe(tenant.monthly_rent||0), tone:'accent' },
    { label:'Εγγύηση', value:fe(tenant.deposit_amount||0), tone: tenant.deposit_returned?'positive':'info', sub: tenant.deposit_returned?'Επεστράφη':undefined },
    { label:'Ημέρες ως τη Λήξη Σύμβασης', value: leaseDaysLeft==null?'—':leaseDaysLeft<0?'Έληξε':fn(leaseDaysLeft), tone: leaseDaysLeft==null?'neutral':leaseDaysLeft<0?'negative':leaseDaysLeft<60?'warning':'positive', sub: leaseDaysLeft!=null&&leaseDaysLeft>=0?'ημέρες':undefined },
    { label:'Κατάσταση Πληρωμής', value: unpaidPayments.length>0?'Εκκρεμεί':'Πληρωμένο', tone: unpaidPayments.length>0?'negative':'positive', sub: unpaidPayments.length>0?`${fn(unpaidPayments.length)} εκκρεμείς, ${fe(unpaidTotal)}`:undefined },
    { label:'Ημερομηνία Λήξης Μίσθωσης', value: tenant.lease_end?fd(tenant.lease_end):'—', tone:'neutral' },
  ] : [];

  return (
    <div style={{ fontFamily:T.font.sans, color:'var(--text-primary)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {ok&&<div style={{ background:'var(--positive-dim)', border:'1px solid var(--positive)44', borderLeft:'3px solid var(--positive)', borderRadius:T.radius.inner, padding:'11px 18px', marginBottom:14, color:'var(--positive)', fontSize:13, fontFamily:T.font.sans, fontWeight:500 }}>{ok}</div>}
      {error&&<div style={{ background:'var(--negative-dim)', border:'1px solid var(--negative)44', borderLeft:'3px solid var(--negative)', borderRadius:T.radius.inner, padding:'11px 18px', marginBottom:14, color:'var(--negative)', fontSize:13, fontFamily:T.font.sans, fontWeight:500, display:'flex', justifyContent:'space-between', alignItems:'center' }}><span>{error}</span><button onClick={()=>setError(null)} style={{ background:'none', border:'none', color:'var(--negative)', cursor:'pointer', fontSize:18, lineHeight:1, padding:0 }}>×</button></div>}

      {/* Empty State */}
      {!tenant&&!isForm&&(
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:'80px 32px', textAlign:'center' as const }}>
          <div style={{ fontSize:40, opacity:0.08, marginBottom:20 }}>◫</div>
          <div style={{ fontSize:16, color:'var(--text-primary)', fontFamily:T.font.sans, fontWeight:500, marginBottom:8 }}>Κανένας ενοικιαστής</div>
          <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:28, lineHeight:1.6 }}>Πρόσθεσε ενοικιαστή για πλήρη παρακολούθηση μίσθωσης,<br/>πληρωμών, επικοινωνίας και ανάλυσης αγοράς</div>
          <button style={{ ...s.btnGold, fontSize:13, padding:'12px 28px', borderRadius:T.radius.pill }} onClick={openAdd}>+ Νέος Ενοικιαστής</button>
        </div>
      )}

      {/* ── FORM ── */}
      {isForm&&(
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-accent)', borderRadius:T.radius.card, padding:28 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
            <div>
              <div style={{ fontSize:18, fontWeight:500, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:4 }}>{editMode?'Επεξεργασία Ενοικιαστή':'Νέος Ενοικιαστής'}</div>
              <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans }}>Συμπλήρωσε τα στοιχεία βήμα βήμα</div>
            </div>
            <button style={s.btnGhost} onClick={()=>{setIsForm(false);setEditMode(false);}}>Ακύρωση</button>
          </div>

          {/* Progress bar */}
          <div style={{ height:3, background:'var(--bg-overlay)', borderRadius:2, marginBottom:24, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${(FTABS.findIndex(([,t])=>t===formTab)+1)/FTABS.length*100}%`, background:'var(--accent)', borderRadius:2, transition:'width 0.3s ease' }}/>
          </div>

          <div style={{ display:'flex', borderBottom:'1px solid var(--border-subtle)', marginBottom:24, gap:0 }}>
            {FTABS.map(([l,t])=><button key={t} onClick={()=>setFormTab(t)} style={s.tabBtn(formTab===t)}>{l}</button>)}
          </div>

          {formTab==='profile'&&(
            <>
              <SectionTitle>Προσωπικά Στοιχεία</SectionTitle>
              <div style={{ ...s.g3, marginBottom:16 }}>
                <TextInput label="Ονοματεπώνυμο *" value={form.full_name} onChange={v=>sf('full_name',v)}/>
                <TextInput label="Ηλεκτρονικό Ταχυδρομείο" value={form.email} onChange={v=>sf('email',v)} type="email"/>
                <TextInput label="Κινητό Τηλέφωνο" value={form.phone} onChange={v=>sf('phone',v)}/>
              </div>
              <div style={{ ...s.g3, marginBottom:16 }}>
                <TextInput label="Τηλέφωνο Εργασίας" value={form.phone_work} onChange={v=>sf('phone_work',v)}/>
                <TextInput label="Εθνικότητα" value={form.nationality} onChange={v=>sf('nationality',v)} placeholder="για παράδειγμα Ελληνική"/>
                <TextInput label="Επάγγελμα" value={form.profession} onChange={v=>sf('profession',v)} placeholder="για παράδειγμα Μηχανικός"/>
              </div>
              <div style={{ ...s.g3, marginBottom:16 }}>
                <TextInput label="Εργοδότης" value={form.employer} onChange={v=>sf('employer',v)} placeholder="για παράδειγμα ΕΛΤΑ Α.Ε."/>
                <TextInput label="ΑΦΜ" value={form.afm} onChange={v=>sf('afm',v)}/>
                <TextInput label="IBAN" value={form.iban} onChange={v=>sf('iban',v)} placeholder="GR00 0000 0000 0000..."/>
              </div>
              <div style={{ ...s.g2, marginBottom:16 }}>
                <SelectField label="Τύπος Εγγράφου Ταυτοποίησης" value={form.id_doc_type} onChange={v=>sf('id_doc_type',v)} options={ID_DOCS.map(d=>({value:d,label:d}))} placeholder="Επιλογή..."/>
                <TextInput label="Αριθμός Εγγράφου" value={form.id_doc_number} onChange={v=>sf('id_doc_number',v)}/>
              </div>
              <div style={s.divider}/>
              <SectionTitle dot="var(--accent)">Εγγύηση</SectionTitle>
              <div style={{ ...s.g3, marginBottom:16 }}>
                <NumberInput label="Ποσό Εγγύησης" value={form.deposit_amount} onChange={v=>sf('deposit_amount',v)} suffix="€"/>
                <div><div style={{ ...labelStyle, marginBottom:8 }}>Επενδύεται</div><Toggle on={form.deposit_invested} onChange={v=>sf('deposit_invested',v)} label="Ναι" labelOff="Όχι"/></div>
                <div><div style={{ ...labelStyle, marginBottom:8 }}>Επεστράφη</div><Toggle on={form.deposit_returned} onChange={v=>sf('deposit_returned',v)} label="Ναι" labelOff="Όχι"/></div>
              </div>
              {form.deposit_returned&&<div style={{ marginBottom:16 }}><DateField label="Ημερομηνία Επιστροφής" value={form.deposit_return_date} onChange={v=>sf('deposit_return_date',v)}/></div>}
              {form.deposit_invested&&(
                <div style={{ ...s.g3, marginBottom:16 }}>
                  <NumberInput label="Απόδοση % / Έτος" value={form.deposit_invest_rate} onChange={v=>sf('deposit_invest_rate',v)} suffix="%" step={0.1} max={100}/>
                  <SelectField label="Τύπος Επένδυσης" value={form.deposit_invest_type} onChange={v=>sf('deposit_invest_type',v)} options={['Fixed Term','Flexible','ETF','P2P Lending','Άλλο'].map(v=>({value:v,label:v}))} placeholder="Επιλογή..."/>
                  <TextInput label="Πού Επενδύεται" value={form.deposit_invest_term} onChange={v=>sf('deposit_invest_term',v)} placeholder="για παράδειγμα Scramble, VWCE..."/>
                </div>
              )}
              <InvestmentCalc title="Αναλυτής Απόδοσης Εγγύησης" amount={form.deposit_amount?Math.max(0,parseFloat(form.deposit_amount)):null}/>
              <div style={s.divider}/>
              <Textarea label="Σημειώσεις" value={form.notes} onChange={v=>sf('notes',v)}/>
            </>
          )}

          {formTab==='lease'&&(
            <>
              <SectionTitle>Διάρκεια Μίσθωσης</SectionTitle>
              <div style={{ display:'flex', gap:6, marginBottom:18, flexWrap:'wrap' as const }}>
                {(Object.keys(LEASE_LABELS) as LeaseType[]).map(lt=>(
                  <button key={lt} onClick={()=>sf('lease_type',lt)} style={{ padding:'8px 16px', fontSize:'11px', fontFamily:T.font.sans, cursor:'pointer', borderRadius:T.radius.btn, border:`1px solid ${form.lease_type===lt?'var(--accent)':'var(--border-default)'}`, background:form.lease_type===lt?'var(--accent-dim)':'transparent', color:form.lease_type===lt?'var(--accent)':'var(--text-secondary)', transition:'all 0.15s', fontWeight:form.lease_type===lt?600:400 }}>{LEASE_LABELS[lt]}</button>
                ))}
              </div>
              <div style={{ ...s.g3, marginBottom:16 }}>
                <DateField label="Έναρξη Μίσθωσης" value={form.lease_start} onChange={v=>sf('lease_start',v)}/>
                <DateField label="Λήξη Μίσθωσης" value={form.lease_end} onChange={v=>sf('lease_end',v)}/>
                {form.lease_type==='custom'&&<NumberInput label="Ημέρες" value={String(form.custom_lease_days)} onChange={v=>sf('custom_lease_days',parseInt(v)||0)} suffix="ημ."/>}
              </div>
              <div style={s.divider}/>
              <SectionTitle>Ενοίκιο και Τρόπος Πληρωμής</SectionTitle>
              <div style={{ ...s.g3, marginBottom:16 }}>
                <NumberInput label="Μηνιαίο Ενοίκιο" value={form.monthly_rent} onChange={v=>sf('monthly_rent',v)} suffix="€"/>
                <SelectField label="Συχνότητα Εξόφλησης" value={form.payment_frequency} onChange={v=>sf('payment_frequency',v)} options={[{value:'monthly',label:'Μηνιαία'},{value:'bimonthly',label:'Διμηνιαία'},{value:'quarterly',label:'Τριμηνιαία'}]}/>
                <div><div style={{ ...labelStyle, marginBottom:8 }}>Ηλεκτρονική Πληρωμή</div><Toggle on={form.e_payment} onChange={v=>sf('e_payment',v)} label="Ενεργή" labelOff="Ανενεργή"/></div>
              </div>
              <div style={s.divider}/>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:form.prepay_option?16:0 }}>
                <SectionTitle>Προπληρωμή και Έκπτωση</SectionTitle>
                <Toggle on={form.prepay_option} onChange={v=>sf('prepay_option',v)} label="Ενεργή" labelOff="Ανενεργή"/>
              </div>
              {form.prepay_option&&<PrepayCalc monthlyRent={form.monthly_rent?Math.max(0,parseFloat(form.monthly_rent)):null}/>}
              <div style={s.divider}/>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:form.all_inclusive?16:0 }}>
                <SectionTitle>All-Inclusive, Κοινόχρηστα Στον Ενοικιαστή</SectionTitle>
                <Toggle on={form.all_inclusive} onChange={v=>sf('all_inclusive',v)} label="Ναι" labelOff="Όχι"/>
              </div>
              {form.all_inclusive&&(
                <>
                  <div style={{ ...s.g3, marginBottom:16 }}>
                    <TextInput label="Πάροχος Ρεύματος" value={form.electricity_provider} onChange={v=>sf('electricity_provider',v)} placeholder="για παράδειγμα ΔΕΗ, Heron"/>
                    <TextInput label="Είδος Τιμολογίου" value={form.electricity_tariff} onChange={v=>sf('electricity_tariff',v)} placeholder="για παράδειγμα G1, Νυχτερινό"/>
                    <NumberInput label="Τιμή kWh" value={form.kwh_price} onChange={v=>sf('kwh_price',v)} suffix="€" step={0.001}/>
                  </div>
                  <div style={{ ...s.g3, marginBottom:16 }}>
                    <NumberInput label="Όριο kWh / Μήνα" value={form.kwh_limit} onChange={v=>sf('kwh_limit',v)} suffix="kWh"/>
                    <NumberInput label="Όριο Νερού / Μήνα" value={form.water_monthly_limit} onChange={v=>sf('water_monthly_limit',v)} suffix="m³"/>
                    <NumberInput label="Κόστος Internet / Μήνα" value={form.internet_cost} onChange={v=>sf('internet_cost',v)} suffix="€"/>
                  </div>
                  <div style={{ ...s.g2, marginBottom:16 }}>
                    <TextInput label="Πάροχος Internet" value={form.internet_provider} onChange={v=>sf('internet_provider',v)} placeholder="για παράδειγμα Cosmote, Wind"/>
                    <TextInput label="Πρόγραμμα Internet" value={form.internet_plan} onChange={v=>sf('internet_plan',v)} placeholder="για παράδειγμα 300Mbps Fiber"/>
                  </div>
                </>
              )}
            </>
          )}

          {formTab==='services'&&(
            <>
              <SectionTitle>Streaming και Ψηφιακές Συνδρομές</SectionTitle>
              <StreamingConfig value={form.streaming} onChange={v=>sf('streaming',v)}/>
              <div style={s.divider}/>
              <SectionTitle>Καθαρισμός</SectionTitle>
              <CleaningConfig value={form.cleaning} onChange={v=>sf('cleaning',v)}/>
              <div style={s.divider}/>
              <SectionTitle>Ετήσιες Συντηρήσεις, Ποιος Επιβαρύνεται</SectionTitle>
              {[{label:'Κλιματιστικό',byKey:'ac_service_by',freqKey:'ac_service_frequency'},{label:'Ηλιακός Θερμοσίφωνας',byKey:'solar_service_by',freqKey:'solar_service_frequency'},{label:'Αντλία Θερμότητας',byKey:'heat_pump_service_by',freqKey:'heat_pump_service_frequency'},{label:'Φωτοβολταϊκά',byKey:'solar_panels_service_by',freqKey:'solar_panels_service_frequency'},{label:'Απεντόμωση / Μυοκτονία',byKey:'pest_control_by',freqKey:'pest_control_frequency'}].map(({label,byKey,freqKey})=>(
                <div key={byKey} style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginBottom:10, padding:14, background:'var(--bg-elevated)', borderRadius:T.radius.inner, border:'1px solid var(--border-subtle)' }}>
                  <ServiceBySelect label={label} value={(form as any)[byKey] as ServiceBy} onChange={v=>sf(byKey,v)}/>
                  <SelectField label="Συχνότητα" value={(form as any)[freqKey]} onChange={v=>sf(freqKey,v)} options={FREQ_OPTIONS} placeholder="Χωρίς"/>
                </div>
              ))}
              <Textarea label="Σημειώσεις Συντηρήσεων" value={form.annual_services_notes} onChange={v=>sf('annual_services_notes',v)}/>
              <div style={s.divider}/>
              <Textarea label="Επιπλέον Παροχές" value={form.extra_perks} onChange={v=>sf('extra_perks',v)} placeholder="για παράδειγμα Αποθήκη, κήπος, κοινόχρηστο πλυντήριο..."/>
            </>
          )}

          {formTab==='parking'&&(
            <>
              <SectionTitle>Χώρος Στάθμευσης</SectionTitle>
              <div style={{ ...s.g3, marginBottom:16 }}>
                <div><div style={{ ...labelStyle, marginBottom:8 }}>Περιλαμβάνεται στην Τιμή</div><Toggle on={form.parking_included} onChange={v=>sf('parking_included',v)} label="Ναι" labelOff="Όχι"/></div>
                <div><div style={{ ...labelStyle, marginBottom:8 }}>Νοικιάζεται Ξεχωριστά</div><Toggle on={form.parking_extra} onChange={v=>sf('parking_extra',v)} label="Ναι" labelOff="Όχι"/></div>
                {form.parking_extra&&<NumberInput label="Μηνιαία Τιμή Parking" value={form.parking_extra_price} onChange={v=>sf('parking_extra_price',v)} suffix="€"/>}
              </div>
              <div style={{ ...s.g3, marginBottom:16 }}>
                <SelectField label="Τύπος Χώρου" value={form.parking_type} onChange={v=>sf('parking_type',v)} options={[{value:'outdoor',label:'Υπαίθριος'},{value:'indoor',label:'Κλειστός / Υπόγειος'},{value:'garage',label:'Γκαράζ'},{value:'street',label:'Δρόμος'}]} placeholder="Επιλογή..."/>
                <div><div style={{ ...labelStyle, marginBottom:8 }}>Υποδομή Φόρτισης EV</div><Toggle on={form.parking_has_electricity} onChange={v=>sf('parking_has_electricity',v)} label="Ναι" labelOff="Όχι"/></div>
              </div>
              <Textarea label="Σημειώσεις Parking" value={form.parking_notes} onChange={v=>sf('parking_notes',v)} placeholder="για παράδειγμα Θέση Νο. 12, υπόγειο Β..."/>
            </>
          )}

          {formTab==='docs'&&(
            <>
              <SectionTitle>Ενοικιαστήριο Συμβόλαιο</SectionTitle>
              <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:14, lineHeight:1.6 }}>Αποθήκευσε το συμβόλαιο ως εξωτερικό σύνδεσμο (Google Drive, Dropbox κλπ) ή ανέβασε PDF μετά την αποθήκευση.</div>
                <TextInput label="Εξωτερικός Σύνδεσμος" value={form.lease_doc_external_url} onChange={v=>sf('lease_doc_external_url',v)} placeholder="https://drive.google.com/..."/>
              </div>
            </>
          )}

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:28, paddingTop:20, borderTop:'1px solid var(--border-subtle)' }}>
            <div>
              {formTab!=='profile'&&<button style={s.btnGhost} onClick={()=>setFormTab(FTABS[FTABS.findIndex(([,t])=>t===formTab)-1][1] as typeof formTab)}>‹ Πίσω</button>}
              {formTab==='profile'&&<button style={s.btnGhost} onClick={()=>{setIsForm(false);setEditMode(false);}}>Ακύρωση</button>}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              {formTab!=='docs'&&<button style={{ ...s.btnGold, padding:'10px 24px' }} onClick={()=>setFormTab(FTABS[FTABS.findIndex(([,t])=>t===formTab)+1][1] as typeof formTab)}>Επόμενο ›</button>}
              {formTab==='docs'&&<button style={{ ...s.btnGold, padding:'10px 24px' }} onClick={save} disabled={saving}>{saving?'Αποθήκευση...':editMode?'Αποθήκευση Αλλαγών':'Προσθήκη Ενοικιαστή'}</button>}
            </div>
          </div>
        </div>
      )}

      {/* ── VIEW ── */}
      {tenant&&!isForm&&(
        <>
          {/* Page Title */}
          <PageTitle
            title="Ενοικιαστής"
            sub="Πλήρης παρακολούθηση μίσθωσης, πληρωμών, επικοινωνίας και ανάλυσης αγοράς"
            right={<>
              <button style={s.btnGhost} onClick={openEdit}>Επεξεργασία</button>
              <button style={s.btnDng} onClick={async()=>{if(!confirm(`Οριστική διαγραφή "${tenant.full_name}";`))return;await supabase.from('rent_payments').delete().eq('property_id',propertyId).eq('user_id',userId);await supabase.from('tenants').delete().eq('id',tenant.id);setTenant(null);setPayments([]);setExtras([]);}}>Διαγραφή</button>
            </>}
          />

          {/* Tenant Identity */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:24, fontFamily:T.font.sans, fontWeight:400, color:'var(--text-primary)', marginBottom:6, letterSpacing:'-0.3px' }}>{tenant.full_name}</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const, alignItems:'center' }}>
              {tenant.profession&&<StatusBadge label={tenant.profession} color="var(--text-secondary)" bg="var(--bg-elevated)"/>}
              {tenant.employer&&<span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>{tenant.employer}</span>}
              {tenant.nationality&&<span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>· {tenant.nationality}</span>}
              {tenant.email&&<span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{tenant.email}</span>}
              {tenant.phone&&<span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans }}>· {tenant.phone}</span>}
              {tenant.afm&&<span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>ΑΦΜ {tenant.afm}</span>}
            </div>
          </div>

          {/* KPI Summary */}
          <KPIGrid items={tenantKPIs}/>

          {/* Alerts */}
          {leaseDaysLeft!=null&&leaseDaysLeft<0&&<InfoBanner tone="negative">Το μισθωτήριο έχει λήξει, απαιτείται ανανέωση ή διαδικασία αποχώρησης.</InfoBanner>}
          {leaseDaysLeft!=null&&leaseDaysLeft>=0&&leaseDaysLeft<=60&&<InfoBanner tone="warning">Το μισθωτήριο λήγει σε {fn(leaseDaysLeft)} ημέρες, ξεκίνησε εγκαίρως τη διαδικασία ανανέωσης.</InfoBanner>}
          {unpaidPayments.length>0&&<InfoBanner tone="negative">Υπάρχουν {fn(unpaidPayments.length)} εκκρεμείς πληρωμές ενοικίου συνολικού ποσού {fe(unpaidTotal)}.</InfoBanner>}
          {!hasLeaseDoc&&<InfoBanner tone="info">Δεν έχει καταχωρηθεί έγγραφο μισθωτηρίου, ανέβασε PDF ή πρόσθεσε εξωτερικό σύνδεσμο στην καρτέλα «Συμβόλαιο».</InfoBanner>}

          {/* View Tabs */}
          <div style={{ display:'flex', borderBottom:'1px solid var(--border-subtle)', marginBottom:24, overflowX:'auto' as const, scrollbarWidth:'none' as const }}>
            {VTABS.map(t=>(
              <button key={t.id} onClick={()=>setViewTab(t.id)} style={{ ...s.tabBtn(viewTab===t.id), display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                {t.label}
                {t.badge&&t.badge>0&&<span style={{ minWidth:18, height:18, borderRadius:9, background:'var(--negative)', color:'#fff', fontSize:9, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{t.badge}</span>}
              </button>
            ))}
          </div>

          {viewTab==='dashboard'&&<DashboardView tenant={tenant} payments={payments}/>}

          {viewTab==='profile'&&(
            <div style={s.g2}>
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                <SectionTitle>Στοιχεία Ενοικιαστή</SectionTitle>
                {([['Ηλεκτρονικό Ταχυδρομείο',tenant.email],['Κινητό Τηλέφωνο',tenant.phone],['Τηλέφωνο Εργασίας',tenant.phone_work],['Εθνικότητα',tenant.nationality],['Επάγγελμα',tenant.profession],['Εργοδότης',tenant.employer],['ΑΦΜ',tenant.afm],['Έγγραφο Ταυτοποίησης',tenant.id_doc_type],['Αριθμός Εγγράφου',tenant.id_doc_number],['IBAN',tenant.iban]] as [string,string|null][]).filter(([,v])=>v).map(([k,v],i)=>(
                  <DataRow key={i} label={k} value={v!}/>
                ))}
                {tenant.notes&&<div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border-subtle)', fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.7 }}>{tenant.notes}</div>}
              </div>
              <div>
                <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
                  <SectionTitle dot="var(--accent)">Εγγύηση</SectionTitle>
                  <DataRow label="Ποσό Εγγύησης" value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(tenant.deposit_amount)}</span>}/>
                  <DataRow label="Κατάσταση" value={tenant.deposit_returned?<StatusBadge label="Επεστράφη" color="var(--positive)" bg="var(--positive-dim)"/>:<StatusBadge label="Εκκρεμεί" color="var(--accent)" bg="var(--accent-dim)"/>}/>
                  <DataRow label="Επένδυση" value={tenant.deposit_invested?<StatusBadge label="Επενδύεται" color="var(--positive)" bg="var(--positive-dim)"/>:<StatusBadge label="Όχι" color="var(--text-secondary)" bg="var(--bg-overlay)"/>}/>
                  {tenant.deposit_invest_type&&<DataRow label="Τύπος Επένδυσης" value={tenant.deposit_invest_type}/>}
                  {tenant.deposit_invest_term&&<DataRow label="Πού Επενδύεται" value={tenant.deposit_invest_term}/>}
                  {!tenant.deposit_returned&&(
                    <button style={{ ...s.btnSm, marginTop:14, width:'100%', textAlign:'center' as const }}
                      onClick={async()=>{await supabase.from('tenants').update({deposit_returned:true,deposit_return_date:new Date().toISOString().split('T')[0]}).eq('id',tenant.id);fetch_();notify('Εγγύηση επεστράφη');}}>
                      Σήμανση ως Επεστράφη
                    </button>
                  )}
                  <InvestmentCalc title="Απόδοση Εγγύησης" amount={tenant.deposit_amount}/>
                </div>
              </div>
            </div>
          )}

          {viewTab==='lease'&&(
            <div style={s.g2}>
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                <SectionTitle>Στοιχεία Συμβολαίου</SectionTitle>
                {([
                  ['Τύπος Μίσθωσης',tenant.lease_type?LEASE_LABELS[tenant.lease_type]:'—'],
                  ['Ημερομηνία Έναρξης',fmtD(tenant.lease_start)],
                  ['Ημερομηνία Λήξης',()=>{const d=daysLeft(tenant.lease_end);const st=leaseSt(d);return(<span style={{ display:'flex', alignItems:'center', gap:8 }}>{fmtD(tenant.lease_end)}{st&&<StatusBadge label={st.label} color={st.color} bg={st.bg}/>}</span>);}],
                  ['Μηνιαίο Ενοίκιο',<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:15 }}>{fmt(tenant.monthly_rent)}</span>],
                  ['Συχνότητα Εξόφλησης',{monthly:'Μηνιαία',bimonthly:'Διμηνιαία',quarterly:'Τριμηνιαία'}[tenant.payment_frequency||'monthly']||'—'],
                  ['Τρόπος Πληρωμής',tenant.e_payment?<StatusBadge label="Ηλεκτρονική" color="var(--positive)" bg="var(--positive-dim)"/>:<StatusBadge label="Μετρητά" color="var(--text-secondary)" bg="var(--bg-overlay)"/>],
                  ['All-Inclusive',tenant.all_inclusive?<StatusBadge label="Ναι" color="var(--accent)" bg="var(--accent-dim)"/>:<StatusBadge label="Όχι" color="var(--text-secondary)" bg="var(--bg-overlay)"/>],
                ] as [string,React.ReactNode|Function][]).map(([k,v],i)=>(
                  <DataRow key={i} label={k as string} value={typeof v==='function'?v():v as React.ReactNode}/>
                ))}
                {tenant.prepay_option&&<div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border-subtle)' }}><PrepayCalc monthlyRent={tenant.monthly_rent}/></div>}
              </div>
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                <SectionTitle>Ετήσιες Συντηρήσεις</SectionTitle>
                {[['Κλιματιστικό',tenant.ac_service_by],['Ηλιακός Θερμοσίφωνας',tenant.solar_service_by],['Αντλία Θερμότητας',tenant.heat_pump_service_by],['Φωτοβολταϊκά',tenant.solar_panels_service_by],['Απεντόμωση',tenant.pest_control_by]].filter(([,v])=>v).map(([k,v],i)=>{
                  const col=(v as ServiceBy)==='owner'?'var(--warning)':(v as ServiceBy)==='tenant'?'var(--positive)':'var(--accent)';
                  const bg=(v as ServiceBy)==='owner'?'var(--warning-dim)':(v as ServiceBy)==='tenant'?'var(--positive-dim)':'var(--accent-dim)';
                  return <DataRow key={i} label={k as string} value={<StatusBadge label={SERVICE_BY_LABELS[v as ServiceBy]} color={col} bg={bg}/>}/>;
                })}
                {(tenant.parking_included||tenant.parking_extra)&&(
                  <>
                    <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border-subtle)' }}><SectionTitle>Χώρος Στάθμευσης</SectionTitle></div>
                    {tenant.parking_type&&<DataRow label="Τύπος" value={{outdoor:'Υπαίθριος',indoor:'Κλειστός',garage:'Γκαράζ',street:'Δρόμος'}[tenant.parking_type]||tenant.parking_type}/>}
                    <DataRow label="Στην Τιμή" value={tenant.parking_included?<StatusBadge label="Ναι" color="var(--positive)" bg="var(--positive-dim)"/>:<StatusBadge label="Όχι" color="var(--text-secondary)" bg="var(--bg-overlay)"/>}/>
                    {tenant.parking_extra&&<DataRow label="Επιπλέον Χρέωση" value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(tenant.parking_extra_price)}</span>}/>}
                    <DataRow label="Υποδομή EV" value={tenant.parking_has_electricity?<StatusBadge label="Ναι" color="var(--accent)" bg="var(--accent-dim)"/>:<StatusBadge label="Όχι" color="var(--text-secondary)" bg="var(--bg-overlay)"/>}/>
                  </>
                )}
              </div>
            </div>
          )}

          {viewTab==='services'&&(
            <div style={s.g2}>
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                <SectionTitle>Streaming και Ψηφιακές Συνδρομές</SectionTitle>
                {!(tenant.streaming?.some(sv=>sv.included))&&<div style={{ color:'var(--text-tertiary)', fontSize:13, fontFamily:T.font.sans }}>Καμία ψηφιακή συνδρομή</div>}
                {tenant.streaming?.filter(sv=>sv.included).map((svc,i)=>(
                  <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:16, alignItems:'center', padding:'12px 14px', marginBottom:8, background:'var(--bg-elevated)', borderRadius:T.radius.inner, border:'1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize:13, color:'var(--text-primary)', fontFamily:T.font.sans }}>{svc.name}</span>
                    <div style={{ textAlign:'right' as const }}>
                      <div style={{ fontSize:9, color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase' as const, marginBottom:2 }}>Κόστος</div>
                      <div style={{ fontSize:13, color:'var(--negative)', fontWeight:700, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(svc.cost_owner)}</div>
                    </div>
                    <div style={{ textAlign:'right' as const }}>
                      <div style={{ fontSize:9, color:'var(--text-secondary)', letterSpacing:'0.1em', textTransform:'uppercase' as const, marginBottom:2 }}>Χρέωση</div>
                      <div style={{ fontSize:13, color:'var(--accent)', fontWeight:700, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(svc.charged_tenant)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                <SectionTitle>Καθαρισμός</SectionTitle>
                {!tenant.cleaning||tenant.cleaning.package==='none'?(
                  <div style={{ color:'var(--text-tertiary)', fontSize:13, fontFamily:T.font.sans }}>Δεν περιλαμβάνεται καθαρισμός</div>
                ):(
                  <div style={{ background:'var(--bg-elevated)', padding:16, borderRadius:T.radius.inner, border:'1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:10 }}>{tenant.cleaning.times} επισκέψεις × {tenant.cleaning.hours} ώρες / μήνα</div>
                    <DataRow label="Κόστος Ιδιοκτήτη" value={<span style={{ color:'var(--negative)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(tenant.cleaning.total_owner)}</span>}/>
                    <DataRow label="Χρέωση Ενοικιαστή" value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(tenant.cleaning.total_tenant)}</span>}/>
                  </div>
                )}
                {tenant.extra_perks&&<div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid var(--border-subtle)', fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.7 }}><SectionTitle>Επιπλέον Παροχές</SectionTitle>{tenant.extra_perks}</div>}
              </div>
            </div>
          )}

          {viewTab==='rentadjust'&&<RentAdjustView tenant={tenant}/>}

          {viewTab==='payments'&&(
            <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <SectionTitle>Ιστορικό Πληρωμών Ενοικίου</SectionTitle>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <ExportButton disabled={payments.length===0} onClick={()=>downloadCsv(
                    `enoikiastis_${new Date().toISOString().slice(0,10)}`,
                    ['Περίοδος','Ποσό (€)','Κατάσταση','Ημ. Πληρωμής','Καθυστέρηση (ημέρες)','Σημειώσεις'],
                    payments.map(p=>[
                      `${MONTHS_FULL[p.period_month-1]} ${p.period_year}`, csvEur(p.amount),
                      p.paid?'Εξοφλήθη':'Εκκρεμεί', csvDate(p.paid_date), p.days_late||0, (p.notes||'').replace(/\n/g,' '),
                    ])
                  )}/>
                  <button style={s.btnSm} onClick={()=>setAddPay(v=>!v)}>{addPay?'Κλείσιμο':'+ Νέα Πληρωμή'}</button>
                </div>
              </div>
              {addPay&&(
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20, marginBottom:20 }}>
                  <div style={{ ...s.g4, marginBottom:14 }}>
                    <SelectField label="Μήνας" value={String(payF.period_month)} onChange={v=>setPayF(f=>({...f,period_month:+v}))} options={MONTHS_FULL.map((m,i)=>({value:String(i+1),label:m}))}/>
                    <NumberInput label="Έτος" value={String(payF.period_year)} onChange={v=>setPayF(f=>({...f,period_year:+v}))} min={2000}/>
                    <NumberInput label="Ποσό" value={payF.amount} onChange={v=>setPayF(f=>({...f,amount:v}))} suffix="€" placeholder={tenant.monthly_rent?.toString()}/>
                    <NumberInput label="Ημέρες Καθυστέρησης" value={payF.days_late} onChange={v=>setPayF(f=>({...f,days_late:v}))} suffix="ημ." placeholder="0"/>
                  </div>
                  <div style={{ ...s.g3, marginBottom:14 }}>
                    <div><div style={{ ...labelStyle, marginBottom:8 }}>Εξοφλήθη</div><Toggle on={payF.paid} onChange={v=>setPayF(f=>({...f,paid:v}))} label="Ναι" labelOff="Όχι"/></div>
                    {payF.paid&&<DateField label="Ημερομηνία Πληρωμής" value={payF.paid_date} onChange={v=>setPayF(f=>({...f,paid_date:v}))}/>}
                    <TextInput label="Σημείωση" value={payF.notes} onChange={v=>setPayF(f=>({...f,notes:v}))} placeholder="για παράδειγμα Μερική πληρωμή"/>
                  </div>
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button style={s.btnGhost} onClick={()=>setAddPay(false)}>Ακύρωση</button>
                    <button style={s.btnGold} onClick={savePay} disabled={saving}>{saving?'Αποθήκευση...':'Καταχώρηση'}</button>
                  </div>
                </div>
              )}
              {payments.length===0?(
                <div style={{ textAlign:'center', padding:'48px 0', color:'var(--text-tertiary)', fontSize:13, fontFamily:T.font.sans }}>Δεν υπάρχουν καταχωρημένες πληρωμές</div>
              ):(
                <>
                  <div className="table-wrap">
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead><tr>{['Περίοδος','Ποσό','Κατάσταση','Ημερομηνία Πληρωμής','Καθυστέρηση','Σημείωση',''].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {payments.map(p=>(
                        <tr key={p.id}>
                          <td style={s.td}><strong style={{ fontFamily:T.font.sans }}>{MONTHS_S[p.period_month-1]}</strong> <span style={{ color:'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{p.period_year}</span></td>
                          <td style={{ ...s.td, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(p.amount)}</td>
                          <td style={s.td}>
                            <button onClick={async()=>{await supabase.from('rent_payments').update({paid:!p.paid,paid_date:!p.paid?new Date().toISOString().split('T')[0]:null}).eq('id',p.id);fetch_();}}
                              style={{ ...s.badge(p.paid?'var(--positive)':'var(--negative)',p.paid?'var(--positive-dim)':'var(--negative-dim)'), cursor:'pointer', border:`1px solid ${p.paid?'var(--positive)':'var(--negative)'}33`, fontFamily:T.font.sans }}>
                              {p.paid?'Εξοφλήθη':'Εκκρεμεί'}
                            </button>
                          </td>
                          <td style={s.tdM}>{fmtD(p.paid_date)}</td>
                          <td style={s.td}>{p.days_late&&p.days_late>0?<StatusBadge label={`${p.days_late} ημέρες`} color={p.days_late>14?'var(--negative)':'var(--warning)'} bg={p.days_late>14?'var(--negative-dim)':'var(--warning-dim)'}/>:<span style={{ color:'var(--text-tertiary)' }}>—</span>}</td>
                          <td style={s.tdM}>{p.notes||'—'}</td>
                          <td style={s.td}><button style={s.btnDng} onClick={async()=>{if(!confirm('Διαγραφή;'))return;await supabase.from('rent_payments').delete().eq('id',p.id);fetch_();}}>Διαγραφή</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:14, paddingTop:14, display:'flex', gap:20, flexWrap:'wrap' as const }}>
                    <span style={{ fontSize:12, color:'var(--positive)', fontFamily:T.font.sans }}>Εισπραχθέντα: <strong style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(payments.filter(p=>p.paid).reduce((a,p)=>a+p.amount,0))}</strong></span>
                    {payments.some(p=>!p.paid)&&<span style={{ fontSize:12, color:'var(--negative)', fontFamily:T.font.sans }}>Εκκρεμή: <strong style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(payments.filter(p=>!p.paid).reduce((a,p)=>a+p.amount,0))}</strong></span>}
                    <span style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{payments.filter(p=>p.paid).length} / {payments.length} πληρωμές εξοφλημένες</span>
                  </div>
                </>
              )}
            </div>
          )}

          {viewTab==='extras'&&(
            <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <SectionTitle dot="var(--warning)">Έκτακτες Χρεώσεις</SectionTitle>
                <button style={s.btnSm} onClick={()=>setAddExtra(v=>!v)}>{addExtra?'Κλείσιμο':'+ Νέα Χρέωση'}</button>
              </div>
              {addExtra&&(
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20, marginBottom:20 }}>
                  <div style={{ ...s.g3, marginBottom:14 }}>
                    <div style={{ gridColumn:'1/3' }}><TextInput label="Περιγραφή" value={exF.description} onChange={v=>setExF(f=>({...f,description:v}))} placeholder="για παράδειγμα Φθορά ψυγείου"/></div>
                    <NumberInput label="Ποσό" value={exF.amount} onChange={v=>setExF(f=>({...f,amount:v}))} suffix="€"/>
                  </div>
                  <div style={{ ...s.g3, marginBottom:14 }}>
                    <SelectField label="Κατηγορία" value={exF.category} onChange={v=>setExF(f=>({...f,category:v}))} options={EXTRA_CATS.map(c=>({value:c,label:c}))}/>
                    <DateField label="Ημερομηνία" value={exF.date} onChange={v=>setExF(f=>({...f,date:v}))}/>
                    <div><div style={{ ...labelStyle, marginBottom:8 }}>Εξοφλήθη</div><Toggle on={exF.paid} onChange={v=>setExF(f=>({...f,paid:v}))} label="Ναι" labelOff="Όχι"/></div>
                  </div>
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <button style={s.btnGhost} onClick={()=>setAddExtra(false)}>Ακύρωση</button>
                    <button style={s.btnGold} onClick={saveExtra} disabled={saving}>{saving?'Αποθήκευση...':'Καταχώρηση'}</button>
                  </div>
                </div>
              )}
              {extras.length===0?(
                <div style={{ textAlign:'center', padding:'48px 0', color:'var(--text-tertiary)', fontSize:13, fontFamily:T.font.sans }}>Δεν υπάρχουν έκτακτες χρεώσεις</div>
              ):(
                <div className="table-wrap">
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr>{['Ημερομηνία','Περιγραφή','Κατηγορία','Ποσό','Κατάσταση',''].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {extras.map((e:any)=>(
                      <tr key={e.id}>
                        <td style={s.tdM}>{fmtD(e.date)}</td>
                        <td style={s.td}>{e.description}</td>
                        <td style={s.tdM}>{e.category}</td>
                        <td style={{ ...s.td, color:'var(--warning)', fontWeight:700, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(e.amount)}</td>
                        <td style={s.td}>
                          <button onClick={async()=>{await supabase.from('expenses').update({paid:!e.paid}).eq('id',e.id);fetch_();}}
                            style={{ ...s.badge(e.paid?'var(--positive)':'var(--warning)',e.paid?'var(--positive-dim)':'var(--warning-dim)'), cursor:'pointer', border:`1px solid ${e.paid?'var(--positive)':'var(--warning)'}33`, fontFamily:T.font.sans }}>
                            {e.paid?'Εξοφλήθη':'Εκκρεμεί'}
                          </button>
                        </td>
                        <td style={s.td}><button style={s.btnDng} onClick={async()=>{if(!confirm('Διαγραφή;'))return;await supabase.from('expenses').delete().eq('id',e.id);fetch_();}}>Διαγραφή</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          )}

          {viewTab==='comm'&&<CommView tenant={tenant} propertyId={propertyId} userId={userId}/>}
          {viewTab==='market'&&<MarketView tenant={tenant} propertyId={propertyId} userId={userId}/>}

          {viewTab==='docs'&&(
            <div style={s.g2}>
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                <SectionTitle>PDF Συμβολαίου</SectionTitle>
                {tenant.lease_doc_name?(
                  <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-accent)', borderRadius:T.radius.inner, padding:20 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:2 }}>{tenant.lease_doc_name}</div>
                        <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>Ανεβασμένο συμβόλαιο</div>
                      </div>
                      <button style={s.btnDng} onClick={async()=>{if(!tenant.lease_doc_name)return;await supabase.storage.from('lease-documents').remove([`${userId}/${tenant.id}/${tenant.lease_doc_name}`]);await supabase.from('tenants').update({lease_doc_url:null,lease_doc_name:null}).eq('id',tenant.id);notify('PDF διαγράφηκε');fetch_();}}>Διαγραφή</button>
                    </div>
                    <button onClick={openLeaseDoc} style={{ ...s.btnGold, display:'inline-block', marginBottom:10 }}>Άνοιγμα PDF</button>
                    <div style={{ marginTop:10 }}>
                      <label style={{ ...s.btnSm, cursor:'pointer', display:'inline-block' }}>
                        {uploading?'Ανέβασμα...':'Αντικατάσταση PDF'}
                        <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPDF(f);}} disabled={uploading}/>
                      </label>
                    </div>
                  </div>
                ):(
                  <div style={{ border:`2px dashed var(--border-default)`, borderRadius:T.radius.inner, padding:'48px 32px', textAlign:'center' as const }}>
                    <div style={{ fontSize:36, opacity:0.15, marginBottom:14 }}></div>
                    <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:20 }}>Ανέβασε το ενοικιαστήριο συμβόλαιο σε μορφή PDF</div>
                    <label style={{ ...s.btnGold, cursor:'pointer', display:'inline-block', padding:'11px 28px' }}>
                      {uploading?'Ανέβασμα...':'Επιλογή PDF'}
                      <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPDF(f);}} disabled={uploading}/>
                    </label>
                  </div>
                )}
              </div>
              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
                <SectionTitle>Εξωτερικός Σύνδεσμος</SectionTitle>
                {tenant.lease_doc_external_url?(
                  <div>
                    <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:14, wordBreak:'break-all' as const, lineHeight:1.6 }}>{tenant.lease_doc_external_url}</div>
                    <a href={tenant.lease_doc_external_url} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGold, display:'inline-block', textDecoration:'none' }}>Άνοιγμα Συνδέσμου</a>
                  </div>
                ):(
                  <div style={{ fontSize:13, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.7 }}>Δεν έχει οριστεί εξωτερικός σύνδεσμος. Μπορείς να προσθέσεις link Google Drive, Dropbox ή άλλης υπηρεσίας.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}