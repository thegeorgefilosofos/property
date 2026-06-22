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

// ─── Types ──────────────────────────────────────────────────────────────────────
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

// ─── Score Engine ────────────────────────────────────────────────────────────────
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
  const breakdown=[
    {label:'Ποσοστό πληρωμών',value:`${(payRate*100).toFixed(0)}%`,ok:payRate>=0.9},
    {label:'Εκκρεμείς πληρωμές',value:unpaid.length,ok:unpaid.length===0},
    {label:'Μέση καθυστέρηση',value:avgLate>0?`${avgLate.toFixed(0)} μ.`:'—',ok:avgLate<=5},
    {label:'Πληρότητα προφίλ',value:`${(profilePts*100).toFixed(0)}%`,ok:profilePts>=0.8},
  ];
  return { score, label, color, breakdown };
}

// ─── Predictive Alerts ────────────────────────────────────────────────────────────
function predictAlerts(payments:RentPayment[], tenant:Tenant|null):string[] {
  if (!payments.length||!tenant) return [];
  const alerts:string[]=[];
  const lateMonths:Record<number,number>={};
  payments.filter(p=>(p.days_late||0)>5).forEach(p=>{lateMonths[p.period_month]=(lateMonths[p.period_month]||0)+1;});
  const nextM=(new Date().getMonth()+2)%12||12;
  if ((lateMonths[nextM]||0)>=2) alerts.push(`Βάσει ιστορικού: συχνές καθυστερήσεις τον ${MONTHS_GR[nextM-1]} — προετοιμάσου`);
  if ((lateMonths[7]||0)+(lateMonths[8]||0)>=2) alerts.push('Πρότυπο καλοκαιριού: Ιούλιος/Αύγουστος — ιστορικά αυξημένες καθυστερήσεις');
  const d=daysLeft(tenant.lease_end);
  if (d!==null) {
    if (d<0) alerts.push('Το μισθωτήριο έχει λήξει — ανανέωσε ή ξεκίνα διαδικασία αποχώρησης');
    else if (d<=30) alerts.push(`Κρίσιμο: Λήξη μισθωτηρίου σε ${d} μέρες`);
    else if (d<=60) alerts.push(`Λήξη μισθωτηρίου σε ${d} μέρες — ξεκίνα διαπραγματεύσεις`);
    else if (d<=90) alerts.push(`Λήξη μισθωτηρίου σε ${d} μέρες`);
  }
  const unpaid=payments.filter(p=>!p.paid);
  if (unpaid.length>=2) alerts.push(`${unpaid.length} εκκρεμείς πληρωμές — απαιτείται άμεση ενέργεια`);
  return alerts;
}

// ─── Payment Chart ────────────────────────────────────────────────────────────────
function PaymentChart({ payments }:{payments:RentPayment[]}) {
  if (!payments.length) return <div style={{color:'var(--text-tertiary)',fontSize:12,textAlign:'center',padding:24}}>Δεν υπάρχουν δεδομένα</div>;
  const last12=[...payments].sort((a,b)=>b.period_year-a.period_year||b.period_month-a.period_month).slice(0,12).reverse();
  return (
    <div>
      <div style={{display:'flex',alignItems:'flex-end',gap:4,height:80,marginBottom:8}}>
        {last12.map((p,i)=>{
          const late=p.days_late||0;
          const color=!p.paid?'var(--negative)':late>14?'var(--warning)':late>0?'var(--info)':'var(--positive)';
          return (
            <div key={p.id} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}} title={`${MONTHS_GR[p.period_month-1]} ${p.period_year}: ${p.paid?'Εξοφλήθη':'Εκκρεμεί'}${late>0?` (+${late}μ)`:''}`}>
              <div style={{width:'100%',height:p.paid?80:40,background:color,borderRadius:'3px 3px 0 0',opacity:0.85}}/>
            </div>
          );
        })}
      </div>
      <div style={{display:'flex',gap:4}}>
        {last12.map((p,i)=><div key={i} style={{flex:1,fontSize:7,color:'var(--text-tertiary)',textAlign:'center' as const}}>{MONTHS_GR[p.period_month-1]}</div>)}
      </div>
      <div style={{display:'flex',gap:12,marginTop:10,flexWrap:'wrap' as const}}>
        {[['var(--positive)','Εμπρόθεσμη'],['var(--info)','Μικρή καθ.'],['var(--warning)','Μεγάλη καθ.'],['var(--negative)','Εκκρεμεί']].map(([c,l])=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:4}}>
            <div style={{width:8,height:8,borderRadius:2,background:c}}/>
            <span style={{fontSize:10,color:'var(--text-tertiary)'}}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard View ────────────────────────────────────────────────────────────────
function DashboardView({tenant,payments}:{tenant:Tenant;payments:RentPayment[]}) {
  const score=useMemo(()=>calcScore(payments,tenant),[payments,tenant]);
  const alerts=useMemo(()=>predictAlerts(payments,tenant),[payments,tenant]);
  const d=daysLeft(tenant.lease_end); const st=leaseSt(d);
  const streaming=tenant.streaming||[];
  const totalTenant=(tenant.monthly_rent||0)+(tenant.cleaning?.total_tenant||0)+streaming.filter(sv=>sv.included).reduce((a,sv)=>a+sv.charged_tenant,0)+(tenant.parking_extra?(tenant.parking_extra_price||0):0);
  const ownerCosts=(tenant.cleaning?.total_owner||0)+streaming.filter(sv=>sv.included).reduce((a,sv)=>a+sv.cost_owner,0);
  const unpaidAmt=payments.filter(p=>!p.paid).reduce((a,p)=>a+p.amount,0);
  const paidPay=payments.filter(p=>p.paid);
  const late=paidPay.filter(p=>(p.days_late||0)>0);
  const avgLate=late.length?late.reduce((a,p)=>a+(p.days_late||0),0)/late.length:0;
  const fields=[tenant.full_name,tenant.email,tenant.phone,tenant.afm,tenant.iban,tenant.id_doc_number,tenant.nationality,tenant.profession,tenant.lease_start,tenant.monthly_rent,tenant.deposit_amount];
  const completePct=Math.round(fields.filter(Boolean).length/fields.length*100);
  const annualRent=(tenant.monthly_rent||0)*12;
  const streamingOwnerCost=streaming.filter(sv=>sv.included).reduce((a,sv)=>a+sv.cost_owner,0)*12;
  const cleaningOwnerCost=(tenant.cleaning?.total_owner||0)*12;
  const totalCosts=streamingOwnerCost+cleaningOwnerCost;
  const netIncome=annualRent-totalCosts;
  const totalReceived=paidPay.reduce((a,p)=>a+p.amount,0);

  return (
    <div>
      {alerts.length>0 && (
        <div style={{marginBottom:16}}>
          {alerts.map((a,i)=>(
            <div key={i} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:`3px solid ${i===0?'var(--negative)':'var(--warning)'}`,borderRadius:8,padding:'10px 16px',marginBottom:8,fontSize:12,color:i===0?'var(--negative)':'var(--warning)',fontFamily:"'Google Sans',sans-serif",fontWeight:500,display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:16}}>{i===0?'🔴':'🟡'}</span>{a}
            </div>
          ))}
        </div>
      )}

      {/* KPI Grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:16}}>
        {[
          {label:'Βασικό Ενοίκιο',value:fmt(tenant.monthly_rent),color:'var(--accent)'},
          {label:'Σύνολο/μήνα',value:fmt(totalTenant),color:'var(--positive)'},
          {label:'Κόστη Ιδιοκτ.',value:fmt(ownerCosts),color:'var(--negative)'},
          {label:'Λήξη Μίσθωσης',value:d==null?'—':d<0?'Έληξε':`${d} ημ.`,color:st?.color||'var(--text-primary)'},
          {label:'Εκκρεμή',value:fmt(unpaidAmt),color:unpaidAmt>0?'var(--negative)':'var(--positive)'},
          {label:'Εγγύηση',value:fmt(tenant.deposit_amount),color:tenant.deposit_returned?'var(--positive)':'var(--accent)'},
        ].map((k,i)=>(
          <div key={i} style={s.kpi}>
            <div style={{...s.kpiV,color:k.color}}>{k.value}</div>
            <div style={s.kpiL}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
        {/* Score Card */}
        <div style={s.card}>
          <div style={s.sec}><span style={s.dot()}/>Tenant Score</div>
          <div style={{display:'flex',alignItems:'center',gap:20,marginBottom:16}}>
            <div style={{position:'relative',width:90,height:90,flexShrink:0}}>
              <svg width="90" height="90" viewBox="0 0 90 90">
                <circle cx="45" cy="45" r="38" fill="none" stroke="var(--bg-overlay)" strokeWidth="8"/>
                <circle cx="45" cy="45" r="38" fill="none" stroke={score.color} strokeWidth="8"
                  strokeDasharray={`${(score.score/100)*238.76} 238.76`}
                  strokeLinecap="round" transform="rotate(-90 45 45)"/>
              </svg>
              <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div style={{fontSize:22,fontWeight:700,color:score.color,fontFamily:"'Roboto Mono',monospace",lineHeight:1}}>{score.score}</div>
                <div style={{fontSize:8,color:'var(--text-tertiary)',letterSpacing:'0.5px',textTransform:'uppercase' as const}}>/ 100</div>
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:16,fontWeight:600,color:score.color,fontFamily:"'Google Sans',sans-serif",marginBottom:8}}>{score.label}</div>
              {score.breakdown.map((b:any,i:number)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <span style={{fontSize:11,color:'var(--text-secondary)'}}>{b.label}</span>
                  <span style={{fontSize:11,fontWeight:600,color:b.ok?'var(--positive)':'var(--warning)',fontFamily:"'Roboto Mono',monospace"}}>{b.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Profile Completeness */}
        <div style={s.card}>
          <div style={s.sec}><span style={s.dot()}/>Πληρότητα Προφίλ</div>
          <div style={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <span style={{fontSize:12,color:'var(--text-secondary)'}}>Ολοκλήρωση</span>
              <span style={{fontSize:14,fontWeight:700,color:'var(--accent)',fontFamily:"'Roboto Mono',monospace"}}>{completePct}%</span>
            </div>
            <div style={{height:8,background:'var(--bg-overlay)',borderRadius:4,overflow:'hidden'}}>
              <div style={{height:'100%',width:`${completePct}%`,background:completePct>=80?'var(--positive)':completePct>=50?'var(--accent)':'var(--warning)',borderRadius:4,transition:'width 0.6s ease'}}/>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2px 12px'}}>
            {[['Ονοματεπώνυμο',!!tenant.full_name],['Email',!!tenant.email],['Τηλέφωνο',!!tenant.phone],['ΑΦΜ',!!tenant.afm],['IBAN',!!tenant.iban],['Εγγύηση',!!tenant.deposit_amount],['Έναρξη',!!tenant.lease_start],['Ενοίκιο',!!tenant.monthly_rent]].map(([lbl,ok],i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'3px 0',borderBottom:'1px solid var(--border-subtle)'}}>
                <span style={{fontSize:11,color:'var(--text-secondary)'}}>{lbl as string}</span>
                <span style={{fontSize:12,color:ok?'var(--positive)':'var(--text-tertiary)'}}>{ok?'✓':'—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Payment Chart */}
      <div style={{...s.card,marginBottom:16}}>
        <div style={s.sec}><span style={s.dot()}/>Ιστορικό Πληρωμών — Τελευταίοι 12 μήνες</div>
        <PaymentChart payments={payments}/>
        {payments.length>0&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginTop:16}}>
            {[
              {label:'Πληρωμές',value:`${paidPay.length}/${payments.length}`,color:'var(--positive)'},
              {label:'Ποσοστό',value:`${((paidPay.length/payments.length)*100).toFixed(0)}%`,color:'var(--accent)'},
              {label:'Μέση Καθ/ση',value:avgLate>0?`${avgLate.toFixed(0)} μ.`:'0 μ.',color:avgLate>7?'var(--warning)':'var(--positive)'},
              {label:'Εισπραχθέντα',value:fmt(totalReceived),color:'var(--info)'},
            ].map((k,i)=>(
              <div key={i} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'12px 14px',textAlign:'center' as const}}>
                <div style={{fontSize:16,fontWeight:700,color:k.color,fontFamily:"'Roboto Mono',monospace",marginBottom:3}}>{k.value}</div>
                <div style={{fontSize:9,color:'var(--text-secondary)',textTransform:'uppercase' as const,letterSpacing:'0.5px',fontFamily:"'Google Sans',sans-serif"}}>{k.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ROI */}
      <div style={s.card}>
        <div style={s.sec}><span style={s.dot()}/>Οικονομική Ανάλυση</div>
        {[
          {label:'Ακαθάριστα Ενοίκια/έτος',value:fmt(annualRent),color:'var(--positive)'},
          {label:'Κόστη Ιδιοκτήτη/έτος',value:`-${fmt(totalCosts)}`,color:'var(--negative)'},
          {label:'Καθαρό Εισόδημα/έτος',value:fmt(netIncome),color:'var(--accent)',bold:true},
          {label:'Εισπραχθέντα Σύνολο',value:fmt(totalReceived),color:'var(--positive)'},
          {label:'Εκκρεμή Σύνολο',value:fmt(unpaidAmt),color:unpaidAmt>0?'var(--negative)':'var(--text-tertiary)'},
        ].map((row,i)=>(
          <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 0',borderBottom:'1px solid var(--border-subtle)'}}>
            <span style={{fontSize:12,color:'var(--text-secondary)'}}>{row.label}</span>
            <span style={{fontSize:(row as any).bold?15:13,fontWeight:(row as any).bold?700:600,color:row.color,fontFamily:"'Roboto Mono',monospace"}}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── TDE View ──────────────────────────────────────────────────────────────────
function RentAdjustView({tenant}:{tenant:Tenant}) {
  const TDE:Record<number,number>={2015:0.0,2016:0.0,2017:1.1,2018:0.8,2019:0.5,2020:-1.3,2021:0.6,2022:9.3,2023:4.2,2024:2.8};
  const fmtE=(n:number)=>`${n.toLocaleString('el-GR',{minimumFractionDigits:2,maximumFractionDigits:2})} €`;
  const fmtDate=(d:string|null)=>d?new Date(d+'T00:00:00').toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
  const rent=tenant.monthly_rent||0;
  const leaseEnd=tenant.lease_end;
  const daysExp=leaseEnd?Math.ceil((new Date(leaseEnd+'T00:00:00').getTime()-Date.now())/86400000):null;
  const [yr,setYr]=useState(String(new Date().getFullYear()));
  const [useCustom,setUseCustom]=useState(false);
  const [customPct,setCustomPct]=useState('');
  const tde=TDE[parseInt(yr)]??2.8;
  const pct=useCustom?(parseFloat(customPct)||0):tde;
  const newRent=rent*(1+pct/100);
  const diff=newRent-rent;
  const isExpired=daysExp!==null&&daysExp<0;
  const isExpiring=daysExp!==null&&daysExp>=0&&daysExp<=60;

  const genLetter=()=>{
    const today_str=new Date().toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'});
    const w=window.open('','_blank','width=800,height=700');
    if(!w){alert('Επίτρεψε τα popups');return;}
    w.document.write(`<!DOCTYPE html><html lang="el"><head><meta charset="UTF-8"><title>Αναπροσαρμογή</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&family=Google+Sans:wght@400;500&display=swap" rel="stylesheet">
    <style>body{font-family:'Roboto',sans-serif;max-width:700px;margin:40px auto;padding:40px;font-size:13px;line-height:1.8}h1{font-family:'Google+Sans',sans-serif;font-size:20px;color:#1a73e8}table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:10px;border:1px solid #e8eaed}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:60px}.sign{border-top:1px solid #e8eaed;padding-top:8px;font-size:11px}@media print{body{margin:20px}}</style></head><body>
    <h1>Ειδοποίηση Αναπροσαρμογής Μισθώματος</h1>
    <p>Ημερομηνία: ${today_str}</p>
    <p>Προς: <strong>${tenant.full_name}</strong>${tenant.afm?'<br>ΑΦΜ: '+tenant.afm:''}</p>
    <p>Βάσει ΤΔΕ <strong>${yr}</strong> (+${pct.toFixed(1)}%), το μίσθωμα αναπροσαρμόζεται:</p>
    <table><tr style="background:#f8f9fa"><td><strong>Τρέχον μίσθωμα</strong></td><td style="text-align:right">${fmtE(rent)}/μήνα</td></tr>
    <tr><td>ΤΔΕ ${yr}</td><td style="text-align:right">+${pct.toFixed(1)}%</td></tr>
    <tr style="background:#e6f4ea"><td><strong>Νέο μίσθωμα</strong></td><td style="text-align:right;color:#137333;font-weight:700">${fmtE(newRent)}/μήνα</td></tr></table>
    <div class="grid2"><div class="sign"><p><strong>Ο Εκμισθωτής</strong></p><p>________________</p></div>
    <div class="sign"><p><strong>Ο Μισθωτής</strong></p><p>${tenant.full_name}</p></div></div>
    <div style="margin-top:40px;font-size:10px;color:#9aa0a6;text-align:center">Property OS — Εκτίμηση, συμβουλευτείτε νομικό</div>
    </body></html>`);
    w.document.close();setTimeout(()=>w.print(),700);
  };

  return (
    <div>
      {(isExpired||isExpiring)&&(
        <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderLeft:`3px solid ${isExpired?'var(--negative)':'var(--warning)'}`,borderRadius:8,padding:'10px 16px',marginBottom:14,fontSize:12,color:isExpired?'var(--negative)':'var(--warning)',fontFamily:"'Google Sans',sans-serif",fontWeight:500}}>
          {isExpired?`Το μισθωτήριο έληξε στις ${fmtDate(leaseEnd)} — ανανέωσε άμεσα`:`Λήγει σε ${daysExp} μέρες (${fmtDate(leaseEnd)}) — προετοίμασε ανανέωση`}
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div style={s.card}>
          <div style={s.sec}><span style={s.dot()}/>Υπολογιστής ΤΔΕ</div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:10,textTransform:'uppercase' as const,color:'var(--text-secondary)',marginBottom:6}}>Τρέχον Ενοίκιο</div>
            <div style={{fontSize:26,fontWeight:700,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace",marginBottom:2}}>{fmtE(rent)}</div>
            <div style={{fontSize:11,color:'var(--text-tertiary)'}}>Λήξη: {fmtDate(leaseEnd)}</div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',marginBottom:8}}>Έτος Αναπροσαρμογής</div>
            <select value={yr} onChange={e=>setYr(e.target.value)} style={{width:'100%',height:40,background:'var(--bg-elevated)',border:'1px solid var(--border-default)',borderRadius:6,padding:'0 12px',color:'var(--text-primary)',fontSize:12,fontFamily:"Inter,sans-serif",outline:'none'}}>
              {Object.keys(TDE).sort((a,b)=>parseInt(b)-parseInt(a)).map(y=>(
                <option key={y} value={y}>{y} — ΤΔΕ: {TDE[parseInt(y)]>=0?'+':''}{TDE[parseInt(y)]}%</option>
              ))}
            </select>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <span style={{fontSize:12,color:'var(--text-primary)'}}>Προσαρμοσμένο ποσοστό</span>
            <Toggle on={useCustom} onChange={setUseCustom} size="sm"/>
          </div>
          {useCustom&&(
            <div style={{marginBottom:14}}>
              <input type="number" value={customPct} onChange={e=>setCustomPct(e.target.value)} placeholder="π.χ. 3.5" step="0.1"
                style={{width:'100%',height:40,background:'var(--bg-elevated)',border:'1px solid var(--accent)',borderRadius:6,padding:'0 12px',color:'var(--text-primary)',fontSize:14,fontFamily:"'Roboto Mono',monospace",outline:'none',boxSizing:'border-box' as const}}/>
            </div>
          )}
          <div style={{fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',marginBottom:8}}>Ιστορικό ΤΔΕ (ΕΛΣΤΑΤ)</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:4}}>
            {Object.entries(TDE).sort(([a],[b])=>parseInt(b)-parseInt(a)).slice(0,10).map(([year,rate])=>(
              <div key={year} onClick={()=>{setYr(year);setUseCustom(false);}}
                style={{background:parseInt(year)===parseInt(yr)?'var(--accent-dim)':'var(--bg-elevated)',border:`1px solid ${parseInt(year)===parseInt(yr)?'var(--accent)':'var(--border-subtle)'}`,borderRadius:6,padding:'5px 4px',textAlign:'center' as const,cursor:'pointer'}}>
                <div style={{fontSize:10,fontWeight:600,color:parseInt(year)===parseInt(yr)?'var(--accent)':'var(--text-primary)',fontFamily:"'Roboto Mono',monospace"}}>{rate>=0?'+':''}{rate}%</div>
                <div style={{fontSize:8,color:'var(--text-tertiary)'}}>{year}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          {rent>0&&(
            <>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
                <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:'14px 16px'}}>
                  <div style={{fontSize:10,color:'var(--text-secondary)',marginBottom:4}}>Τρέχον</div>
                  <div style={{fontSize:16,fontWeight:700,color:'var(--text-primary)',fontFamily:"'Roboto Mono',monospace"}}>{fmtE(rent)}</div>
                </div>
                <div style={{background:'var(--positive-dim)',border:'1px solid var(--positive)',borderRadius:10,padding:'14px 16px'}}>
                  <div style={{fontSize:10,color:'var(--text-secondary)',marginBottom:4}}>Νέο Ενοίκιο</div>
                  <div style={{fontSize:16,fontWeight:700,color:'var(--positive)',fontFamily:"'Roboto Mono',monospace"}}>{fmtE(newRent)}</div>
                </div>
              </div>
              <div style={s.card}>
                {[{label:`ΤΔΕ ${yr}`,value:`+${pct.toFixed(1)}%`,color:'var(--info)'},{label:'Αύξηση/μήνα',value:`+${fmtE(diff)}`,color:'var(--positive)'},{label:'Αύξηση/έτος',value:`+${fmtE(diff*12)}`,color:'var(--positive)'}].map((row,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}>
                    <span style={{fontSize:12,color:'var(--text-secondary)'}}>{row.label}</span>
                    <span style={{fontSize:13,fontWeight:600,color:row.color,fontFamily:"'Roboto Mono',monospace"}}>{row.value}</span>
                  </div>
                ))}
              </div>
              <button onClick={genLetter} style={{width:'100%',height:44,borderRadius:22,border:'none',background:'var(--accent)',color:'var(--accent-text)',cursor:'pointer',fontSize:12,fontFamily:"'Google Sans',sans-serif",fontWeight:600,letterSpacing:'0.04em',marginBottom:10}}>
                Εκτύπωση Ειδοποίησης Αναπροσαρμογής
              </button>
            </>
          )}
          <div style={s.card}>
            <div style={s.sec}><span style={s.dot()}/>Σύνδεσμοι AADE</div>
            {[
              {label:'Καταχώρηση Μισθωτηρίου',desc:'Εντός 30 ημερών',url:'https://www.aade.gr/polites/foroi/misthotiria',urgent:true},
              {label:'Ε2 Δήλωση Εισοδήματος',desc:'30 Ιουνίου κάθε χρόνο',url:'https://www.aade.gr',urgent:false},
            ].map((link,i)=>(
              <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
                style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',marginBottom:6,background:link.urgent?'var(--negative-dim)':'var(--bg-elevated)',border:`1px solid ${link.urgent?'var(--negative)':'var(--border-subtle)'}`,borderRadius:8,textDecoration:'none'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:link.urgent?'var(--negative)':'var(--text-primary)',fontFamily:"'Google Sans',sans-serif"}}>{link.label}</div>
                  <div style={{fontSize:10,color:'var(--text-tertiary)'}}>{link.desc}</div>
                </div>
                <span style={{fontSize:11,color:'var(--accent)'}}>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Communication View ──────────────────────────────────────────────────────────
function CommView({tenant,propertyId,userId}:{tenant:Tenant;propertyId:string;userId:string}) {
  const supabase=createClient();
  const [logs,setLogs]=useState<CommLog[]>([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({type:'call' as CommLog['type'],summary:'',date:new Date().toISOString().split('T')[0],outcome:''});
  const [saving,setSaving]=useState(false);
  const TYPE_ICONS:Record<string,string>={call:'📞',email:'📧',sms:'💬',meeting:'🤝',note:'📝'};
  const TYPE_LABELS:Record<string,string>={call:'Κλήση',email:'Email',sms:'SMS',meeting:'Συνάντηση',note:'Σημείωση'};

  useEffect(()=>{load();},[tenant.id]);
  const load=async()=>{
    setLoading(true);
    const{data}=await supabase.from('tenant_comm_log').select('*').eq('tenant_id',tenant.id).order('date',{ascending:false});
    setLogs(data||[]);setLoading(false);
  };
  const saveLog=async()=>{
    if(!form.summary.trim())return;setSaving(true);
    await supabase.from('tenant_comm_log').insert({tenant_id:tenant.id,property_id:propertyId,user_id:userId,type:form.type,summary:form.summary.trim(),date:form.date,outcome:form.outcome||null});
    setSaving(false);setShowAdd(false);setForm({type:'call',summary:'',date:new Date().toISOString().split('T')[0],outcome:''});load();
  };

  const d=daysLeft(tenant.lease_end);
  const reminders=[];
  if(d!==null){
    if(d<=30&&d>=0)reminders.push({label:'30 ημέρες: Ζήτα απόφαση ανανέωσης',urgent:true});
    else if(d<=60&&d>=31)reminders.push({label:'60 ημέρες: Ενημέρωσε για επικείμενη λήξη',urgent:false});
    else if(d<=90&&d>=61)reminders.push({label:'90 ημέρες: Ξεκίνα συζήτηση ανανέωσης',urgent:false});
  }

  const inputStyle:React.CSSProperties={width:'100%',height:36,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:6,padding:'0 12px',color:'var(--text-primary)',fontSize:12,fontFamily:"Inter,sans-serif",outline:'none',boxSizing:'border-box'};

  return (
    <div>
      <div style={{...s.card,marginBottom:16}}>
        <div style={s.sec}><span style={s.dot()}/>Γρήγορη Επικοινωνία</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:12}}>
          {tenant.phone&&<a href={`tel:${tenant.phone}`} style={{display:'flex',alignItems:'center',gap:8,padding:'12px 16px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:10,textDecoration:'none',color:'var(--text-primary)'}}><span style={{fontSize:18}}>📞</span><div><div style={{fontSize:12,fontWeight:600,fontFamily:"'Google Sans',sans-serif"}}>Κλήση</div><div style={{fontSize:10,color:'var(--text-secondary)'}}>{tenant.phone}</div></div></a>}
          {tenant.email&&<a href={`mailto:${tenant.email}`} style={{display:'flex',alignItems:'center',gap:8,padding:'12px 16px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:10,textDecoration:'none',color:'var(--text-primary)'}}><span style={{fontSize:18}}>📧</span><div><div style={{fontSize:12,fontWeight:600,fontFamily:"'Google Sans',sans-serif"}}>Email</div><div style={{fontSize:10,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:120}}>{tenant.email}</div></div></a>}
          {tenant.phone&&<a href={`sms:${tenant.phone}`} style={{display:'flex',alignItems:'center',gap:8,padding:'12px 16px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:10,textDecoration:'none',color:'var(--text-primary)'}}><span style={{fontSize:18}}>💬</span><div><div style={{fontSize:12,fontWeight:600,fontFamily:"'Google Sans',sans-serif"}}>SMS</div><div style={{fontSize:10,color:'var(--text-secondary)'}}>{tenant.phone}</div></div></a>}
        </div>
        {reminders.map((r,i)=>(
          <div key={i} style={{background:r.urgent?'var(--negative-dim)':'var(--warning-dim)',border:`1px solid ${r.urgent?'var(--negative)':'var(--warning)'}`,borderRadius:8,padding:'8px 14px',marginBottom:6,fontSize:12,color:r.urgent?'var(--negative)':'var(--warning)',fontFamily:"'Google Sans',sans-serif",fontWeight:500}}>
            🔔 {r.label}
          </div>
        ))}
      </div>
      <div style={s.card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={s.sec}><span style={s.dot()}/>Ιστορικό Επικοινωνίας</div>
          <button style={s.btnSm} onClick={()=>setShowAdd(v=>!v)}>{showAdd?'✕ Κλείσιμο':'+ Καταχώρηση'}</button>
        </div>
        {showAdd&&(
          <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:16,marginBottom:16}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:10}}>
              <div>
                <label style={{fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:6}}>Τύπος</label>
                <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value as any}))} style={{...inputStyle}}>
                  {Object.entries(TYPE_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:6}}>Ημερομηνία</label>
                <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inputStyle}/>
              </div>
              <div>
                <label style={{fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:6}}>Αποτέλεσμα</label>
                <input type="text" value={form.outcome} onChange={e=>setForm(f=>({...f,outcome:e.target.value}))} placeholder="π.χ. Θετικό..." style={inputStyle}/>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <label style={{fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:6}}>Σύνοψη *</label>
              <textarea value={form.summary} onChange={e=>setForm(f=>({...f,summary:e.target.value}))} placeholder="Περιγραφή επικοινωνίας..." rows={2}
                style={{width:'100%',background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:6,padding:'10px 12px',color:'var(--text-primary)',fontSize:12,fontFamily:"Inter,sans-serif",outline:'none',boxSizing:'border-box' as const,resize:'vertical' as const}}/>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button style={s.btnGhost} onClick={()=>setShowAdd(false)}>Ακύρωση</button>
              <button style={s.btnGold} onClick={saveLog} disabled={saving}>{saving?'...':'Αποθήκευση'}</button>
            </div>
          </div>
        )}
        {loading&&<div style={{textAlign:'center',padding:32,color:'var(--text-tertiary)',fontSize:12}}>Φόρτωση...</div>}
        {!loading&&logs.length===0&&<div style={{textAlign:'center',padding:32,color:'var(--text-tertiary)',fontSize:12}}>Δεν υπάρχουν καταχωρήσεις</div>}
        {!loading&&logs.map(log=>(
          <div key={log.id} style={{display:'flex',gap:12,alignItems:'flex-start',padding:'12px 0',borderBottom:'1px solid var(--border-subtle)'}}>
            <div style={{width:36,height:36,borderRadius:18,background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:16}}>
              {TYPE_ICONS[log.type]}
            </div>
            <div style={{flex:1}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <span style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',fontFamily:"'Google Sans',sans-serif"}}>{TYPE_LABELS[log.type]}</span>
                <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{new Date(log.date).toLocaleDateString('el-GR')}</span>
                {log.outcome&&<span style={{fontSize:10,color:'var(--accent)',background:'var(--accent-dim)',padding:'1px 6px',borderRadius:4}}>{log.outcome}</span>}
              </div>
              <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.5}}>{log.summary}</div>
            </div>
            <button style={s.btnDng} onClick={async()=>{if(!confirm('Διαγραφή;'))return;await supabase.from('tenant_comm_log').delete().eq('id',log.id);load();}}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Market View ───────────────────────────────────────────────────────────────────
function MarketView({tenant,propertyId,userId}:{tenant:Tenant;propertyId:string;userId:string}) {
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
  const inputStyle:React.CSSProperties={width:'100%',height:36,background:'var(--bg-surface)',border:'1px solid var(--border-default)',borderRadius:6,padding:'0 12px',color:'var(--text-primary)',fontSize:12,fontFamily:"Inter,sans-serif",outline:'none',boxSizing:'border-box'};

  return (
    <div>
      {comparables.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
          {[
            {label:'Τρέχον Ενοίκιο',value:`${rent.toLocaleString('el-GR')} €`,color:'var(--accent)'},
            {label:'Μ.Ο. Αγοράς',value:`${Math.round(avgMarket).toLocaleString('el-GR')} €`,color:'var(--text-primary)'},
            {label:rentDiff>0?'Πάνω από αγορά':'Κάτω από αγορά',value:`${rentDiff>0?'+':''}${Math.round(rentDiff).toLocaleString('el-GR')} € (${rentDiffPct.toFixed(1)}%)`,color:rentDiff>0?'var(--positive)':rentDiff<0?'var(--warning)':'var(--text-secondary)'},
          ].map((k,i)=>(
            <div key={i} style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:'14px 16px',textAlign:'center' as const}}>
              <div style={{fontSize:20,fontWeight:700,color:k.color,fontFamily:"'Roboto Mono',monospace",marginBottom:4}}>{k.value}</div>
              <div style={{fontSize:10,color:'var(--text-secondary)',textTransform:'uppercase' as const,letterSpacing:'0.5px'}}>{k.label}</div>
            </div>
          ))}
        </div>
      )}
      <div style={s.card}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={s.sec}><span style={s.dot()}/>Συγκρίσιμα Ενοίκια Αγοράς</div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <a href="https://www.spitogatos.gr" target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'var(--accent)',fontFamily:"'Google Sans',sans-serif",fontWeight:500,textDecoration:'none'}}>Spitogatos →</a>
            <a href="https://www.xe.gr" target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:'var(--accent)',fontFamily:"'Google Sans',sans-serif",fontWeight:500,textDecoration:'none'}}>XE.gr →</a>
            <button style={s.btnSm} onClick={()=>setShowAdd(v=>!v)}>+ Προσθήκη</button>
          </div>
        </div>
        {showAdd&&(
          <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:10,padding:16,marginBottom:16}}>
            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:10,marginBottom:10}}>
              {[['Διεύθυνση','address','π.χ. Ερμού 12, Αθήνα','text'],['Ενοίκιο (€)','rent','750','number'],['τ.μ.','sqm','50','number']].map(([lbl,key,ph,type])=>(
                <div key={key as string}>
                  <label style={{fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:6}}>{lbl as string}</label>
                  <input type={type as string} value={(form as any)[key as string]} onChange={e=>setForm(f=>({...f,[key as string]:e.target.value}))} placeholder={ph as string} style={inputStyle}/>
                </div>
              ))}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 2fr',gap:10,marginBottom:10}}>
              <div>
                <label style={{fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:6}}>Πηγή</label>
                <select value={form.source} onChange={e=>setForm(f=>({...f,source:e.target.value}))} style={inputStyle}>
                  {['Spitogatos','XE.gr','Airbnb','Ιδιώτης','Μεσίτης','Άλλο'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:9,letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:6}}>Link αγγελίας</label>
                <input type="url" value={form.link} onChange={e=>setForm(f=>({...f,link:e.target.value}))} placeholder="https://..." style={inputStyle}/>
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button style={s.btnGhost} onClick={()=>setShowAdd(false)}>Ακύρωση</button>
              <button style={s.btnGold} onClick={addComp} disabled={adding}>{adding?'...':'Προσθήκη'}</button>
            </div>
          </div>
        )}
        {loading&&<div style={{textAlign:'center',padding:32,color:'var(--text-tertiary)',fontSize:12}}>Φόρτωση...</div>}
        {!loading&&comparables.length===0&&(
          <div style={{textAlign:'center',padding:40}}>
            <div style={{fontSize:32,marginBottom:12,opacity:0.2}}>🏠</div>
            <div style={{fontSize:13,color:'var(--text-secondary)',fontFamily:"'Google Sans',sans-serif",marginBottom:6}}>Δεν υπάρχουν συγκρίσιμα</div>
            <div style={{fontSize:11,color:'var(--text-tertiary)'}}>Πρόσθεσε ενοίκια από Spitogatos ή XE.gr για σύγκριση</div>
          </div>
        )}
        {!loading&&comparables.length>0&&(
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>{['Διεύθυνση','τ.μ.','Ενοίκιο','€/τ.μ.','Πηγή','vs τρέχον',''].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {comparables.map((c:any)=>{
                const perSqm=c.sqm&&c.sqm>0?c.rent/c.sqm:null;
                const diff=c.rent-rent;
                return (
                  <tr key={c.id}>
                    <td style={s.td}>{c.address}</td>
                    <td style={s.tdM}>{c.sqm?`${c.sqm} τ.μ.`:'—'}</td>
                    <td style={{...s.td,fontWeight:600,color:'var(--accent)',fontFamily:"'Roboto Mono',monospace"}}>{c.rent.toLocaleString('el-GR')} €</td>
                    <td style={s.tdM}>{perSqm?`${perSqm.toFixed(0)} €`:'—'}</td>
                    <td style={s.tdM}>{c.link?<a href={c.link} target="_blank" rel="noopener noreferrer" style={{color:'var(--accent)',textDecoration:'none'}}>{c.source}</a>:c.source}</td>
                    <td style={{...s.td,textAlign:'right' as const}}><span style={{fontSize:11,fontWeight:600,color:diff>0?'var(--negative)':diff<0?'var(--positive)':'var(--text-secondary)',fontFamily:"'Roboto Mono',monospace"}}>{diff>0?'+':''}{Math.round(diff)} €</span></td>
                    <td style={s.td}><button style={s.btnDng} onClick={async()=>{if(!confirm('Διαγραφή;'))return;await supabase.from('rent_comparables').delete().eq('id',c.id);load();}}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Blank form ─────────────────────────────────────────────────────────────────
const blank=()=>({
  full_name:'',email:'',phone:'',phone_work:'',nationality:'',profession:'',employer:'',afm:'',
  id_doc_type:'' as IdDocType|'',id_doc_number:'',iban:'',notes:'',
  lease_type:'annual' as LeaseType,lease_start:'',lease_end:'',custom_lease_days:365,
  monthly_rent:'',payment_frequency:'monthly' as PaymentFreq,
  deposit_amount:'',deposit_invested:false,deposit_returned:false,deposit_return_date:'',
  deposit_invest_rate:'',deposit_invest_type:'',deposit_invest_term:'',
  all_inclusive:false,kwh_limit:'',kwh_price:'',
  electricity_provider:'',electricity_tariff:'',electricity_monthly_limit:'',
  water_monthly_limit:'',internet_provider:'',internet_plan:'',internet_cost:'',
  e_payment:true,streaming:null as StreamingSvc[]|null,cleaning:null as CleaningCfg|null,extra_perks:'',
  welcome_basket:false,welcome_basket_amount:'',welcome_basket_contents:'',
  parking_included:false,parking_extra:false,parking_extra_price:'',
  parking_type:'',parking_has_electricity:false,parking_notes:'',
  ac_service_by:'owner' as ServiceBy,ac_service_frequency:'annual',
  solar_service_by:'owner' as ServiceBy,solar_service_frequency:'annual',
  heat_pump_service_by:'owner' as ServiceBy,heat_pump_service_frequency:'annual',
  solar_panels_service_by:'owner' as ServiceBy,solar_panels_service_frequency:'annual',
  pest_control_by:'owner' as ServiceBy,pest_control_frequency:'',annual_services_notes:'',
  prepay_option:false,prepay_months:3,prepay_discount_pct:'',
  prepay_invested:false,prepay_invest_rate:'',prepay_invest_type:'',prepay_invest_term:'',
  lease_doc_external_url:'',
});

// ─── Main Export ─────────────────────────────────────────────────────────────────
export default function TabTenant({propertyId,userId}:TabTenantProps) {
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
    if(form.lease_start&&form.lease_type&&form.lease_type!=='custom'){
      sf('lease_end',calcEnd(form.lease_start,form.lease_type as LeaseType,form.custom_lease_days));
    }
  },[form.lease_start,form.lease_type]);

  const fetch_=useCallback(async()=>{
    setLoading(true);
    const{data:td}=await supabase.from('tenants').select('*').eq('property_id',propertyId).eq('user_id',userId).order('created_at',{ascending:false}).limit(1);
    const t=td?.[0]||null;
    setTenant(t);
    if(t){
      const[{data:pd},{data:ed}]=await Promise.all([
        supabase.from('rent_payments').select('*').eq('property_id',propertyId).eq('user_id',userId).order('period_year',{ascending:false}).order('period_month',{ascending:false}),
        supabase.from('expenses').select('*').eq('property_id',propertyId).eq('user_id',userId).eq('category','tenant_extra').order('created_at',{ascending:false}),
      ]);
      setPayments(pd||[]);setExtras(ed||[]);
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
    const{data:urlData}=await supabase.storage.from('lease-documents').createSignedUrl(path,60*60*24*365);
    await supabase.from('tenants').update({lease_doc_url:urlData?.signedUrl||null,lease_doc_name:file.name}).eq('id',tenant.id);
    setUploading(false);notify('PDF ανέβηκε');fetch_();
  };

  const deletePDF=async()=>{
    if(!tenant?.lease_doc_name)return;
    await supabase.storage.from('lease-documents').remove([`${userId}/${tenant.id}/${tenant.lease_doc_name}`]);
    await supabase.from('tenants').update({lease_doc_url:null,lease_doc_name:null}).eq('id',tenant.id);
    notify('PDF διαγράφηκε');fetch_();
  };

  const savePay=async()=>{
    if(!tenant||!payF.amount){setError('Συμπλήρωσε ποσό');return;}setSaving(true);
    await supabase.from('rent_payments').insert({tenant_id:tenant.id,property_id:propertyId,user_id:userId,period_month:payF.period_month,period_year:payF.period_year,amount:Math.max(0,parseFloat(payF.amount)),paid:payF.paid,paid_date:payF.paid?payF.paid_date:null,days_late:payF.days_late?parseInt(payF.days_late):null,notes:payF.notes||null});
    setSaving(false);setAddPay(false);
    setPayF({period_month:new Date().getMonth()+1,period_year:new Date().getFullYear(),amount:'',paid:true,paid_date:new Date().toISOString().split('T')[0],days_late:'',notes:''});
    notify('Πληρωμή καταχωρήθηκε');fetch_();
  };

  const saveExtra=async()=>{
    if(!tenant||!exF.description||!exF.amount){setError('Συμπλήρωσε περιγραφή και ποσό');return;}setSaving(true);
    await supabase.from('expenses').insert({property_id:propertyId,user_id:userId,description:exF.description,amount:Math.max(0,parseFloat(exF.amount)),category:'tenant_extra',date:exF.date,paid:exF.paid,notes:exF.notes||null});
    setSaving(false);setAddExtra(false);
    setExF({description:'',amount:'',category:'Άλλο',date:new Date().toISOString().split('T')[0],paid:false,notes:''});
    notify('Χρέωση καταχωρήθηκε');fetch_();
  };

  if(loading)return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'400px',color:'var(--text-tertiary)',fontSize:'12px',letterSpacing:'0.14em'}}>ΦΟΡΤΩΣΗ...</div>;

  const FTABS:[string,typeof formTab][]=[['Στοιχεία','profile'],['Μίσθωση','lease'],['Υπηρεσίες','services'],['Parking','parking'],['Έγγραφα','docs']];
  const VTABS:{id:typeof viewTab;label:string;badge?:number}[]=[
    {id:'dashboard',label:'Dashboard'},
    {id:'profile',label:'Προφίλ'},
    {id:'lease',label:'Μίσθωση'},
    {id:'services',label:'Υπηρεσίες'},
    {id:'rentadjust',label:'ΤΔΕ'},
    {id:'payments',label:'Πληρωμές',badge:payments.filter(p=>!p.paid).length||undefined},
    {id:'extras',label:'Έκτακτα',badge:extras.filter((e:any)=>!e.paid).length||undefined},
    {id:'comm',label:'Επικοινωνία'},
    {id:'market',label:'Αγορά'},
    {id:'docs',label:'Συμβόλαιο'},
  ];

  return (
    <div style={{fontFamily:'Inter,sans-serif',color:'var(--text-primary)'}}>
      {ok&&<div style={{background:'var(--positive-dim)',border:'1px solid var(--positive)',borderRadius:'8px',padding:'10px 16px',marginBottom:'14px',color:'var(--positive)',fontSize:'12px'}}>✓ {ok}</div>}
      {error&&<div style={{background:'var(--negative-dim)',border:'1px solid var(--negative)',borderRadius:'8px',padding:'10px 16px',marginBottom:'14px',color:'var(--negative)',fontSize:'12px',display:'flex',justifyContent:'space-between'}}><span>✕ {error}</span><button onClick={()=>setError(null)} style={{background:'none',border:'none',color:'var(--negative)',cursor:'pointer',fontSize:'16px'}}>×</button></div>}

      {!tenant&&!isForm&&(
        <div style={{...s.card,textAlign:'center',padding:'80px 32px'}}>
          <div style={{fontSize:'40px',opacity:.1,marginBottom:'18px'}}>◫</div>
          <div style={{fontSize:'13px',color:'var(--text-secondary)',marginBottom:'8px'}}>Κανένας ενοικιαστής</div>
          <div style={{fontSize:'12px',color:'var(--text-tertiary)',marginBottom:'28px'}}>Προσθέστε ενοικιαστή για πλήρη παρακολούθηση μίσθωσης</div>
          <button style={s.btnGold} onClick={openAdd}>+ Νέος Ενοικιαστής</button>
        </div>
      )}

      {isForm&&(
        <div style={s.cardGold}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'18px'}}>
            <div style={s.sec}><span style={s.dot()}/>{editMode?'Επεξεργασία Ενοικιαστή':'Νέος Ενοικιαστής'}</div>
            <button style={s.btnGhost} onClick={()=>{setIsForm(false);setEditMode(false);}}>Ακύρωση</button>
          </div>
          <div style={{display:'flex',borderBottom:'1px solid var(--border-subtle)',marginBottom:'22px',gap:'2px'}}>
            {FTABS.map(([l,t])=><button key={t} onClick={()=>setFormTab(t)} style={s.tabBtn(formTab===t)}>{l}</button>)}
          </div>

          {formTab==='profile'&&(
            <>
              <div style={s.sec}><span style={s.dot()}/>Προσωπικά Στοιχεία</div>
              <div style={{...s.g3,marginBottom:'14px'}}>
                <TextInput label="Ονοματεπώνυμο *" value={form.full_name} onChange={v=>sf('full_name',v)}/>
                <TextInput label="Email" value={form.email} onChange={v=>sf('email',v)} type="email"/>
                <TextInput label="Κινητό" value={form.phone} onChange={v=>sf('phone',v)}/>
              </div>
              <div style={{...s.g3,marginBottom:'14px'}}>
                <TextInput label="Τηλ. Εργασίας" value={form.phone_work} onChange={v=>sf('phone_work',v)}/>
                <TextInput label="Εθνικότητα" value={form.nationality} onChange={v=>sf('nationality',v)} placeholder="π.χ. Ελληνική"/>
                <TextInput label="Επάγγελμα" value={form.profession} onChange={v=>sf('profession',v)} placeholder="π.χ. Μηχανικός"/>
              </div>
              <div style={{...s.g3,marginBottom:'14px'}}>
                <TextInput label="Εργοδότης" value={form.employer} onChange={v=>sf('employer',v)} placeholder="π.χ. ΕΛΤΑ Α.Ε."/>
                <TextInput label="ΑΦΜ" value={form.afm} onChange={v=>sf('afm',v)}/>
                <TextInput label="IBAN" value={form.iban} onChange={v=>sf('iban',v)} placeholder="GR00 0000..."/>
              </div>
              <div style={{...s.g2,marginBottom:'14px'}}>
                <SelectField label="Τύπος Εγγράφου" value={form.id_doc_type} onChange={v=>sf('id_doc_type',v)} options={ID_DOCS.map(d=>({value:d,label:d}))} placeholder="Επιλογή..."/>
                <TextInput label="Αριθμός Εγγράφου" value={form.id_doc_number} onChange={v=>sf('id_doc_number',v)}/>
              </div>
              <div style={s.divider}/>
              <div style={s.sec}><span style={s.dot()}/>Εγγύηση</div>
              <div style={{...s.g3,marginBottom:'14px'}}>
                <NumberInput label="Ποσό Εγγύησης" value={form.deposit_amount} onChange={v=>sf('deposit_amount',v)} suffix="€"/>
                <div><label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Επενδύεται</label><Toggle on={form.deposit_invested} onChange={v=>sf('deposit_invested',v)} label="Ναι" labelOff="Όχι"/></div>
                <div><label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Επεστράφη</label><Toggle on={form.deposit_returned} onChange={v=>sf('deposit_returned',v)} label="Ναι" labelOff="Όχι"/></div>
              </div>
              {form.deposit_returned&&<div style={{marginBottom:'14px'}}><DateField label="Ημ/νία Επιστροφής" value={form.deposit_return_date} onChange={v=>sf('deposit_return_date',v)}/></div>}
              {form.deposit_invested&&(
                <div style={{...s.g3,marginBottom:'14px'}}>
                  <NumberInput label="Απόδοση %/έτος" value={form.deposit_invest_rate} onChange={v=>sf('deposit_invest_rate',v)} suffix="%" step={0.1} max={100}/>
                  <SelectField label="Τύπος Επένδυσης" value={form.deposit_invest_type} onChange={v=>sf('deposit_invest_type',v)} options={['Fixed Term','Flexible','ETF','P2P Lending','Άλλο'].map(v=>({value:v,label:v}))} placeholder="Επιλογή..."/>
                  <TextInput label="Πού επενδύεται" value={form.deposit_invest_term} onChange={v=>sf('deposit_invest_term',v)} placeholder="π.χ. Scramble, VWCE..."/>
                </div>
              )}
              <InvestmentCalc title="Αναλυτής Εγγύησης" amount={form.deposit_amount?Math.max(0,parseFloat(form.deposit_amount)):null}/>
              <div style={s.divider}/>
              <Textarea label="Σημειώσεις" value={form.notes} onChange={v=>sf('notes',v)}/>
            </>
          )}

          {formTab==='lease'&&(
            <>
              <div style={s.sec}><span style={s.dot()}/>Διάρκεια Μίσθωσης</div>
              <div style={{display:'flex',gap:'6px',marginBottom:'16px',flexWrap:'wrap' as const}}>
                {(Object.keys(LEASE_LABELS) as LeaseType[]).map(lt=>(
                  <button key={lt} onClick={()=>sf('lease_type',lt)} style={{padding:'8px 14px',fontSize:'11px',fontFamily:'Inter,sans-serif',cursor:'pointer',borderRadius:'8px',border:`1px solid ${form.lease_type===lt?'var(--accent)':'var(--border-default)'}`,background:form.lease_type===lt?'var(--accent-dim)':'transparent',color:form.lease_type===lt?'var(--accent)':'var(--text-secondary)',transition:'all 0.15s',fontWeight:form.lease_type===lt?600:400}}>{LEASE_LABELS[lt]}</button>
                ))}
              </div>
              <div style={{...s.g3,marginBottom:'14px'}}>
                <DateField label="Έναρξη Μίσθωσης" value={form.lease_start} onChange={v=>sf('lease_start',v)}/>
                <DateField label="Λήξη Μίσθωσης" value={form.lease_end} onChange={v=>sf('lease_end',v)}/>
                {form.lease_type==='custom'&&<NumberInput label="Ημέρες" value={String(form.custom_lease_days)} onChange={v=>sf('custom_lease_days',parseInt(v)||0)} suffix="ημ"/>}
              </div>
              <div style={s.divider}/>
              <div style={s.sec}><span style={s.dot()}/>Ενοίκιο & Πληρωμή</div>
              <div style={{...s.g3,marginBottom:'14px'}}>
                <NumberInput label="Μηνιαίο Ενοίκιο" value={form.monthly_rent} onChange={v=>sf('monthly_rent',v)} suffix="€"/>
                <SelectField label="Συχνότητα" value={form.payment_frequency} onChange={v=>sf('payment_frequency',v)} options={[{value:'monthly',label:'Μηνιαία'},{value:'bimonthly',label:'Διμηνιαία'},{value:'quarterly',label:'Τριμηνιαία'}]}/>
                <div><label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Ηλεκτρονική Πληρωμή</label><Toggle on={form.e_payment} onChange={v=>sf('e_payment',v)} label="Ενεργή" labelOff="Ανενεργή"/></div>
              </div>
              <div style={s.divider}/>
              <div style={{...s.sec}}><span style={s.dot()}/>Προπληρωμή<div style={{marginLeft:'auto'}}><Toggle on={form.prepay_option} onChange={v=>sf('prepay_option',v)} label="Ενεργή" labelOff="Ανενεργή"/></div></div>
              {form.prepay_option&&<PrepayCalc monthlyRent={form.monthly_rent?Math.max(0,parseFloat(form.monthly_rent)):null}/>}
              <div style={s.divider}/>
              <div style={{...s.sec}}><span style={s.dot()}/>All-Inclusive<div style={{marginLeft:'auto'}}><Toggle on={form.all_inclusive} onChange={v=>sf('all_inclusive',v)} label="Ναι" labelOff="Όχι"/></div></div>
              {form.all_inclusive&&(
                <>
                  <div style={{...s.g3,marginBottom:'14px'}}>
                    <TextInput label="Πάροχος Ρεύματος" value={form.electricity_provider} onChange={v=>sf('electricity_provider',v)} placeholder="π.χ. ΔΕΗ, Heron"/>
                    <TextInput label="Είδος Τιμολογίου" value={form.electricity_tariff} onChange={v=>sf('electricity_tariff',v)} placeholder="π.χ. G1"/>
                    <NumberInput label="Τιμή kWh" value={form.kwh_price} onChange={v=>sf('kwh_price',v)} suffix="€" step={0.001}/>
                  </div>
                  <div style={{...s.g3,marginBottom:'14px'}}>
                    <NumberInput label="Όριο kWh/μήνα" value={form.kwh_limit} onChange={v=>sf('kwh_limit',v)} suffix="kWh"/>
                    <NumberInput label="Όριο νερού/μήνα" value={form.water_monthly_limit} onChange={v=>sf('water_monthly_limit',v)} suffix="m³"/>
                    <NumberInput label="Internet/μήνα" value={form.internet_cost} onChange={v=>sf('internet_cost',v)} suffix="€"/>
                  </div>
                  <div style={{...s.g2,marginBottom:'14px'}}>
                    <TextInput label="Πάροχος Internet" value={form.internet_provider} onChange={v=>sf('internet_provider',v)} placeholder="π.χ. Cosmote"/>
                    <TextInput label="Πρόγραμμα" value={form.internet_plan} onChange={v=>sf('internet_plan',v)} placeholder="π.χ. 300Mbps Fiber"/>
                  </div>
                </>
              )}
            </>
          )}

          {formTab==='services'&&(
            <>
              <div style={s.sec}><span style={s.dot()}/>Streaming & Συνδρομές</div>
              <StreamingConfig value={form.streaming} onChange={v=>sf('streaming',v)}/>
              <div style={s.divider}/>
              <div style={s.sec}><span style={s.dot()}/>Καθαρισμός</div>
              <CleaningConfig value={form.cleaning} onChange={v=>sf('cleaning',v)}/>
              <div style={s.divider}/>
              <div style={s.sec}><span style={s.dot()}/>Ετήσιες Συντηρήσεις</div>
              {[{label:'Κλιματιστικό',byKey:'ac_service_by',freqKey:'ac_service_frequency'},{label:'Ηλιακός',byKey:'solar_service_by',freqKey:'solar_service_frequency'},{label:'Αντλία Θερμ.',byKey:'heat_pump_service_by',freqKey:'heat_pump_service_frequency'},{label:'Φωτοβολταϊκά',byKey:'solar_panels_service_by',freqKey:'solar_panels_service_frequency'},{label:'Απεντόμωση',byKey:'pest_control_by',freqKey:'pest_control_frequency'}].map(({label,byKey,freqKey})=>(
                <div key={byKey} style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:'12px',marginBottom:'10px',padding:'12px',background:'var(--bg-elevated)',borderRadius:'10px',border:'1px solid var(--border-subtle)'}}>
                  <ServiceBySelect label={label} value={(form as any)[byKey] as ServiceBy} onChange={v=>sf(byKey,v)}/>
                  <SelectField label="Συχνότητα" value={(form as any)[freqKey]} onChange={v=>sf(freqKey,v)} options={FREQ_OPTIONS} placeholder="Χωρίς"/>
                </div>
              ))}
              <Textarea label="Σημειώσεις Συντηρήσεων" value={form.annual_services_notes} onChange={v=>sf('annual_services_notes',v)}/>
              <div style={s.divider}/>
              <Textarea label="Extra Perks" value={form.extra_perks} onChange={v=>sf('extra_perks',v)} placeholder="π.χ. Αποθήκη, κήπος..."/>
            </>
          )}

          {formTab==='parking'&&(
            <>
              <div style={s.sec}><span style={s.dot()}/>Χώρος Στάθμευσης</div>
              <div style={{...s.g3,marginBottom:'14px'}}>
                <div><label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Περιλαμβάνεται</label><Toggle on={form.parking_included} onChange={v=>sf('parking_included',v)} label="Ναι" labelOff="Όχι"/></div>
                <div><label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Νοικιάζεται Extra</label><Toggle on={form.parking_extra} onChange={v=>sf('parking_extra',v)} label="Ναι" labelOff="Όχι"/></div>
                {form.parking_extra&&<NumberInput label="Τιμή Parking" value={form.parking_extra_price} onChange={v=>sf('parking_extra_price',v)} suffix="€"/>}
              </div>
              <div style={{...s.g3,marginBottom:'14px'}}>
                <SelectField label="Τύπος" value={form.parking_type} onChange={v=>sf('parking_type',v)} options={[{value:'outdoor',label:'Υπαίθριο'},{value:'indoor',label:'Κλειστό'},{value:'garage',label:'Γκαράζ'},{value:'street',label:'Δρόμος'}]} placeholder="Επιλογή..."/>
                <div><label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Ρεύμα (EV)</label><Toggle on={form.parking_has_electricity} onChange={v=>sf('parking_has_electricity',v)} label="Ναι" labelOff="Όχι"/></div>
              </div>
              <Textarea label="Σημειώσεις Parking" value={form.parking_notes} onChange={v=>sf('parking_notes',v)}/>
            </>
          )}

          {formTab==='docs'&&(
            <>
              <div style={s.sec}><span style={s.dot()}/>Ενοικιαστήριο Συμβόλαιο</div>
              <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'10px',padding:'16px',marginBottom:'14px'}}>
                <TextInput label="Εξωτερικό Link" value={form.lease_doc_external_url} onChange={v=>sf('lease_doc_external_url',v)} placeholder="https://drive.google.com/..."/>
                <div style={{marginTop:'10px',fontSize:'11px',color:'var(--text-tertiary)'}}>Το PDF upload είναι διαθέσιμο αφού αποθηκευτεί ο ενοικιαστής.</div>
              </div>
            </>
          )}

          <div style={{display:'flex',justifyContent:'space-between',marginTop:'22px'}}>
            <div style={{display:'flex',gap:'8px'}}>
              {formTab!=='profile'&&<button style={s.btnGhost} onClick={()=>setFormTab(FTABS[FTABS.findIndex(([,t])=>t===formTab)-1][1] as typeof formTab)}>‹ Πίσω</button>}
              {formTab==='profile'&&<button style={s.btnGhost} onClick={()=>{setIsForm(false);setEditMode(false);}}>Ακύρωση</button>}
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              {formTab!=='docs'&&<button style={s.btnGold} onClick={()=>setFormTab(FTABS[FTABS.findIndex(([,t])=>t===formTab)+1][1] as typeof formTab)}>Επόμενο ›</button>}
              {formTab==='docs'&&<button style={s.btnGold} onClick={save} disabled={saving}>{saving?'Αποθήκευση...':editMode?'Αποθήκευση':'Προσθήκη Ενοικιαστή'}</button>}
            </div>
          </div>
        </div>
      )}

      {tenant&&!isForm&&(
        <>
          {/* Header */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'16px'}}>
            <div>
              <div style={{fontSize:'22px',fontFamily:"'Google Sans',sans-serif",fontWeight:400,color:'var(--text-primary)',marginBottom:'4px'}}>{tenant.full_name}</div>
              <div style={{display:'flex',gap:'10px',flexWrap:'wrap' as const,alignItems:'center'}}>
                {tenant.profession&&<span style={{fontSize:12,color:'var(--text-secondary)',background:'var(--bg-elevated)',padding:'2px 10px',borderRadius:12,border:'1px solid var(--border-subtle)'}}>{tenant.profession}</span>}
                {tenant.employer&&<span style={{fontSize:12,color:'var(--text-tertiary)'}}>· {tenant.employer}</span>}
                {tenant.nationality&&<span style={{fontSize:12,color:'var(--text-tertiary)'}}>{tenant.nationality}</span>}
                {tenant.email&&<span style={{fontSize:12,color:'var(--text-secondary)'}}>{tenant.email}</span>}
                {tenant.phone&&<span style={{fontSize:12,color:'var(--text-secondary)'}}>· {tenant.phone}</span>}
                {tenant.afm&&<span style={{fontSize:11,color:'var(--text-tertiary)'}}>· ΑΦΜ {tenant.afm}</span>}
              </div>
            </div>
            <div style={{display:'flex',gap:'8px'}}>
              <button style={s.btnGhost} onClick={openEdit}>Επεξεργασία</button>
              <button style={s.btnDng} onClick={async()=>{if(!confirm(`Διαγραφή "${tenant.full_name}";`))return;await supabase.from('rent_payments').delete().eq('property_id',propertyId).eq('user_id',userId);await supabase.from('tenants').delete().eq('id',tenant.id);setTenant(null);setPayments([]);setExtras([]);}}>Διαγραφή</button>
            </div>
          </div>

          {/* View Tabs */}
          <div style={{display:'flex',borderBottom:'1px solid var(--border-subtle)',marginBottom:'20px',overflowX:'auto' as const}}>
            {VTABS.map(t=>(
              <button key={t.id} onClick={()=>setViewTab(t.id)} style={{...s.tabBtn(viewTab===t.id),display:'flex',alignItems:'center',gap:4,whiteSpace:'nowrap' as const}}>
                {t.label}
                {t.badge&&t.badge>0&&<span style={{width:16,height:16,borderRadius:8,background:'var(--negative)',color:'#fff',fontSize:9,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>{t.badge}</span>}
              </button>
            ))}
          </div>

          {viewTab==='dashboard'&&<DashboardView tenant={tenant} payments={payments}/>}

          {viewTab==='profile'&&(
            <div style={s.g2}>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Στοιχεία</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                  <tbody>
                    {([['Email',tenant.email],['Κινητό',tenant.phone],['Τηλ. Εργασίας',tenant.phone_work],['Εθνικότητα',tenant.nationality],['Επάγγελμα',tenant.profession],['Εργοδότης',tenant.employer],['ΑΦΜ',tenant.afm],['Έγγραφο',tenant.id_doc_type],['Αρ. Εγγράφου',tenant.id_doc_number],['IBAN',tenant.iban]] as [string,string|null][]).filter(([,v])=>v).map(([k,v],i)=>(
                      <tr key={i}><td style={s.tdM}>{k}</td><td style={s.td}>{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div style={s.card}>
                  <div style={s.sec}><span style={s.dot('var(--accent)')}/>Εγγύηση</div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                    <tbody>
                      {([
                        ['Ποσό',<span style={{color:'var(--accent)',fontWeight:700}}>{fmt(tenant.deposit_amount)}</span>],
                        ['Κατάσταση',tenant.deposit_returned?<span style={s.badge('var(--positive)','var(--positive-dim)')}>Επεστράφη</span>:<span style={s.badge('var(--accent)','var(--accent-dim)')}>Εκκρεμεί</span>],
                        ['Επένδυση',tenant.deposit_invested?<span style={s.badge('var(--positive)','var(--positive-dim)')}>Επενδύεται</span>:<span style={s.badge('var(--text-secondary)','var(--bg-overlay)')}>Όχι</span>],
                        ...(tenant.deposit_invest_type?[['Τύπος',tenant.deposit_invest_type]]:[] as any),
                      ] as [string,React.ReactNode][]).map(([k,v],i)=>(
                        <tr key={i}><td style={s.tdM}>{k}</td><td style={s.td}>{v}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {!tenant.deposit_returned&&<button style={{...s.btnSm,marginTop:'12px',width:'100%',textAlign:'center' as const}} onClick={async()=>{await supabase.from('tenants').update({deposit_returned:true,deposit_return_date:new Date().toISOString().split('T')[0]}).eq('id',tenant.id);fetch_();notify('Εγγύηση επεστράφη');}}>✓ Σήμανση ως Επεστράφη</button>}
                  <InvestmentCalc title="Απόδοση Εγγύησης" amount={tenant.deposit_amount}/>
                </div>
                {tenant.notes&&<div style={s.card}><div style={s.sec}><span style={s.dot()}/>Σημειώσεις</div><div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.7}}>{tenant.notes}</div></div>}
              </div>
            </div>
          )}

          {viewTab==='lease'&&(
            <div style={s.g2}>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Συμβόλαιο</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                  <tbody>
                    {([
                      ['Τύπος',tenant.lease_type?LEASE_LABELS[tenant.lease_type]:'—'],
                      ['Έναρξη',fmtD(tenant.lease_start)],
                      ['Λήξη',()=>{const d=daysLeft(tenant.lease_end);const st=leaseSt(d);return <span>{fmtD(tenant.lease_end)}{st&&<span style={{...s.badge(st.color,st.bg),marginLeft:'8px'}}>{st.label}</span>}</span>;}],
                      ['Ενοίκιο',<span style={{color:'var(--accent)',fontWeight:700,fontSize:'14px'}}>{fmt(tenant.monthly_rent)}</span>],
                      ['Εξόφληση',{monthly:'Μηνιαία',bimonthly:'Διμηνιαία',quarterly:'Τριμηνιαία'}[tenant.payment_frequency||'monthly']||'—'],
                      ['Πληρωμή',tenant.e_payment?<span style={s.badge('var(--positive)','var(--positive-dim)')}>Ηλεκτρονική</span>:<span style={s.badge('var(--text-secondary)','var(--bg-overlay)')}>Μετρητά</span>],
                    ] as [string,React.ReactNode|Function][]).map(([k,v],i)=>(
                      <tr key={i}><td style={s.tdM}>{k as string}</td><td style={s.td}>{typeof v==='function'?v():v as React.ReactNode}</td></tr>
                    ))}
                  </tbody>
                </table>
                {tenant.prepay_option&&<div style={{marginTop:'14px',paddingTop:'14px',borderTop:'1px solid var(--border-subtle)'}}><PrepayCalc monthlyRent={tenant.monthly_rent}/></div>}
              </div>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Ετήσιες Συντηρήσεις</div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'12px'}}>
                  <tbody>
                    {[['Κλιματιστικό',tenant.ac_service_by],['Ηλιακός',tenant.solar_service_by],['Αντλία Θερμ.',tenant.heat_pump_service_by],['Φωτοβολταϊκά',tenant.solar_panels_service_by],['Απεντόμωση',tenant.pest_control_by]].map(([k,v],i)=>{
                      if(!v)return null;
                      const col=(v as ServiceBy)==='owner'?'var(--warning)':(v as ServiceBy)==='tenant'?'var(--positive)':'var(--accent)';
                      const dim=(v as ServiceBy)==='owner'?'var(--warning-dim)':(v as ServiceBy)==='tenant'?'var(--positive-dim)':'var(--accent-dim)';
                      return <tr key={i}><td style={s.tdM}>{k as string}</td><td style={s.td}><span style={s.badge(col,dim)}>{SERVICE_BY_LABELS[v as ServiceBy]}</span></td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {viewTab==='services'&&(
            <div style={s.g2}>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Streaming</div>
                {!(tenant.streaming?.some(sv=>sv.included))&&<div style={{color:'var(--text-tertiary)',fontSize:'12px'}}>Καμία συνδρομή</div>}
                {tenant.streaming?.filter(sv=>sv.included).map((svc,i)=>(
                  <div key={i} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:'14px',alignItems:'center',padding:'10px 12px',marginBottom:'6px',background:'var(--bg-elevated)',borderRadius:'10px',border:'1px solid var(--border-subtle)'}}>
                    <span style={{fontSize:'13px'}}>{svc.name}</span>
                    <div style={{textAlign:'right' as const}}><div style={{fontSize:'10px',color:'var(--text-secondary)'}}>ΚΟΣΤΟΣ</div><div style={{fontSize:'13px',color:'var(--negative)',fontWeight:700,fontFamily:"'Roboto Mono',monospace"}}>{fmt(svc.cost_owner)}</div></div>
                    <div style={{textAlign:'right' as const}}><div style={{fontSize:'10px',color:'var(--text-secondary)'}}>ΧΡΕΩΣΗ</div><div style={{fontSize:'13px',color:'var(--accent)',fontWeight:700,fontFamily:"'Roboto Mono',monospace"}}>{fmt(svc.charged_tenant)}</div></div>
                  </div>
                ))}
              </div>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Καθαρισμός</div>
                {!tenant.cleaning||tenant.cleaning.package==='none'?<div style={{color:'var(--text-tertiary)',fontSize:'12px'}}>Δεν περιλαμβάνεται</div>:(
                  <div style={{background:'var(--bg-elevated)',padding:'14px',borderRadius:'10px',border:'1px solid var(--border-subtle)'}}>
                    <div style={{fontSize:'13px',color:'var(--text-primary)'}}>{tenant.cleaning.times}× {tenant.cleaning.hours}ώρ/μήνα</div>
                    <div style={{display:'flex',gap:12,marginTop:8}}>
                      <span style={{fontSize:12,color:'var(--negative)'}}>Κόστος: {fmt(tenant.cleaning.total_owner)}</span>
                      <span style={{fontSize:12,color:'var(--accent)'}}>Χρέωση: {fmt(tenant.cleaning.total_tenant)}</span>
                    </div>
                  </div>
                )}
                {tenant.extra_perks&&<div style={{marginTop:'14px',paddingTop:'14px',borderTop:'1px solid var(--border-subtle)',fontSize:'12px',color:'var(--text-secondary)',lineHeight:1.7}}>{tenant.extra_perks}</div>}
              </div>
            </div>
          )}

          {viewTab==='rentadjust'&&<RentAdjustView tenant={tenant}/>}

          {viewTab==='payments'&&(
            <div style={s.card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
                <div style={s.sec}><span style={s.dot()}/>Ιστορικό Πληρωμών</div>
                <button style={s.btnSm} onClick={()=>setAddPay(v=>!v)}>{addPay?'✕ Κλείσιμο':'+ Νέα Πληρωμή'}</button>
              </div>
              {addPay&&(
                <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'10px',padding:'16px',marginBottom:'16px'}}>
                  <div style={{...s.g4,marginBottom:'12px'}}>
                    <SelectField label="Μήνας" value={String(payF.period_month)} onChange={v=>setPayF(f=>({...f,period_month:+v}))} options={MONTHS_FULL.map((m,i)=>({value:String(i+1),label:m}))}/>
                    <NumberInput label="Έτος" value={String(payF.period_year)} onChange={v=>setPayF(f=>({...f,period_year:+v}))} min={2000}/>
                    <NumberInput label="Ποσό" value={payF.amount} onChange={v=>setPayF(f=>({...f,amount:v}))} suffix="€" placeholder={tenant.monthly_rent?.toString()}/>
                    <NumberInput label="Μέρες Καθ/σης" value={payF.days_late} onChange={v=>setPayF(f=>({...f,days_late:v}))} suffix="δ" placeholder="0"/>
                  </div>
                  <div style={{...s.g3,marginBottom:'12px'}}>
                    <div><label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Εξοφλήθη</label><Toggle on={payF.paid} onChange={v=>setPayF(f=>({...f,paid:v}))} label="Ναι" labelOff="Όχι"/></div>
                    {payF.paid&&<DateField label="Ημ/νία Πληρωμής" value={payF.paid_date} onChange={v=>setPayF(f=>({...f,paid_date:v}))}/>}
                    <TextInput label="Σημείωση" value={payF.notes} onChange={v=>setPayF(f=>({...f,notes:v}))} placeholder="π.χ. Μερική πληρωμή"/>
                  </div>
                  <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                    <button style={s.btnGhost} onClick={()=>setAddPay(false)}>Ακύρωση</button>
                    <button style={s.btnGold} onClick={savePay} disabled={saving}>{saving?'...':'Καταχώρηση'}</button>
                  </div>
                </div>
              )}
              {payments.length===0?<div style={{textAlign:'center',padding:'48px',color:'var(--text-tertiary)',fontSize:'12px'}}>Δεν υπάρχουν πληρωμές</div>:(
                <>
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead><tr>{['Περίοδος','Ποσό','Κατάσταση','Ημ/νία','Καθ/ση','Σημ.',''].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {payments.map(p=>(
                        <tr key={p.id}>
                          <td style={s.td}><strong>{MONTHS_S[p.period_month-1]}</strong> <span style={{color:'var(--text-tertiary)'}}>{p.period_year}</span></td>
                          <td style={s.td}>{fmt(p.amount)}</td>
                          <td style={s.td}><button onClick={async()=>{await supabase.from('rent_payments').update({paid:!p.paid,paid_date:!p.paid?new Date().toISOString().split('T')[0]:null}).eq('id',p.id);fetch_();}} style={{...s.badge(p.paid?'var(--positive)':'var(--negative)',p.paid?'var(--positive-dim)':'var(--negative-dim)'),cursor:'pointer',border:'none',fontFamily:'Inter,sans-serif'}}>{p.paid?'✓ Εξοφλήθη':'✕ Εκκρεμεί'}</button></td>
                          <td style={s.tdM}>{fmtD(p.paid_date)}</td>
                          <td style={s.td}>{p.days_late&&p.days_late>0?<span style={s.badge(p.days_late>14?'var(--negative)':'var(--warning)',p.days_late>14?'var(--negative-dim)':'var(--warning-dim)')}>{p.days_late}δ</span>:<span style={{color:'var(--text-tertiary)'}}>—</span>}</td>
                          <td style={s.tdM}>{p.notes||'—'}</td>
                          <td style={s.td}><button style={s.btnDng} onClick={async()=>{if(!confirm('Διαγραφή;'))return;await supabase.from('rent_payments').delete().eq('id',p.id);fetch_();}}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{borderTop:'1px solid var(--border-subtle)',marginTop:'12px',paddingTop:'12px',display:'flex',gap:'20px'}}>
                    <span style={{fontSize:'11px',color:'var(--positive)'}}>Εισπραχθέντα: <strong>{fmt(payments.filter(p=>p.paid).reduce((a,p)=>a+p.amount,0))}</strong></span>
                    {payments.some(p=>!p.paid)&&<span style={{fontSize:'11px',color:'var(--negative)'}}>Εκκρεμή: <strong>{fmt(payments.filter(p=>!p.paid).reduce((a,p)=>a+p.amount,0))}</strong></span>}
                    <span style={{fontSize:'11px',color:'var(--text-secondary)'}}>{payments.filter(p=>p.paid).length}/{payments.length} πληρωμές</span>
                  </div>
                </>
              )}
            </div>
          )}

          {viewTab==='extras'&&(
            <div style={s.card}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
                <div style={s.sec}><span style={s.dot('var(--warning)')}/>Έκτακτες Χρεώσεις</div>
                <button style={s.btnSm} onClick={()=>setAddExtra(v=>!v)}>{addExtra?'✕ Κλείσιμο':'+ Νέα Χρέωση'}</button>
              </div>
              {addExtra&&(
                <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'10px',padding:'16px',marginBottom:'16px'}}>
                  <div style={{...s.g3,marginBottom:'12px'}}>
                    <div style={{gridColumn:'1/3'}}><TextInput label="Περιγραφή" value={exF.description} onChange={v=>setExF(f=>({...f,description:v}))} placeholder="π.χ. Φθορά ψυγείου"/></div>
                    <NumberInput label="Ποσό" value={exF.amount} onChange={v=>setExF(f=>({...f,amount:v}))} suffix="€"/>
                  </div>
                  <div style={{...s.g3,marginBottom:'12px'}}>
                    <SelectField label="Κατηγορία" value={exF.category} onChange={v=>setExF(f=>({...f,category:v}))} options={EXTRA_CATS.map(c=>({value:c,label:c}))}/>
                    <DateField label="Ημ/νία" value={exF.date} onChange={v=>setExF(f=>({...f,date:v}))}/>
                    <div><label style={{fontSize:'9px',letterSpacing:'0.14em',textTransform:'uppercase' as const,color:'var(--text-secondary)',display:'block',marginBottom:'8px'}}>Εξοφλήθη</label><Toggle on={exF.paid} onChange={v=>setExF(f=>({...f,paid:v}))} label="Ναι" labelOff="Όχι"/></div>
                  </div>
                  <div style={{display:'flex',gap:'8px',justifyContent:'flex-end'}}>
                    <button style={s.btnGhost} onClick={()=>setAddExtra(false)}>Ακύρωση</button>
                    <button style={s.btnGold} onClick={saveExtra} disabled={saving}>{saving?'...':'Καταχώρηση'}</button>
                  </div>
                </div>
              )}
              {extras.length===0?<div style={{textAlign:'center',padding:'48px',color:'var(--text-tertiary)',fontSize:'12px'}}>Δεν υπάρχουν έκτακτες χρεώσεις</div>:(
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr>{['Ημ/νία','Περιγραφή','Κατηγορία','Ποσό','Κατάσταση',''].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {extras.map((e:any)=>(
                      <tr key={e.id}>
                        <td style={s.tdM}>{fmtD(e.date)}</td>
                        <td style={s.td}>{e.description}</td>
                        <td style={s.tdM}>{e.category}</td>
                        <td style={{...s.td,color:'var(--warning)',fontWeight:700}}>{fmt(e.amount)}</td>
                        <td style={s.td}><button onClick={async()=>{await supabase.from('expenses').update({paid:!e.paid}).eq('id',e.id);fetch_();}} style={{...s.badge(e.paid?'var(--positive)':'var(--warning)',e.paid?'var(--positive-dim)':'var(--warning-dim)'),cursor:'pointer',border:'none',fontFamily:'Inter,sans-serif'}}>{e.paid?'✓ Εξοφλήθη':'✕ Εκκρεμεί'}</button></td>
                        <td style={s.td}><button style={s.btnDng} onClick={async()=>{if(!confirm('Διαγραφή;'))return;await supabase.from('expenses').delete().eq('id',e.id);fetch_();}}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {viewTab==='comm'&&<CommView tenant={tenant} propertyId={propertyId} userId={userId}/>}
          {viewTab==='market'&&<MarketView tenant={tenant} propertyId={propertyId} userId={userId}/>}

          {viewTab==='docs'&&(
            <div style={s.g2}>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>PDF Συμβολαίου</div>
                {tenant.lease_doc_name?(
                  <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border-accent)',borderRadius:'10px',padding:'16px'}}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
                      <div style={{fontSize:'13px',color:'var(--text-primary)'}}>📄 {tenant.lease_doc_name}</div>
                      <button style={s.btnDng} onClick={deletePDF}>Διαγραφή</button>
                    </div>
                    {tenant.lease_doc_url&&<a href={tenant.lease_doc_url} target="_blank" rel="noopener noreferrer" style={{...s.btnGold,display:'inline-block',textDecoration:'none',textAlign:'center' as const}}>Άνοιγμα PDF</a>}
                    <div style={{marginTop:'12px'}}>
                      <label style={{...s.btnSm,cursor:'pointer',display:'inline-block'}}>
                        {uploading?'Ανέβασμα...':'Αντικατάσταση PDF'}
                        <input type="file" accept=".pdf" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPDF(f);}} disabled={uploading}/>
                      </label>
                    </div>
                  </div>
                ):(
                  <div style={{background:'var(--bg-elevated)',border:`2px dashed var(--border-default)`,borderRadius:'10px',padding:'40px',textAlign:'center' as const}}>
                    <div style={{fontSize:'32px',opacity:.2,marginBottom:'12px'}}>📄</div>
                    <div style={{fontSize:'12px',color:'var(--text-secondary)',marginBottom:'16px'}}>Ανέβασε το ενοικιαστήριο συμβόλαιο (PDF)</div>
                    <label style={{...s.btnGold,cursor:'pointer',display:'inline-block'}}>
                      {uploading?'Ανέβασμα...':'Επιλογή PDF'}
                      <input type="file" accept=".pdf" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPDF(f);}} disabled={uploading}/>
                    </label>
                  </div>
                )}
              </div>
              <div style={s.card}>
                <div style={s.sec}><span style={s.dot()}/>Εξωτερικό Link</div>
                {tenant.lease_doc_external_url?(
                  <div>
                    <div style={{fontSize:'12px',color:'var(--text-secondary)',marginBottom:'12px',wordBreak:'break-all' as const}}>{tenant.lease_doc_external_url}</div>
                    <a href={tenant.lease_doc_external_url} target="_blank" rel="noopener noreferrer" style={{...s.btnGold,display:'inline-block',textDecoration:'none'}}>Άνοιγμα Link</a>
                  </div>
                ):(
                  <div style={{color:'var(--text-tertiary)',fontSize:'12px',lineHeight:1.7}}>Δεν έχει οριστεί εξωτερικό link.</div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}