'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { qrDataUrl } from '@/lib/qr';
import { createClient } from '@/lib/supabase/client';
import {
  s, fmt, fmtD, daysLeft, leaseSt, calcEnd,
  ServicesEditor, serviceLinesFrom, servicesTenantCharge, servicesOwnerCost,
  CPI_BY_YEAR, CPI_SOURCE_URL, CPI_LATEST_YEAR, cpiFor, cpiConfirmedLabel,
  LEASE_LABELS, LEASE_CATEGORY_LABELS, COMMERCIAL_STAMP_DUTY, ID_DOCS,
  syncTenantSchedule, setRentDueOccurrencePaid, type TenantScheduleInput,
} from './TabTenantHelpers';
import {
  Toggle, NumberInput, TextInput, Textarea,
  CustomSelect as SelectField,
  DatePicker as DateField,
} from './UIComponents';
import type { LeaseType, LeaseCategory, PaymentFreq, IdDocType, ServiceLine } from './TabTenantHelpers';
import { T, PageTitle, KPIGrid, InfoBanner, Badge, Btn, EmptyState, SecHdr, fe, fn, fp, Spinner, Skeleton, SkeletonKPIs, ExportButton, type KPIItem, ABSENT, ABSENT_DATE, TT } from '@/components/Theme';
import { BarChart3, MessageSquare, Banknote, Hammer, Wrench, Users, SearchX } from 'lucide-react';
import { notify, notifyOk, notifyError } from '@/components/Toast';
import { saved, savedData } from '@/components/dbWrite';
import { confirmDialog } from '@/components/ConfirmDialog';
import LeaseModal from './LeaseModal';
import LeaseDeclaration from './LeaseDeclaration';
import { roleLabel } from '@/lib/contacts/roles';
import { downloadCsv, csvDate, type XlsxMode } from './exportCsv';
import { money as csvEur } from './xlsxStyle';
import { brandName, useReportBranding } from '@/lib/reportBranding';
import { reportHead, reportHeader, reportSection, reportRow, reportDisclaimer, openReport, rEur, rSigned, rPct, rEsc, rDate } from './reportPdf';
import { rentalIncomeTax, RENTAL_TAX_ROWS_2026, RENTAL_TAX_BRACKETS_2026 } from '@/lib/billing/greekTax';
import { PRESUMPTIVE_DEDUCTION_RATE } from '@/lib/accounting/statement';
import { TENANT_FIELDS, formFields, missingCritical, fieldDecision, type FieldContext, type FieldDecision } from '@/lib/property/fields';
import { whatsappLink, viberLink } from '@/lib/clients/messages';
import { normalizePhone } from '@/lib/clients/clients';
import { SYSTEM_PROMPT } from './DocumentScan';
import { classifyDocType, type ScannedDoc } from '@/lib/billing/documents';
import { escHtml as esc } from '@/lib/reportBranding';
import { athensToday, daysUntil } from '@/lib/core/time';
import { MONTHS_NOM, MONTHS_SHORT } from '@/lib/core/months';

// ─── Design tokens, shared source of truth (components/Theme) ────────────────
const labelStyle = { ...TT.label, marginBottom:7 };

// ─── HTML escaping for values interpolated into document.write() templates ────

// ─── Types ────────────────────────────────────────────────────────────────────
// ΤΙ ΕΦΥΓΕ ΑΠΟ ΕΔΩ (και γιατί δεν διαβάζεται πια):
//   • deposit_invest_* / prepay_* — το app προέτρεπε τον ιδιοκτήτη να επενδύσει
//     χρήματα που είναι υποχρεωμένος να επιστρέψει ακέραια, με επινοημένο 4%.
//   • 15 πεδία πέντε προκαθορισμένων συντηρήσεων, 9 μετρητών, 3 «καλάθι υποδοχής»,
//     3 στάθμευσης χωρίς ενέργεια, all_inclusive (διπλό του furnishing='turnkey').
//   • nationality / phone_work / employer — δεν προκαλούσαν καμία ενέργεια.
// Οι στήλες μένουν στη βάση (καμία μετάπτωση, καμία απώλεια), απλώς δεν
// ζητούνται πια από τον χρήστη και δεν γράφονται.
interface Tenant {
  id:string; property_id:string; user_id:string;
  full_name:string; email:string|null; phone:string|null;
  profession:string|null;
  afm:string|null; id_doc_type:IdDocType|null; id_doc_number:string|null; iban:string|null; notes:string|null;
  lease_type:LeaseType|null; lease_category:LeaseCategory|null; lease_start:string|null; lease_end:string|null; custom_lease_days:number|null;
  monthly_rent:number|null; payment_frequency:PaymentFreq|null;
  deposit_amount:number|null; deposit_returned:boolean; deposit_return_date:string|null;
  // `streaming` και `cleaning`: οι δύο στήλες όπου ζουν τα παλιά δεδομένα υπηρεσιών.
  // Διαβάζονται μέσω serviceLinesFrom() και γράφονται ως ServiceLine[] στο `streaming`.
  e_payment:boolean; streaming:ServiceLine[]|null; cleaning:unknown; extra_perks:string|null;
  parking_included:boolean; parking_extra:boolean; parking_extra_price:number|null;
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
const todayISO = () => athensToday();
// Τελευταία ημέρα του ΕΠΟΜΕΝΟΥ μήνα από μια ημερομηνία (προθεσμία δήλωσης ΑΑΔΕ).
const lastDayNextMonth = (iso:string) => {
  const d = new Date(iso+'T00:00:00'); if(isNaN(d.getTime())) return ABSENT_DATE;
  const last = new Date(d.getFullYear(), d.getMonth()+2, 0);
  return last.toLocaleDateString('el-GR', { day:'2-digit', month:'long', year:'numeric' });
};
interface CommLog { id:string; tenant_id:string; type:'call'|'email'|'sms'|'meeting'|'note'; summary:string; date:string; outcome:string|null; }
interface TabTenantProps { propertyId:string; userId:string; onStartHandover?:(tenantName:string,tenantPhone:string,type:'check_in'|'check_out')=>void; }


// ─── Τύπος επίπλωσης ───────────────────────────────────────────────────────────
// Είναι η ΜΙΑ είσοδος που κρίνει αν υπάρχουν καθόλου παρεχόμενες υπηρεσίες. Το
// `all_inclusive` έφυγε: ήταν δεύτερος διακόπτης για το ίδιο πράγμα με το
// furnishing='turnkey', και οι δύο μπορούσαν να διαφωνήσουν.
type Furnishing = 'empty' | 'furnished' | 'turnkey';
const FURNISHING_LABELS: Record<Furnishing,string> = {
  empty:'Κενό', furnished:'Επιπλωμένο', turnkey:'Turn Key (όλα μέσα)',
};
/** Επιπλωμένο με οποιαδήποτε έννοια; Παλαιά δεδομένα χωρίς τιμή θεωρούνται γυμνά. */
const isFurnished = (furnishing:string|null|undefined):boolean =>
  furnishing==='furnished' || furnishing==='turnkey';

// ─── Ανάλυση δόσης: βασικό ενοίκιο + χρέωση υπηρεσιών + στάθμευση ──────────────
type SvcInput = { monthly_rent?:number|null; streaming?:ServiceLine[]|null; cleaning?:unknown; parking_extra?:boolean; parking_extra_price?:number|null };
const tenantBaseRent = (t:SvcInput):number => Math.max(0, t.monthly_rent||0);
/** Οι γραμμές υπηρεσιών του ενοικιαστή, διαβασμένες και από τα παλιά δεδομένα. */
const tenantLines = (t:SvcInput):ServiceLine[] => serviceLinesFrom(t.streaming, t.cleaning);
function tenantServicesCharge(t:SvcInput):number{
  const park = t.parking_extra ? (t.parking_extra_price||0) : 0;
  return Math.max(0, servicesTenantCharge(tenantLines(t)) + park);
}
/** Ανάλυση για τη μηνιαία κατάσταση προς τον μισθωτή. */
function tenantServiceLines(t:SvcInput):{label:string;amount:number}[]{
  const out:{label:string;amount:number}[]=[];
  for(const l of tenantLines(t)){
    const amt = l.payer==='tenant' ? l.cost : l.payer==='split' ? l.cost/2 : 0;
    if(amt>0) out.push({ label:l.payer==='split'?`${l.name} (μισά-μισά)`:l.name, amount:amt });
  }
  if(t.parking_extra && (t.parking_extra_price||0)>0) out.push({label:'Χώρος στάθμευσης',amount:t.parking_extra_price||0});
  return out;
}

// ─── Micro components ─────────────────────────────────────────────────────────
// Κεφαλίδα ενότητας: ίδια οπτική με το κοινό SecHdr (χωρίς διακοσμητική τελεία),
// για ομοιομορφία με όλο το app.
// Πλαίσιο πληροφορίας με έγχρωμη κουκκίδα. ΣΕ MODULE SCOPE, δίπλα στο
// SectionTitle: ήταν ορισμένο μέσα στο component, οπότε τα έξι πλαίσια
// υποχρεώσεων ξαναγεννιούνταν σε κάθε render της καρτέλας ενοικιαστή.
const InfoBlock = ({ title, children, tone }: { title: string; children: React.ReactNode; tone?: string }) => (
  <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border-subtle)' }}>
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
      <div style={{ width:5, height:5, borderRadius:'50%', background:tone||'var(--accent)' }}/>
      <span style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{title}</span>
    </div>
    <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.7, paddingLeft:13 }}>{children}</div>
  </div>
);

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
      <span style={{ fontSize:'10px', letterSpacing:'0.06em', textTransform:'uppercase' as const, color:'var(--text-secondary)', fontFamily:T.font.sans, fontWeight:700 }}>{children}</span>
    </div>
  );
}

// ΤΙ ΕΦΥΓΕ: το `SvcSection` (πέντε πτυσσόμενες ενότητες υπηρεσιών) και το
// `SplitBar` (συρόμενη κατανομή κόστους 0–100 ανά μηχάνημα). Υπήρχαν για να
// στεγάσουν 15 πεδία συντηρήσεων και 9 μετρητών· με ελεύθερες γραμμές δεν
// χρειάζονται. Το «ποιος πληρώνει» είναι πλέον τρεις επιλογές, όχι δρομέας.

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
    <div style={{ background:bg, border:`1px solid color-mix(in srgb, ${color} 26%, transparent)`, borderLeft:`3px solid ${color}`, borderRadius:T.radius.inner, padding:'10px 16px', marginBottom:8, fontSize:'12px', color, fontFamily:T.font.sans, fontWeight:500, lineHeight:1.5 }}>
      {text}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ «ΣΚΟΡ ΕΝΟΙΚΙΑΣΤΗ» ΕΦΥΓΕ, ΚΑΙ Η ΕΤΙΚΕΤΑ ΜΑΖΙ ΤΟΥ
//
// Ήταν: 100 − απλήρωτες×8 − καθυστερήσεις×4 − min(μέση×0,5 · 15) + προφίλ×10,
// με κατώφλια 85/70/50 και ετικέτες «Άριστος / Καλός / Μέτριος / Προβληματικός».
// Δύο ανεξάρτητα λάθη:
//   1. Το `profilePts` μέτραγε πόσα από email/τηλέφωνο/ΑΦΜ/IBAN/ταυτότητα είχε
//      πληκτρολογήσει Ο ΕΚΜΙΣΘΩΤΗΣ. Ο ενοικιαστής περνούσε από «Μέτριος» σε
//      «Καλός» επειδή ο ιδιοκτήτης βρήκε ένα IBAN. Ο άνθρωπος που αξιολογείται
//      δεν είχε καμία σχέση με τη μεταβολή της αξιολόγησής του.
//   2. Τα βάρη και τα κατώφλια δεν προέρχονταν από πουθενά, και το αποτέλεσμα
//      ήταν ένας χαρακτηρισμός πάνω σε όνομα ανθρώπου.
// Μένουν τα γεγονότα: πόσες δόσεις πληρώθηκαν, πόσες λείπουν, μέση καθυστέρηση.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Οι ειδοποιήσεις που ΠΡΟΚΥΠΤΟΥΝ ΑΠΟ ΗΜΕΡΟΛΟΓΙΟ Ή ΑΠΟ ΑΠΛΗΡΩΤΕΣ ΔΟΣΕΙΣ.
 *
 * Έφυγαν τα «πρότυπα»: το παλιό «Πρότυπο καλοκαιριού» ενεργοποιούνταν με ΔΥΟ
 * καθυστερήσεις. Δύο σημεία δεν είναι πρότυπο, και το app το παρουσίαζε ως
 * πρόβλεψη. Ό,τι μένει είναι μετρήσιμο σήμερα: μια ημερομηνία και ένα πλήθος.
 */
function leaseAlerts(payments:RentPayment[], tenant:Tenant|null):{text:string;level:'critical'|'warning'|'info'}[] {
  if (!tenant) return [];
  const alerts:{text:string;level:'critical'|'warning'|'info'}[]=[];
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

// ═══════════════════════════════════════════════════════════════════════════
// ΠΟΙΑ ΠΕΔΙΑ ΒΛΕΠΕΙ ΑΥΤΟΣ Ο ΧΡΗΣΤΗΣ — μία πηγή: lib/property/fields.ts
//
// Η καρτέλα Ενοικιαστής υπάρχει ΜΟΝΟ σε μακροχρόνια μίσθωση (visibility.ts:
// `tenant: ['rent_long']`), οπότε η κατάσταση είναι σταθερή. Ό,τι αλλάζει μέσα
// στη φόρμα είναι η ΕΠΙΛΟΓΗ του χρήστη για την επίπλωση: γυμνό διαμέρισμα δεν
// έχει παρεχόμενες υπηρεσίες, άρα δεν έχει και τα πεδία τους.
// ═══════════════════════════════════════════════════════════════════════════

const tenantFieldCtx = (furnished:boolean, propertyCount:number):FieldContext => ({
  status:'rent_long', business:false, doubleEntry:false, propertyCount, furnished,
});

/** Το «γιατί το ζητάμε» του μητρώου, κάτω από το πεδίο. Χωρίς αυτό δεν συμπληρώνεται. */
function Why({ id }:{ id:string }) {
  const why=fieldDecision(id, tenantFieldCtx(true,1)).why;
  if(!why) return null;
  return <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.5, marginTop:6 }}>{why}</div>;
}

/** Γραμμή συμμόρφωσης: τι λείπει για να κλείσει η δήλωση, με το γιατί. */
function MissingCriticalBar({ missing }:{ missing:FieldDecision[] }) {
  if(!missing.length) return null;
  return (
    <div style={{ background:'var(--warning-dim)', border:'1px solid color-mix(in srgb, var(--warning) 26%, transparent)', borderLeft:'3px solid var(--warning)', borderRadius:T.radius.inner, padding:'12px 16px', marginBottom:16 }}>
      <div style={{ fontSize:12, fontWeight:600, color:'var(--warning)', fontFamily:T.font.sans, marginBottom:8 }}>
        Λείπουν {fn(missing.length)} στοιχεία που χρειάζεται η δήλωση
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        {missing.map(m=>(
          <div key={m.id} style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.55 }}>
            <strong style={{ color:'var(--text-primary)' }}>{m.label}</strong> — {m.why}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ποια κρίσιμα πεδία είναι όντως συμπληρωμένα, για τον ίδιο ενοικιαστή. */
const filledTenantIds = (t:{full_name?:string|null;afm?:string|null;lease_category?:string|null;lease_start?:string|null;monthly_rent?:number|null;rent_iban?:string|null}):Set<string> => {
  const set=new Set<string>();
  if(t.full_name) set.add('tenant.full_name');
  if(t.afm) set.add('tenant.afm');
  if(t.lease_category) set.add('tenant.lease_category');
  if(t.lease_start) set.add('tenant.lease_start');
  if(t.monthly_rent) set.add('tenant.rent');
  if(t.rent_iban) set.add('tenant.rent_iban');
  return set;
};

// ─── Payment Bar Chart ────────────────────────────────────────────────────────
function PaymentBars({ payments }:{payments:RentPayment[]}) {
  if(!payments.length) return (
    <EmptyState icon={<BarChart3 size={20}/>} title="Καμία πληρωμή ακόμη" hint="Μόλις καταγραφεί η πρώτη είσπραξη, το γράφημα 12 μηνών γεμίζει αυτόματα." />
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
              title={`${MONTHS_SHORT[p.period_month-1]} ${p.period_year}: ${p.paid?'Εξοφλήθη':'Εκκρεμεί'}${late>0?` (${late} ημ. καθυστέρηση)`:''}`}>
              <div style={{ width:'100%', height:p.paid?72:36, background:color, borderRadius:'3px 3px 0 0', opacity:0.8, transition:'height 0.4s ease' }}/>
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', gap:5 }}>
        {last12.map((p,i)=>(
          <div key={i} style={{ flex:1, fontSize:7, color:'var(--text-tertiary)', textAlign:'center' as const, fontFamily:T.font.sans }}>
            {MONTHS_SHORT[p.period_month-1]}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexWrap:'wrap' as const, gap:'10px 16px', marginTop:12 }}>
        {[['var(--positive)','Εμπρόθεσμη'],['var(--info)','Μικρή καθυστέρηση'],['var(--warning)','Μεγάλη καθυστέρηση'],['var(--negative)','Εκκρεμεί']].map(([c,l])=>(
          <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:8, height:8, borderRadius:3, background:c, flexShrink:0 }}/>
            <span style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dashboard View ────────────────────────────────────────────────────────────
function DashboardView({ tenant, payments, propertyCount }:{ tenant:Tenant; payments:RentPayment[]; propertyCount:number }) {
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
            <strong style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fn(paidPay.length)}/{fn(payments.length)}</strong> δόσεις πληρωμένες
            {late.length>0
              ? <> · <strong style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fn(late.length)}</strong> με καθυστέρηση, μέση καθυστέρηση <strong style={{ fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{avgLate.toFixed(0)}</strong> ημέρες</>
              : <> · καμία καθυστέρηση</>}
            {unpaidAmt>0&&<> · εκκρεμεί <strong style={{ color:'var(--negative)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{fmt(unpaidAmt)}</strong></>}
          </div>
        )}
      </div>

      {/* Payment History Chart */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Ιστορικό Πληρωμών, Τελευταίοι 12 Μήνες</SectionTitle>
        <PaymentBars payments={payments}/>
        {payments.length>0&&(
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap:10, marginTop:20 }}>
            <KpiCard label="Πληρωμές" value={`${paidPay.length}/${payments.length}`} color="var(--text-primary)"/>
            <KpiCard label="Ποσοστό εξόφλησης" value={`${fp(((paidPay.length/payments.length)*100), 0)}`} color="var(--text-primary)"/>
            <KpiCard label="Μέση καθυστέρηση" value={avgLate>0?`${avgLate.toFixed(0)} ημέρες`:'Χωρίς'} color={avgLate>7?'var(--warning)':'var(--positive)'}/>
            <KpiCard label="Εισπραχθέντα σύνολο" value={fmt(totalReceived)} color="var(--text-primary)"/>
          </div>
        )}
      </div>

      {/* Financial Analysis */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Οικονομική Ανάλυση Ενοικιαστή</SectionTitle>
        <DataRow label="Ακαθάριστα Ενοίκια ανά Έτος" value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(annualRent)}</span>}/>
        <DataRow label="Κόστη Ιδιοκτήτη ανά Έτος" value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>-{fmt(totalCosts)}</span>}/>
        <DataRow label="Καθαρό Εισόδημα ανά Έτος" value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:15 }}>{fmt(netIncome)}</span>}/>
        <DataRow label="Εισπραχθέντα σύνολο" value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(totalReceived)}</span>}/>
        <DataRow label="Εκκρεμή σύνολο" value={<span style={{ color:unpaidAmt>0?'var(--negative)':'var(--text-tertiary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:600 }}>{fmt(unpaidAmt)}</span>}/>
      </div>
    </div>
  );
}

// ─── Αναπροσαρμογή Ενοικίου (ΔΤΚ) ────────────────────────────────────────────
// Ο πίνακας ΔΤΚ ζει στο TabTenantHelpers με πηγή και ημερομηνία επιβεβαίωσης.
// Εδώ διαβάζεται μόνο, και ΠΟΤΕ με fallback: έτος χωρίς τιμή δεν έχει τιμή.
function RentAdjustView({ tenant, userId }:{ tenant:Tenant; userId:string }) {
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
    const html=reportHead('Ειδοποίηση Αναπροσαρμογής Μισθώματος')
      + `<body><div class="page">`
      + reportHeader(branding, 'Αναπροσαρμογή μισθώματος', { rightLabel:'Ημερομηνία', rightValue:today_str, rightNote:hasCustom?'Συμβατικό ποσοστό':`ΔΤΚ ${yr}` })
      + `<h1>Ειδοποίηση Αναπροσαρμογής Μισθώματος</h1>`
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
        + `<div style="border-top:1px solid #d1d5db;padding-top:10px;font-size:11px;color:#6b7280"><div style="font-weight:600;margin-bottom:4px;color:#111">Ο εκμισθωτής</div><div style="height:40px"></div><div>Υπογραφή / Σφραγίδα</div></div>`
        + `<div style="border-top:1px solid #d1d5db;padding-top:10px;font-size:11px;color:#6b7280"><div style="font-weight:600;margin-bottom:4px;color:#111">Ο μισθωτής</div><div style="margin-bottom:2px;color:#111">${rEsc(tenant.full_name)}</div>${tenant.afm?`<div>ΑΦΜ: ${rEsc(tenant.afm)}</div>`:''}</div>`
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
            <SelectField value={yr} onChange={v=>{ setYr(v); setUseCustom(cpiFor(parseInt(v))===null); }}
              options={years.map(y=>{ const v=cpiFor(y); return { value:String(y), label:`${y}${v===null?', χωρίς δείκτη ακόμη':`, ΔΤΚ: ${v>=0?'+':''}${fp(v, 1)}`}` }; })}/>
          </div>

          {/* Έτος χωρίς δείκτη: το λέμε, δεν το μπαλώνουμε */}
          {official===null&&(
            <div style={{ background:'var(--warning-dim)', border:'1px solid color-mix(in srgb, var(--warning) 26%, transparent)', borderLeft:'3px solid var(--warning)', borderRadius:T.radius.inner, padding:'11px 14px', marginBottom:16, fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
              Για το {yr} δεν έχουμε επιβεβαιωμένη μέση ετήσια μεταβολή ΔΤΚ. Ο τελευταίος δείκτης που έχουμε είναι του {CPI_LATEST_YEAR}. Δώσε το ποσοστό που προβλέπει η σύμβασή σου — θα γραφτεί στο έγγραφο ως ποσοστό που όρισες εσύ, όχι ως στοιχείο της ΕΛΣΤΑΤ.
            </div>
          )}

          {/* Custom toggle */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, padding:'12px 14px', background:'var(--bg-elevated)', borderRadius:T.radius.inner }}>
            <Toggle on={useCustom} onChange={setUseCustom} size="sm"/>
            <span style={{ fontSize:12, color:'var(--text-primary)', fontFamily:T.font.sans }}>Ποσοστό της σύμβασης</span>
          </div>
          {useCustom&&(
            <div style={{ marginBottom:16 }}>
              <div style={{ ...labelStyle, marginBottom:8 }}>Ποσοστό Αναπροσαρμογής (%)</div>
              <input type="number" value={customPct} onChange={e=>setCustomPct(e.target.value)} placeholder="Παράδειγμα: 3.5" step="0.1"
                style={{ ...selectStyle, border:'1px solid var(--border-default)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontSize:14 }}/>
            </div>
          )}

          {/* Ιστορικό ΔΤΚ */}
          <div title="ΔΤΚ: Δείκτης Τιμών Καταναλωτή, βάση αναπροσαρμογής ενοικίου" style={{ ...labelStyle, marginBottom:10 }}>Ιστορικό ΔΤΚ</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 105px), 1fr))', gap:5 }}>
            {Object.entries(TDE).sort(([a],[b])=>parseInt(b)-parseInt(a)).map(([year,rate])=>{
              const active=parseInt(year)===parseInt(yr);
              return (
                <div key={year} onClick={()=>{setYr(year);setUseCustom(false);}}
                  style={{ background:active?'var(--accent-dim)':'var(--bg-elevated)', border:`1px solid ${active?'var(--accent)':'var(--border-subtle)'}`, borderRadius:T.radius.badge, padding:'7px 4px', textAlign:'center' as const, cursor:'pointer', transition:'all 0.15s' }}>
                  <div style={{ fontSize:10, fontWeight:700, color:active?'var(--accent)':'var(--text-secondary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums' }}>{rate>=0?'+':''}{fp(rate, 1)}</div>
                  <div style={{ fontSize:8, color:'var(--text-tertiary)', fontFamily:T.font.sans, marginTop:2 }}>{year}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Results + Actions */}
        <div>
          {rent>0&&hasPct&&(
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
                {[{label:hasCustom?'Ποσοστό σύμβασης':`ΔΤΚ ${yr}`,value:`${pct>=0?'+':''}${fp(pct, 1)}`},
                  {label:'Μεταβολή ανά Μήνα',value:`${diff>=0?'+':''}${fmtE(diff)}`},
                  {label:'Μεταβολή ανά Έτος',value:`${diff>=0?'+':''}${fmtE(diff*12)}`}
                ].map((row,i)=>(
                  <DataRow key={i} label={row.label} value={<span style={{ color:'var(--text-primary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{row.value}</span>}/>
                ))}
                <div style={{ marginTop:10, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
                  {hasCustom?'Ποσοστό που όρισες εσύ βάσει της σύμβασης. Το έγγραφο θα το αναφέρει ως τέτοιο.':cpiConfirmedLabel()}
                </div>
              </div>

              {/* Print Button */}
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
                Η ειδοποίηση φεύγει σε άλλον άνθρωπο και μένει στα χαρτιά του. Δεν την εκτυπώνουμε με νούμερο που δεν έχει προέλευση — συμπλήρωσε το ποσοστό της σύμβασης ή επίλεξε έτος με επιβεβαιωμένο δείκτη.
              </div>
            </div>
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
  const [form,setForm]=useState({type:'call' as CommLog['type'],summary:'',date:athensToday(),outcome:''});
  const [saving,setSaving]=useState(false);
  const TYPE_LABELS:Record<string,string>={call:'Τηλεφωνική Κλήση',email:'Ηλεκτρονικό Ταχυδρομείο',sms:'Μήνυμα',meeting:'Συνάντηση',note:'Σημείωση'};
  const TYPE_SHORT:Record<string,string>={call:'Κλήση',email:'Ηλεκτρονικό ταχυδρομείο',sms:'Μήνυμα',meeting:'Συνάντηση',note:'Σημείωση'};

  useEffect(()=>{loadLogs();},[tenant.id]);
  const loadLogs=async()=>{
    setLoading(true);
    const{data}=await supabase.from('tenant_comm_log').select('*').eq('tenant_id',tenant.id).order('date',{ascending:false});
    setLogs(data||[]);setLoading(false);
  };
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
              <div style={{ textAlign:'center' as const }}><div style={{ fontSize:12, fontWeight:600, fontFamily:T.font.sans }}>Ηλεκτρονικό ταχυδρομείο</div><div style={{ fontSize:10, color:'var(--text-secondary)', fontFamily:T.font.sans, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const, maxWidth:120 }}>{tenant.email}</div></div>
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
                <SelectField value={form.type} onChange={v=>setForm(f=>({...f,type:v as any}))}
                  options={Object.entries(TYPE_LABELS).map(([k,v])=>({ value:k, label:v }))}/>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom:8 }}>Ημερομηνία</div>
                <DateField value={form.date} onChange={v=>setForm(f=>({...f,date:v}))}/>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom:8 }}>Αποτέλεσμα</div>
                <input type="text" value={form.outcome} onChange={e=>setForm(f=>({...f,outcome:e.target.value}))} placeholder="Παράδειγμα: Θετικό, αρνητικό…" style={inputStyle}/>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <div style={{ ...labelStyle, marginBottom:8 }}>Σύνοψη Επικοινωνίας *</div>
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
            <div style={{ width:38, height:38, borderRadius:18, background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 }}>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans }}>{TYPE_SHORT[log.type]}</span>
                <span style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans }}>{new Date(log.date).toLocaleDateString('el-GR',{day:'2-digit',month:'long',year:'numeric'})}</span>
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
// Το `notify` ΔΕΝ περνά πια ως prop: όσο υπήρχε, σκίαζε σιωπηλά το κοινό import με
// πανομοιότυπο όνομα και υπογραφή, οπότε τα μηνύματα αυτού του component κατέληγαν
// σε άλλον υποδοχέα από τα υπόλοιπα της ίδιας οθόνης.
function PaymentsView({ tenant, propertyId, userId, payments, onRefresh }:{
  tenant:Tenant; propertyId:string; userId:string; payments:RentPayment[]; onRefresh:()=>void;
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

  // Ο πίνακας λέγεται `user_properties`. Το `properties` δεν υπήρξε ΠΟΤΕ, οπότε
  // το `prop` έμενε πάντα null και το ακίνητο ΔΕΝ αναγραφόταν στη βεβαίωση
  // ενοικίου ούτε στα μηνύματα υπενθύμισης — χωρίς κανένα σφάλμα στην οθόνη.
  useEffect(()=>{ supabase.from('user_properties').select('*').eq('id',propertyId).maybeSingle().then(({data})=>setProp(data||null)); },[propertyId]);

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
    // ΤΟ /* swallow */ ΕΚΡΥΒΕ ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΑΔΕΙΑΖΕ ΤΟ ΛΟΓΙΣΤΗΡΙΟ.
    // Το upsert αποτύγχανε ΠΑΝΤΑ (payment_date NOT NULL, και κανένα μοναδικό
    // ευρετήριο για το onConflict), το σφάλμα καταπινόταν εδώ, και ένα
    // notifyOk('Δημιουργήθηκαν N δόσεις') ακολουθούσε αμέσως μετά. Ο ιδιοκτήτης
    // δεν είχε κανέναν τρόπο να μάθει ότι ο πίνακας έμενε κενός — και μαζί του
    // η Πύλη Ενοικιαστή, η οφειλή και το Ε2.
    if(error) { notifyError('Οι δόσεις ΔΕΝ δημιουργήθηκαν: ' + error.message); return false; }
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

  // Εξαγωγή πληρωμών ενοικίου σε .xlsx — «Μορφοποιημένο» (default) ή «Επεξεργάσιμο» (data).
  const exportPaymentsXlsx = (mode?: XlsxMode) => {
    const headers = ['Περίοδος','Ποσό (€)','Κατάσταση','Τρόπος','Ημερομηνία Πληρωμής','Λήξη','Καθυστέρηση (ημέρες)','Σημειώσεις'];
    const rows = sorted.map(p=>[`${MONTHS_NOM[p.period_month-1]} ${p.period_year}`,p.amount,payStatus(p)==='paid'?'Πληρώθηκε':payStatus(p)==='overdue'?'Ληξιπρόθεσμο':'Εκκρεμεί',p.method||'',csvDate(p.paid_date),csvDate(p.due_date),p.days_late||0,(p.notes||'').replace(/\n/g,' ')]);
    downloadCsv(`enoikio_${todayISO()}`, headers, rows, { mode });
  };

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
    const okSync=await saved('Οι δόσεις δεν ενημερώθηκαν', supabase.from('rent_payments').update({amount:targetAmt,base_rent:baseRent,services_charge:svcCharge}).in('id',ids));
    setBusy(false); if(!okSync) return;
    onRefresh(); notifyOk('Οι εκκρεμείς δόσεις ενημερώθηκαν');
  };

  const doMarkPaid=async(p:RentPayment,method:PayMethod,receipt:string,paidDate:string,docId?:string|null)=>{
    const daysLate=p.due_date && paidDate>p.due_date ? Math.ceil((new Date(paidDate).getTime()-new Date(p.due_date).getTime())/86400000) : 0;
    // ΕΙΣΠΡΑΞΗ ΕΝΟΙΚΙΟΥ. Αν αυτό αποτύχει σιωπηλά, ο ιδιοκτήτης θεωρεί ότι
    // πληρώθηκε, η δόση μένει ανοιχτή, και το ξαναβλέπει μήνες μετά στη δήλωση.
    if(!await saved('Η πληρωμή δεν καταχωρήθηκε', supabase.from('rent_payments').update({paid:true,paid_date:paidDate,method,receipt_url:receipt||null,receipt_doc_id:docId??p.receipt_doc_id??null,days_late:daysLate}).eq('id',p.id))) return;
    await setRentDueOccurrencePaid(supabase,tenant.id,propertyId,p.period_year,p.period_month,true);
    onRefresh(); notifyOk('Καταχωρήθηκε ως πληρωμένο');
  };
  const doUnpay=async(p:RentPayment)=>{ if(!await saved('Η αναίρεση δεν αποθηκεύτηκε', supabase.from('rent_payments').update({paid:false,paid_date:null,days_late:null}).eq('id',p.id))) return; await setRentDueOccurrencePaid(supabase,tenant.id,propertyId,p.period_year,p.period_month,false); onRefresh(); };

  const savePay=async()=>{
    // Ήταν ΠΡΑΣΙΝΟ ενώ πρόκειται για σφάλμα επικύρωσης — το παλιό banner είχε έναν
    // μόνο τόνο για τα πάντα. Τώρα ο τόνος λέει την αλήθεια.
    if(!payF.amount){notify('Συμπλήρωσε ποσό',{tone:'warning'});return;}
    setBusy(true);
    const paidDate=payF.paid?payF.paid_date:null;
    const due=`${payF.period_year}-${String(payF.period_month).padStart(2,'0')}-${String(Math.min(Math.max(1,rentDueDay),28)).padStart(2,'0')}`;
    const daysLate=payF.paid&&paidDate&&paidDate>due?Math.ceil((new Date(paidDate).getTime()-new Date(due).getTime())/86400000):0;
    const{error:payErr}=await supabase.from('rent_payments').upsert({tenant_id:tenant.id,property_id:propertyId,user_id:userId,period_month:payF.period_month,period_year:payF.period_year,amount:Math.max(0,parseFloat(payF.amount)),paid:payF.paid,paid_date:paidDate,method:payF.paid?payF.method:null,days_late:daysLate,due_date:due,notes:payF.notes||null},{onConflict:'tenant_id,period_year,period_month'});
    // Ίδιο σφάλμα, δεύτερο σημείο: η καταχώρηση πληρωμής απορριπτόταν και το
    // «Πληρωμή καταχωρήθηκε» εμφανιζόταν ούτως ή άλλως.
    if(payErr){ setBusy(false); notifyError('Η πληρωμή ΔΕΝ καταχωρήθηκε: ' + payErr.message); return; }
    await setRentDueOccurrencePaid(supabase,tenant.id,propertyId,payF.period_year,payF.period_month,payF.paid);
    setBusy(false);setAddOpen(false);setPayF({period_month:new Date().getMonth()+1,period_year:new Date().getFullYear(),amount:'',method:'Τραπεζική κατάθεση',paid:true,paid_date:todayISO(),notes:''});
    onRefresh();notifyOk('Πληρωμή καταχωρήθηκε');
  };

  // Το user_properties έχει `name` και `address` — όχι `title`/`label`, που ήταν
  // υποθέσεις πάνω σε πίνακα που δεν υπήρχε.
  const propLabel=()=> (prop?.address||prop?.name||'') as string;
  const monthLabel=(p:RentPayment)=>`${MONTHS_NOM[p.period_month-1]} ${p.period_year}`;

  const printReceipt=(p:RentPayment)=>{
    const paidDate=p.paid_date?rDate(p.paid_date+'T00:00:00'):ABSENT_DATE;
    const landlord=branding?.companyName?brandName(branding):'Property OS';
    const num=`${p.period_year}-${String(p.period_month).padStart(2,'0')}`;
    const tenantLine=`${p.tenant_id?(tenant.full_name||''):''}${tenant.afm?` · ΑΦΜ ${tenant.afm}`:''}`;
    const html=reportHead(`Απόδειξη Ενοικίου ${num}`)
      + `<body><div class="page">`
      + reportHeader(branding, 'Απόδειξη ενοικίου', { rightLabel:'Αριθμός', rightValue:num, rightNote:`Έκδοση ${rDate()}` })
      + `<h1>Απόδειξη Είσπραξης Ενοικίου</h1>`
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
        + `<div style="border-top:1px solid #d1d5db;padding-top:10px;font-size:11px;color:#6b7280"><div style="font-weight:600;margin-bottom:4px;color:#111">Ο εκμισθωτής</div><div style="height:36px"></div><div>Υπογραφή</div></div>`
        + `<div style="border-top:1px solid #d1d5db;padding-top:10px;font-size:11px;color:#6b7280"><div style="font-weight:600;margin-bottom:4px;color:#111">Ο μισθωτής</div><div style="margin-bottom:2px;color:#111">${rEsc(tenant.full_name)}</div></div>`
      + `</div>`
      + reportDisclaimer('Η παρούσα απόδειξη εκδόθηκε ηλεκτρονικά και βεβαιώνει την είσπραξη του μηνιαίου μισθώματος για την αναφερόμενη περίοδο.', branding)
      + `</div></body></html>`;
    openReport(html);
  };

  const reminderText=(p:RentPayment)=>`Υπενθύμιση ενοικίου, ${propLabel()||'ακίνητο'}: μίσθωμα ${p.amount.toLocaleString('el-GR')} € για ${monthLabel(p)}${p.due_date?`, λήξη ${new Date(p.due_date+'T00:00:00').toLocaleDateString('el-GR')}`:''}. Ευχαριστώ.`;
  const receiptText=(p:RentPayment)=>`Εξοφλήθη το ενοίκιο ${monthLabel(p)} (${p.amount.toLocaleString('el-GR')} €)${p.method?`, ${p.method}`:''}. Ευχαριστώ.`;

  // ── Αίτημα πληρωμής (IBAN / QR / κοινοποίηση) ──
  const landlordName=branding?.companyName?brandName(branding):'Ιδιοκτήτης';
  // Πρότυπο EPC (SEPA Credit Transfer / GiroCode) — αναγνωρίζεται από τραπεζικές
  // εφαρμογές. Δεν είναι είσπραξη — απλώς προσυμπληρώνει τη μεταφορά για τον μισθωτή.
  const epcPayload=(iban:string,name:string,amount:number,ref:string)=>
    `BCD\n002\n1\nSCT\n\n${name.slice(0,70)}\n${iban.replace(/\s/g,'').toUpperCase()}\nEUR${amount.toFixed(2)}\n\n\n${ref.slice(0,140)}`;
  // QR τοπικά: το IBAN και το ποσό της πληρωμής δεν φεύγουν σε εξωτερική υπηρεσία.
  const qrSrc=(data:string)=>qrDataUrl(data,{ size:240 });
  const reqRef=(p:RentPayment)=>`Ενοίκιο ${monthLabel(p)}${tenant.full_name?` · ${tenant.full_name}`:''}`;
  const paymentRequestText=(p:RentPayment)=>{
    const br=(p.services_charge&&p.services_charge>0)?` (ενοίκιο ${(p.base_rent||0).toLocaleString('el-GR')} € + υπηρεσίες ${(p.services_charge||0).toLocaleString('el-GR')} €)`:'';
    const ibanPart=tenant.rent_iban?` Πληρωμή σε IBAN ${tenant.rent_iban} (${landlordName}).`:'';
    return `Αίτημα πληρωμής, ${propLabel()||'ακίνητο'}: ${p.amount.toLocaleString('el-GR')} € για ${monthLabel(p)}${br}.${ibanPart}${p.due_date?` Λήξη ${new Date(p.due_date+'T00:00:00').toLocaleDateString('el-GR')}.`:''}`;
  };

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
      + `<h1>Μηνιαία Κατάσταση Ενοικίου</h1>`
      + `<div class="sub">${rEsc(landlord)}</div>`
      + reportSection('Στοιχεία μισθωτή')
      + `<table><tbody>`
        + reportRow('Μισθωτής', tenantLine)
        + (propLabel()?reportRow('Ακίνητο', propLabel()):'')
        + (p.due_date?reportRow('Ημερομηνία λήξης', rDate(p.due_date+'T00:00:00')):'')
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
        if(!upErr){ const ins=await savedData<{id?:string}>('Το έγγραφο δεν μπήκε στο Αρχείο',supabase.from('property_documents').insert({property_id:propertyId,user_id:userId,kind:'document',category:'tenant',title:(doc.title||file.name).slice(0,200),doc_date:doc.issue_date||todayISO(),file_path:path,file_name:file.name,mime:file.type||null,size_bytes:file.size}).select('id').single()); docId=ins?.id||null; }
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
          <SectionTitle>Καρτέλα Ενοικίου</SectionTitle>
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
            <ExportButton disabled={payments.length===0} onClick={()=>exportPaymentsXlsx()} onExportData={()=>exportPaymentsXlsx('data')}/>
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
              <div><div style={{ ...labelStyle, marginBottom:8 }}>Εξοφλήθη</div><Toggle on={payF.paid} onChange={v=>setPayF(f=>({...f,paid:v}))} label="Ναι" labelOff="Όχι"/></div>
              {payF.paid&&<DateField label="Ημερομηνία πληρωμής" value={payF.paid_date} onChange={v=>setPayF(f=>({...f,paid_date:v}))}/>}
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
                      {!p.paid&&<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>{setCopied(false);setReq(p);}}>Αίτημα πληρωμής</button>}
                      <button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>printStatement(p)}>Κατάσταση</button>
                      {p.paid&&<button style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10 }} onClick={()=>printReceipt(p)}>Απόδειξη</button>}
                      {tenant.phone&&<a href={p.paid?whatsappLink(msgDigits(tenant.phone),receiptText(p)):whatsappLink(msgDigits(tenant.phone),reminderText(p))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>WhatsApp</a>}
                      {tenant.phone&&<a href={viberLink(p.paid?receiptText(p):reminderText(p))} target="_blank" rel="noopener noreferrer" style={{ ...s.btnGhost, padding:'6px 10px', fontSize:10, textDecoration:'none' }}>Viber</a>}
                      <button style={s.btnDng} onClick={async()=>{if(!(await confirmDialog('Διαγραφή πληρωμής;',{tone:'negative'})))return;if(await saved('Η πληρωμή δεν διαγράφηκε',supabase.from('rent_payments').delete().eq('id',p.id)))onRefresh();}}>Διαγραφή</button>
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
        <div onClick={()=>setMark(null)} style={{ position:'fixed', inset:0, background: T.scrim, display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-default)', borderRadius:T.radius.card, padding:24, width:'min(100%, 420px)' }}>
            <div style={{ fontSize:15, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:4 }}>Σήμανση ως πληρωμένο</div>
            <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:16 }}>{monthLabel(mark.p)} · {fmt(mark.p.amount)}</div>
            <div style={{ marginBottom:14 }}>
              <SelectField label="Τρόπος πληρωμής" value={mark.method} onChange={v=>setMark(m=>m?{...m,method:v as PayMethod}:m)} options={PAY_METHODS.map(m=>({value:m,label:m}))}/>
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
        <div onClick={()=>setReq(null)} style={{ position:'fixed', inset:0, background: T.scrim, display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
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
              {tenant.email&&<a href={`mailto:${tenant.email}?subject=${encodeURIComponent('Αίτημα πληρωμής ενοικίου '+monthLabel(req))}&body=${encodeURIComponent(paymentRequestText(req))}`} style={{ ...s.btnGhost, textDecoration:'none' }}>Ηλεκτρονικό ταχυδρομείο</a>}
              {/* Το catch ήταν κενό: αν η αντιγραφή αποτύγχανε (άρνηση δικαιώματος, μη ασφαλές
                  context), ο χρήστης νόμιζε ότι το κείμενο ήταν στο πρόχειρο και το επικολλούσε στο κενό. */}
              <button style={s.btnGhost} onClick={()=>{ try{ navigator.clipboard.writeText(paymentRequestText(req)); notifyOk('Το κείμενο αντιγράφηκε'); }catch{ notifyError('Δεν έγινε η αντιγραφή. Επίλεξε και αντίγραψε το κείμενο χειροκίνητα.'); } }}>Αντιγραφή κειμένου</button>
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
        <div onClick={()=>scan.stage!=='scanning'&&setScan(null)} style={{ position:'fixed', inset:0, background: T.scrim, display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
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
                    <SelectField value={scan.periodId||''} onChange={v=>setScan(sc=>sc?{...sc,periodId:v}:sc)}
                      options={open.map(p=>({ value:p.id, label:`${monthLabel(p)} · ${fmt(p.amount)}` }))}/>
                    <div style={{ marginTop:12 }}>
                      <SelectField label="Τρόπος πληρωμής" value={scan.method||'Τραπεζική κατάθεση'} onChange={v=>setScan(sc=>sc?{...sc,method:v as PayMethod}:sc)} options={PAY_METHODS.map(m=>({value:m,label:m}))}/>
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
function LegalTaxView({ tenant, propertyCount }:{ tenant:Tenant; propertyCount:number }) {
  const annualRent=Math.max(0,(tenant.monthly_rent||0)*12);
  // ΤΕΚΜΑΡΤΗ ΕΚΠΤΩΣΗ 5%: ίδιος συντελεστής και ίδιος ΟΡΟΣ με το
  // lib/accounting/statement.ts. Από 1/1/2026 η έκπτωση προϋποθέτει είσπραξη μέσω
  // τραπέζης· με μετρητά ο φόρος υπολογίζεται στο 100% των ακαθάριστων. Ο φόρος
  // υπολογιζόταν πριν πάντα στο 100%, οπότε το app έδειχνε μεγαλύτερο φόρο από
  // τα Λογιστικά για το ίδιο ενοίκιο.
  const viaBank=tenant.e_payment!==false;
  const deductionRate=viaBank?PRESUMPTIVE_DEDUCTION_RATE:0;
  const taxable=annualRent*(1-deductionRate);
  // Η ΚΛΙΜΑΚΑ ΠΟΥ ΔΕΙΧΝΕΙ Η ΟΘΟΝΗ ΕΙΝΑΙ Η ΚΛΙΜΑΚΑ ΠΟΥ ΥΠΟΛΟΓΙΖΕΙ. Πιο κάτω
  // τυπώνεται ο πίνακας `RENTAL_TAX_ROWS_2026`· εδώ γράφεται ρητά η ίδια χρονιά
  // αντί να βασιζόμαστε στην προεπιλογή. Η προβολή αφορά το τρέχον μίσθωμα, όχι
  // περασμένη χρήση — όταν αλλάξουν οι συντελεστές, πίνακας και υπολογισμός
  // αλλάζουν μαζί ή δεν αλλάζει κανένας.
  const tax=taxable>0?rentalIncomeTax(taxable,RENTAL_TAX_BRACKETS_2026):0;
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
    { label:'Φόρος για ΑΥΤΟ το ακίνητο', value:fe(tax), tone:'warning', sub:annualRent>0?`πραγματικός συντελεστής ${fp((effRate*100), 1)} επί των ακαθάριστων`:undefined },
    ...(isCommercial?[{ label:'Ψηφιακό Τέλος Συναλλαγής (3,6%)', value:fe(stampDuty), tone:'warning' as const }]:[]),
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


  return (
    <div>
      <KPIGrid items={kpis}/>
      <InfoBanner tone={perPropertyCaveat?'warning':'info'}>
        <strong>Εκτίμηση για ΑΥΤΟ το ακίνητο. Η κλίμακα εφαρμόζεται στο σύνολο των ενοικίων σου.</strong>{' '}
        {perPropertyCaveat
          ? `Έχεις ${fn(propertyCount)} ακίνητα: επειδή ο φόρος είναι προοδευτικός στο άθροισμα, το ποσό εδώ είναι μικρότερο από το μερίδιο που θα αναλογεί πραγματικά σε αυτό το ακίνητο. Το συνολικό νούμερο βγαίνει στα «Λογιστικά».`
          : 'Αν αποκτήσεις δεύτερο ακίνητο που αποδίδει, το άθροισμα μπορεί να ανεβάσει κλιμάκιο και ο φόρος να μη είναι το άθροισμα των δύο εκτιμήσεων.'}{' '}
        Ενοίκιο {fe(tenant.monthly_rent||0)}/μήνα, τύπος μίσθωσης «{tenant.lease_category?LEASE_CATEGORY_LABELS[tenant.lease_category]:ABSENT}»
        {viaBank
          ? `, με τεκμαρτή έκπτωση ${fp((PRESUMPTIVE_DEDUCTION_RATE*100), 0)} (φορολογητέο ${fe(taxable)}) επειδή το ενοίκιο εισπράττεται μέσω τραπέζης.`
          : '. Επειδή το ενοίκιο ΔΕΝ δηλώνεται ως ηλεκτρονική είσπραξη, η τεκμαρτή έκπτωση 5% δεν εφαρμόζεται και ο φόρος υπολογίζεται στο 100% των ακαθάριστων.'}
      </InfoBanner>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap:16, marginTop:16 }}>
        {/* Φόρος εισοδήματος από ενοίκια */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Φόρος Εισοδήματος από Ενοίκια (2026)</SectionTitle>
          <div className="table-wrap">
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr>{['Κλιμάκιο Εισοδήματος','Συντελεστής'].map((h,i)=><th key={i} style={{ ...s.th, textAlign:i?'right' as const:'left' as const }}>{h}</th>)}</tr></thead>
            <tbody>
              {RENTAL_TAX_ROWS_2026.map((r,i)=>{
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
          <div style={{ marginTop:12, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>Ο φόρος υπολογίζεται προοδευτικά ανά κλιμάκιο επί του φορολογητέου ({fe(taxable)} = ακαθάριστα {fe(annualRent)}{viaBank?` μείον τεκμαρτή έκπτωση ${fp((PRESUMPTIVE_DEDUCTION_RATE*100), 0)}`:''}), σύνολο {fe(tax)} για αυτό το ακίνητο. Επιβεβαίωσε την τελική δήλωση με λογιστή ή την ΑΑΔΕ.</div>
        </div>

        {/* Νομικές υποχρεώσεις */}
        <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
          <SectionTitle>Υποχρεώσεις & Πλαίσιο</SectionTitle>
          <InfoBlock title="ΑΑΔΕ, Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης" tone="var(--warning)">
            Κάθε νέα μίσθωση, καθώς και κάθε τροποποίηση ή λύση, δηλώνεται ηλεκτρονικά στην ΑΑΔΕ έως το τέλος του επόμενου μήνα από την έναρξη ή τη μεταβολή.{tenant.lease_start?` Για έναρξη ${fmtD(tenant.lease_start)}, προθεσμία δήλωσης έως ${lastDayNextMonth(tenant.lease_start)}.`:''} Χωρίς τη δήλωση δεν αναγνωρίζεται φορολογικά η μίσθωση. Μετά την υποβολή, ο μισθωτής (και τυχόν συνιδιοκτήτες) ειδοποιείται μέσω myAADE/email και έχει 30 ημέρες να την αποδεχθεί ή να την απορρίψει — αλλιώς θεωρείται σιωπηρά αποδεκτή (ισχύς από 2/6/2025)· ενημέρωσέ τον εγκαίρως. Επιβεβαίωσε την ακριβή προθεσμία στην ΑΑΔΕ (σύνδεσμος πιο κάτω).
          </InfoBlock>
          <InfoBlock title="Είσπραξη μέσω τραπέζης" tone={viaBank?'var(--positive)':'var(--negative)'}>
            {viaBank
              ? `Το ενοίκιο εισπράττεται μέσω τραπέζης, οπότε ισχύει η τεκμαρτή έκπτωση ${fp((PRESUMPTIVE_DEDUCTION_RATE*100), 0)} και φορολογείται το ${fe(taxable)} αντί του ${fe(annualRent)}.`
              : `Προσοχή: το ενοίκιο δηλώνεται ως μη τραπεζική είσπραξη. Από 1/1/2026 η τεκμαρτή έκπτωση ${fp((PRESUMPTIVE_DEDUCTION_RATE*100), 0)} προϋποθέτει είσπραξη μέσω τραπέζης — χωρίς αυτήν φορολογείται το 100% των ακαθάριστων, δηλαδή ${fe(annualRent)} αντί ${fe(annualRent*(1-PRESUMPTIVE_DEDUCTION_RATE))}. Συμπλήρωσε IBAN είσπραξης στα στοιχεία της μίσθωσης.`}
          </InfoBlock>
          <InfoBlock title="Αναπροσαρμογή ΔΤΚ">
            Η αναπροσαρμογή μισθώματος γίνεται μία φορά τον χρόνο, βάσει Δείκτη Τιμών Καταναλωτή (ΕΛΣΤΑΤ), εφόσον προβλέπεται στη σύμβαση. Χρησιμοποίησε την καρτέλα «Αναπροσαρμογή Ενοικίου».{!isCommercial&&' Αν η κατοικία μισθώθηκε για διάρκεια μικρότερη της τριετίας χωρίς όρο αναπροσαρμογής, ο νόμος (άρθρο 2 ν.1703/1987) προβλέπει ετήσια αναπροσαρμογή ίση με το 75% της μεταβολής του ΔΤΚ έως τη συμπλήρωση της τριετίας — με χαμηλό ή αρνητικό ΔΤΚ το ενοίκιο ουσιαστικά μένει σταθερό. Επιβεβαίωσε την εφαρμογή στη σύμβασή σου.'}
          </InfoBlock>
          <InfoBlock title="Νόμιμη αύξηση ενοικίου">
            {isCommercial
              ?'Στις υφιστάμενες επαγγελματικές μισθώσεις (ΠΔ 34/1995), η αναπροσαρμογή για το 2026 δεν επιτρέπεται να ξεπερνά το 3% επί του μισθώματος του 2025 — ακόμη κι αν οι αγοραίες τιμές ανέβηκαν περισσότερο. Το όριο δεν ισχύει σε νέα μίσθωση που υπογράφεις μέσα στο 2026.'
              :'Σε ενεργή μίσθωση κατοικίας δεν μπορείς να αυξήσεις μονομερώς το ενοίκιο κατά τη διάρκεια της σύμβασης — μόνο αν υπάρχει ρητός όρος αναπροσαρμογής (π.χ. ΔΤΚ ή σταθερό ποσοστό). Νέο, υψηλότερο μίσθωμα μπαίνει μόνο με νέα συμφωνία που αποδέχεται και ο μισθωτής. Για το 2026 δεν ισχύει γενικό κρατικό πλαφόν στα ενοίκια κατοικίας (το όριο 3% αφορά μόνο τις εμπορικές μισθώσεις).'}
          </InfoBlock>
          <InfoBlock title="Ελάχιστη διάρκεια και εγγύηση">
            {isCommercial
              ?'Για επαγγελματική μίσθωση ισχύει η ελάχιστη νόμιμη διάρκεια των τριών ετών.'
              :'Για μίσθωση κατοικίας ισχύει η τριετής ελάχιστη προστασία διάρκειας, ακόμη κι αν συμφωνηθεί μικρότερος χρόνος.'} Η εγγύηση{tenant.deposit_amount?` (${fe(tenant.deposit_amount)})`:''} επιστρέφεται στη λήξη, μετά από έλεγχο για φθορές.
          </InfoBlock>
          <InfoBlock title="Τέλος χαρτοσήμου και ψηφιακό τέλος συναλλαγής" tone={isCommercial?'var(--warning)':'var(--positive)'}>
            {isCommercial
              ?`Επαγγελματική μίσθωση: τέλος 3,6% επί του μισθώματος — πλέον «Ψηφιακό Τέλος Συναλλαγής», με τον ίδιο συντελεστή 3,60% (ν.5135/2024). Για ετήσιο ενοίκιο ${fe(annualRent)}, ανέρχεται σε ${fe(stampDuty)} τον χρόνο (${fe(stampDuty/12)} τον μήνα), που κατανέμεται συνήθως 50/50 μεταξύ εκμισθωτή και μισθωτή. Δεν οφείλεται αν η μίσθωση έχει νομίμως υπαχθεί σε ΦΠΑ.`
              :'Μίσθωση κατοικίας: δεν επιβάλλεται τέλος χαρτοσήμου / Ψηφιακό Τέλος Συναλλαγής.'}
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
// 78 → 31 κλειδιά. Ό,τι έφυγε είναι γραμμένο στο σχόλιο του `Tenant` πιο πάνω.
const blank=()=>({
  full_name:'',email:'',phone:'',profession:'',afm:'',
  id_doc_type:'' as IdDocType|'',id_doc_number:'',iban:'',notes:'',
  lease_type:'annual' as LeaseType,lease_category:'' as LeaseCategory|'',lease_start:'',lease_end:'',custom_lease_days:365,
  monthly_rent:'',payment_frequency:'monthly' as PaymentFreq,rent_due_day:'1',rent_iban:'',e_payment:true,
  furnishing:'' as Furnishing|'',
  deposit_amount:'',deposit_method:'',deposit_paid_on:'',deposit_returned:false,deposit_return_date:'',
  services:null as ServiceLine[]|null,
  parking_included:false,parking_extra:false,parking_extra_price:'',
  extra_perks:'',
  lease_doc_external_url:'',
});

/**
 * Έχει ο ενοικιαστής συμπληρωμένα «σπάνια» πεδία;
 * Το «Περισσότερα» είναι κλειστό εξ ορισμού, αλλά δεν κρύβει δεδομένα που ΥΠΑΡΧΟΥΝ:
 * σε επεξεργασία ανοίγει, ώστε κανείς να μη νομίσει ότι χάθηκε κάτι που είχε γράψει.
 */
const hasMoreData = (f:ReturnType<typeof blank>):boolean => !!(
  f.email||f.profession||f.iban||f.id_doc_type||f.id_doc_number||f.notes||
  f.deposit_method||f.deposit_paid_on||f.deposit_returned||
  f.parking_included||f.parking_extra||f.extra_perks||
  f.payment_frequency!=='monthly'
);

// ─── Εγγύηση (Deposit View) ─────────────────────────────────────────────────────
// Δείχνει ποσό, τρόπο/ημ. καταβολής, και ΠΟΤΕ + ΥΠΟ ΠΟΙΟΥΣ ΟΡΟΥΣ επιστρέφεται —
// υπολογισμένο από τα δεδομένα του ενοικιαστή (λήξη/αποχώρηση, εκκρεμή ενοίκια,
// χρεώσιμες φθορές).
//
// ΤΙ ΕΦΥΓΕ ΑΠΟ ΕΔΩ: ο «Αναλυτής Απόδοσης Εγγύησης» με προεπιλογή 4%, ανατοκισμό
// και «+X € Κέρδος» σε πράσινο — στην ίδια κάρτα με το «Καθαρό επιστρεπτέο». Μαζί
// του τα πεδία «Απόδοση %/Έτος», «Τύπος Επένδυσης» (ETF, Δανεισμός P2P) και «Πού
// Επενδύεται» με placeholder «π.χ. VWCE». Η εγγύηση είναι χρήματα άλλου ανθρώπου
// που επιστρέφονται ακέραια· ένα εργαλείο που πουλάει ακρίβεια δεν προτείνει να
// τα επενδύσεις, και σίγουρα όχι με απόδοση που το ίδιο επινόησε.
function DepositView({ tenant, payments, damages, onReturned }:{ tenant:Tenant; payments:RentPayment[]; damages:TenantDamage[]; onReturned:()=>void }) {
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
        <SectionTitle>Στοιχεία Εγγύησης</SectionTitle>
        <DataRow label="Ποσό εγγύησης" value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:15 }}>{fmt(deposit)}</span>}/>
        <DataRow label="Τρόπος καταβολής" value={methodLabel}/>
        <DataRow label="Ημερομηνία καταβολής" value={fmtD(tenant.deposit_paid_on)}/>
        <DataRow label="Κατάσταση" value={tenant.deposit_returned?<StatusBadge label="Επεστράφη" color="var(--positive)" bg="var(--positive-dim)"/>:<StatusBadge label="Σε κατοχή" color="var(--accent)" bg="var(--accent-dim)"/>}/>
        {tenant.deposit_returned&&tenant.deposit_return_date&&<DataRow label="Ημερομηνία επιστροφής" value={fmtD(tenant.deposit_return_date)}/>}
        {!tenant.deposit_returned&&deposit>0&&(
          <button style={{ ...s.btnSm, marginTop:14, width:'100%', textAlign:'center' as const }}
            onClick={async()=>{await saved('Η επιστροφή εγγύησης δεν καταχωρήθηκε', supabase.from('tenants').update({deposit_returned:true,deposit_return_date:todayISO()}).eq('id',tenant.id));onReturned();}}>
            Σήμανση ως Επεστράφη
          </button>
        )}
        <div style={{ marginTop:14, fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6 }}>
          Η εγγύηση δεν είναι έσοδό σου: δεν μπαίνει στα ακαθάριστα και δεν φορολογείται. Την κρατάς και την επιστρέφεις.
        </div>
      </div>

      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24 }}>
        <SectionTitle>Πότε & Υπό Ποιους Όρους Επιστρέφεται</SectionTitle>
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
              <TextInput label="Περιγραφή *" value={f.description} onChange={v=>setF(x=>({...x,description:v}))} placeholder="Παράδειγμα: Φθορά πάγκου κουζίνας"/>
            </div>
            <div style={{ ...s.g3, marginBottom:14 }}>
              <div><div style={{ ...labelStyle, marginBottom:8 }}>Επισκευάστηκε</div><Toggle on={f.repaired} onChange={v=>setF(x=>({...x,repaired:v}))} label="Ναι" labelOff="Όχι"/></div>
              {f.repaired&&<DateField label="Ημερομηνία επισκευής" value={f.repaired_on} onChange={v=>setF(x=>({...x,repaired_on:v}))}/>}
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

// ─── Αιτήματα Βλάβης (Maintenance View) ─────────────────────────────────────────
// Αιτήματα από την πύλη ενοικιαστή → ιδιοκτήτης → επίλυση, δεμένα με φθορές/απογραφή.
const MAINT_STATUS:Record<string,{label:string;c:string;bg:string}>={
  new:{label:'Νέο',c:'var(--accent)',bg:'var(--accent-dim)'},
  in_progress:{label:'Σε εξέλιξη',c:'var(--warning)',bg:'var(--warning-soft)'},
  done:{label:'Ολοκληρώθηκε',c:'var(--positive)',bg:'var(--positive-dim)'},
};
// Το bucket maintenance-photos είναι ιδιωτικό: αποθηκεύουμε το PATH. Από παλιές
// εγγραφές μπορεί να έχει μείνει ολόκληρο public URL — κρατάμε ό,τι ακολουθεί το
// «/maintenance-photos/» ώστε να υπογράφεται κι εκείνο σωστά.
function maintPhotoPath(stored:string):string {
  const marker='/maintenance-photos/';
  const i=stored.indexOf(marker);
  return i>=0 ? stored.slice(i+marker.length) : stored;
}
// Ίδιος λόγος με το PaymentsView: το prop `notify` σκίαζε το κοινό import.
function MaintenanceView({ tenant, propertyId, userId, requests, others, onRefresh }:{ tenant:Tenant; propertyId:string; userId:string; requests:MaintenanceReq[]; others:MaintenanceReq[]; onRefresh:()=>void }) {
  const supabase=createClient();
  const [busy,setBusy]=useState(false);
  const [assignFor,setAssignFor]=useState<string|null>(null);   // ποιο αίτημα αναθέτει σε συνεργείο
  const [histOpen,setHistOpen]=useState(false);                 // ιστορικό ακινήτου (μαζεμένο)
  const [af,setAf]=useState({name:'',contact:''});
  // Signed URLs ανά αίτημα (id → λίστα προσωρινών URL). Το ιδιωτικό bucket
  // απαιτεί υπογραφή· η ανάγνωση περνά από την owns_portal_token SELECT policy.
  const [signed,setSigned]=useState<Record<string,string[]>>({});
  const photoSig=useMemo(()=>requests.map(m=>`${m.id}:${(m.photos||[]).join(',')}`).join('|'),[requests]);
  useEffect(()=>{
    let alive=true;
    (async()=>{
      const items:{id:string;path:string}[]=[];
      for(const m of requests){ if(Array.isArray(m.photos)) for(const ph of m.photos){ if(ph) items.push({id:m.id,path:maintPhotoPath(ph)}); } }
      if(items.length===0){ if(alive) setSigned({}); return; }
      // 7 ημέρες: αρκετό ώστε ένα κοινοποιημένο link στο συνεργείο να μείνει ενεργό.
      const { data }=await supabase.storage.from('maintenance-photos').createSignedUrls(items.map(i=>i.path),604800);
      if(!alive||!data) return;
      const map:Record<string,string[]>={};
      data.forEach((d,i)=>{ if(d.signedUrl){ const id=items[i].id; (map[id]||=[]).push(d.signedUrl); } });
      setSigned(map);
    })();
    return ()=>{ alive=false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[photoSig]);
  const list=[...requests].sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  // Αποθηκευμένοι τεχνικοί/συνεργεία του ακινήτου, για ανάθεση χωρίς πληκτρολόγηση.
  const [savedContacts,setSavedContacts]=useState<{id:string;full_name:string;phone:string|null;email:string|null;role:string|null}[]>([]);
  useEffect(()=>{ let alive=true;
    supabase.from('contacts').select('id,full_name,phone,email,role').eq('property_id',propertyId).eq('user_id',userId).order('full_name')
      .then(({data})=>{ if(alive) setSavedContacts((data||[]) as typeof savedContacts); });
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
      await saved('Το αίτημα έκλεισε, αλλά το κόστος δεν καταχωρήθηκε στις δαπάνες', supabase.from('expenses').insert({
        property_id:propertyId, user_id:userId, amount:cost, date:todayISO(),
        category:'maintenance', description:[m.title,m.assignee_name].filter(Boolean).join(' · ').slice(0,120),
      }));
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
  const gdt=(d:string|null)=>d?new Date(d).toLocaleDateString('el-GR',{day:'2-digit',month:'short',year:'numeric'}):ABSENT_DATE;
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
        <SectionTitle>Αιτήματα Βλάβης</SectionTitle>
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

/**
 * Πόσο διαφέρουν τα συγκρίσιμα μεταξύ τους και από το δικό μας.
 *
 * ΓΙΑΤΙ ΤΟΠΙΚΗ ΚΑΙ ΟΧΙ ΤΟ `varianceWarning` ΤΟΥ visibility.ts: εκείνο δεν
 * εξάγεται (είναι module-private) και δέχεται `PropertyLike` με sqm/έτος/ΤΚ —
 * σχήμα ακινήτου, όχι αγγελίας. Ίδιο κατώφλι 1,6× και ίδια λογική «προειδοποιούμε
 * αντί να κρύβουμε». Αν το `varianceWarning` γίνει export, αυτή η συνάρτηση φεύγει.
 */
function compsVarianceWarning(sqms:number[], mySqm:number|null):string|null {
  const reasons:string[]=[];
  if(sqms.length>=2){
    const min=Math.min(...sqms), max=Math.max(...sqms);
    if(max/min>=1.6) reasons.push(`τα συγκρίσιμα έχουν μεγέθη από ${Math.round(min)} έως ${Math.round(max)} τ.μ.`);
  }
  if(mySqm&&sqms.length){
    const avg=sqms.reduce((a,n)=>a+n,0)/sqms.length;
    const ratio=Math.max(avg/mySqm, mySqm/avg);
    if(ratio>=1.6) reasons.push(`το ακίνητό σου είναι ${Math.round(mySqm)} τ.μ. ενώ ο μέσος όρος τους είναι ${Math.round(avg)} τ.μ.`);
  }
  if(!reasons.length) return null;
  return `Προσοχή στη σύγκριση: ${reasons.join(' και ')}. Η τιμή ανά τ.μ. δεν είναι γραμμική στο μέγεθος — έλεγξε τις αγγελίες πριν στείλεις πρόταση.`;
}

function RenewalView({ tenant, userId, comps, sqm }:{ tenant:Tenant; userId:string; comps:RentComp[]; sqm:number|null }) {
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
            ?<DataRow label={`Με ΔΤΚ ${CPI_LATEST_YEAR} (${cpiPct>=0?'+':''}${fp(cpiPct, 1)})`} value={<span style={{ color:'var(--accent)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{fmt(legalNew)}</span>}/>
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
              <DataRow label="Απόκλιση τρέχοντος" value={<span style={{ color:marketDiff>0?'var(--positive)':marketDiff<0?'var(--warning)':'var(--text-secondary)', fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{marketDiff>0?'+':''}{fmt(marketDiff)} ({fp(marketDiffPct, 1)})</span>}/>
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
                  ?`Υπάρχουν ${fn(rentComps.length)} συγκρίσιμα, αλλά το ακίνητο δεν έχει καταχωρημένα τετραγωνικά. Χωρίς τα δικά σου τ.μ. ο μέσος όρος της περιοχής δεν λέει τίποτα για το δικό σου ακίνητο, οπότε δεν προτείνουμε ποσό.`
                  : `Τα ${fn(rentComps.length)} συγκρίσιμα δεν έχουν τετραγωνικά, οπότε δεν βγαίνει τιμή ανά τ.μ. Χωρίς αυτήν, ο ωμός μέσος όρος θα σύγκρινε ανόμοια ακίνητα.`}
              {' '}Έως τότε, χρησιμοποίησε την πρόταση με βάση τον νόμο (ΔΤΚ).
            </InfoBanner>
          )}
        </div>
      </div>

      {/* Πρόταση ανανέωσης προς αποστολή */}
      <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.card, padding:24, marginBottom:16 }}>
        <SectionTitle>Πρόταση Ανανέωσης προς Αποστολή</SectionTitle>
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

// ─── Main Export ──────────────────────────────────────────────────────────────
type DossierTab='overview'|'lease'|'condition'|'legal'|'comm'|'docs';

export default function TabTenant({ propertyId, userId, onStartHandover }:TabTenantProps) {
  const supabase=createClient();
  const branding=useReportBranding(userId);
  // Ψηφιακό μισθωτήριο: σύνταξη, υπογραφή και των δύο μερών, επαληθεύσιμο PDF.
  const [leaseOpen,setLeaseOpen]=useState(false);
  const [declOpen,setDeclOpen]=useState(false);
  // Η υπενθύμιση «Λήξη σύμβασης μίσθωσης» (Υποχρεώσεις) ανοίγει το μισθωτήριο
  // κατευθείαν για ανανέωση — ίδιο μοτίβο event με τον βοηθό.
  useEffect(()=>{
    const open=()=>setLeaseOpen(true);
    window.addEventListener('pos:lease',open);
    return ()=>window.removeEventListener('pos:lease',open);
  },[]);
  const [tenants,setTenants]=useState<Tenant[]>([]);
  const [payments,setPayments]=useState<RentPayment[]>([]);
  const [damages,setDamages]=useState<TenantDamage[]>([]);
  const [comps,setComps]=useState<RentComp[]>([]);
  const [maint,setMaint]=useState<MaintenanceReq[]>([]);
  // Τα τ.μ. ΤΟΥ ΔΙΚΟΥ ΜΑΣ ακινήτου και πόσα ακίνητα έχει ο χρήστης. Το πρώτο κρίνει
  // αν υπάρχει πρόταση αγοράς, το δεύτερο αν ο φόρος ανά ακίνητο είναι υποεκτίμηση.
  const [propSqm,setPropSqm]=useState<number|null>(null);
  const [propertyCount,setPropertyCount]=useState(1);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  // Το in-flow banner επιτυχίας (state + helper + JSX) αφαιρέθηκε υπέρ του κοινού
  // toast: ήταν ΠΑΝΤΑ πράσινο, ακόμη και για ουδέτερα («Διαγράφηκε») ή για σφάλματα
  // επικύρωσης, και έσπρωχνε το περιεχόμενο προς τα κάτω κάθε φορά που εμφανιζόταν.

  const [search,setSearch]=useState('');
  const [segment,setSegment]=useState<'current'|'past'|'overdue'|'all'>('current');

  // Φόρμα (modal)
  const [isForm,setIsForm]=useState(false);
  const [editId,setEditId]=useState<string|null>(null);
  const [form,setForm]=useState(blank());
  const sf=(k:string,v:any)=>setForm(f=>({...f,[k]:v}));
  // Έγγραφα που ανέβηκαν μέσα από τη φόρμα (property-files + property_documents).
  const [formDocs,setFormDocs]=useState<{id:string;file_name:string;tag:'id'|'lease'}[]>([]);
  const [docBusy,setDocBusy]=useState(false);
  // «Περισσότερα»: ΚΛΕΙΣΤΟ εξ ορισμού. Κλειδωμένο δεν είναι — μόνο μαζεμένο.
  const [moreOpen,setMoreOpen]=useState(false);

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
    const[{data:pd},{data:dd},{data:cd},{data:md},{data:own},{count:pc}]=await Promise.all([
      supabase.from('rent_payments').select('*').eq('property_id',propertyId).eq('user_id',userId).order('period_year',{ascending:false}).order('period_month',{ascending:false}),
      supabase.from('tenant_damages').select('*').eq('property_id',propertyId).eq('user_id',userId).order('occurred_on',{ascending:false}),
      supabase.from('rent_comparables').select('id,property_id,title,area,sqm,rent,rent_per_sqm,listing_type,source,url').eq('property_id',propertyId),
      supabase.from('maintenance_requests').select('*').eq('user_id',userId).eq('property_id',propertyId).order('created_at',{ascending:false}),
      supabase.from('user_properties').select('sqm').eq('id',propertyId).maybeSingle(),
      // ΤΟ ΠΛΗΘΟΣ ΑΚΙΝΗΤΩΝ ΚΡΙΝΕΙ ΦΟΡΟΛΟΓΙΚΗ ΠΡΟΕΙΔΟΠΟΙΗΣΗ. Με τον ανύπαρκτο
      // πίνακα το count γύριζε null → propertyCount πάντα 1 → ο ιδιοκτήτης με
      // τρία ακίνητα ΔΕΝ έβλεπε ποτέ ότι ο φόρος είναι προοδευτικός στο
      // ΑΘΡΟΙΣΜΑ και ότι το ποσό εδώ είναι μικρότερο από το πραγματικό.
      supabase.from('user_properties').select('id',{count:'exact',head:true}).eq('user_id',userId),
    ]);
    setTenants(list); setPayments((pd||[]) as RentPayment[]); setDamages((dd||[]) as TenantDamage[]); setComps((cd||[]) as RentComp[]); setMaint((md||[]) as MaintenanceReq[]);
    const sq=Number((own as {sqm?:number|null}|null)?.sqm);
    setPropSqm(Number.isFinite(sq)&&sq>0?sq:null);
    setPropertyCount(Math.max(1, pc||1));
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
  const openAdd=()=>{ setForm(blank()); setEditId(null); setFormDocs([]); setMoreOpen(false); setError(null); setIsForm(true); };
  // Κλείσιμο φόρμας με προστασία από ακούσια απώλεια δεδομένων (backdrop/Ακύρωση).
  // Έγινε async γιατί ο κοινός διάλογος επιστρέφει Promise. Δένεται σε ΔΥΟ σημεία
  // (κλικ στο backdrop του χειροποίητου modal με zIndex 950, και το κουμπί «Ακύρωση»)
  // και κανένα από τα δύο δεν περιμένει σύγχρονη επιστροφή, οπότε η αλλαγή υπογραφής
  // είναι ασφαλής. Ο ConfirmHost ζει στη ρίζα του layout με z-index 10000: δεν είναι
  // απόγονος αυτού του backdrop, άρα κανένα κλικ του δεν ξαναπυροδοτεί το closeForm,
  // και ο δίαυλος έτσι κι αλλιώς απορρίπτει δεύτερη ταυτόχρονη ερώτηση.
  const closeForm=async()=>{
    const dirty = !!(form.full_name.trim()||form.afm||form.phone||form.email||form.monthly_rent);
    if(dirty && !(await confirmDialog('Κλείσιμο χωρίς αποθήκευση; Τα στοιχεία που συμπλήρωσες θα χαθούν.'))) return;
    setError(null); setIsForm(false);
  };
  const openEditForm=(t:Tenant)=>{
    const n=(v:number|null)=>v?.toString()||'';
    const f:ReturnType<typeof blank>={
      full_name:t.full_name||'',email:t.email||'',phone:t.phone||'',
      profession:t.profession||'',afm:t.afm||'',
      id_doc_type:(t.id_doc_type as IdDocType)||'',id_doc_number:t.id_doc_number||'',iban:t.iban||'',notes:t.notes||'',
      lease_type:t.lease_type||'annual',lease_category:t.lease_category||'',lease_start:t.lease_start?.split('T')[0]||'',lease_end:t.lease_end?.split('T')[0]||'',custom_lease_days:t.custom_lease_days||365,
      monthly_rent:n(t.monthly_rent),payment_frequency:t.payment_frequency||'monthly',rent_due_day:String(Math.min(Math.max(1,t.rent_due_day||1),28)),rent_iban:t.rent_iban||'',e_payment:t.e_payment??true,
      furnishing:(t.furnishing as Furnishing)||'',
      deposit_amount:n(t.deposit_amount),deposit_method:t.deposit_method||'',deposit_paid_on:t.deposit_paid_on?.split('T')[0]||'',deposit_returned:t.deposit_returned||false,deposit_return_date:t.deposit_return_date?.split('T')[0]||'',
      // Οι παλιές στήλες `streaming`/`cleaning` διαβάζονται και γίνονται γραμμές.
      services:serviceLinesFrom(t.streaming,t.cleaning),
      parking_included:t.parking_included||false,parking_extra:t.parking_extra||false,parking_extra_price:n(t.parking_extra_price),
      extra_perks:t.extra_perks||'',
      lease_doc_external_url:t.lease_doc_external_url||'',
    };
    // «Περισσότερα» ανοίγει μόνο αν ο χρήστης έχει όντως δεδομένα εκεί μέσα.
    setForm(f); setFormDocs([]); setMoreOpen(hasMoreData(f));
    setEditId(t.id); setIsForm(true);
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
      notifyOk('Το έγγραφο ανέβηκε');
    }catch{ setError('Σφάλμα ανεβάσματος εγγράφου'); }
    setDocBusy(false);
  };

  const save=async()=>{
    if(!form.full_name.trim()){setError('Το ονοματεπώνυμο είναι υποχρεωτικό');return;}
    if(!form.lease_category){setError('Ο τύπος μίσθωσης (κατοικία ή επαγγελματική) είναι υποχρεωτικός');return;}
    setSaving(true);setError(null);
    const n=(v:string)=>v?Math.max(0,parseFloat(v)):null;
    const dueDay=Math.min(Math.max(1,parseInt(form.rent_due_day)||1),28);
    // Οι γραμμές υπηρεσιών γράφονται στην ΥΠΑΡΧΟΥΣΑ στήλη `streaming` (καμία
    // μετάπτωση σχήματος) και η παλιά `cleaning` καθαρίζεται, ώστε να μη διαβαστεί
    // δεύτερη φορά ως χωριστή γραμμή «Καθαρισμός».
    const svcLines=(form.services||[]).filter(l=>l.name.trim()).map(l=>({ name:l.name.trim(), cost:Math.max(0,l.cost||0), payer:l.payer }));
    const payload={
      property_id:propertyId,user_id:userId,full_name:form.full_name.trim(),
      email:form.email||null,phone:form.phone||null,
      profession:form.profession||null,afm:form.afm||null,
      id_doc_type:form.id_doc_type||null,id_doc_number:form.id_doc_number||null,iban:form.iban||null,notes:form.notes||null,
      lease_type:form.lease_type||null,lease_category:form.lease_category||null,lease_start:form.lease_start||null,lease_end:form.lease_end||null,custom_lease_days:form.custom_lease_days||null,
      monthly_rent:n(form.monthly_rent),payment_frequency:form.payment_frequency||null,rent_due_day:dueDay,rent_iban:form.rent_iban?.trim()||null,
      furnishing:form.furnishing||null,
      deposit_amount:n(form.deposit_amount),deposit_method:form.deposit_method||null,deposit_paid_on:form.deposit_paid_on||null,deposit_returned:form.deposit_returned,deposit_return_date:form.deposit_return_date||null,
      e_payment:form.e_payment,streaming:svcLines,cleaning:null,extra_perks:form.extra_perks||null,
      parking_included:form.parking_included,parking_extra:form.parking_extra,parking_extra_price:n(form.parking_extra_price),
      lease_doc_external_url:form.lease_doc_external_url||null,
    };
    const{data:savedRow,error:err}=await(editId
      ?supabase.from('tenants').update(payload).eq('id',editId).select('*').single()
      :supabase.from('tenants').insert(payload).select('*').single());
    if(err){
      const msg=err.message||'Άγνωστο σφάλμα';
      // Μετάφραση των συχνών αιτιών σε σαφές, ενεργήσιμο ελληνικό μήνυμα.
      const friendly=/column|schema cache|does not exist/i.test(msg)
        ? `Η αποθήκευση απέτυχε: η βάση δεδομένων δεν έχει όλα τα πεδία ενοικιαστή. Τρέξε το τελευταίο SQL (SETUP_ALL.sql) στο Supabase και δοκίμασε ξανά. Τεχνική λεπτομέρεια: ${msg}`
        : /row-level security|violates row-level/i.test(msg)
        ? `Η αποθήκευση απέτυχε λόγω δικαιωμάτων (RLS). Βεβαιώσου ότι έτρεξες τις πολιτικές ασφαλείας στο Supabase. Τεχνική λεπτομέρεια: ${msg}`
        : `Η αποθήκευση απέτυχε: ${msg}`;
      setError(friendly);setSaving(false);return;
    }
    // Ο ενοικιαστής αποθηκεύτηκε. Οι επόμενες δευτερεύουσες ενέργειες (σύνδεση
    // εγγράφων, συγχρονισμός ημερολογίου) δεν πρέπει ΠΟΤΕ να μπλοκάρουν το κλείσιμο
    // της φόρμας ή την ανανέωση — αλλιώς η καρτέλα θα «κολλούσε» με το ρελ. να γυρίζει.
    const savedTenant=(savedRow||null) as (TenantScheduleInput&{rent_due_day?:number|null})|null;
    if(savedTenant?.id && !editId && formDocs.length){
      await saved('Τα έγγραφα δεν συνδέθηκαν με τον ενοικιαστή',
        supabase.from('property_documents').update({supplier:'tenant:'+savedTenant.id}).in('id',formDocs.map(d=>d.id)));
    }
    if(savedTenant?.id) await syncTenantSchedule(supabase,savedTenant,propertyId,userId,'save',{rentDueDay:dueDay});
    setSaving(false);setIsForm(false);
    notifyOk(editId?'Αποθηκεύτηκε':'Ενοικιαστής προστέθηκε');
    await fetch_();
  };

  const markMovedOut=async(t:Tenant)=>{
    if(!(await confirmDialog(`Σήμανση αποχώρησης για «${t.full_name}»; Θα μεταφερθεί στους προηγούμενους ενοικιαστές.`))) return;
    if(!await saved('Η αποχώρηση δεν καταχωρήθηκε', supabase.from('tenants').update({status:'past',move_out_date:todayISO()}).eq('id',t.id))) return;
    notify('Ο ενοικιαστής μεταφέρθηκε στο ιστορικό'); fetch_();
  };
  const delTenant=async(t:Tenant)=>{
    if(!(await confirmDialog(`Οριστική διαγραφή «${t.full_name}»; Θα διαγραφούν και οι πληρωμές/φθορές του.`,{tone:'negative',confirmLabel:'Οριστική διαγραφή'}))) return;
    // Η ΣΕΙΡΑ ΕΧΕΙ ΣΗΜΑΣΙΑ: πρώτα τα εξαρτημένα, τελευταίος ο ενοικιαστής. Αν
    // κάποιο βήμα αποτύχει, σταματάμε — αλλιώς μένουν ορφανές πληρωμές που δεν
    // φαίνονται πουθενά και εξακολουθούν να μετράνε σε αθροίσματα.
    if(!await saved('Οι πληρωμές του ενοικιαστή δεν διαγράφηκαν', supabase.from('rent_payments').delete().eq('tenant_id',t.id))) return;
    if(!await saved('Οι φθορές του ενοικιαστή δεν διαγράφηκαν', supabase.from('tenant_damages').delete().eq('tenant_id',t.id))) return;
    if(!await saved('Ο ενοικιαστής δεν διαγράφηκε', supabase.from('tenants').delete().eq('id',t.id))) return;
    if(openId===t.id) setOpenId(null);
    notify('Διαγράφηκε'); fetch_();
  };

  // ── Έγγραφο μισθωτηρίου (PDF) ────────────────────────────────────────────────
  const uploadPDF=async(t:Tenant,file:File)=>{
    setUploading(true);
    const path=`${userId}/${t.id}/${file.name}`;
    const{error:upErr}=await supabase.storage.from('lease-documents').upload(path,file,{upsert:true});
    if(upErr){setError(upErr.message);setUploading(false);return;}
    // Το αρχείο ανέβηκε ήδη. Αν δεν καταγραφεί το όνομά του, ο ενοικιαστής δεν
    // έχει συμβόλαιο πουθενά στην οθόνη — και το αρχείο υπάρχει, αόρατο.
    if(!await saved('Το συμβόλαιο ανέβηκε, αλλά δεν συνδέθηκε με τον ενοικιαστή',supabase.from('tenants').update({lease_doc_name:file.name}).eq('id',t.id))){setUploading(false);return;}
    setUploading(false);notifyOk('Το PDF ανέβηκε');fetch_();
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
      ['Ονοματεπώνυμο','Κατάσταση','ΑΦΜ','Τηλέφωνο','Ηλεκτρονικό ταχυδρομείο','Είδος μίσθωσης','Έναρξη','Λήξη','Αποχώρηση','Ημέρα πληρωμής','Μηνιαίο ενοίκιο (€)','Εγγύηση (€)','Τρόπος εγγύησης','Ημερομηνία καταβολής εγγύησης','Επεστράφη'],
      [...tenants].map(t=>[
        t.full_name, isPastTenant(t)?'Προηγούμενος':'Τρέχων', t.afm||'', t.phone||'', t.email||'',
        t.lease_category?LEASE_CATEGORY_LABELS[t.lease_category]:'', csvDate(t.lease_start), csvDate(t.lease_end), csvDate(t.move_out_date),
        t.rent_due_day||'', csvEur(t.monthly_rent), csvEur(t.deposit_amount), t.deposit_method||'', csvDate(t.deposit_paid_on), t.deposit_returned?'ΝΑΙ':'',
      ]),
    );
  };

  // Σκελετός αντί για spinner: η οθόνη έχει γνωστό σχήμα (σειρά KPIs + πλέγμα καρτών
  // ενοικιαστών), οπότε ο χώρος δεσμεύεται από την αρχή αντί να «πέφτει» μέσα ξαφνικά.
  if(loading) return (
    <>
      <SkeletonKPIs n={4} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,340px),1fr))', gap:14 }}>
        {[0,1,2].map(i=><Skeleton key={i} h={210} r={14}/>)}
      </div>
    </>
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

  const DTABS:{id:DossierTab;label:string;badge?:number}[]=dc?[
    {id:'overview',label:'Επισκόπηση'},
    {id:'lease',label:'Μίσθωση & Εγγύηση',badge:(dcOverdue.count+(declaredByTenant.get(dc.id)||0))||undefined},
    {id:'condition',label:'Φθορές & Βλάβες',badge:(dcDamages.filter(d=>!d.repaired).length+dcMaint.filter(m=>m.status!=='done').length)||undefined},
    {id:'legal',label:'Νομικά & Φόρος'},
    {id:'comm',label:'Επικοινωνία'},
    {id:'docs',label:'Έγγραφα'},
  ]:[];

  // ── ΠΟΙΑ ΠΕΔΙΑ ΒΛΕΠΕΙ Η ΦΟΡΜΑ, ΤΩΡΑ ────────────────────────────────────────
  // Μία κλήση στο μητρώο, τρία επίπεδα: `core` φαίνεται, `more` πίσω από κουμπί,
  // `hidden` δεν υπάρχει. Η μόνη είσοδος που αλλάζει ζωντανά είναι η επίπλωση.
  const formCtx=tenantFieldCtx(isFurnished(form.furnishing), propertyCount);
  const formPlan=formFields(TENANT_FIELDS, formCtx);
  const coreIds=new Set(formPlan.core.map(d=>d.id));
  const moreIds=new Set(formPlan.more.map(d=>d.id));
  const show=(id:string)=>coreIds.has(id);
  const more=(id:string)=>moreIds.has(id);
  const moreFields=formPlan.more;
  const formMissing=missingCritical(TENANT_FIELDS, formCtx, filledTenantIds({
    full_name:form.full_name.trim()||null, afm:form.afm||null, lease_category:form.lease_category||null,
    lease_start:form.lease_start||null, monthly_rent:form.monthly_rent?parseFloat(form.monthly_rent):null,
    rent_iban:form.rent_iban||null,
  }));

  return (
    <div style={{ fontFamily:T.font.sans, color:'var(--text-primary)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {error&&<div style={{ background:'var(--negative-dim)', border:'1px solid var(--negative-border)', borderLeft:'3px solid var(--negative)', borderRadius:T.radius.inner, padding:'11px 18px', marginBottom:14, color:'var(--negative)', fontSize:13, fontFamily:T.font.sans, fontWeight:500, display:'flex', justifyContent:'space-between', alignItems:'center' }}><span>{error}</span><button onClick={()=>setError(null)} style={{ background:'none', border:'none', color:'var(--negative)', cursor:'pointer', fontSize:18, lineHeight:1, padding:0 }}>×</button></div>}

      <PageTitle title="Ενοικιαστής" sub="Τρέχουσα και προηγούμενες μισθώσεις, με πλήρες ντοσιέ"
        right={tenants.length>0?<div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
          <ExportButton onClick={exportRoster}/>
          <Btn variant="secondary" onClick={()=>setLeaseOpen(true)}>Μισθωτήριο</Btn>
          <Btn variant="secondary" onClick={()=>setDeclOpen(true)}>Δήλωση Μίσθωσης</Btn>
          <Btn variant="primary" onClick={openAdd}>Νέος ενοικιαστής</Btn>
        </div>:undefined}/>

      <KPIGrid items={kpis}/>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const, alignItems:'center', marginBottom:16 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Αναζήτηση ονόματος, ΑΦΜ, τηλεφώνου…"
          style={{ background:'var(--bg-base)', border:'1px solid var(--border-default)', borderRadius:10, padding:'10px 14px', color:'var(--text-primary)', fontSize:14, height:40, maxWidth:280, flex:'1 1 220px', outline:'none', boxSizing:'border-box', fontFamily:T.font.sans }}/>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
          {([['all','Όλοι'],['current','Τρέχων'],['past','Προηγούμενοι']] as [typeof segment,string][]).map(([v,l])=>(
            <button key={v} onClick={()=>setSegment(v)} style={{ padding:'7px 14px', borderRadius:18, border:`1px solid ${segment===v?'var(--accent)':'var(--border-subtle)'}`, background:segment===v?'var(--accent-soft)':'transparent', color:segment===v?'var(--accent)':'var(--text-secondary)', cursor:'pointer', fontSize:12, fontFamily:T.font.sans, fontWeight:500, whiteSpace:'nowrap' as const }}>{l}</button>
          ))}
        </div>
      </div>

      {tenants.length===0?(
        <EmptyState icon={<Users size={20}/>} title="Κανένας ενοικιαστής ακόμη" hint="Πρόσθεσε τον ενοικιαστή του ακινήτου για πλήρη παρακολούθηση μίσθωσης, ενοικίων, εγγύησης, φθορών και ανανέωσης." action={<div style={{ display:'flex', gap:8, flexWrap:'wrap' as const, justifyContent:'center' }}><Btn variant="primary" onClick={openAdd}>Νέος ενοικιαστής</Btn><Btn variant="secondary" onClick={()=>setLeaseOpen(true)}>Σύνταξη μισθωτηρίου</Btn></div>}/>
      ):(
        <>
          {filtered.length===0?(
            <EmptyState icon={<SearchX size={20}/>} title="Δεν βρέθηκαν ενοικιαστές" hint="Άλλαξε φίλτρο ή αναζήτηση."/>
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
                        { l:'Μηνιαίο ενοίκιο', v:fmt(t.monthly_rent), strong:true },
                        { l:'Εγγύηση', v:fmt(t.deposit_amount) },
                        { l:'Ληξιπρόθεσμη οφειλή', v:fmt(od?od.amount:0), neg:!!od },
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
                        {diff!==0&&<span style={{ marginLeft:8, fontSize:11, fontFamily:T.font.mono, fontVariantNumeric:'tabular-nums', color:'var(--text-secondary)' }}>{diff>0?'+':''}{fmt(diff)}</span>}
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
        <div onClick={()=>setOpenId(null)} style={{ position:'fixed', inset:0, background: T.scrim, zIndex:900, display:'flex', justifyContent:'flex-end' }}>
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
                  {tb.badge&&tb.badge>0&&<span style={{ minWidth:18, height:18, borderRadius:8, background:'var(--negative)', color:'var(--text-inverse)', fontSize:9, fontWeight:700, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>{tb.badge}</span>}
                </button>
              ))}
            </div>

            {/* Body */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px 24px 32px' }}>
              {dossierTab==='overview'&&(
                <>
                  {isPastTenant(dc)&&<InfoBanner tone="neutral">Προηγούμενος ενοικιαστής{dc.move_out_date?`: αποχώρηση ${fmtD(dc.move_out_date)}`:''}. Το ντοσιέ διατηρείται για το ιστορικό του ακινήτου.</InfoBanner>}
                  <DashboardView tenant={dc} payments={dcPayments} propertyCount={propertyCount}/>
                </>
              )}
              {dossierTab==='lease'&&(
                <div style={{ display:'flex', flexDirection:'column' }}>
                  <div>
                    <InfoBanner tone="info">Περιμένεις το ενοίκιο κάθε μήνα την <strong>{fn(Math.min(Math.max(1,dc.rent_due_day||1),28))}η</strong> ημέρα. Οι μηνιαίες δόσεις δημιουργούνται αυτόματα από την έναρξη της μίσθωσης.</InfoBanner>
                    <PaymentsView tenant={dc} propertyId={propertyId} userId={userId} payments={dcPayments} onRefresh={fetch_}/>
                  </div>
                  <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:28, paddingTop:28 }}><DepositView tenant={dc} payments={dcPayments} damages={dcDamages} onReturned={fetch_}/></div>
                  <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:28, paddingTop:28 }}><RenewalView tenant={dc} userId={userId} comps={comps} sqm={propSqm}/></div>
                </div>
              )}
              {dossierTab==='condition'&&(
                <div style={{ display:'flex', flexDirection:'column' }}>
                  <DamagesView tenant={dc} propertyId={propertyId} userId={userId} damages={dcDamages} onRefresh={fetch_}/>
                  <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:28, paddingTop:28 }}><MaintenanceView tenant={dc} propertyId={propertyId} userId={userId} requests={dcMaint} others={dc?maint.filter(m=>m.tenant_id!==dc.id):maint} onRefresh={fetch_}/></div>
                </div>
              )}
              {dossierTab==='legal'&&<LegalTaxView tenant={dc} propertyCount={propertyCount}/>}
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
                          <button style={s.btnDng} onClick={async()=>{if(!dc.lease_doc_name)return;await supabase.storage.from('lease-documents').remove([`${userId}/${dc.id}/${dc.lease_doc_name}`]);if(!await saved('Το συμβόλαιο δεν αποσυνδέθηκε',supabase.from('tenants').update({lease_doc_url:null,lease_doc_name:null}).eq('id',dc.id)))return;notify('PDF διαγράφηκε');fetch_();}}>Διαγραφή</button>
                        </div>
                        <button onClick={()=>openLeaseDoc(dc)} style={{ ...s.btnGold, display:'inline-block', marginBottom:10 }}>Άνοιγμα PDF</button>
                        <div style={{ marginTop:10 }}>
                          <label style={{ ...s.btnSm, cursor:'pointer', display:'inline-block' }}>
                            {uploading?'Ανέβασμα…':'Αντικατάσταση PDF'}
                            <input type="file" accept=".pdf" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)uploadPDF(dc,f);}} disabled={uploading}/>
                          </label>
                        </div>
                      </div>
                    ):(
                      <div style={{ border:'2px dashed var(--border-default)', borderRadius:T.radius.inner, padding:'40px 28px', textAlign:'center' as const }}>
                        <div style={{ fontSize:13, color:'var(--text-secondary)', fontFamily:T.font.sans, marginBottom:18 }}>Ανέβασε το μισθωτήριο σε μορφή PDF</div>
                        <label style={{ ...s.btnGold, cursor:'pointer', display:'inline-block', padding:'11px 28px' }}>
                          {uploading?'Ανέβασμα…':'Επιλογή PDF'}
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
        <div onClick={closeForm} style={{ position:'fixed', inset:0, background: T.scrim, zIndex:950, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 16px', overflowY:'auto' as const }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-surface)', border:'1px solid var(--border-accent)', borderRadius:T.radius.card, padding:28, width:'min(860px, 100%)', margin:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:600, color:'var(--text-primary)', fontFamily:T.font.sans, marginBottom:4 }}>{editId?'Επεξεργασία Ενοικιαστή':'Νέος Ενοικιαστής'}</div>
                <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans }}>Ζητάμε μόνο ό,τι έχει νόημα για αυτή τη μίσθωση. Κάθε πεδίο λέει γιατί.</div>
              </div>
              <button style={s.btnGhost} onClick={closeForm}>Ακύρωση</button>
            </div>

            {/* ── ΤΙ ΛΕΙΠΕΙ ΓΙΑ ΤΗ ΔΗΛΩΣΗ ─────────────────────────────────── */}
            <MissingCriticalBar missing={formMissing}/>

            {/* ── ΠΟΙΟΣ ΕΙΝΑΙ ────────────────────────────────────────────── */}
            <SectionTitle>Ποιος είναι ο ενοικιαστής</SectionTitle>
            <div style={{ ...s.g3, marginBottom:6 }}>
              {show('tenant.full_name')&&<TextInput label="Ονοματεπώνυμο *" value={form.full_name} onChange={v=>sf('full_name',v)}/>}
              {show('tenant.afm')&&<TextInput label="ΑΦΜ" value={form.afm} onChange={v=>sf('afm',v)}/>}
              {show('tenant.phone')&&<TextInput label="Κινητό τηλέφωνο" value={form.phone} onChange={v=>sf('phone',v)}/>}
            </div>
            <Why id="tenant.afm"/>

            <div style={s.divider}/>
            {/* ── Η ΜΙΣΘΩΣΗ ────────────────────────────────────────────────── */}
            <SectionTitle>Η μίσθωση <span style={{ color:'var(--negative)' }}>*</span></SectionTitle>
            {show('tenant.lease_category')&&(
              <>
                <div style={{ display:'flex', gap:6, marginBottom:6, flexWrap:'wrap' as const }}>
                  {(Object.keys(LEASE_CATEGORY_LABELS) as LeaseCategory[]).map(lc=>(
                    <button key={lc} onClick={()=>sf('lease_category',lc)} style={{ padding:'8px 18px', fontSize:'12px', fontFamily:T.font.sans, cursor:'pointer', borderRadius:T.radius.btn, border:`1px solid ${form.lease_category===lc?'var(--accent)':'var(--border-default)'}`, background:form.lease_category===lc?'var(--accent-dim)':'transparent', color:form.lease_category===lc?'var(--accent)':'var(--text-secondary)', fontWeight:form.lease_category===lc?700:400 }}>{LEASE_CATEGORY_LABELS[lc]}</button>
                  ))}
                </div>
                <div style={{ marginBottom:16 }}><Why id="tenant.lease_category"/></div>
              </>
            )}
            {show('tenant.lease_type')&&(
              <>
                <div style={{ display:'flex', gap:6, marginBottom:6, flexWrap:'wrap' as const }}>
                  {(Object.keys(LEASE_LABELS) as LeaseType[]).map(lt=>(
                    <button key={lt} onClick={()=>sf('lease_type',lt)} style={{ padding:'8px 16px', fontSize:'11px', fontFamily:T.font.sans, cursor:'pointer', borderRadius:T.radius.btn, border:`1px solid ${form.lease_type===lt?'var(--accent)':'var(--border-default)'}`, background:form.lease_type===lt?'var(--accent-dim)':'transparent', color:form.lease_type===lt?'var(--accent)':'var(--text-secondary)', fontWeight:form.lease_type===lt?600:400 }}>{LEASE_LABELS[lt]}</button>
                  ))}
                </div>
                <div style={{ marginBottom:16 }}><Why id="tenant.lease_type"/></div>
              </>
            )}
            <div style={{ ...s.g3, marginBottom:6 }}>
              {show('tenant.lease_start')&&<DateField label="Έναρξη μίσθωσης" value={form.lease_start} onChange={v=>sf('lease_start',v)}/>}
              {show('tenant.lease_end')&&<DateField label="Λήξη μίσθωσης" value={form.lease_end} onChange={v=>sf('lease_end',v)}/>}
              {form.lease_type==='custom'&&<NumberInput label="Ημέρες" value={String(form.custom_lease_days)} onChange={v=>sf('custom_lease_days',parseInt(v)||0)} suffix="ημ."/>}
            </div>
            <Why id="tenant.lease_start"/>

            <div style={s.divider}/>
            {/* ── ΤΟ ΕΝΟΙΚΙΟ ───────────────────────────────────────────────── */}
            <SectionTitle>Το ενοίκιο</SectionTitle>
            <div style={{ ...s.g3, marginBottom:6 }}>
              {show('tenant.rent')&&<NumberInput label="Μηνιαίο ενοίκιο" value={form.monthly_rent} onChange={v=>sf('monthly_rent',v)} suffix="€"/>}
              {show('tenant.rent_due_day')&&<SelectField label="Ημέρα πληρωμής" value={form.rent_due_day} onChange={v=>sf('rent_due_day',v)} options={Array.from({length:28},(_,i)=>({value:String(i+1),label:`${i+1}η`}))}/>}
            </div>
            <div style={{ marginBottom:16 }}><Why id="tenant.rent_due_day"/></div>
            {show('tenant.rent_iban')&&(
              <>
                <div style={{ ...s.g2, marginBottom:6 }}>
                  <TextInput label="IBAN Είσπραξης Ενοικίου" value={form.rent_iban} onChange={v=>sf('rent_iban',v)} placeholder="GR..."/>
                  <div><div style={{ ...labelStyle, marginBottom:8 }}>Εισπράττεται μέσω τραπέζης</div><Toggle on={form.e_payment} onChange={v=>sf('e_payment',v)} label="Ναι" labelOff="Όχι, μετρητά"/></div>
                </div>
                <Why id="tenant.rent_iban"/>
                {!form.e_payment&&(
                  <div style={{ marginTop:10 }}>
                    <AlertBar level="warning" text={`Με είσπραξη σε μετρητά χάνεται η τεκμαρτή έκπτωση ${fp((PRESUMPTIVE_DEDUCTION_RATE*100), 0)} και ο φόρος υπολογίζεται στο 100% των ακαθάριστων.`}/>
                  </div>
                )}
              </>
            )}

            <div style={s.divider}/>
            {/* ── ΕΓΓΥΗΣΗ ──────────────────────────────────────────────────── */}
            <SectionTitle>Εγγύηση</SectionTitle>
            {show('tenant.deposit')&&(
              <div style={{ ...s.g3, marginBottom:6 }}>
                <NumberInput label="Ποσό εγγύησης" value={form.deposit_amount} onChange={v=>sf('deposit_amount',v)} suffix="€"/>
              </div>
            )}
            <Why id="tenant.deposit"/>

            <div style={s.divider}/>
            {/* ── ΤΙ ΠΑΡΕΧΕΙΣ ──────────────────────────────────────────────── */}
            <SectionTitle>Κατάσταση επίπλωσης</SectionTitle>
            <div style={{ display:'flex', gap:6, marginBottom:6, flexWrap:'wrap' as const }}>
              {(Object.keys(FURNISHING_LABELS) as Furnishing[]).map(fv=>(
                <button key={fv} onClick={()=>sf('furnishing',form.furnishing===fv?'':fv)} style={{ padding:'8px 16px', fontSize:'12px', fontFamily:T.font.sans, cursor:'pointer', borderRadius:T.radius.btn, border:`1px solid ${form.furnishing===fv?'var(--accent)':'var(--border-default)'}`, background:form.furnishing===fv?'var(--accent-dim)':'transparent', color:form.furnishing===fv?'var(--accent)':'var(--text-secondary)', fontWeight:form.furnishing===fv?700:400 }}>{FURNISHING_LABELS[fv]}</button>
              ))}
            </div>
            <Why id="tenant.furnishing"/>

            {/* Οι παρεχόμενες υπηρεσίες υπάρχουν ΜΟΝΟ σε επιπλωμένο — το λέει το μητρώο */}
            {show('tenant.services')&&(
              <div style={{ marginTop:18 }}>
                <SectionTitle>Τι πληρώνεις εσύ, τι ο ενοικιαστής</SectionTitle>
                <div style={{ marginBottom:12 }}><Why id="tenant.services"/></div>
                <ServicesEditor value={form.services} onChange={v=>sf('services',v)}/>
              </div>
            )}
            {!isFurnished(form.furnishing)&&(form.services||[]).length>0&&(
              <div style={{ marginTop:14 }}>
                <AlertBar level="info" text={`Έχεις ${(form.services||[]).length} καταχωρημένες γραμμές υπηρεσιών από προηγούμενη ρύθμιση. Δεν εμφανίζονται σε γυμνό διαμέρισμα, αλλά διατηρούνται — άλλαξε την επίπλωση σε «Επιπλωμένο» για να τις δεις.`}/>
              </div>
            )}

            <div style={s.divider}/>
            {/* ── ΧΑΡΤΙΑ ───────────────────────────────────────────────────── */}
            <SectionTitle>Μισθωτήριο και λοιπά έγγραφα</SectionTitle>
            <div style={{ marginBottom:12 }}><Why id="tenant.lease_doc"/></div>
            <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:20 }}>
              <TextInput label="Εξωτερικός σύνδεσμος" value={form.lease_doc_external_url} onChange={v=>sf('lease_doc_external_url',v)} placeholder="https://drive.google.com/..."/>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:14, flexWrap:'wrap' as const }}>
                <label style={{ ...s.btnSm, cursor:docBusy?'default':'pointer', display:'inline-block', opacity:docBusy?0.6:1, whiteSpace:'nowrap' as const }}>
                  {docBusy?'Ανέβασμα…':'Ανέβασμα αρχείου'}
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

            {/* ── ΠΕΡΙΣΣΟΤΕΡΑ: σπάνια αλλά υπαρκτά, κλειστά εξ ορισμού ─────── */}
            {moreFields.length>0&&(
              <>
                <div style={s.divider}/>
                <button onClick={()=>setMoreOpen(o=>!o)} style={{ ...s.btnGhost, width:'100%', textAlign:'left' as const, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span>Περισσότερα ({fn(moreFields.length)})</span>
                  <span style={{ color:'var(--text-tertiary)' }}>{moreOpen?'−':'+'}</span>
                </button>
                {moreOpen&&(
                  <div style={{ marginTop:16 }}>
                    <div style={{ fontSize:11, color:'var(--text-tertiary)', fontFamily:T.font.sans, lineHeight:1.6, marginBottom:16 }}>
                      Τίποτα εδώ δεν είναι υποχρεωτικό για τη δήλωση. Είναι όσα χρειάζονται σπάνια, και γι&apos; αυτό δεν στέκονται μπροστά σου.
                    </div>

                    {more('tenant.email')&&(
                      <div style={{ marginBottom:16 }}>
                        <TextInput label="Ηλεκτρονικό ταχυδρομείο" value={form.email} onChange={v=>sf('email',v)} type="email"/>
                        <Why id="tenant.email"/>
                      </div>
                    )}
                    {more('tenant.profession')&&(
                      <div style={{ marginBottom:16 }}>
                        <TextInput label="Επάγγελμα" value={form.profession} onChange={v=>sf('profession',v)} placeholder="Παράδειγμα: Μηχανικός"/>
                        <Why id="tenant.profession"/>
                      </div>
                    )}
                    {more('tenant.iban')&&(
                      <div style={{ marginBottom:16 }}>
                        <TextInput label="IBAN Ενοικιαστή" value={form.iban} onChange={v=>sf('iban',v)} placeholder="GR00 0000 0000 0000..."/>
                        <Why id="tenant.iban"/>
                      </div>
                    )}
                    {more('tenant.payment_frequency')&&(
                      <div style={{ marginBottom:16 }}>
                        <SelectField label="Συχνότητα εξόφλησης" value={form.payment_frequency} onChange={v=>sf('payment_frequency',v)} options={[{value:'monthly',label:'Μηνιαία'},{value:'bimonthly',label:'Διμηνιαία'},{value:'quarterly',label:'Τριμηνιαία'}]}/>
                        <Why id="tenant.payment_frequency"/>
                      </div>
                    )}
                    {more('tenant.id_doc')&&(
                      <div style={{ marginBottom:16 }}>
                        <div style={{ ...s.g2, marginBottom:6 }}>
                          <SelectField label="Τύπος εγγράφου ταυτοποίησης" value={form.id_doc_type} onChange={v=>sf('id_doc_type',v)} options={ID_DOCS.map(d=>({value:d,label:d}))} placeholder="Επιλογή…"/>
                          <TextInput label="Αριθμός εγγράφου" value={form.id_doc_number} onChange={v=>sf('id_doc_number',v)}/>
                        </div>
                        <Why id="tenant.id_doc"/>
                        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:T.radius.inner, padding:'14px 16px', marginTop:12 }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' as const }}>
                            <div style={{ fontSize:12, color:'var(--text-secondary)', fontFamily:T.font.sans }}>Σαρωμένη ταυτότητα ή διαβατήριο (PDF ή εικόνα)</div>
                            <label style={{ ...s.btnSm, cursor:docBusy?'default':'pointer', display:'inline-block', opacity:docBusy?0.6:1, whiteSpace:'nowrap' as const }}>
                              {docBusy?'Ανέβασμα…':'Επιλογή αρχείου'}
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
                      </div>
                    )}
                    {(more('tenant.deposit_method')||more('tenant.deposit_paid_on'))&&(
                      <div style={{ marginBottom:16 }}>
                        <div style={{ ...s.g2, marginBottom:6 }}>
                          {more('tenant.deposit_method')&&<SelectField label="Τρόπος καταβολής εγγύησης" value={form.deposit_method} onChange={v=>sf('deposit_method',v)} options={DEPOSIT_METHODS.map(m=>({value:m,label:m}))} placeholder="Επιλογή…"/>}
                          {more('tenant.deposit_paid_on')&&<DateField label="Ημερομηνία καταβολής εγγύησης" value={form.deposit_paid_on} onChange={v=>sf('deposit_paid_on',v)}/>}
                        </div>
                        <Why id="tenant.deposit_method"/>
                      </div>
                    )}
                    {more('tenant.deposit_returned')&&(
                      <div style={{ marginBottom:16 }}>
                        <div style={{ ...s.g2, marginBottom:6 }}>
                          <div><div style={{ ...labelStyle, marginBottom:8 }}>Επεστράφη η εγγύηση</div><Toggle on={form.deposit_returned} onChange={v=>sf('deposit_returned',v)} label="Ναι" labelOff="Όχι"/></div>
                          {form.deposit_returned&&<DateField label="Ημερομηνία επιστροφής" value={form.deposit_return_date} onChange={v=>sf('deposit_return_date',v)}/>}
                        </div>
                        <Why id="tenant.deposit_returned"/>
                      </div>
                    )}
                    {more('tenant.parking')&&(
                      <div style={{ marginBottom:16 }}>
                        <div style={{ ...s.g3, marginBottom:6 }}>
                          <div><div style={{ ...labelStyle, marginBottom:8 }}>Περιλαμβάνεται στο ενοίκιο</div><Toggle on={form.parking_included} onChange={v=>sf('parking_included',v)} label="Ναι" labelOff="Όχι"/></div>
                          <div><div style={{ ...labelStyle, marginBottom:8 }}>Χρεώνεται ξεχωριστά</div><Toggle on={form.parking_extra} onChange={v=>sf('parking_extra',v)} label="Ναι" labelOff="Όχι"/></div>
                          {form.parking_extra&&<NumberInput label="Μηνιαία τιμή στάθμευσης" value={form.parking_extra_price} onChange={v=>sf('parking_extra_price',v)} suffix="€"/>}
                        </div>
                        <Why id="tenant.parking"/>
                      </div>
                    )}
                    {more('tenant.extra_perks')&&(
                      <div style={{ marginBottom:16 }}>
                        <Textarea label="Επιπλέον παροχές" value={form.extra_perks} onChange={v=>sf('extra_perks',v)} placeholder="Παράδειγμα: Αποθήκη, κήπος, κοινόχρηστο πλυντήριο…"/>
                        <Why id="tenant.extra_perks"/>
                      </div>
                    )}
                    {more('tenant.notes')&&(
                      <div style={{ marginBottom:16 }}>
                        <Textarea label="Σημειώσεις" value={form.notes} onChange={v=>sf('notes',v)}/>
                        <Why id="tenant.notes"/>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {/* Σφάλμα αποθήκευσης — ΜΕΣΑ στη φόρμα, ώστε να είναι πάντα ορατό (η
                φόρμα είναι overlay· ένα σφάλμα στο body από κάτω δεν θα φαινόταν). */}
            {error&&(
              <div role="alert" style={{ marginTop:24, background:'var(--negative-dim)', border:'1px solid var(--negative-border)', borderLeft:'3px solid var(--negative)', borderRadius:T.radius.inner, padding:'12px 16px', color:'var(--negative)', fontSize:13, fontFamily:T.font.sans, fontWeight:500, display:'flex', gap:12, alignItems:'flex-start', justifyContent:'space-between' }}>
                <span style={{ lineHeight:1.55, wordBreak:'break-word' as const }}>{error}</span>
                <button onClick={()=>setError(null)} style={{ background:'none', border:'none', color:'var(--negative)', cursor:'pointer', fontSize:18, lineHeight:1, padding:0, flexShrink:0 }}>×</button>
              </div>
            )}
            {/* ΜΙΑ φόρμα, χωρίς βήματα: όσα πεδία έμειναν χωρούν σε μία οθόνη, και
                τα σπάνια είναι πίσω από το «Περισσότερα». Οι δύο καρτέλες υπήρχαν
                επειδή τα 88 πεδία δεν χωρούσαν αλλιώς. */}
            <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'center', gap:12, marginTop:20, paddingTop:20, borderTop:'1px solid var(--border-subtle)', flexWrap:'wrap' as const }}>
              <button style={{ ...s.btnGold, padding:'10px 24px' }} onClick={save} disabled={saving}>{saving?'Αποθήκευση…':editId?'Αποθήκευση Αλλαγών':'Προσθήκη Ενοικιαστή'}</button>
            </div>
          </div>
        </div>
      )}

      <LeaseDeclaration open={declOpen} onClose={()=>setDeclOpen(false)} propertyId={propertyId} userId={userId} supabase={supabase} />
      <LeaseModal open={leaseOpen} onClose={()=>setLeaseOpen(false)} userId={userId} supabase={supabase} branding={branding} propertyId={propertyId} />
    </div>
  );
}
