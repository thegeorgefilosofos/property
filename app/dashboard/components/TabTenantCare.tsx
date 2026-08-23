'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as expenses from '@/lib/data/expenses';
// Οι επαφές έχουν ένα σπίτι: lib/data/contacts.
import * as contacts from '@/lib/data/contacts';
import {
  s,
  fmt,
  fmtD,
  daysLeft,
  leaseSt,
  servicesOwnerCost,
  LEASE_CATEGORY_LABELS,
  COMMERCIAL_STAMP_DUTY,
} from './TabTenantHelpers';
import {
  Toggle,
  NumberInput,
  TextInput,
  CustomSelect as SelectField,
  DatePicker,
} from './UIComponents';
import {
  T,
  KPIGrid,
  InfoBanner,
  Badge,
  EmptyState,
  fe,
  fn,
  fp,
  Spinner,
  type KPIItem,
  ABSENT,
  ABSENT_DATE,
  TT,
  localDay,
  formGrid,
} from '@/components/Theme';
import {
  MessageSquare,
  Hammer,
  Wrench,
} from 'lucide-react';
import {
  notifyOk,
} from '@/components/Toast';
import { saved } from '@/components/dbWrite';
import { confirmDialog } from '@/components/ConfirmDialog';
import { roleLabel } from '@/lib/contacts/roles';
import { rentalIncomeTax, rentalRowsForYear, rentalBracketsForYear } from '@/lib/billing/greekTax';
import { athensParts } from '@/lib/core/time';
import { PRESUMPTIVE_DEDUCTION_RATE } from '@/lib/accounting/statement';
import {
  TENANT_FIELDS,
  missingCritical,
} from '@/lib/property/fields';
import { photosKey, signMaintenancePhotos } from '@/lib/maintenance/photos';
import { whatsappLink, viberLink } from '@/lib/clients/messages';
import { normalizePhone } from '@/lib/clients/clients';
import {
  athensToday,
} from '@/lib/core/time';
import { AadeLinks } from '@/components/AadeLink';
// Τα σχήματα, οι κανόνες και οι κοινοί βοηθοί της καρτέλας.
import {
  todayISO,
  lastDayNextMonth,
  isFurnished,
  tenantBaseRent,
  tenantLines,
  tenantServicesCharge,
  msgDigits,
  type Tenant,
  type RentPayment,
  type TenantDamage,
  type MaintenanceReq,
  type CommLog,
} from './TabTenantTypes';
import {
  InfoBlock,
  SectionTitle,
  KpiCard,
  StatusBadge,
  DataRow,
  AlertBar,
  MissingCriticalBar,
  PaymentBars,
  leaseAlerts,
  tenantFieldCtx,
  filledTenantIds,
} from './TabTenantParts';

// ═══════════════════════════════════════════════════════════════════════════
// Ο ΕΝΟΙΚΙΑΣΤΗΣ: Η ΕΠΙΣΚΟΠΗΣΗ, Η ΕΠΙΚΟΙΝΩΝΙΑ, Ο ΝΟΜΟΣ ΚΑΙ Η ΣΥΝΤΗΡΗΣΗ
// ─────────────────────────────────────────────────────────────────────────
// Ό,τι ΔΕΝ είναι ποσό: η εικόνα της μίσθωσης, το ιστορικό επικοινωνίας, οι
// φορολογικές και νομικές υποχρεώσεις, οι φθορές και τα αιτήματα συντήρησης.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Design tokens, shared source of truth (components/Theme) ────────────────
const labelStyle = { ...TT.label, marginBottom:7 };

// ─── HTML escaping for values interpolated into document.write() templates ────

export function DashboardView({ tenant, payments, propertyCount }:{ tenant:Tenant; payments:RentPayment[]; propertyCount:number }) {
  const alerts=useMemo(()=>leaseAlerts(payments,tenant),[payments,tenant]);
  const d=daysLeft(tenant.lease_end); const st=leaseSt(d);
  const lines=useMemo(()=>tenantLines(tenant),[tenant]);
  const servicesCharge=tenantServicesCharge(tenant);
  const totalTenant=tenantBaseRent(tenant)+servicesCharge;
  const ownerCosts=servicesOwnerCost(lines);
  const paidPay=payments.filter(p=>p.paid);
  const unpaidAmt=payments.filter(p=>!p.paid).reduce((a,p)=>a+p.amount,0);
  const late=paidPay.filter(p=>(p.days_late||0)>0);
  const avgLate=late.length?late.reduce((a,p)=>a+(p.days_late||0),0)/late.length:0;
  const annualRent=(tenant.monthly_rent||0)*12;
  const totalCosts=ownerCosts*12;
  const netIncome=annualRent-totalCosts;
  const totalReceived=paidPay.reduce((a,p)=>a+p.amount,0);
  const missing=useMemo(
    ()=>missingCritical(TENANT_FIELDS, tenantFieldCtx(isFurnished(tenant.furnishing), propertyCount), filledTenantIds(tenant)),
    [tenant,propertyCount],
  );

  return (
    <div>
      {/* Τι λείπει για τη δήλωση — πρώτο, γιατί είναι το μόνο που κοστίζει */}
      <MissingCriticalBar missing={missing}/>

      {alerts.length>0&&(
        <div style={{ marginBottom:20 }}>
          {alerts.map((a,i)=><AlertBar key={i} text={a.text} level={a.level}/>)}
        </div>
      )}

      {/* KPI Strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 90px), 1fr))', gap:10, marginBottom:20 }}>
        <KpiCard label="Βασικό ενοίκιο" value={fmt(tenant.monthly_rent)} color="var(--text-primary)"/>
        <KpiCard label="Σύνολο μηνιαίως" value={fmt(totalTenant)} color="var(--text-primary)"/>
        <KpiCard label="Κόστη ιδιοκτήτη" value={fmt(ownerCosts)} color="var(--text-primary)"/>
        <KpiCard label="Λήξη μίσθωσης" value={d==null?ABSENT_DATE:d<0?'Έληξε':`${d} ημέρες`} color={st?.color||'var(--text-primary)'}/>
        <KpiCard label="Εκκρεμή ποσά" value={fmt(unpaidAmt)} color={unpaidAmt>0?'var(--negative)':'var(--text-primary)'}/>
        <KpiCard label="Εγγύηση" value={fmt(tenant.deposit_amount)} color={tenant.deposit_returned?'var(--positive)':'var(--accent)'}/>
      </div>

      {/* Ιστορικό πληρωμών, με λόγια — γεγονότα, όχι βαθμός */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Πώς πληρώνει</SectionTitle>
        {payments.length===0?(
          <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.7 }}>
            Δεν έχει καταγραφεί ακόμη καμία δόση. Μόλις καταγραφεί η πρώτη είσπραξη, εδώ θα βλέπεις πόσες δόσεις πληρώθηκαν και με πόση καθυστέρηση.
          </div>
        ):(
          <div style={{ fontSize:14, color:'var(--text-primary)', fontFamily:T.font.sans, lineHeight:1.8 }}>
            <strong style={{ fontFamily:T.font.num, fontVariantNumeric:'tabular-nums' }}>{fn(paidPay.length)}/{fn(payments.length)}</strong> δόσεις πληρωμένες
            {late.length>0
              ? <> · <strong style={{ fontFamily:T.font.num, fontVariantNumeric:'tabular-nums' }}>{fn(late.length)}</strong> με καθυστέρηση, μέση καθυστέρηση <strong style={{ fontFamily:T.font.num, fontVariantNumeric:'tabular-nums' }}>{avgLate.toFixed(0)}</strong> ημέρες</>
              : <> · καμία καθυστέρηση</>}
            {unpaidAmt>0&&<> · εκκρεμεί <strong style={{ color:'var(--negative)', fontFamily:T.font.num, fontVariantNumeric:'tabular-nums' }}>{fmt(unpaidAmt)}</strong></>}
          </div>
        )}
      </div>

      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Ιστορικό πληρωμών, τελευταίοι 12 μήνες</SectionTitle>
        <PaymentBars payments={payments}/>
        {payments.length>0&&(
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:10, marginTop:20 }}>
            <KpiCard label="Πληρωμές" value={`${paidPay.length}/${payments.length}`} color="var(--text-primary)"/>
            <KpiCard label="Ποσοστό εξόφλησης" value={`${fp(((paidPay.length/payments.length)*100))}`} color="var(--text-primary)"/>
            <KpiCard label="Μέση καθυστέρηση" value={avgLate>0?`${avgLate.toFixed(0)} ημέρες`:'Χωρίς'} color={avgLate>7?'var(--warning)':'var(--positive)'}/>
            <KpiCard label="Εισπραχθέντα σύνολο" value={fmt(totalReceived)} color="var(--text-primary)"/>
          </div>
        )}
      </div>

      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Οικονομική ανάλυση ενοικιαστή</SectionTitle>
        <DataRow label="Ακαθάριστα ενοίκια ανά έτος" value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(annualRent)}</span>}/>
        <DataRow label="Κόστη ιδιοκτήτη ανά έτος" value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>-{fmt(totalCosts)}</span>}/>
        <DataRow label="Καθαρό εισόδημα ανά έτος" value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:15 }}>{fmt(netIncome)}</span>}/>
        <DataRow label="Εισπραχθέντα σύνολο" value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(totalReceived)}</span>}/>
        <DataRow label="Εκκρεμή σύνολο" value={<span style={{ color:unpaidAmt>0?'var(--negative)':'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(unpaidAmt)}</span>}/>
      </div>
    </div>
  );
}

// ─── Αναπροσαρμογή Ενοικίου (ΔΤΚ) ────────────────────────────────────────────
// Ο πίνακας ΔΤΚ ζει στο TabTenantHelpers με πηγή και ημερομηνία επιβεβαίωσης.
// Εδώ διαβάζεται μόνο, και ΠΟΤΕ με fallback: έτος χωρίς τιμή δεν έχει τιμή.

export function CommView({ tenant, propertyId, userId }:{ tenant:Tenant; propertyId:string; userId:string }) {
  const supabase=createClient();
  const [logs,setLogs]=useState<CommLog[]>([]);
  const [loading,setLoading]=useState(true);
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({type:'call' as CommLog['type'],summary:'',date:athensToday(),outcome:''});
  const [saving,setSaving]=useState(false);
  // Κλειδωμένα στην ένωση `CommLog['type']` αντί για `Record<string,string>`.
  // Με ελεύθερο κλειδί οι δύο πίνακες μπορούσαν να αποκλίνουν από την ένωση και
  // προς τις ΔΥΟ κατευθύνσεις: κλειδί που ΛΕΙΠΕΙ έβγαζε `undefined` ενώ ο τύπος
  // υποσχόταν `string` (το `TYPE_SHORT[log.type]` τύπωνε «undefined»), και
  // κλειδί ΠΑΡΑΠΑΝΩ γινόταν ορατή επιλογή που η βάση απορρίπτει — το
  // `tenant_comm_log_type_check` (baseline.sql:2788) δέχεται ΜΟΝΟ
  // call/email/sms/meeting/note, οπότε η καταχώρηση αποτύγχανε κάθε φορά.
  // Με `Record<CommLog['type'],string>` καμία από τις δύο δεν είναι πια δυνατή.
  const TYPE_LABELS:Record<CommLog['type'],string>={call:'Τηλεφωνική Κλήση',email:'Ηλεκτρονικό Ταχυδρομείο',sms:'Μήνυμα',meeting:'Συνάντηση',note:'Σημείωση'};
  const TYPE_SHORT:Record<CommLog['type'],string>={call:'Κλήση',email:'Ηλεκτρονικό ταχυδρομείο',sms:'Μήνυμα',meeting:'Συνάντηση',note:'Σημείωση'};
  // Ο SelectField επιστρέφει `string`· το `v as any` έσβηνε τη στένωση σε ένωση.
  // Εδώ ΔΕΝ κατέληγε αυθαίρετο κείμενο στη βάση — το CHECK της στήλης το κόβει
  // και το `saved()` δείχνει σφάλμα. Ο φύλακας μεταφέρει την αποτυχία από τη
  // διαδρομή προς τον διακομιστή στη μεταγλώττιση, όπου κοστίζει μηδέν.
  const isCommType=(v:string):v is CommLog['type']=>Object.prototype.hasOwnProperty.call(TYPE_LABELS,v);

  const loadLogs=async()=>{
    setLoading(true);
    const{data}=await supabase.from('tenant_comm_log').select('*').eq('tenant_id',tenant.id).order('date',{ascending:false});
    setLogs(data||[]);setLoading(false);
  };

  useEffect(()=>{loadLogs();},[tenant.id]);
  const saveLog=async()=>{
    if(!form.summary.trim())return;setSaving(true);
    await saved('Η καταγραφή επικοινωνίας δεν αποθηκεύτηκε', supabase.from('tenant_comm_log').insert({tenant_id:tenant.id,property_id:propertyId,user_id:userId,type:form.type,summary:form.summary.trim(),date:form.date,outcome:form.outcome||null}));
    setSaving(false);setShowAdd(false);setForm({type:'call',summary:'',date:athensToday(),outcome:''});loadLogs();
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
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Γρήγορη επικοινωνία</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap:10, marginBottom:14 }}>
          {tenant.phone&&(
            <a href={`tel:${tenant.phone}`} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)', transition:'border-color 0.15s' }}>
              <div style={{ width:36, height:36, borderRadius: T.radius.modal, background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans, color:'var(--text-primary)' }}>Κλήση</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{tenant.phone}</div></div>
            </a>
          )}
          {tenant.email&&(
            <a href={`mailto:${tenant.email}`} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)' }}>
              <div style={{ width:36, height:36, borderRadius: T.radius.modal, background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans }}>Ηλεκτρονικό ταχυδρομείο</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const, maxWidth:120 }}>{tenant.email}</div></div>
            </a>
          )}
          {tenant.phone&&(
            <a href={whatsappLink(msgDigits(tenant.phone),'')} target="_blank" rel="noopener noreferrer" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)' }}>
              <div style={{ width:36, height:36, borderRadius: T.radius.modal, background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans }}>WhatsApp</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{tenant.phone}</div></div>
            </a>
          )}
          {tenant.phone&&(
            <a href={viberLink('')} target="_blank" rel="noopener noreferrer" style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'16px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, textDecoration:'none', color:'var(--text-primary)' }}>
              <div style={{ width:36, height:36, borderRadius: T.radius.modal, background:'var(--bg-overlay)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}></div>
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans }}>Viber</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2 }}>{tenant.phone}</div></div>
            </a>
          )}
        </div>
        {reminders.map((r,i)=><AlertBar key={i} text={`Υπενθύμιση: ${r.label}`} level={r.urgent?'critical':'warning'}/>)}
      </div>

      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <SectionTitle>Ιστορικό επικοινωνίας</SectionTitle>
          <button style={s.btnSm} onClick={()=>setShowAdd(v=>!v)}>{showAdd?'Κλείσιμο':'+ Νέα Καταχώρηση'}</button>
        </div>

        {showAdd&&(
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20, marginBottom:20 }}>
            <div style={{ ...formGrid(150, 210), gap:12, marginBottom:12 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom:8 }}>Τύπος επικοινωνίας</div>
                <SelectField value={form.type} onChange={v=>{ if(isCommType(v)) setForm(f=>({...f,type:v})); }}
                  options={(Object.keys(TYPE_LABELS) as CommLog['type'][]).map(k=>({ value:k, label:TYPE_LABELS[k] }))}/>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom:8 }}>Ημερομηνία</div>
                <DatePicker value={form.date} onChange={v=>setForm(f=>({...f,date:v}))}/>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom:8 }}>Αποτέλεσμα</div>
                <input type="text" value={form.outcome} onChange={e=>setForm(f=>({...f,outcome:e.target.value}))} placeholder="Παράδειγμα: Θετικό, αρνητικό…" style={inputStyle}/>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ ...labelStyle, marginBottom:8 }}>Σύνοψη επικοινωνίας *</div>
              <textarea value={form.summary} onChange={e=>setForm(f=>({...f,summary:e.target.value}))} placeholder="Περιγραφή επικοινωνίας…" rows={3}
                style={{ width:'100%', background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:T.radius.inner, padding:'10px 14px', color:'var(--text-primary)', fontSize:14, letterSpacing:0, fontFamily:T.font.sans, outline:'none', boxSizing:'border-box' as const, resize:'vertical' as const, lineHeight:1.6 }}/>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button style={s.btnGhost} onClick={()=>setShowAdd(false)}>Ακύρωση</button>
              <button style={s.btnGold} onClick={saveLog} disabled={saving}>{saving?'Αποθήκευση…':'Αποθήκευση'}</button>
            </div>
          </div>
        )}

        {loading&&<Spinner label="Φόρτωση…" />}
        {!loading&&logs.length===0&&<EmptyState icon={<MessageSquare size={20}/>} title="Καμία επικοινωνία ακόμη" hint="Κατέγραψε κλήσεις, μηνύματα και επισκέψεις για να έχεις πλήρες ιστορικό με τον ενοικιαστή." />}
        {!loading&&logs.map(log=>(
          <div key={log.id} style={{ display:'flex', gap:14, alignItems:'flex-start', padding:'14px 0', borderBottom:'1px solid var(--border-subtle)' }}>
            <div style={{ width:38, height:38, borderRadius: T.radius.modal, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 }}>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{TYPE_SHORT[log.type]}</span>
                <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>{localDay(log.date).toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'})}</span>
                {log.outcome&&<StatusBadge label={log.outcome} color="var(--accent)" bg="var(--accent-dim)"/>}
              </div>
              <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.6 }}>{log.summary}</div>
            </div>
            <button style={s.btnDng} onClick={async()=>{if(!(await confirmDialog('Διαγραφή καταγραφής επικοινωνίας;',{tone:'negative'})))return;if(await saved('Η καταγραφή δεν διαγράφηκε',supabase.from('tenant_comm_log').delete().eq('id',log.id)))loadLogs();}}>Διαγραφή</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Rent Ledger helpers ──────────────────────────────────────────────────────
// Αναμενόμενες δόσεις από lease_start έως min(αποχώρηση, λήξη, τρέχων μήνας).
// Ο ενοικιαστής που έχει αποχωρήσει ΔΕΝ συσσωρεύει νέες δόσεις μετά την αποχώρηση.
//
// ΤΟ ΒΗΜΑ ΕΡΧΕΤΑΙ ΑΠΟ ΤΗ ΣΥΧΝΟΤΗΤΑ, ΟΧΙ ΑΠΟ ΥΠΟΘΕΣΗ. Εδώ έγραφε `m++`, δηλαδή
// πάντα μηνιαία, ενώ η καρτέλα ρωτούσε τον ιδιοκτήτη «Συχνότητα εξόφλησης» και
// ο οδηγός πεδίων του υποσχόταν «με αυτόν τον ρυθμό δημιουργούνται οι δόσεις».
// Όποιος επέλεγε «Τριμηνιαία» για εμπορικό μισθωτήριο έπαιρνε δώδεκα μηνιαίες
// δόσεις, και ο ενοικιαστής έβγαινε ληξιπρόθεσμος δύο στους τρεις μήνες.
// Η μηχανή ζει στο lib/rent/frequency.ts, με τεστ που φυλάει την αναλλοίωτη:

// ─── Payments View (Rent Ledger) ───────────────────────────────────────────────
// Το `notify` ΔΕΝ περνά πια ως prop: όσο υπήρχε, σκίαζε σιωπηλά το κοινό import με
// πανομοιότυπο όνομα και υπογραφή, οπότε τα μηνύματα αυτού του component κατέληγαν
// σε άλλον υποδοχέα από τα υπόλοιπα της ίδιας οθόνης.

export function LegalTaxView({ tenant, propertyCount }:{ tenant:Tenant; propertyCount:number }) {
  const annualRent=Math.max(0,(tenant.monthly_rent||0)*12);
  // ΤΕΚΜΑΡΤΗ ΕΚΠΤΩΣΗ 5%: ίδιος συντελεστής και ίδιος ΟΡΟΣ με το
  // lib/accounting/statement.ts. Από 1/1/2026 η έκπτωση προϋποθέτει είσπραξη μέσω
  // τραπέζης· με μετρητά ο φόρος υπολογίζεται στο 100% των ακαθάριστων. Ο φόρος
  // υπολογιζόταν πριν πάντα στο 100%, οπότε το app έδειχνε μεγαλύτερο φόρο από
  // τα Λογιστικά για το ίδιο ενοίκιο.
  const viaBank=tenant.e_payment!==false;
  const deductionRate=viaBank?PRESUMPTIVE_DEDUCTION_RATE:0;
  const taxable=annualRent*(1-deductionRate);
  // Η ΚΛΙΜΑΚΑ ΠΟΥ ΔΕΙΧΝΕΙ Η ΟΘΟΝΗ ΕΙΝΑΙ Η ΚΛΙΜΑΚΑ ΠΟΥ ΥΠΟΛΟΓΙΖΕΙ, ΚΑΙ Η ΧΡΟΝΙΑ
  // ΓΡΑΦΕΤΑΙ ΜΙΑ ΦΟΡΑ. Η προβολή αφορά το ΤΡΕΧΟΝ μίσθωμα, όχι περασμένη χρήση,
  // οπότε η χρονιά είναι η σημερινή — και όχι ένα «2026» καρφωμένο σε τρία
  // σημεία, που θα έμενε στην οθόνη ολόκληρο το 2027.
  const taxYear=athensParts().year;
  const tax=taxable>0?rentalIncomeTax(taxable,rentalBracketsForYear(taxYear)):0;
  const effRate=annualRent>0?tax/annualRent:0;
  const isCommercial=tenant.lease_category==='commercial';
  const stampDuty=isCommercial?annualRent*COMMERCIAL_STAMP_DUTY:0;   // 3,6% επί του μισθώματος
  const net=annualRent-tax-stampDuty;
  // Η κλίμακα είναι προοδευτική στο ΣΥΝΟΛΟ των ενοικίων του φορολογούμενου, όχι
  // ανά ακίνητο. Με δύο ή περισσότερα ακίνητα, το νούμερο εδώ είναι υποεκτίμηση
  // και το λέει ρητά — δεν σιωπά και δεν μαντεύει το σύνολο που δεν ξέρει.
  const perPropertyCaveat=propertyCount>=2;

  const kpis:KPIItem[]=[
    { label:'Ετήσιο Ακαθάριστο Ενοίκιο', value:fe(annualRent), tone:'accent' },
    { label:'Φόρος για ΑΥΤΟ το ακίνητο', value:fe(tax), tone:'warning', sub:annualRent>0?`πραγματικός συντελεστής ${fp((effRate*100))} επί των ακαθάριστων`:undefined },
    ...(isCommercial?[{ label:'Ψηφιακό Τέλος Συναλλαγής (3,6%)', value:fe(stampDuty), tone:'warning' as const }]:[]),
    { label:'Καθαρό μετά Φόρο και Τέλη', value:fe(net), tone:'positive' },
  ];

  return (
    <div>
      <KPIGrid items={kpis}/>
      <InfoBanner tone={perPropertyCaveat?'warning':'info'}>
        <strong>Εκτίμηση για ΑΥΤΟ το ακίνητο. Η κλίμακα εφαρμόζεται στο σύνολο των ενοικίων σου.</strong>{' '}
        {perPropertyCaveat
          ? `Έχεις ${fn(propertyCount)} ακίνητα: επειδή ο φόρος είναι προοδευτικός στο άθροισμα, το ποσό εδώ είναι μικρότερο από το μερίδιο που θα αναλογεί πραγματικά σε αυτό το ακίνητο. Το συνολικό νούμερο βγαίνει στα «Λογιστική».`
          : 'Αν αποκτήσεις δεύτερο ακίνητο που αποδίδει, το άθροισμα μπορεί να ανεβάσει κλιμάκιο και ο φόρος να μη είναι το άθροισμα των δύο εκτιμήσεων.'}{' '}
        Ενοίκιο {fe(tenant.monthly_rent||0)}/μήνα, τύπος μίσθωσης «{tenant.lease_category?LEASE_CATEGORY_LABELS[tenant.lease_category]:ABSENT}»
        {viaBank
          ? `, με τεκμαρτή έκπτωση ${fp((PRESUMPTIVE_DEDUCTION_RATE*100))} (φορολογητέο ${fe(taxable)}) επειδή το ενοίκιο εισπράττεται μέσω τραπέζης.`
          : '. Επειδή το ενοίκιο ΔΕΝ δηλώνεται ως ηλεκτρονική είσπραξη, η τεκμαρτή έκπτωση 5% δεν εφαρμόζεται και ο φόρος υπολογίζεται στο 100% των ακαθάριστων.'}
      </InfoBanner>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap:16, marginTop:16 }}>
        {/* Φόρος εισοδήματος από ενοίκια */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Φόρος εισοδήματος από ενοίκια ({taxYear})</SectionTitle>
          <div className="table-wrap">
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Κλιμάκιο Εισοδήματος','Συντελεστής'].map((h,i)=><th key={i} style={{ ...s.th, textAlign:i?'right' as const:'left' as const }}>{h}</th>)}</tr></thead>
            <tbody>
              {rentalRowsForYear(taxYear).map((r,i)=>{
                const active=taxable>r.from&&(r.to===Infinity||taxable<=r.to);
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
          <div style={{ marginTop:12, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>Ο φόρος υπολογίζεται προοδευτικά ανά κλιμάκιο επί του φορολογητέου ({fe(taxable)} = ακαθάριστα {fe(annualRent)}{viaBank?` μείον τεκμαρτή έκπτωση ${fp((PRESUMPTIVE_DEDUCTION_RATE*100))}`:''}), σύνολο {fe(tax)} για αυτό το ακίνητο. Επιβεβαίωσε την τελική δήλωση με λογιστή ή την ΑΑΔΕ.</div>
        </div>

        {/* Νομικές υποχρεώσεις */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Υποχρεώσεις και πλαίσιο</SectionTitle>
          <InfoBlock title="ΑΑΔΕ, Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης" tone="var(--warning)">
            Κάθε νέα μίσθωση, καθώς και κάθε τροποποίηση ή λύση, δηλώνεται ηλεκτρονικά στην ΑΑΔΕ έως το τέλος του επόμενου μήνα από την έναρξη ή τη μεταβολή.{tenant.lease_start?` Για έναρξη ${fmtD(tenant.lease_start)}, προθεσμία δήλωσης έως ${lastDayNextMonth(tenant.lease_start)}.`:''} Χωρίς τη δήλωση δεν αναγνωρίζεται φορολογικά η μίσθωση. Μετά την υποβολή, ο μισθωτής (και τυχόν συνιδιοκτήτες) ειδοποιείται μέσω myAADE/email και έχει 30 ημέρες να την αποδεχθεί ή να την απορρίψει — αλλιώς θεωρείται σιωπηρά αποδεκτή (ισχύς από 2/6/2025)· ενημέρωσέ τον εγκαίρως. Επιβεβαίωσε την ακριβή προθεσμία στην ΑΑΔΕ (σύνδεσμος πιο κάτω).
          </InfoBlock>
          <InfoBlock title="Είσπραξη μέσω τραπέζης" tone={viaBank?'var(--positive)':'var(--negative)'}>
            {viaBank
              ? `Το ενοίκιο εισπράττεται μέσω τραπέζης, οπότε ισχύει η τεκμαρτή έκπτωση ${fp((PRESUMPTIVE_DEDUCTION_RATE*100))} και φορολογείται το ${fe(taxable)} αντί του ${fe(annualRent)}.`
              : `Προσοχή: το ενοίκιο δηλώνεται ως μη τραπεζική είσπραξη. Από 1/1/2026 η τεκμαρτή έκπτωση ${fp((PRESUMPTIVE_DEDUCTION_RATE*100))} προϋποθέτει είσπραξη μέσω τραπέζης· χωρίς αυτήν φορολογείται το 100% των ακαθάριστων, δηλαδή ${fe(annualRent)} αντί ${fe(annualRent*(1-PRESUMPTIVE_DEDUCTION_RATE))}. Συμπλήρωσε IBAN είσπραξης στα στοιχεία της μίσθωσης.`}
          </InfoBlock>
          <InfoBlock title="Αναπροσαρμογή ΔΤΚ">
            Η αναπροσαρμογή μισθώματος γίνεται μία φορά τον χρόνο, βάσει Δείκτη Τιμών Καταναλωτή (ΕΛΣΤΑΤ), εφόσον προβλέπεται στη σύμβαση. Χρησιμοποίησε την καρτέλα «Αναπροσαρμογή Ενοικίου».{!isCommercial&&' Αν η κατοικία μισθώθηκε για διάρκεια μικρότερη της τριετίας χωρίς όρο αναπροσαρμογής, ο νόμος (άρθρο 2 ν.1703/1987) προβλέπει ετήσια αναπροσαρμογή ίση με το 75% της μεταβολής του ΔΤΚ έως τη συμπλήρωση της τριετίας· με χαμηλό ή αρνητικό ΔΤΚ το ενοίκιο ουσιαστικά μένει σταθερό. Επιβεβαίωσε την εφαρμογή στη σύμβασή σου.'}
          </InfoBlock>
          <InfoBlock title="Νόμιμη αύξηση ενοικίου">
            {isCommercial
              ?'Στις υφιστάμενες επαγγελματικές μισθώσεις (ΠΔ 34/1995), η αναπροσαρμογή για το 2026 δεν επιτρέπεται να ξεπερνά το 3% επί του μισθώματος του 2025, ακόμη κι αν οι αγοραίες τιμές ανέβηκαν περισσότερο. Το όριο δεν ισχύει σε νέα μίσθωση που υπογράφεις μέσα στο 2026.'
              :'Σε ενεργή μίσθωση κατοικίας δεν μπορείς να αυξήσεις μονομερώς το ενοίκιο κατά τη διάρκεια της σύμβασης — μόνο αν υπάρχει ρητός όρος αναπροσαρμογής (π.χ. ΔΤΚ ή σταθερό ποσοστό). Νέο, υψηλότερο μίσθωμα μπαίνει μόνο με νέα συμφωνία που αποδέχεται και ο μισθωτής. Για το 2026 δεν ισχύει γενικό κρατικό πλαφόν στα ενοίκια κατοικίας (το όριο 3% αφορά μόνο τις εμπορικές μισθώσεις).'}
          </InfoBlock>
          <InfoBlock title="Ελάχιστη διάρκεια και εγγύηση">
            {isCommercial
              ?'Για επαγγελματική μίσθωση ισχύει η ελάχιστη νόμιμη διάρκεια των τριών ετών.'
              :'Για μίσθωση κατοικίας ισχύει η τριετής ελάχιστη προστασία διάρκειας, ακόμη κι αν συμφωνηθεί μικρότερος χρόνος.'} Η εγγύηση{tenant.deposit_amount?` (${fe(tenant.deposit_amount)})`:''} επιστρέφεται στη λήξη, μετά από έλεγχο για φθορές.
          </InfoBlock>
          <InfoBlock title="Τέλος χαρτοσήμου και ψηφιακό τέλος συναλλαγής" tone={isCommercial?'var(--warning)':'var(--positive)'}>
            {isCommercial
              ?`Επαγγελματική μίσθωση: τέλος 3,60% επί του μισθώματος, που πλέον ονομάζεται «Ψηφιακό Τέλος Συναλλαγής» με τον ίδιο συντελεστή (ν.5135/2024). Για ετήσιο ενοίκιο ${fe(annualRent)}, ανέρχεται σε ${fe(stampDuty)} τον χρόνο (${fe(stampDuty/12)} τον μήνα), που κατανέμεται συνήθως 50/50 μεταξύ εκμισθωτή και μισθωτή. Δεν οφείλεται αν η μίσθωση έχει νομίμως υπαχθεί σε ΦΠΑ.`
              :'Μίσθωση κατοικίας: δεν επιβάλλεται τέλος χαρτοσήμου / Ψηφιακό Τέλος Συναλλαγής.'}
          </InfoBlock>
          <div style={{ marginTop:16 }}>
            <AadeLinks actions={['lease','income']}/>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DamagesView({ tenant, propertyId, userId, damages, onRefresh }:{ tenant:Tenant; propertyId:string; userId:string; damages:TenantDamage[]; onRefresh:()=>void }) {
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
    if(editId){ if(!await saved('Η φθορά δεν ενημερώθηκε', supabase.from('tenant_damages').update(payload).eq('id',editId))) return; }
    else { if(!await saved('Η φθορά δεν καταχωρήθηκε', supabase.from('tenant_damages').insert(payload))) return; }
    setBusy(false); setAddOpen(false); setF(blankF()); setEditId(null); onRefresh();
  };
  const del=async(d:TenantDamage)=>{ if(!(await confirmDialog('Διαγραφή φθοράς;',{tone:'negative'}))) return; if(await saved('Η φθορά δεν διαγράφηκε',supabase.from('tenant_damages').delete().eq('id',d.id))) onRefresh(); };

  // Ομαδοποίηση ανά έτος μίσθωσης (από lease_start· αλλιώς ανά ημερολογιακό έτος).
  const bucketOf=(occurred:string|null):{key:string;label:string;sort:number}=>{
    if(!occurred) return { key:'', label:'Χωρίς ημερομηνία', sort:-1 };
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
          <KpiCard label="Συνολικό κόστος" value={fmt(totalCost)} color="var(--text-primary)"/>
          <KpiCard label="Χρέωση ενοικιαστή" value={fmt(chargedTotal)} color={chargedTotal>0?'var(--warning)':'var(--positive)'}/>
          <KpiCard label="Εκκρεμείς επισκευές" value={String(openRepairs)} color={openRepairs>0?'var(--warning)':'var(--positive)'}/>
        </div>
      )}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:12, flexWrap:'wrap' as const }}>
          <SectionTitle>Φθορές και επισκευές</SectionTitle>
          <button style={s.btnSm} onClick={()=>addOpen?setAddOpen(false):openNew()}>{addOpen?'Κλείσιμο':'+ Νέα καταγραφή'}</button>
        </div>

        {addOpen&&(
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20, marginBottom:20 }}>
            <div style={{ ...s.g3, marginBottom:14 }}>
              <DatePicker label="Ημερομηνία" value={f.occurred_on} onChange={v=>setF(x=>({...x,occurred_on:v}))}/>
              <NumberInput label="Κόστος" value={f.cost} onChange={v=>setF(x=>({...x,cost:v}))} suffix="€"/>
              <div><div style={{ ...labelStyle, marginBottom:8 }}>Χρέωση στον ενοικιαστή</div><Toggle on={f.charged_to_tenant} onChange={v=>setF(x=>({...x,charged_to_tenant:v}))} ariaLabel="Ναι ή όχι"/></div>
            </div>
            <div style={{ marginBottom:14 }}>
              <TextInput label="Περιγραφή *" value={f.description} onChange={v=>setF(x=>({...x,description:v}))} placeholder="Παράδειγμα: Φθορά πάγκου κουζίνας"/>
            </div>
            <div style={{ ...s.g3, marginBottom:14 }}>
              <div><div style={{ ...labelStyle, marginBottom:8 }}>Επισκευάστηκε</div><Toggle on={f.repaired} onChange={v=>setF(x=>({...x,repaired:v}))} ariaLabel="Ναι ή όχι"/></div>
              {f.repaired&&<DatePicker label="Ημερομηνία επισκευής" value={f.repaired_on} onChange={v=>setF(x=>({...x,repaired_on:v}))}/>}
              <TextInput label="Σημείωση" value={f.notes} onChange={v=>setF(x=>({...x,notes:v}))} placeholder="προαιρετικό"/>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button style={s.btnGhost} onClick={()=>{setAddOpen(false);setEditId(null);}}>Ακύρωση</button>
              <button style={s.btnGold} onClick={save} disabled={busy}>{busy?'Αποθήκευση…':editId?'Αποθήκευση':'Καταχώρηση'}</button>
            </div>
          </div>
        )}

        {damages.length===0?(
          <EmptyState icon={<Hammer size={20}/>} title="Καμία φθορά ή επισκευή ακόμη" hint="Κατέγραψε φθορές με φωτογραφίες και κόστος, για τεκμηρίωση στην απόδοση της εγγύησης." />
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

// ─── Αιτήματα βλάβης (Maintenance View) ─────────────────────────────────────────
// Αιτήματα από την πύλη ενοικιαστή → ιδιοκτήτης → επίλυση, δεμένα με φθορές/απογραφή.
const MAINT_STATUS:Record<string,{label:string;c:string;bg:string}>={
  new:{label:'Νέο',c:'var(--accent)',bg:'var(--accent-dim)'},
  in_progress:{label:'Σε εξέλιξη',c:'var(--warning)',bg:'var(--warning-soft)'},
  done:{label:'Ολοκληρώθηκε',c:'var(--positive)',bg:'var(--positive-dim)'},
};
// Το bucket maintenance-photos είναι ιδιωτικό: αποθηκεύουμε το PATH. Η υπογραφή
// του (και η ανοχή στις παλιές εγγραφές που κρατούν ολόκληρο public URL) ζούσε
// εδώ, ενώ την ίδια λίστα αιτημάτων δείχνει και το PortalShare. Μετακόμισε στο
// lib/maintenance/photos, ώστε οι δύο οθόνες να δείχνουν τις ίδιες εικόνες.
// Ίδιος λόγος με το PaymentsView: το prop `notify` σκίαζε το κοινό import.

export function MaintenanceView({ tenant, propertyId, userId, requests, others, onRefresh }:{ tenant:Tenant; propertyId:string; userId:string; requests:MaintenanceReq[]; others:MaintenanceReq[]; onRefresh:()=>void }) {
  const supabase=createClient();
  const [busy,setBusy]=useState(false);
  const [assignFor,setAssignFor]=useState<string|null>(null);   // ποιο αίτημα αναθέτει σε συνεργείο
  const [histOpen,setHistOpen]=useState(false);                 // ιστορικό ακινήτου (μαζεμένο)
  const [af,setAf]=useState({name:'',contact:''});
  // Signed URLs ανά αίτημα (id → λίστα προσωρινών URL). Το ιδιωτικό bucket
  // απαιτεί υπογραφή· η ανάγνωση περνά από την owns_portal_token SELECT policy.
  const [signed,setSigned]=useState<Record<string,string[]>>({});
  const photoSig=useMemo(()=>photosKey(requests),[requests]);
  useEffect(()=>{
    let alive=true;
    signMaintenancePhotos(supabase,requests).then(map=>{ if(alive) setSigned(map); });
    return ()=>{ alive=false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[photoSig]);
  const list=[...requests].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  // Αποθηκευμένοι τεχνικοί/συνεργεία του ακινήτου, για ανάθεση χωρίς πληκτρολόγηση.
  const [savedContacts,setSavedContacts]=useState<{id:string;full_name:string;phone:string|null;email:string|null;role:string|null}[]>([]);
  useEffect(()=>{ let alive=true;
    contacts.ofProperty<typeof savedContacts[number]>(supabase,propertyId,'id,full_name,phone,email,role',userId)
      .then(rows=>{ if(alive) setSavedContacts(rows); });
    return ()=>{ alive=false; };
  },[propertyId,userId,supabase]);
  // Ολοκλήρωση με κόστος: το ποσό γίνεται αυτόματα δαπάνη του ακινήτου.
  const [doneFor,setDoneFor]=useState<string|null>(null);
  const [doneCost,setDoneCost]=useState('');
  const setStatus=async(m:MaintenanceReq,status:string)=>{
    setBusy(true);
    await saved('Η κατάσταση του αιτήματος δεν αποθηκεύτηκε', supabase.from('maintenance_requests').update({ status, resolved_at: status==='done'?new Date().toISOString():null }).eq('id',m.id));
    setBusy(false); onRefresh(); notifyOk('Το αίτημα ενημερώθηκε');
  };
  // Ολοκλήρωση εργασίας: σημειώνεται «done» και, αν δοθεί κόστος, καταχωρείται
  // δαπάνη ώστε να μπει αυτόματα στη λογιστική εικόνα του ακινήτου.
  const completeWithCost=async(m:MaintenanceReq)=>{
    const cost=parseFloat(String(doneCost).replace(',','.'));
    setBusy(true);
    await saved('Το αίτημα δεν κλείστηκε', supabase.from('maintenance_requests').update({ status:'done', resolved_at:new Date().toISOString() }).eq('id',m.id));
    if(Number.isFinite(cost)&&cost>0){
      // Η ομάδα ΔΕΝ γραφόταν: το κόστος της επισκευής που πλήρωσε ο ιδιοκτήτης
      // δεν εξέπιπτε ποτέ. Το στρώμα την παράγει από την κατηγορία.
      await saved('Το αίτημα έκλεισε, αλλά το κόστος δεν καταχωρήθηκε στις δαπάνες', expenses.insert(supabase, [expenses.row({ propertyId, userId }, {
        amount:cost, date:todayISO(), paid:true,
        category:'Συντήρηση & Επισκευές', description:[m.title,m.assignee_name].filter(Boolean).join(' · ').slice(0,120),
      })]));
    }
    setBusy(false); setDoneFor(null); setDoneCost(''); onRefresh();
    notifyOk(Number.isFinite(cost)&&cost>0?'Ολοκληρώθηκε και καταχωρήθηκε στις δαπάνες':'Ολοκληρώθηκε');
  };
  const toDamage=async(m:MaintenanceReq)=>{
    setBusy(true);
    await saved('Η φθορά δεν καταγράφηκε', supabase.from('tenant_damages').insert({ tenant_id:tenant.id, property_id:propertyId, user_id:userId, occurred_on:todayISO(), description:[m.title,m.description].filter(Boolean).join(': ').slice(0,500), cost:null, charged_to_tenant:false, repaired:false, notes:'Από αίτημα βλάβης ενοικιαστή' }));
    setBusy(false); onRefresh(); notifyOk('Καταγράφηκε στις φθορές');
  };
  const del=async(m:MaintenanceReq)=>{ if(!(await confirmDialog('Διαγραφή αιτήματος;',{tone:'negative'}))) return; if(await saved('Το αίτημα δεν διαγράφηκε',supabase.from('maintenance_requests').delete().eq('id',m.id))) onRefresh(); };
  const gdt=(d:string|null)=>d?localDay(d).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'}):ABSENT_DATE;
  const openAssign=(m:MaintenanceReq)=>{ setAssignFor(m.id); setAf({name:m.assignee_name||'',contact:m.assignee_contact||''}); };
  const saveAssign=async(m:MaintenanceReq)=>{
    setBusy(true);
    await saved('Η ανάθεση δεν αποθηκεύτηκε', supabase.from('maintenance_requests').update({ assignee_name:af.name.trim()||null, assignee_contact:af.contact.trim()||null, status:m.status==='new'?'in_progress':m.status }).eq('id',m.id));
    setBusy(false); setAssignFor(null); onRefresh(); notifyOk('Η ανάθεση αποθηκεύτηκε');
  };
  // Μήνυμα προς συνεργείο (τίτλος, περιγραφή, ακίνητο, σύνδεσμοι φωτογραφιών).
  const contractorText=(m:MaintenanceReq)=>[
    `Εργασία: ${m.title}`, m.description?`Περιγραφή: ${m.description}`:'',
    tenant.full_name?`Ενοικιαστής: ${tenant.full_name}`:'', m.contact?`Επικοινωνία ενοικιαστή: ${m.contact}`:'',
    (signed[m.id]?.length)?`Φωτογραφίες: ${signed[m.id].join(' ')}`:'',
  ].filter(Boolean).join('\n');

  return (
    <div>
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Αιτήματα βλάβης</SectionTitle>
        <div style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6, margin:'6px 0 18px' }}>
          Αιτήματα που στέλνει ο ενοικιαστής μέσω της πύλης. Διαχειρίσου την κατάστασή τους και, αν πρόκειται για φθορά, κατέγραψέ τα στο ιστορικό φθορών.
        </div>
        {list.length===0?(
          <EmptyState icon={<Wrench size={20}/>} title="Κανένα αίτημα βλάβης ακόμη" hint="Όταν ο ενοικιαστής στείλει αίτημα από την πύλη, θα εμφανιστεί εδώ για διαχείριση." />
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
                    <span style={{ ...s.badge(st.c,st.bg), border:`1px solid color-mix(in srgb, ${st.c} 26%, transparent)`, fontFamily:T.font.sans, whiteSpace:'nowrap' as const }}>{st.label}</span>
                  </div>
                  {m.description&&<div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.6, marginBottom:12, whiteSpace:'pre-wrap' as const }}>{m.description}</div>}
                  {(signed[m.id]?.length??0)>0&&(
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const, marginBottom:12 }}>
                      {signed[m.id].map((url,pi)=>(
                        <a key={pi} href={url} target="_blank" rel="noopener noreferrer" style={{ display:'block', width:64, height:64, borderRadius:8, overflow:'hidden', border:'1px solid var(--border-subtle)' }}>
                          <img src={url} alt="Φωτογραφία βλάβης" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                        </a>
                      ))}
                    </div>
                  )}
                  {(m.assignee_name||m.assignee_contact)&&assignFor!==m.id&&(
                    <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:10 }}>
                      Ανατέθηκε σε: <strong style={{ color:'var(--text-primary)' }}>{m.assignee_name||ABSENT}</strong>{m.assignee_contact?` · ${m.assignee_contact}`:''}
                    </div>
                  )}
                  {assignFor===m.id&&(
                    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:14, marginBottom:10 }}>
                      <div style={{ ...s.g2, marginBottom:10 }}>
                        <TextInput label="Συνεργείο ή τεχνικός" value={af.name} onChange={v=>setAf(a=>({...a,name:v}))} placeholder="Παράδειγμα: Υδραυλικός Παπαδόπουλος"/>
                        <TextInput label="Τηλέφωνο ή ηλεκτρονικό ταχυδρομείο" value={af.contact} onChange={v=>setAf(a=>({...a,contact:v}))} placeholder="69XXXXXXXX"/>
                      </div>
                      {savedContacts.length>0&&(
                        <div style={{ marginBottom:10 }}>
                          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginBottom:6 }}>Από τις επαφές σου</div>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                            {savedContacts.slice(0,8).map(c=>(
                              <button key={c.id} onClick={()=>setAf({ name:c.full_name||'', contact:c.phone||c.email||'' })}
                                style={{ ...s.btnGhost, padding:'6px 11px', fontSize:11 }}>
                                {c.full_name}{c.role?` · ${roleLabel(c.role)}`:''}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
                        <button style={s.btnGhost} onClick={()=>setAssignFor(null)}>Ακύρωση</button>
                        <button style={s.btnGold} disabled={busy} onClick={()=>saveAssign(m)}>Αποθήκευση</button>
                      </div>
                    </div>
                  )}
                  {doneFor===m.id&&(
                    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:14, marginBottom:10 }}>
                      <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.55, marginBottom:10 }}>
                        Κόστος εργασίας; Αν το συμπληρώσεις, καταχωρείται αυτόματα στις δαπάνες του ακινήτου.
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' as const }}>
                        <div style={{ width:150 }}>
                          <TextInput label="Κόστος" suffix="€" value={doneCost} onChange={setDoneCost} placeholder="Προαιρετικό"/>
                        </div>
                        <div style={{ flex:1 }}/>
                        <button style={s.btnGhost} onClick={()=>setDoneFor(null)}>Ακύρωση</button>
                        <button style={s.btnGold} disabled={busy} onClick={()=>completeWithCost(m)}>Ολοκλήρωση</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                    {m.status!=='new'&&<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} disabled={busy} onClick={()=>setStatus(m,'new')}>Νέο</button>}
                    {m.status!=='in_progress'&&<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} disabled={busy} onClick={()=>setStatus(m,'in_progress')}>Σε εξέλιξη</button>}
                    {m.status!=='done'&&<button style={s.btnSm} disabled={busy} onClick={()=>{ setDoneFor(m.id); setDoneCost(''); }}>Ολοκληρώθηκε</button>}
                    <button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} disabled={busy} onClick={()=>openAssign(m)}>{(m.assignee_name||m.assignee_contact)?'Ανάθεση':'Ανάθεση σε συνεργείο'}</button>
                    {m.assignee_contact&&normalizePhone(m.assignee_contact).length>=10&&<a href={whatsappLink(msgDigits(m.assignee_contact),contractorText(m))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>WhatsApp συνεργείου</a>}
                    {m.assignee_contact&&m.assignee_contact.includes('@')&&<a href={`mailto:${m.assignee_contact}?subject=${encodeURIComponent('Εργασία: '+m.title)}&body=${encodeURIComponent(contractorText(m))}`} style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>Μήνυμα στο συνεργείο</a>}
                    <button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} disabled={busy} onClick={()=>toDamage(m)}>Καταγραφή ως φθορά</button>
                    <button style={s.btnDng} disabled={busy} onClick={()=>del(m)}>Διαγραφή</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Ιστορικό ακινήτου: αιτήματα από προηγούμενους ενοικιαστές ή χωρίς
            ενοικιαστή, που αλλιώς δεν θα φαίνονταν πουθενά. Μαζεμένο by default. */}
        {others.length>0&&(
          <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:20, paddingTop:14 }}>
            <button onClick={()=>setHistOpen(o=>!o)} style={{ display:'flex', alignItems:'center', gap:9, width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', textAlign:'left' as const, fontFamily:T.font.sans }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ color:'var(--text-tertiary)', transform:histOpen?'rotate(90deg)':'none', transition:'transform 0.2s', flexShrink:0 }}><path d="M9 6l6 6-6 6"/></svg>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text-secondary)' }}>Ιστορικό ακινήτου</span>
              <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text-tertiary)', fontWeight:600 }}>{others.length} {others.length===1?'αίτημα':'αιτήματα'}</span>
            </button>
            {histOpen&&(
              <div style={{ marginTop:12, display:'flex', flexDirection:'column' as const, gap:6 }}>
                {[...others].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')).map(m=>(
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, background:'var(--bg-base)' }}>
                    <span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:T.font.sans, fontVariantNumeric:'tabular-nums' as const, width:74, flexShrink:0 }}>{gdt(m.created_at)}</span>
                    <span style={{ flex:1, minWidth:0, fontSize:13, color:'var(--text-primary)', fontFamily:T.font.sans, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{m.title}</span>
                    {m.assignee_name&&<span style={{ fontSize:12, color:'var(--text-tertiary)', fontFamily:T.font.sans, whiteSpace:'nowrap' as const }}>{m.assignee_name}</span>}
                    <span style={{ fontSize:11, fontWeight:600, color:m.status==='done'?'var(--text-tertiary)':'var(--text-secondary)', fontFamily:T.font.sans, whiteSpace:'nowrap' as const }}>{m.status==='done'?'Ολοκληρώθηκε':m.status==='in_progress'?'Σε εξέλιξη':'Νέο'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
