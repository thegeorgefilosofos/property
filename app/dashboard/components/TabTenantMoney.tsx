'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { MAX_SCAN_MB } from './scanDoc'
import { qrDataUrl } from '@/lib/qr';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import * as tenantStore from '@/lib/data/tenants';
import * as rentStore from '@/lib/data/rent';
import * as portalStore from '@/lib/data/portal';
import { rentReminder, rentRequest, rentReceipt, rentStage, rentSubject, requestSubject } from '@/lib/tenant/rentMessage';
import { rowsForPeriods } from './rentInstalments';
import {
  s,
  fmt,
  fmtD,
  setRentDueOccurrencePaid,
} from './TabTenantHelpers';
import {
  CPI_BY_YEAR, CPI_SOURCE_URL, CPI_LATEST_YEAR, cpiFor, cpiConfirmedLabel,
} from '@/lib/market/cpi';
import {
  Toggle,
  NumberInput,
  TextInput,
  CustomSelect as SelectField,
  DatePicker,
} from './UIComponents';
import {
  T,
  InfoBanner,
  Badge,
  Btn,
  EmptyState,
  Modal,
  fe,
  fdLong,
  fn,
  fp,
  Spinner,
  ExportButton,
  ABSENT,
  ABSENT_DATE,
  TT,
  pressable,
} from '@/components/Theme';
import {
  Banknote,
} from 'lucide-react';
import { notify, notifyOk, notifyError } from '@/components/Toast';
import { saved } from '@/components/dbWrite';
import { confirmDialog } from '@/components/ConfirmDialog';
import { downloadTableXlsx, csvDate } from './exportCsv';
import { brandName, useReportBranding } from '@/lib/reportBranding';
import { reportHead, reportHeader, reportSection, reportRow, reportDisclaimer, openReport, rEur, rSigned, rPct, rEsc, rDate } from './reportPdf';
import { whatsappLink, viberLink } from '@/lib/clients/messages';
import { SYSTEM_PROMPT } from './DocumentScan';
import { classifyDocType, type ScannedDoc } from '@/lib/billing/documents';
import { hasFeature } from '@/lib/billing/entitlements';
import type { PlanId } from '@/lib/billing/plans';
import {
  daysUntil, isoYear, isoMonth, localDay,
} from '@/lib/core/time';
import { MONTHS_NOM, MONTHS_SHORT, monthNom, monthGen } from '@/lib/core/months';
import { INK, INK_MUTED, RULE } from '@/lib/print/ink';
import { AadeLinks } from '@/components/AadeLink';
import { failed } from '@/lib/core/dbError';
// Το Αρχείο έχει ένα σπίτι: lib/data/documents.
import * as documents from '@/lib/data/documents';
import {
  monthsPerInstalment,
  periodLabel,
  type InstalmentPeriod,
} from '@/lib/rent/frequency';
// Τα σχήματα, οι κανόνες και οι κοινοί βοηθοί της καρτέλας.
import {
  PAY_METHODS,
  todayISO,
  tenantBaseRent,
  tenantServicesCharge,
  tenantServiceLines,
  r2,
  expectedPeriods,
  payStatus,
  numify,
  msgDigits,
  compsVarianceWarning,
  type Tenant,
  type RentPayment,
  type TenantDamage,
  type RentComp,
  type PayMethod,
} from './TabTenantTypes';
import {
  SectionTitle,
  KpiCard,
  StatusBadge,
  DataRow,
  AlertBar,
} from './TabTenantParts';

// ═══════════════════════════════════════════════════════════════════════════
// Ο ΕΝΟΙΚΙΑΣΤΗΣ: ΟΙ ΟΘΟΝΕΣ ΤΩΝ ΧΡΗΜΑΤΩΝ
// ─────────────────────────────────────────────────────────────────────────
// Δόσεις, εγγύηση, αναπροσαρμογή ενοικίου, ανανέωση. Ό,τι έχει ποσό και
// ημερομηνία πληρωμής. Ζούσαν μαζί με τις οθόνες της κατάστασης του ακινήτου
// σε ένα αρχείο τριών χιλιάδων γραμμών, όπου καμία αλλαγή δεν ήταν τοπική.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Design tokens, shared source of truth (components/Theme) ────────────────
const labelStyle = { ...TT.label, marginBottom:7 };

// ─── HTML escaping for values interpolated into document.write() templates ────

export function RentAdjustView({ tenant, userId }:{ tenant:Tenant; userId:string }) {
  const branding = useReportBranding(userId);
  const TDE=CPI_BY_YEAR;
  const fmtE = fe;
  const fmtDate=(d:string|null)=>d?new Date(d+'T00:00:00').toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'}):ABSENT_DATE;
  const rent=tenant.monthly_rent||0;
  const daysExp=tenant.lease_end?(daysUntil(tenant.lease_end) ?? 0):null;
  const thisYear=new Date().getFullYear();
  // Προεπιλογή το ΤΡΕΧΟΝ έτος: αν δεν έχει τιμή, ο χρήστης το βλέπει αμέσως και
  // δίνει το ποσοστό ο ίδιος, αντί να στείλει σιωπηλά τον περσινό δείκτη.
  const [yr,setYr]=useState(String(thisYear));
  const [useCustom,setUseCustom]=useState(cpiFor(thisYear)===null);
  const [customPct,setCustomPct]=useState('');
  const official=cpiFor(parseInt(yr));            // null = δεν το ξέρουμε
  const custom=parseFloat(customPct);
  const hasCustom=useCustom&&Number.isFinite(custom);
  const pct=hasCustom?custom:(official??0);
  // Χωρίς επίσημο δείκτη ΚΑΙ χωρίς δικό του ποσοστό, δεν υπάρχει αναπροσαρμογή
  // να δείξουμε — και σίγουρα δεν υπάρχει έγγραφο να εκτυπωθεί.
  const hasPct=hasCustom||official!==null;
  const newRent=rent*(1+pct/100);
  const diff=newRent-rent;
  const isExpired=daysExp!==null&&daysExp<0;
  const isExpiring=daysExp!==null&&daysExp>=0&&daysExp<=60;
  // Λίστα ετών: όσα έχουν τιμή, συν το τρέχον όταν δεν έχει (για να μπορεί να επιλεγεί).
  const years=useMemo(()=>{
    const ys=Object.keys(TDE).map(Number);
    if(!ys.includes(thisYear)) ys.push(thisYear);
    return ys.sort((a,b)=>b-a);
  },[TDE,thisYear]);

  // 42 ήταν off-scale: κάθε άλλο πεδίο του app (UIComponents.FIELD_HEIGHT, settingsField)
  // είναι 40, οπότε αυτό το select καθόταν 2px ψηλότερα από τα διπλανά του.
  const selectStyle:React.CSSProperties={width:'100%',height:T.h.lg,background:'var(--bg-elevated)',border:'1px solid var(--border-default)',borderRadius:T.radius.inner,padding:'0 14px',color:'var(--text-primary)',fontSize:14,letterSpacing:0,fontFamily:T.font.sans,outline:'none',cursor:'pointer'};

  const genLetter=()=>{
    if(!hasPct) return;   // δεν παράγεται έγγραφο χωρίς ποσοστό με προέλευση
    const today_str=rDate();
    const afmInline=tenant.afm?` · ΑΦΜ ${tenant.afm}`:'';
    const brandTag=branding?.companyName?` · ${brandName(branding)}`:' · Property OS';
    // ΤΟ ΚΡΙΣΙΜΟ: το έγγραφο λέει ΤΙ ΕΙΝΑΙ το ποσοστό. Επίσημος δείκτης με
    // ημερομηνία επιβεβαίωσης, ή ποσοστό που όρισε ο εκμισθωτής. Ποτέ το δεύτερο
    // ντυμένο ως το πρώτο — ο παραλήπτης είναι άλλος άνθρωπος και το κρατά.
    const basisLine=hasCustom
      ? `Σας γνωστοποιούμε ότι το μηνιαίο μίσθωμα αναπροσαρμόζεται με ποσοστό <strong>${rPct(pct)}</strong>, όπως προβλέπεται στη σύμβαση μίσθωσης, ως εξής:`
      : `Σας γνωστοποιούμε ότι, βάσει της μέσης ετήσιας μεταβολής του Δείκτη Τιμών Καταναλωτή (ΔΤΚ) έτους <strong>${rEsc(yr)}</strong> (${rEsc(cpiConfirmedLabel())}), το μηνιαίο μίσθωμα αναπροσαρμόζεται ως εξής:`;
    const html=reportHead('Ειδοποίηση αναπροσαρμογής μισθώματος')
      + `<body><div class="page">`
      + reportHeader(branding, 'Αναπροσαρμογή μισθώματος', { rightLabel:'Ημερομηνία', rightValue:today_str, rightNote:hasCustom?'Συμβατικό ποσοστό':`ΔΤΚ ${yr}` })
      + `<h1>Ειδοποίηση αναπροσαρμογής μισθώματος</h1>`
      + `<div class="sub">${hasCustom?'Βάσει του ποσοστού αναπροσαρμογής της σύμβασης':`Βάσει Δείκτη Τιμών Καταναλωτή (ΔΤΚ) ${rEsc(yr)}`}${rEsc(brandTag)}</div>`
      + `<div class="note"><strong>Ημερομηνία:</strong> ${rEsc(today_str)}</div>`
      + `<div class="note">Προς: <strong>${rEsc(tenant.full_name)}</strong>${rEsc(afmInline)}</div>`
      + `<div class="note">${basisLine}</div>`
      + reportSection('Αναπροσαρμογή μισθώματος')
      + `<table><tbody>`
        + reportRow('Τρέχον μηνιαίο μίσθωμα', rEur(rent))
        + reportRow(hasCustom?'Ποσοστό αναπροσαρμογής (σύμβαση)':`ΔΤΚ ${yr}`, rPct(pct))
        + reportRow('Αύξηση μισθώματος', rSigned(diff))
        + reportRow('Νέο μηνιαίο μίσθωμα', rEur(newRent), 'result')
      + `</tbody></table>`
      + `<div class="note">Η αναπροσαρμογή ισχύει από την επόμενη μισθωτική περίοδο μετά την κοινοποίηση της παρούσας ειδοποίησης.</div>`
      + (hasCustom?'':`<div class="note">Πηγή ποσοστού: ${rEsc(cpiConfirmedLabel())}.</div>`)
      + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:64px">`
        + `<div style="border-top:1px solid ${RULE};padding-top:10px;font-size:11px;color:${INK_MUTED}"><div style="font-weight:600;margin-bottom:4px;color:${INK}">Ο εκμισθωτής</div><div style="height:40px"></div><div>Υπογραφή / Σφραγίδα</div></div>`
        + `<div style="border-top:1px solid ${RULE};padding-top:10px;font-size:11px;color:${INK_MUTED}"><div style="font-weight:600;margin-bottom:4px;color:${INK}">Ο μισθωτής</div><div style="margin-bottom:2px;color:${INK}">${rEsc(tenant.full_name)}</div>${tenant.afm?`<div>ΑΦΜ: ${rEsc(tenant.afm)}</div>`:''}</div>`
      + `</div>`
      + reportDisclaimer(hasCustom
        ? 'Το ποσοστό αναπροσαρμογής δηλώθηκε από τον εκμισθωτή και δεν αποτελεί επίσημο στατιστικό στοιχείο. Το παρόν έχει ενημερωτικό χαρακτήρα· για νομικές υποθέσεις συμβουλευτείτε δικηγόρο.'
        : `Η αναπροσαρμογή βασίζεται στη μέση ετήσια μεταβολή του ΔΤΚ (${cpiConfirmedLabel()}) και στο άρθρο 288 ΑΚ. Επιβεβαιώστε την τιμή στην πηγή πριν την κοινοποίηση. Το παρόν έχει ενημερωτικό χαρακτήρα· για νομικές υποθέσεις συμβουλευτείτε δικηγόρο.`, branding)
      + `</div></body></html>`;
    openReport(html);
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
          {[{label:'Νομική Βάση',value:'Αρ. 288 ΑΚ'},{label:'Συχνότητα',value:'Μία φορά/έτος'},{label:'Τελευταίος δείκτης',value:String(CPI_LATEST_YEAR)}].map((item,i)=>(
            <div key={i} style={{ background:'var(--bg-elevated)', borderRadius:T.radius.inner, padding:'12px 14px', textAlign:'center' as const }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', marginBottom:4 }}>{item.value}</div>
              <div style={{ fontSize:9, color:'var(--text-secondary)', textTransform:'uppercase' as const, letterSpacing:'0.1em', fontFamily:T.font.sans }}>{item.label}</div>
            </div>
          ))}
        </div>
        {/* Η προέλευση του νούμερου, στην οθόνη — το ίδιο κείμενο μπαίνει και στο έγγραφο */}
        <div style={{ marginTop:12, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
          {cpiConfirmedLabel()}. <a href={CPI_SOURCE_URL} target="_blank" rel="noopener noreferrer" style={{ color:'var(--accent)' }}>Έλεγχος στην πηγή</a>
        </div>
      </div>

      {(isExpired||isExpiring)&&(
        <AlertBar
          text={isExpired?`Το μισθωτήριο έληξε στις ${fmtDate(tenant.lease_end)}, ανανέωσε άμεσα πριν οποιαδήποτε αναπροσαρμογή`:`Λήγει σε ${daysExp} ημέρες (${fmtDate(tenant.lease_end)}), προετοίμασε ανανέωση εγκαίρως`}
          level={isExpired?'critical':'warning'}
        />
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:16 }}>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Υπολογιστής αναπροσαρμογής</SectionTitle>

          <div style={{ background:'var(--bg-elevated)', borderRadius:T.radius.inner, padding:'16px 18px', marginBottom:18 }}>
            <div style={{ fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:6 }}>Τρέχον μηνιαίο μίσθωμα</div>
            <div style={{ fontSize:28, fontWeight:700, color:'var(--text-primary)', fontFamily:T.font.num, fontVariantNumeric:'tabular-nums', lineHeight:1 }}>{fmtE(rent)}</div>
            {tenant.lease_end&&<div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:4 }}>Λήξη: {fmtDate(tenant.lease_end)}</div>}
          </div>

          <div style={{ marginBottom:16 }}>
            <div style={{ ...labelStyle, marginBottom:8 }}>Έτος αναπροσαρμογής</div>
            <SelectField value={yr} onChange={v=>{ setYr(v); setUseCustom(cpiFor(parseInt(v))===null); }}
              options={years.map(y=>{ const v=cpiFor(y); return { value:String(y), label:`${y}${v===null?', χωρίς δείκτη ακόμη':`, ΔΤΚ: ${v>=0?'+':''}${fp(v)}`}` }; })}/>
          </div>

          {/* Έτος χωρίς δείκτη: το λέμε, δεν το μπαλώνουμε */}
          {official===null&&(
            <div style={{ background:'var(--warning-dim)', border:'1px solid color-mix(in srgb, var(--warning) 26%, transparent)', borderLeft:'3px solid var(--warning)', borderRadius:T.radius.inner, padding:'11px 14px', marginBottom:16, fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
              Για το {yr} δεν έχουμε επιβεβαιωμένη μέση ετήσια μεταβολή ΔΤΚ. Ο τελευταίος δείκτης που έχουμε είναι του {CPI_LATEST_YEAR}. Δώσε το ποσοστό που προβλέπει η σύμβασή σου. Θα γραφτεί στο έγγραφο ως ποσοστό που όρισες εσύ, όχι ως στοιχείο της ΕΛΣΤΑΤ.
            </div>
          )}

          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, padding:'12px 14px', background:'var(--bg-elevated)', borderRadius:T.radius.inner }}>
            <Toggle on={useCustom} onChange={setUseCustom} size="sm"/>
            <span style={{ fontSize:12, color:'var(--text-primary)', fontFamily:T.font.sans }}>Ποσοστό της σύμβασης</span>
          </div>
          {useCustom&&(
            <div style={{ marginBottom:16 }}>
              <div style={{ ...labelStyle, marginBottom:8 }}>Ποσοστό αναπροσαρμογής (%)</div>
              {/* ΤΟ ΠΕΔΙΟ ΔΕΧΟΤΑΝ ΑΡΝΗΤΙΚΟ ΠΟΣΟΣΤΟ. Το ποσοστό είναι αυτό που
                  γράφει η σύμβαση, και σύμβαση δεν ορίζει αρνητική
                  αναπροσαρμογή· ένα «-3» θα κατέβαζε σιωπηλά το ενοίκιο σε κάθε
                  υπολογισμό. Και η υπόδειξη έγραφε «3.5» με αγγλική υποδιαστολή,
                  μέσα σε εφαρμογή που γράφει παντού ελληνικό κόμμα. Το κενό
                  πεδίο μένει κενό και η υπόδειξη πάει από κάτω, με λέξεις. */}
              <input type="number" min={0} value={customPct} onChange={e=>setCustomPct(e.target.value)} placeholder="" step="0.1"
                style={{ ...selectStyle, border:'1px solid var(--border-default)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontSize:14 }}/>
              <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:5 }}>Όπως το γράφει η σύμβαση, για παράδειγμα τρία και μισό.</div>
            </div>
          )}

          {/* Ιστορικό ΔΤΚ */}
          <div title="ΔΤΚ: Δείκτης Τιμών Καταναλωτή, βάση αναπροσαρμογής ενοικίου" style={{ ...labelStyle, marginBottom:10 }}>Ιστορικό ΔΤΚ</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 105px), 1fr))', gap:5 }}>
            {Object.entries(TDE).sort(([a],[b])=>parseInt(b)-parseInt(a)).map(([year,rate])=>{
              const active=parseInt(year)===parseInt(yr);
              return (
                <div key={year} {...pressable(()=>{setYr(year);setUseCustom(false);})}
                  style={{ background:active?'var(--accent-dim)':'var(--bg-elevated)', border:`1px solid ${active?'var(--accent)':'var(--border-subtle)'}`, borderRadius:T.radius.badge, padding:'7px 4px', textAlign:'center' as const, cursor:'pointer', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:active?'var(--accent)':'var(--text-secondary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{rate>=0?'+':''}{fp(rate)}</div>
                  <div style={{ fontSize:9, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:2 }}>{year}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          {rent>0&&hasPct&&(
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap:10, marginBottom:14 }}>
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'18px 16px' }}>
                  <div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:6 }}>Τρέχον μίσθωμα</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'var(--text-primary)', fontFamily:T.font.num, fontVariantNumeric:'tabular-nums' }}>{fmtE(rent)}</div>
                </div>
                <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'18px 16px' }}>
                  <div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:6 }}>Νέο μίσθωμα</div>
                  <div style={{ fontSize:18, fontWeight:700, color:'var(--accent)', fontFamily:T.font.num, fontVariantNumeric:'tabular-nums' }}>{fmtE(newRent)}</div>
                </div>
              </div>

              <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:18, marginBottom:14 }}>
                {[{label:hasCustom?'Ποσοστό σύμβασης':`ΔΤΚ ${yr}`,value:`${pct>=0?'+':''}${fp(pct)}`},
                  {label:'Μεταβολή ανά Μήνα',value:`${diff>=0?'+':''}${fmtE(diff)}`},
                  {label:'Μεταβολή ανά Έτος',value:`${diff>=0?'+':''}${fmtE(diff*12)}`}
                ].map((row,i)=>(
                  <DataRow key={i} label={row.label} value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{row.value}</span>}/>
                ))}
                <div style={{ marginTop:10, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
                  {hasCustom?'Ποσοστό που όρισες εσύ βάσει της σύμβασης. Το έγγραφο θα το αναφέρει ως τέτοιο.':cpiConfirmedLabel()}
                </div>
              </div>

              <button onClick={genLetter} style={{ width:'100%', height:T.h.lg, borderRadius:T.radius.btn, border:'none', background:'var(--accent)', color:'var(--accent-text)', cursor:'pointer', fontSize:13, fontFamily:T.font.sans, fontWeight:700, letterSpacing:'0.04em', marginBottom:12 }}>
                Εκτύπωση Ειδοποίησης Αναπροσαρμογής
              </button>
            </>
          )}
          {/* Χωρίς ποσοστό δεν βγαίνει έγγραφο: το κουμπί απενεργοποιείται και λέει γιατί */}
          {rent>0&&!hasPct&&(
            <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:18, marginBottom:14 }}>
              <button disabled title="Δώσε πρώτα το ποσοστό αναπροσαρμογής" style={{ width:'100%', height:T.h.lg, borderRadius:T.radius.btn, border:'1px solid var(--border-default)', background:'transparent', color:'var(--text-tertiary)', cursor:'not-allowed', fontSize:13, fontFamily:T.font.sans, fontWeight:600 }}>
                Εκτύπωση Ειδοποίησης Αναπροσαρμογής
              </button>
              <div style={{ marginTop:10, fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
                Η ειδοποίηση φεύγει σε άλλον άνθρωπο και μένει στα χαρτιά του. Δεν την εκτυπώνουμε με νούμερο που δεν έχει προέλευση. Συμπλήρωσε το ποσοστό της σύμβασης ή επίλεξε έτος με επιβεβαιωμένο δείκτη.
              </div>
            </div>
          )}

          <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:18 }}>
            <SectionTitle>Υποχρεώσεις και Σύνδεσμοι</SectionTitle>
            {/* ΤΕΣΣΕΡΑ ΛΑΘΗ ΣΕ ΤΡΕΙΣ ΓΡΑΜΜΕΣ, ΚΑΙ ΤΑ ΤΕΣΣΕΡΑ ΟΡΑΤΑ ΣΤΗΝ ΟΘΟΝΗ:
             *
             * 1. «ΑΑΑΔΕ» με τρία άλφα. Δύο φορές.
             * 2. «Έως 30 Ιουνίου κάθε έτους» για το Ε2 — ΛΑΘΟΣ, και τρίτη
             * ημερομηνία δίπλα στις δύο του `greekTaxCalendar.ts` (15
             * Απριλίου αυτόματη οριστικοποίηση, 15 Ιουλίου καταληκτική).
             * Καρφωμένη προθεσμία δίπλα σε σύνδεσμο είναι ακριβώς το
             * αντίγραφο που το ημερολόγιο γράφτηκε για να εξαλείψει.
             * 3. Ο σύνδεσμος του Ε2 έδειχνε σε σελίδα ΜΙΣΘΩΤΗΡΙΩΝ.
             * 4. Δύο διαφορετικά πράγματα («Καταχώρηση Μισθωτηρίου» και
             * «Πρότυπο Σύμβασης») μοιράζονταν την ίδια διεύθυνση — άρα το
             * ένα από τα δύο ήταν σίγουρα λάθος.
             *
             * Οι προορισμοί έρχονται πλέον από το `lib/tax/aade.ts`, όπου
             * ζουν μία φορά, και μαζί τους η ΔΙΑΔΡΟΜΗ ΣΕ ΛΕΞΕΙΣ — που είναι
             * το πραγματικά χρήσιμο: η ΑΑΔΕ αλλάζει διευθύνσεις, τα ονόματα
             * των υπηρεσιών της όχι. Το «Πρότυπο Σύμβασης» έφυγε: η
             * εφαρμογή παράγει ήδη μισθωτήριο, δεν στέλνει τον χρήστη αλλού
             * για να κατεβάσει άλλο. */}
            <AadeLinks actions={['lease','income']}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Communication View ────────────────────────────────────────────────────────

export function PaymentsView({ tenant, propertyId, userId, payments, onRefresh, plan='free' }:{
  tenant:Tenant; propertyId:string; userId:string; payments:RentPayment[]; onRefresh:()=>void; plan?:PlanId;
}) {
  // ── Η ΕΙΣΠΡΑΞΗ ΕΙΝΑΙ ΧΡΕΩΣΙΜΗ. ΔΕΝ ΗΤΑΝ ΠΟΥΘΕΝΑ ΚΛΕΙΔΩΜΕΝΗ. ────────────
  // Το `rent_collection` ξεκλειδώνει από το «Ένα ακίνητο» και πάνω, και είναι
  // ρητά «αιτήματα είσπραξης ΚΑΙ υπενθυμίσεις οφειλών». Η διατύπωση ορίζει και
  // το όριο: η ΑΠΟΔΕΙΞΗ σε πληρωμένο μίσθωμα δεν είναι είσπραξη, είναι
  // ευγένεια προς τον μισθωτή που πλήρωσε — μένει ανοιχτή σε όλους.
  //
  // Οι κλειδωμένες ενέργειες εδώ ΚΡΥΒΟΝΤΑΙ αντί να δείχνουν λουκέτο: το κελί
  // «Ενέργειες» κρατά ήδη ώς επτά κουμπιά, και ένα λουκέτο ανάμεσά τους δεν
  // διαβάζεται ως πρόσκληση, διαβάζεται ως θόρυβος. Η πρόσκληση ζει στη
  // σύγκριση πακέτων, όπου υπάρχει χώρος να ειπωθεί ολόκληρη.
  const canCollect = hasFeature({ plan }, 'rent_collection');
  const supabase=createClient();
  const branding=useReportBranding(userId);
  const [rentDueDay,setRentDueDay]=useState(Math.min(Math.max(1,tenant.rent_due_day||1),28));
  const [busy,setBusy]=useState(false);
  const [addOpen,setAddOpen]=useState(false);
  const [payF,setPayF]=useState({period_month:new Date().getMonth()+1,period_year:new Date().getFullYear(),amount:'',method:'Τραπεζική κατάθεση' as PayMethod,paid:true,paid_date:todayISO(),notes:''});
  const [mark,setMark]=useState<{p:RentPayment;method:PayMethod;receipt:string}|null>(null);
  const [req,setReq]=useState<RentPayment|null>(null); // αίτημα πληρωμής (IBAN/QR/κοινοποίηση)
  const [copied,setCopied]=useState(false);
  // Ακριβώς οι δύο στήλες που διαβάζει το `propLabel()` — όχι όλη η γραμμή. Το
  // `Record<string,any>` σήμαινε ότι ΚΑΘΕ όνομα πεδίου περνούσε τη μεταγλώττιση:
  // ένα `prop?.adress` θα έδινε σιωπηλά κενή ετικέτα ακινήτου στη βεβαίωση
  // ενοικίου, ακριβώς όπως το `properties` που έλειπε (σχόλιο από κάτω).
  const [prop,setProp]=useState<{name:string;address:string|null}|null>(null);
  const [scan,setScan]=useState<{stage:'scanning'|'match'|'error';msg?:string;doc?:ScannedDoc;periodId?:string;method?:PayMethod;docId?:string|null}|null>(null);
  const fileRef=React.useRef<HTMLInputElement>(null);

  // Ο πίνακας λέγεται `user_properties`. Το `properties` δεν υπήρξε ΠΟΤΕ, οπότε
  // το `prop` έμενε πάντα null και το ακίνητο ΔΕΝ αναγραφόταν στη βεβαίωση
  // ενοικίου ούτε στα μηνύματα υπενθύμισης — χωρίς κανένα σφάλμα στην οθόνη.
  useEffect(()=>{ properties.one<{name:string;address:string|null}>(supabase, propertyId, 'name,address').then(setProp); },[propertyId]);

  // ── Η ΠΥΛΗ ΤΟΥ ΜΙΣΘΩΤΗ, ΓΙΑ ΝΑ ΤΑΞΙΔΕΨΕΙ ΜΕ ΤΟ ΜΗΝΥΜΑ ────────────────────
  // Η πύλη υπήρχε και ΚΑΝΕΝΑ μήνυμα δεν την έστελνε: ο σύνδεσμος αντιγραφόταν
  // με το χέρι από άλλη οθόνη, ή δεν έφτανε ποτέ. Χωρίς αυτόν, ο μισθωτής δεν
  // έχει πού να δει τι πληρώνει και τι έχει πληρώσει — και ρωτά τον ιδιοκτήτη.
  const [portalToken,setPortalToken]=useState<string|null>(null);
  useEffect(()=>{
    let live=true;
    portalStore.link(supabase, propertyId, userId).then(({ row })=>{ if(live) setPortalToken(row?.token||null); });
    return ()=>{ live=false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[propertyId,userId]);
  const portalUrl=portalStore.portalUrl(portalToken);

  const periodMonths=monthsPerInstalment(tenant.payment_frequency);
  const expected=useMemo(()=>expectedPeriods(tenant,rentDueDay),[tenant,rentDueDay]);
  const existingKeys=useMemo(()=>new Set(payments.map(p=>`${p.period_year}-${p.period_month}`)),[payments]);
  const missing=useMemo(()=>expected.filter(e=>!existingKeys.has(`${e.year}-${e.month}`)),[expected,existingKeys]);

  const genForRows=useCallback(async(rows:InstalmentPeriod[])=>{
    if(!rows.length) return;
    // Η ΣΥΝΤΑΓΗ ΤΗΣ ΔΟΣΗΣ ΔΕΝ ΓΡΑΦΕΤΑΙ ΕΔΩ. Ζει στο `rentInstalments.ts`, γιατί
    // τις ίδιες γραμμές φτιάχνει πλέον και η αποθήκευση της μίσθωσης: δύο
    // αντίγραφα του τύπου «(ενοίκιο + υπηρεσίες) × μήνες» σημαίνει δύο
    // διαφορετικά ποσά για την ίδια μίσθωση, ανάλογα με το ποιος το έγραψε.
    const payload=rowsForPeriods(rows,tenant,propertyId,userId);
    // UNIQUE(tenant_id,period_year,period_month) προστατεύει· αγνόησε διπλότυπα.
    const{error}=await rentStore.upsertPeriods(supabase,payload,{ignoreDuplicates:true});
    // ΤΟ /* swallow */ ΕΚΡΥΒΕ ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΑΔΕΙΑΖΕ ΤΟ ΛΟΓΙΣΤΗΡΙΟ.
    // Το upsert αποτύγχανε ΠΑΝΤΑ (payment_date NOT NULL, και κανένα μοναδικό
    // ευρετήριο για το onConflict), το σφάλμα καταπινόταν εδώ, και ένα
    // notifyOk('Δημιουργήθηκαν N δόσεις') ακολουθούσε αμέσως μετά. Ο ιδιοκτήτης
    // δεν είχε κανέναν τρόπο να μάθει ότι ο πίνακας έμενε κενός — και μαζί του
    // η Πύλη ενοικιαστή, η οφειλή και το Ε2.
    if(error) { notifyError(failed('Οι δόσεις δεν δημιουργήθηκαν', error)); return false; }
    return true;
  },[tenant,propertyId,userId]);

  // Lazy: όταν ανοίγει η προβολή και λείπουν δόσεις, δημιούργησέ τες μία φορά.
  const didLazy=React.useRef(false);
  useEffect(()=>{
    if(didLazy.current) return;
    if(missing.length>0){ didLazy.current=true; (async()=>{ await genForRows(missing); onRefresh(); })(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[missing.length]);

  // Το μήνυμα λέει «δημιουργήθηκαν» ΜΟΝΟ αν όντως γράφτηκαν.
  const generateNow=async()=>{ setBusy(true); const ok=await genForRows(missing); setBusy(false); onRefresh(); if(ok) notifyOk(missing.length?`Δημιουργήθηκαν ${missing.length} δόσεις`:'Οι δόσεις είναι ενημερωμένες'); };

  const sorted=useMemo(()=>[...payments].sort((a,b)=>b.period_year-a.period_year||b.period_month-a.period_month),[payments]);
  const open=useMemo(()=>payments.filter(p=>!p.paid),[payments]);
  const overdue=useMemo(()=>payments.filter(p=>payStatus(p)==='overdue'),[payments]);
  const arrearsTotal=overdue.reduce((a,p)=>a+p.amount,0);
  const received=payments.filter(p=>p.paid).reduce((a,p)=>a+p.amount,0);

  const exportPaymentsXlsx = () => {
    const headers = ['Περίοδος','Ποσό (€)','Κατάσταση','Τρόπος','Ημερομηνία πληρωμής','Λήξη','Καθυστέρηση (ημέρες)','Σημειώσεις'];
    const rows = sorted.map(p=>[periodLabel(p.period_year,p.period_month,periodMonths,monthNom),p.amount,payStatus(p)==='paid'?'Πληρώθηκε':payStatus(p)==='overdue'?'Ληξιπρόθεσμο':'Εκκρεμεί',p.method||'',csvDate(p.paid_date),csvDate(p.due_date),p.days_late||0,(p.notes||'').replace(/\n/g,' ')]);
    downloadTableXlsx(`Εισπράξεις ενοικίου ${todayISO()}`, {
      title: 'Εισπράξεις ενοικίου', subject: tenant.full_name || undefined, headers, rows,
    });
  };

  // Τρέχουσα ανάλυση δόσης βάσει προφίλ μισθωτή (ενοίκιο + υπηρεσίες).
  // Η σύγκριση «ξεπερασμένης» δόσης γίνεται με το ποσό ΤΗΣ ΔΟΣΗΣ, όχι του μήνα.
  // Αλλιώς, με τριμηνιαία εξόφληση ΚΑΘΕ εκκρεμής δόση θα φαινόταν ξεπερασμένη
  // (τριπλάσια από το μηνιαίο) και η οθόνη θα πρότεινε αενάως «συγχρονισμό» που
  // θα την υποτριπλασίαζε.
  const baseRent=r2(tenantBaseRent(tenant)*periodMonths);
  const svcCharge=r2(tenantServicesCharge(tenant)*periodMonths);
  const targetAmt=r2(baseRent+svcCharge);
  // Εκκρεμείς δόσεις με ποσό διαφορετικό από το τρέχον (π.χ. άλλαξε ενοίκιο ή υπηρεσίες).
  // Εξαιρούνται όσες δήλωσε ο μισθωτής — έχει δεσμευτεί σε εκείνο το ποσό.
  const staleUnpaid=useMemo(()=>open.filter(p=>!p.tenant_declared && Math.round((p.amount||0)*100)!==Math.round(targetAmt*100)),[open,targetAmt]);
  // Δόσεις που ο μισθωτής δήλωσε ως πληρωμένες μέσω πύλης — αναμένουν επιβεβαίωση είσπραξης.
  const declaredPending=useMemo(()=>open.filter(p=>p.tenant_declared),[open]);
  const syncUnpaidToTarget=async()=>{
    const ids=staleUnpaid.map(p=>p.id); if(!ids.length) return;
    setBusy(true);
    // Ενημερώνει μόνο τις συγκεκριμένες εκκρεμείς δόσεις (όχι δηλωμένες/χειροκίνητες εκτός λίστας).
    const okSync=await saved('Οι δόσεις δεν ενημερώθηκαν', rentStore.updateMany(supabase,ids,{amount:targetAmt,base_rent:baseRent,services_charge:svcCharge}));
    setBusy(false); if(!okSync) return;
    onRefresh(); notifyOk('Οι εκκρεμείς δόσεις ενημερώθηκαν');
  };

  const doMarkPaid=async(p:RentPayment,method:PayMethod,receipt:string,paidDate:string,docId?:string|null)=>{
    // ΕΙΣΠΡΑΞΗ ΕΝΟΙΚΙΟΥ. Αν αυτό αποτύχει σιωπηλά, ο ιδιοκτήτης θεωρεί ότι
    // πληρώθηκε, η δόση μένει ανοιχτή, και το ξαναβλέπει μήνες μετά στη δήλωση.
    // Οι ημέρες καθυστέρησης υπολογίζονταν εδώ, με τον ίδιο τύπο γραμμένο και
    // δέκα γραμμές πιο κάτω. Ο τύπος ζει τώρα στο στρώμα, μία φορά.
    if(!await saved('Η πληρωμή δεν καταχωρήθηκε', rentStore.markPaid(supabase,p.id,p.due_date,paidDate,method,{receipt_url:receipt||null,receipt_doc_id:docId??p.receipt_doc_id??null}))) return;
    await setRentDueOccurrencePaid(supabase,tenant.id,propertyId,p.period_year,p.period_month,true);
    onRefresh(); notifyOk('Καταχωρήθηκε ως πληρωμένο');
  };
  const doUnpay=async(p:RentPayment)=>{ if(!await saved('Η αναίρεση δεν αποθηκεύτηκε', rentStore.markUnpaid(supabase,p.id))) return; await setRentDueOccurrencePaid(supabase,tenant.id,propertyId,p.period_year,p.period_month,false); onRefresh(); };

  const savePay=async()=>{
    // Ήταν ΠΡΑΣΙΝΟ ενώ πρόκειται για σφάλμα επικύρωσης — το παλιό banner είχε έναν
    // μόνο τόνο για τα πάντα. Τώρα ο τόνος λέει την αλήθεια.
    if(!payF.amount){notify('Συμπλήρωσε ποσό',{tone:'warning'});return;}
    setBusy(true);
    const paidDate=payF.paid?payF.paid_date:null;
    const due=`${payF.period_year}-${String(payF.period_month).padStart(2,'0')}-${String(Math.min(Math.max(1,rentDueDay),28)).padStart(2,'0')}`;
    const{error:payErr}=await rentStore.upsertPeriod(supabase,{
      tenant_id:tenant.id,property_id:propertyId,user_id:userId,
      period_month:payF.period_month,period_year:payF.period_year,
      amount:Math.max(0,parseFloat(payF.amount)),due_date:due,notes:payF.notes||null,
      ...(payF.paid&&paidDate ? rentStore.paidFields(due,paidDate,payF.method) : rentStore.unpaidFields()),
    });
    // Ίδιο σφάλμα, δεύτερο σημείο: η καταχώρηση πληρωμής απορριπτόταν και το
    // «Πληρωμή καταχωρήθηκε» εμφανιζόταν ούτως ή άλλως.
    if(payErr){ setBusy(false); notifyError(failed('Η πληρωμή δεν καταχωρήθηκε', payErr)); return; }
    await setRentDueOccurrencePaid(supabase,tenant.id,propertyId,payF.period_year,payF.period_month,payF.paid);
    setBusy(false);setAddOpen(false);setPayF({period_month:new Date().getMonth()+1,period_year:new Date().getFullYear(),amount:'',method:'Τραπεζική κατάθεση',paid:true,paid_date:todayISO(),notes:''});
    onRefresh();notifyOk('Πληρωμή καταχωρήθηκε');
  };

  // Το user_properties έχει `name` και `address` — όχι `title`/`label`, που ήταν
  // υποθέσεις πάνω σε πίνακα που δεν υπήρχε.
  // Το `as string` ήταν το τίμημα του `Record<string,any>`: χωρίς σχήμα, η
  // αλυσίδα `||` έβγαζε `any`. Με δηλωμένες τις δύο στήλες βγάζει ήδη `string`.
  const propLabel=()=> prop?.address||prop?.name||'';
  // Η ΕΤΙΚΕΤΑ ΛΕΕΙ ΤΟ ΕΥΡΟΣ, ΟΧΙ ΤΟΝ ΠΡΩΤΟ ΜΗΝΑ. Με τριμηνιαία εξόφληση, το
  // «Ιανουάριος 2026» δίπλα σε ποσό τριών μισθωμάτων διαβάζεται ως τριπλάσιο
  // μηνιαίο ενοίκιο — από τον ίδιο τον ιδιοκτήτη, από τον ενοικιαστή στην
  // απόδειξη, και από τον λογιστή στην εξαγωγή.
  const monthLabel=(p:RentPayment)=>periodLabel(p.period_year,p.period_month,periodMonths,monthNom);

  const printReceipt=(p:RentPayment)=>{
    const paidDate=p.paid_date?rDate(p.paid_date):ABSENT_DATE;
    const landlord=branding?.companyName?brandName(branding):'Property OS';
    const num=`${p.period_year}-${String(p.period_month).padStart(2,'0')}`;
    const tenantLine=`${p.tenant_id?(tenant.full_name||''):''}${tenant.afm?` · ΑΦΜ ${tenant.afm}`:''}`;
    const html=reportHead(`Απόδειξη Ενοικίου ${num}`)
      + `<body><div class="page">`
      + reportHeader(branding, 'Απόδειξη ενοικίου', { rightLabel:'Αριθμός', rightValue:num, rightNote:`Έκδοση ${rDate()}` })
      + `<h1>Απόδειξη είσπραξης ενοικίου</h1>`
      + `<div class="sub">${rEsc(landlord)} · Περίοδος ${rEsc(monthLabel(p))}</div>`
      + reportSection('Στοιχεία απόδειξης')
      + `<table><tbody>`
        + reportRow('Εκμισθωτής', landlord)
        + reportRow('Μισθωτής', tenantLine)
        + (propLabel()?reportRow('Ακίνητο', propLabel()):'')
        + reportRow('Περίοδος', monthLabel(p))
        + reportRow('Τρόπος πληρωμής', p.method||ABSENT)
        + reportRow('Ημερομηνία πληρωμής', paidDate)
        + reportRow('Ποσό', rEur(p.amount), 'result')
      + `</tbody></table>`
      + `<div class="note">Η παρούσα βεβαιώνει την είσπραξη του ανωτέρω ποσού για το μηνιαίο μίσθωμα της αναφερόμενης περιόδου.</div>`
      + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:56px">`
        + `<div style="border-top:1px solid ${RULE};padding-top:10px;font-size:11px;color:${INK_MUTED}"><div style="font-weight:600;margin-bottom:4px;color:${INK}">Ο εκμισθωτής</div><div style="height:36px"></div><div>Υπογραφή</div></div>`
        + `<div style="border-top:1px solid ${RULE};padding-top:10px;font-size:11px;color:${INK_MUTED}"><div style="font-weight:600;margin-bottom:4px;color:${INK}">Ο μισθωτής</div><div style="margin-bottom:2px;color:${INK}">${rEsc(tenant.full_name)}</div></div>`
      + `</div>`
      + reportDisclaimer('Η παρούσα απόδειξη εκδόθηκε ηλεκτρονικά και βεβαιώνει την είσπραξη του μηνιαίου μισθώματος για την αναφερόμενη περίοδο.', branding)
      + `</div></body></html>`;
    openReport(html);
  };

  // ΤΑ ΜΗΝΥΜΑΤΑ ΠΡΟΣ ΤΟΝ ΕΝΟΙΚΙΑΣΤΗ ΓΡΑΦΟΥΝ ΤΟ ΠΟΣΟ ΟΠΩΣ Η ΟΘΟΝΗ. Έγραφαν
  // «μίσθωμα 450 €» με τοπικό μορφοποιητή χωρίς δεκαδικά, ενώ ο ίδιος αριθμός
  // στην καρτέλα από πάνω έγραφε «450,00 €». Είναι το κείμενο που φεύγει σε
  // WhatsApp και SMS — εκεί η ασυνέπεια δεν φαίνεται ως στιλ, φαίνεται ως λάθος
  // ποσό.
  // ΤΑ ΤΡΙΑ ΜΗΝΥΜΑΤΑ ΖΟΥΝ ΣΤΟ lib/tenant/rentMessage.ts, ΔΟΚΙΜΑΣΜΕΝΑ. Ηταν
  // πρότυπες συμβολοσειρές εδώ μέσα, χωρίς έναν έλεγχο — και είναι το μόνο
  // κείμενο της εφαρμογής που το διαβάζει άνθρωπος που δεν είναι πελάτης μας.
  // Εδώ μένει μόνο η μετάφραση της γραμμής σε ό,τι περιμένει το πρότυπο.
  // Η ΧΡΟΝΙΑ ΛΕΓΕΤΑΙ ΜΙΑ ΦΟΡΑ. Η περίοδος γράφει ήδη «Σεπτεμβρίου 2026»· μια
  // πλήρης ημερομηνία λήξης θα την έλεγε δεύτερη φορά στην ίδια πρόταση. Οταν
  // η λήξη πέφτει σε ΑΛΛΗ χρονιά από την περίοδο, η χρονιά μένει — εκεί δεν
  // είναι επανάληψη, είναι η πληροφορία.
  const dueLabelOf=(p:RentPayment):string|null=>{
    if(!p.due_date) return null;
    const y=isoYear(p.due_date), m=isoMonth(p.due_date);
    if(y===null||m===null) return null;
    if(y!==p.period_year) return fdLong(p.due_date);
    return `${localDay(p.due_date).getDate()} ${monthGen(m-1)}`;
  };

  // ΓΕΝΙΚΗ, ΟΧΙ ΟΝΟΜΑΣΤΙΚΗ, ΣΕ ΚΑΘΕ ΠΡΟΤΑΣΗ. Η οθόνη γράφει «Σεπτέμβριος 2026»
  // σε στήλη πίνακα, όπου η ονομαστική είναι σωστή. Μέσα σε πρόταση —«Ενοίκιο
  // Σεπτεμβρίου 2026»— η ίδια λέξη θέλει γενική. Ισχύει για το σώμα ΚΑΙ για το
  // θέμα του μηνύματος ΚΑΙ για την αιτιολογία της τραπεζικής μεταφοράς: όλα
  // αυτά τα διαβάζει ο μισθωτής, όχι εμείς.
  const periodGen=(p:RentPayment)=>periodLabel(p.period_year,p.period_month,periodMonths,monthGen);

  const msgOf=(p:RentPayment)=>({
    property: propLabel(),
    period: periodGen(p),
    amount: p.amount,
    baseRent: p.base_rent,
    services: p.services_charge,
    dueLabel: dueLabelOf(p),
    stage: rentStage(p.due_date?daysUntil(p.due_date):null),
    portalUrl,
    method: p.method,
  });
  const reminderText=(p:RentPayment)=>rentReminder(msgOf(p));
  const receiptText=(p:RentPayment)=>rentReceipt(msgOf(p));

  // ── Αίτημα πληρωμής (IBAN / QR / κοινοποίηση) ──
  const landlordName=branding?.companyName?brandName(branding):'Ιδιοκτήτης';
  // Πρότυπο EPC (SEPA Credit Transfer / GiroCode) — αναγνωρίζεται από τραπεζικές
  // εφαρμογές. Δεν είναι είσπραξη — απλώς προσυμπληρώνει τη μεταφορά για τον μισθωτή.
  const epcPayload=(iban:string,name:string,amount:number,ref:string)=>
    `BCD\n002\n1\nSCT\n\n${name.slice(0,70)}\n${iban.replace(/\s/g,'').toUpperCase()}\nEUR${amount.toFixed(2)}\n\n\n${ref.slice(0,140)}`;
  // QR τοπικά: το IBAN και το ποσό της πληρωμής δεν φεύγουν σε εξωτερική υπηρεσία.
  const qrSrc=(data:string)=>qrDataUrl(data,{ size:240 });
  const reqRef=(p:RentPayment)=>`Ενοίκιο ${periodGen(p)}${tenant.full_name?` · ${tenant.full_name}`:''}`;
  const paymentRequestText=(p:RentPayment)=>rentRequest({ ...msgOf(p), iban: tenant.rent_iban, landlord: landlordName });

  // ── Μηνιαία κατάσταση προς τον μισθωτή: «Τι περιλαμβάνει / τι χρεώνεται» ──
  const printStatement=(p:RentPayment)=>{
    const landlord=branding?.companyName?brandName(branding):'Property OS';
    const num=`${p.period_year}-${String(p.period_month).padStart(2,'0')}`;
    const base=p.base_rent!=null?p.base_rent:tenantBaseRent(tenant);
    const lines=tenantServiceLines(tenant);
    const svcTotal=lines.reduce((a,l)=>a+l.amount,0);
    const total=p.amount!=null?p.amount:base+svcTotal;
    const svcRows=lines.length
      ? lines.map(l=>reportRow(l.label, rEur(l.amount))).join('')
      : `<tr><td colspan="2" class="empty">Καμία επιπλέον υπηρεσία</td></tr>`;
    const tenantLine=`${tenant.full_name||ABSENT}${tenant.afm?` · ΑΦΜ ${tenant.afm}`:''}`;
    const html=reportHead(`Μηνιαία Κατάσταση ${num}`)
      + `<body><div class="page">`
      + reportHeader(branding, 'Μηνιαία κατάσταση', { rightLabel:'Περίοδος', rightValue:monthLabel(p), rightNote:`Έκδοση ${rDate()}` })
      + `<h1>Μηνιαία κατάσταση ενοικίου</h1>`
      + `<div class="sub">${rEsc(landlord)}</div>`
      + reportSection('Στοιχεία μισθωτή')
      + `<table><tbody>`
        + reportRow('Μισθωτής', tenantLine)
        + (propLabel()?reportRow('Ακίνητο', propLabel()):'')
        + (p.due_date?reportRow('Ημερομηνία λήξης', rDate(p.due_date)):'')
      + `</tbody></table>`
      + reportSection('Τι περιλαμβάνει / τι χρεώνεται')
      + `<table><tbody>`
        + reportRow('Βασικό ενοίκιο', rEur(base))
        + svcRows
        + reportRow('Σύνολο μηνός', rEur(total), 'result')
      + `</tbody></table>`
      + (tenant.rent_iban?`<div class="note">Πληρωμή σε IBAN <strong class="tnum">${rEsc(tenant.rent_iban)}</strong> (${rEsc(landlordName)}).</div>`:'')
      + `<div class="note">Η παρούσα κατάσταση είναι ενημερωτική και αναλύει το μηνιαίο ποσό της δόσης σε βασικό ενοίκιο και υπηρεσίες.</div>`
      + reportDisclaimer('Η παρούσα κατάσταση έχει ενημερωτικό χαρακτήρα και δεν αποτελεί απόδειξη είσπραξης.', branding)
      + `</div></body></html>`;
    openReport(html);
  };

  // ── Scan → payment matching ──
  const runScan=async(file:File)=>{
    // ── ΤΟ ΠΑΡΑΘΥΡΟ ΕΚΛΕΙΝΕ ΜΟΝΟ ΜΕ ΕΠΑΝΑΦΟΡΤΩΣΗ ΣΕΛΙΔΑΣ ──────────────────
    // Η κλήση δεν είχε χρονικό όριο, και το παράθυρο είναι επίτηδες σφραγισμένο
    // όσο σαρώνει: το Escape δεν κάνει τίποτα, το «×» δεν κάνει τίποτα, το πέπλο
    // δεν κάνει τίποτα. Σε κακό δίκτυο κινητού, η αίτηση κρεμούσε και ο χρήστης
    // έμενε με τον σπίνερ «Ανάλυση εγγράφου…» για πάντα, χάνοντας ό,τι είχε
    // συμπληρώσει. Το ίδιο πρότυπο με το scanDoc.ts, που το είχε ήδη λύσει.
    if(file.size>MAX_SCAN_MB*1024*1024){
      setScan({stage:'error',msg:`Το αρχείο είναι μεγαλύτερο από ${MAX_SCAN_MB} MB. Δοκίμασε μικρότερη φωτογραφία.`});
      return;
    }
    setScan({stage:'scanning'});
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),45000);
    try{
      const dataUrl:string=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result as string);r.onerror=rej;r.readAsDataURL(file);});
      const base64=dataUrl.split(',')[1]; const mime=file.type||'image/jpeg'; const isPdf=mime==='application/pdf';
      const contentPart=isPdf?{type:'document',source:{type:'base64',media_type:'application/pdf',data:base64}}:{type:'image',source:{type:'base64',media_type:mime,data:base64}};
      const res=await fetch('/api/anthropic',{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl.signal,body:JSON.stringify({model:'claude-sonnet-5',max_tokens:1500,system:SYSTEM_PROMPT,messages:[{role:'user',content:[contentPart,{type:'text',text:'Αναγνώρισε και ανάλυσε αυτό το έγγραφο. Διάβασε κάθε στοιχείο με ακρίβεια.'}]}]})});
      const data=await res.json();
      // Ο διακομιστής επιστρέφει ήδη ελληνικό, χρήσιμο μήνυμα. Το πετούσαμε και
      // βάζαμε στη θέση του «η υπηρεσία δεν είναι διαθέσιμη» — δηλαδή λέγαμε
      // «χαλάσαμε εμείς» για αρχείο που ήταν απλώς μεγάλο ή για όριο που
      // ξεπεράστηκε.
      if(!res.ok||data?.error){
        const detail=typeof data?.error==='string'&&data.error.trim()?data.error.trim():'Η σάρωση δεν ολοκληρώθηκε. Δοκίμασε ξανά.';
        setScan({stage:'error',msg:detail}); return;
      }
      const text=(data.content||[]).find((c:{type:string})=>c.type==='text')?.text||'{}';
      let doc:ScannedDoc; try{ doc=JSON.parse(text.replace(/```json?|```/g,'').trim()); }catch{ setScan({stage:'error',msg:'Δεν ήταν δυνατή η ανάγνωση του εγγράφου.'}); return; }
      if(doc.amount!=null) doc.amount=numify(doc.amount as unknown);
      doc.doc_type=classifyDocType(doc);
      // Best-effort αρχειοθέτηση του πρωτότυπου (property_documents) για τεκμηρίωση.
      let docId:string|null=null;
      try{
        const safe=file.name.replace(/[^\w.\-]+/g,'_'); const path=`${userId}/${propertyId}/document/${Date.now()}_${safe}`;
        const{error:upErr}=await supabase.storage.from('property-files').upload(path,file,{upsert:false,contentType:file.type||undefined});
        if(!upErr){ const ins=await documents.add(supabase,propertyId,userId,{kind:'document',category:'tenant',title:(doc.title||file.name).slice(0,200),doc_date:doc.issue_date||todayISO(),file_path:path,file_name:file.name,mime:file.type||null,size_bytes:file.size}); if(ins.error)notifyError(failed('Το έγγραφο δεν μπήκε στο Αρχείο',ins.error)); docId=ins.id; }
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
    }catch(err){ setScan({stage:'error',msg:(err as Error)?.name==='AbortError'
      ?'Η σάρωση άργησε πολύ. Έλεγξε τη σύνδεσή σου και δοκίμασε ξανά.'
      :'Παρουσιάστηκε σφάλμα κατά τη σάρωση.'}); }
    finally{ clearTimeout(timer); }
  };
  const confirmScan=async()=>{
    if(!scan?.periodId||!scan.doc){ setScan(null); return; }
    const p=payments.find(x=>x.id===scan.periodId); if(!p){ setScan(null); return; }
    const dateISO=scan.doc.issue_date||scan.doc.due_date||todayISO();
    await doMarkPaid(p,scan.method||'Τραπεζική κατάθεση','',dateISO,scan.docId);
    setScan(null);
  };


  const StatusPill=({p}:{p:RentPayment})=>{
    const st=payStatus(p);
    const cfg=st==='paid'?{c:'var(--positive)',bg:'var(--positive-dim)',l:'Πληρώθηκε'}:st==='overdue'?{c:'var(--negative)',bg:'var(--negative-dim)',l:'Ληξιπρόθεσμο'}:{c:'var(--text-secondary)',bg:'var(--bg-overlay)',l:'Εκκρεμεί'};
    return <span style={{ ...s.badge(cfg.c,cfg.bg), border:`1px solid color-mix(in srgb, ${cfg.c} 26%, transparent)`, fontFamily:T.font.sans }}>{cfg.l}</span>;
  };

  return (
    <div>
      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:10, marginBottom:16 }}>
        <KpiCard label="Εισπραχθέντα" value={fmt(received)} color="var(--text-primary)"/>
        <KpiCard label="Ληξιπρόθεσμα" value={fmt(arrearsTotal)} sub={`${overdue.length} δόσεις`} color={arrearsTotal>0?'var(--negative)':'var(--text-primary)'}/>
        <KpiCard label="Εκκρεμείς" value={String(open.length)} color={open.length>0?'var(--warning)':'var(--positive)'}/>
        <KpiCard label="Δόσεις" value={`${payments.filter(p=>p.paid).length}/${payments.length}`} color="var(--text-primary)"/>
      </div>

      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, gap:12, flexWrap:'wrap' as const }}>
          <SectionTitle>Καρτέλα ενοικίου</SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' as const }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>Ημέρα λήξης</span>
              <div style={{ minWidth:88 }}>
                <SelectField value={String(rentDueDay)} onChange={v=>setRentDueDay(+v)}
                  options={Array.from({length:28},(_,i)=>i+1).map(d=>({ value:String(d), label:String(d) }))}/>
              </div>
            </div>
            <button style={s.btnSm} onClick={()=>fileRef.current?.click()}>Σάρωσε απόδειξη</button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)runScan(f);e.target.value='';}}/>
            <button style={s.btnSm} onClick={generateNow} disabled={busy}>{busy?'…':'Δημιουργία δόσεων'}</button>
            <ExportButton disabled={payments.length===0} onClick={exportPaymentsXlsx}/>
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
            <span style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.5 }}>
              {fn(staleUnpaid.length)} εκκρεμείς δόσεις δεν αντιστοιχούν στο τρέχον ποσό ({fmt(targetAmt)}{svcCharge>0?`: ενοίκιο ${fmt(baseRent)} + υπηρεσίες ${fmt(svcCharge)}`:''}).
            </span>
            <button style={s.btnSm} onClick={syncUnpaidToTarget} disabled={busy}>{busy?'…':'Ενημέρωση εκκρεμών'}</button>
          </div>
        )}

        {addOpen&&(
          <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20, margin:'12px 0 4px' }}>
            <div style={{ ...s.g4, marginBottom:14 }}>
              <SelectField label="Μήνας" value={String(payF.period_month)} onChange={v=>setPayF(f=>({...f,period_month:+v}))} options={MONTHS_NOM.map((m,i)=>({value:String(i+1),label:m}))}/>
              <NumberInput label="Έτος" value={String(payF.period_year)} onChange={v=>setPayF(f=>({...f,period_year:+v}))} min={2000}/>
              <NumberInput label="Ποσό" value={payF.amount} onChange={v=>setPayF(f=>({...f,amount:v}))} suffix="€" placeholder={tenant.monthly_rent?.toString()}/>
              <SelectField label="Τρόπος πληρωμής" value={payF.method} onChange={v=>setPayF(f=>({...f,method:v as PayMethod}))} options={PAY_METHODS.map(m=>({value:m,label:m}))}/>
            </div>
            <div style={{ ...s.g3, marginBottom:14 }}>
              <div><div style={{ ...labelStyle, marginBottom:8 }}>Εξοφλήθη</div><Toggle on={payF.paid} onChange={v=>setPayF(f=>({...f,paid:v}))} ariaLabel="Ναι ή όχι"/></div>
              {payF.paid&&<DatePicker label="Ημερομηνία πληρωμής" value={payF.paid_date} onChange={v=>setPayF(f=>({...f,paid_date:v}))}/>}
              <TextInput label="Σημείωση" value={payF.notes} onChange={v=>setPayF(f=>({...f,notes:v}))} placeholder="προαιρετικό"/>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button style={s.btnGhost} onClick={()=>setAddOpen(false)}>Ακύρωση</button>
              <button style={s.btnGold} onClick={savePay} disabled={busy}>{busy?'Αποθήκευση…':'Καταχώρηση'}</button>
            </div>
          </div>
        )}

        {payments.length===0?(
          <EmptyState
            icon={<Banknote size={20}/>}
            title="Καμία δόση ακόμη"
            hint={tenant.lease_start&&tenant.monthly_rent?'Πάτησε «Δημιουργία δόσεων» για αυτόματη συμπλήρωση από τη μίσθωση.':'Όρισε έναρξη μίσθωσης και μηνιαίο μίσθωμα για αυτόματη δημιουργία δόσεων.'}
            action={tenant.lease_start&&tenant.monthly_rent?<Btn variant="primary" onClick={generateNow} disabled={busy}>Δημιουργία δόσεων</Btn>:undefined}
          />
        ):(
          <div className="table-wrap" style={{ marginTop:14 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Περίοδος','Ποσό','Κατάσταση','Τρόπος','Ημερομηνία Πληρωμής','Λήξη','Ενέργειες'].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr></thead>
            <tbody>
              {sorted.map(p=>(
                <tr key={p.id}>
                  <td style={s.td}><strong style={{ fontFamily:T.font.sans }}>{MONTHS_SHORT[p.period_month-1]}</strong> <span style={{ color:'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{p.period_year}</span></td>
                  <td style={{ ...s.td, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(p.amount)}
                    {p.services_charge&&p.services_charge>0?<span style={{ display:'block', fontSize:10, fontWeight:400, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>ενοίκιο {fmt(p.base_rent)} + υπηρεσίες {fmt(p.services_charge)}</span>:null}
                  </td>
                  <td style={s.td}><StatusPill p={p}/>{p.tenant_declared&&!p.paid?<span style={{ display:'block', marginTop:4, fontSize:10, color:'var(--warning)', fontFamily:T.font.sans, fontWeight:600 }}>Δηλώθηκε από μισθωτή</span>:null}</td>
                  <td style={s.tdM}>{p.method||ABSENT}</td>
                  <td style={s.tdM}>{fmtD(p.paid_date)}</td>
                  <td style={s.tdM}>{fmtD(p.due_date)}{p.days_late&&p.days_late>0?<span style={{ display:'block', fontSize:10, color:p.days_late>14?'var(--negative)':'var(--warning)' }}>+{p.days_late} ημ.</span>:null}</td>
                  <td style={s.td}>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                      {!p.paid
                        ?<button style={s.btnSm} onClick={()=>setMark({p,method:'Τραπεζική κατάθεση',receipt:''})}>Πληρωμένο</button>
                        :<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>doUnpay(p)}>Αναίρεση</button>}
                      {!p.paid&&canCollect&&<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>{setCopied(false);setReq(p);}}>Αίτημα πληρωμής</button>}
                      <button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>printStatement(p)}>Κατάσταση</button>
                      {p.paid&&<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>printReceipt(p)}>Απόδειξη</button>}
                      {tenant.phone&&(p.paid||canCollect)&&<a href={p.paid?whatsappLink(msgDigits(tenant.phone),receiptText(p)):whatsappLink(msgDigits(tenant.phone),reminderText(p))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>WhatsApp</a>}
                      {tenant.phone&&(p.paid||canCollect)&&<a href={viberLink(p.paid?receiptText(p):reminderText(p))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>Viber</a>}
                      {/* ΤΟ ΤΑΧΥΔΡΟΜΕΙΟ ΕΛΕΙΠΕ, ΚΑΙ ΜΕ ΑΥΤΟ ΟΛΟΚΛΗΡΗ Η ΥΠΕΝΘΥΜΙΣΗ.
                          Η γραμμή έδινε WhatsApp και Viber, και τα δύο δεμένα στο
                          ΤΗΛΕΦΩΝΟ. Οποιος ιδιοκτήτης είχε μόνο το email του μισθωτή
                          του δεν είχε ΚΑΝΕΝΑΝ τρόπο να στείλει υπενθύμιση από εδώ. */}
                      {tenant.email&&(p.paid||canCollect)&&<a href={`mailto:${tenant.email}?subject=${encodeURIComponent(rentSubject(periodGen(p)))}&body=${encodeURIComponent(p.paid?receiptText(p):reminderText(p))}`} style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>Ηλεκτρονικό ταχυδρομείο</a>}
                      <button style={s.btnDng} onClick={async()=>{if(!(await confirmDialog('Διαγραφή πληρωμής;',{tone:'negative'})))return;if(await saved('Η πληρωμή δεν διαγράφηκε',rentStore.remove(supabase,p.id)))onRefresh();}}>Διαγραφή</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Σήμανση ως πληρωμένο — κοινό Modal.
          Ήταν χειρόγραφο παράθυρο: δικό του scrim, radius card αντί για modal,
          τίτλος 15/600 αντί για την κοινή κεφαλίδα, και κανένα Escape, καμία
          επιστροφή εστίασης, κανένα κλείδωμα κύλισης του φόντου. */}
      {mark&&(
        <Modal open onClose={()=>setMark(null)} width={420}
          title="Σήμανση ως πληρωμένο"
          subtitle={`${monthLabel(mark.p)} · ${fmt(mark.p.amount)}`}
          footer={<>
            <button style={s.btnGhost} onClick={()=>setMark(null)}>Ακύρωση</button>
            <button style={s.btnGold} onClick={async()=>{const mm=mark;setMark(null);await doMarkPaid(mm.p,mm.method,mm.receipt,todayISO());}}>Καταχώρηση</button>
          </>}>
          <SelectField label="Τρόπος πληρωμής" value={mark.method} onChange={v=>setMark(m=>m?{...m,method:v as PayMethod}:m)} options={PAY_METHODS.map(m=>({value:m,label:m}))}/>
          <TextInput label="Σύνδεσμος απόδειξης (προαιρετικό)" value={mark.receipt} onChange={v=>setMark(m=>m?{...m,receipt:v}:m)} placeholder="https://..."/>
        </Modal>
      )}

      {/* Αίτημα πληρωμής (IBAN / QR / κοινοποίηση) — κοινό Modal.
          Το χειρόγραφο έστηνε μόνο του maxHeight:'90vh' + overflowY· το Modal
          κυλά ΜΟΝΟ το σώμα και κρατά κεφαλίδα και ενέργειες πάντα ορατές. */}
      {req&&(
        <Modal open onClose={()=>setReq(null)} width={460}
          title="Αίτημα πληρωμής"
          ariaLabel="Αίτημα πληρωμής"
          subtitle={<>{monthLabel(req)} · {fmt(req.amount)}{req.services_charge&&req.services_charge>0?<span style={{ color:'var(--text-tertiary)' }}> (ενοίκιο {fmt(req.base_rent)} + υπηρεσίες {fmt(req.services_charge)})</span>:null}</>}
          footer={<>
            <button style={{ ...s.btnGhost, fontSize:11 }} onClick={()=>{const rp=req;setReq(null);setMark({p:rp,method:'Τραπεζική κατάθεση',receipt:''});}}>Σήμανση εξόφλησης</button>
            <button style={s.btnGold} onClick={()=>setReq(null)}>Κλείσιμο</button>
          </>}>
          {tenant.rent_iban?(
            <>
              <div style={{ display:'flex', flexDirection:'column' as const, alignItems:'center' }}>
                <img src={qrSrc(epcPayload(tenant.rent_iban,landlordName,req.amount,reqRef(req)))} alt="QR πληρωμής" width={200} height={200} style={{ borderRadius:12, border:'1px solid var(--border-subtle)', background:'var(--qr-paper)', padding:8 }}/>
                <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:8, textAlign:'center' as const }}>Σάρωση από την τραπεζική εφαρμογή (SEPA/IRIS) για προσυμπλήρωση της μεταφοράς.</div>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom:6 }}>IBAN πληρωμής</div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ flex:1, fontFamily:T.font.mono, fontSize:13, color:'var(--text-primary)', background:'var(--bg-elevated)', border:'1px solid var(--border-default)', borderRadius:T.radius.inner, padding:'10px 12px', wordBreak:'break-all' as const }}>{tenant.rent_iban}</div>
                  <button style={s.btnSm} onClick={()=>{ try{ navigator.clipboard.writeText(tenant.rent_iban||''); setCopied(true); }catch{} }}>{copied?'Αντιγράφηκε':'Αντιγραφή'}</button>
                </div>
              </div>
            </>
          ):(
            <InfoBanner tone="info">Πρόσθεσε IBAN πληρωμής στα στοιχεία του μισθωτή για δημιουργία QR και προσυμπλήρωση της μεταφοράς.</InfoBanner>
          )}

          <div>
            <div style={{ ...labelStyle, marginBottom:8 }}>Κοινοποίηση αιτήματος</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
              {tenant.phone&&<a href={whatsappLink(msgDigits(tenant.phone),paymentRequestText(req))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, textDecoration:'none' }}>WhatsApp</a>}
              {tenant.phone&&<a href={viberLink(paymentRequestText(req))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, textDecoration:'none' }}>Viber</a>}
              {tenant.email&&<a href={`mailto:${tenant.email}?subject=${encodeURIComponent(requestSubject(periodGen(req)))}&body=${encodeURIComponent(paymentRequestText(req))}`} style={{ ...s.btnGhost, textDecoration:'none' }}>Ηλεκτρονικό ταχυδρομείο</a>}
              {/* Το catch ήταν κενό: αν η αντιγραφή αποτύγχανε (άρνηση δικαιώματος, μη ασφαλές
                  context), ο χρήστης νόμιζε ότι το κείμενο ήταν στο πρόχειρο και το επικολλούσε στο κενό. */}
              <button style={s.btnGhost} onClick={()=>{ try{ navigator.clipboard.writeText(paymentRequestText(req)); notifyOk('Το κείμενο αντιγράφηκε'); }catch{ notifyError('Δεν έγινε η αντιγραφή. Επίλεξε και αντίγραψε το κείμενο χειροκίνητα.'); } }}>Αντιγραφή κειμένου</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Σάρωση απόδειξης → αντιστοίχιση σε δόση — κοινό Modal.
          ΟΣΟ ΤΡΕΧΕΙ Η ΑΝΑΛΥΣΗ ΤΟ ΠΑΡΑΘΥΡΟ ΔΕΝ ΚΛΕΙΝΕΙ. Ο χειρόγραφος κώδικας
          φρουρούσε ΜΟΝΟ το κλικ στο φόντο (`scan.stage!=='scanning'`). Ο ίδιος
          φρουρός μπαίνει τώρα στο onClose, οπότε καλύπτει και τις δύο εξόδους
          που προσθέτει το Modal (Escape και «×») — αλλιώς η σάρωση θα μπορούσε
          να κλείσει στη μέση και το αποτέλεσμα να χαθεί χωρίς μήνυμα. */}
      {scan&&(
        <Modal open onClose={()=>{ if(scan.stage!=='scanning') setScan(null); }} width={460}
          title="Σάρωση απόδειξης"
          footer={
            scan.stage==='error' ? <button style={s.btnGhost} onClick={()=>setScan(null)}>Κλείσιμο</button>
            : scan.stage==='match'&&scan.doc ? <>
                <button style={s.btnGhost} onClick={()=>setScan(null)}>Ακύρωση</button>
                <button style={s.btnGold} onClick={confirmScan} disabled={open.length===0||!scan.periodId}>Σήμανση ως πληρωμένο</button>
              </>
            : undefined
          }>
          {scan.stage==='scanning'&&<Spinner label="Ανάλυση εγγράφου…"/>}
          {scan.stage==='error'&&<InfoBanner tone="warning">{scan.msg}</InfoBanner>}
          {scan.stage==='match'&&scan.doc&&(
            <>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
                <Badge tone={scan.doc.doc_type==='payment'?'positive':'warning'}>{scan.doc.doc_type==='payment'?'Απόδειξη πληρωμής':'Τύπος: '+scan.doc.doc_type}</Badge>
                {typeof scan.doc.amount==='number'&&<Badge tone="accent">{fmt(scan.doc.amount)}</Badge>}
                {(scan.doc.issue_date||scan.doc.due_date)&&<Badge tone="neutral">{scan.doc.issue_date||scan.doc.due_date}</Badge>}
              </div>
              {scan.doc.doc_type!=='payment'&&<InfoBanner tone="warning">Το έγγραφο δεν αναγνωρίστηκε ως απόδειξη πληρωμής. Επίλεξε δόση χειροκίνητα πριν τη σήμανση.</InfoBanner>}
              {open.length===0?(
                <InfoBanner tone="info">Καμία ανοιχτή δόση για αντιστοίχιση. Η πληρωμή θα καταχωρηθεί ως νέα εγγραφή.</InfoBanner>
              ):(
                <div>
                  <div style={{ ...labelStyle, marginBottom:8 }}>Αντιστοίχιση σε δόση</div>
                  <SelectField value={scan.periodId||''} onChange={v=>setScan(sc=>sc?{...sc,periodId:v}:sc)}
                    options={open.map(p=>({ value:p.id, label:`${monthLabel(p)} · ${fmt(p.amount)}` }))}/>
                  <div style={{ marginTop:12 }}>
                    <SelectField label="Τρόπος πληρωμής" value={scan.method||'Τραπεζική κατάθεση'} onChange={v=>setScan(sc=>sc?{...sc,method:v as PayMethod}:sc)} options={PAY_METHODS.map(m=>({value:m,label:m}))}/>
                  </div>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Εγγύηση (Deposit View) ───────────────────────────────────────────────────
// Δείχνει ποσό, τρόπο και ημερομηνία καταβολής, και ΠΟΤΕ + ΥΠΟ ΠΟΙΟΥΣ ΟΡΟΥΣ
// επιστρέφεται, υπολογισμένο από τα δεδομένα του ενοικιαστή.
// ΤΙ ΕΦΥΓΕ ΑΠΟ ΕΔΩ: ο «Αναλυτής Απόδοσης Εγγύησης» με προεπιλογή 4%, ανατοκισμό
// και «+X € Κέρδος» σε πράσινο — στην ίδια κάρτα με το «Καθαρό επιστρεπτέο». Μαζί
// του τα πεδία «Απόδοση %/Έτος», «Τύπος Επένδυσης» (ETF, Δανεισμός P2P) και «Πού
// Επενδύεται» με placeholder «π.χ. VWCE». Η εγγύηση είναι χρήματα άλλου ανθρώπου
// που επιστρέφονται ακέραια· ένα εργαλείο που πουλάει ακρίβεια δεν προτείνει να
// τα επενδύσεις, και σίγουρα όχι με απόδοση που το ίδιο επινόησε.

export function DepositView({ tenant, payments, damages, onReturned }:{ tenant:Tenant; payments:RentPayment[]; damages:TenantDamage[]; onReturned:()=>void }) {
  const supabase=createClient();
  const deposit=tenant.deposit_amount||0;
  const unpaid=payments.filter(p=>!p.paid).reduce((a,p)=>a+p.amount,0);
  const chargeable=damages.filter(d=>d.charged_to_tenant).reduce((a,d)=>a+(d.cost||0),0);
  const netReturn=Math.max(0,deposit-unpaid-chargeable);
  const dueDate=tenant.move_out_date||tenant.lease_end||null;
  const methodLabel=tenant.deposit_method||ABSENT;
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap:16 }}>
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Στοιχεία εγγύησης</SectionTitle>
        <DataRow label="Ποσό εγγύησης" value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:15 }}>{fmt(deposit)}</span>}/>
        <DataRow label="Τρόπος καταβολής" value={methodLabel}/>
        <DataRow label="Ημερομηνία καταβολής" value={fmtD(tenant.deposit_paid_on)}/>
        <DataRow label="Κατάσταση" value={tenant.deposit_returned?<StatusBadge label="Επεστράφη" color="var(--positive)" bg="var(--positive-dim)"/>:<StatusBadge label="Σε κατοχή" color="var(--accent)" bg="var(--accent-dim)"/>}/>
        {tenant.deposit_returned&&tenant.deposit_return_date&&<DataRow label="Ημερομηνία επιστροφής" value={fmtD(tenant.deposit_return_date)}/>}
        {!tenant.deposit_returned&&deposit>0&&(
          <button style={{ ...s.btnSm, marginTop:14, width:'100%', textAlign:'center' as const }}
            onClick={async()=>{await saved('Η επιστροφή εγγύησης δεν καταχωρήθηκε', tenantStore.update(supabase,tenant.id,{deposit_returned:true,deposit_return_date:todayISO()}));onReturned();}}>
            Σήμανση ως Επεστράφη
          </button>
        )}
        <div style={{ marginTop:14, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
          Η εγγύηση δεν είναι έσοδό σου: δεν μπαίνει στα ακαθάριστα και δεν φορολογείται. Την κρατάς και την επιστρέφεις.
        </div>
      </div>

      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Πότε και υπό ποιους όρους επιστρέφεται</SectionTitle>
        <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.8, marginBottom:14 }}>
          Η εγγύηση επιστρέφεται στη λήξη της μίσθωσης {dueDate?<>(<strong style={{ color:'var(--text-primary)' }}>{fmtD(dueDate)}</strong>){tenant.move_out_date?', βάσει της ημερομηνίας αποχώρησης':''}</>:'(δεν έχει οριστεί ημερομηνία λήξης/αποχώρησης)'}, μετά από <strong style={{ color:'var(--text-primary)' }}>έλεγχο για φθορές</strong> και <strong style={{ color:'var(--text-primary)' }}>εξόφληση τυχόν εκκρεμών οφειλών</strong>.
        </div>
        <DataRow label="Εγγύηση σε κατοχή" value={<span style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(deposit)}</span>}/>
        <DataRow label="Εκκρεμή ενοίκια" value={<span style={{ color:unpaid>0?'var(--negative)':'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{unpaid>0?`-${fmt(unpaid)}`:fmt(0)}</span>}/>
        <DataRow label="Χρεώσιμες φθορές" value={<span style={{ color:chargeable>0?'var(--negative)':'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{chargeable>0?`-${fmt(chargeable)}`:fmt(0)}</span>}/>
        <DataRow label="Καθαρό επιστρεπτέο (εκτίμηση)" value={<span style={{ color:'var(--positive)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:15 }}>{fmt(netReturn)}</span>}/>
        <div style={{ marginTop:12, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
          Ενδεικτικός υπολογισμός βάσει των εκκρεμών ενοικίων και των φθορών που έχεις σημειώσει ως χρεώσιμες στον ενοικιαστή. Ο τελικός συμψηφισμός γίνεται κατά την παράδοση.
        </div>
      </div>
    </div>
  );
}

// ─── Φθορές & Επισκευές (Damages View) ──────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// ΑΝΑΝΕΩΣΗ & ΑΝΑΠΡΟΣΑΡΜΟΓΗ
//
// ΤΟ ΛΑΘΟΣ ΠΟΥ ΔΙΟΡΘΩΘΗΚΕ: η πρόταση ήταν `Math.round(Σ(rent)/n)`, δηλαδή ο ΩΜΟΣ
// μέσος όρος των ενοικίων των συγκρίσιμων, και έφευγε σε WhatsApp/Viber/email με
// τη φράση «βάσει του μέσου ενοικίου της περιοχής». Τρία συγκρίσιμα 90 τ.μ. και
// δικό σου 45 τ.μ. → πρότεινε διπλάσιο ενοίκιο σε άλλον άνθρωπο. Το `avgPerSqm`
// υπολογιζόταν, εμφανιζόταν, και δεν χρησιμοποιούνταν πουθενά.
//
// ΤΩΡΑ: μέση τιμή ανά τ.μ. × τα τ.μ. ΤΟΥ ΔΙΚΟΥ ΣΟΥ ακινήτου. Χωρίς τ.μ. — δικά σου
// ή των συγκρίσιμων — καμία πρόταση αγοράς: μένει μόνο η νομική βάση.
// ═══════════════════════════════════════════════════════════════════════════

export function RenewalView({ tenant, userId, comps, sqm }:{ tenant:Tenant; userId:string; comps:RentComp[]; sqm:number|null }) {
  const rent=tenant.monthly_rent||0;
  const rentComps=comps.filter(c=>(c.listing_type||'rent')==='rent'&&(c.rent||0)>0);
  // Τιμή ανά τ.μ. ανά αγγελία: από τη στήλη αν υπάρχει, αλλιώς ενοίκιο/τ.μ. της ίδιας
  // αγγελίας. Αγγελία χωρίς τ.μ. ΔΕΝ μπαίνει στον μέσο όρο ανά τ.μ.
  const perSqmValues=rentComps
    .map(c=>(c.rent_per_sqm&&c.rent_per_sqm>0)?c.rent_per_sqm:((c.sqm&&c.sqm>0&&c.rent)?c.rent/c.sqm:0))
    .filter(v=>v>0);
  const avgPerSqm=perSqmValues.length?perSqmValues.reduce((a,v)=>a+v,0)/perSqmValues.length:0;
  const compSqms=rentComps.map(c=>c.sqm||0).filter(v=>v>0);
  const variance=compsVarianceWarning(compSqms, sqm);
  // Η πρόταση αγοράς υπάρχει ΜΟΝΟ όταν ξέρουμε και τα δικά μας τ.μ. και τιμή ανά τ.μ.
  const marketRent=(sqm&&sqm>0&&avgPerSqm>0)?avgPerSqm*sqm:0;
  const hasMarket=marketRent>0;
  const marketDiff=hasMarket?rent-marketRent:0;
  const marketDiffPct=hasMarket&&marketRent>0?(marketDiff/marketRent)*100:0;
  const cpiPct=cpiFor(CPI_LATEST_YEAR);
  const legalNew=cpiPct!==null?rent*(1+cpiPct/100):null;
  // Η πρόταση που ΦΕΥΓΕΙ σε άλλον άνθρωπο: αγορά αν υπάρχει βάση, αλλιώς ΔΤΚ, αλλιώς τίποτα.
  const suggested=hasMarket?Math.round(marketRent):(legalNew!==null?Math.round(legalNew):null);
  const basis=hasMarket
    ?`βάσει της μέσης τιμής ${fmt(avgPerSqm)}/τ.μ. στην περιοχή επί τα ${fn(sqm||0)} τ.μ. του ακινήτου`
    :`βάσει της ετήσιας αναπροσαρμογής ΔΤΚ ${CPI_LATEST_YEAR}`;
  const phoneDigits=msgDigits(tenant.phone);
  const proposalText=suggested!==null
    ?`Πρόταση ανανέωσης μίσθωσης. Τρέχον μηνιαίο μίσθωμα ${fmt(rent)}. Προτεινόμενο νέο μίσθωμα ${fmt(suggested)}, ${basis}. Παραμένω στη διάθεσή σας για συζήτηση.`
    :'';

  return (
    <div>
      {/* Δύο βάσεις πρότασης: νόμος (ΔΤΚ) και αγορά/περιοχή */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap:16, marginBottom:16 }}>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Με βάση τον νόμο (ΔΤΚ)</SectionTitle>
          <DataRow label="Τρέχον μίσθωμα" value={<span style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(rent)}</span>}/>
          {legalNew!==null&&cpiPct!==null
            ?<DataRow label={`Με ΔΤΚ ${CPI_LATEST_YEAR} (${cpiPct>=0?'+':''}${fp(cpiPct)})`} value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(legalNew)}</span>}/>
            :<DataRow label="Με ΔΤΚ" value="δεν υπάρχει επιβεβαιωμένος δείκτης"/>}
          <div style={{ marginTop:10, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
            Ετήσια αναπροσαρμογή βάσει ΔΤΚ, <strong>εφόσον προβλέπεται στη σύμβαση</strong>. Δεν είναι πλαφόν: για το 2026 δεν ισχύει γενικό κρατικό όριο στα ενοίκια κατοικίας. {cpiConfirmedLabel()}.
          </div>
        </div>
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Με βάση την αγορά / περιοχή</SectionTitle>
          {hasMarket?(
            <>
              <DataRow label={`Μέση τιμή ανά τ.μ. (${fn(perSqmValues.length)} συγκρίσιμα)`} value={<span style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(avgPerSqm)}</span>}/>
              <DataRow label={`× ${fn(sqm||0)} τ.μ. δικά σου`} value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(marketRent)}</span>}/>
              <DataRow label="Απόκλιση τρέχοντος" value={<span style={{ color:marketDiff>0?'var(--positive)':marketDiff<0?'var(--warning)':'var(--text-secondary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{marketDiff>0?'+':''}{fmt(marketDiff)} ({fp(marketDiffPct)})</span>}/>
              {variance&&<div style={{ marginTop:12 }}><AlertBar text={variance} level="warning"/></div>}
              <div style={{ marginTop:10, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
                {marketDiff<0?'Το τρέχον μίσθωμα είναι κάτω από την εκτίμηση της περιοχής για το μέγεθός σου. Οποιαδήποτε αύξηση σε ενεργή μίσθωση κατοικίας γίνεται μόνο με όρο αναπροσαρμογής ή νέα συμφωνία.':'Το τρέχον μίσθωμα είναι στο ή πάνω από την εκτίμηση της περιοχής για το μέγεθός σου.'}
              </div>
            </>
          ):(
            <InfoBanner tone="info">
              {rentComps.length===0
                ?'Δεν υπάρχουν καταχωρημένα συγκρίσιμα ενοίκια για την περιοχή. Πρόσθεσε αγγελίες στην καρτέλα «Ενοίκιο/Αγορά».'
                :!sqm||sqm<=0
                  ?`Υπάρχουν ${fn(rentComps.length)} συγκρίσιμα, αλλά το ακίνητο δεν έχει καταχωρημένα τ.μ.. Χωρίς τα δικά σου τ.μ. ο μέσος όρος της περιοχής δεν λέει τίποτα για το δικό σου ακίνητο, οπότε δεν προτείνουμε ποσό.`
                  : `Τα ${fn(rentComps.length)} συγκρίσιμα δεν έχουν τ.μ., οπότε δεν βγαίνει τιμή ανά τ.μ. Χωρίς αυτήν, ο ωμός μέσος όρος θα σύγκρινε ανόμοια ακίνητα.`}
              {' '}Έως τότε, χρησιμοποίησε την πρόταση με βάση τον νόμο (ΔΤΚ).
            </InfoBanner>
          )}
        </div>
      </div>

      {/* Πρόταση ανανέωσης προς αποστολή */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Πρόταση ανανέωσης προς αποστολή</SectionTitle>
        {suggested===null?(
          <InfoBanner tone="neutral">Δεν υπάρχει βάση για πρόταση ποσού: ούτε τιμή ανά τ.μ. από συγκρίσιμα, ούτε επιβεβαιωμένος ΔΤΚ. Δώσε ποσοστό στον υπολογιστή πιο κάτω για να συντάξεις ειδοποίηση.</InfoBanner>
        ):(
          <>
            <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'14px 16px', fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.7, marginBottom:14 }}>{proposalText}</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
              {tenant.phone&&<a href={whatsappLink(phoneDigits,proposalText)} target="_blank" rel="noopener noreferrer" style={{ ...s.btnSm, textDecoration:'none' }}>WhatsApp</a>}
              {tenant.phone&&<a href={viberLink(proposalText)} target="_blank" rel="noopener noreferrer" style={{ ...s.btnSm, textDecoration:'none' }}>Viber</a>}
              <button style={s.btnSm} onClick={()=>navigator.clipboard?.writeText(proposalText)}>Αντιγραφή</button>
              {tenant.email&&<a href={`mailto:${tenant.email}?subject=${encodeURIComponent('Πρόταση ανανέωσης μίσθωσης')}&body=${encodeURIComponent(proposalText)}`} style={{ ...s.btnSm, textDecoration:'none' }}>Ηλεκτρονικό ταχυδρομείο</a>}
            </div>
          </>
        )}
      </div>

      {/* Πλήρης υπολογιστής ΔΤΚ + εκτύπωση ειδοποίησης */}
      <RentAdjustView tenant={tenant} userId={userId}/>
    </div>
  );
}
